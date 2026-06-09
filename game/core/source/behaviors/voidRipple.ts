/**
 * void_ripple 的"虚空涟漪"行为。
 *
 * 以玩家为圆心生成一圈向外扩散的环形波（void_ripple 区域特效）。
 * 波前每帧扩大 expandSpeed×dt，扫到的敌人结算一次伤害——
 * 因此**离玩家越近的敌人越早被波前触及、越早结算**（涟漪先后感）。
 *
 * aoeRadius = 最大半径；speed = 扩散速度。伤害不创建投射物。
 */
import { computeWeaponDamage } from '../stats/index.ts';
import type { BehaviorContext } from './types.ts';
import type { GameWorld } from '../world.ts';

export function voidRipple(_world: GameWorld, ctx: BehaviorContext): void {
  const { player, def, stats, effects } = ctx;

  const isCrit = Math.random() < player.critChance;
  const damage = computeWeaponDamage(stats.damage, player, def.tags, isCrit);

  const maxRadius = stats.aoeRadius;
  const expandSpeed = stats.speed > 0 ? stats.speed : 8;
  // 寿命：扩散到最大半径所需时间 + 少量缓冲（保证最后一圈也能结算）
  const lifetime = maxRadius / expandSpeed + 0.2;

  effects.spawnAreaEffect({
    kind: 'void_ripple',
    weaponType: 'void_ripple',
    x: player.x,
    z: player.z,
    radius: 0,
    lifetime,
    maxLifetime: lifetime,
    damage,
    isCrit,
    expandSpeed,
    maxRadius,
    followPlayer: true,
    hitEnemyIds: [],
  });
}
