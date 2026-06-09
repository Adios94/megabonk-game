/**
 * statusEffects 系统单元测试：中毒 DoT + 减速计时 + 精英抗性。
 */
import { describe, it, expect } from 'vitest';
import {
  applyPoison, applySlow, getSlowMultiplier, tickStatusEffects,
} from '../statusEffects.ts';
import { ELITE_SLOW_COEF } from '../../config.ts';
import { makeEngine, makeEnemy } from './_fixtures.ts';

function enemyAt(id: number, x: number, z: number, hp = 100) {
  return makeEnemy(id, 'skeleton_soldier', x, z, { hp, maxHp: hp });
}

describe('applyPoison + tickStatusEffects', () => {
  it('中毒每帧按 dps×dt 掉血，duration 到后清除', () => {
    const engine = makeEngine();
    const enemy = enemyAt(1, 0, 0, 100);
    engine.state.enemies.push(enemy);

    applyPoison(enemy, 10, 1.0);
    expect(enemy.poisonDps).toBe(10);
    expect(enemy.poisonTimer).toBe(1.0);

    tickStatusEffects(engine, 0.5);
    expect(enemy.hp).toBeCloseTo(95, 4);   // 10 dps × 0.5s
    expect(enemy.poisonTimer).toBeCloseTo(0.5, 4);

    tickStatusEffects(engine, 0.6);        // 超过剩余时间
    expect(enemy.poisonTimer).toBe(0);
    expect(enemy.poisonDps).toBe(0);
  });

  it('多源中毒取更强（dps 取大、timer 取大）', () => {
    const enemy = enemyAt(1, 0, 0, 100);
    applyPoison(enemy, 5, 2.0);
    applyPoison(enemy, 12, 1.0);
    expect(enemy.poisonDps).toBe(12);
    expect(enemy.poisonTimer).toBe(2.0);
  });
});

describe('applySlow / getSlowMultiplier', () => {
  it('普通敌人减速到指定倍率', () => {
    const enemy = enemyAt(1, 0, 0, 100);
    applySlow(enemy, 0.2, 1.5);
    expect(getSlowMultiplier(enemy)).toBeCloseTo(0.2, 4);
  });

  it('精英按 elite_slow_coef 抗性减弱（减速更轻）', () => {
    const elite = makeEnemy(1, 'skeleton_soldier', 0, 0, { hp: 100, maxHp: 100, isElite: true });
    applySlow(elite, 0.2, 1.5);
    // 有效 factor = 1 - (1 - 0.2) × coef
    const expected = 1 - (1 - 0.2) * ELITE_SLOW_COEF;
    expect(getSlowMultiplier(elite)).toBeCloseTo(expected, 4);
  });

  it('多源减速取更强（factor 取更小）', () => {
    const enemy = enemyAt(1, 0, 0, 100);
    applySlow(enemy, 0.5, 1.0);
    applySlow(enemy, 0.2, 1.0);
    expect(getSlowMultiplier(enemy)).toBeCloseTo(0.2, 4);
  });

  it('减速到期后速度倍率恢复为 1', () => {
    const engine = makeEngine();
    const enemy = enemyAt(1, 0, 0, 100);
    engine.state.enemies.push(enemy);
    applySlow(enemy, 0.2, 0.5);
    tickStatusEffects(engine, 0.6);
    expect(getSlowMultiplier(enemy)).toBe(1);
  });
});
