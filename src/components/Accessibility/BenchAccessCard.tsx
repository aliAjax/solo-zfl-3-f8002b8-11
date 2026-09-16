import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  MapPin,
  Footprints,
  Wrench,
  Route as RouteIcon,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import type { Bench } from '@/types';
import type {
  BenchAccessResult,
  ModeId,
  RepairCombo,
} from '@/types/accessibility';
import {
  LIGHTING_LABELS,
  MODE_THRESHOLDS,
  REASON_LABELS,
  SURFACE_LABELS,
} from '@/types/accessibility';
import { gradeBadgeClass, gradeLabel, summarizeSegments } from '@/utils/accessUi';

interface BenchAccessCardProps {
  bench: Bench;
  results: Record<ModeId, BenchAccessResult>;
  trailName: (id: string) => string;
  nodeName: (id: string) => string;
  defaultMode: ModeId;
}

function RepairComboView({
  combo,
  trailName,
  nodeName,
  closed,
}: {
  combo: RepairCombo;
  trailName: (id: string) => string;
  nodeName: (id: string) => string;
  closed: boolean;
}) {
  return (
    <div className="mt-2 rounded-lg border border-dashed border-ochre/40 bg-ochre/5 p-3">
      <div className="flex items-center gap-1.5 text-sm font-medium text-ochre mb-1.5">
        <Wrench className="w-3.5 h-3.5" />
        {closed ? '关闭期间最小临时修复组合' : '建议最小修复组合'}
        <span className="ml-auto text-xs text-ink-light">修复代价指数 {combo.totalCost}</span>
      </div>
      <ul className="space-y-1 text-sm text-ink-light">
        {combo.actions.map((action) => (
          <li key={`${action.trailId}-${action.action}`} className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded bg-white/70 text-xs text-deep-brown">
              {action.label}
            </span>
            <span>步道「{trailName(action.trailId)}」</span>
            <span className="text-xs text-ink-light/70">（指数 {action.cost}）</span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-xs text-ink-light/80">
        修复后自入口「{nodeName(combo.viaEntranceId)}」经 {combo.trailIds.length} 段步道可达。
      </p>
    </div>
  );
}

export default function BenchAccessCard({
  bench,
  results,
  trailName,
  nodeName,
  defaultMode,
}: BenchAccessCardProps) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<ModeId>(defaultMode);
  const [open, setOpen] = useState(false);
  const result = results[mode];

  const modeReachability = (Object.keys(MODE_THRESHOLDS) as ModeId[]).map((m) => ({
    mode: m,
    reachable: results[m].reachable,
  }));

  const segmentStats = summarizeSegments(result);

  return (
    <div className="paper-texture rounded-xl shadow-paper overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-warm-cream/60 transition-colors"
      >
        <div className="flex-shrink-0">
          {result.reachable ? (
            <CheckCircle2 className="w-6 h-6 text-moss-green" />
          ) : (
            <XCircle className="w-6 h-6 text-red-500" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-serif font-semibold text-deep-brown truncate">{bench.name}</h3>
            <span className="flex items-center gap-0.5 text-xs text-ink-light">
              <MapPin className="w-3 h-3" />
              <span className="truncate max-w-[12rem]">{bench.location}</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            {modeReachability.map(({ mode: m, reachable }) => (
              <span
                key={m}
                className={`px-1.5 py-0.5 rounded text-xs ${
                  reachable ? 'bg-moss-green/10 text-moss-green' : 'bg-red-50 text-red-600'
                }`}
                title={MODE_THRESHOLDS[m].description}
              >
                {MODE_THRESHOLDS[m].label}{reachable ? '可达' : '不可达'}
              </span>
            ))}
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-ink-light transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-deep-brown/10">
          {/* 模式切换 */}
          <div className="flex items-center gap-2 py-3">
            <span className="text-xs text-ink-light">阈值方案：</span>
            <div className="flex gap-1">
              {(Object.keys(MODE_THRESHOLDS) as ModeId[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    mode === m
                      ? 'bg-deep-brown text-warm-cream'
                      : 'bg-warm-beige text-ink-light hover:bg-warm-beige/70'
                  }`}
                >
                  {MODE_THRESHOLDS[m].label}
                </button>
              ))}
            </div>
            <span className="ml-auto text-xs text-ink-light/80 hidden sm:block">
              {MODE_THRESHOLDS[mode].description}
            </span>
          </div>

          {result.reachable && result.path ? (
            <div>
              {/* 责任路径 */}
              <div className="rounded-lg bg-moss-green/5 border border-moss-green/20 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-deep-brown">
                    <RouteIcon className="w-4 h-4 text-moss-green" />
                    责任路径：自「{result.path.entranceName}」出发
                    {result.alternativeCount > 0 && (
                      <span className="text-xs text-ink-light">
                        （另有 {result.alternativeCount} 个入口可达）
                      </span>
                    )}
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${gradeBadgeClass(result.path.riskLevel)}`}>
                    综合风险·{gradeLabel(result.path.riskLevel)}
                  </span>
                </div>
                <div className="text-xs text-ink-light mb-2">
                  共 {result.path.segments.length} 段 · 总长 {result.path.length} 米 · 经过节点：
                  {result.path.nodeIds.map((id) => nodeName(id)).join(' → ')}
                </div>

                {/* 多段路径分级 */}
                <div className="space-y-1.5">
                  {result.path.segments.map((seg, idx) => (
                    <div
                      key={`${seg.trailId}-${idx}`}
                      className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-white/70 px-2.5 py-1.5 text-xs ${
                        result.criticalTrailIds.includes(seg.trailId)
                          ? 'ring-1 ring-amber-300'
                          : ''
                      }`}
                    >
                      <span className="font-medium text-deep-brown w-28 truncate">
                        {trailName(seg.trailId)}
                        {seg.reverse && <span className="text-ink-light/70">（反向通行）</span>}
                      </span>
                      <span className="text-ink-light">{seg.length}m</span>
                      <span className="text-ink-light">坡度 {seg.slope}%</span>
                      <span className="text-ink-light">宽 {seg.width}m</span>
                      <span className="text-ink-light">{SURFACE_LABELS[seg.surface]}</span>
                      {seg.steps > 0 && <span className="text-ink-light">{seg.steps} 级台阶</span>}
                      <span className="text-ink-light">{LIGHTING_LABELS[seg.lighting]}</span>
                      <span className="flex items-center gap-1 ml-auto">
                        <span className={`px-1.5 py-0.5 rounded ${gradeBadgeClass(seg.grades.slope)}`}>
                          坡·{gradeLabel(seg.grades.slope)}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded ${gradeBadgeClass(seg.grades.width)}`}>
                          宽·{gradeLabel(seg.grades.width)}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded ${gradeBadgeClass(seg.grades.risk)}`}>
                          险·{gradeLabel(seg.grades.risk)}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>

                {/* 分段分级汇总 */}
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-ink-light">
                  {(['slope', 'width', 'risk'] as const).map((key) => {
                    const labels = { slope: '坡度', width: '宽度', risk: '风险' } as const;
                    const tally = segmentStats[key];
                    return (
                      <span key={key}>
                        {labels[key]}段：
                        {tally.easy > 0 && <span className="text-moss-green"> 平缓{tally.easy}</span>}
                        {tally.moderate > 0 && <span className="text-ochre"> 注意{tally.moderate}</span>}
                        {tally.hard > 0 && <span className="text-orange-700"> 吃力{tally.hard}</span>}
                        {tally.blocked > 0 && <span className="text-red-600"> 阻断{tally.blocked}</span>}
                      </span>
                    );
                  })}
                </div>

                {/* 可达长椅的关键断点：责任路径上关闭即断的桥接步道 */}
                {result.criticalTrailIds.length > 0 && (
                  <div className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50/70 px-2.5 py-1.5 text-xs text-amber-800">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <span>
                      关键断点（关闭后{MODE_THRESHOLDS[mode].label}即不可达）：
                      {result.criticalTrailIds.map((id) => (
                        <span
                          key={id}
                          className="mx-1 px-1.5 py-0.5 rounded bg-white/80 text-deep-brown"
                        >
                          {trailName(id)}
                        </span>
                      ))}
                    </span>
                  </div>
                )}
                {result.criticalTrailIds.length === 0 && result.path.segments.length > 0 && (
                  <p className="mt-2 text-xs text-moss-green/90">
                    责任路径存在冗余替代步道，关闭其中任意一条仍可抵达。
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div>
              {/* 不可达原因 + 关键断点 */}
              <div className="rounded-lg bg-red-50/60 border border-red-200 p-3">
                <div className="flex items-center gap-1.5 text-sm font-medium text-red-700 mb-2">
                  <XCircle className="w-4 h-4" />
                  {MODE_THRESHOLDS[mode].label}方案不可达
                </div>

                {result.reasons.length > 0 ? (
                  <ul className="space-y-1.5 text-sm text-ink-light">
                    {result.reasons.map((reason) => (
                      <li key={reason.code}>
                        <span className="font-medium text-red-700">{REASON_LABELS[reason.code]}</span>
                        {reason.trailIds.length > 0 && (
                          <span>
                            {' '}— 断点步道：
                            {reason.trailIds.map((id) => (
                              <span
                                key={id}
                                className="inline-block mx-1 px-1.5 py-0.5 rounded bg-white/80 text-xs text-deep-brown"
                              >
                                {trailName(id)}
                              </span>
                            ))}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {result.criticalTrailIds.length > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-ink-light">
                    <Footprints className="w-3.5 h-3.5" />
                    关键断点：{result.criticalTrailIds.map((id) => trailName(id)).join('、')}
                  </div>
                )}
              </div>

              {result.minRepair && (
                <RepairComboView
                  combo={result.minRepair}
                  trailName={trailName}
                  nodeName={nodeName}
                  closed={false}
                />
              )}
            </div>
          )}

          <div className="mt-3 text-right">
            <button
              onClick={() => navigate(`/bench/${bench.id}`)}
              className="text-xs text-moss-green hover:underline"
            >
              查看长椅档案 →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
