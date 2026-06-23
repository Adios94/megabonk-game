/**
 * lightningChain (lightning_staff) 单元测试。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { lightningChain } from '../lightningChain.ts';
import { createWorld } from '../../world.ts';
import { makePlayer, makeEnemy, makeBoss, makeStats, makeCtx } from './_helpers.ts';

describe('lightningChain', () => {
  let mathRandomSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99); });
  afterEach(() => { mathRandomSpy.mockRestore(); });

  it('no enemy in range → no fire (early return)', () => {
    const player = makePlayer();
    const farEnemy = makeEnemy(1, 0, 50);   // 远超 range=8
    const ctx = makeCtx(player, [farEnemy], null, makeStats({ damage: 15, range: 8, chains: 3 }), 'lightning_staff', 'lightningChain', ['lightning_staff']);
    lightningChain(createWorld(), ctx);
    expect(ctx.effects.damageEvents).toHaveLength(0);
    expect(farEnemy.hp).toBe(100);
  });

  it('1 enemy in range, chains=1 → 1 damageEvent (no further chains)', () => {
    const player = makePlayer();
    const enemy = makeEnemy(1, 0, 3);
    const ctx = makeCtx(player, [enemy], null, makeStats({ damage: 15, range: 8, chains: 1 }), 'lightning_staff', 'lightningChain', ['lightning_staff']);
    lightningChain(createWorld(), ctx);
    expect(ctx.effects.damageEvents).toHaveLength(1);
    expect(enemy.hp).toBe(100 - 15);
  });

  it('3 enemies, chains=3 → 3 damageEvents (primary + 2 chains)', () => {
    const player = makePlayer();
    const e1 = makeEnemy(1, 0, 1);                       // 主目标 (最近)
    const e2 = makeEnemy(2, 0, 1 + 8 * 0.6 * 0.9);       // 链跳: 在 e1 周围 range×0.6=4.8 内
    const e3 = makeEnemy(3, 0, 1 + 8 * 0.6 * 0.9 * 2);   // e2 周围
    const ctx = makeCtx(player, [e1, e2, e3], null, makeStats({ damage: 15, range: 8, chains: 3 }), 'lightning_staff', 'lightningChain', ['lightning_staff']);
    lightningChain(createWorld(), ctx);
    expect(ctx.effects.damageEvents).toHaveLength(3);
    // 主命中 = 15
    expect(e1.hp).toBe(100 - 15);
    // 链衰减 = round(15 × 0.7) = 11 (注意 computeWeaponDamage 内部用 base × 0.7 = 10.5, 然后 ×1.0 dM = 10.5, round = 11... 测 11 还是 10? 浮点取舍)
    // 实际: stats.damage * CHAIN_DECAY = 15 * 0.7 = 10.5
    //      computeWeaponDamage(10.5, dM=1.0, no crit) = round(10.5) = 11 (向偶数 → 10? 看 JS Math.round)
    // JS Math.round(10.5) = 11 (向上取整 0.5)
    expect(e2.hp).toBe(100 - 11);
    expect(e3.hp).toBe(100 - 11);
  });

  it('boss in range with chainsLeft > 0 → boss receives chain hit', () => {
    const player = makePlayer();
    const enemy = makeEnemy(1, 0, 1);
    const boss = makeBoss(0, 1.5, 2000);  // 在 e1 附近, 在 range×0.6=4.8 内
    const ctx = makeCtx(player, [enemy], boss, makeStats({ damage: 15, range: 8, chains: 2 }), 'lightning_staff', 'lightningChain', ['lightning_staff']);
    lightningChain(createWorld(), ctx);
    // 主命中 enemy + 链命中 boss (无其它 enemy 可链, chainsLeft=1, boss 在 range 内)
    expect(enemy.hp).toBe(100 - 15);
    expect(boss.hp).toBe(2000 - 11);  // 链衰减 round(15×0.7)
    expect(ctx.effects.damageEvents).toHaveLength(2);
  });

  it('only boss in range → boss as primary target (full damage, 不走链衰减)', () => {
    const player = makePlayer();
    const boss = makeBoss(0, 3, 2000);   // 在 range=8 内, 无其它敌人
    const ctx = makeCtx(player, [], boss, makeStats({ damage: 15, range: 8, chains: 2 }), 'lightning_staff', 'lightningChain', ['lightning_staff']);
    lightningChain(createWorld(), ctx);
    // boss 应作为主目标被命中，伤害为完整 15（非链衰减 11）
    expect(boss.hp).toBe(2000 - 15);
    expect(ctx.effects.damageEvents).toHaveLength(1);
  });

  it('boss as primary 时，末尾的 boss 兜底不会再扣一次血', () => {
    const player = makePlayer();
    const boss = makeBoss(0, 3, 2000);
    const ctx = makeCtx(player, [], boss, makeStats({ damage: 15, range: 8, chains: 3 }), 'lightning_staff', 'lightningChain', ['lightning_staff']);
    lightningChain(createWorld(), ctx);
    // chains=3 但没有其它 enemy 可链，主命中 boss 后兜底逻辑被 targetIsBoss 排除
    expect(boss.hp).toBe(2000 - 15);  // 只扣 1 次
    expect(ctx.effects.damageEvents).toHaveLength(1);
  });

  it('damage uses computeWeaponDamage (dM=2.0, no crit, base=15 → primary=30)', () => {
    const player = makePlayer({ damageMultiplier: 2.0 });
    const enemy = makeEnemy(1, 0, 1);
    const ctx = makeCtx(player, [enemy], null, makeStats({ damage: 15, range: 8, chains: 1 }), 'lightning_staff', 'lightningChain', ['lightning_staff']);
    lightningChain(createWorld(), ctx);
    expect(enemy.hp).toBe(100 - 30);  // round(15 × 2.0) = 30
  });
});
