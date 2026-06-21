/**
 * ray_gun 的"瞬发激光"行为。
 *
 * 特点：range 仅作索敌距离，命中后沿直线**无限穿透**（不消耗 pierce），
 *       敌人几乎成一条直线时收益极高。aoeRadius = 光束半宽（每级 +0.05，慷慨）。
 *
 * - 朝最近 in-range 敌人方向发射；无目标则沿 player.rotation。
 * - 对所有"在光束前方 + 垂直距离 ≤ 半宽 + 敌人半径"的敌人 / boss 结算伤害。
 * - 不创建投射物；推一个 ray_beam 区域特效供客户端渲染激光线。
 */
import { computeWeaponDamage } from '../stats/index.ts';
import { normalizeDirection } from '../helpers/physics.ts';
import { findNearestTarget } from './queries.ts';
import { AOE_MAX_Y_DELTA, RAY_GUN_BEAM_LENGTH, RAY_BEAM_VISUAL_LIFETIME, RAY_BEAM_HIT_WIDTH_SCALE } from '../config.ts';
import { bossDamageEventY, enemyDamageEventY } from '../helpers/combatHeight.ts';
import type { BehaviorContext } from './types.ts';
import type { GameWorld } from '../world.ts';

const ENEMY_RADIUS = 0.4;
const BOSS_RADIUS = 1.5;

export function rayBeam(_world: GameWorld, ctx: BehaviorContext): void {
  const { player, enemies, boss, weapon, def, stats, effects } = ctx;

  // 方向：优先索敌（含 boss；range 仅用于挑方向），否则沿朝向
  const target = findNearestTarget(player.x, player.z, enemies, boss, stats.range, player.y, AOE_MAX_Y_DELTA);
  let dx: number, dz: number;
  if (target) {
    const dir = normalizeDirection(target.x - player.x, target.z - player.z);
    dx = dir.x;
    dz = dir.z;
  } else {
    dx = Math.sin(player.rotation);
    dz = Math.cos(player.rotation);
  }

  const length = RAY_GUN_BEAM_LENGTH;
  // 渲染半宽 = aoeRadius（spawnAreaEffect 用）；判定半宽收窄以对齐客户端的细激光视觉。
  const visualHalfWidth = stats.aoeRadius;
  const hitHalfWidth = visualHalfWidth * RAY_BEAM_HIT_WIDTH_SCALE;

  const hitAlongBeam = (ex: number, ez: number, entityRadius: number): boolean => {
    const ox = ex - player.x;
    const oz = ez - player.z;
    const t = ox * dx + oz * dz;          // 沿光束的投影距离
    if (t < 0 || t > length) return false; // 必须在前方且不超长
    const perp = Math.abs(ox * dz - oz * dx); // 到光束直线的垂直距离
    return perp <= hitHalfWidth + entityRadius;
  };

  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    if (Math.abs(enemy.y - player.y) > AOE_MAX_Y_DELTA) continue;
    if (!hitAlongBeam(enemy.x, enemy.z, ENEMY_RADIUS)) continue;
    const isCrit = Math.random() < player.critChance;
    const damage = computeWeaponDamage(stats.damage, player, def.tags, isCrit, enemy);
    enemy.hp -= damage;
    enemy.hitFlashTimer = 0.12;
    effects.addDamageDealt(damage, weapon.type, enemy);
    effects.addDamageEvent(enemy.x, enemyDamageEventY(enemy), enemy.z, damage, isCrit, false, 'ray_gun');
    effects.bondHit?.(weapon.type, enemy, damage, isCrit);
  }

  if (
    boss && boss.hp > 0
    && Math.abs(boss.y - player.y) <= AOE_MAX_Y_DELTA
    && hitAlongBeam(boss.x, boss.z, BOSS_RADIUS)
  ) {
    const isCrit = Math.random() < player.critChance;
    const damage = computeWeaponDamage(stats.damage, player, def.tags, isCrit, boss);
    boss.hp -= damage;
    boss.hitFlashTimer = 0.15;
    effects.addDamageDealt(damage, weapon.type, boss);
    effects.addDamageEvent(boss.x, bossDamageEventY(boss), boss.z, damage, isCrit, false, 'ray_gun');
    effects.bondHit?.(weapon.type, boss, damage, isCrit);
  }

  // 视觉：一条沿 dir 的激光线
  effects.spawnAreaEffect({
    kind: 'ray_beam',
    weaponType: 'ray_gun',
    x: player.x,
    y: player.y,
    z: player.z,
    radius: visualHalfWidth,
    lifetime: RAY_BEAM_VISUAL_LIFETIME,
    maxLifetime: RAY_BEAM_VISUAL_LIFETIME,
    damage: 0,
    dirX: dx,
    dirZ: dz,
    length,
    width: visualHalfWidth,
  });
}
