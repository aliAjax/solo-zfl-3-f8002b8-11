import type { SegmentGrade, BenchAccessResult, ModeId } from '@/types/accessibility';
import { GRADE_LABELS } from '@/types/accessibility';

export function gradeBadgeClass(grade: SegmentGrade): string {
  switch (grade) {
    case 'easy':
      return 'bg-moss-green/10 text-moss-green';
    case 'moderate':
      return 'bg-ochre/10 text-ochre';
    case 'hard':
      return 'bg-orange-100 text-orange-700';
    case 'blocked':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-warm-beige text-ink-light';
  }
}

export function modeColorClass(mode: ModeId): string {
  if (mode === 'wheelchair') return 'text-moss-green';
  if (mode === 'walker') return 'text-ochre';
  return 'text-blue-600';
}

export function gradeLabel(grade: SegmentGrade): string {
  return GRADE_LABELS[grade];
}

export function worstGrade(results: BenchAccessResult[]): SegmentGrade | null {
  const order: SegmentGrade[] = ['blocked', 'hard', 'moderate', 'easy'];
  const reachable = results.filter((r) => r.path);
  for (const grade of order) {
    if (reachable.some((r) => r.path?.riskLevel === grade)) return grade;
  }
  return null;
}

/** 多段路径中各级别段数统计，用于“多段路径按坡度、宽度和风险分级”展示 */
export function summarizeSegments(result: BenchAccessResult) {
  const segments = result.path?.segments ?? [];
  const tally = (key: 'slope' | 'width' | 'risk') => {
    const out: Record<SegmentGrade, number> = { easy: 0, moderate: 0, hard: 0, blocked: 0 };
    segments.forEach((s) => {
      out[s.grades[key]] += 1;
    });
    return out;
  };
  return { slope: tally('slope'), width: tally('width'), risk: tally('risk'), total: segments.length };
}
