/**
 * 敌人之间的软分离 —— 防止挤成一坨贴脸时视觉重叠。
 *
 * 设计：
 *  - 每帧重建一个临时 spatial hash（独立于 engine.spatialHash，避免被同帧 processCollisions
 *    覆盖），按 enemy 自身的"分离半径"插入。
 *  - 对每只活敌人 query 邻居，按"圆-圆相交深度"推开，每只各承担一半。
 *  - 推开后走 tryMoveHorizontally 尊重墙体，避免被挤进墙里。
 *  - 单帧推开距离 clamp 到 SEPARATION_MAX_PUSH_PER_TICK，避免远距瞬移；
 *    持续重叠会在多帧内逐步分开（视觉上像"软排斥"，不会突变）。
 *
 * 跳过的情况：
 *  - charge 怪在 'charging' 状态：高速冲撞中，挤开会改路线
 *  - dive 怪（gargoyle）在 'diving' / 'rising' 状态：飞行机动，y 远离地面同伴
 *  - 高度差 > SEPARATION_MAX_Y_DELTA：上下层不互挤
 *
 * 顺序：放在 tickEnemyAi 之后、processCollisions 之前。AI 先决定意图位移，
 * 这一步负责"不要挤穿"；processCollisions 内的 spatial hash 会再重建一次，互不干扰。
 */
import type { EnemyState } from '../types.ts';
import type { Engine } from './types.ts';
import { SpatialHash } from '../spatial-hash.ts';
import { tryMoveHorizontally } from './horizontalMove.ts';

/** 普通怪的分离半径（米）—— 比 ENEMY_RADIUS(0.4) 大一圈，把站桩同伴推到肉眼可见的间距。 */
const SEPARATION_RADIUS_BASE = 0.65;
/** 精英 / 大型怪（skeleton_knight / necromancer / gargoyle）—— 体型更大，间距也更大。 */
const SEPARATION_RADIUS_ELITE = 0.85;
/** 单只敌人单帧最大推开距离（米）—— 软排斥，多帧逐步分开，避免瞬移和抖动。 */
const SEPARATION_MAX_PUSH_PER_TICK = 0.25;
/** 高度差超过此值的两只怪不互推（飞行/上下层场景）。 */
const SEPARATION_MAX_Y_DELTA = 1.5;
/** tryMoveHorizontally 的半径（与 _move.ts 的 ENEMY_RADIUS 一致，保持墙体阻挡口径相同）。 */
const ENEMY_WALL_RADIUS = 0.4;

let separationHash: SpatialHash | null = null;
/** 复用的 id → enemy 索引：按 tick 内的 enemies 快照填充，避免 query 后线性扫描。 */
const byIdScratch: Map<number, EnemyState> = new Map();

function getSeparationRadius(enemy: EnemyState): number {
  return enemy.isElite || enemy.isMiniBoss ? SEPARATION_RADIUS_ELITE : SEPARATION_RADIUS_BASE;
}

function shouldSkip(enemy: EnemyState): boolean {
  if (enemy.hp <= 0) return true;
  // 冲撞中（skeleton_knight）：高速直冲，不可被挤开
  if (enemy.chargeState === 'charging') return true;
  // 飞行机动中（gargoyle）：俯冲/起飞已自带轨迹
  if (enemy.diveState === 'diving' || enemy.diveState === 'rising') return true;
  return false;
}

export function tickEnemySeparation(engine: Engine): void {
  const enemies = engine.state.enemies;
  if (enemies.length < 2) return;

  if (!separationHash) {
    // cellSize 1.5m：分离半径上限 ~0.85m，cellSize ≈ 2 × 邻居半径，邻居至多落在 3×3 格内。
    separationHash = new SpatialHash(1.5);
  }
  const hash = separationHash;
  hash.clear();

  // 1) 按"分离半径"插入活着且不在豁免态的敌人，同时构建 id 索引
  byIdScratch.clear();
  for (const e of enemies) {
    if (shouldSkip(e)) continue;
    hash.insert(e.id, e.x, e.z, getSeparationRadius(e));
    byIdScratch.set(e.id, e);
  }

  for (const e of enemies) {
    if (shouldSkip(e)) continue;

    const rSelf = getSeparationRadius(e);
    // 邻居最大半径用 ELITE 一档，覆盖最坏情况（自身 BASE × 邻居 ELITE）。
    const queryR = rSelf + SEPARATION_RADIUS_ELITE;
    const ids = hash.queryRef(e.x, e.z, queryR);

    let pushX = 0;
    let pushZ = 0;
    let pushed = false;

    for (const id of ids) {
      if (id === e.id) continue;
      const other = byIdScratch.get(id);
      if (!other) continue;
      if (Math.abs(e.y - other.y) > SEPARATION_MAX_Y_DELTA) continue;

      const minDist = rSelf + getSeparationRadius(other);
      let dx = e.x - other.x;
      let dz = e.z - other.z;
      const distSq = dx * dx + dz * dz;
      if (distSq >= minDist * minDist) continue;

      let dist: number;
      if (distSq < 1e-6) {
        // 完全重叠：用 id 哈希给两边一个相反的微小方向，避免卡死
        const a = (e.id * 12.9898) % (Math.PI * 2);
        dx = Math.cos(a);
        dz = Math.sin(a);
        dist = 1;
      } else {
        dist = Math.sqrt(distSq);
        dx /= dist;
        dz /= dist;
      }
      // 重叠深度，每只各推一半（这样两边对称分开，不会单边瞬移）
      const overlap = (minDist - dist) * 0.5;
      pushX += dx * overlap;
      pushZ += dz * overlap;
      pushed = true;
    }

    if (!pushed) continue;

    // 3) clamp 单帧最大推开距离 —— 软排斥，避免远距瞬移
    const len = Math.hypot(pushX, pushZ);
    if (len > SEPARATION_MAX_PUSH_PER_TICK) {
      const k = SEPARATION_MAX_PUSH_PER_TICK / len;
      pushX *= k;
      pushZ *= k;
    }

    // 4) 走墙体阻挡（沿墙滑），避免被挤进墙里
    const desiredX = e.x + pushX;
    const desiredZ = e.z + pushZ;
    const moved = tryMoveHorizontally(engine.geo, e.x, e.z, desiredX, desiredZ, e.y, {
      radius: ENEMY_WALL_RADIUS,
      includeClimb: true,
    });
    e.x = moved.x;
    e.z = moved.z;
  }
}
