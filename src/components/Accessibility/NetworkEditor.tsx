import { useEffect, useState } from 'react';
import { Plus, Save, Trash2, X, Pencil, MapPinned, Route } from 'lucide-react';
import type {
  DirectionType,
  LightingType,
  NetworkNode,
  NodeKind,
  SurfaceType,
  Trail,
} from '@/types/accessibility';
import {
  DIRECTION_LABELS,
  LIGHTING_LABELS,
  SURFACE_LABELS,
  TRAIL_LIMITS,
} from '@/types/accessibility';
import { useAccessStore } from '@/store/useAccessStore';
import type { Bench } from '@/types';

interface NetworkEditorProps {
  benches: Bench[];
}

const surfaceOptions = Object.keys(SURFACE_LABELS) as SurfaceType[];
const lightingOptions = Object.keys(LIGHTING_LABELS) as LightingType[];
const kindLabels: Record<NodeKind, string> = {
  entrance: '入口',
  junction: '交汇点',
  bench: '长椅节点',
};

interface TrailFormState {
  name: string;
  from: string;
  to: string;
  length: number;
  slope: number;
  width: number;
  surface: SurfaceType;
  steps: number;
  lighting: LightingType;
  direction: DirectionType;
}

const emptyTrail: TrailFormState = {
  name: '',
  from: '',
  to: '',
  length: 50,
  slope: 0,
  width: 1.5,
  surface: 'paved',
  steps: 0,
  lighting: 'full',
  direction: 'both',
};

interface NodeFormState {
  name: string;
  kind: NodeKind;
  lat: number;
  lng: number;
  benchId: string;
}

export default function NetworkEditor({ benches }: NetworkEditorProps) {
  const {
    nodes,
    trails,
    addNode,
    deleteNode,
    addTrail,
    updateTrail,
    deleteTrail,
  } = useAccessStore();
  const [trailForm, setTrailForm] = useState<TrailFormState>(emptyTrail);
  const [editingTrailId, setEditingTrailId] = useState<string | null>(null);
  const [trailError, setTrailError] = useState<string | null>(null);

  const [nodeForm, setNodeForm] = useState<NodeFormState>({
    name: '',
    kind: 'junction',
    lat: 31.235,
    lng: 121.475,
    benchId: '',
  });
  const [nodeError, setNodeError] = useState<string | null>(null);

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const nameOf = (id?: string) => (id ? nodeMap.get(id)?.name ?? id : '');

  useEffect(() => {
    if (editingTrailId) {
      const t = trails.find((x) => x.id === editingTrailId);
      if (t) {
        setTrailForm({
          name: t.name ?? '',
          from: t.from,
          to: t.to,
          length: t.length,
          slope: t.slope,
          width: t.width,
          surface: t.surface,
          steps: t.steps,
          lighting: t.lighting,
          direction: t.direction,
        });
      }
    }
  }, [editingTrailId, trails]);

  const submitTrail = () => {
    setTrailError(null);
    const payload = {
      ...trailForm,
      name: trailForm.name.trim() || undefined,
    };
    const result = editingTrailId
      ? updateTrail(editingTrailId, payload)
      : addTrail(payload as Omit<Trail, 'id'>);
    if (!result.ok) {
      setTrailError(result.issues.map((i) => i.message).join('；'));
      return;
    }
    setTrailForm(emptyTrail);
    setEditingTrailId(null);
  };

  const submitNode = () => {
    setNodeError(null);
    if (!nodeForm.name.trim()) {
      setNodeError('地点名称不能为空。');
      return;
    }
    const result = addNode({
      name: nodeForm.name.trim(),
      kind: nodeForm.kind,
      lat: nodeForm.lat,
      lng: nodeForm.lng,
      benchId: nodeForm.kind === 'bench' ? nodeForm.benchId || undefined : undefined,
    });
    if (!result.ok) {
      setNodeError(result.issues.map((i) => i.message).join('；'));
      return;
    }
    setNodeForm({ name: '', kind: 'junction', lat: 31.235, lng: 121.475, benchId: '' });
  };

  const fieldClass =
    'w-full rounded-lg border border-deep-brown/15 bg-white/80 px-2.5 py-1.5 text-sm text-deep-brown focus:outline-none focus:ring-2 focus:ring-moss-green/30';
  const labelClass = 'block text-xs text-ink-light mb-1';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* 步道编辑 */}
      <div className="paper-texture rounded-xl shadow-paper p-4">
        <h3 className="font-serif font-semibold text-deep-brown flex items-center gap-2 mb-3">
          <Route className="w-4 h-4 text-moss-green" />
          {editingTrailId ? '编辑步道' : '新增步道'}
        </h3>

        <div className="space-y-3">
          <div>
            <label className={labelClass}>步道名称（可留空）</label>
            <input
              className={fieldClass}
              value={trailForm.name}
              onChange={(e) => setTrailForm({ ...trailForm, name: e.target.value })}
              placeholder="如：东门主道"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>起点地点</label>
              <select
                className={fieldClass}
                value={trailForm.from}
                onChange={(e) => setTrailForm({ ...trailForm, from: e.target.value })}
              >
                <option value="">请选择</option>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>{kindLabels[n.kind]}·{n.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>终点地点</label>
              <select
                className={fieldClass}
                value={trailForm.to}
                onChange={(e) => setTrailForm({ ...trailForm, to: e.target.value })}
              >
                <option value="">请选择</option>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>{kindLabels[n.kind]}·{n.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className={labelClass}>长度（米）</label>
              <input
                type="number"
                className={fieldClass}
                value={trailForm.length}
                min={TRAIL_LIMITS.length.min}
                max={TRAIL_LIMITS.length.max}
                step="0.5"
                onChange={(e) => setTrailForm({ ...trailForm, length: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className={labelClass}>坡度（%）</label>
              <input
                type="number"
                className={fieldClass}
                value={trailForm.slope}
                min={TRAIL_LIMITS.slope.min}
                max={TRAIL_LIMITS.slope.max}
                step="0.5"
                onChange={(e) => setTrailForm({ ...trailForm, slope: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className={labelClass}>宽度（米）</label>
              <input
                type="number"
                className={fieldClass}
                value={trailForm.width}
                min={TRAIL_LIMITS.width.min}
                max={TRAIL_LIMITS.width.max}
                step="0.1"
                onChange={(e) => setTrailForm({ ...trailForm, width: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className={labelClass}>台阶数</label>
              <input
                type="number"
                className={fieldClass}
                value={trailForm.steps}
                min={TRAIL_LIMITS.steps.min}
                max={TRAIL_LIMITS.steps.max}
                step="1"
                onChange={(e) => setTrailForm({ ...trailForm, steps: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={labelClass}>路面</label>
              <select
                className={fieldClass}
                value={trailForm.surface}
                onChange={(e) => setTrailForm({ ...trailForm, surface: e.target.value as SurfaceType })}
              >
                {surfaceOptions.map((s) => (
                  <option key={s} value={s}>{SURFACE_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>照明</label>
              <select
                className={fieldClass}
                value={trailForm.lighting}
                onChange={(e) => setTrailForm({ ...trailForm, lighting: e.target.value as LightingType })}
              >
                {lightingOptions.map((l) => (
                  <option key={l} value={l}>{LIGHTING_LABELS[l]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>通行方向</label>
              <select
                className={fieldClass}
                value={trailForm.direction}
                onChange={(e) => setTrailForm({ ...trailForm, direction: e.target.value as DirectionType })}
              >
                <option value="both">{DIRECTION_LABELS.both}</option>
                <option value="oneway">{DIRECTION_LABELS.oneway}（起→终）</option>
              </select>
            </div>
          </div>

          {trailError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              已拦住保存：{trailError}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={submitTrail}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-moss-green text-white text-sm hover:bg-moss-light transition-colors"
            >
              {editingTrailId ? <Save className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {editingTrailId ? '保存修改' : '添加步道'}
            </button>
            {editingTrailId && (
              <button
                onClick={() => {
                  setEditingTrailId(null);
                  setTrailForm(emptyTrail);
                  setTrailError(null);
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-warm-beige text-ink-light text-sm hover:bg-warm-beige/70"
              >
                <X className="w-3.5 h-3.5" />取消
              </button>
            )}
          </div>
        </div>

        {/* 步道清单 */}
        <div className="mt-4 space-y-1.5 max-h-72 overflow-y-auto pr-1">
          {trails.map((trail) => (
            <div
              key={trail.id}
              className="flex items-center gap-2 rounded-lg bg-white/60 px-2.5 py-1.5 text-xs"
            >
              <span className="font-medium text-deep-brown truncate max-w-[7rem]">
                {trail.name ?? '未命名步道'}
              </span>
              <span className="text-ink-light truncate">
                {nameOf(trail.from)} → {nameOf(trail.to)}
              </span>
              <span className="text-ink-light/70 flex-shrink-0">
                {trail.length}m · {trail.slope}% · {trail.width}m ·{' '}
                {SURFACE_LABELS[trail.surface]} · {DIRECTION_LABELS[trail.direction]}
              </span>
              <span className="ml-auto flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => setEditingTrailId(trail.id)}
                  className="p-1 text-ink-light hover:text-moss-green"
                  title="编辑"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => deleteTrail(trail.id)}
                  className="p-1 text-ink-light hover:text-red-500"
                  title="删除"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 地点编辑 */}
      <div className="paper-texture rounded-xl shadow-paper p-4">
        <h3 className="font-serif font-semibold text-deep-brown flex items-center gap-2 mb-3">
          <MapPinned className="w-4 h-4 text-ochre" />
          新增地点
        </h3>

        <div className="space-y-3">
          <div>
            <label className={labelClass}>地点名称</label>
            <input
              className={fieldClass}
              value={nodeForm.name}
              onChange={(e) => setNodeForm({ ...nodeForm, name: e.target.value })}
              placeholder="如：北门"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={labelClass}>类型</label>
              <select
                className={fieldClass}
                value={nodeForm.kind}
                onChange={(e) => setNodeForm({ ...nodeForm, kind: e.target.value as NodeKind })}
              >
                <option value="entrance">{kindLabels.entrance}</option>
                <option value="junction">{kindLabels.junction}</option>
                <option value="bench">{kindLabels.bench}</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>纬度</label>
              <input
                type="number"
                step="0.0001"
                className={fieldClass}
                value={nodeForm.lat}
                onChange={(e) => setNodeForm({ ...nodeForm, lat: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className={labelClass}>经度</label>
              <input
                type="number"
                step="0.0001"
                className={fieldClass}
                value={nodeForm.lng}
                onChange={(e) => setNodeForm({ ...nodeForm, lng: Number(e.target.value) })}
              />
            </div>
          </div>

          {nodeForm.kind === 'bench' && (
            <div>
              <label className={labelClass}>挂接长椅档案</label>
              <select
                className={fieldClass}
                value={nodeForm.benchId}
                onChange={(e) => setNodeForm({ ...nodeForm, benchId: e.target.value })}
              >
                <option value="">（不挂接，仅作为地点）</option>
                {benches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}

          {nodeError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {nodeError}
            </div>
          )}

          <button
            onClick={submitNode}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ochre text-white text-sm hover:bg-ochre-light transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />添加地点
          </button>
        </div>

        <div className="mt-4 space-y-1.5 max-h-72 overflow-y-auto pr-1">
          {nodes.map((node: NetworkNode) => (
            <div
              key={node.id}
              className="flex items-center gap-2 rounded-lg bg-white/60 px-2.5 py-1.5 text-xs"
            >
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] flex-shrink-0 ${
                  node.kind === 'entrance'
                    ? 'bg-moss-green/10 text-moss-green'
                    : node.kind === 'bench'
                      ? 'bg-ochre/10 text-ochre'
                      : 'bg-warm-beige text-ink-light'
                }`}
              >
                {kindLabels[node.kind]}
              </span>
              <span className="font-medium text-deep-brown truncate">{node.name}</span>
              {node.kind === 'bench' && node.benchId && (
                <span className="text-ink-light/70 truncate">
                  挂接：{benches.find((b) => b.id === node.benchId)?.name ?? node.benchId}
                </span>
              )}
              <span className="ml-auto flex items-center gap-1 flex-shrink-0">
                {node.kind !== 'entrance' && (
                  <button
                    onClick={() => {
                      const result = deleteNode(node.id);
                      if (!result.ok) setNodeError(result.issues[0]?.message ?? '无法删除地点');
                      else setNodeError(null);
                    }}
                    className="p-1 text-ink-light hover:text-red-500"
                    title="删除地点"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-light/70">
          被步道引用的地点会被拦截删除；请先改接或删除相关步道。
        </p>
      </div>
    </div>
  );
}
