/**
 * chase 行为单元测试。
 *
 * 验证：
 *  - 错峰 (i % 4 === aiGroup) 时重算 target = player
 *  - 非错峰帧 target 保持不变
 *  - applyMovement 朝 target 移动 + 边界 clamp
 */
import { describe, it, expect } from 'vitest';
import { chase } from '../behaviors/chase.ts';
import { makeEnemy, makeAiContext, makePlayer } from './_fixtures.ts';

describe('chase brain', () => {
  it('在错峰帧 (i%4===aiGroup) 把 target 设为 player 坐标', () => {
    const player = makePlayer({ x: 5, z: 7 });
    const enemy = makeEnemy(1, 'skeleton_soldier', 0, 0);
    enemy.targetX = -999;
    enemy.targetZ = -999;
    const ctx = makeAiContext({ player, aiGroup: 0 });
    chase(enemy, ctx, 0);  // i=0, aiGroup=0 → 0%4===0
    expect(enemy.targetX).toBe(5);
    expect(enemy.targetZ).toBe(7);
  });

  it('非错峰帧不重算 target', () => {
    const player = makePlayer({ x: 5, z: 7 });
    const enemy = makeEnemy(1, 'skeleton_soldier', 0, 0);
    enemy.targetX = 10;
    enemy.targetZ = 10;
    const ctx = makeAiContext({ player, aiGroup: 0 });
    chase(enemy, ctx, 1);  // i=1, aiGroup=0 → 1%4!==0
    // target 保持
    expect(enemy.targetX).toBe(10);
    expect(enemy.targetZ).toBe(10);
  });

  it('每帧朝 target 移动（speed × dt 距离）', () => {
    const enemy = makeEnemy(1, 'skeleton_soldier', 0, 0);
    enemy.targetX = 100;  // 远超 dist
    enemy.targetZ = 0;
    enemy.speed = 6;
    const ctx = makeAiContext({ aiGroup: 99, dt: 1 / 60 });  // 不重算 target
    const before = enemy.x;
    chase(enemy, ctx, 0);
    expect(enemy.x).toBeGreaterThan(before);
    expect(enemy.x).toBeCloseTo(6 / 60, 5);  // moveSpeed = speed*dt
  });

  it('被边界 clamp（mapSize+10 半径）', () => {
    const enemy = makeEnemy(1, 'skeleton_soldier', 100, 0);  // 远超半径
    enemy.targetX = 200;
    enemy.targetZ = 0;
    const ctx = makeAiContext({ mapSize: 100 });
    chase(enemy, ctx, 99);
    expect(enemy.x).toBeLessThanOrEqual((100 + 10) * 0.5);
  });

  it('finalSwarm 时速度 ×1.2', () => {
    const a = makeEnemy(1, 'skeleton_soldier', 0, 0);
    a.targetX = 100; a.targetZ = 0; a.speed = 6;
    const b = makeEnemy(2, 'skeleton_soldier', 0, 0);
    b.targetX = 100; b.targetZ = 0; b.speed = 6;
    chase(a, makeAiContext({ aiGroup: 99, finalSwarm: false, dt: 1 }), 0);
    chase(b, makeAiContext({ aiGroup: 99, finalSwarm: true, dt: 1 }), 0);
    expect(b.x).toBeCloseTo(a.x * 1.2, 4);
  });
});
