/**
 * 状态效果系统 —— 中毒（gas_dot）持续伤害 + 减速（strong_slow / elite_slow_coef）计时。
 *
 * 每帧 `tickStatusEffects(engine, dt)`：
 *   1. 对带 poisonTimer 的敌人按 poisonDps × dt 持续掉血，跨 0.5s 边界时弹一次飘字。
 *   2. 递减 slowTimer，归零后清除减速（速度恢复）。实际减速倍率在 `ai/behaviors/_move.ts`
 *      读取并乘到 speedMult 上（精英按 ELITE_SLOW_COEF 抗性减弱）。
 *
 * 减速本身不在这里施加位移影响——只负责计时与到期清理；移动时再读取。
 */
import { ELITE_SLOW_COEF } from '../config.ts';
import { enemyDamageEventY } from '../combatHeight.ts';
import { addDamageEvent } from './helpers.ts';
import { recordWeaponDamage } from './weaponDamageStats.ts';
import type { EnemyState } from '../types.ts';
import type { Engine } from './types.ts';

/** 中毒飘字间隔（秒）：每累积这么久弹一个伤害数字，避免每帧刷屏。 */
const POISON_NUMBER_INTERVAL = 0.5;

/**
 * 给敌人施加 / 刷新中毒。多源取「更强」：dps 取较大值，timer 取较大值（不缩短已有中毒）。
 */
export function applyPoison(enemy: EnemyState, dps: number, duration: number): void {
  if (dps <= 0 || duration <= 0) return;
  enemy.poisonDps = Math.max(enemy.poisonDps ?? 0, dps);
  enemy.poisonTimer = Math.max(enemy.poisonTimer ?? 0, duration);
}

/**
 * 给敌人施加 / 刷新减速。多源取「更强」：factor 取更小值（更慢），timer 取较大值。
 * 精英 / 小头目按 ELITE_SLOW_COEF 抗性减弱（有效 factor 向 1 靠拢）。
 */
export function applySlow(enemy: EnemyState, factor: number, duration: number): void {
  if (duration <= 0) return;
  let effective = Math.max(0, Math.min(1, factor));
  if (enemy.isElite || enemy.isMiniBoss) {
    effective = 1 - (1 - effective) * ELITE_SLOW_COEF;
  }
  enemy.slowFactor = Math.min(enemy.slowFactor ?? 1, effective);
  enemy.slowTimer = Math.max(enemy.slowTimer ?? 0, duration);
}

/** 取敌人当前有效速度倍率（无减速时为 1）。供移动系统调用。 */
export function getSlowMultiplier(enemy: EnemyState): number {
  if ((enemy.slowTimer ?? 0) > 0) return enemy.slowFactor ?? 1;
  return 1;
}

export function tickStatusEffects(engine: Engine, dt: number): void {
  for (const enemy of engine.state.enemies) {
    if (enemy.hp <= 0) continue;

    // --- 中毒 DoT ---
    if ((enemy.poisonTimer ?? 0) > 0 && (enemy.poisonDps ?? 0) > 0) {
      const dps = enemy.poisonDps!;
      const before = enemy.poisonTimer!;
      const dmg = dps * dt;
      enemy.hp -= dmg;
      recordWeaponDamage(engine, 'poison_bomb', dmg, enemy);
      if (enemy.hitFlashTimer < 0.05) enemy.hitFlashTimer = 0.05;

      const after = before - dt;
      enemy.poisonTimer = after;
      // 跨 0.5s 边界 → 弹一个聚合伤害数字（绿色由 weaponType=poison_bomb 驱动）
      if (Math.ceil(before / POISON_NUMBER_INTERVAL) !== Math.ceil(Math.max(0, after) / POISON_NUMBER_INTERVAL)) {
        addDamageEvent(engine, enemy.x, enemyDamageEventY(enemy), enemy.z, Math.round(dps * POISON_NUMBER_INTERVAL), false, false, 'poison_bomb');
      }
      if (enemy.poisonTimer <= 0) {
        enemy.poisonTimer = 0;
        enemy.poisonDps = 0;
      }
    }

    // --- 减速计时 ---
    if ((enemy.slowTimer ?? 0) > 0) {
      enemy.slowTimer = (enemy.slowTimer ?? 0) - dt;
      if (enemy.slowTimer <= 0) {
        enemy.slowTimer = 0;
        enemy.slowFactor = 1;
      }
    }
  }
}
