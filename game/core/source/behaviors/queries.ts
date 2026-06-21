/**
 * 行为共享的敌人查询函数。
 *
 * 多个 behavior（sweepArc / forwardArrow / bouncingShot / lightningChain ...）
 * 都需要 "最近的活敌人" / "排除某些敌人后最近的活敌人" 这两类查询。
 * 抽到这里避免在每个行为里重新写一遍。
 *
 * **敌人 vs 目标**：`findNearestEnemy` 只看 `enemies[]`；`findNearestTarget`
 * 把 `boss` 也算作可瞄准目标（boss 在 state 里单独存，但武器索敌应该一视同仁）。
 * 仅做位置匹配 / 链式排除时用 `findNearestEnemy`；首目标 / 自动瞄准用 `findNearestTarget`。
 */
import type { EnemyState, BossState } from '../types.ts';
import { distanceSqBetween } from '../helpers/physics.ts';

/** boss 在 `hitEnemyIds` / spatial hash 里使用的 sentinel id。 */
const BOSS_SENTINEL_ID = -1;

/**
 * 找最近的活敌人。
 * @param maxRange 最远距离上限（包含），默认 Infinity（无限制）
 */
export function findNearestEnemy(
  x: number, z: number,
  enemies: EnemyState[],
  maxRange: number = Infinity,
  sourceY?: number,
  maxYDelta: number = Infinity,
): EnemyState | null {
  let nearest: EnemyState | null = null;
  let nearestDistSq = maxRange === Infinity ? Infinity : maxRange * maxRange;
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    if (sourceY !== undefined && Math.abs(enemy.y - sourceY) > maxYDelta) continue;
    const distSq = distanceSqBetween(x, z, enemy.x, enemy.z);
    if (distSq < nearestDistSq) {
      nearestDistSq = distSq;
      nearest = enemy;
    }
  }
  return nearest;
}

/**
 * 找最近的活敌人，但排除 id 在 excludeIds 中的敌人。
 * 用于链式攻击（lightning_staff chain）等需要"已命中跳过"的场景。
 *
 * @param maxRange 最远距离上限（包含），默认 Infinity
 */
export function findNearestEnemyExcluding(
  x: number, z: number,
  enemies: EnemyState[],
  excludeIds: ReadonlySet<number> | readonly number[],
  maxRange: number = Infinity,
  sourceY?: number,
  maxYDelta: number = Infinity,
): EnemyState | null {
  const excludes: ReadonlySet<number> = excludeIds instanceof Set
    ? excludeIds
    : new Set(excludeIds as readonly number[]);
  let nearest: EnemyState | null = null;
  let nearestDistSq = maxRange === Infinity ? Infinity : maxRange * maxRange;
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    if (excludes.has(enemy.id)) continue;
    if (sourceY !== undefined && Math.abs(enemy.y - sourceY) > maxYDelta) continue;
    const distSq = distanceSqBetween(x, z, enemy.x, enemy.z);
    if (distSq < nearestDistSq) {
      nearestDistSq = distSq;
      nearest = enemy;
    }
  }
  return nearest;
}

/**
 * 找最近的可瞄准目标（活敌人 + 活 boss）。
 *
 * boss 在 state 里独立存储（不在 `enemies[]`），但武器追踪 / 自动瞄准不应忽略它。
 * 调用方拿到的返回值只承诺有 `x / y / z`（直接当成"一个位置"用即可）；
 * 若需要走 enemy-only / boss-only 的分支，用 `boss && target === boss` 判别。
 */
export function findNearestTarget(
  x: number, z: number,
  enemies: readonly EnemyState[],
  boss: BossState | null | undefined,
  maxRange: number = Infinity,
  sourceY?: number,
  maxYDelta: number = Infinity,
): EnemyState | BossState | null {
  let nearest: EnemyState | BossState | null = null;
  let nearestDistSq = maxRange === Infinity ? Infinity : maxRange * maxRange;
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    if (sourceY !== undefined && Math.abs(enemy.y - sourceY) > maxYDelta) continue;
    const distSq = distanceSqBetween(x, z, enemy.x, enemy.z);
    if (distSq < nearestDistSq) {
      nearestDistSq = distSq;
      nearest = enemy;
    }
  }
  if (boss && boss.hp > 0) {
    if (sourceY === undefined || Math.abs(boss.y - sourceY) <= maxYDelta) {
      const distSq = distanceSqBetween(x, z, boss.x, boss.z);
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearest = boss;
      }
    }
  }
  return nearest;
}

/**
 * `findNearestTarget` 的"排除已命中"变体（用于弹跳 / 链式时跳过已命中目标）。
 *
 * `excludeIds` 用 `BOSS_SENTINEL_ID` (= -1) 表示 boss 已被命中。
 */
export function findNearestTargetExcluding(
  x: number, z: number,
  enemies: readonly EnemyState[],
  boss: BossState | null | undefined,
  excludeIds: ReadonlySet<number> | readonly number[],
  maxRange: number = Infinity,
  sourceY?: number,
  maxYDelta: number = Infinity,
): EnemyState | BossState | null {
  const excludes: ReadonlySet<number> = excludeIds instanceof Set
    ? excludeIds
    : new Set(excludeIds as readonly number[]);
  let nearest: EnemyState | BossState | null = null;
  let nearestDistSq = maxRange === Infinity ? Infinity : maxRange * maxRange;
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    if (excludes.has(enemy.id)) continue;
    if (sourceY !== undefined && Math.abs(enemy.y - sourceY) > maxYDelta) continue;
    const distSq = distanceSqBetween(x, z, enemy.x, enemy.z);
    if (distSq < nearestDistSq) {
      nearestDistSq = distSq;
      nearest = enemy;
    }
  }
  if (boss && boss.hp > 0 && !excludes.has(BOSS_SENTINEL_ID)) {
    if (sourceY === undefined || Math.abs(boss.y - sourceY) <= maxYDelta) {
      const distSq = distanceSqBetween(x, z, boss.x, boss.z);
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearest = boss;
      }
    }
  }
  return nearest;
}
