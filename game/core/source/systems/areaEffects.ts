/**
 * 区域特效系统 —— 毒气云 / 虚空涟漪 / 灼地痕迹 / 激光线 的每帧推进与结算。
 *
 * 每帧 `tickAreaEffects(engine, dt)`：
 *   - gas_cloud:    固定位置，每 tickInterval 给范围内敌人刷新中毒（DoT 由 statusEffects 结算）；
 *                   boss 不可中毒，改为直接结算 dps×tickInterval。
 *   - void_ripple:  中心可跟随玩家，半径按 expandSpeed 扩散；波前扫过的敌人结算一次伤害（近者先吃，每敌一次）。
 *   - scorch_trail: 固定位置，每 tickInterval 灼伤范围内敌人；痕迹消失后不再造成伤害。
 *   - ray_beam:     纯视觉（伤害已在行为里瞬发结算），仅递减寿命。
 *
 * 伤害统一走 helpers.addDamageEvent + stats.damageDealt，飘字颜色由 weaponType 驱动。
 */
import { distanceSqBetween } from '../helpers/physics.ts';
import { addDamageEvent } from './helpers.ts';
import { applyPoison } from './statusEffects.ts';
import { onBondWeaponHit } from './bonds.ts';
import { recordWeaponDamage } from './weaponDamageStats.ts';
import { AOE_MAX_Y_DELTA, GAS_POISON_REFRESH_DURATION } from '../config.ts';
import { bossDamageEventY, enemyDamageEventY } from '../helpers/combatHeight.ts';
import type { AreaEffectState, EnemyState, BossState } from '../types.ts';
import type { Engine } from './types.ts';

function damageEnemy(engine: Engine, enemy: EnemyState, dmg: number, ae: AreaEffectState): void {
  enemy.hp -= dmg;
  enemy.hitFlashTimer = 0.1;
  recordWeaponDamage(engine, ae.weaponType, dmg, enemy);
  addDamageEvent(engine, enemy.x, enemyDamageEventY(enemy), enemy.z, dmg, ae.isCrit ?? false, false, ae.weaponType);
}

function withinAoeHeight(effectY: number, targetY: number): boolean {
  return Math.abs(targetY - effectY) <= AOE_MAX_Y_DELTA;
}

function damageBoss(engine: Engine, boss: BossState, dmg: number, ae: AreaEffectState): void {
  boss.hp -= dmg;
  boss.hitFlashTimer = 0.15;
  recordWeaponDamage(engine, ae.weaponType, dmg, boss);
  addDamageEvent(engine, boss.x, bossDamageEventY(boss), boss.z, dmg, ae.isCrit ?? false, false, ae.weaponType);
}

export function tickAreaEffects(engine: Engine, dt: number): void {
  const { enemies, boss } = engine.state;

  for (let i = engine.state.areaEffects.length - 1; i >= 0; i--) {
    const ae = engine.state.areaEffects[i];
    ae.lifetime -= dt;

    switch (ae.kind) {
      case 'gas_cloud': {
        ae.tickTimer = (ae.tickTimer ?? 0) - dt;
        if (ae.tickTimer <= 0) {
          ae.tickTimer = ae.tickInterval ?? 0.5;
          const dps = ae.poisonDps ?? ae.damage;
          const radiusSq = ae.radius * ae.radius;
          for (const enemy of enemies) {
            if (enemy.hp <= 0) continue;
            if (distanceSqBetween(ae.x, ae.z, enemy.x, enemy.z) > radiusSq) continue;
            if (!withinAoeHeight(ae.y, enemy.y)) continue;
            applyPoison(enemy, dps, ae.poisonDuration ?? GAS_POISON_REFRESH_DURATION);
          }
          // boss 不可中毒 → 直接结算等量直伤
          if (
            boss && boss.hp > 0
            && distanceSqBetween(ae.x, ae.z, boss.x, boss.z) <= radiusSq
            && withinAoeHeight(ae.y, boss.y)
          ) {
            damageBoss(engine, boss, Math.round(dps * (ae.tickInterval ?? 0.5)), ae);
            // DoT refresh is not a fresh weapon hit; avoid re-triggering hit-based bond mechanics every tick.
          }
        }
        break;
      }

      case 'void_ripple': {
        if (ae.followPlayer) {
          ae.x = engine.state.player.x;
          ae.y = engine.state.player.y;
          ae.z = engine.state.player.z;
        }
        const prev = ae.radius;
        ae.radius = prev + (ae.expandSpeed ?? 8) * dt;
        const rippleRadiusSq = ae.radius * ae.radius;
        if (!ae.hitEnemyIds) ae.hitEnemyIds = [];
        for (const enemy of enemies) {
          if (enemy.hp <= 0) continue;
          if (ae.hitEnemyIds.includes(enemy.id)) continue;
          if (
            distanceSqBetween(ae.x, ae.z, enemy.x, enemy.z) <= rippleRadiusSq
            && withinAoeHeight(ae.y, enemy.y)
          ) {
            damageEnemy(engine, enemy, ae.damage, ae);
            ae.hitEnemyIds.push(enemy.id);
            onBondWeaponHit(engine, ae.weaponType, enemy, ae.damage, ae.isCrit ?? false);
          }
        }
        if (boss && boss.hp > 0 && !ae.hitEnemyIds.includes(-1)) {
          if (
            distanceSqBetween(ae.x, ae.z, boss.x, boss.z) <= rippleRadiusSq
            && withinAoeHeight(ae.y, boss.y)
          ) {
            damageBoss(engine, boss, ae.damage, ae);
            ae.hitEnemyIds.push(-1);
            onBondWeaponHit(engine, ae.weaponType, boss, ae.damage, ae.isCrit ?? false);
          }
        }
        if (ae.radius >= (ae.maxRadius ?? ae.radius)) {
          engine.state.areaEffects.splice(i, 1);
          continue;
        }
        break;
      }

      case 'scorch_trail': {
        ae.tickTimer = (ae.tickTimer ?? 0) - dt;
        if (ae.tickTimer <= 0) {
          ae.tickTimer = ae.tickInterval ?? 0.4;
          const scorchRadiusSq = ae.radius * ae.radius;
          for (const enemy of enemies) {
            if (enemy.hp <= 0) continue;
            if (distanceSqBetween(ae.x, ae.z, enemy.x, enemy.z) > scorchRadiusSq) continue;
            if (!withinAoeHeight(ae.y, enemy.y)) continue;
            damageEnemy(engine, enemy, ae.damage, ae);
          }
          if (
            boss && boss.hp > 0
            && distanceSqBetween(ae.x, ae.z, boss.x, boss.z) <= scorchRadiusSq
            && withinAoeHeight(ae.y, boss.y)
          ) {
            damageBoss(engine, boss, ae.damage, ae);
          }
        }
        break;
      }

      case 'ray_beam':
        // 纯视觉，伤害已在行为里瞬发结算。
        break;
    }

    if (ae.lifetime <= 0) {
      engine.state.areaEffects.splice(i, 1);
    }
  }
}
