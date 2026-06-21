/**
 * poison_bomb 的"毒气云"行为。
 *
 * 朝最近 in-range 敌人投掷，在其位置生成一团毒气云（gas_cloud 区域特效）。
 * 云内敌人被持续刷新中毒（gas_dot），DoT 由 statusEffects 结算。
 * damage 字段 = 中毒每秒伤害（DoT），后期成长陡峭 → 发育越久越强。
 *
 * 无目标时把毒气云丢在玩家朝向前方 range×0.6 处。
 */
import { computeWeaponDamage } from '../stats/index.ts';
import { findNearestTarget } from './queries.ts';
import {
  AOE_MAX_Y_DELTA,
  GAS_CLOUD_LIFETIME,
  GAS_CLOUD_TICK_INTERVAL,
  GAS_POISON_REFRESH_DURATION,
} from '../config.ts';
import type { BehaviorContext } from './types.ts';
import type { GameWorld } from '../world.ts';

export function poisonGas(_world: GameWorld, ctx: BehaviorContext): void {
  const { player, enemies, boss, def, stats, effects } = ctx;

  const target = findNearestTarget(player.x, player.z, enemies, boss, stats.range, player.y, AOE_MAX_Y_DELTA);
  let tx: number, tz: number;
  if (target) {
    tx = target.x;
    tz = target.z;
  } else {
    const reach = stats.range * 0.6;
    tx = player.x + Math.sin(player.rotation) * reach;
    tz = player.z + Math.cos(player.rotation) * reach;
  }

  // DoT 每秒伤害（不取暴击：持续伤害按基准）
  const dps = computeWeaponDamage(stats.damage, player, def.tags, false);

  effects.spawnAreaEffect({
    kind: 'gas_cloud',
    weaponType: 'poison_bomb',
    x: tx,
    y: target?.y ?? player.y,
    z: tz,
    radius: stats.aoeRadius,
    lifetime: GAS_CLOUD_LIFETIME,
    maxLifetime: GAS_CLOUD_LIFETIME,
    damage: dps,
    poisonDps: dps,
    poisonDuration: GAS_POISON_REFRESH_DURATION,
    tickTimer: 0,
    tickInterval: GAS_CLOUD_TICK_INTERVAL,
  });
}
