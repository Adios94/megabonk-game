/**
 * lightning_staff 的"链式闪电"行为。
 *
 * 与原 `GameInstance.fireLightningStaff` 行为等价：
 * - 主目标：最近 in-range 敌人，无目标则放弃本次开火
 * - 链次数：stats.chains - 1（首次命中已扣 1 次）
 * - 链衰减：每次链伤害 = base damage × 0.7（保持 dM 与 crit 独立）
 * - 链跳跃半径：range × 0.6
 * - chainsLeft > 0 时还有余量则可链到 boss
 *
 * 数学等价于 fireLightningStaff，由 parity 测试锁定。
 *
 * **0.7 链衰减表达**：通过把 `weaponBase × 0.7` 传给 computeWeaponDamage 实现。
 *  数学等价于 legacy 的 `round(stats.damage × dM × 0.7 × (crit?cD:1))`，因为
 *  `(stats.damage × 0.7) × dM × crit` 与 `stats.damage × dM × 0.7 × crit` 同积同 round。
 *  Phase 5 可能改为 'chain' tag 的 more 修饰符，那时移除此 hack。
 */
import { computeWeaponDamage } from '../stats/index.ts';
import { distanceBetween } from '../physics.ts';
import { AOE_MAX_Y_DELTA } from '../config.ts';
import { bossDamageEventY, enemyDamageEventY } from '../combatHeight.ts';
import { findNearestEnemy, findNearestEnemyExcluding } from './queries.ts';
import type { BehaviorContext } from './types.ts';
import type { GameWorld } from '../world.ts';

const CHAIN_DECAY = 0.7;

export function lightningChain(_world: GameWorld, ctx: BehaviorContext): void {
  const { player, enemies, boss, weapon, def, stats, effects } = ctx;

  const target = findNearestEnemy(player.x, player.z, enemies, stats.range, player.y, AOE_MAX_Y_DELTA);
  if (!target) return;

  // 主命中
  const isCrit = Math.random() < player.critChance;
  const damage = computeWeaponDamage(stats.damage, player, def.tags, isCrit, target);
  target.hp -= damage;
  target.hitFlashTimer = 0.15;
  effects.addDamageDealt(damage);
  effects.addDamageEvent(target.x, enemyDamageEventY(target), target.z, damage, isCrit, false, 'lightning_staff');
  effects.bondHit?.(weapon.type, target, damage, isCrit);

  // 链
  const hitIds = new Set<number>([target.id]);
  let currentX = target.x;
  let currentY = target.y;
  let currentZ = target.z;
  let chainsLeft = stats.chains - 1;

  while (chainsLeft > 0) {
    const nearestEnemy = findNearestEnemyExcluding(
      currentX, currentZ, enemies, hitIds, stats.range * 0.6, currentY, AOE_MAX_Y_DELTA,
    );
    if (!nearestEnemy) break;

    const chainCrit = Math.random() < player.critChance;
    const chainDmg = computeWeaponDamage(stats.damage * CHAIN_DECAY, player, def.tags, chainCrit, nearestEnemy);
    nearestEnemy.hp -= chainDmg;
    nearestEnemy.hitFlashTimer = 0.15;
    effects.addDamageDealt(chainDmg);
    effects.addDamageEvent(nearestEnemy.x, enemyDamageEventY(nearestEnemy), nearestEnemy.z, chainDmg, chainCrit, false, 'lightning_staff');
    effects.bondHit?.(weapon.type, nearestEnemy, chainDmg, chainCrit);

    hitIds.add(nearestEnemy.id);
    currentX = nearestEnemy.x;
    currentY = nearestEnemy.y;
    currentZ = nearestEnemy.z;
    chainsLeft--;
  }

  // boss 在 chainsLeft > 0 + range 内时也命中
  if (boss && boss.hp > 0 && chainsLeft > 0) {
    const bossDist = distanceBetween(currentX, currentZ, boss.x, boss.z);
    if (bossDist < stats.range && Math.abs(boss.y - currentY) <= AOE_MAX_Y_DELTA) {
      const bossCrit = Math.random() < player.critChance;
      const bossDmg = computeWeaponDamage(stats.damage * CHAIN_DECAY, player, def.tags, bossCrit, boss);
      boss.hp -= bossDmg;
      boss.hitFlashTimer = 0.15;
      effects.addDamageDealt(bossDmg);
      effects.addDamageEvent(boss.x, bossDamageEventY(boss), boss.z, bossDmg, bossCrit, false, 'lightning_staff');
      effects.bondHit?.(weapon.type, boss, bossDmg, bossCrit);
    }
  }
}
