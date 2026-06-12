/**
 * bone_bouncer 的"弹跳投射物"行为。
 *
 * 与原 `GameInstance.fireBoneBouncer` 行为等价：
 * - count 个投射物
 * - 每发自动瞄准最近敌人（无 range 限制）；无敌人则按 player.rotation
 * - count > 1 时按 0.25 弧度逐发旋转 spread
 * - bouncesLeft 由 stats.bounces 设定，bounce 后续在 processCollisions 处理
 *
 * 数学等价于 fireBoneBouncer，由 parity 测试锁定。
 */
import { normalizeDirection } from '../physics.ts';
import { computeWeaponDamage } from '../stats/index.ts';
import { AOE_MAX_Y_DELTA } from '../config.ts';
import { playerProjectileY } from '../combatHeight.ts';
import { findNearestEnemy } from './queries.ts';
import type { BehaviorContext } from './types.ts';
import type { GameWorld } from '../world.ts';

export function bouncingShot(_world: GameWorld, ctx: BehaviorContext): void {
  const { player, enemies, def, stats, effects } = ctx;
  const count = stats.projectileCount;

  for (let i = 0; i < count; i++) {
    const target = findNearestEnemy(player.x, player.z, enemies, Infinity, player.y, AOE_MAX_Y_DELTA);
    let vx: number, vz: number;
    if (target) {
      const dir = normalizeDirection(target.x - player.x, target.z - player.z);
      vx = dir.x * stats.speed;
      vz = dir.z * stats.speed;
    } else {
      vx = Math.sin(player.rotation) * stats.speed;
      vz = Math.cos(player.rotation) * stats.speed;
    }

    if (count > 1) {
      const angle = (i - (count - 1) / 2) * 0.25;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const nvx = vx * cos - vz * sin;
      const nvz = vx * sin + vz * cos;
      vx = nvx;
      vz = nvz;
    }

    const isCrit = Math.random() < player.critChance;
    const damage = computeWeaponDamage(stats.damage, player, def.tags, isCrit);

    const id = effects.spawnProjectile({
      weaponType: 'bone_bouncer',
      x: player.x, y: playerProjectileY(player), z: player.z,
      vx, vy: 0, vz,
      damage,
      bouncesLeft: stats.bounces,
      pierceLeft: 0,
      lifetime: 4.0,
      radius: 0.4,
      fromPlayer: true,
    });
    if (id === null) break;
  }
}
