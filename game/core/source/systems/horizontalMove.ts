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
import { isBlockedHorizontallyAt, type LevelGeometry } from './collision.ts';

const DEFAULT_MOVE_RADIUS = 0.45;
const MOVER_BODY_HEIGHT = 1.4;
const RAMP_SIDE_VERTICAL_TOLERANCE = 0.25;

export interface HorizontalMoveOptions {
  /** mover 横向碰撞半径，默认沿用 isBlockedHorizontallyAt 默认值（PLAYER_RADIUS=0.45）。 */
  radius?: number;
  /** 是否把 climb_ 攀爬体也算实体阻挡。玩家蹬墙释放窗口内传 false，敌人/Boss 一律 true。 */
  includeClimb?: boolean;
}

function rampTopAtSlopeCoord(
  ramp: LevelGeometry['ramps'][number],
  sCoord: number,
): number {
  const t = ramp.halfSlope > 0 ? (sCoord + ramp.halfSlope) / (ramp.halfSlope * 2) : 0;
  return ramp.lowY + (ramp.highY - ramp.lowY) * Math.max(0, Math.min(1, t));
}

function crossesRampSideFromOutside(
  geo: LevelGeometry,
  oldX: number,
  oldZ: number,
  desiredX: number,
  desiredZ: number,
  feetY: number,
  radius: number,
): boolean {
  const headY = feetY + MOVER_BODY_HEIGHT;
  for (const ramp of geo.ramps) {
    const oldDx = oldX - ramp.cx;
    const oldDz = oldZ - ramp.cz;
    const newDx = desiredX - ramp.cx;
    const newDz = desiredZ - ramp.cz;
    const oldS = oldDx * ramp.slopeDirX + oldDz * ramp.slopeDirZ;
    const newS = newDx * ramp.slopeDirX + newDz * ramp.slopeDirZ;
    if (
      Math.max(oldS, newS) < -ramp.halfSlope - radius ||
      Math.min(oldS, newS) > ramp.halfSlope + radius
    ) {
      continue;
    }

    const oldP = oldDx * (-ramp.slopeDirZ) + oldDz * ramp.slopeDirX;
    const newP = newDx * (-ramp.slopeDirZ) + newDz * ramp.slopeDirX;
    for (const side of [-1, 1] as const) {
      const oldOutside = side * oldP > ramp.halfPerp + radius;
      const newInsideOrTouching = side * newP <= ramp.halfPerp + radius;
      if (!oldOutside || !newInsideOrTouching) continue;

      const oldDelta = side * oldP - ramp.halfPerp;
      const newDelta = side * newP - ramp.halfPerp;
      const denom = oldDelta - newDelta;
      const t = Math.abs(denom) > 1e-6 ? Math.max(0, Math.min(1, oldDelta / denom)) : 1;
      const crossS = oldS + (newS - oldS) * t;
      if (Math.abs(crossS) > ramp.halfSlope + radius) continue;

      const sideBottomY = ramp.sideWalls?.[0]?.bottomY ?? Math.min(ramp.lowY, ramp.highY);
      const sideTopY = rampTopAtSlopeCoord(ramp, crossS);
      if (sideBottomY >= headY) continue;
      if (feetY > sideTopY + RAMP_SIDE_VERTICAL_TOLERANCE) continue;
      return true;
    }
  }
  return false;
}

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
  const moveRadius = radius ?? DEFAULT_MOVE_RADIUS;
  const dx = desiredX - oldX;
  const dz = desiredZ - oldZ;
  const distance = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(distance / 0.2));
  let prevX = oldX;
  let prevZ = oldZ;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = oldX + dx * t;
    const z = oldZ + dz * t;
    if (crossesRampSideFromOutside(geo, prevX, prevZ, x, z, feetY, moveRadius)) return false;
    if (isBlockedHorizontallyAt(geo, x, z, feetY, includeClimb, radius)) return false;
    prevX = x;
    prevZ = z;
  }
  return true;
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
