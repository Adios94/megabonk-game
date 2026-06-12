/**
 * Upgrade option generation for level-up screen.
 * Uses MegaBonk-style tomes (passive items) and weapons.
 */

import type { PlayerState, UpgradeOption, UpgradeRarity } from './types.ts';
import { XP_BASE, XP_GROWTH, TOME_MAX_LEVELS, WEAPON_MAX_LEVEL, MAX_WEAPONS_CAP, ALL_WEAPON_TYPES, ALL_TOME_TYPES } from './config.ts';
import { getTomePower } from './tomeProgression.ts';
import { getBondUpgradeOptions } from './systems/bonds.ts';

const RARITY_WEIGHTS: { rarity: UpgradeRarity; weight: number }[] = [
  { rarity: 'common', weight: 55 },
  { rarity: 'uncommon', weight: 28 },
  { rarity: 'rare', weight: 13 },
  { rarity: 'legendary', weight: 4 },
];

const TOTAL_RARITY_WEIGHT = RARITY_WEIGHTS.reduce((sum, r) => sum + r.weight, 0);

const MAX_TOME_TYPES = 6;
const XP_LATE_GROWTH = 1.0725;
const XP_STEEPEN_START = 10;
const XP_CURVE_BREAK = 40;
const XP_MID_QUADRATIC = 0.5;

function xpMidgame(level: number): number {
  const linear = XP_BASE * (1 + level * XP_GROWTH);
  if (level <= XP_STEEPEN_START) return linear;
  const steepLevels = level - XP_STEEPEN_START;
  return linear + steepLevels * steepLevels * XP_MID_QUADRATIC;
}

/**
 * Calculate XP required to reach the next level.
 * L ≤ 10 keeps the early ramp; L 11-40 adds a quadratic midgame tax; L > 40 continues exponentially.
 */
export function xpForLevel(level: number): number {
  if (level <= XP_CURVE_BREAK) {
    return Math.floor(xpMidgame(level));
  }
  return Math.floor(xpMidgame(XP_CURVE_BREAK) * Math.pow(XP_LATE_GROWTH, level - XP_CURVE_BREAK));
}

/**
 * 局内武器槽解锁：1 起步，5/10/20/30 级各 +1（最高 5）。
 * 第 6 槽仅在 maxWeaponSlots ≥ 6（完成「7 把不同武器」任务）且 50 级时解锁。
 */
export function computeActiveWeaponSlots(level: number, maxWeaponSlots: number): number {
  let slots = 1;
  if (level >= 5) slots++;
  if (level >= 10) slots++;
  if (level >= 20) slots++;
  if (level >= 30) slots++;
  if (level >= 50 && maxWeaponSlots >= MAX_WEAPONS_CAP) slots++;
  return Math.min(maxWeaponSlots, slots);
}

/**
 * Roll a random rarity based on configured weights.
 * Luck tome increases rare/legendary chances.
 */
function rollRarity(luckLevel: number = 0): UpgradeRarity {
  // Luck shifts weight from common to rare/legendary
  const luckBonus = luckLevel * 5;
  const adjustedWeights = RARITY_WEIGHTS.map(({ rarity, weight }) => {
    if (rarity === 'common') return { rarity, weight: Math.max(20, weight - luckBonus * 2) };
    if (rarity === 'rare') return { rarity, weight: weight + luckBonus };
    if (rarity === 'legendary') return { rarity, weight: weight + luckBonus };
    return { rarity, weight };
  });

  const total = adjustedWeights.reduce((sum, r) => sum + r.weight, 0);
  let roll = Math.random() * total;
  for (const { rarity, weight } of adjustedWeights) {
    roll -= weight;
    if (roll <= 0) return rarity;
  }
  return 'common';
}

/**
 * Build all available upgrade options for the current player state.
 */
function buildAvailableOptions(player: PlayerState): UpgradeOption[] {
  const options: UpgradeOption[] = [];
  const luckLevel = getTomePower(player.tomes.find(t => t.type === 'luck_tome'));

  // Weapon upgrades for existing weapons (level up; evolved weapons are maxed out)
  for (const weapon of player.weapons) {
    if (weapon.evolved) continue;
    if (weapon.level < WEAPON_MAX_LEVEL) {
      options.push({
        id: `upgrade_${weapon.type}_${weapon.level + 1}`,
        kind: 'weapon_upgrade',
        rarity: rollRarity(luckLevel),
        weaponType: weapon.type,
        currentLevel: weapon.level,
        newLevel: weapon.level + 1,
      });
    }
  }

  // New weapons (if player has room in active slots)
  if (player.weapons.length < player.activeWeaponSlots) {
    const ownedTypes = new Set(player.weapons.map(w => w.type));
    for (const weaponType of ALL_WEAPON_TYPES) {
      if (!ownedTypes.has(weaponType)) {
        options.push({
          id: `new_${weaponType}`,
          kind: 'new_weapon',
          rarity: rollRarity(luckLevel),
          weaponType,
          currentLevel: 0,
          newLevel: 1,
        });
      }
    }
  }

  // Tome upgrades (new tomes only when holding fewer than 6 types)
  const ownedTomes = new Map(player.tomes.map(t => [t.type, t.level]));
  const ownedTomeCount = player.tomes.length;
  for (const tomeType of ALL_TOME_TYPES) {
    const currentLevel = ownedTomes.get(tomeType) ?? 0;
    const maxLevel = TOME_MAX_LEVELS[tomeType] ?? 5;
    if (currentLevel === 0 && ownedTomeCount >= MAX_TOME_TYPES) continue;
    if (currentLevel < maxLevel) {
      options.push({
        id: `tome_${tomeType}_${currentLevel + 1}`,
        kind: 'tome',
        rarity: rollRarity(luckLevel),
        tomeType,
        passiveType: tomeType, // Legacy compatibility
        currentLevel,
        newLevel: currentLevel + 1,
      });
    }
  }

  // 羁绊激活/升级不在此池——它们作为「额外卡片」追加，不占用常规武器/典籍名额。
  return options;
}

/** 是否为构筑相关选项（武器）—— 用于常规池的保底。 */
function isBuildOption(o: UpgradeOption): boolean {
  return o.kind === 'weapon_upgrade' || o.kind === 'new_weapon';
}

/**
 * 选出一张「额外」羁绊卡片（不占用常规名额）。
 * 从「当前所有满足条件、可激活或可升级」的羁绊里**等概率**随机一个 ——
 * 激活与升级一视同仁，互不阻挡：不会因为存在可激活羁绊就永远不出可升级卡，
 * 也不会要求先激活某条才出现另一条（每条彼此独立，凭各自条件入池）。
 * 没有任何羁绊目标时返回 null。
 */
function pickBondExtra(player: PlayerState): UpgradeOption | null {
  const bondOptions = getBondUpgradeOptions(player);
  if (bondOptions.length === 0) return null;
  return bondOptions[Math.floor(Math.random() * bondOptions.length)];
}

export interface GenerateUpgradeOptionsOpts {
  /** F09 预言之书：全部 ≥ uncommon 且至少 1 rare。 */
  prophecy?: boolean;
}

const RARITY_RANK: Record<UpgradeRarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  legendary: 3,
};

function rollProphecyRarity(luckLevel: number, requireRare: boolean, slotIndex: number): UpgradeRarity {
  if (requireRare && slotIndex === 0) return 'rare';
  const roll = Math.random();
  if (roll < 0.08 + luckLevel * 0.01) return 'legendary';
  if (roll < 0.38 + luckLevel * 0.02) return 'rare';
  return 'uncommon';
}

function buildProphecyOptions(player: PlayerState, count: number): UpgradeOption[] {
  const luckLevel = getTomePower(player.tomes.find(t => t.type === 'luck_tome'));
  const allOptions = buildAvailableOptions(player);
  if (allOptions.length === 0) return [];

  const weaponOptions = allOptions.filter(o => o.kind === 'weapon_upgrade' || o.kind === 'new_weapon');
  const result: UpgradeOption[] = [];
  const usedIds = new Set<string>();

  if (weaponOptions.length > 0) {
    const pick = weaponOptions[Math.floor(Math.random() * weaponOptions.length)];
    result.push({ ...pick, rarity: rollProphecyRarity(luckLevel, true, 0) });
    usedIds.add(pick.id);
  }

  const remaining = allOptions.filter(o => !usedIds.has(o.id));
  let attempts = 0;
  while (result.length < count && remaining.length > 0 && attempts < 200) {
    attempts++;
    const idx = Math.floor(Math.random() * remaining.length);
    const pick = remaining[idx];
    if (!usedIds.has(pick.id)) {
      result.push({
        ...pick,
        rarity: rollProphecyRarity(luckLevel, result.every(o => RARITY_RANK[o.rarity] < 2), result.length),
      });
      usedIds.add(pick.id);
      remaining.splice(idx, 1);
    }
  }

  if (!result.some(o => RARITY_RANK[o.rarity] >= 2) && result.length > 0) {
    result[0] = { ...result[0], rarity: 'rare' };
  }
  for (const opt of result) {
    if (RARITY_RANK[opt.rarity] < 1) opt.rarity = 'uncommon';
  }
  return result;
}

/**
 * Generate upgrade options for level-up screen.
 * Guarantees at least 1 weapon-related option if possible.
 * Each option has a unique id.
 */
export function generateUpgradeOptions(
  player: PlayerState,
  count: number,
  opts?: GenerateUpgradeOptionsOpts,
): UpgradeOption[] {
  const result = opts?.prophecy
    ? buildProphecyOptions(player, count)
    : buildRegularOptions(player, count);

  // 羁绊激活/升级作为「额外」一张卡片追加，不占用常规武器/典籍名额。
  const bondExtra = pickBondExtra(player);
  if (bondExtra) result.push(bondExtra);

  return result;
}

/** 常规升级池（武器 + 典籍），保证至少 1 张武器相关。 */
function buildRegularOptions(player: PlayerState, count: number): UpgradeOption[] {
  const allOptions = buildAvailableOptions(player);
  if (allOptions.length === 0) return [];

  const result: UpgradeOption[] = [];
  const usedIds = new Set<string>();

  // 保证至少 1 张构筑相关（武器升级 / 新武）
  const buildOptions = allOptions.filter(isBuildOption);
  if (buildOptions.length > 0) {
    const idx = Math.floor(Math.random() * buildOptions.length);
    const pick = buildOptions[idx];
    result.push(pick);
    usedIds.add(pick.id);
  }

  // Fill remaining slots from all available options
  const remaining = allOptions.filter(o => !usedIds.has(o.id));
  let attempts = 0;
  while (result.length < count && remaining.length > 0 && attempts < 200) {
    attempts++;
    const idx = Math.floor(Math.random() * remaining.length);
    const pick = remaining[idx];
    if (!usedIds.has(pick.id)) {
      result.push(pick);
      usedIds.add(pick.id);
      remaining.splice(idx, 1);
    }
  }

  return result;
}
