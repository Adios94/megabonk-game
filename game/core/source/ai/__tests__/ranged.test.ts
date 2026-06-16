/**
 * ranged 行为单元测试。
 *
 * 验证：
 *  - 错峰帧根据 dist 重算 target（后撤 / 追 / 站定）
 *  - cooldown ≤0 + dist 在 [range×0.5, min(range×1.5, 10m)] 内 + 高度差 ≤2.8 时调 spawnProjectile
 *  - cooldown 重置到 attackCooldownMax
 *  - skeleton_archer 投射物速度 8, necromancer 速度 6
 */
import { describe, it, expect } from 'vitest';
import { ranged } from '../behaviors/ranged.ts';
import { makeEnemy, makeAiContext, makePlayer, makeAiEffects } from './_fixtures.ts';

describe('ranged brain', () => {
  it('近距离时后撤（dist < preferredRange）', () => {
    const player = makePlayer({ x: 0, z: 0 });
    const enemy = makeEnemy(1, 'skeleton_archer', 5, 0, { speed: 0 });  // speed=0 隔离移动
    const ctx = makeAiContext({ player, aiGroup: 0 });
    ranged(enemy, ctx, 0);
    // skeleton_archer preferredRange=8, dist=5 < 8 → 后撤 4m
    // 后撤方向 = enemy 远离 player 方向 = +x
    expect(enemy.targetX).toBeGreaterThan(enemy.x);
  });

  it('远距离时追（dist > preferredRange × 1.5）', () => {
    const player = makePlayer({ x: 0, z: 0 });
    const enemy = makeEnemy(1, 'skeleton_archer', 20, 0, { speed: 0 });
    const ctx = makeAiContext({ player, aiGroup: 0 });
    ranged(enemy, ctx, 0);
    // dist=20, range=8, 20 > 12 → 追 player
    expect(enemy.targetX).toBe(0);
    expect(enemy.targetZ).toBe(0);
  });

  it('站定时 target = self（dist 在 sweet spot）', () => {
    const player = makePlayer({ x: 0, z: 0 });
    const enemy = makeEnemy(1, 'skeleton_archer', 10, 0, { speed: 0 });  // dist=10, range=8 → 介于 8 和 12 之间
    const ctx = makeAiContext({ player, aiGroup: 0 });
    ranged(enemy, ctx, 0);
    expect(enemy.targetX).toBe(10);
    expect(enemy.targetZ).toBe(0);
  });

  it('在攻击范围内 + cooldown=0 时发射投射物', () => {
    const effects = makeAiEffects();
    const enemy = makeEnemy(1, 'skeleton_archer', 8, 0, {
      speed: 0,
      attackCooldown: 0,
      attackCooldownMax: 3,
      damage: 7,
    });
    const ctx = makeAiContext({ effects, aiGroup: 99 });
    ranged(enemy, ctx, 0);
    expect(effects.spawnProjectileSpy).toHaveBeenCalledTimes(1);
    const arg = effects.spawnProjectileSpy.mock.calls[0][0];
    expect(arg.fromPlayer).toBe(false);
    expect(arg.damage).toBe(7);
    expect(arg.weaponType).toBe('pistol');
    // 投射物速度 8（archer）
    const projSpeed = Math.sqrt(arg.vx ** 2 + arg.vz ** 2);
    expect(projSpeed).toBeCloseTo(8, 5);
    expect(enemy.attackCooldown).toBe(3);
  });

  it('cooldown >0 时不发射', () => {
    const effects = makeAiEffects();
    const enemy = makeEnemy(1, 'skeleton_archer', 8, 0, {
      speed: 0, attackCooldown: 1.5, attackCooldownMax: 3,
    });
    const ctx = makeAiContext({ effects });
    ranged(enemy, ctx, 0);
    expect(effects.spawnProjectileSpy).not.toHaveBeenCalled();
  });

  it('距离超过 10m 时不发射', () => {
    const effects = makeAiEffects();
    const enemy = makeEnemy(1, 'skeleton_archer', 11, 0, {
      speed: 0, attackCooldown: 0, attackCooldownMax: 3,
    });
    const ctx = makeAiContext({ effects });
    ranged(enemy, ctx, 0);
    expect(effects.spawnProjectileSpy).not.toHaveBeenCalled();
  });

  it('高度差超过 2.8 时不发射', () => {
    const effects = makeAiEffects();
    const player = makePlayer({ x: 0, y: 0, z: 0 });
    const enemy = makeEnemy(1, 'skeleton_archer', 8, 0, {
      y: 2.9,
      speed: 0,
      attackCooldown: 0,
      attackCooldownMax: 3,
    });
    const ctx = makeAiContext({ player, effects });
    ranged(enemy, ctx, 0);
    expect(effects.spawnProjectileSpy).not.toHaveBeenCalled();
  });

  it('necromancer 投射物速度为 6', () => {
    const effects = makeAiEffects();
    const enemy = makeEnemy(1, 'necromancer', 10, 0, {
      speed: 0, attackCooldown: 0, attackCooldownMax: 4,
    });
    const ctx = makeAiContext({ effects });
    ranged(enemy, ctx, 0);
    const arg = effects.spawnProjectileSpy.mock.calls[0][0];
    const projSpeed = Math.sqrt(arg.vx ** 2 + arg.vz ** 2);
    expect(projSpeed).toBeCloseTo(6, 5);
  });
});
