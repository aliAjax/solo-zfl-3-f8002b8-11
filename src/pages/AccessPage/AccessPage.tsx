import { useEffect, useMemo, useState } from 'react';
import { Accessibility as AccessIcon, RefreshCw, Settings2, RotateCcw, Clock } from 'lucide-react';
import { useBenchStore } from '@/store/useBenchStore';
import { useAccessStore } from '@/store/useAccessStore';
import { evaluateMode } from '@/utils/accessibility';
import { MODE_THRESHOLDS } from '@/types/accessibility';
import type { ModeId } from '@/types/accessibility';
import IssuesPanel from '@/components/Accessibility/IssuesPanel';
import ClosurePanel from '@/components/Accessibility/ClosurePanel';
import BenchAccessCard from '@/components/Accessibility/BenchAccessCard';
import NetworkEditor from '@/components/Accessibility/NetworkEditor';
import NetworkSchematic from '@/components/Accessibility/NetworkSchematic';

export default function AccessPage() {
  const { benches, initialize: initBenches, initialized: benchesReady } = useBenchStore();
  const {
    nodes,
    trails,
    snapshot,
    initialize: initAccess,
    initialized: accessReady,
    runEvaluation,
    resetNetwork,
  } = useAccessStore();

  const [mode, setMode] = useState<ModeId>('wheelchair');
  const [showEditor, setShowEditor] = useState(false);

  useEffect(() => {
    if (!benchesReady) initBenches();
  }, [benchesReady, initBenches]);

  useEffect(() => {
    if (benchesReady && !accessReady) initAccess();
  }, [benchesReady, accessReady, initAccess]);

  // 无关闭基线（始终基于当前路网实时计算，用于关闭影响对比）
  const baselineResults = useMemo(() => {
    if (nodes.length === 0) return [];
    return evaluateMode({ nodes, trails, benches }, mode);
  }, [nodes, trails, benches, mode]);

  const evaluated = snapshot?.evaluated ?? false;
  const currentResults = evaluated ? snapshot!.results[mode] ?? [] : [];

  const reachableCount = currentResults.filter((r) => r.reachable).length;
  const unhookedCount = currentResults.filter((r) =>
    r.reasons.some((x) => x.code === 'bench_not_on_network'),
  ).length;

  const trailName = (id: string) => {
    const trail = trails.find((t) => t.id === id);
    if (!trail) return id;
    return trail.name ?? `${nodeName(trail.from)} ↔ ${nodeName(trail.to)}`;
  };
  const nodeName = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl font-semibold text-deep-brown mb-1 flex items-center gap-2">
            <AccessIcon className="w-6 h-6 text-moss-green" />
            无障碍通路评估
          </h2>
          <p className="text-ink-light text-sm">
            多入口路网 · 轮椅 / 助行器 / 婴童车三套阈值 · 责任路径与最小修复组合
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runEvaluation}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-warm-beige text-deep-brown text-sm hover:bg-warm-beige/70 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />重新计算
          </button>
          <button
            onClick={() => setShowEditor((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              showEditor ? 'bg-deep-brown text-warm-cream' : 'bg-warm-beige text-deep-brown hover:bg-warm-beige/70'
            }`}
          >
            <Settings2 className="w-4 h-4" />路网编辑
          </button>
          <button
            onClick={resetNetwork}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-warm-beige text-ink-light text-sm hover:bg-red-50 hover:text-red-600 transition-colors"
            title="恢复演示路网"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 阈值方案切换 */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(Object.keys(MODE_THRESHOLDS) as ModeId[]).map((m) => {
          const count = evaluated
            ? (snapshot!.results[m] ?? []).filter((r) => r.reachable).length
            : 0;
          const total = benches.length;
          return (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-xl px-4 py-2.5 text-left border transition-all ${
                mode === m
                  ? 'bg-moss-green text-white border-moss-green shadow-md'
                  : 'paper-texture border-deep-brown/10 text-ink-light hover:border-moss-green/40'
              }`}
            >
              <div className="text-sm font-semibold">{MODE_THRESHOLDS[m].label}</div>
              <div className={`text-xs ${mode === m ? 'text-white/80' : 'text-ink-light/80'}`}>
                {evaluated ? `${count}/${total} 可达` : '待评估'} · {MODE_THRESHOLDS[m].description}
              </div>
            </button>
          );
        })}
      </div>

      {/* 校验问题（错误拦住评估） */}
      {snapshot && <IssuesPanel issues={snapshot.issues} />}

      {!evaluated && (
        <div className="paper-texture rounded-xl shadow-paper p-10 text-center">
          <AccessIcon className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <h3 className="font-serif text-lg font-medium text-deep-brown mb-1">
            路网存在硬性问题，评估已拦住
          </h3>
          <p className="text-ink-light text-sm">
            请先按上方提示修复缺端点、极值、重复边或单向冲突，系统会自动重算。
          </p>
        </div>
      )}

      {evaluated && snapshot && (
        <>
          {/* 概览 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="paper-texture rounded-xl shadow-paper p-4">
              <div className="text-xs text-ink-light">入口数量</div>
              <div className="text-2xl font-bold font-serif text-deep-brown mt-1">
                {snapshot.entranceCount}
              </div>
            </div>
            <div className="paper-texture rounded-xl shadow-paper p-4">
              <div className="text-xs text-ink-light">{MODE_THRESHOLDS[mode].label}可达</div>
              <div className="text-2xl font-bold font-serif text-moss-green mt-1">
                {reachableCount}
                <span className="text-sm text-ink-light font-normal"> / {benches.length}</span>
              </div>
            </div>
            <div className="paper-texture rounded-xl shadow-paper p-4">
              <div className="text-xs text-ink-light">不可达</div>
              <div className="text-2xl font-bold font-serif text-red-500 mt-1">
                {benches.length - reachableCount - unhookedCount}
              </div>
            </div>
            <div className="paper-texture rounded-xl shadow-paper p-4">
              <div className="text-xs text-ink-light">关闭中步道</div>
              <div className="text-2xl font-bold font-serif text-ochre mt-1">
                {snapshot.closures.length}
              </div>
            </div>
          </div>

          {/* 路网示意 */}
          <NetworkSchematic nodes={nodes} trails={trails} results={currentResults} />

          {/* 关闭模拟 */}
          <ClosurePanel
            trails={trails}
            nodes={nodes}
            benches={benches}
            snapshot={snapshot}
            mode={mode}
            currentResults={currentResults}
            baselineResults={baselineResults}
            onToggle={(id) => useAccessStore.getState().toggleClosure(id)}
            onClear={() => useAccessStore.getState().clearClosures()}
          />

          {/* 每张长椅结果 */}
          <div className="space-y-3">
            {benches.map((bench) => {
              const results = {
                wheelchair: snapshot.results.wheelchair.find((r) => r.benchId === bench.id),
                walker: snapshot.results.walker.find((r) => r.benchId === bench.id),
                stroller: snapshot.results.stroller.find((r) => r.benchId === bench.id),
              };
              if (!results.wheelchair || !results.walker || !results.stroller) return null;
              return (
                <BenchAccessCard
                  key={bench.id}
                  bench={bench}
                  results={results}
                  trailName={trailName}
                  nodeName={nodeName}
                  defaultMode={mode}
                />
              );
            })}
          </div>
        </>
      )}

      {/* 路网编辑 */}
      {showEditor && (
        <div className="mt-6">
          <NetworkEditor benches={benches} />
        </div>
      )}

      <div className="mt-6 flex items-center gap-1.5 text-xs text-ink-light/70">
        <Clock className="w-3.5 h-3.5" />
        {snapshot
          ? `评估结果随档案保存在本地，刷新后仍在 · 最近重算：${new Date(snapshot.evaluatedAt).toLocaleString('zh-CN')}`
          : '评估结果将随档案自动保存'}
      </div>
    </div>
  );
}
