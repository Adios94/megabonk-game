/**
 * necromancer modifier 单元测试。
 *
 * 验证：
 *  - summonCooldown 倒计时
 *  - cooldown 到时调 spawnEnemyByType (mode='necromancerSummon') 2-3 次
 *  - SUMMON_CAP 150 上限尊重
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { necromancer } from '../necromancer.ts';
import { makeEnemy, makeAiContext, makeAiEffects } from '../../__tests__/_fixtures.ts';

describe('necromancer modifier', () => {
  beforeEach(() => {
    // 固定 random=0.5 → count = 2 + floor(0.5*2) = 3
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('summonCooldown >0 时只倒计时不召唤', () => {
    const effects = makeAiEffects();
    const enemy = makeEnemy(1, 'necromancer', 0, 0, { summonCooldown: 5 });
    const ctx = makeAiContext({ effects, dt: 0.1 });
    necromancer(enemy, ctx);
    expect(enemy.summonCooldown).toBeCloseTo(4.9, 5);
    expect(effects.spawnEnemyByTypeSpy).not.toHaveBeenCalled();
  });

  it('summonCooldown <=0 时召唤 (random=0.5 → count=3) + 重置 cooldown=8', () => {
    const effects = makeAiEffects();
    const enemy = makeEnemy(1, 'necromancer', 5, 5, { summonCooldown: 0 });
    const ctx = makeAiContext({ effects, dt: 0.1 });
    necromancer(enemy, ctx);
    expect(enemy.summonCooldown).toBeCloseTo(8.0, 5);
    expect(effects.spawnEnemyByTypeSpy).toHaveBeenCalledTimes(3);
    // 召唤的小怪类型 + mode
    const call = effects.spawnEnemyByTypeSpy.mock.calls[0];
    expect(call[0]).toBe('skeleton_soldier');
    expect(call[3].mode).toBe('necromancerSummon');
  });

  it('达到 SUMMON_CAP=150 时停止召唤', () => {
    const effects = makeAiEffects();
    const enemy = makeEnemy(1, 'necromancer', 0, 0, { summonCooldown: 0 });
    // 准备 150 个 dummy 敌人
    const enemies = Array.from({ length: 150 }, (_, i) =>
      makeEnemy(i + 100, 'skeleton_soldier', 0, 0));
    const ctx = makeAiContext({ effects, enemies, dt: 0.1 });
    necromancer(enemy, ctx);
    expect(effects.spawnEnemyByTypeSpy).not.toHaveBeenCalled();
  });

  it('召唤位置围绕 necromancer (距离 2-3.5)', () => {
    const effects = makeAiEffects();
    const enemy = makeEnemy(1, 'necromancer', 10, 20, { summonCooldown: 0 });
    const ctx = makeAiContext({ effects, dt: 0.1 });
    necromancer(enemy, ctx);
    for (const call of effects.spawnEnemyByTypeSpy.mock.calls) {
      const [, x, z] = call;
      const d = Math.sqrt((x - 10) ** 2 + (z - 20) ** 2);
      expect(d).toBeGreaterThanOrEqual(2);
      expect(d).toBeLessThanOrEqual(3.5);
    }
  });
});
