import { create } from 'zustand';
import type { AccessSnapshot, NetworkIssue, NetworkNode, Trail } from '@/types/accessibility';
import { mockNodes, mockTrails } from '@/data/mockNetwork';
import { evaluateAll, hasBlockingErrors, validateNetwork } from '@/utils/accessibility';
import {
  loadBenches,
  loadClosures,
  loadNetwork,
  loadSnapshot,
  saveClosures,
  saveNetwork,
  saveSnapshot,
} from '@/utils/storage';
import { useBenchStore } from '@/store/useBenchStore';
import { generateId } from '@/utils/comfort';

interface SaveResult {
  ok: boolean;
  issues: NetworkIssue[];
}

interface AccessState {
  nodes: NetworkNode[];
  trails: Trail[];
  closedTrailIds: string[];
  snapshot: AccessSnapshot | null;
  initialized: boolean;
  initializing: boolean;
}

interface AccessActions {
  initialize: () => void;
  runEvaluation: () => void;
  addNode: (node: Omit<NetworkNode, 'id'>) => SaveResult;
  updateNode: (id: string, updates: Partial<NetworkNode>) => SaveResult;
  /** 删除地点；仍被步道引用时拦截 */
  deleteNode: (id: string) => SaveResult;
  addTrail: (trail: Omit<Trail, 'id'>) => SaveResult;
  updateTrail: (id: string, updates: Partial<Trail>) => SaveResult;
  deleteTrail: (id: string) => void;
  toggleClosure: (trailId: string) => void;
  clearClosures: () => void;
  resetNetwork: () => void;
  getNode: (id?: string) => NetworkNode | undefined;
  getTrail: (id?: string) => Trail | undefined;
  /** 校验与该步道有关的硬性错误（用于保存拦截） */
  validateTrailCandidate: (candidate: Trail) => NetworkIssue[];
}

const ERROR_CODES_BLOCKING_SAVE: NetworkIssue['code'][] = [
  'missing_endpoint',
  'extreme_value',
  'duplicate_edge',
  'oneway_conflict',
];

export const useAccessStore = create<AccessState & AccessActions>((set, get) => {
  /** 重算 + 持久化。错误级问题（缺端点/极值/重复边/单向冲突）下不出评估结果。 */
  const commit = (nodes: NetworkNode[], trails: Trail[], closedTrailIds: string[]) => {
    saveNetwork({ nodes, trails });
    saveClosures(closedTrailIds);

    const benches = useBenchStore.getState().benches.length > 0
      ? useBenchStore.getState().benches
      : loadBenches();

    const issues = validateNetwork(nodes, trails, benches);
    const blocking = hasBlockingErrors(issues);
    let snapshot: AccessSnapshot;
    if (blocking) {
      // 保留旧结果的时间戳无意义：明确输出“无法评估”的空快照，仅保留问题清单
      snapshot = {
        version: 1,
        evaluatedAt: new Date().toISOString(),
        mode: 'wheelchair',
        networkFingerprint: 'invalid',
        closures: closedTrailIds,
        entranceCount: nodes.filter((n) => n.kind === 'entrance').length,
        summary: { total: benches.length, reachable: 0, unreachable: 0, unhooked: 0 },
        results: { wheelchair: [], walker: [], stroller: [] },
        closureImpacts: [],
        issues,
        evaluated: false,
      };
    } else {
      snapshot = evaluateAll({ nodes, trails, benches }, closedTrailIds);
      // evaluateAll 已自带 issues（与上面一致）
    }
    saveSnapshot(snapshot);
    set({ nodes, trails, closedTrailIds, snapshot });
  };

  return {
    nodes: [],
    trails: [],
    closedTrailIds: [],
    snapshot: null,
    initialized: false,
    initializing: false,

    initialize: () => {
      if (get().initialized || get().initializing) return;
      set({ initializing: true });

      const persisted = loadNetwork();
      const nodes = persisted?.nodes ?? mockNodes;
      const trails = persisted?.trails ?? mockTrails;
      if (!persisted) saveNetwork({ nodes, trails });

      const closedTrailIds = loadClosures().filter((id) => trails.some((t) => t.id === id));

      set({ nodes, trails, closedTrailIds, snapshot: loadSnapshot() });
      get().runEvaluation();
      set({ initialized: true, initializing: false });
    },

    runEvaluation: () => {
      const { nodes, trails, closedTrailIds } = get();
      if (nodes.length === 0) return;
      commit(nodes, trails, closedTrailIds);
    },

    getNode: (id) => get().nodes.find((n) => n.id === id),
    getTrail: (id) => get().trails.find((t) => t.id === id),

    validateTrailCandidate: (candidate) => {
      const { nodes, benches } = (() => {
        const benchState = useBenchStore.getState();
        return {
          nodes: get().nodes,
          benches: benchState.benches.length > 0 ? benchState.benches : loadBenches(),
        };
      })();
      const others = get().trails.filter((t) => t.id !== candidate.id);
      return validateNetwork(nodes, [...others, candidate], benches).filter(
        (issue) =>
          issue.trailId === candidate.id &&
          ERROR_CODES_BLOCKING_SAVE.includes(issue.code),
      );
    },

    addNode: (data) => {
      const node: NetworkNode = { ...data, id: generateId() };
      commit([...get().nodes, node], get().trails, get().closedTrailIds);
      return { ok: true, issues: [] };
    },

    updateNode: (id, updates) => {
      // 若挂接长椅或类型发生变化，仅警告级问题，允许保存
      const nodes = get().nodes.map((n) => (n.id === id ? { ...n, ...updates } : n));
      commit(nodes, get().trails, get().closedTrailIds);
      return { ok: true, issues: [] };
    },

    deleteNode: (id) => {
      const attached = get().trails.filter((t) => t.from === id || t.to === id);
      if (attached.length > 0) {
        const node = get().nodes.find((n) => n.id === id);
        return {
          ok: false,
          issues: [
            {
              level: 'error',
              code: 'missing_endpoint',
              nodeId: id,
              message: `地点「${node?.name ?? id}」被 ${attached.length} 条步道引用，请先删除或改接这些步道后再删除地点。`,
            },
          ],
        };
      }
      commit(
        get().nodes.filter((n) => n.id !== id),
        get().trails,
        get().closedTrailIds,
      );
      return { ok: true, issues: [] };
    },

    addTrail: (data) => {
      const candidate: Trail = { ...data, id: generateId() };
      const blocking = get().validateTrailCandidate(candidate);
      if (blocking.length > 0) return { ok: false, issues: blocking };
      commit(get().nodes, [...get().trails, candidate], get().closedTrailIds);
      return { ok: true, issues: [] };
    },

    updateTrail: (id, updates) => {
      const existing = get().trails.find((t) => t.id === id);
      if (!existing) return { ok: false, issues: [] };
      const candidate: Trail = { ...existing, ...updates, id };
      const blocking = get().validateTrailCandidate(candidate);
      if (blocking.length > 0) return { ok: false, issues: blocking };
      commit(
        get().nodes,
        get().trails.map((t) => (t.id === id ? candidate : t)),
        get().closedTrailIds,
      );
      return { ok: true, issues: [] };
    },

    deleteTrail: (id) => {
      commit(
        get().nodes,
        get().trails.filter((t) => t.id !== id),
        get().closedTrailIds.filter((cid) => cid !== id),
      );
    },

    toggleClosure: (trailId) => {
      const { closedTrailIds } = get();
      const next = closedTrailIds.includes(trailId)
        ? closedTrailIds.filter((id) => id !== trailId)
        : [...closedTrailIds, trailId];
      commit(get().nodes, get().trails, next);
    },

    clearClosures: () => {
      if (get().closedTrailIds.length === 0) return;
      commit(get().nodes, get().trails, []);
    },

    resetNetwork: () => {
      commit(mockNodes, mockTrails, []);
    },
  };
});

/** 长椅档案变化后（增删改）刷新评估，保证结果随档案保存 */
export function refreshAccessEvaluation(): void {
  const store = useAccessStore.getState();
  if (store.initialized) {
    store.runEvaluation();
  }
}
