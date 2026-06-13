import { describe, expect, it } from 'vitest';
import { getUpgradePreviewLines } from '../upgradePreview.ts';
import { emptyWeaponGrowth } from '../systems/weapons.ts';
import type { PlayerState, UpgradeOption } from '../types.ts';

function makePlayer(weapons: PlayerState['weapons']): PlayerState {
  return {
    x: 0, y: 0, z: 0, rotation: 0,
    velocityY: 0, isGrounded: true, isJumping: false,
    isSliding: false, slideTimer: 0, slideSpeedBoost: 0, bunnyHopTimer: 0,
    hp: 100, maxHp: 100, level: 5, xp: 0, xpToNext: 100,
    speed: 4, currentSpeed: 0,
    damageMultiplier: 1, attackSpeedMultiplier: 1,
    critChance: 0.05, critDamage: 1.5,
    armor: 0, pickupRadius: 2,
    weapons, tomes: [], passives: [],
    dashCooldown: 0, dashCooldownMax: 5, dashTimer: 0, invincibleTimer: 0,
    alive: true, character: 'megachad',
    maxWeaponSlots: 5, activeWeaponSlots: 2, gold: 0, relicStacks: {},
    comboCount: 0, comboTimer: 0,
  };
}

describe('getUpgradePreviewLines', () => {
  it('武器升级 common 显示伤害增量', () => {
    const player = makePlayer([{
      type: 'sword', level: 1, cooldownTimer: 0, growth: emptyWeaponGrowth(),
    }]);
    const option: UpgradeOption = {
      id: 'x', kind: 'weapon_upgrade', rarity: 'common',
      weaponType: 'sword', currentLevel: 1, newLevel: 2,
    };
    const lines = getUpgradePreviewLines(option, player);
    expect(lines.some(l => l.labelKey === 'upgrade.stat.damage' && l.value === '+3')).toBe(true);
  });

  it('武器升级 legendary 伤害增量为 common 的 2 倍', () => {
    const player = makePlayer([{
      type: 'sword', level: 1, cooldownTimer: 0, growth: emptyWeaponGrowth(),
    }]);
    const common: UpgradeOption = {
      id: 'c', kind: 'weapon_upgrade', rarity: 'common',
      weaponType: 'sword', currentLevel: 1, newLevel: 2,
    };
    const legendary: UpgradeOption = {
      id: 'l', kind: 'weapon_upgrade', rarity: 'legendary',
      weaponType: 'sword', currentLevel: 1, newLevel: 2,
    };
    const commonDmg = getUpgradePreviewLines(common, player).find(l => l.labelKey === 'upgrade.stat.damage')?.value;
    const legDmg = getUpgradePreviewLines(legendary, player).find(l => l.labelKey === 'upgrade.stat.damage')?.value;
    expect(commonDmg).toBe('+3');
    expect(legDmg).toBe('+6');
  });

  it('典籍攻速显示 +10.0%', () => {
    const option: UpgradeOption = {
      id: 't', kind: 'tome', rarity: 'common',
      tomeType: 'attack_speed_tome', currentLevel: 0, newLevel: 1,
    };
    const lines = getUpgradePreviewLines(option, makePlayer([]));
    expect(lines[0]).toEqual({ labelKey: 'upgrade.stat.attackSpeed', value: '+10.0%' });
  });

  it('典籍稀有度影响本次升级数值', () => {
    const option: UpgradeOption = {
      id: 'lt', kind: 'tome', rarity: 'legendary',
      tomeType: 'life_tome', currentLevel: 0, newLevel: 1,
    };
    const lines = getUpgradePreviewLines(option, makePlayer([]));
    expect(lines[0]).toEqual({ labelKey: 'upgrade.stat.maxHp', value: '+30' });
  });

  it('速度典籍 rare 预览显示 +12.8%', () => {
    const option: UpgradeOption = {
      id: 'speed', kind: 'tome', rarity: 'rare',
      tomeType: 'speed_tome', currentLevel: 0, newLevel: 1,
    };
    const lines = getUpgradePreviewLines(option, makePlayer([]));
    expect(lines[0]).toEqual({ labelKey: 'upgrade.stat.moveSpeed', value: '+12.8%' });
  });
});
