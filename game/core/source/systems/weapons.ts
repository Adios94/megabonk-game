/**
 * 武器系统 —— fireWeapons + getWeaponStats.
 *
 * - tickWeapons: 扫 player.weapons, cooldown 到 → 调 tryFireWeaponEcs (走 ECS 武器路径)
 * - getWeaponStats: 武器等级查表（base + growth 累加）
 *
 * 旧的武器进化（WEAPON_EVOLUTIONS / checkWeaponEvolutions）已被「羁绊系统」取代，见 systems/bonds.ts。
 */
import { WEAPON_STATS, WEAPON_MAX_LEVEL } from '../config.ts';
import type { WeaponLevelStats } from '../config.ts';
import { tryFireWeaponEcs } from './weaponFiring.ts';
import { getRelicDamageMultiplier } from './relics.ts';
import { bondAttackSpeedMult } from './bonds.ts';
import type { WeaponState, WeaponGrowth, UpgradeRarity } from '../types.ts';
import type { Engine } from './types.ts';

/** 稀有度对「本级→下一级」步进的缩放倍率（docs: 升级 +1 级与稀有度幅度）。 */
export const RARITY_STEP_MULT: Record<UpgradeRarity, number> = {
  common: 1.0,
  uncommon: 1.3,
  rare: 1.6,
  legendary: 2.0,
};

const GROWTH_FIELDS = [
  'damage', 'cooldown', 'projectileCount', 'bounces',
  'chains', 'range', 'aoeRadius', 'pierce', 'speed',
] as const;

export function emptyWeaponGrowth(): WeaponGrowth {
  return {
    damage: 0, cooldown: 0, projectileCount: 0, bounces: 0,
    chains: 0, range: 0, aoeRadius: 0, pierce: 0, speed: 0,
  };
}

/** 计算单次武器升级各字段的稀有度缩放步进（与 applyWeaponUpgrade 一致，不 mutate）。 */
export function computeWeaponUpgradeDeltas(
  weapon: WeaponState,
  rarity: UpgradeRarity,
): WeaponGrowth {
  const table = WEAPON_STATS[weapon.type] ?? WEAPON_STATS['bone_bouncer'];
  const maxIdx = table.length - 1;
  const fromLevel = weapon.level;
  const curIdx = Math.min(fromLevel - 1, maxIdx);
  const nextIdx = Math.min(fromLevel, maxIdx);
  const mult = RARITY_STEP_MULT[rarity] ?? 1.0;
  const deltas = emptyWeaponGrowth();

  for (const f of GROWTH_FIELDS) {
    const step = curIdx === nextIdx
      ? (maxIdx > 0 ? table[maxIdx][f] - table[maxIdx - 1][f] : 0)
      : table[nextIdx][f] - table[curIdx][f];
    deltas[f] = step * mult;
  }
  return deltas;
}

/**
 * 应用一次武器升级：level +1，并按稀有度把「本级→下一级」的表步进累加进 growth。
 * common 步进 = 表内 designed 增量（×1.0），保持原平衡；更高稀有度按倍率放大。
 * 超出表长（level ≥ 8）的部分沿用最后一段设计步进，使 9/10 级仍有合理成长。
 */
export function applyWeaponUpgrade(weapon: WeaponState, rarity: UpgradeRarity): void {
  const deltas = computeWeaponUpgradeDeltas(weapon, rarity);
  if (!weapon.growth) weapon.growth = emptyWeaponGrowth();
  for (const f of GROWTH_FIELDS) {
    weapon.growth[f] += deltas[f];
  }
  weapon.level = Math.min(WEAPON_MAX_LEVEL, weapon.level + 1);
}

export function tickWeapons(engine: Engine, dt: number): void {
  const player = engine.state.player;
  if (!player.alive) return;

  const bondAtkSpeed = bondAttackSpeedMult(player);
  for (const weapon of player.weapons) {
    weapon.cooldownTimer -= dt * player.attackSpeedMultiplier * (player.consumableAttackSpeedMult ?? 1) * bondAtkSpeed;
    if (weapon.cooldownTimer <= 0) {
      const baseStats = getWeaponStats(weapon);
      const stats = {
        ...baseStats,
        projectileCount: baseStats.projectileCount + Math.max(0, player.projectileBonus ?? 0),
      };
      weapon.cooldownTimer = stats.cooldown;
      const baseDamageMultiplier = player.damageMultiplier;
      player.damageMultiplier = baseDamageMultiplier
        * getRelicDamageMultiplier(engine)
        * (player.consumableDamageMult ?? 1);
      try {
        tryFireWeaponEcs(
          engine.world, weapon, stats,
          player, engine.state.enemies, engine.state.boss,
          engine.effects,
        );
      } finally {
        player.damageMultiplier = baseDamageMultiplier;
      }
      // 铁血 T2「下次斩击」叠层在本次剑攻击中已结算，消费掉。
      if (weapon.type === 'sword') player.bondIronStacks = 0;
    }
  }
}

export function getWeaponStats(weapon: WeaponState): WeaponLevelStats {
  const levelStats = WEAPON_STATS[weapon.type] ?? WEAPON_STATS['bone_bouncer'];
  const base = levelStats[0];

  let effective: WeaponLevelStats;
  if (weapon.growth) {
    // 新规则：base(L1) + 累加成长。整数字段取 floor / round，cooldown 设下限。
    const g = weapon.growth;
    effective = {
      damage: Math.round(base.damage + g.damage),
      cooldown: Math.max(0.1, base.cooldown + g.cooldown),
      projectileCount: Math.floor(base.projectileCount + g.projectileCount),
      bounces: Math.floor(base.bounces + g.bounces),
      chains: Math.floor(base.chains + g.chains),
      range: base.range + g.range,
      aoeRadius: base.aoeRadius + g.aoeRadius,
      pierce: Math.floor(base.pierce + g.pierce),
      speed: base.speed + g.speed,
    };
  } else {
    // 兼容旧路径（无 growth）：等级查表。
    const idx = Math.max(0, Math.min(weapon.level - 1, levelStats.length - 1));
    effective = levelStats[idx];
  }

  return effective;
}
