import { Construction, RotateCcw, AlertOctagon, Shuffle, Wrench } from 'lucide-react';
import type { Bench } from '@/types';
import type {
  AccessSnapshot,
  BenchAccessResult,
  ModeId,
  NetworkNode,
  RepairAction,
  Trail,
} from '@/types/accessibility';

interface ClosurePanelProps {
  trails: Trail[];
  nodes: NetworkNode[];
  benches: Bench[];
  snapshot: AccessSnapshot | null;
  mode: ModeId;
  currentResults: BenchAccessResult[];
  baselineResults: BenchAccessResult[];
  onToggle: (trailId: string) => void;
  onClear: () => void;
}

function trailLabel(trail: Trail, nodeName: (id: string) => string): string {
  return trail.name ?? `${nodeName(trail.from)} ↔ ${nodeName(trail.to)}`;
}

function RepairView({ actions }: { actions: RepairAction[] }) {
  if (actions.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
      <span className="inline-flex items-center gap-1 text-ochre font-medium">
        <Wrench className="w-3 h-3" />
        最小修复（并集去重）：
      </span>
      {actions.map((a) => (
        <span key={`${a.trailId}-${a.action}`} className="px-1.5 py-0.5 rounded bg-white/80 text-deep-brown">
          {a.label}（{a.trailId}）
        </span>
      ))}
      <span className="text-ink-light">合计代价指数 {actions.reduce((s, a) => s + a.cost, 0)}</span>
    </div>
  );
}

export default function ClosurePanel({
  trails,
  nodes,
  benches,
  snapshot,
  mode,
  currentResults,
  baselineResults,
  onToggle,
  onClear,
}: ClosurePanelProps) {
  const closedIds = snapshot?.closures ?? [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const nameOfNode = (id: string) => nodeMap.get(id)?.name ?? id;
  const benchMap = new Map(benches.map((b) => [b.id, b]));

  const currentMap = new Map(currentResults.map((r) => [r.benchId, r]));
  const baseMap = new Map(baselineResults.map((r) => [r.benchId, r]));

  // 当前关闭组合（可能多条）相对无关闭基线的实际影响
  const liveUnreachable: string[] = [];
  const liveRerouted: string[] = [];
  currentResults.forEach((r) => {
    const base = baseMap.get(r.benchId);
    if (!base?.reachable) return;
    if (!r.reachable) liveUnreachable.push(r.benchId);
    else if (
      r.path?.entranceId !== base.path?.entranceId ||
      r.path?.trailIds.join('>') !== base.path?.trailIds.join('>')
    ) {
      liveRerouted.push(r.benchId);
    }
  });

  // 恢复全部新增不可达长椅的合并最小修复（各椅最省方案取并集，自动去重）
  const liveRepair = new Map<string, RepairAction>();
  liveUnreachable.forEach((benchId) => {
    currentMap.get(benchId)?.minRepair?.actions.forEach((a) => {
      liveRepair.set(`${a.trailId}:${a.action}`, a);
    });
  });

  // 关闭一条步道时，基线单步道影响用于解释
  const singleImpact =
    closedIds.length === 1
      ? snapshot?.closureImpacts.find((c) => c.closedTrailId === closedIds[0])
      : undefined;

  return (
    <div className="paper-texture rounded-xl shadow-paper p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-serif font-semibold text-deep-brown flex items-center gap-2">
          <Construction className="w-4 h-4 text-ochre" />
          步道关闭模拟
        </h3>
        {closedIds.length > 0 && (
          <button
            onClick={onClear}
            className="inline-flex items-center gap-1 text-xs text-ink-light hover:text-deep-brown"
          >
            <RotateCcw className="w-3 h-3" />
            全部恢复
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {trails.map((trail) => {
          const closed = closedIds.includes(trail.id);
          return (
            <button
              key={trail.id}
              onClick={() => onToggle(trail.id)}
              className={`text-left rounded-lg border px-3 py-2 transition-colors ${
                closed
                  ? 'border-red-300 bg-red-50/80'
                  : 'border-deep-brown/10 bg-white/60 hover:bg-white'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${closed ? 'bg-red-500' : 'bg-moss-green'}`}
                />
                <span className={`text-sm truncate ${closed ? 'text-red-800' : 'text-deep-brown'}`}>
                  {trailLabel(trail, nameOfNode)}
                </span>
                <span className="ml-auto text-xs text-ink-light flex-shrink-0">
                  {closed ? '已关闭' : '运行中'}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-ink-light/80 pl-4">
                {nameOfNode(trail.from)} → {nameOfNode(trail.to)} · {trail.length}m
                {trail.direction === 'oneway' && ' · 单向'}
              </div>
            </button>
          );
        })}
      </div>

      {closedIds.length === 0 ? (
        <p className="mt-3 text-xs text-ink-light">
          点击任意步道可将其关闭并重算全部长椅可达性；再点一次恢复。影响分析当前以
          <span className="text-deep-brown font-medium">
            {mode === 'wheelchair' ? '轮椅' : mode === 'walker' ? '助行器' : '婴童车'}
          </span>
          阈值呈现。
        </p>
      ) : (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50/60 p-3">
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="inline-flex items-center gap-1.5 text-red-700">
              <AlertOctagon className="w-4 h-4" />
              变为不可达：{liveUnreachable.length} 张
            </span>
            <span className="inline-flex items-center gap-1.5 text-ochre">
              <Shuffle className="w-4 h-4" />
              路径改道：{liveRerouted.length} 张
            </span>
          </div>

          {liveUnreachable.length > 0 && (
            <div className="mt-2 text-sm text-ink-light">
              受影响长椅：
              {liveUnreachable.map((id) => (
                <span key={id} className="mx-1 px-1.5 py-0.5 rounded bg-white/80 text-xs text-red-700">
                  {benchMap.get(id)?.name ?? id}
                </span>
              ))}
            </div>
          )}
          {liveRerouted.length > 0 && (
            <div className="mt-1.5 text-sm text-ink-light">
              改道长椅：
              {liveRerouted.map((id) => (
                <span key={id} className="mx-1 px-1.5 py-0.5 rounded bg-white/80 text-xs text-ochre">
                  {benchMap.get(id)?.name ?? id}
                </span>
              ))}
            </div>
          )}

          {singleImpact && (
            <p className="mt-2 text-xs text-ink-light/80">
              单步道关闭分析（对照无关闭基线）：新增不可达 {singleImpact.newlyUnreachable.length} 张 ·
              改道 {singleImpact.rerouted.length} 张
              {singleImpact.minRepair
                ? ` · 建议临时修复代价指数 ${singleImpact.minRepair.totalCost}`
                : ''}
            </p>
          )}

          {liveRepair.size > 0 && <RepairView actions={Array.from(liveRepair.values())} />}
        </div>
      )}
    </div>
  );
}
