/**
 * projectiles.tickProjectiles 单元测试 —— 移动 / 寿命 / 出界 / 地形 clamp.
 */
import { describe, it, expect } from 'vitest';
import { tickProjectiles } from '../projectiles.ts';
import { makeEngine } from './_fixtures.ts';
import type { ProjectileState } from '../../types.ts';

function makeProj(overrides: Partial<ProjectileState> = {}): ProjectileState {
  return {
    id: 1,
    weaponType: 'sword',
    x: 0, y: 1, z: 0,
    vx: 10, vy: 0, vz: 0,
    damage: 10,
    bouncesLeft: 0, pierceLeft: 0,
    lifetime: 2.0, radius: 0.3,
    fromPlayer: true,
    hitEnemyIds: [],
    ...overrides,
  };
}

describe('tickProjectiles: 移动', () => {
  it('普通投射物按 v*dt 移动', () => {
    const engine = makeEngine();
    const proj = makeProj({ vx: 10, vy: 0, vz: 5 });
    engine.state.projectiles.push(proj);
    tickProjectiles(engine, 0.1);
    expect(proj.x).toBeCloseTo(1.0, 5);
    expect(proj.z).toBeCloseTo(0.5, 5);
  });

  it('orbiting=true 时不走线性移动 (走 updateOrbitingProjectile)', () => {
    const engine = makeEngine();
    engine.state.player.y = 4;
    const proj = makeProj({ orbiting: true, orbitAngle: 0, orbitRadius: 5, orbitSpeed: 1, vx: 0, vz: 0 });
    engine.state.projectiles.push(proj);
    tickProjectiles(engine, 0.1);
    // orbitAngle 应推进, x/z 应位于半径 5 圆周
    const dist = Math.sqrt(proj.x ** 2 + proj.z ** 2);
    expect(dist).toBeCloseTo(5, 4);
    expect(proj.y).toBe(5);
  });
});

describe('tickProjectiles: 寿命', () => {
  it('lifetime 衰减 dt, ≤0 时 splice', () => {
    const engine = makeEngine();
    engine.state.projectiles.push(makeProj({ lifetime: 0.05 }));
    tickProjectiles(engine, 0.1);
    expect(engine.state.projectiles).toHaveLength(0);
  });

  it('lifetime > 0 不删', () => {
    const engine = makeEngine();
    engine.state.projectiles.push(makeProj({ lifetime: 1.0 }));
    tickProjectiles(engine, 0.1);
    expect(engine.state.projectiles).toHaveLength(1);
    expect(engine.state.projectiles[0].lifetime).toBeCloseTo(0.9, 5);
  });
});

describe('tickProjectiles: rehit timer', () => {
  it('gravitational 投射物按 rehitInterval 清空命中表', () => {
    const engine = makeEngine();
    const proj = makeProj({
      gravitational: true,
      gravityStrength: 5,
      rehitInterval: 0.5,
      rehitTimer: 0.1,
      hitEnemyIds: [1, 2],
      vx: 0,
      vz: 0,
    });
    engine.state.projectiles.push(proj);

    tickProjectiles(engine, 0.2);

    expect(proj.hitEnemyIds).toEqual([]);
    expect(proj.rehitTimer).toBeCloseTo(0.4, 5);
  });
});

describe('tickProjectiles: 出界', () => {
  it('|x| > (mapSize+20)/2 时 splice', () => {
    const engine = makeEngine();
    engine.config = { ...engine.config, mapSize: 100 };  // halfMap = 60
    engine.state.projectiles.push(makeProj({ x: 70, vx: 0, vz: 0 }));
    tickProjectiles(engine, 0.01);
    expect(engine.state.projectiles).toHaveLength(0);
  });

  it('|z| > halfMap 也 splice', () => {
    const engine = makeEngine();
    engine.config = { ...engine.config, mapSize: 100 };
    engine.state.projectiles.push(makeProj({ z: 70, vx: 0, vz: 0 }));
    tickProjectiles(engine, 0.01);
    expect(engine.state.projectiles).toHaveLength(0);
  });
});

describe('tickProjectiles: 地形 y clamp', () => {
  it('y 低于地形 + 0.1 时上抬', () => {
    const engine = makeEngine();
    // (38, 38) 是 nest y=6
    const proj = makeProj({ x: 38, y: 0.5, z: 38, vx: 0, vy: 0, vz: 0 });
    engine.state.projectiles.push(proj);
    tickProjectiles(engine, 0.01);
    expect(proj.y).toBeGreaterThanOrEqual(6.1);  // terrain 6 + 0.1
  });

  it('y 已高于地形则不动', () => {
    const engine = makeEngine();
    const proj = makeProj({ x: 0, y: 10, z: 0, vx: 0, vy: 0, vz: 0 });
    engine.state.projectiles.push(proj);
    tickProjectiles(engine, 0.01);
    expect(proj.y).toBe(10);
  });
});
