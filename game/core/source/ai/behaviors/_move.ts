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
import { isBlockedHorizontallyAt } from '../../systems/collision.ts';
import { getTomePower } from '../../tomeProgression.ts';
import { STEP_HEIGHT } from '../../config.ts';

const ENEMY_RADIUS = 0.4;
const DROP_MIN_DELTA = STEP_HEIGHT * 1.2;
const DROP_ANGLE_OFFSETS = [0, 0.35, -0.35, 0.7, -0.7];

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

  // Final Swarm: 全体 +20% speed
  if (ctx.finalSwarm) {
    speedMult *= 1.2;
  }

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
  const moved = tryMoveHorizontally(
    ctx.geo,
    enemy.x, enemy.z,
    desiredX, desiredZ,
    enemy.y,
    { radius: ENEMY_RADIUS, includeClimb: true },
  );

  // 敌人“下台阶/跳下高差”：
  // 常规 tryMove 被边缘挡住，且玩家明显在更低层时，尝试若干个朝向玩家的落点。
  if (
    moved.x === enemy.x
    && moved.z === enemy.z
    && ctx.player.y < enemy.y - STEP_HEIGHT
  ) {
    const dropped = tryDropDownTowardTarget(enemy, ctx, nx, nz, actualMove);
    if (dropped) return;
  }

  enemy.x = moved.x;
  enemy.z = moved.z;

  // 地形 y 跟随（gargoyle 已经 return 了不会到这）
  const h = ctx.getTerrainHeight(enemy.x, enemy.z);
  if (Number.isFinite(h)) {
    enemy.y = h;
  }
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
