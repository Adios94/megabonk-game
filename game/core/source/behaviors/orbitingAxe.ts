/**
 * axe 的"绕玩家投射物"行为。
 *
 * 与原 `GameInstance.fireAxe` 行为等价：
 * - count 个投射物等距分布在玩家周围
 * - startAngle = (i / count) × 2π
 * - orbiting=true，orbit update 在 updateProjectiles → updateOrbitingProjectile
 * - 命中后 pierceLeft 决定穿透；与 sweepArc 的 instant hit 不同 — 投射物持续 3 秒
 *
 * 数学等价于 fireAxe，由 parity 测试锁定。
 */
import { computeWeaponDamage } from '../stats/index.ts';
import { playerProjectileY } from '../combatHeight.ts';
import type { BehaviorContext } from './types.ts';
import type { GameWorld } from '../world.ts';

export function orbitingAxe(_world: GameWorld, ctx: BehaviorContext): void {
  const { player, def, stats, effects } = ctx;
  const count = stats.projectileCount;

  for (let i = 0; i < count; i++) {
    const startAngle = (i / count) * Math.PI * 2;
    const isCrit = Math.random() < player.critChance;
    const damage = computeWeaponDamage(stats.damage, player, def.tags, isCrit);

    const id = effects.spawnProjectile({
      weaponType: 'axe',
      x: player.x + Math.cos(startAngle) * stats.range,
      y: playerProjectileY(player),
      z: player.z + Math.sin(startAngle) * stats.range,
      vx: 0, vy: 0, vz: 0,
      damage,
      bouncesLeft: 0,
      pierceLeft: stats.pierce,
      lifetime: 3.0,
      radius: stats.aoeRadius,
      fromPlayer: true,
      orbiting: true,
      orbitAngle: startAngle,
      orbitRadius: stats.range,
      orbitSpeed: stats.speed,
    });
    if (id === null) break;
  }
}
