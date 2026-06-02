/**
 * bow 的"前向箭矢"行为。
 *
 * 与原 `GameInstance.fireBow` 行为等价：
 * - swipeCount 个箭矢
 * - i===0 自动瞄准最近 in-range 敌人；其它按 player.rotation + 0.15 spread
 * - 命中扣血 / 穿透 / damageEvent 由 processCollisions 后续处理
 *
 * 数学等价于 fireBow，由 `__tests__/parity.test.ts` 锁定。
 */
import { normalizeDirection } from '../physics.ts';
import { computeWeaponDamage } from '../stats/index.ts';
import { findNearestEnemy } from './queries.ts';
import type { BehaviorContext } from './types.ts';
import type { GameWorld } from '../world.ts';

export function forwardArrow(_world: GameWorld, ctx: BehaviorContext): void {
  const { player, enemies, def, stats, effects } = ctx;
  const count = stats.projectileCount;

  for (let i = 0; i < count; i++) {
    const target = findNearestEnemy(player.x, player.z, enemies, stats.range);
    let vx: number, vz: number;
    if (target && i === 0) {
      const dir = normalizeDirection(target.x - player.x, target.z - player.z);
      vx = dir.x * stats.speed;
      vz = dir.z * stats.speed;
    } else {
      const angle = player.rotation + (count > 1 ? (i - (count - 1) / 2) * 0.15 : 0);
      vx = Math.sin(angle) * stats.speed;
      vz = Math.cos(angle) * stats.speed;
    }

    const isCrit = Math.random() < player.critChance;
    const damage = computeWeaponDamage(stats.damage, player, def.tags, isCrit);

    const id = effects.spawnProjectile({
      weaponType: 'bow',
      x: player.x, y: 1.0, z: player.z,
      vx, vy: 0, vz,
      damage,
      bouncesLeft: 0,
      pierceLeft: stats.pierce,
      lifetime: 3.0,
      radius: 0.25,
      fromPlayer: true,
    });
    if (id === null) break;  // 达 MAX_PROJECTILES, 与 legacy fireBow 一致
  }
}
