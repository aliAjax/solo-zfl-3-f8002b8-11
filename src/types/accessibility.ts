// 无障碍通路评估 —— 数据模型

export type SurfaceType =
  | 'paved' // 硬化铺装（沥青/混凝土/平整石板）
  | 'tile' // 地砖/透水砖
  | 'brick' // 砖块/鹅卵石路面
  | 'gravel' // 碎石/土路
  | 'grass'; // 草坪/松软地面

export type LightingType = 'full' | 'partial' | 'none'; // 照明：充足 / 局部 / 无

/**
 * 通行方向
 * both  = 双向
 * oneway = 单向，仅可从 from 前往 to
 */
export type DirectionType = 'both' | 'oneway';

export type NodeKind = 'entrance' | 'junction' | 'bench';

export interface NetworkNode {
  id: string;
  name: string;
  kind: NodeKind;
  lat: number;
  lng: number;
  /** kind === 'bench' 时，关联的长椅档案 id */
  benchId?: string;
}

export interface Trail {
  id: string;
  name?: string;
  from: string; // NetworkNode.id
  to: string; // NetworkNode.id
  length: number; // 长度（米）
  slope: number; // 坡度百分比，如 5 表示 5%；取绝对值
  width: number; // 有效通行宽度（米）
  surface: SurfaceType;
  steps: number; // 台阶数量（连续台阶），0 表示无
  lighting: LightingType;
  direction: DirectionType;
}

export type ModeId = 'wheelchair' | 'walker' | 'stroller';

export interface ModeThresholds {
  id: ModeId;
  label: string;
  description: string;
  maxSlope: number; // 最大可接受坡度（%）
  minWidth: number; // 最小可接受净宽（米）
  maxSteps: number; // 最大可接受台阶数
  allowedSurfaces: SurfaceType[]; // 可通行路面
  requireLighting: boolean; // 是否要求有照明（夜间/安全阈值）
  /** 分级用：坡度“吃力”线（%） */
  hardSlope: number;
  /** 分级用：宽度“勉强”线（米） */
  tightWidth: number;
}

export type IssueLevel = 'error' | 'warning';
export type IssueCode =
  | 'missing_endpoint'
  | 'extreme_value'
  | 'duplicate_edge'
  | 'oneway_conflict'
  | 'orphan_node'
  | 'entrance_broken'
  | 'bench_unhooked'
  | 'dangling_bench_ref'
  | 'duplicate_bench_hook';

export interface NetworkIssue {
  level: IssueLevel;
  code: IssueCode;
  trailId?: string;
  nodeId?: string;
  benchId?: string;
  message: string;
}

/** 某一段（一条步道在一条路径中的快照）分级 */
export type SegmentGrade = 'easy' | 'moderate' | 'hard' | 'blocked';

export interface PathSegment {
  trailId: string;
  from: string;
  to: string;
  reverse: boolean; // 是否逆着 from->to 方向通行（仅双向步道可能）
  length: number;
  slope: number;
  width: number;
  surface: SurfaceType;
  steps: number;
  lighting: LightingType;
  grades: {
    slope: SegmentGrade;
    width: SegmentGrade;
    risk: SegmentGrade; // 路面 + 台阶 + 照明综合风险
  };
  worst: SegmentGrade;
}

export interface ResponsiblePath {
  entranceId: string;
  entranceName: string;
  nodeIds: string[]; // 含起点入口与终点长椅节点
  trailIds: string[];
  segments: PathSegment[];
  length: number; // 总长（米）
  riskLevel: SegmentGrade; // 整条路径综合分级（不含 blocked）
  cost: number; // 寻路代价（用于选择责任路径）
}

export type RejectReasonCode =
  | 'no_entrance_path'
  | 'slope_too_steep'
  | 'width_too_narrow'
  | 'steps_present'
  | 'surface_unusable'
  | 'dark_segment'
  | 'oneway_barrier'
  | 'bench_not_on_network';

export interface RejectReason {
  code: RejectReasonCode;
  label: string;
  /** 造成阻挡的步道 id（去重，按关键程度排序） */
  trailIds: string[];
}

/** 一张长椅在某一套阈值下的评估结果 */
export interface BenchAccessResult {
  benchId: string;
  nodeId?: string;
  mode: ModeId;
  reachable: boolean;
  /** 可达时的责任路径（代价最低的一条） */
  path?: ResponsiblePath;
  /** 其他入口的备用路径数量 */
  alternativeCount: number;
  /** 不可达原因（可多因叠加） */
  reasons: RejectReason[];
  /**
   * 关键断点：
   * - 不可达时：造成阻挡的步道（修复后即可达，来自最小修复组合）
   * - 可达时：责任路径的“桥接步道”——一旦关闭，该长椅将由可达变为不可达
   */
  criticalTrailIds: string[];
  /** 建议的最小修复组合（基线网络） */
  minRepair?: RepairCombo;
}

export type RepairActionType =
  | 'widen'
  | 'flatten_slope'
  | 'add_ramp'
  | 'resurface'
  | 'add_lighting'
  | 'open_reverse';

export interface RepairAction {
  trailId: string;
  action: RepairActionType;
  label: string;
  cost: number; // 修复代价指数（越小越省事）
}

export interface RepairCombo {
  actions: RepairAction[];
  totalCost: number;
  viaEntranceId: string;
  /** 修复后路径经过的步道 */
  trailIds: string[];
}

export interface ClosureImpact {
  closedTrailId: string;
  newlyUnreachable: string[]; // 由可达变为不可达的长椅 id
  rerouted: string[]; // 仍可达但责任路径改变的长椅 id
  /** 关闭期间恢复全部受影响长椅所需的最小修复 */
  minRepair?: RepairCombo;
}

export interface AccessSnapshot {
  version: 1;
  evaluatedAt: string;
  mode: ModeId;
  networkFingerprint: string;
  closures: string[];
  entranceCount: number;
  summary: {
    total: number;
    reachable: number;
    unreachable: number;
    unhooked: number;
  };
  results: Record<ModeId, BenchAccessResult[]>;
  /** 基线（无关闭）每张被关闭步道影响的长椅，用于一键模拟 */
  /** 每个模式各自的关闭影响（单步道关闭分析随当前通行模式切换） */
  closureImpacts: Record<ModeId, ClosureImpact[]>;
  issues: NetworkIssue[];
  evaluated: boolean;
}

export const SURFACE_LABELS: Record<SurfaceType, string> = {
  paved: '硬化铺装',
  tile: '地砖',
  brick: '砖石/鹅卵石',
  gravel: '碎石/土路',
  grass: '草坪/软地',
};

export const LIGHTING_LABELS: Record<LightingType, string> = {
  full: '照明充足',
  partial: '局部照明',
  none: '无照明',
};

export const DIRECTION_LABELS: Record<DirectionType, string> = {
  both: '双向',
  oneway: '单向',
};

export const GRADE_LABELS: Record<SegmentGrade, string> = {
  easy: '平缓',
  moderate: '注意',
  hard: '吃力',
  blocked: '阻断',
};

export const REASON_LABELS: Record<RejectReasonCode, string> = {
  no_entrance_path: '与任何入口之间不存在连通路径',
  slope_too_steep: '坡度超过阈值',
  width_too_narrow: '有效宽度不足',
  steps_present: '存在无法通过的台阶',
  surface_unusable: '路面无法通行',
  dark_segment: '路段无照明',
  oneway_barrier: '单向通行方向阻挡',
  bench_not_on_network: '长椅未挂接到路网节点',
};

export const REPAIR_ACTION_LABELS: Record<RepairActionType, string> = {
  widen: '拓宽路面',
  flatten_slope: '降坡改造',
  add_ramp: '增设坡道',
  resurface: '重铺路面',
  add_lighting: '增设照明',
  open_reverse: '开放对向通行',
};

/** 三套通行阈值 */
export const MODE_THRESHOLDS: Record<ModeId, ModeThresholds> = {
  // 轮椅：参照无障碍通行常用尺度（净宽 ≥1.2m、坡度 ≤8%、无台阶、仅硬质平整路面、需照明）
  wheelchair: {
    id: 'wheelchair',
    label: '轮椅',
    description: '净宽≥1.2m · 坡度≤8% · 无台阶 · 硬质平整路面 · 需照明',
    maxSlope: 8,
    minWidth: 1.2,
    maxSteps: 0,
    allowedSurfaces: ['paved', 'tile'],
    requireLighting: true,
    hardSlope: 5,
    tightWidth: 1.5,
  },
  // 助行器：可上极短缓坡（≤12%）、可接受 1 级台阶、净宽≥0.9m、砖石路可通行
  walker: {
    id: 'walker',
    label: '助行器',
    description: '净宽≥0.9m · 坡度≤12% · 至多1级台阶 · 硬质/砖石路面 · 需照明',
    maxSlope: 12,
    minWidth: 0.9,
    maxSteps: 1,
    allowedSurfaces: ['paved', 'tile', 'brick'],
    requireLighting: true,
    hardSlope: 8,
    tightWidth: 1.1,
  },
  // 婴童车：可经缓坡（≤10%）、可上下 3 级以内台阶、碎石可推行、照明仅作风险提示
  stroller: {
    id: 'stroller',
    label: '婴童车',
    description: '净宽≥0.8m · 坡度≤10% · 至多3级台阶 · 含碎石路 · 照明不强制',
    maxSlope: 10,
    minWidth: 0.8,
    maxSteps: 3,
    allowedSurfaces: ['paved', 'tile', 'brick', 'gravel'],
    requireLighting: false,
    hardSlope: 6,
    tightWidth: 1.0,
  },
};

// —— 极值校验边界 ——
export const TRAIL_LIMITS = {
  length: { min: 0.5, max: 2000 },
  slope: { min: 0, max: 40 },
  width: { min: 0.3, max: 20 },
  steps: { min: 0, max: 500 },
};
