/**
 * MegaBonk Permanent Shop - Spend silver to upgrade persistent stats.
 */

import { loadSave, saveSave, spendSilver } from './save.ts';

export interface ShopUpgrade {
  id: string;
  nameKey: string;
  descKey: string;
  maxLevel: number;
  costPerLevel: number[];
  effect: { stat: string; value: number };
}

export const SHOP_UPGRADES: ShopUpgrade[] = [
  { id: 'max_hp', nameKey: 'shop.max_hp', descKey: 'shop.max_hp_desc', maxLevel: 10, costPerLevel: [50, 100, 150, 200, 300, 400, 500, 650, 800, 1000], effect: { stat: 'maxHp', value: 10 } },
  { id: 'damage', nameKey: 'shop.damage', descKey: 'shop.damage_desc', maxLevel: 10, costPerLevel: [80, 160, 240, 320, 400, 500, 600, 750, 900, 1200], effect: { stat: 'damage', value: 0.05 } },
  { id: 'speed', nameKey: 'shop.speed', descKey: 'shop.speed_desc', maxLevel: 5, costPerLevel: [100, 200, 350, 500, 700], effect: { stat: 'speed', value: 0.3 } },
  { id: 'crit', nameKey: 'shop.crit', descKey: 'shop.crit_desc', maxLevel: 5, costPerLevel: [120, 250, 400, 600, 900], effect: { stat: 'critChance', value: 0.02 } },
  { id: 'pickup_radius', nameKey: 'shop.pickup', descKey: 'shop.pickup_desc', maxLevel: 5, costPerLevel: [60, 120, 200, 300, 450], effect: { stat: 'pickupRadius', value: 0.5 } },
  { id: 'armor', nameKey: 'shop.armor', descKey: 'shop.armor_desc', maxLevel: 5, costPerLevel: [100, 200, 350, 500, 750], effect: { stat: 'armor', value: 1 } },
  { id: 'xp_gain', nameKey: 'shop.xp_gain', descKey: 'shop.xp_gain_desc', maxLevel: 5, costPerLevel: [80, 160, 300, 450, 650], effect: { stat: 'xpGain', value: 0.1 } },
  { id: 'starting_level', nameKey: 'shop.start_level', descKey: 'shop.start_level_desc', maxLevel: 3, costPerLevel: [500, 1000, 2000], effect: { stat: 'startLevel', value: 1 } },
];

export function getUpgradeCost(upgradeId: string): number | null {
  const upgrade = SHOP_UPGRADES.find(u => u.id === upgradeId);
  if (!upgrade) return null;
  const save = loadSave();
  const currentLevel = save.shopLevels[upgradeId] ?? 0;
  if (currentLevel >= upgrade.maxLevel) return null;
  return upgrade.costPerLevel[currentLevel];
}

export function canAfford(upgradeId: string): boolean {
  const cost = getUpgradeCost(upgradeId);
  if (cost === null) return false;
  const save = loadSave();
  return save.silver >= cost;
}

export function purchaseUpgrade(upgradeId: string): boolean {
  const upgrade = SHOP_UPGRADES.find(u => u.id === upgradeId);
  if (!upgrade) return false;

  const save = loadSave();
  const currentLevel = save.shopLevels[upgradeId] ?? 0;
  if (currentLevel >= upgrade.maxLevel) return false;

  const cost = upgrade.costPerLevel[currentLevel];
  if (save.silver < cost) return false;

  save.silver -= cost;
  save.shopLevels[upgradeId] = currentLevel + 1;
  saveSave(save);
  return true;
}

export function getShopBonuses(): Record<string, number> {
  const save = loadSave();
  const bonuses: Record<string, number> = {};

  for (const upgrade of SHOP_UPGRADES) {
    const level = save.shopLevels[upgrade.id] ?? 0;
    if (level > 0) {
      bonuses[upgrade.effect.stat] = (bonuses[upgrade.effect.stat] ?? 0) + upgrade.effect.value * level;
    }
  }

  return bonuses;
}
