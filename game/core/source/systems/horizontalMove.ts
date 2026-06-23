/**
 * 横向移动 + 墙体滑行 helper —— 任何 mover（玩家 / 敌人 / Boss）共享。
 *
 * 行为：先尝试整体移动到目标位置；被挡住时退化成沿单轴滑行（先 X 后 Z）；
 * 都不行就停在原地。这套"挡住就沿墙滑"是 player.ts 原有逻辑，本 helper
 * 把它从 player 抽出来给敌人 / Boss 复用。
 *
 * **不处理**：
 *   - 重力 / y 跟随（调用方自己处理）
 *   - 地图边界 clamp（已经由 applyMovement3D 或 mover 自己 clamp 过）
 *   - 攀爬 / 跳跃等 mover 特有逻辑
 */
import { isBlockedHorizontallyAt, type LevelGeometry } from './levelGeometry.ts';

export interface HorizontalMoveOptions {
  /** mover 横向碰撞半径，默认沿用 isBlockedHorizontallyAt 默认值（PLAYER_RADIUS=0.45）。 */
  radius?: number;
  /** 是否把 climb_ 攀爬体也算实体阻挡。玩家蹬墙释放窗口内传 false，敌人/Boss 一律 true。 */
  includeClimb?: boolean;
}

/**
 * 沿 (oldX,oldZ)→(desiredX,desiredZ) 分段采样（≤0.2/步，防穿薄墙），
 * 每个采样点查 isBlockedHorizontallyAt。ramp 侧/端面阻挡已并入该函数（位置式判定），
 * 故此处不再需要单独的 ramp 轨迹穿越检测。
 */
function canMoveAlong(
  geo: LevelGeometry,
  oldX: number,
  oldZ: number,
  desiredX: number,
  desiredZ: number,
  feetY: number,
  includeClimb: boolean,
  radius: number | undefined,
): boolean {
  const dx = desiredX - oldX;
  const dz = desiredZ - oldZ;
  const distance = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(distance / 0.2));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = oldX + dx * t;
    const z = oldZ + dz * t;
    if (isBlockedHorizontallyAt(geo, x, z, feetY, includeClimb, radius)) return false;
  }
  return true;
}

/**
 * mover 已嵌在实体内时，绕当前点做径向搜索找最近的无阻挡落点（8 方向、半径由近到远）。
 * 返回第一个未被挡的点；全被挡返回 null（极端被完全包裹场景，调用方原地不动）。
 * 目的：朝"最近的外侧"推出去，避免沿玩家朝向越陷越深。
 */
function findNearestEscape(
  x: number,
  z: number,
  blocked: (x: number, z: number) => boolean,
): { x: number; z: number } | null {
  const radii = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0];
  const dirs = 8;
  for (const r of radii) {
    for (let i = 0; i < dirs; i++) {
      const a = (i / dirs) * Math.PI * 2;
      const cx = x + Math.cos(a) * r;
      const cz = z + Math.sin(a) * r;
      if (!blocked(cx, cz)) return { x: cx, z: cz };
    }
  }
  return null;
}

/**
 * 把 mover 从 (oldX, oldZ) 移到 (desiredX, desiredZ)，遇到 col_/wall_ 沿墙滑行。
 *
 * 返回最终落点（已应用阻挡）。调用方负责把结果写回 mover.x / mover.z。
 *
 * @param geo      当前关卡几何（engine.geo / ctx.geo）
 * @param oldX     当前位置 X
 * @param oldZ     当前位置 Z
 * @param desiredX 想去的位置 X
 * @param desiredZ 想去的位置 Z
 * @param feetY    mover 脚的 y（用于 isBlockedHorizontallyAt 判定迈步 / 头顶规则）
 */
export function tryMoveHorizontally(
  geo: LevelGeometry,
  oldX: number,
  oldZ: number,
  desiredX: number,
  desiredZ: number,
  feetY: number,
  options: HorizontalMoveOptions = {},
): { x: number; z: number } {
  const includeClimb = options.includeClimb ?? true;
  const radius = options.radius;
  const blocked = (x: number, z: number): boolean =>
    isBlockedHorizontallyAt(geo, x, z, feetY, includeClimb, radius);

  // 脱困：当前位置已嵌在实体内（出生点落在实体 / 残留旧存档等绕过碰撞导致）。
  // 此时常规路径采样会因"起点就被挡"而每个方向都失败 → 永久卡死。
  // 先挑一个"终点未被挡"的相邻候选把 mover 救出去；若三者都被挡，则做径向搜索
  // 找最近的无阻挡出口（避免直接放行 desired 把玩家越推越深）；彻底找不到才原地不动。
  if (blocked(oldX, oldZ)) {
    if (!blocked(desiredX, desiredZ)) return { x: desiredX, z: desiredZ };
    if (!blocked(desiredX, oldZ)) return { x: desiredX, z: oldZ };
    if (!blocked(oldX, desiredZ)) return { x: oldX, z: desiredZ };
    const escape = findNearestEscape(oldX, oldZ, blocked);
    return escape ?? { x: oldX, z: oldZ };
  }

  // Path 1: 整体直走
  if (canMoveAlong(geo, oldX, oldZ, desiredX, desiredZ, feetY, includeClimb, radius)) {
    return { x: desiredX, z: desiredZ };
  }
  // Path 2: 沿 Z 滑行（保留新 X，旧 Z）
  if (canMoveAlong(geo, oldX, oldZ, desiredX, oldZ, feetY, includeClimb, radius)) {
    return { x: desiredX, z: oldZ };
  }
  // Path 3: 沿 X 滑行（旧 X，保留新 Z）
  if (canMoveAlong(geo, oldX, oldZ, oldX, desiredZ, feetY, includeClimb, radius)) {
    return { x: oldX, z: desiredZ };
  }
  // Path 4: 全方向被挡 → 原地不动
  return { x: oldX, z: oldZ };
}
