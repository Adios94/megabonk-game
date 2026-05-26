/**
 * MegaBonk Save System - Persistent progression stored in localStorage.
 */

export interface SaveData {
  version: number;
  silver: number;
  totalSilverEarned: number;
  shopLevels: Record<string, number>;
  questsCompleted: string[];
  weaponsUnlocked: string[];
  charactersUnlocked: string[];
  extraWeaponSlots: number;
  stats: {
    totalKills: number;
    totalRuns: number;
    bestSurvivalTime: number;
    highestLevel: number;
    bossesDefeated: number;
    totalEvolutions: number;
    noDamageRuns: number;
  };
}

const SAVE_KEY = 'megabonk_save_v1';
const CURRENT_VERSION = 1;

export function getDefaultSave(): SaveData {
  return {
    version: CURRENT_VERSION,
    silver: 0,
    totalSilverEarned: 0,
    shopLevels: {},
    questsCompleted: [],
    weaponsUnlocked: ['sword', 'axe', 'bone_bouncer'],
    charactersUnlocked: ['megachad'],
    extraWeaponSlots: 0,
    stats: {
      totalKills: 0,
      totalRuns: 0,
      bestSurvivalTime: 0,
      highestLevel: 0,
      bossesDefeated: 0,
      totalEvolutions: 0,
      noDamageRuns: 0,
    },
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return getDefaultSave();
    const parsed = JSON.parse(raw) as SaveData;
    // Ensure all fields exist (handles save version migrations)
    const defaults = getDefaultSave();
    return {
      ...defaults,
      ...parsed,
      stats: { ...defaults.stats, ...(parsed.stats ?? {}) },
    };
  } catch {
    return getDefaultSave();
  }
}

export function saveSave(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Silently fail if localStorage is unavailable
  }
}

export function addSilver(amount: number): SaveData {
  const save = loadSave();
  save.silver += amount;
  save.totalSilverEarned += amount;
  saveSave(save);
  return save;
}

export function spendSilver(amount: number): boolean {
  const save = loadSave();
  if (save.silver < amount) return false;
  save.silver -= amount;
  saveSave(save);
  return true;
}

export function getShopLevel(upgradeId: string): number {
  const save = loadSave();
  return save.shopLevels[upgradeId] ?? 0;
}

export function updateRunStats(killCount: number, survivalTime: number, level: number, victory: boolean, damageTaken: number): void {
  const save = loadSave();
  save.stats.totalKills += killCount;
  save.stats.totalRuns += 1;
  save.stats.bestSurvivalTime = Math.max(save.stats.bestSurvivalTime, survivalTime);
  save.stats.highestLevel = Math.max(save.stats.highestLevel, level);
  if (victory) save.stats.bossesDefeated += 1;
  if (damageTaken === 0 && survivalTime > 60) save.stats.noDamageRuns += 1;
  saveSave(save);
}
