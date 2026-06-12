/**
 * sword 的扇形扫击行为。
 *
 * 与原 `GameInstance.fireSword` 行为等价：
 * - 自动瞄准最近敌人（1.5× range 之内）
 * - 在 aim angle ± 30° 的扇形内逐 enemy 命中
 * - swipeCount 多刀时，每刀 baseAngle 各偏 0.3 rad
 * - 命中：扣 hp / hitFlashTimer / 击退 / damageEvent
 * - boss 在 range 内额外检查一次（不受角度限制）
 *
 * 数学等价 + 视觉等价于 fireSword（用 `__tests__/parity.test.ts` 锁住）。
 */
import { distanceBetween } from '../physics.ts';
import { computeWeaponDamage } from '../stats/index.ts';
import { AOE_MAX_Y_DELTA } from '../config.ts';
import { bossDamageEventY, enemyDamageEventY } from '../combatHeight.ts';
import { findNearestEnemy } from './queries.ts';
import type { BehaviorContext } from './types.ts';
import type { GameWorld } from '../world.ts';

export function sweepArc(_world: GameWorld, ctx: BehaviorContext): void {
  const { player, enemies, boss, weapon, def, stats, effects } = ctx;
  const arcAngle = Math.PI * 0.6;
  const swipeCount = stats.projectileCount;

  // 自动瞄准最近 enemy
  const target = findNearestEnemy(player.x, player.z, enemies, stats.range * 1.5, player.y, AOE_MAX_Y_DELTA);
  const aimAngle = target
    ? Math.atan2(target.x - player.x, target.z - player.z)
    : player.rotation;

  for (let s = 0; s < swipeCount; s++) {
    const baseAngle = aimAngle + (s - (swipeCount - 1) / 2) * 0.3;
    for (const enemy of enemies) {
      if (enemy.hp <= 0) continue;
      if (Math.abs(enemy.y - player.y) > AOE_MAX_Y_DELTA) continue;
      const dist = distanceBetween(player.x, player.z, enemy.x, enemy.z);
      if (dist > stats.range) continue;

      const angleToEnemy = Math.atan2(enemy.x - player.x, enemy.z - player.z);
      let angleDiff = angleToEnemy - baseAngle;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      if (Math.abs(angleDiff) <= arcAngle / 2) {
        const isCrit = Math.random() < player.critChance;
        const damage = computeWeaponDamage(stats.damage, player, def.tags, isCrit, enemy);
        enemy.hp -= damage;
        enemy.hitFlashTimer = 0.15;
        effects.addDamageDealt(damage);
        effects.addDamageEvent(enemy.x, enemyDamageEventY(enemy), enemy.z, damage, isCrit, false, 'sword');
        effects.applyKnockback(enemy, player.x, player.z);
        effects.bondHit?.(weapon.type, enemy, damage, isCrit);
      }
    }
  }

  // boss 命中（保持原 fireSword 逻辑：不受角度限制，仅距离检查）
  if (boss && boss.hp > 0) {
    const dist = distanceBetween(player.x, player.z, boss.x, boss.z);
    if (dist <= stats.range && Math.abs(boss.y - player.y) <= AOE_MAX_Y_DELTA) {
      const isCrit = Math.random() < player.critChance;
      const damage = computeWeaponDamage(stats.damage, player, def.tags, isCrit, boss);
      boss.hp -= damage;
      boss.hitFlashTimer = 0.15;
      effects.addDamageDealt(damage);
      effects.addDamageEvent(boss.x, bossDamageEventY(boss), boss.z, damage, isCrit, false, 'sword');
      effects.bondHit?.(weapon.type, boss, damage, isCrit);
    }
  }
}
