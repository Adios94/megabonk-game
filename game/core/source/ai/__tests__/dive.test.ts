/**
 * dive 行为单元测试 —— gargoyle 的飞行 → 俯冲咬击 → 起飞状态机。
 */
import { describe, it, expect } from 'vitest';
import { dive } from '../behaviors/dive.ts';
import { makeEnemy, makeAiContext, makePlayer, makeAiEffects } from './_fixtures.ts';

describe('dive brain (gargoyle)', () => {
  it('flying 时 y=1.8 + 朝玩家移动', () => {
    const player = makePlayer({ x: 10, z: 0 });
    // attackCooldown>0 → 不会立刻 transition 到 diving
    const enemy = makeEnemy(1, 'gargoyle', 0, 0, { speed: 0, attackCooldown: 2 });
    const ctx = makeAiContext({ player, dt: 0 });
    dive(enemy, ctx, 0);
    expect(enemy.y).toBe(1.8);
    expect(enemy.targetX).toBe(10);
    expect(enemy.targetZ).toBe(0);
    expect(enemy.diveState).toBe('flying');
  });

  it('flying 时飞行高度跟随当前地形', () => {
    const player = makePlayer({ x: 10, z: 0 });
    const enemy = makeEnemy(1, 'gargoyle', 0, 0, { speed: 3, attackCooldown: 2 });
    const ctx = makeAiContext({
      player,
      dt: 1,
      getTerrainHeight: (x) => x, // 模拟沿 +x 上坡
    });
    dive(enemy, ctx, 0);
    expect(enemy.x).toBeCloseTo(4.5, 5); // speed 3 × dive speedMult 1.5 × dt 1
    expect(enemy.y).toBeCloseTo(enemy.x + 1.8, 5);
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

  it('diving 抵达落点 → 咬击伤害（玩家在咬击半径内）+ 转 rising', () => {
    const effects = makeAiEffects();
    const player = makePlayer({ x: 0, z: 0 });
    // 敌人已在锁定落点上（dist<=0.5），玩家距离=1 在 BITE_RADIUS(2) 内
    const enemy = makeEnemy(1, 'gargoyle', 1, 0, {
      y: 1.0,  // BITE_HEIGHT
      diveState: 'diving',
      diveTimer: 0.4,
      chargeTargetX: 1, chargeTargetZ: 0,
      damage: 25,
      speed: 0,  // 隔离横移
    });
    const ctx = makeAiContext({ player, effects, dt: 0.05 });
    dive(enemy, ctx, 0);
    expect(enemy.diveState).toBe('rising');
    expect(effects.damagePlayerSpy).toHaveBeenCalledWith(25);
    // 咬完不落地：y 维持在咬击高度（>= BITE_HEIGHT 1.0）
    expect(enemy.y).toBeGreaterThanOrEqual(1.0);
  });

  it('diving timer 到但玩家已躲开 → 不造成伤害仍起飞', () => {
    const effects = makeAiEffects();
    const enemy = makeEnemy(1, 'gargoyle', 0, 0, {
      y: 1.0,  // BITE_HEIGHT
      diveState: 'diving',
      diveTimer: 0.02,  // 这一帧计时归零
      chargeTargetX: 0, chargeTargetZ: 0,
      damage: 25, speed: 0,
    });
    const ctx = makeAiContext({
      player: makePlayer({ x: 999, z: 999 }),  // 玩家已远离咬击半径
      effects,
      dt: 0.05,
    });
    dive(enemy, ctx, 0);
    expect(enemy.diveState).toBe('rising');
    expect(effects.damagePlayerSpy).not.toHaveBeenCalled();
  });

  it('diving 命中水平半径但高度差超过 2.8 → 不造成伤害', () => {
    const effects = makeAiEffects();
    const player = makePlayer({ x: 0, y: 4, z: 0 });
    const enemy = makeEnemy(1, 'gargoyle', 1, 0, {
      y: 1.0,
      diveState: 'diving',
      diveTimer: 0.4,
      chargeTargetX: 1,
      chargeTargetZ: 0,
      damage: 25,
      speed: 0,
    });
    const ctx = makeAiContext({ player, effects, dt: 0.05 });
    dive(enemy, ctx, 0);
    expect(enemy.diveState).toBe('rising');
    expect(effects.damagePlayerSpy).not.toHaveBeenCalled();
  });

  it('rising 上升到 y>=1.8 → flying（重置 attackCooldown）', () => {
    const enemy = makeEnemy(1, 'gargoyle', 0, 0, {
      y: 1.6,
      diveState: 'rising',
      diveTimer: 0.5,
      attackCooldownMax: 3.0,
      attackCooldown: 0,
    });
    const ctx = makeAiContext({ dt: 0.05 });
    dive(enemy, ctx, 0);
    // y += 6*0.05 = 0.3 → 1.9, clamp to 1.8
    expect(enemy.y).toBe(1.8);
    expect(enemy.diveState).toBe('flying');
    expect(enemy.attackCooldown).toBe(3.0);
  });
});
