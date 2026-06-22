/**
 * paralysis_gun 的"麻痹弹"行为。
 *
 * 自动索敌发射投射物，命中敌人时附带强力减速（strong_slow，接近麻痹）。
 * 减速由 collisions 读取 proj.onHitStatus 统一施加（精英按抗性减弱）。
 *
 * 与 forwardArrow 结构相同：i===0 自动瞄准最近敌人，其余按朝向 spread。
 */
import { normalizeDirection } from '../helpers/physics.ts';
import { computeWeaponDamage } from '../stats/index.ts';
import { playerProjectileY } from '../helpers/combatHeight.ts';
import { findNearestTarget } from './queries.ts';
import { AOE_MAX_Y_DELTA, PARALYSIS_SLOW_FACTOR, PARALYSIS_SLOW_DURATION } from '../config.ts';
import type { BehaviorContext } from './types.ts';
import type { GameWorld } from '../world.ts';

export function paralysisShot(_world: GameWorld, ctx: BehaviorContext): void {
  const { player, enemies, boss, def, stats, effects } = ctx;
  const count = stats.projectileCount;

  for (let i = 0; i < count; i++) {
    const target = findNearestTarget(player.x, player.z, enemies, boss, stats.range, player.y, AOE_MAX_Y_DELTA);
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
      weaponType: 'paralysis_gun',
      x: player.x, y: playerProjectileY(player), z: player.z,
      vx, vy: 0, vz,
      damage,
      bouncesLeft: 0,
      pierceLeft: stats.pierce,
      lifetime: 3.0,
      radius: 0.3,
      fromPlayer: true,
      onHitStatus: {
        slowFactor: PARALYSIS_SLOW_FACTOR,
        slowDuration: PARALYSIS_SLOW_DURATION,
      },
    });
    if (id === null) break;
  }
}
