import { AlertTriangle, OctagonAlert } from 'lucide-react';
import type { NetworkIssue } from '@/types/accessibility';

interface IssuesPanelProps {
  issues: NetworkIssue[];
}

const CODE_LABELS: Record<NetworkIssue['code'], string> = {
  missing_endpoint: '缺端点',
  extreme_value: '极值越界',
  duplicate_edge: '重复边',
  oneway_conflict: '单向冲突',
  orphan_node: '孤立地点',
  entrance_broken: '入口悬空',
  bench_unhooked: '长椅未挂接',
  dangling_bench_ref: '挂接失效',
};

export default function IssuesPanel({ issues }: IssuesPanelProps) {
  if (issues.length === 0) {
    return (
      <div className="paper-texture rounded-xl shadow-paper p-4 mb-4 border border-moss-green/20">
        <div className="flex items-center gap-2 text-moss-green">
          <OctagonAlert className="w-4 h-4 hidden" />
          <span className="text-sm font-medium">路网校验通过，无缺端点、极值、重复边或单向冲突。</span>
        </div>
      </div>
    );
  }

  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');

  return (
    <div className="space-y-3 mb-4">
      {errors.length > 0 && (
        <div className="rounded-xl shadow-paper p-4 border border-red-300 bg-red-50/70">
          <div className="flex items-center gap-2 text-red-700 mb-2">
            <OctagonAlert className="w-4 h-4" />
            <h3 className="text-sm font-semibold">
              {errors.length} 项硬性问题 · 已拦住评估（修复前不出可达性结果，也无法保存涉事步道）
            </h3>
          </div>
          <ul className="space-y-1.5">
            {errors.map((issue, idx) => (
              <li key={`${issue.code}-${idx}`} className="flex items-start gap-2 text-sm text-red-800">
                <span className="mt-0.5 px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-xs font-medium flex-shrink-0">
                  {CODE_LABELS[issue.code]}
                </span>
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-xl shadow-paper p-4 border border-ochre/30 bg-ochre/5">
          <div className="flex items-center gap-2 text-ochre mb-2">
            <AlertTriangle className="w-4 h-4" />
            <h3 className="text-sm font-semibold">{warnings.length} 项提醒（不阻断评估，但影响覆盖范围）</h3>
          </div>
          <ul className="space-y-1.5">
            {warnings.map((issue, idx) => (
              <li key={`${issue.code}-${idx}`} className="flex items-start gap-2 text-sm text-ink-light">
                <span className="mt-0.5 px-1.5 py-0.5 rounded bg-ochre/10 text-ochre text-xs font-medium flex-shrink-0">
                  {CODE_LABELS[issue.code]}
                </span>
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
