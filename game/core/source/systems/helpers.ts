/**
 * 共享 helpers —— systems 间的公共工具函数（taking engine）。
 *
 * 这些函数原本是 GameInstance 私有方法，Phase 6 抽到独立模块以打破循环依赖：
 *   - findNearest*: 武器 / 投射物碰撞 / lightning chain 共用
 *   - addDamageEvent: 各 damage 路径都要 push 事件
 *   - applyKnockback: 子弹击退 + gargoyle landing AOE 共用
 *   - checkPlayerDeath / checkGameOver: 多个 damage / phase 路径触发
 */
import { distanceSqBetween, normalizeDirection } from '../physics.ts';
import { getTomePower } from '../tomeProgression.ts';
import { AOE_MAX_Y_DELTA } from '../config.ts';
import { targetHitCenterY } from '../combatHeight.ts';
import type { EnemyState, WeaponType } from '../types.ts';
import type { Engine } from './types.ts';
import { onBossDefeated } from './altars.ts';
import { spawnBossChest } from './chests.ts';
import { tryMoveHorizontally } from './horizontalMove.ts';

/** 敌人横向碰撞半径（与 _move.ts 一致）。 */
const ENEMY_RADIUS = 0.4;

export function findNearestEnemy(
  engine: Engine,
  x: number,
  z: number,
  maxRange?: number,
): EnemyState | null {
  let nearest: EnemyState | null = null;
  let nearestDistSq = maxRange !== undefined ? maxRange * maxRange : Infinity;
  for (const enemy of engine.state.enemies) {
    if (enemy.hp <= 0) continue;
    const distSq = distanceSqBetween(x, z, enemy.x, enemy.z);
    if (distSq < nearestDistSq) {
      nearestDistSq = distSq;
      nearest = enemy;
    }
  }
  return nearest;
}

export function findNearestEnemyExcluding(
  engine: Engine,
  x: number,
  z: number,
  excludeIds: readonly number[],
  sourceY?: number,
): EnemyState | null {
  let nearest: EnemyState | null = null;
  let nearestDistSq = 20 * 20;
  for (const enemy of engine.state.enemies) {
    if (enemy.hp <= 0) continue;
    if (excludeIds.includes(enemy.id)) continue;
    if (sourceY !== undefined && Math.abs(sourceY - targetHitCenterY(enemy)) > AOE_MAX_Y_DELTA) continue;
    const distSq = distanceSqBetween(x, z, enemy.x, enemy.z);
    if (distSq < nearestDistSq) {
      nearestDistSq = distSq;
      nearest = enemy;
    }
  }
  return nearest;
}

export function findEnemyById(engine: Engine, id: number): EnemyState | null {
  for (let i = 0; i < engine.state.enemies.length; i++) {
    if (engine.state.enemies[i].id === id) return engine.state.enemies[i];
  }
  return null;
}

export function addDamageEvent(
  engine: Engine,
  x: number, y: number, z: number,
  damage: number,
  isCrit: boolean,
  isPlayerDamage: boolean,
  weaponType?: WeaponType,
  isShield?: boolean,
): void {
  engine.state.damageEvents.push({ x, y, z, damage, isCrit, isPlayerDamage, weaponType, isShield });
}

/**
 * 击退 enemy。基础力 1.5，knockback_tome 每级 +30%。
 *
 * 玩家撞 enemy / 子弹击中 / gargoyle landing AOE 都用同一函数。
 * `strengthMult` 给特定来源额外加成（如近战 sword 推得更远），默认 1。
 */
export function applyKnockback(
  engine: Engine,
  enemy: EnemyState,
  fromX: number,
  fromZ: number,
  strengthMult = 1,
): void {
  const knockbackTome = engine.state.player.tomes.find(t => t.type === 'knockback_tome');
  const baseForce = 1.5;
  const tomeMultiplier = 1 + getTomePower(knockbackTome) * 0.3;
  const force = baseForce * tomeMultiplier * strengthMult;

  const dir = normalizeDirection(enemy.x - fromX, enemy.z - fromZ);
  const halfMap = (engine.config.mapSize + 10) * 0.5;
  const targetX = Math.max(-halfMap, Math.min(halfMap, enemy.x + dir.x * force));
  const targetZ = Math.max(-halfMap, Math.min(halfMap, enemy.z + dir.z * force));
  // 击退尊重墙体：撞墙停 / 沿墙滑，不再把怪塞进墙里（gargoyle 飞行也按此，影响可忽略）。
  const moved = tryMoveHorizontally(engine.geo, enemy.x, enemy.z, targetX, targetZ, enemy.y, {
    radius: ENEMY_RADIUS,
    includeClimb: true,
  });
  enemy.x = moved.x;
  enemy.z = moved.z;
}

export function checkPlayerDeath(engine: Engine): void {
  const player = engine.state.player;
  if (player.hp <= 0) {
    player.alive = false;
  }
}

export function checkGameOver(engine: Engine): void {
  if (!engine.state.player.alive) {
    engine.state.phase = 'defeat';
    engine.state.finished = true;
    engine.state.running = false;
    return;
  }
  // Boss 死亡：第一关开传送门进入下一关；第二关及以后只恢复祭坛召唤能力。
  if (engine.state.boss && engine.state.boss.hp <= 0) {
    const defeatedBoss = engine.state.boss;
    spawnBossChest(engine, defeatedBoss);
    engine.state.boss = null;
    engine.state.stats.silverEarned += 50;
    onBossDefeated(engine);
    if (engine.state.phase === 'boss_fight' || engine.state.phase === 'boss_intro') {
      engine.state.phase = (engine.state.stage ?? 1) === 1 ? 'portal_open' : 'playing';
    }
  }
}
