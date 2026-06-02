/**
 * dive 行为单元测试 —— gargoyle 的飞行 → 俯冲 → 落地 → 起飞状态机。
 */
import { describe, it, expect } from 'vitest';
import { dive } from '../behaviors/dive.ts';
import { makeEnemy, makeAiContext, makePlayer, makeAiEffects } from './_fixtures.ts';

describe('dive brain (gargoyle)', () => {
  it('flying 时 y=3 + 朝玩家移动', () => {
    const player = makePlayer({ x: 10, z: 0 });
    // attackCooldown>0 → 不会立刻 transition 到 diving
    const enemy = makeEnemy(1, 'gargoyle', 0, 0, { speed: 0, attackCooldown: 2 });
    const ctx = makeAiContext({ player, dt: 0 });
    dive(enemy, ctx, 0);
    expect(enemy.y).toBe(3);
    expect(enemy.targetX).toBe(10);
    expect(enemy.targetZ).toBe(0);
    expect(enemy.diveState).toBe('flying');
  });

  it('flying + cooldown<=0 → diving（锁定坐标 + timer=0.4）', () => {
    const player = makePlayer({ x: 5, z: 5 });
    const enemy = makeEnemy(1, 'gargoyle', 0, 0, { attackCooldown: 0 });
    const ctx = makeAiContext({ player });
    dive(enemy, ctx, 0);
    expect(enemy.diveState).toBe('diving');
    expect(enemy.diveTimer).toBeCloseTo(0.4, 5);
    expect(enemy.chargeTargetX).toBe(5);
    expect(enemy.chargeTargetZ).toBe(5);
  });

  it('diving 下降 (y -= 8×dt) + 朝目标 (speed×3)', () => {
    const enemy = makeEnemy(1, 'gargoyle', 0, 0, {
      y: 3,
      diveState: 'diving',
      diveTimer: 0.4,
      chargeTargetX: 10, chargeTargetZ: 0,
      speed: 4,
    });
    const ctx = makeAiContext({ dt: 0.05 });
    const beforeX = enemy.x;
    dive(enemy, ctx, 0);
    expect(enemy.y).toBeCloseTo(3 - 8 * 0.05, 4);  // y -= 8*dt
    // 朝目标 +x 移动了 4×3×0.05 = 0.6
    expect(enemy.x - beforeX).toBeCloseTo(0.6, 4);
  });

  it('diving y<=0 → landing + 落地 AOE 伤害（玩家在范围内）', () => {
    const effects = makeAiEffects();
    const player = makePlayer({ x: 0, z: 0 });
    const enemy = makeEnemy(1, 'gargoyle', 1, 0, {
      y: 0.1,  // 这一帧落地
      diveState: 'diving',
      diveTimer: 0.4,
      chargeTargetX: 0, chargeTargetZ: 0,
      damage: 25,
      speed: 0,  // 隔离横移
    });
    const ctx = makeAiContext({ player, effects, dt: 0.05 });
    dive(enemy, ctx, 0);
    expect(enemy.diveState).toBe('landing');
    expect(enemy.y).toBe(0);
    // 玩家距离=1, AOE radius=3 → 触发伤害
    expect(effects.damagePlayerSpy).toHaveBeenCalledWith(25);
  });

  it('落地 AOE 推飞旁边的小怪', () => {
    const effects = makeAiEffects();
    const garg = makeEnemy(1, 'gargoyle', 0, 0, {
      y: 0.1,
      diveState: 'diving', diveTimer: 0.4,
      chargeTargetX: 0, chargeTargetZ: 0,
      damage: 25, speed: 0,
    });
    const buddy = makeEnemy(2, 'skeleton_soldier', 1, 0);  // 1m 远
    const farAway = makeEnemy(3, 'skeleton_soldier', 100, 100);  // 太远
    const ctx = makeAiContext({
      player: makePlayer({ x: 999, z: 999 }),  // 玩家远离
      effects,
      enemies: [garg, buddy, farAway],
      dt: 0.05,
    });
    dive(garg, ctx, 0);
    expect(effects.applyKnockbackSpy).toHaveBeenCalledTimes(1);
    expect(effects.applyKnockbackSpy.mock.calls[0][0]).toBe(buddy);
  });

  it('rising 上升到 y>=3 → flying（重置 attackCooldown）', () => {
    const enemy = makeEnemy(1, 'gargoyle', 0, 0, {
      y: 2.95,
      diveState: 'rising',
      diveTimer: 0.5,
      attackCooldownMax: 3.0,
      attackCooldown: 0,
    });
    const ctx = makeAiContext({ dt: 0.05 });
    dive(enemy, ctx, 0);
    // y += 6*0.05 = 0.3, clamp to 3
    expect(enemy.y).toBe(3);
    expect(enemy.diveState).toBe('flying');
    expect(enemy.attackCooldown).toBe(3.0);
  });
});
