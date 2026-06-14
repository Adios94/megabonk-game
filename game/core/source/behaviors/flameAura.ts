/**
 * flame_ring 的"持续 AOE"行为。
 *
 * 与原 `GameInstance.fireFlameRing` 行为等价：
 * - 玩家周围 stats.aoeRadius 内所有活敌人受伤
 * - boss 同样在范围内时受伤
 * - 不创建投射物（视觉特效由客户端基于 `weapon.type === 'flame_ring'` 持续渲染）
 *
 * 数学等价于 fireFlameRing，由 parity 测试锁定。
 */
import { computeWeaponDamage } from '../stats/index.ts';
import { distanceSqBetween } from '../physics.ts';
import { AOE_MAX_Y_DELTA } from '../config.ts';
import { bossDamageEventY, enemyDamageEventY } from '../combatHeight.ts';
import type { BehaviorContext } from './types.ts';
import type { GameWorld } from '../world.ts';

export function flameAura(_world: GameWorld, ctx: BehaviorContext): void {
  const { player, enemies, boss, weapon, def, stats, effects } = ctx;

  const aoeRadiusSq = stats.aoeRadius * stats.aoeRadius;
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    if (distanceSqBetween(player.x, player.z, enemy.x, enemy.z) > aoeRadiusSq) continue;
    if (Math.abs(enemy.y - player.y) > AOE_MAX_Y_DELTA) continue;

    const isCrit = Math.random() < player.critChance;
    const damage = computeWeaponDamage(stats.damage, player, def.tags, isCrit, enemy);
    enemy.hp -= damage;
    enemy.hitFlashTimer = 0.1;
    effects.addDamageDealt(damage);
    effects.addDamageEvent(enemy.x, enemyDamageEventY(enemy), enemy.z, damage, isCrit, false, 'flame_ring');
    effects.bondHit?.(weapon.type, enemy, damage, isCrit);
  }

  if (boss && boss.hp > 0) {
    if (distanceSqBetween(player.x, player.z, boss.x, boss.z) <= aoeRadiusSq && Math.abs(boss.y - player.y) <= AOE_MAX_Y_DELTA) {
      const isCrit = Math.random() < player.critChance;
      const damage = computeWeaponDamage(stats.damage, player, def.tags, isCrit, boss);
      boss.hp -= damage;
      boss.hitFlashTimer = 0.15;
      effects.addDamageDealt(damage);
      effects.addDamageEvent(boss.x, bossDamageEventY(boss), boss.z, damage, isCrit, false, 'flame_ring');
      effects.bondHit?.(weapon.type, boss, damage, isCrit);
    }
  }
}
