/**
 * charge 行为单元测试 —— skeleton_knight 的状态机。
 *
 * 验证 idle → windup → charging → cooldown → idle 完整 4 状态切换。
 */
import { describe, it, expect } from 'vitest';
import { charge } from '../behaviors/charge.ts';
import { makeEnemy, makeAiContext, makePlayer } from './_fixtures.ts';

describe('charge brain (skeleton_knight)', () => {
  it('idle → windup（dist<15 + cooldown<=0）', () => {
    const player = makePlayer({ x: 0, z: 0 });
    const enemy = makeEnemy(1, 'skeleton_knight', 5, 0, { attackCooldown: 0 });
    const ctx = makeAiContext({ player });
    charge(enemy, ctx, 0);
    expect(enemy.chargeState).toBe('windup');
    expect(enemy.chargeTimer).toBeCloseTo(0.8, 5);
    expect(enemy.chargeTargetX).toBe(0);
    expect(enemy.chargeTargetZ).toBe(0);
  });

  it('idle 距离过远（dist>=15）保持 idle 并 chase', () => {
    const player = makePlayer({ x: 0, z: 0 });
    const enemy = makeEnemy(1, 'skeleton_knight', 20, 0);
    const ctx = makeAiContext({ player });
    charge(enemy, ctx, 0);
    expect(enemy.chargeState).toBe('idle');
    expect(enemy.targetX).toBe(0);
    expect(enemy.targetZ).toBe(0);
  });

  it('windup 倒计时到 0 → charging（锁定目标）', () => {
    const player = makePlayer({ x: 7, z: 3 });
    const enemy = makeEnemy(1, 'skeleton_knight', 0, 0, {
      chargeState: 'windup', chargeTimer: 0.05,
    });
    const ctx = makeAiContext({ player, dt: 0.1 });
    charge(enemy, ctx, 0);
    expect(enemy.chargeState).toBe('charging');
    expect(enemy.chargeTimer).toBeCloseTo(0.5, 5);
    // 锁定 player 当前坐标
    expect(enemy.chargeTargetX).toBe(7);
    expect(enemy.chargeTargetZ).toBe(3);
    // hitFlashTimer 红色脉冲
    expect(enemy.hitFlashTimer).toBeCloseTo(0.1, 5);
  });

  it('charging 高速移动 (speed×3)，timer 到 → cooldown', () => {
    const enemy = makeEnemy(1, 'skeleton_knight', 0, 0, {
      chargeState: 'charging',
      chargeTimer: 0.001,  // 立即过期
      chargeTargetX: 100, chargeTargetZ: 0,
      attackCooldownMax: 2.0,
      speed: 5,
    });
    const ctx = makeAiContext({ dt: 0.1 });
    const before = enemy.x;
    charge(enemy, ctx, 0);
    // 朝目标移动了 5×3×0.1 = 1.5 距离
    expect(enemy.x - before).toBeCloseTo(1.5, 4);
    // timer 到 → cooldown
    expect(enemy.chargeState).toBe('cooldown');
    expect(enemy.chargeTimer).toBeCloseTo(3.0, 5);
    expect(enemy.attackCooldown).toBe(2.0);
  });

  it('cooldown 倒计时到 0 → idle', () => {
    const enemy = makeEnemy(1, 'skeleton_knight', 0, 0, {
      chargeState: 'cooldown',
      chargeTimer: 0.05,
    });
    const ctx = makeAiContext({ dt: 0.1 });
    charge(enemy, ctx, 0);
    expect(enemy.chargeState).toBe('idle');
  });
});
