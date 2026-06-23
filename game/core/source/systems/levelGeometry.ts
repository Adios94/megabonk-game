/**
 * 关卡 / 碰撞系统 —— 单一权威来源，管理一关的全部静态几何与空间查询。
 *
 * Phase 3 重构：从模块级状态改成 `LevelGeometry` 接口 + 纯函数。
 * 所有查询都把 geo 作为第一参数：
 *   makeLevelGeometry(level?)        —— 构造 (无 level 用内置 Neon Crucible)
 *   getTerrainHeightAt(geo, x, z)    —— 竖直查询 (敌人贴地 / 抛射物 / 出生点)
 *   getSupportHeightAt(geo, x, z, y) —— 玩家可达支撑面（带迈步高度）
 *   isBlockedHorizontallyAt(...)     —— 水平阻挡查询
 *   findClimbAt(...)                 —— 找可抓取的攀爬体
 *
 * 调用方 (player / _move / bossAi / projectiles) 通过 engine.geo / ctx.geo
 * 取得当前关卡几何。GameInstance 持有实例：
 *   - 构造时：从 config.level 生成（无则用 NEON_CRUCIBLE_GEOMETRY 默认）
 *   - reset 时：重新生成
 *
 * 好处：
 *   - 多 GameInstance 安全（HMR 切换关卡不脏状态）
 *   - 测试无需 beforeEach(clearLevel)
 *   - 未来可做关卡热重载 / 多关卡并行
 */

import type { CollisionRect, RampVolume, ClimbVolume, DiscVolume, LevelData } from '../types.ts';
import { STEP_HEIGHT, CLIMB_GRAB_MARGIN } from '../config.ts';

type Rect = readonly [number, number, number, number, number];

/** 实体碰撞盒（col_ + wall_ 统一）。横向阻挡 + 竖直占据区间 [bottomY, topY]。 */
export interface SolidBox {
  cx: number;
  cz: number;
  halfW: number;
  halfD: number;
  bottomY: number;
  topY: number;
}

/** 圆形可站立平台（colcyl_）。footprint 为半径 radius 的圆，竖直区间 [bottomY, topY]。 */
export interface Disc {
  cx: number;
  cz: number;
  radius: number;
  bottomY: number;
  topY: number;
}

/** 一关的全部静态碰撞几何（不可变快照）。 */
export interface LevelGeometry {
  /** 平台矩形（可站立的顶面）。 */
  readonly rects: readonly Rect[];
  /** 可行走的倾斜地面。 */
  readonly ramps: readonly RampVolume[];
  /** 实体盒子（col_ + wall_ 合并），横向阻挡。 */
  readonly solidBoxes: readonly SolidBox[];
  /** 只阻挡投射物的墙体盒子（wall_）。 */
  readonly projectileBoxes: readonly SolidBox[];
  /** 圆形可站立平台（colcyl_）：可站立顶面 + 横向阻挡。 */
  readonly discs: readonly Disc[];
  /** 攀爬体（climb_），走不穿、可攀爬。 */
  readonly climbs: readonly ClimbVolume[];
  /**
   * 所见即所得模式。
   * - true（加载关卡）：盒外无自动斜坡边缘
   * - false（内置 Neon Crucible）：盒外 RAMP_WIDTH 内自动斜坡过渡
   */
  readonly wysiwyg: boolean;
  /**
   * 可选：静态几何的均匀网格广相索引（仅 wysiwyg 加载关卡构建）。
   * 高度/阻挡查询命中网格时只遍历点所在 cell 的候选形体，而非全量数组——
   * 对每帧成百上千次（敌人寻路采样 + 投射物贴地）查询是数量级降本。
   * 结果与全量扫描**完全等价**（候选集是按 footprint+margin 精确插桶的超集，
   * 单 cell 查询即可覆盖所有可能命中点的形体）；不存在时回落到全量数组。
   */
  readonly grid?: GeoGrid;
}

/**
 * 静态几何广相网格。每个形体按"footprint 外扩 margin"的 AABB 插入所有重叠 cell。
 * 由于 margin（1.0）覆盖所有查询用到的半径外扩（player/enemy radius ≤0.45、
 * climb grab margin 0.6），点查询只需取该点所在单 cell 的候选即精确无漏。
 */
class GeoGrid {
  private readonly invCell: number;
  private readonly minX: number;
  private readonly minZ: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly rectCells: Rect[][];
  private readonly rampCells: RampVolume[][];
  private readonly discCells: Disc[][];
  private readonly solidCells: SolidBox[][];
  private readonly climbCells: ClimbVolume[][];

  constructor(
    rects: readonly Rect[],
    ramps: readonly RampVolume[],
    discs: readonly Disc[],
    solidBoxes: readonly SolidBox[],
    climbs: readonly ClimbVolume[],
    cellSize = 8,
    margin = 1.0,
  ) {
    // 1) 求全体 AABB 包围盒。
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    const acc = (cx: number, cz: number, ex: number, ez: number): void => {
      if (cx - ex < minX) minX = cx - ex;
      if (cx + ex > maxX) maxX = cx + ex;
      if (cz - ez < minZ) minZ = cz - ez;
      if (cz + ez > maxZ) maxZ = cz + ez;
    };
    for (const r of rects) acc(r[0], r[1], r[2] + margin, r[3] + margin);
    for (const rm of ramps) { const e = rm.halfSlope + rm.halfPerp + margin; acc(rm.cx, rm.cz, e, e); }
    for (const d of discs) acc(d.cx, d.cz, d.radius + margin, d.radius + margin);
    for (const b of solidBoxes) acc(b.cx, b.cz, b.halfW + margin, b.halfD + margin);
    for (const c of climbs) acc(c.cx, c.cz, c.halfW + margin, c.halfD + margin);

    if (!Number.isFinite(minX)) { minX = 0; minZ = 0; maxX = 0; maxZ = 0; }

    this.invCell = 1 / cellSize;
    this.minX = minX;
    this.minZ = minZ;
    this.cols = Math.max(1, Math.floor((maxX - minX) * this.invCell) + 1);
    this.rows = Math.max(1, Math.floor((maxZ - minZ) * this.invCell) + 1);

    const cellCount = this.cols * this.rows;
    this.rectCells = GeoGrid.alloc(cellCount);
    this.rampCells = GeoGrid.alloc(cellCount);
    this.discCells = GeoGrid.alloc(cellCount);
    this.solidCells = GeoGrid.alloc(cellCount);
    this.climbCells = GeoGrid.alloc(cellCount);

    // 2) 按外扩 AABB 把每个形体插入所覆盖的所有 cell。
    for (const r of rects) this.insert(this.rectCells, r, r[0], r[1], r[2] + margin, r[3] + margin);
    for (const rm of ramps) { const e = rm.halfSlope + rm.halfPerp + margin; this.insert(this.rampCells, rm, rm.cx, rm.cz, e, e); }
    for (const d of discs) this.insert(this.discCells, d, d.cx, d.cz, d.radius + margin, d.radius + margin);
    for (const b of solidBoxes) this.insert(this.solidCells, b, b.cx, b.cz, b.halfW + margin, b.halfD + margin);
    for (const c of climbs) this.insert(this.climbCells, c, c.cx, c.cz, c.halfW + margin, c.halfD + margin);
  }

  private static alloc<T>(n: number): T[][] {
    const a = new Array<T[]>(n);
    for (let i = 0; i < n; i++) a[i] = [];
    return a;
  }

  private insert<T>(cells: T[][], item: T, cx: number, cz: number, ex: number, ez: number): void {
    const x0 = Math.max(0, Math.floor((cx - ex - this.minX) * this.invCell));
    const x1 = Math.min(this.cols - 1, Math.floor((cx + ex - this.minX) * this.invCell));
    const z0 = Math.max(0, Math.floor((cz - ez - this.minZ) * this.invCell));
    const z1 = Math.min(this.rows - 1, Math.floor((cz + ez - this.minZ) * this.invCell));
    for (let zi = z0; zi <= z1; zi++) {
      for (let xi = x0; xi <= x1; xi++) {
        cells[zi * this.cols + xi].push(item);
      }
    }
  }

  private cellIndex(x: number, z: number): number {
    const xi = Math.floor((x - this.minX) * this.invCell);
    const zi = Math.floor((z - this.minZ) * this.invCell);
    if (xi < 0 || xi >= this.cols || zi < 0 || zi >= this.rows) return -1;
    return zi * this.cols + xi;
  }

  rectsAt(x: number, z: number): readonly Rect[] {
    const i = this.cellIndex(x, z);
    return i < 0 ? EMPTY_RECTS : this.rectCells[i];
  }
  rampsAt(x: number, z: number): readonly RampVolume[] {
    const i = this.cellIndex(x, z);
    return i < 0 ? EMPTY_RAMPS : this.rampCells[i];
  }
  discsAt(x: number, z: number): readonly Disc[] {
    const i = this.cellIndex(x, z);
    return i < 0 ? EMPTY_DISCS : this.discCells[i];
  }
  solidBoxesAt(x: number, z: number): readonly SolidBox[] {
    const i = this.cellIndex(x, z);
    return i < 0 ? EMPTY_SOLIDS : this.solidCells[i];
  }
  climbsAt(x: number, z: number): readonly ClimbVolume[] {
    const i = this.cellIndex(x, z);
    return i < 0 ? EMPTY_CLIMBS : this.climbCells[i];
  }
}

const EMPTY_RECTS: readonly Rect[] = [];
const EMPTY_RAMPS: readonly RampVolume[] = [];
const EMPTY_DISCS: readonly Disc[] = [];
const EMPTY_SOLIDS: readonly SolidBox[] = [];
const EMPTY_CLIMBS: readonly ClimbVolume[] = [];

/** 内置 Neon Crucible 几何（缺省关卡 / 单测基线）。 */
const NEON_CRUCIBLE: readonly Rect[] = [
  // Ground floor
  [0, 0, 15, 15, 0],
  [0, -30, 6, 15, 0], [0, 30, 6, 15, 0],
  [30, 0, 15, 6, 0], [-30, 0, 15, 6, 0],
  [15, -15, 5, 5, 0], [-15, -15, 5, 5, 0],
  [15, 15, 5, 5, 0], [-15, 15, 5, 5, 0],
  [0, -50, 8, 5, 0], [0, 50, 8, 5, 0],
  [50, 0, 5, 8, 0], [-50, 0, 5, 8, 0],

  // Mid catwalks (y=2)
  [0, -25, 5, 4, 2], [0, 25, 5, 4, 2],
  [25, 0, 4, 5, 2], [-25, 0, 4, 5, 2],
  [20, -20, 5, 5, 2], [-20, -20, 5, 5, 2],
  [20, 20, 5, 5, 2], [-20, 20, 5, 5, 2],

  // Watchtowers (y=4)
  [0, -40, 5, 5, 4], [0, 40, 5, 5, 4],
  [40, 0, 5, 5, 4], [-40, 0, 5, 5, 4],

  // Nests (y=6)
  [38, -38, 3, 3, 6], [-38, -38, 3, 3, 6],
  [38, 38, 3, 3, 6], [-38, 38, 3, 3, 6],
];

const RAMP_WIDTH = 3;

/** 玩家碰撞体竖直高度 / 水平半径。 */
const PLAYER_BODY_HEIGHT = 1.4;
const PLAYER_RADIUS = 0.45;

/** 虚空高度：脚下没有任何碰撞体积时返回此值，mover 会因此下落。 */
export const VOID_HEIGHT = Number.NEGATIVE_INFINITY;

/** 内置 Neon Crucible 默认几何（无关卡时使用）。 */
export const NEON_CRUCIBLE_GEOMETRY: LevelGeometry = {
  rects: NEON_CRUCIBLE,
  ramps: [],
  solidBoxes: [],
  projectileBoxes: [],
  discs: [],
  climbs: [],
  wysiwyg: false,
};

// ─── 工厂 ─────────────────────────────────────────────────────────────────

/**
 * 从 LevelData 构造一份 LevelGeometry 实例。
 * - 无 level → 返回 NEON_CRUCIBLE_GEOMETRY
 * - 有 level → 进入 wysiwyg=true，col_+wall_ 合并为实体盒
 */
export function makeLevelGeometry(level?: LevelData): LevelGeometry {
  if (!level) return NEON_CRUCIBLE_GEOMETRY;

  const rects: Rect[] = level.collisionRects.map(
    (r) => [r.cx, r.cz, r.halfW, r.halfD, r.height] as Rect,
  );
  const solidBoxes: SolidBox[] = [
    ...level.collisionRects.map((r) => ({
      cx: r.cx, cz: r.cz, halfW: r.halfW, halfD: r.halfD,
      bottomY: r.baseY ?? Number.NEGATIVE_INFINITY,
      topY: r.height,
    })),
    ...(level.walls ?? []).map((w) => ({
      cx: w.cx, cz: w.cz, halfW: w.halfW, halfD: w.halfD,
      bottomY: w.bottomY, topY: w.topY,
    })),
  ];
  const projectileBoxes: SolidBox[] = (level.walls ?? [])
    .filter((w) => w.blockProjectile !== false)
    .map((w) => ({
      cx: w.cx, cz: w.cz, halfW: w.halfW, halfD: w.halfD,
      bottomY: w.bottomY, topY: w.topY,
    }));
  const discs: Disc[] = (level.collisionDiscs ?? []).map((d) => ({
    cx: d.cx, cz: d.cz, radius: d.radius,
    bottomY: d.baseY ?? Number.NEGATIVE_INFINITY,
    topY: d.height,
  }));
  const ramps = level.ramps ?? [];
  const climbs = level.climbVolumes ?? [];
  return {
    rects,
    ramps,
    solidBoxes,
    projectileBoxes,
    discs,
    climbs,
    wysiwyg: true,
    grid: new GeoGrid(rects, ramps, discs, solidBoxes, climbs),
  };
}

/** 圆形平台在 (x,z) 处的顶面高度；圆外返回 null。 */
function discHeightAt(disc: Disc, x: number, z: number): number | null {
  const dx = x - disc.cx;
  const dz = z - disc.cz;
  return dx * dx + dz * dz <= disc.radius * disc.radius ? disc.topY : null;
}

/** (x,z,feetY) 是否被某个圆形平台挡住（圆形 footprint + 与 SolidBox 同一迈步/头顶规则）。 */
function blockedByDiscs(
  discs: readonly Disc[], x: number, z: number, feetY: number, radius: number,
): boolean {
  const headY = feetY + PLAYER_BODY_HEIGHT;
  for (const d of discs) {
    const dx = x - d.cx;
    const dz = z - d.cz;
    const rr = d.radius + radius;
    if (dx * dx + dz * dz > rr * rr) continue;
    if (d.topY - feetY <= STEP_HEIGHT) continue; // 迈步范围内 → 踩上去，不挡
    if (d.bottomY >= headY) continue;            // 高架/头顶 → 从下方穿过
    return true;
  }
  return false;
}

// ─── 竖直查询 ─────────────────────────────────────────────────────────────

/**
 * 斜坡在 (x,z) 处的顶面高度；不在 footprint 内返回 null。
 *
 * Footprint = 以 (cx,cz) 为中心、沿 slopeDir 半长 halfSlope、垂直方向半宽 halfPerp
 * 的旋转矩形。把世界 (x,z) 投影到 slopeDir / 法向得到局部坐标后判定是否在矩形内。
 */
function rampHeightAt(ramp: RampVolume, x: number, z: number): number | null {
  const dx = x - ramp.cx;
  const dz = z - ramp.cz;
  // 投影到 slopeDir（沿坡道方向） + 法向（slopeDir 旋转 90°）
  const sCoord = dx * ramp.slopeDirX + dz * ramp.slopeDirZ;
  const pCoord = dx * (-ramp.slopeDirZ) + dz * ramp.slopeDirX;
  // EPS 容差：旋转坡道在精确边角点处，sCoord/pCoord 因浮点累积可能微超 half*，
  // 不容差会让玩家恰好站在坡顶边角时穿地。
  const EPS = 1e-6;
  if (Math.abs(sCoord) > ramp.halfSlope + EPS || Math.abs(pCoord) > ramp.halfPerp + EPS) return null;
  // t: 0 在低端 (-halfSlope)，1 在高端 (+halfSlope)。clamp 抵消上面 EPS 带来的轻微越界。
  let t = ramp.halfSlope > 0 ? (sCoord + ramp.halfSlope) / (ramp.halfSlope * 2) : 0;
  t = Math.max(0, Math.min(1, t));
  return ramp.lowY + (ramp.highY - ramp.lowY) * t;
}

/**
 * 单个矩形在 (x,z) 处的地表高度贡献。不覆盖返回 null。
 * 非所见即所得模式（内置 Neon Crucible）保留边缘自动斜坡。
 */
function rectHeightAt(rect: Rect, x: number, z: number, wysiwyg: boolean): number | null {
  const [cx, cz, hw, hd, h] = rect;
  const dx = Math.abs(x - cx);
  const dz = Math.abs(z - cz);

  if (dx <= hw && dz <= hd) return h;

  if (!wysiwyg && dx <= hw + RAMP_WIDTH && dz <= hd + RAMP_WIDTH) {
    const edgeDist = Math.max(dx - hw, dz - hd, 0);
    if (edgeDist <= RAMP_WIDTH) return h * (1 - edgeDist / RAMP_WIDTH);
  }
  return null;
}

/**
 * (x,z) 处的最高地表高度（不考虑 mover 当前高度）。
 * 用于敌人贴地、抛射物、出生点。无 col_ 覆盖时回落到 y=0 默认地板（软虚空）。
 * 玩家"掉出关卡 → 复活"语义改由玩家自己读 getSupportHeightAt 判定。
 */
export function getTerrainHeightAt(geo: LevelGeometry, x: number, z: number): number {
  let height = 0; // 统一保底地板，软虚空
  const grid = geo.grid;
  const rects = grid ? grid.rectsAt(x, z) : geo.rects;
  const ramps = grid ? grid.rampsAt(x, z) : geo.ramps;
  const discs = grid ? grid.discsAt(x, z) : geo.discs;
  for (const rect of rects) {
    const h = rectHeightAt(rect, x, z, geo.wysiwyg);
    if (h !== null && h > height) height = h;
  }
  for (const ramp of ramps) {
    const h = rampHeightAt(ramp, x, z);
    if (h !== null && h > height) height = h;
  }
  for (const disc of discs) {
    const h = discHeightAt(disc, x, z);
    if (h !== null && h > height) height = h;
  }
  return height;
}

/**
 * mover 脚下的"支撑面"高度：覆盖 (x,z) 且顶面 ≤ feetY + STEP_HEIGHT 的最高地表。
 *
 * 与 getTerrainHeightAt 的区别：**只返回够得着的面**，比脚高出超过迈步高度的
 * 平台被忽略 —— 因此 mover 能从下方走过高架平台（不再有"空气墙"），
 * 想上高台必须跳到足够高度让其顶面进入迈步范围。
 *
 * 玩家掉出关卡（feetY < -STEP_HEIGHT）时默认地板也不可达 → 返回 VOID_HEIGHT
 * → 玩家进入下落 / FALL_RESPAWN。
 */
export function getSupportHeightAt(geo: LevelGeometry, x: number, z: number, feetY: number): number {
  const limit = feetY + STEP_HEIGHT;
  let best = 0 <= limit ? 0 : VOID_HEIGHT;
  const grid = geo.grid;
  const rects = grid ? grid.rectsAt(x, z) : geo.rects;
  const ramps = grid ? grid.rampsAt(x, z) : geo.ramps;
  const discs = grid ? grid.discsAt(x, z) : geo.discs;
  for (const rect of rects) {
    const h = rectHeightAt(rect, x, z, geo.wysiwyg);
    if (h !== null && h <= limit && h > best) best = h;
  }
  for (const ramp of ramps) {
    const h = rampHeightAt(ramp, x, z);
    if (h !== null && h <= limit && h > best) best = h;
  }
  for (const disc of discs) {
    const h = discHeightAt(disc, x, z);
    if (h !== null && h <= limit && h > best) best = h;
  }
  return best;
}

// ─── 水平查询 ─────────────────────────────────────────────────────────────

/**
 * (x,z,feetY) 是否被某组竖直盒子挡住（统一规则）：
 * - 顶面 ≤ feetY + STEP_HEIGHT：可直接迈上去，不挡（当作台阶/地面）。
 * - 盒子整体在头顶之上（底 ≥ 头）：不挡（可从下方穿过）。
 * - 否则盒子竖直区间与身体重叠 → 挡。
 */
function blockedByAny(
  boxes: readonly SolidBox[], x: number, z: number, feetY: number, radius: number,
): boolean {
  const headY = feetY + PLAYER_BODY_HEIGHT;
  for (const b of boxes) {
    if (
      Math.abs(x - b.cx) <= b.halfW + radius &&
      Math.abs(z - b.cz) <= b.halfD + radius
    ) {
      if (b.topY - feetY <= STEP_HEIGHT) continue; // 迈步范围内 → 踩上去，不挡
      if (b.bottomY >= headY) continue;            // 高架/头顶 → 从下方穿过
      return true;
    }
  }
  return false;
}

/**
 * (x,z,feetY) 是否被某个 ramp 的楔形实体挡住。
 *
 * ramp 是三角棱柱：footprint 内每点从 bottomY 实心填充到该点斜面高度 surfaceY。
 * 与竖直盒同一套"迈步 / 头顶"规则，只是顶面是随 sCoord 变化的斜面高度：
 *  - 斜面顶 ≤ feetY + STEP_HEIGHT：可踩上去（站在斜面上 / 从低端走上斜坡），不挡。
 *  - 楔形整体在头顶之上（底 ≥ 头）：不挡（可从下方穿过）。
 *  - 否则脚陷在斜面下方的实体里 → 挡。这同时覆盖侧面、高/低端面，以及"已在内部"
 *    （位置式判定，不依赖运动轨迹），取代旧的 crossesRampSideFromOutside 轨迹 hack。
 *
 * footprint 用 +radius 外扩（body 半径）；外扩带内 sCoord 用端点高度（clamp）。
 */
function blockedByRamp(
  ramps: readonly RampVolume[], x: number, z: number, feetY: number, radius: number,
): boolean {
  const headY = feetY + PLAYER_BODY_HEIGHT;
  for (const ramp of ramps) {
    const dx = x - ramp.cx;
    const dz = z - ramp.cz;
    const sCoord = dx * ramp.slopeDirX + dz * ramp.slopeDirZ;
    const pCoord = dx * (-ramp.slopeDirZ) + dz * ramp.slopeDirX;
    if (Math.abs(sCoord) > ramp.halfSlope + radius) continue;
    if (Math.abs(pCoord) > ramp.halfPerp + radius) continue;
    // 该点斜面高度（clamp 到端点：footprint 外缘 radius 带内用端点高度，形成端面墙）
    const clampedS = Math.max(-ramp.halfSlope, Math.min(ramp.halfSlope, sCoord));
    const t = ramp.halfSlope > 0 ? (clampedS + ramp.halfSlope) / (ramp.halfSlope * 2) : 0;
    const surfaceY = ramp.lowY + (ramp.highY - ramp.lowY) * t;
    const bottomY = Math.min(ramp.lowY, ramp.highY);
    if (surfaceY - feetY <= STEP_HEIGHT) continue; // 斜面在迈步内 → 踩上去，不挡
    if (bottomY >= headY) continue;                // 楔形在头顶之上 → 从下方穿过
    return true;
  }
  return false;
}

/**
 * 横向是否被挡：col_/wall_ 实体盒永远挡；ramp_ 楔形体侧/端面也挡（防钻入三角体）。
 * climb_ 攀爬体平时也挡（走不穿）；调用方在蹬墙释放窗口内传 includeClimb=false 放行，
 * 使"跳+方向"能离开 climb 范围下落。
 */
export function isBlockedHorizontallyAt(
  geo: LevelGeometry,
  x: number, z: number, feetY: number,
  includeClimb = true, radius = PLAYER_RADIUS,
): boolean {
  const grid = geo.grid;
  const solidBoxes = grid ? grid.solidBoxesAt(x, z) : geo.solidBoxes;
  const discs = grid ? grid.discsAt(x, z) : geo.discs;
  const ramps = grid ? grid.rampsAt(x, z) : geo.ramps;
  const climbs = grid ? grid.climbsAt(x, z) : geo.climbs;
  if (blockedByAny(solidBoxes, x, z, feetY, radius)) return true;
  if (discs.length > 0 && blockedByDiscs(discs, x, z, feetY, radius)) return true;
  if (ramps.length > 0 && blockedByRamp(ramps, x, z, feetY, radius)) return true;
  if (includeClimb && climbs.length > 0) {
    for (const c of climbs) {
      if (
        Math.abs(x - c.cx) <= c.halfW + radius &&
        Math.abs(z - c.cz) <= c.halfD + radius
      ) {
        if (c.topY - feetY <= STEP_HEIGHT) continue;
        if (c.bottomY >= feetY + PLAYER_BODY_HEIGHT) continue;
        return true;
      }
    }
  }
  return false;
}

/**
 * 投射物是否撞到 wall_ 体积。
 *
 * 与 mover 的 isBlockedHorizontallyAt 不同：投射物不使用"迈步/头顶穿过"规则，
 * 只要弹体高度落在 wall_ 竖直区间内且水平 footprint 相交，就视为撞墙。
 */
export function isProjectileBlockedAt(
  geo: LevelGeometry,
  x: number,
  y: number,
  z: number,
  radius: number,
): boolean {
  const r = Math.max(0, radius);
  for (const b of geo.projectileBoxes) {
    if (
      Math.abs(x - b.cx) <= b.halfW + r &&
      Math.abs(z - b.cz) <= b.halfD + r &&
      y >= b.bottomY - r &&
      y <= b.topY + r
    ) {
      return true;
    }
  }
  return false;
}

/** 找到 (x,z,feetY) 处可抓取的攀爬体；无则返回 null。 */
export function findClimbAt(geo: LevelGeometry, x: number, z: number, feetY: number): ClimbVolume | null {
  const climbs = geo.grid ? geo.grid.climbsAt(x, z) : geo.climbs;
  for (const c of climbs) {
    if (
      Math.abs(x - c.cx) <= c.halfW + CLIMB_GRAB_MARGIN &&
      Math.abs(z - c.cz) <= c.halfD + CLIMB_GRAB_MARGIN &&
      feetY >= c.bottomY - 0.5 &&
      feetY <= c.topY + 0.2
    ) {
      return c;
    }
  }
  return null;
}

// 使用 CollisionRect 抑制 unused import lint（保留显式 import 以便文件做类型导出）
export type { CollisionRect };
