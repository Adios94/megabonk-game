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
import { distanceBetween } from '../physics.ts';
import type { BehaviorContext } from './types.ts';
import type { GameWorld } from '../world.ts';

export function flameAura(_world: GameWorld, ctx: BehaviorContext): void {
  const { player, enemies, boss, def, stats, effects } = ctx;

  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    const dist = distanceBetween(player.x, player.z, enemy.x, enemy.z);
    if (dist > stats.aoeRadius) continue;

    const isCrit = Math.random() < player.critChance;
    const damage = computeWeaponDamage(stats.damage, player, def.tags, isCrit);
    enemy.hp -= damage;
    enemy.hitFlashTimer = 0.1;
    effects.addDamageDealt(damage);
    effects.addDamageEvent(enemy.x, 1.0, enemy.z, damage, isCrit, false, 'flame_ring');
  }

  if (boss && boss.hp > 0) {
    const dist = distanceBetween(player.x, player.z, boss.x, boss.z);
    if (dist <= stats.aoeRadius) {
      const isCrit = Math.random() < player.critChance;
      const damage = computeWeaponDamage(stats.damage, player, def.tags, isCrit);
      boss.hp -= damage;
      boss.hitFlashTimer = 0.15;
      effects.addDamageDealt(damage);
      effects.addDamageEvent(boss.x, 2, boss.z, damage, isCrit, false, 'flame_ring');
    }
  }
}
