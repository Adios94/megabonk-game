/**
 * flameAura (flame_ring) 单元测试。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flameAura } from '../flameAura.ts';
import { createWorld } from '../../world.ts';
import { makePlayer, makeEnemy, makeBoss, makeStats, makeCtx } from './_helpers.ts';

describe('flameAura', () => {
  let mathRandomSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99); });
  afterEach(() => { mathRandomSpy.mockRestore(); });

  it('1 enemy in aoeRadius → 1 damageEvent', () => {
    const player = makePlayer();
    const enemy = makeEnemy(1, 0, 2);  // 距离 2 < aoeRadius=3.5
    const ctx = makeCtx(player, [enemy], null, makeStats({ damage: 4, aoeRadius: 3.5 }), 'flame_ring', 'flameAura', ['flame_ring']);
    flameAura(createWorld(), ctx);
    expect(ctx.effects.damageEvents).toHaveLength(1);
    expect(enemy.hp).toBe(100 - 4);
    expect(enemy.hitFlashTimer).toBe(0.1);  // flame_ring 用 0.1 不是 0.15
  });

  it('enemy 超出 aoeRadius → 不命中', () => {
    const player = makePlayer();
    const farEnemy = makeEnemy(1, 0, 10);
    const ctx = makeCtx(player, [farEnemy], null, makeStats({ damage: 4, aoeRadius: 3.5 }), 'flame_ring', 'flameAura', ['flame_ring']);
    flameAura(createWorld(), ctx);
    expect(ctx.effects.damageEvents).toHaveLength(0);
    expect(farEnemy.hp).toBe(100);
  });

  it('boss in aoeRadius → boss 受伤', () => {
    const player = makePlayer();
    const boss = makeBoss(0, 2);
    const ctx = makeCtx(player, [], boss, makeStats({ damage: 4, aoeRadius: 3.5 }), 'flame_ring', 'flameAura', ['flame_ring']);
    flameAura(createWorld(), ctx);
    expect(boss.hp).toBe(2000 - 4);
    expect(boss.hitFlashTimer).toBe(0.15);  // boss 用 0.15
    expect(ctx.effects.damageEvents).toHaveLength(1);
  });

  it('多 enemy + boss → 全部受伤, 多个 damageEvents', () => {
    const player = makePlayer();
    const e1 = makeEnemy(1, 0, 1);
    const e2 = makeEnemy(2, 2, 0);
    const boss = makeBoss(0, 3);
    const ctx = makeCtx(player, [e1, e2], boss, makeStats({ damage: 4, aoeRadius: 3.5 }), 'flame_ring', 'flameAura', ['flame_ring']);
    flameAura(createWorld(), ctx);
    expect(ctx.effects.damageEvents).toHaveLength(3);
    expect(e1.hp).toBe(100 - 4);
    expect(e2.hp).toBe(100 - 4);
    expect(boss.hp).toBe(2000 - 4);
  });

  it('死敌 (hp<=0) 跳过', () => {
    const player = makePlayer();
    const dead = makeEnemy(1, 0, 1);
    dead.hp = 0;
    const ctx = makeCtx(player, [dead], null, makeStats({ damage: 4, aoeRadius: 3.5 }), 'flame_ring', 'flameAura', ['flame_ring']);
    flameAura(createWorld(), ctx);
    expect(ctx.effects.damageEvents).toHaveLength(0);
    expect(dead.hp).toBe(0);
  });
});
