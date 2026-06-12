import { describe, expect, it } from 'vitest';
import { grantRelic, applyRelicKillEffects, applyRelicTargetDamage } from '../relics.ts';
import { applyShrineReward } from '../shrines.ts';
import { recomputePlayerStats } from '../../stats/recomputePlayerStats.ts';
import { getShopBonuses } from '../../shop.ts';
import { makeEngine, makeEnemy } from './_fixtures.ts';

describe('grantRelic', () => {
  it('keen_lens 通过 stat pipeline 立即生效', () => {
    const engine = makeEngine();

    grantRelic(engine, 'keen_lens');

    expect(engine.state.player.relicStacks.keen_lens).toBe(1);
    expect(engine.state.player.critChance).toBeCloseTo(0.08 + 0.03, 5);
  });

  it('iron_heart 多层通过 stat pipeline 重算 maxHp 和 armor', () => {
    const engine = makeEngine();

    grantRelic(engine, 'iron_heart');
    grantRelic(engine, 'iron_heart');
    grantRelic(engine, 'iron_heart');

    expect(engine.state.player.relicStacks.iron_heart).toBe(3);
    expect(engine.state.player.maxHp).toBeCloseTo(100 * 1.36, 5);
    expect(engine.state.player.armor).toBe(6);
  });
});

describe('applyRelicTargetDamage (精英伤害)', () => {
  it('普通敌人不加成', () => {
    const engine = makeEngine();
    const normal = makeEnemy(1, 'skeleton_soldier', 0, 0);
    expect(applyRelicTargetDamage(engine, 100, normal)).toBe(100);
  });

  it('charge shrine 的 eliteDamageMult 对精英生效（回归：曾是死字段）', () => {
    const engine = makeEngine();
    engine.state.player.eliteDamageMult = 1.5; // elite_damage shrine 奖励
    const elite = makeEnemy(1, 'skeleton_soldier', 0, 0, { isElite: true });
    expect(applyRelicTargetDamage(engine, 100, elite)).toBe(150);
  });

  it('elite_writ stack 与 shrine eliteDamageMult 相乘、不重复计入', () => {
    const engine = makeEngine();
    grantRelic(engine, 'elite_writ'); // stack 1
    grantRelic(engine, 'elite_writ'); // stack 2 → ×1.20
    engine.state.player.eliteDamageMult = 1.5; // shrine ×1.5
    const elite = makeEnemy(1, 'skeleton_soldier', 0, 0, { isElite: true });
    // 100 × (1 + 2×0.10) × 1.5 = 180
    expect(applyRelicTargetDamage(engine, 100, elite)).toBe(180);
  });
});

describe('applyRelicKillEffects', () => {
  it('blood_fang 击杀普通怪回复 2 HP，精英回复 3 HP', () => {
    const engine = makeEngine();
    const player = engine.state.player;
    player.relicStacks.blood_fang = 1;
    player.hp = 50;

    applyRelicKillEffects(engine, makeEnemy(1, 'skeleton_soldier', 0, 0));
    expect(player.hp).toBe(52);

    applyRelicKillEffects(engine, makeEnemy(2, 'skeleton_soldier', 0, 0, { isElite: true }));
    expect(player.hp).toBe(55);
  });
});

describe('charge shrine 加成在 recompute 后仍保留（回归）', () => {
  it('damage shrine 奖励不被开宝箱触发的 recompute 清掉', () => {
    const engine = makeEngine();
    const player = engine.state.player;
    const { character } = engine.config;

    // 先建立干净 base
    recomputePlayerStats(player, character, getShopBonuses());
    const baseDmg = player.damageMultiplier;

    applyShrineReward(player, 'damage', 0.5); // +50%
    recomputePlayerStats(player, character, getShopBonuses());
    expect(player.damageMultiplier).toBeCloseTo(baseDmg * 1.5, 5);

    // 开宝箱拿遗物 → grantRelic 内部再次 recompute；shrine 加成应仍在
    grantRelic(engine, 'keen_lens');
    expect(player.damageMultiplier).toBeCloseTo(baseDmg * 1.5, 5);
  });

  it('crit_damage shrine 奖励（加法）也在 recompute 后保留', () => {
    const engine = makeEngine();
    const player = engine.state.player;
    const { character } = engine.config;

    recomputePlayerStats(player, character, getShopBonuses());
    const baseCrit = player.critDamage;

    applyShrineReward(player, 'crit_damage', 0.4);
    recomputePlayerStats(player, character, getShopBonuses());
    expect(player.critDamage).toBeCloseTo(baseCrit + 0.4, 5);
  });
});
