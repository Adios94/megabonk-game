/**
 * AI 行为共享的"按 target 移动"逻辑。
 *
 * 等价于原 `GameInstance.moveEnemy(enemy, dt)` —— 处理速度倍率（charge/dive
 * inherent 加成、curse_tome buff、final swarm boost）+ 边界 clamp + 地形 y 跟随。
 *
 * 阶段 2：横向阻挡接入 tryMoveHorizontally（敌人不再穿 col_/wall_）。
 */
import type { EnemyState } from '../../types.ts';
import type { AiContext } from '../types.ts';
import { tryMoveHorizontally } from '../../systems/horizontalMove.ts';
import { isBlockedHorizontallyAt, getSupportHeightAt } from '../../systems/levelGeometry.ts';
import { getTomePower } from '../../data/tomeProgression.ts';
import { getSlowMultiplier } from '../../systems/statusEffects.ts';
import { FINAL_SWARM_SPEED_MULTIPLIER, STEP_HEIGHT } from '../../config.ts';

const ENEMY_RADIUS = 0.4;
const DROP_MIN_DELTA = STEP_HEIGHT * 1.2;
const DROP_ANGLE_OFFSETS = [0, 0.35, -0.35, 0.7, -0.7];
/** 局部转向避障的试探角度（弧度，左右交替、由窄到宽）。 */
const STEER_OFFSETS = [0.45, -0.45, 0.9, -0.9, 1.4, -1.4];

export function applyMovement(enemy: EnemyState, ctx: AiContext): void {
  const dx = enemy.targetX - enemy.x;
  const dz = enemy.targetZ - enemy.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.1) return;

  let speedMult = 1.0;
  if (enemy.behavior === 'charge') speedMult = 2.0;
  else if (enemy.behavior === 'dive') speedMult = 1.5;

  // Curse tome: 敌人移动加速
  const curseTome = ctx.player.tomes.find(t => t.type === 'curse_tome');
  speedMult *= (1 + getTomePower(curseTome) * 0.1);

  // Final Swarm: 全体 +30% speed
  if (ctx.finalSwarm) {
    speedMult *= FINAL_SWARM_SPEED_MULTIPLIER;
  }

  // 减速状态（麻痹枪 strong_slow / 涟漪等）：乘上有效速度倍率（精英已在施加时按抗性减弱）。
  speedMult *= getSlowMultiplier(enemy);

  const moveSpeed = enemy.speed * speedMult * ctx.dt;
  const actualMove = Math.min(moveSpeed, dist);
  const nx = dx / dist;
  const nz = dz / dist;

  const halfMap = (ctx.mapSize + 10) * 0.5;
  const desiredX = Math.max(-halfMap, Math.min(halfMap, enemy.x + nx * actualMove));
  const desiredZ = Math.max(-halfMap, Math.min(halfMap, enemy.z + nz * actualMove));

  // 飞行单位（gargoyle）忽略所有横向阻挡，直接到位。
  if (enemy.type === 'gargoyle') {
    enemy.x = desiredX;
    enemy.z = desiredZ;
    return;
  }

  // 横向阻挡 + 沿墙滑行（与玩家共用同一套）。半径稍小于玩家，避免敌人挤在墙边。
  let moved = tryMoveHorizontally(
    ctx.geo,
    enemy.x, enemy.z,
    desiredX, desiredZ,
    enemy.y,
    { radius: ENEMY_RADIUS, includeClimb: true },
  );

  // 直奔被完全挡住（连轴向滑行都不前进）→ 局部转向避障：绕基准航向扇形试探，
  // 取"能动且最接近 target"的方向绕过障碍（凸形障碍/拐角有效；凹形/迷宫留待流场）。
  if (moved.x === enemy.x && moved.z === enemy.z) {
    const steered = steerAround(enemy, ctx, nx, nz, actualMove);
    if (steered) {
      moved = steered;
    } else if (ctx.player.y < enemy.y - STEP_HEIGHT) {
      // 仍卡 + 玩家在更低层 → 尝试跳下高差
      if (tryDropDownTowardTarget(enemy, ctx, nx, nz, actualMove)) return;
    }
  }

  enemy.x = moved.x;
  enemy.z = moved.z;

  // 地形 y 跟随（gargoyle 已经 return 了不会到这）。
  // 用 support 语义（只取脚下 STEP_HEIGHT 内可达面），避免被头顶上方的 ramp / 高架平台
  // 顶面从下方错误托起；无可达面时（VOID_HEIGHT）保持原 y，不强行贴地。
  const h = getSupportHeightAt(ctx.geo, enemy.x, enemy.z, enemy.y);
  if (Number.isFinite(h)) {
    enemy.y = h;
  }
}

/**
 * 局部转向避障：直奔 target 被挡时，绕基准航向（朝 target 的方向）扇形试探若干角度，
 * 返回"能前进且落点最接近 target"的位置；都动不了返回 null。
 * 无全局寻路——开阔场景 + 凸形障碍/拐角够用；凹角/迷宫式布局仍可能绕不出（后续上流场）。
 */
function steerAround(
  enemy: EnemyState, ctx: AiContext, nx: number, nz: number, actualMove: number,
): { x: number; z: number } | null {
  const baseAngle = Math.atan2(nz, nx);
  const halfMap = (ctx.mapSize + 10) * 0.5;
  const clamp = (v: number): number => Math.max(-halfMap, Math.min(halfMap, v));
  const tx = enemy.targetX;
  const tz = enemy.targetZ;
  let best: { x: number; z: number } | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const off of STEER_OFFSETS) {
    const a = baseAngle + off;
    const cand = tryMoveHorizontally(
      ctx.geo,
      enemy.x, enemy.z,
      clamp(enemy.x + Math.cos(a) * actualMove),
      clamp(enemy.z + Math.sin(a) * actualMove),
      enemy.y,
      { radius: ENEMY_RADIUS, includeClimb: true },
    );
    if (cand.x === enemy.x && cand.z === enemy.z) continue; // 该航向也动不了
    const dx = tx - cand.x;
    const dz = tz - cand.z;
    const d = dx * dx + dz * dz;
    if (d < bestDist) { bestDist = d; best = cand; }
  }
  return best;
}

function tryDropDownTowardTarget(
  enemy: EnemyState,
  ctx: AiContext,
  dirX: number,
  dirZ: number,
  moveDist: number,
): boolean {
  for (const a of DROP_ANGLE_OFFSETS) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const vx = dirX * c - dirZ * s;
    const vz = dirX * s + dirZ * c;
    const tx = enemy.x + vx * moveDist;
    const tz = enemy.z + vz * moveDist;

    const terrainY = ctx.getTerrainHeight(tx, tz);
    if (!Number.isFinite(terrainY)) continue;
    // 必须真的是“往下掉”，不是平移或上台阶。
    if (enemy.y - terrainY < DROP_MIN_DELTA) continue;
    // 在落点高度上做阻挡检查，避免穿进墙体/攀爬体。
    if (isBlockedHorizontallyAt(ctx.geo, tx, tz, terrainY, true, ENEMY_RADIUS)) continue;

    enemy.x = tx;
    enemy.z = tz;
    enemy.y = terrainY;
    return true;
  }
  return false;
}
