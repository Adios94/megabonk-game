/**
 * 行为共享的敌人查询函数。
 *
 * 多个 behavior（sweepArc / forwardArrow / bouncingShot / lightningChain ...）
 * 都需要 "最近的活敌人" / "排除某些敌人后最近的活敌人" 这两类查询。
 * 抽到这里避免在每个行为里重新写一遍。
 */
import type { EnemyState } from '../types.ts';
import { distanceSqBetween } from '../physics.ts';

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
