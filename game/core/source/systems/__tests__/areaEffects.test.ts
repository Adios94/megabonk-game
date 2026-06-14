/**
 * areaEffects 系统单元测试：gas_cloud / void_ripple / scorch_trail / ray_beam。
 */
import { describe, it, expect } from 'vitest';
import { tickAreaEffects } from '../areaEffects.ts';
import { makeEngine, makeEnemy } from './_fixtures.ts';
import type { AreaEffectState } from '../../types.ts';

function enemyAt(id: number, x: number, z: number, hp = 100) {
  return makeEnemy(id, 'skeleton_soldier', x, z, { hp, maxHp: hp });
}

function gasCloud(over: Partial<AreaEffectState> = {}): AreaEffectState {
  return {
    id: 1, kind: 'gas_cloud', weaponType: 'poison_bomb',
    x: 0, y: 0, z: 0, radius: 3, lifetime: 4, maxLifetime: 4,
    damage: 10, poisonDps: 10, poisonDuration: 1.0,
    tickTimer: 0, tickInterval: 0.5,
    ...over,
  };
}

describe('gas_cloud', () => {
  it('范围内敌人被刷新中毒', () => {
    const engine = makeEngine();
    const inside = enemyAt(1, 1, 0, 100);
    const outside = enemyAt(2, 10, 0, 100);
    engine.state.enemies.push(inside, outside);
    engine.state.areaEffects.push(gasCloud());

    tickAreaEffects(engine, 1 / 60);
    expect(inside.poisonTimer ?? 0).toBeGreaterThan(0);
    expect(inside.poisonDps).toBe(10);
    expect(outside.poisonTimer ?? 0).toBe(0);
  });

  it('lifetime 到 0 后移除', () => {
    const engine = makeEngine();
    engine.state.areaEffects.push(gasCloud({ lifetime: 0.01 }));
    tickAreaEffects(engine, 1 / 60);
    expect(engine.state.areaEffects).toHaveLength(0);
  });

  it('水平范围内但垂直分层时不刷新中毒', () => {
    const engine = makeEngine();
    const below = enemyAt(1, 1, 0, 100);
    below.y = 0;
    engine.state.enemies.push(below);
    engine.state.areaEffects.push(gasCloud({ y: 4 }));

    tickAreaEffects(engine, 1 / 60);
    expect(below.poisonTimer ?? 0).toBe(0);
  });

  it('毒云周期刷新不计作 poison_master 武器命中叠层', () => {
    const engine = makeEngine();
    engine.state.player.bonds = [{ bondId: 'poison_master', tier: 2 }];
    const inside = enemyAt(1, 1, 0, 100);
    engine.state.enemies.push(inside);
    engine.state.areaEffects.push(gasCloud());

    tickAreaEffects(engine, 1 / 60);
    expect(inside.poisonTimer ?? 0).toBeGreaterThan(0);
    expect(inside.neuroStacks ?? 0).toBe(0);
  });
});

describe('void_ripple', () => {
  it('波前先扫到近处敌人，远处敌人此刻还未被结算', () => {
    const engine = makeEngine();
    const near = enemyAt(1, 1, 0, 100);   // dist 1
    const far = enemyAt(2, 5, 0, 100);    // dist 5
    engine.state.enemies.push(near, far);
    engine.state.areaEffects.push({
      id: 1, kind: 'void_ripple', weaponType: 'void_ripple',
      x: 0, y: 0, z: 0, radius: 0, lifetime: 5, maxLifetime: 5,
      damage: 20, expandSpeed: 120, maxRadius: 10, hitEnemyIds: [],
    });

    // 一帧后 radius ≈ 2 → 仅近处敌人在波前内
    tickAreaEffects(engine, 1 / 60);
    expect(near.hp).toBeLessThan(100);
    expect(far.hp).toBe(100);
  });

  it('每个敌人只结算一次', () => {
    const engine = makeEngine();
    const e = enemyAt(1, 1, 0, 100);
    engine.state.enemies.push(e);
    engine.state.areaEffects.push({
      id: 1, kind: 'void_ripple', weaponType: 'void_ripple',
      x: 0, y: 0, z: 0, radius: 0, lifetime: 5, maxLifetime: 5,
      damage: 20, expandSpeed: 120, maxRadius: 10, hitEnemyIds: [],
    });
    tickAreaEffects(engine, 1 / 60);
    const hpAfterFirst = e.hp;
    tickAreaEffects(engine, 1 / 60);
    expect(e.hp).toBe(hpAfterFirst);
  });

  it('followPlayer 时中心每帧锁定玩家当前位置', () => {
    const engine = makeEngine();
    const e = enemyAt(1, 10, 0, 100);
    engine.state.player.x = 10;
    engine.state.player.z = 0;
    engine.state.enemies.push(e);
    engine.state.areaEffects.push({
      id: 1, kind: 'void_ripple', weaponType: 'void_ripple',
      x: 0, y: 0, z: 0, radius: 0, lifetime: 5, maxLifetime: 5,
      damage: 20, expandSpeed: 120, maxRadius: 10, followPlayer: true, hitEnemyIds: [],
    });

    tickAreaEffects(engine, 1 / 60);
    expect(engine.state.areaEffects[0]?.x).toBe(10);
    expect(e.hp).toBeLessThan(100);
  });
});

describe('void_ripple height', () => {
  it('同高度平台上的敌人正常被波前结算', () => {
    const engine = makeEngine();
    const elevated = enemyAt(1, 1, 0, 100);
    elevated.y = 4;
    engine.state.enemies.push(elevated);
    engine.state.areaEffects.push({
      id: 1, kind: 'void_ripple', weaponType: 'void_ripple',
      x: 0, y: 4, z: 0, radius: 0, lifetime: 5, maxLifetime: 5,
      damage: 20, expandSpeed: 120, maxRadius: 10, hitEnemyIds: [],
    });

    tickAreaEffects(engine, 1 / 60);
    expect(elevated.hp).toBeLessThan(100);
  });

  it('水平近但垂直分层时不结算', () => {
    const engine = makeEngine();
    const below = enemyAt(1, 1, 0, 100);
    below.y = 0;
    engine.state.enemies.push(below);
    engine.state.areaEffects.push({
      id: 1, kind: 'void_ripple', weaponType: 'void_ripple',
      x: 0, y: 4, z: 0, radius: 0, lifetime: 5, maxLifetime: 5,
      damage: 20, expandSpeed: 120, maxRadius: 10, hitEnemyIds: [],
    });

    tickAreaEffects(engine, 1 / 60);
    expect(below.hp).toBe(100);
  });
});

describe('scorch_trail', () => {
  it('范围内敌人被灼伤', () => {
    const engine = makeEngine();
    const inside = enemyAt(1, 0.5, 0, 100);
    const outside = enemyAt(2, 5, 0, 100);
    engine.state.enemies.push(inside, outside);
    engine.state.areaEffects.push({
      id: 1, kind: 'scorch_trail', weaponType: 'scorch_boots',
      x: 0, y: 0, z: 0, radius: 1.0, lifetime: 2.5, maxLifetime: 2.5,
      damage: 8, tickTimer: 0, tickInterval: 0.4,
    });
    tickAreaEffects(engine, 1 / 60);
    expect(inside.hp).toBeLessThan(100);
    expect(outside.hp).toBe(100);
  });

  it('不同高度平台上的敌人不被灼伤', () => {
    const engine = makeEngine();
    const below = enemyAt(1, 0.5, 0, 100);
    below.y = 0;
    engine.state.enemies.push(below);
    engine.state.areaEffects.push({
      id: 1, kind: 'scorch_trail', weaponType: 'scorch_boots',
      x: 0, y: 4, z: 0, radius: 1.0, lifetime: 2.5, maxLifetime: 2.5,
      damage: 8, tickTimer: 0, tickInterval: 0.4,
    });
    tickAreaEffects(engine, 1 / 60);
    expect(below.hp).toBe(100);
  });

  it('灼地周期伤害不计作 arcane 武器命中充能', () => {
    const engine = makeEngine();
    engine.state.player.bonds = [{ bondId: 'arcane', tier: 2 }];
    const inside = enemyAt(1, 0.5, 0, 100);
    engine.state.enemies.push(inside);
    engine.state.areaEffects.push({
      id: 1, kind: 'scorch_trail', weaponType: 'scorch_boots',
      x: 0, y: 0, z: 0, radius: 1.0, lifetime: 2.5, maxLifetime: 2.5,
      damage: 8, tickTimer: 0, tickInterval: 0.4,
    });

    tickAreaEffects(engine, 1 / 60);
    expect(inside.hp).toBeLessThan(100);
    expect(engine.state.player.bondMystery ?? 0).toBe(0);
  });
});
