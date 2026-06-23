/**
 * shotgun 的"扇形散射"行为。
 *
 * 与原 `GameInstance.fireShotgun` 行为等价：
 * - count 个弹丸沿 player.rotation 等角分布
 * - 总扇角 0.35π；count=5 时五发覆盖 ±0.175π
 * - 高速短寿命（lifetime 1.5）
 *
 * 数学等价于 fireShotgun，由 parity 测试锁定。
 */
import { computeWeaponDamage } from '../stats/index.ts';
import { playerProjectileY } from '../helpers/combatHeight.ts';
import type { BehaviorContext } from './types.ts';
import type { GameWorld } from '../world.ts';

export function spreadShot(_world: GameWorld, ctx: BehaviorContext): void {
  const { player, def, stats, effects } = ctx;
  const count = stats.projectileCount;
  const spreadAngle = Math.PI * 0.35;

  for (let i = 0; i < count; i++) {
    const angleOffset = count > 1
      ? ((i / (count - 1)) - 0.5) * spreadAngle
      : 0;
    const angle = player.rotation + angleOffset;
    const vx = Math.sin(angle) * stats.speed;
    const vz = Math.cos(angle) * stats.speed;

    const isCrit = Math.random() < player.critChance;
    const damage = computeWeaponDamage(stats.damage, player, def.tags, isCrit);

    const id = effects.spawnProjectile({
      weaponType: 'shotgun',
      x: player.x, y: playerProjectileY(player), z: player.z,
      vx, vy: 0, vz,
      damage,
      bouncesLeft: 0,
      pierceLeft: stats.pierce,
      lifetime: 1.5,
      radius: 0.2,
      fromPlayer: true,
    });
    if (id === null) break;
  }
}
