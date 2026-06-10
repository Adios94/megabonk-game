/**
 * applyMovement (敌人横向阻挡) 集成测试 —— 阶段 2 引入，阶段 3 改用 ctx.geo.
 *
 * 验证：
 *  - 默认 NEON_CRUCIBLE_GEOMETRY：敌人正常移动
 *  - ctx.geo 携带 wall_：敌人尊重墙，沿墙滑行
 *  - gargoyle 飞行单位忽略所有阻挡
 */
import { describe, it, expect } from 'vitest';
import { applyMovement } from '../behaviors/_move.ts';
import { makeLevelGeometry, type LevelGeometry } from '../../systems/collision.ts';
import { makeEnemy, makeAiContext } from './_fixtures.ts';
import type { LevelData } from '../../types.ts';

function geoWith(walls: LevelData['walls']): LevelGeometry {
  return makeLevelGeometry({
    collisionRects: [],
    walls,
    climbVolumes: [],
    ramps: [],
    spawnPoints: {},
    chestSpawns: [],
  });
}

describe('applyMovement 横向阻挡（阶段 2/3）', () => {
  it('默认 geo → 敌人朝 target 直接移动', () => {
    const enemy = makeEnemy(1, 'skeleton_soldier', 0, 0);
    enemy.targetX = 10;
    enemy.targetZ = 0;
    enemy.speed = 6;
    const ctx = makeAiContext({ dt: 1 / 60 });
    applyMovement(enemy, ctx);
    expect(enemy.x).toBeCloseTo(0.1, 5); // speed 6 * dt 1/60 = 0.1
    expect(enemy.z).toBe(0);
  });

  it('关卡有 wall_ 在 target 路径上 → 敌人被挡（沿墙滑或停下）', () => {
    // 墙横在 (0, 0.5) 厚 0.3，敌人 (0, 0) 想去 (0, 5)
    const geo = geoWith([
      { cx: 0, cz: 0.5, halfW: 5, halfD: 0.3, bottomY: 0, topY: 3 },
    ]);
    const enemy = makeEnemy(1, 'skeleton_soldier', 0, 0);
    enemy.targetX = 0;
    enemy.targetZ = 5;
    enemy.speed = 6;
    const ctx = makeAiContext({ dt: 1 / 60, geo });
    applyMovement(enemy, ctx);
    // 没穿过墙：敌人 footprint radius 0.4，墙 halfD 0.3 → 碰撞带 z ∈ [-0.2, 1.2]
    // 敌人 z 推到 0.1 后进入墙的 +radius 范围 → 沿 X 滑（或停留）
    expect(enemy.z).toBeLessThan(0.5);
  });

  it('gargoyle 飞行单位忽略 wall_，直接到目标', () => {
    const geo = geoWith([
      { cx: 0, cz: 0.5, halfW: 5, halfD: 0.3, bottomY: 0, topY: 8 },
    ]);
    const enemy = makeEnemy(1, 'gargoyle', 0, 0);
    enemy.targetX = 0;
    enemy.targetZ = 5;
    enemy.speed = 6;
    const ctx = makeAiContext({ dt: 1 / 60, geo });
    applyMovement(enemy, ctx);
    // gargoyle behavior='dive' → speedMult 1.5：z 从 0 推进 speed 6 * 1.5 * dt 1/60 = 0.15
    expect(enemy.z).toBeCloseTo(0.15, 5);
    // y 不变（飞行单位不贴地）
    expect(enemy.y).toBe(3);
  });

  it('地图边界 clamp 仍然有效', () => {
    const enemy = makeEnemy(1, 'skeleton_soldier', 100, 0);
    enemy.targetX = 200;
    enemy.targetZ = 0;
    const ctx = makeAiContext({ mapSize: 100, dt: 1 / 60 });
    applyMovement(enemy, ctx);
    expect(enemy.x).toBeLessThanOrEqual((100 + 10) * 0.5);
  });
});
