import type { Bench } from '@/types';
import type {
  AccessSnapshot,
  BenchAccessResult,
  ClosureImpact,
  ModeId,
  ModeThresholds,
  NetworkIssue,
  NetworkNode,
  PathSegment,
  SegmentGrade,
  RepairAction,
  RepairActionType,
  RepairCombo,
  RejectReason,
  RejectReasonCode,
  ResponsiblePath,
  SurfaceType,
  Trail,
} from '@/types/accessibility';
import {
  MODE_THRESHOLDS,
  REASON_LABELS,
  REPAIR_ACTION_LABELS,
  TRAIL_LIMITS,
} from '@/types/accessibility';

// 修复代价指数（越小越省事），用于在所有可行修复方案中挑选“最小修复组合”
const REPAIR_COST: Record<RepairActionType, number> = {
  add_lighting: 15,
  open_reverse: 20,
  widen: 25,
  add_ramp: 30,
  resurface: 35,
  flatten_slope: 45,
};

// 寻路代价中修复成本的权重（远大于长度代价，保证优先少修复，其次选短路）
const REPAIR_WEIGHT = 1_000_000;

const GRADE_ORDER: Record<SegmentGrade, number> = {
  easy: 0,
  moderate: 1,
  hard: 2,
  blocked: 3,
};

const SURFACE_RISK: Record<SurfaceType, SegmentGrade> = {
  paved: 'easy',
  tile: 'easy',
  brick: 'moderate',
  gravel: 'hard',
  grass: 'hard',
};

// ---------------------------------------------------------------------------
// 校验
// ---------------------------------------------------------------------------

function samePair(a: Trail, b: Trail): boolean {
  const pairs = new Set([[a.from, a.to].sort().join('→'), [b.from, b.to].sort().join('→')]);
  return pairs.size === 1;
}

export function validateNetwork(
  nodes: NetworkNode[],
  trails: Trail[],
  benches: Bench[] = [],
): NetworkIssue[] {
  const issues: NetworkIssue[] = [];
  const nodeIds = new Set(nodes.map((n) => n.id));

  const incident = new Map<string, string[]>();
  nodes.forEach((n) => incident.set(n.id, []));

  trails.forEach((trail) => {
    // 缺端点
    if (!trail.from || !trail.to) {
      issues.push({
        level: 'error',
        code: 'missing_endpoint',
        trailId: trail.id,
        message: `步道「${trail.name || trail.id}」缺少端点，必须指定两端地点。`,
      });
      return;
    }
    if (trail.from === trail.to) {
      issues.push({
        level: 'error',
        code: 'missing_endpoint',
        trailId: trail.id,
        message: `步道「${trail.name || trail.id}」两端指向同一地点（自环），无法构成通路。`,
      });
      return;
    }
    const missing: string[] = [];
    if (!nodeIds.has(trail.from)) missing.push(trail.from);
    if (!nodeIds.has(trail.to)) missing.push(trail.to);
    if (missing.length > 0) {
      issues.push({
        level: 'error',
        code: 'missing_endpoint',
        trailId: trail.id,
        message: `步道「${trail.name || trail.id}」引用了不存在的地点：${missing.join('、')}。`,
      });
      return;
    }

    incident.get(trail.from)?.push(trail.id);
    incident.get(trail.to)?.push(trail.id);

    // 极值
    const checks: Array<[keyof Trail, string, { min: number; max: number }]> = [
      ['length', '长度', TRAIL_LIMITS.length],
      ['slope', '坡度', TRAIL_LIMITS.slope],
      ['width', '宽度', TRAIL_LIMITS.width],
      ['steps', '台阶数', TRAIL_LIMITS.steps],
    ];
    checks.forEach(([field, label, range]) => {
      const value = trail[field] as unknown as number;
      if (typeof value !== 'number' || Number.isNaN(value)) {
        issues.push({
          level: 'error',
          code: 'extreme_value',
          trailId: trail.id,
          message: `步道「${trail.name || trail.id}」的${label}不是有效数字。`,
        });
      } else if (value < range.min || value > range.max) {
        issues.push({
          level: 'error',
          code: 'extreme_value',
          trailId: trail.id,
          message: `步道「${trail.name || trail.id}」的${label}（${value}）超出允许范围 ${range.min}~${range.max}。`,
        });
      }
    });
  });

  // 重复边 / 单向冲突
  for (let i = 0; i < trails.length; i += 1) {
    for (let j = i + 1; j < trails.length; j += 1) {
      const a = trails[i];
      const b = trails[j];
      if (!nodeIds.has(a.from) || !nodeIds.has(a.to) || !nodeIds.has(b.from) || !nodeIds.has(b.to)) {
        continue;
      }
      if (!samePair(a, b)) continue;

      if (a.direction === 'both' && b.direction === 'both') {
        issues.push({
          level: 'error',
          code: 'duplicate_edge',
          trailId: b.id,
          message: `步道「${b.name || b.id}」与「${a.name || a.id}」是连接同一对地点的重复双向步道。`,
        });
      } else if (a.direction === 'oneway' && b.direction === 'oneway') {
        if (a.from === b.from && a.to === b.to) {
          issues.push({
            level: 'error',
            code: 'duplicate_edge',
            trailId: b.id,
            message: `步道「${b.name || b.id}」与「${a.name || a.id}」是方向完全相同的重复单向步道。`,
          });
        }
        // 方向互补的两条单向（a→b 与 b→a）是合法组合
      } else {
        // 一条双向 + 一条单向 = 通行限制自相矛盾
        issues.push({
          level: 'error',
          code: 'oneway_conflict',
          trailId: b.direction === 'oneway' ? b.id : a.id,
          message: `地点 ${a.from}↔${a.to} 之间同时存在双向步道与单向步道，通行方向冲突。`,
        });
      }
    }
  }

  // 孤立地点 / 悬空入口
  nodes.forEach((node) => {
    if ((incident.get(node.id)?.length ?? 0) === 0) {
      if (node.kind === 'entrance') {
        issues.push({
          level: 'warning',
          code: 'entrance_broken',
          nodeId: node.id,
          message: `入口「${node.name}」没有连接任何步道，无法作为评估起点。`,
        });
      } else if (node.kind === 'junction') {
        issues.push({
          level: 'warning',
          code: 'orphan_node',
          nodeId: node.id,
          message: `交汇点「${node.name}」没有连接任何步道，为孤立地点。`,
        });
      }
    }
  });

  // 长椅未挂接
  const hookedBenchIds = new Set(
    nodes.filter((n) => n.kind === 'bench' && n.benchId).map((n) => n.benchId),
  );
  benches.forEach((bench) => {
    if (!hookedBenchIds.has(bench.id)) {
      issues.push({
        level: 'warning',
        code: 'bench_unhooked',
        benchId: bench.id,
        message: `长椅「${bench.name}」未挂接到任何路网节点，无法评估通路。`,
      });
    }
  });

  // 路网节点挂接到了已不存在的长椅档案
  const benchIdSet = new Set(benches.map((b) => b.id));
  nodes.forEach((node) => {
    if (node.kind === 'bench' && node.benchId && !benchIdSet.has(node.benchId)) {
      issues.push({
        level: 'warning',
        code: 'dangling_bench_ref',
        nodeId: node.id,
        benchId: node.benchId,
        message: `地点「${node.name}」挂接的长椅档案（${node.benchId}）已不存在。`,
      });
    }
  });

  return issues;
}

export function hasBlockingErrors(issues: NetworkIssue[]): boolean {
  return issues.some((issue) => issue.level === 'error');
}

// ---------------------------------------------------------------------------
// 图
// ---------------------------------------------------------------------------

interface Arc {
  trailId: string;
  from: string;
  to: string;
  reverse: boolean; // 是否逆着步道登记方向通行
  onewayBlocked: boolean; // 单向逆向（修复图中表示需要 open_reverse）
}

function buildArcs(trails: Trail[], closed: Set<string>): Arc[] {
  const arcs: Arc[] = [];
  trails.forEach((trail) => {
    if (closed.has(trail.id)) return;
    arcs.push({ trailId: trail.id, from: trail.from, to: trail.to, reverse: false, onewayBlocked: false });
    if (trail.direction === 'both') {
      arcs.push({ trailId: trail.id, from: trail.to, to: trail.from, reverse: true, onewayBlocked: false });
    } else {
      // 单向步道的逆向弧仅在“修复图”中出现，需要开放对向通行
      arcs.push({ trailId: trail.id, from: trail.to, to: trail.from, reverse: true, onewayBlocked: true });
    }
  });
  return arcs;
}

function trailProfileFailures(trail: Trail, mode: ModeThresholds): RejectReasonCode[] {
  const failures: RejectReasonCode[] = [];
  if (trail.slope > mode.maxSlope) failures.push('slope_too_steep');
  if (trail.width < mode.minWidth) failures.push('width_too_narrow');
  if (trail.steps > mode.maxSteps) failures.push('steps_present');
  if (!mode.allowedSurfaces.includes(trail.surface)) failures.push('surface_unusable');
  if (mode.requireLighting && trail.lighting === 'none') failures.push('dark_segment');
  return failures;
}

function repairActionsFor(trail: Trail, mode: ModeThresholds, needsReverse: boolean): RepairAction[] {
  const actions: RepairAction[] = [];
  if (trail.slope > mode.maxSlope) {
    actions.push({ trailId: trail.id, action: 'flatten_slope', label: REPAIR_ACTION_LABELS.flatten_slope, cost: REPAIR_COST.flatten_slope });
  }
  if (trail.width < mode.minWidth) {
    actions.push({ trailId: trail.id, action: 'widen', label: REPAIR_ACTION_LABELS.widen, cost: REPAIR_COST.widen });
  }
  if (trail.steps > mode.maxSteps) {
    actions.push({ trailId: trail.id, action: 'add_ramp', label: REPAIR_ACTION_LABELS.add_ramp, cost: REPAIR_COST.add_ramp });
  }
  if (!mode.allowedSurfaces.includes(trail.surface)) {
    actions.push({ trailId: trail.id, action: 'resurface', label: REPAIR_ACTION_LABELS.resurface, cost: REPAIR_COST.resurface });
  }
  if (mode.requireLighting && trail.lighting === 'none') {
    actions.push({ trailId: trail.id, action: 'add_lighting', label: REPAIR_ACTION_LABELS.add_lighting, cost: REPAIR_COST.add_lighting });
  }
  if (needsReverse) {
    actions.push({ trailId: trail.id, action: 'open_reverse', label: REPAIR_ACTION_LABELS.open_reverse, cost: REPAIR_COST.open_reverse });
  }
  return actions;
}

// ---------------------------------------------------------------------------
// 分段分级
// ---------------------------------------------------------------------------

function maxGrade(a: SegmentGrade, b: SegmentGrade): SegmentGrade {
  return GRADE_ORDER[a] >= GRADE_ORDER[b] ? a : b;
}

export function gradeSegment(trail: Trail, mode: ModeThresholds): PathSegment['grades'] {
  let slope: SegmentGrade;
  if (trail.slope > mode.maxSlope) slope = 'blocked';
  else if (trail.slope > mode.hardSlope) slope = 'hard';
  else if (trail.slope > mode.hardSlope * 0.6) slope = 'moderate';
  else slope = 'easy';

  let width: SegmentGrade;
  if (trail.width < mode.minWidth) width = 'blocked';
  else if (trail.width < mode.tightWidth) width = 'hard';
  else if (trail.width < mode.tightWidth + 0.3) width = 'moderate';
  else width = 'easy';

  let risk = SURFACE_RISK[trail.surface];
  if (trail.steps > mode.maxSteps) risk = maxGrade(risk, 'blocked');
  else if (trail.steps >= 2) risk = maxGrade(risk, 'hard');
  else if (trail.steps === 1) risk = maxGrade(risk, 'moderate');
  if (mode.requireLighting && trail.lighting === 'none') risk = maxGrade(risk, 'blocked');
  else if (trail.lighting === 'none') risk = maxGrade(risk, 'hard');
  else if (trail.lighting === 'partial') risk = maxGrade(risk, 'moderate');

  return { slope, width, risk };
}

function toSegment(trail: Trail, arc: Arc, mode: ModeThresholds): PathSegment {
  const grades = gradeSegment(trail, mode);
  return {
    trailId: trail.id,
    from: arc.from,
    to: arc.to,
    reverse: arc.reverse,
    length: trail.length,
    slope: trail.slope,
    width: trail.width,
    surface: trail.surface,
    steps: trail.steps,
    lighting: trail.lighting,
    grades,
    worst: maxGrade(maxGrade(grades.slope, grades.width), grades.risk),
  };
}

// ---------------------------------------------------------------------------
// 多源 Dijkstra（仅可自由通行的弧）
// ---------------------------------------------------------------------------

interface FreePred {
  node: string;
  arc: Arc;
}

function freeDijkstra(
  nodeIds: string[],
  arcs: Arc[],
  trailMap: Map<string, Trail>,
  entrances: Set<string>,
  mode: ModeThresholds,
): Map<string, { dist: number; pred: FreePred | null; entrance: string }> {
  const adj = new Map<string, Arc[]>();
  nodeIds.forEach((id) => adj.set(id, []));
  arcs.forEach((arc) => {
    const trail = trailMap.get(arc.trailId);
    if (!trail) return;
    if (arc.onewayBlocked) return; // 单向逆向不可直接通行
    if (trailProfileFailures(trail, mode).length > 0) return; // 阈值不满足
    adj.get(arc.from)?.push(arc);
  });

  const state = new Map<string, { dist: number; pred: FreePred | null; entrance: string }>();
  nodeIds.forEach((id) => state.set(id, { dist: Infinity, pred: null, entrance: '' }));

  // 简单二叉堆代价小，直接用数组线性取最小（网络规模很小）
  const visited = new Set<string>();
  entrances.forEach((id) => {
    if (state.has(id)) state.set(id, { dist: 0, pred: null, entrance: id });
  });

  while (true) {
    let current: string | null = null;
    let currentDist = Infinity;
    state.forEach((s, id) => {
      if (!visited.has(id) && s.dist < currentDist) {
        currentDist = s.dist;
        current = id;
      }
    });
    if (current === null) break;
    const cur = current;
    visited.add(cur);
    const curEntrance = state.get(cur)!.entrance;
    adj.get(cur)?.forEach((arc) => {
      const trail = trailMap.get(arc.trailId)!;
      const penalty = 1 + GRADE_ORDER[gradeSegment(trail, mode).risk] * 0.4;
      const nd = currentDist + trail.length * penalty;
      const target = state.get(arc.to);
      if (target && nd < target.dist) {
        target.dist = nd;
        target.pred = { node: cur, arc };
        target.entrance = curEntrance;
      }
    });
  }

  return state;
}

// ---------------------------------------------------------------------------
// 修复图 Dijkstra：不可自由通行的弧也可走，但要付出修复代价
// ---------------------------------------------------------------------------

interface RepairState {
  key: number; // repairCost * REPAIR_WEIGHT + travel
  repairCost: number;
  travel: number;
  pred: { node: string; arc: Arc; addedActions: RepairAction[] } | null;
  entrance: string;
}

function repairDijkstra(
  nodeIds: string[],
  arcs: Arc[],
  trailMap: Map<string, Trail>,
  entrances: Set<string>,
  mode: ModeThresholds,
  target: string,
): { actions: RepairAction[]; trailIds: string[]; entranceId: string; travel: number } | null {
  const adj = new Map<string, Arc[]>();
  nodeIds.forEach((id) => adj.set(id, []));
  arcs.forEach((arc) => adj.get(arc.from)?.push(arc));

  const state = new Map<string, RepairState>();
  nodeIds.forEach((id) =>
    state.set(id, { key: Infinity, repairCost: 0, travel: 0, pred: null, entrance: '' }),
  );
  const visited = new Set<string>();
  entrances.forEach((id) => {
    if (state.has(id)) state.set(id, { key: 0, repairCost: 0, travel: 0, pred: null, entrance: id });
  });

  while (true) {
    let current: string | null = null;
    let currentKey = Infinity;
    state.forEach((s, id) => {
      if (!visited.has(id) && s.key < currentKey) {
        currentKey = s.key;
        current = id;
      }
    });
    if (current === null) break;
    const cur = current as string;
    if (cur === target) break;
    visited.add(cur);
    const curState = state.get(cur)!;

    adj.get(cur)?.forEach((arc) => {
      const trail = trailMap.get(arc.trailId);
      if (!trail) return;
      const actions = repairActionsFor(trail, mode, arc.onewayBlocked);
      const addCost = actions.reduce((sum, a) => sum + a.cost, 0);
      const addTravel = trail.length;
      const next = state.get(arc.to);
      if (!next) return;
      const nextRepair = curState.repairCost + addCost;
      const nextTravel = curState.travel + addTravel;
      const nextKey = nextRepair * REPAIR_WEIGHT + nextTravel;
      if (nextKey < next.key) {
        next.key = nextKey;
        next.repairCost = nextRepair;
        next.travel = nextTravel;
        next.pred = { node: cur, arc, addedActions: actions };
        next.entrance = curState.entrance;
      }
    });
  }

  const end = state.get(target);
  if (!end || end.key === Infinity || end.repairCost === 0) {
    // repairCost === 0 说明本来就有自由通路，调用方不应走到这里
    return null;
  }

  const actions: RepairAction[] = [];
  const seen = new Set<string>();
  const trailIds: string[] = [];
  let node: string | null = target;
  while (node && node !== end.entrance) {
    const s = state.get(node)!;
    if (!s.pred) return null;
    trailIds.unshift(s.pred.arc.trailId);
    s.pred.addedActions.forEach((action) => {
      const dedupeKey = `${action.trailId}:${action.action}`;
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        actions.unshift(action);
      }
    });
    node = s.pred.node;
  }

  return { actions, trailIds, entranceId: end.entrance, travel: end.travel };
}

// ---------------------------------------------------------------------------
// 单模式评估
// ---------------------------------------------------------------------------

export interface EvaluationInput {
  nodes: NetworkNode[];
  trails: Trail[];
  benches: Bench[];
  closedTrailIds?: string[];
}

export function evaluateMode(input: EvaluationInput, modeId: ModeId): BenchAccessResult[] {
  const { nodes, trails, benches } = input;
  const closed = new Set(input.closedTrailIds ?? []);
  const mode = MODE_THRESHOLDS[modeId];

  const nodeIds = nodes.map((n) => n.id);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const trailMap = new Map(trails.map((t) => [t.id, t]));
  const entrances = new Set(nodes.filter((n) => n.kind === 'entrance').map((n) => n.id));
  const arcs = buildArcs(trails, closed);

  const freeState = freeDijkstra(nodeIds, arcs, trailMap, entrances, mode);

  // 反向可达：从长椅节点沿自由通行弧反向走，统计能抵达它的入口数量
  const reverseAdj = new Map<string, Arc[]>();
  nodeIds.forEach((id) => reverseAdj.set(id, []));
  arcs.forEach((arc) => {
    const trail = trailMap.get(arc.trailId);
    if (!trail || arc.onewayBlocked) return;
    if (trailProfileFailures(trail, mode).length > 0) return;
    reverseAdj.get(arc.to)?.push(arc);
  });

  const countReachableEntrances = (targetNode: string): number => {
    const seen = new Set<string>([targetNode]);
    const queue = [targetNode];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      reverseAdj.get(cur)?.forEach((arc) => {
        if (!seen.has(arc.from)) {
          seen.add(arc.from);
          queue.push(arc.from);
        }
      });
    }
    let count = 0;
    seen.forEach((id) => {
      if (entrances.has(id)) count += 1;
    });
    return count;
  };

  // benchId -> nodeId
  const benchNode = new Map<string, string>();
  nodes
    .filter((n) => n.kind === 'bench' && n.benchId)
    .forEach((n) => benchNode.set(n.benchId!, n.id));

  return benches.map((bench): BenchAccessResult => {
    const nodeId = benchNode.get(bench.id);
    if (!nodeId) {
      const reason: RejectReason = {
        code: 'bench_not_on_network',
        label: REASON_LABELS.bench_not_on_network,
        trailIds: [],
      };
      return {
        benchId: bench.id,
        mode: modeId,
        reachable: false,
        alternativeCount: 0,
        reasons: [reason],
        criticalTrailIds: [],
      };
    }

    const target = freeState.get(nodeId)!;

    if (target.dist !== Infinity) {
      // —— 可达：回溯责任路径 ——
      const segments: PathSegment[] = [];
      const pathNodeIds: string[] = [nodeId];
      const pathTrailIds: string[] = [];
      let totalLength = 0;
      let risk: SegmentGrade = 'easy';

      let cur = nodeId;
      const usedEntranceTrails = new Set<string>();
      while (true) {
        const s = freeState.get(cur)!;
        if (!s.pred) break;
        const trail = trailMap.get(s.pred.arc.trailId)!;
        const seg = toSegment(trail, s.pred.arc, mode);
        segments.unshift(seg);
        pathTrailIds.unshift(s.pred.arc.trailId);
        pathNodeIds.unshift(s.pred.node);
        totalLength += trail.length;
        risk = maxGrade(risk, seg.grades.risk);
        usedEntranceTrails.add(s.pred.arc.trailId);
        cur = s.pred.node;
      }

      // 备用入口数：统计能到达该节点的入口数量（责任入口之外）
      const reachableEntrances = countReachableEntrances(nodeId);

      const entranceNode = nodeMap.get(target.entrance);
      const path: ResponsiblePath = {
        entranceId: target.entrance,
        entranceName: entranceNode?.name ?? target.entrance,
        nodeIds: pathNodeIds,
        trailIds: pathTrailIds,
        segments,
        length: Math.round(totalLength * 10) / 10,
        riskLevel: risk,
        cost: Math.round(target.dist),
      };

      return {
        benchId: bench.id,
        nodeId,
        mode: modeId,
        reachable: true,
        path,
        alternativeCount: Math.max(0, reachableEntrances - 1),
        reasons: [],
        criticalTrailIds: [],
      };
    }

    // —— 不可达：修复图搜索最小修复组合 ——
    const repair = repairDijkstra(nodeIds, arcs, trailMap, entrances, mode, nodeId);

    if (!repair) {
      // 即便允许修复仍走不到：拓扑上与入口分离
      return {
        benchId: bench.id,
        nodeId,
        mode: modeId,
        reachable: false,
        alternativeCount: 0,
        reasons: [
          {
            code: 'no_entrance_path',
            label: REASON_LABELS.no_entrance_path,
            trailIds: [],
          },
        ],
        criticalTrailIds: [],
      };
    }

    // 从修复路径汇总不可达原因
    const reasonMap = new Map<RejectReasonCode, Set<string>>();
    repair.trailIds.forEach((tid) => {
      const trail = trailMap.get(tid)!;
      trailProfileFailures(trail, mode).forEach((code) => {
        if (!reasonMap.has(code)) reasonMap.set(code, new Set());
        reasonMap.get(code)!.add(tid);
      });
    });
    const usedReverse = repair.actions.some((a) => a.action === 'open_reverse');
    if (usedReverse) {
      const set = new Set(repair.actions.filter((a) => a.action === 'open_reverse').map((a) => a.trailId));
      reasonMap.set('oneway_barrier', set);
    }

    const reasons: RejectReason[] = Array.from(reasonMap.entries()).map(([code, set]) => ({
      code,
      label: REASON_LABELS[code],
      trailIds: Array.from(set),
    }));

    const criticalTrailIds = Array.from(new Set(repair.actions.map((a) => a.trailId)));
    const combo: RepairCombo = {
      actions: repair.actions,
      totalCost: repair.actions.reduce((sum, a) => sum + a.cost, 0),
      viaEntranceId: repair.entranceId,
      trailIds: repair.trailIds,
    };

    return {
      benchId: bench.id,
      nodeId,
      mode: modeId,
      reachable: false,
      alternativeCount: 0,
      reasons,
      criticalTrailIds,
      minRepair: combo,
    };
  });
}

// ---------------------------------------------------------------------------
// 关闭步道影响 + 全局评估快照
// ---------------------------------------------------------------------------

function makeFingerprint(nodes: NetworkNode[], trails: Trail[]): string {
  const raw = JSON.stringify({
    n: nodes.map((n) => [n.id, n.kind, n.benchId].join(':')),
    t: trails
      .map((t) =>
        [t.id, t.from, t.to, t.length, t.slope, t.width, t.surface, t.steps, t.lighting, t.direction].join('|'),
      )
      .sort(),
  });
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash << 5) - hash + raw.charCodeAt(i);
    hash |= 0;
  }
  return `fp-${Math.abs(hash).toString(36)}-${raw.length.toString(36)}`;
}

export function computeClosureImpacts(
  input: EvaluationInput,
  baseline: Record<ModeId, BenchAccessResult[]>,
  modeId: ModeId,
): ClosureImpact[] {
  const { trails } = input;
  const baseMap = new Map(baseline[modeId].map((r) => [r.benchId, r]));

  return trails.map((trail) => {
    const closedResults = evaluateMode({ ...input, closedTrailIds: [trail.id] }, modeId);
    const newlyUnreachable: string[] = [];
    const rerouted: string[] = [];

    closedResults.forEach((result) => {
      const base = baseMap.get(result.benchId);
      if (!base || !base.reachable) return;
      if (!result.reachable) {
        newlyUnreachable.push(result.benchId);
      } else if (
        result.path?.entranceId !== base.path?.entranceId ||
        result.path?.trailIds.join('>') !== base.path?.trailIds.join('>')
      ) {
        rerouted.push(result.benchId);
      }
    });

    // 关闭期间的最小修复：合并每张新增不可达长椅各自的最省修复
    const actionDedupe = new Map<string, RepairAction>();
    const comboTrails = new Set<string>();
    let viaEntrance = '';
    newlyUnreachable.forEach((benchId) => {
      const r = closedResults.find((x) => x.benchId === benchId);
      if (r?.minRepair) {
        viaEntrance = r.minRepair.viaEntranceId;
        r.minRepair.actions.forEach((a) => {
          const key = `${a.trailId}:${a.action}`;
          if (!actionDedupe.has(key)) actionDedupe.set(key, a);
        });
        r.minRepair.trailIds.forEach((tid) => comboTrails.add(tid));
      }
    });

    const actions = Array.from(actionDedupe.values());
    const minRepair: RepairCombo | undefined =
      actions.length > 0
        ? {
            actions,
            totalCost: actions.reduce((sum, a) => sum + a.cost, 0),
            viaEntranceId: viaEntrance,
            trailIds: Array.from(comboTrails),
          }
        : undefined;

    return { closedTrailId: trail.id, newlyUnreachable, rerouted, minRepair };
  });
}

export function evaluateAll(input: EvaluationInput, closures: string[]): AccessSnapshot {
  // 基线（无关闭）三模式结果，既是影响对比基准，也让“关闭任意步道”始终对照档案原始可达性
  const baseline = {} as Record<ModeId, BenchAccessResult[]>;
  (Object.keys(MODE_THRESHOLDS) as ModeId[]).forEach((modeId) => {
    baseline[modeId] = evaluateMode(input, modeId);
  });

  const results = {} as Record<ModeId, BenchAccessResult[]>;
  const closedInput = { ...input, closedTrailIds: closures };
  (Object.keys(MODE_THRESHOLDS) as ModeId[]).forEach((modeId) => {
    results[modeId] = evaluateMode(closedInput, modeId);
  });

  const issues = validateNetwork(input.nodes, input.trails, input.benches);

  // 影响分析始终相对基线；关闭期间的最小修复基于关闭后的网络重算
  const primary = results.wheelchair;
  const summary = {
    total: primary.length,
    reachable: primary.filter((r) => r.reachable).length,
    unreachable: primary.filter((r) => !r.reachable && !r.reasons.some((x) => x.code === 'bench_not_on_network')).length,
    unhooked: primary.filter((r) => r.reasons.some((x) => x.code === 'bench_not_on_network')).length,
  };

  return {
    version: 1,
    evaluatedAt: new Date().toISOString(),
    mode: 'wheelchair',
    networkFingerprint: makeFingerprint(input.nodes, input.trails),
    closures,
    entranceCount: input.nodes.filter((n) => n.kind === 'entrance').length,
    summary,
    results,
    closureImpacts: computeClosureImpacts(input, baseline, 'wheelchair'),
    issues,
    evaluated: true,
  };
}
