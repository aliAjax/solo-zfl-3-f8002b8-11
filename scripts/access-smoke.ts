import { mockBenches } from '../src/data/mockBenches';
import { mockNodes, mockTrails } from '../src/data/mockNetwork';
import { evaluateAll, evaluateMode, validateNetwork } from '../src/utils/accessibility';
import type { ModeId, NetworkNode, Trail } from '../src/types/accessibility';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

const input = { nodes: mockNodes, trails: mockTrails, benches: mockBenches };

// 1. 基线三模式
const snapshot = evaluateAll(input, []);
const benchName = (id: string) => mockBenches.find((b) => b.id === id)?.name ?? id;

(['wheelchair', 'walker', 'stroller'] as ModeId[]).forEach((m) => {
  console.log(`\n== ${m} ==`);
  snapshot.results[m].forEach((r) => {
    console.log(
      `  ${benchName(r.benchId)}: ${r.reachable ? '可达' : '不可达'}`,
      r.path ? `via ${r.path.entranceName} ${r.path.length}m 风险=${r.path.riskLevel}` : '',
      !r.reachable ? `原因=${r.reasons.map((x) => x.code).join(',')} 修复=${r.minRepair?.actions.map((a) => a.action).join('+')}` : '',
    );
  });
});

const wc = new Map(snapshot.results.wheelchair.map((r) => [r.benchId, r]));
const wk = new Map(snapshot.results.walker.map((r) => [r.benchId, r]));
const st = new Map(snapshot.results.stroller.map((r) => [r.benchId, r]));

assert(wc.get('bench-003')!.reachable === false, '轮椅：bench-003 不可达（碎石窄路）');
assert(wc.get('bench-001')!.reachable === true, '轮椅：bench-001 经广场可达');
assert(wc.get('bench-001')!.path!.trailIds.includes('t11'), '轮椅：bench-001 责任路径走 t11 梧桐道而非碎石径');
assert(wc.get('bench-002')!.reachable === true, '轮椅：bench-002 经滨江入口可达');
assert(wc.get('bench-006')!.reachable === true, '轮椅：bench-006 可达（t5 宽1.5>1.2 坡6<8）');
const wcReachable = snapshot.results.wheelchair.filter((r) => r.reachable).length;
assert(wcReachable === 5, `轮椅基线可达 5 张（实际 ${wcReachable}）`);

assert(wk.get('bench-003')!.reachable === true, '助行器：bench-003 经西门里弄可达（宽1.1≥0.9，砖面，1级台阶）');
assert(st.get('bench-003')!.reachable === true, '婴童车：bench-003 可达');

// bench-006 婴童车：经 t8? t8 是 oneway node-b002 -> jnc-campus，从滨江入口到 b006 可顺向走
const b006st = st.get('bench-006')!;
assert(b006st.reachable === true, '婴童车：bench-006 可达');

// 2. 责任路径多段分级
const b001path = wc.get('bench-001')!.path!;
assert(b001path.segments.length === 2, `bench-001 轮椅路径 2 段（实际 ${b001path.segments.length}）`);
assert(b001path.segments.every((s) => s.grades), '每段都有坡度/宽度/风险分级');

// 3. 最小修复组合
const repair = wc.get('bench-003')!.minRepair!;
assert(repair.actions.length >= 3, `bench-003 轮椅最小修复至少 3 项（实际 ${repair.actions.map((a) => a.action).join('+')}）`);
assert(repair.actions.some((a) => a.action === 'widen'), '修复含拓宽');
assert(repair.actions.some((a) => a.action === 'resurface'), '修复含重铺路面');
assert(repair.actions.some((a) => a.action === 'add_ramp'), '修复含增设坡道');
assert(!repair.actions.some((a) => a.action === 'add_lighting'), '最小修复走 t9（局部照明），不需要增设照明');

// 强制只留黑暗的 t10 作为入口连接时，轮椅最小修复必须包含增设照明
const darkOnly = evaluateMode(
  { nodes: mockNodes, trails: mockTrails.filter((t) => t.id !== 't9'), benches: mockBenches },
  'wheelchair',
);
const b003dark = darkOnly.find((r) => r.benchId === 'bench-003')!;
assert(b003dark.minRepair?.actions.some((a) => a.action === 'add_lighting') === true, '仅剩无照明 t10 时修复含增设照明');
assert(b003dark.minRepair?.actions.some((a) => a.action === 'flatten_slope') === true, 't10 坡9% 超轮椅阈值，修复含降坡');

// 4. 关闭 t11：bench-001 轮椅应变不可达；b003 影响
const closedT11 = evaluateMode({ ...input, closedTrailIds: ['t11'] }, 'wheelchair');
const b001closed = closedT11.find((r) => r.benchId === 'bench-001')!;
assert(b001closed.reachable === false, '关闭 t11 后 bench-001 轮椅不可达（唯一自由通路被切断）');

const impactT11 = snapshot.closureImpacts.find((c) => c.closedTrailId === 't11')!;
assert(impactT11.newlyUnreachable.includes('bench-001'), '关闭影响分析：t11 新增 bench-001 不可达');
assert(impactT11.minRepair !== undefined, '关闭影响给出最小临时修复');

// 5. 关闭 t1：经过广场的长椅改道或不可达
const impactT1 = snapshot.closureImpacts.find((c) => c.closedTrailId === 't1')!;
console.log('关闭 t1 东门主道：新增不可达', impactT1.newlyUnreachable, '改道', impactT1.rerouted);

// 6. 校验拦截
const dupTrail: Trail = { ...mockTrails[0], id: 't-dup', name: '重复东门道' };
const dupIssues = validateNetwork(mockNodes, [...mockTrails, dupTrail], mockBenches);
assert(dupIssues.some((i) => i.code === 'duplicate_edge' && i.level === 'error'), '重复双向边被拦住');

const conflictTrail: Trail = { ...mockTrails[0], id: 't-ow', direction: 'oneway' };
const conflictIssues = validateNetwork(mockNodes, [...mockTrails, conflictTrail], mockBenches);
assert(conflictIssues.some((i) => i.code === 'oneway_conflict'), '双向+单向冲突被拦住');

const missingIssues = validateNetwork(
  mockNodes,
  [...mockTrails, { ...mockTrails[0], id: 't-miss', from: 'nope-x' } as Trail],
  mockBenches,
);
assert(missingIssues.some((i) => i.code === 'missing_endpoint'), '缺端点被拦住');

const extremeIssues = validateNetwork(
  mockNodes,
  [...mockTrails, { ...mockTrails[0], id: 't-ext', to: 'jnc-library', slope: 999 } as Trail],
  mockBenches,
);
assert(extremeIssues.some((i) => i.code === 'extreme_value'), '极值被拦住');

// 互补单向合法
const complementary: Trail[] = [
  { id: 'a', from: 'ent-east', to: 'jnc-plaza', length: 10, slope: 1, width: 2, surface: 'paved', steps: 0, lighting: 'full', direction: 'oneway' },
  { id: 'b', from: 'jnc-plaza', to: 'ent-east', length: 10, slope: 1, width: 2, surface: 'paved', steps: 0, lighting: 'full', direction: 'oneway' },
];
const compNodes: NetworkNode[] = mockNodes;
const compIssues = validateNetwork(compNodes, complementary, mockBenches);
assert(!compIssues.some((i) => i.code === 'oneway_conflict' || i.code === 'duplicate_edge'), '方向互补的两条单向合法');

// 孤立入口 / 未挂接长椅
const orphanIssues = validateNetwork(
  [...mockNodes, { id: 'x', name: '北门', kind: 'entrance', lat: 31.25, lng: 121.46 }],
  mockTrails,
  mockBenches,
);
assert(orphanIssues.some((i) => i.code === 'entrance_broken' && i.level === 'warning'), '悬空入口给警告');

const unhooked = validateNetwork(mockNodes, mockTrails, [...mockBenches, { id: 'bench-999' } as never]);
assert(unhooked.some((i) => i.code === 'bench_unhooked'), '未挂接长椅给警告');

console.log(`\n${failures === 0 ? '全部通过' : `${failures} 项失败`}`);
process.exit(failures === 0 ? 0 : 1);
