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

const impactT11 = snapshot.closureImpacts.wheelchair.find((c) => c.closedTrailId === 't11')!;
assert(impactT11.newlyUnreachable.includes('bench-001'), '关闭影响分析：t11 新增 bench-001 不可达');
assert(impactT11.minRepair !== undefined, '关闭影响给出最小临时修复');

// 5. 关闭 t1：经过广场的长椅改道或不可达
const impactT1 = snapshot.closureImpacts.wheelchair.find((c) => c.closedTrailId === 't1')!;
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

// ===== 回归：三处联动修复 =====

// R1. 单步道关闭影响按模式区分：t9 西门里弄
//   轮椅基线 bench-003 本就不可达 → 关闭 t9 不应新增不可达
//   助行器基线 bench-003 经 t9 可达，t10 宽 0.7<0.9 走不了 → 关闭 t9 后新增不可达
const imWcT9 = snapshot.closureImpacts.wheelchair.find((c) => c.closedTrailId === 't9')!;
const imWkT9 = snapshot.closureImpacts.walker.find((c) => c.closedTrailId === 't9')!;
assert(
  !imWcT9.newlyUnreachable.includes('bench-003'),
  '关闭影响-轮椅：t9 不新增 bench-003（基线已不可达）',
);
assert(
  imWkT9.newlyUnreachable.includes('bench-003'),
  '关闭影响-助行器：t9 关闭后 bench-003 新增不可达（不再沿用轮椅结果）',
);
assert(
  Array.isArray(snapshot.closureImpacts.stroller) && snapshot.closureImpacts.stroller.length === mockTrails.length,
  '三模式均有完整关闭影响分析',
);

// R2. 可达长椅也要有关键断点
//   bench-001 轮椅责任路径走 [t11,t1]；t11 关闭后无路可达 → 关键断点
//   t1 关闭时仍可自滨江入口经 t7→t8→t5→t3→t11 抵达 → t1 不算关键断点（只改道）
const b001crit = wc.get('bench-001')!.criticalTrailIds;
assert(b001crit.includes('t11'), `可达长椅 bench-001 标出关键断点 t11（实际 ${b001crit.join(',')}）`);
assert(!b001crit.includes('t1'), 'bench-001 的 t1 有滨江替代路线，不是关键断点（关闭仅改道）');
//   bench-006 有滨江/东门两条通路，但 t6 是进入该节点的唯一步道
const b006crit = wc.get('bench-006')!.criticalTrailIds;
assert(b006crit.includes('t6'), `bench-006 关键断点含唯一入口步道 t6（实际 ${b006crit.join(',')}）`);
assert(!b006crit.includes('t8'), 'bench-006 经 t8 的滨江段有东门替代，t8 不是关键断点');
//   关键断点与关闭影响一致：criticalTrailIds 中的步道关闭时必然新增不可达
wc.forEach((r) => {
  if (!r.reachable) return;
  r.criticalTrailIds.forEach((tid) => {
    const impact = snapshot.closureImpacts.wheelchair.find((c) => c.closedTrailId === tid)!;
    assert(
      impact.newlyUnreachable.includes(r.benchId),
      `一致性：${r.benchId} 关键断点 ${tid} 关闭后确实新增不可达`,
    );
  });
});

// R3. 同一长椅重复挂接多个节点必须在保存前拦住（错误级）
const dupHookNodes: NetworkNode[] = [
  ...mockNodes,
  { id: 'dup-node', name: '另一个梧桐节点', kind: 'bench', lat: 31.25, lng: 121.47, benchId: 'bench-001' },
];
const dupHookIssues = validateNetwork(dupHookNodes, mockTrails, mockBenches);
const dupHook = dupHookIssues.filter((i) => i.code === 'duplicate_bench_hook');
assert(dupHook.length === 1 && dupHook[0].level === 'error', '重复挂接报 1 项错误级问题');
assert(dupHook[0].benchId === 'bench-001' && dupHook[0].nodeId === 'dup-node', '重复挂接问题指向后保存的节点与长椅');
// 未重复挂接时不误报
assert(!validateNetwork(mockNodes, mockTrails, mockBenches).some((i) => i.code === 'duplicate_bench_hook'), '正常路网无重复挂接误报');

// 三模式的可达/路径/修复彼此自洽：修复组合应用后必须真的可达
(['wheelchair', 'walker', 'stroller'] as ModeId[]).forEach((m) => {
  snapshot.results[m].forEach((r) => {
    if (r.reachable || !r.minRepair) return;
    const repaired = new Set(r.minRepair.trailIds);
    assert(repaired.size > 0, `${m}/${r.benchId}：最小修复路径非空`);
    // 修复路径上每条步道都必须存在且修复动作覆盖其全部不达标项
    r.minRepair.trailIds.forEach((tid) => {
      assert(mockTrails.some((t) => t.id === tid), `${m}/${r.benchId}：修复步道 ${tid} 存在`);
    });
    const actions = new Set(r.minRepair.actions.map((a) => `${a.trailId}:${a.action}`));
    r.reasons.forEach((reason) => {
      reason.trailIds.forEach((tid) => {
        const expected = {
          slope_too_steep: 'flatten_slope',
          width_too_narrow: 'widen',
          steps_present: 'add_ramp',
          surface_unusable: 'resurface',
          dark_segment: 'add_lighting',
          oneway_barrier: 'open_reverse',
        } as Record<string, string>;
        const action = expected[reason.code];
        if (action) {
          assert(
            actions.has(`${tid}:${action}`),
            `${m}/${r.benchId}：原因 ${reason.code} 与修复动作 ${action}(${tid}) 一致`,
          );
        }
      });
    });
  });
});

console.log(`\n${failures === 0 ? '全部通过' : `${failures} 项失败`}`);
process.exit(failures === 0 ? 0 : 1);
