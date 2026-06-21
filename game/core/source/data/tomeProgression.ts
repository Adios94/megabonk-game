/**
 * Tome progression helpers.
 *
 * `level` means "how many times this tome was selected" and gates maxLevel.
 * `growth` is the actual accumulated power: each selection adds the option
 * rarity multiplier, matching weapon upgrade semantics.
 */
import type { TomeState, UpgradeRarity } from '../types.ts';

export const TOME_RARITY_STEP_MULT: Record<UpgradeRarity, number> = {
  common: 1.0,
  uncommon: 1.3,
  rare: 1.6,
  legendary: 2.0,
};

/** Old saves / fixtures without growth behave as if every level was common. */
export function getTomePower(tome: TomeState | undefined): number {
  if (!tome) return 0;
  return tome.growth ?? tome.level;
}

export function getTomeUpgradePower(rarity: UpgradeRarity): number {
  return TOME_RARITY_STEP_MULT[rarity] ?? 1.0;
}

export function applyTomeUpgrade(tome: TomeState, rarity: UpgradeRarity, newLevel: number): void {
  const currentPower = getTomePower(tome);
  tome.level = newLevel;
  tome.growth = currentPower + getTomeUpgradePower(rarity);
}
