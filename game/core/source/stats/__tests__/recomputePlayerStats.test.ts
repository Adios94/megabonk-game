/**
 * recomputePlayerStats 数学等价测试.
 *
 * 旧路径 (Phase 4 末): GameInstance.recalculateTomeStats 内嵌 switch case
 * 新路径 (Phase 5):    走 stat pipeline (StatBlock + data/tomes.ts modifiers)
 *
 * 本文件以纯函数形式重新实现旧 switch case (legacyRecompute), 然后用
 * 一系列 (character × shop × tomes) fixture 对比新旧输出, 数学等价 = 全等.
 */
import { describe, it, expect } from 'vitest';
import { recomputePlayerStats, type ShopBonuses } from '../recomputePlayerStats.ts';
import {
  CHARACTER_CONFIGS,
  PLAYER_BASE_CRIT_DAMAGE,
  PLAYER_PICKUP_RADIUS,
} from '../../config.ts';
import type { PlayerState, TomeType, CharacterType } from '../../types.ts';

// ─── 旧路径的纯函数版（直接照搬 Phase 4 末的 switch case）───
function legacyRecompute(
  player: PlayerState,
  character: CharacterType,
  shop: ShopBonuses,
): void {
  const charCfg = CHARACTER_CONFIGS[character];

  let speedMult = 1.0;
  let damageMult = charCfg.damage + (shop.damage ?? 0);
  let attackSpeedMult = 1.0;
  let critChance = charCfg.critChance + (shop.critChance ?? 0);
  let critDamage = PLAYER_BASE_CRIT_DAMAGE;
  let armor = charCfg.armor + (shop.armor ?? 0);
  let pickupRadius = PLAYER_PICKUP_RADIUS + (shop.pickupRadius ?? 0);

  for (const tome of player.tomes) {
    switch (tome.type) {
      case 'attack_speed_tome':  attackSpeedMult += tome.level * 0.1; break;
      case 'speed_tome':         speedMult += tome.level * 0.08; break;
      case 'attraction_tome':    pickupRadius += tome.level * 1.2; break;
      case 'shield_tome':        armor += tome.level * 2; break;
      case 'precision_tome':
        critChance += tome.level * 0.05;
        critDamage += tome.level * 0.1;
        break;
    }
  }

  player.speed = (charCfg.speed + (shop.speed ?? 0)) * speedMult;
  player.damageMultiplier = damageMult;
  player.attackSpeedMultiplier = attackSpeedMult;
  player.critChance = critChance;
  player.critDamage = critDamage;
  player.armor = armor;
  player.pickupRadius = pickupRadius;
}

// ─── fixture 工具 ───
function makePlayer(tomes: { type: TomeType; level: number }[] = []): PlayerState {
  return {
    x: 0, y: 0, z: 0, rotation: 0,
    velocityY: 0, isGrounded: true, isJumping: false,
    isSliding: false, slideTimer: 0, slideSpeedBoost: 0, bunnyHopTimer: 0,
    hp: 100, maxHp: 100, level: 1, xp: 0, xpToNext: 10,
    speed: 0, currentSpeed: 0,
    damageMultiplier: 0, attackSpeedMultiplier: 0,
    critChance: 0, critDamage: 0,
    armor: 0, pickupRadius: 0,
    weapons: [], tomes, passives: [],
    dashCooldown: 0, dashCooldownMax: 5, dashTimer: 0, invincibleTimer: 0,
    alive: true, character: 'megachad',
    maxWeaponSlots: 2, comboCount: 0, comboTimer: 0,
  };
}

function snapshot(p: PlayerState) {
  return {
    speed: p.speed,
    damageMultiplier: p.damageMultiplier,
    attackSpeedMultiplier: p.attackSpeedMultiplier,
    critChance: p.critChance,
    critDamage: p.critDamage,
    armor: p.armor,
    pickupRadius: p.pickupRadius,
  };
}

function assertEquivalent(
  character: CharacterType,
  shop: ShopBonuses,
  tomes: { type: TomeType; level: number }[],
) {
  const a = makePlayer(tomes);
  const b = makePlayer(tomes);
  legacyRecompute(a, character, shop);
  recomputePlayerStats(b, character, shop);
  expect(snapshot(b)).toEqual(snapshot(a));
}

describe('recomputePlayerStats: 与 Phase 4 末 switch case 数学等价', () => {
  it('裸玩家 (无 tome / 无 shop)', () => {
    assertEquivalent('megachad', {}, []);
    assertEquivalent('roberto', {}, []);
    assertEquivalent('skateboard_skeleton', {}, []);
  });

  it('单个 attack_speed_tome 各等级', () => {
    for (let lv = 1; lv <= 5; lv++) {
      assertEquivalent('megachad', {}, [{ type: 'attack_speed_tome', level: lv }]);
    }
  });

  it('单个 speed_tome 各等级', () => {
    for (let lv = 1; lv <= 5; lv++) {
      assertEquivalent('megachad', {}, [{ type: 'speed_tome', level: lv }]);
    }
  });

  it('单个 attraction_tome 各等级', () => {
    for (let lv = 1; lv <= 5; lv++) {
      assertEquivalent('megachad', {}, [{ type: 'attraction_tome', level: lv }]);
    }
  });

  it('单个 shield_tome 各等级', () => {
    for (let lv = 1; lv <= 5; lv++) {
      assertEquivalent('roberto', {}, [{ type: 'shield_tome', level: lv }]);
    }
  });

  it('单个 precision_tome 各等级 (双 stat)', () => {
    for (let lv = 1; lv <= 5; lv++) {
      assertEquivalent('skateboard_skeleton', {}, [{ type: 'precision_tome', level: lv }]);
    }
  });

  it('contextual tomes 不影响 stat (thorns/knockback/luck/xp_gain/curse 任意 lv)', () => {
    assertEquivalent('megachad', {}, [
      { type: 'thorns_tome', level: 5 },
      { type: 'knockback_tome', level: 3 },
      { type: 'luck_tome', level: 3 },
      { type: 'xp_gain_tome', level: 5 },
      { type: 'curse_tome', level: 3 },
    ]);
  });

  it('多 tome 同时叠加 (max level 全开)', () => {
    assertEquivalent('megachad', {}, [
      { type: 'attack_speed_tome', level: 5 },
      { type: 'speed_tome', level: 5 },
      { type: 'attraction_tome', level: 5 },
      { type: 'shield_tome', level: 5 },
      { type: 'precision_tome', level: 5 },
    ]);
  });

  it('shop bonuses (damage/speed/critChance/armor/pickupRadius)', () => {
    const shop: ShopBonuses = {
      damage: 0.3, speed: 0.5, critChance: 0.05, armor: 5, pickupRadius: 1.0,
    };
    assertEquivalent('megachad', shop, []);
    assertEquivalent('roberto', shop, [
      { type: 'speed_tome', level: 3 },
      { type: 'shield_tome', level: 3 },
    ]);
  });

  it('shop + 多 tome 综合 (3 character × 复杂组合)', () => {
    const characters: CharacterType[] = ['megachad', 'roberto', 'skateboard_skeleton'];
    const shop: ShopBonuses = {
      damage: 0.15, speed: 0.3, critChance: 0.03, armor: 2, pickupRadius: 0.5,
    };
    for (const c of characters) {
      assertEquivalent(c, shop, [
        { type: 'attack_speed_tome', level: 2 },
        { type: 'speed_tome', level: 4 },
        { type: 'precision_tome', level: 3 },
        { type: 'shield_tome', level: 2 },
        { type: 'attraction_tome', level: 1 },
      ]);
    }
  });
});

describe('recomputePlayerStats: 边界与具体数值', () => {
  it('megachad 裸 → speed=4.0, damageMult=1.2, critDamage=1.5', () => {
    const p = makePlayer();
    recomputePlayerStats(p, 'megachad', {});
    expect(p.speed).toBe(4.0);
    expect(p.damageMultiplier).toBe(1.2);
    expect(p.attackSpeedMultiplier).toBe(1.0);
    expect(p.critChance).toBeCloseTo(0.08, 5);
    expect(p.critDamage).toBe(PLAYER_BASE_CRIT_DAMAGE);
    expect(p.armor).toBe(0);
    expect(p.pickupRadius).toBe(PLAYER_PICKUP_RADIUS);
  });

  it('megachad + speed_tome lv5 → speed = 4.0 × 1.4 = 5.6', () => {
    const p = makePlayer([{ type: 'speed_tome', level: 5 }]);
    recomputePlayerStats(p, 'megachad', {});
    expect(p.speed).toBeCloseTo(5.6, 5);
  });

  it('roberto + shield_tome lv5 → armor = 3 + 10 = 13', () => {
    const p = makePlayer([{ type: 'shield_tome', level: 5 }]);
    recomputePlayerStats(p, 'roberto', {});
    expect(p.armor).toBe(13);
  });

  it('precision_tome lv 3 → crit +15%, crit dmg +0.30', () => {
    const p = makePlayer([{ type: 'precision_tome', level: 3 }]);
    recomputePlayerStats(p, 'roberto', {});
    expect(p.critChance).toBeCloseTo(0.05 + 0.15, 5);
    expect(p.critDamage).toBeCloseTo(1.5 + 0.30, 5);
  });
});
