/**
 * scorch_boots 的"灼地痕迹"行为。
 *
 * 高频（短 cooldown）在玩家脚下留下一段灼地痕迹（scorch_trail 区域特效）。
 * 痕迹存活期间间歇灼伤范围内路过的敌人；痕迹消失（lifetime 到）后不再造成伤害。
 *
 * aoeRadius = 痕迹半径；damage = 每次灼伤。
 */
import { computeWeaponDamage } from '../stats/index.ts';
import { SCORCH_TRAIL_LIFETIME, SCORCH_TRAIL_TICK_INTERVAL } from '../config.ts';
import type { BehaviorContext } from './types.ts';
import type { GameWorld } from '../world.ts';

export function scorchTrail(_world: GameWorld, ctx: BehaviorContext): void {
  const { player, def, stats, effects } = ctx;

  const isCrit = Math.random() < player.critChance;
  const damage = computeWeaponDamage(stats.damage, player, def.tags, isCrit);

  effects.spawnAreaEffect({
    kind: 'scorch_trail',
    weaponType: 'scorch_boots',
    x: player.x,
    y: player.y,
    z: player.z,
    radius: stats.aoeRadius,
    lifetime: SCORCH_TRAIL_LIFETIME,
    maxLifetime: SCORCH_TRAIL_LIFETIME,
    damage,
    isCrit,
    tickTimer: SCORCH_TRAIL_TICK_INTERVAL,
    tickInterval: SCORCH_TRAIL_TICK_INTERVAL,
  });
}
