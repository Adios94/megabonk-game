/**
 * 升级选项卡数值预览 —— 根据表内步进 × 稀有度（武器）或每级增益（典籍）生成展示行。
 */
import { WEAPON_STATS } from '../config.ts';
import { TOMES } from './tomes.ts';
import { computeWeaponUpgradeDeltas, getWeaponStats } from '../systems/weapons.ts';
import { getTomePower, getTomeUpgradePower } from './tomeProgression.ts';
import type { PlayerState, UpgradeOption, WeaponType } from '../types.ts';
import type { WeaponLevelStats } from '../config.ts';

export interface UpgradePreviewLine {
  /** i18n key，如 upgrade.stat.damage */
  labelKey: string;
  /** 已格式化的数值，展示「当前值 → 升级后值」，如 10% → 30% / 45 → 54 */
  value: string;
}

const EPS = 0.001;

/** 数值格式化：按精度四舍五入并去掉多余的 0（45.0 → "45"，1.50 → "1.5"）。 */
function fmtNum(value: number, decimals: number): string {
  return String(Number(value.toFixed(decimals)));
}

/** 升级箭头：与羁绊升级卡片一致（U+2192，两侧留空格）。 */
const ARROW = ' → ';

type WeaponField = keyof WeaponLevelStats;

const WEAPON_FIELD_META: {
  field: WeaponField;
  labelKey: string;
  priority: number;
  fmt: (value: number) => string;
}[] = [
  { field: 'damage', labelKey: 'upgrade.stat.damage', priority: 1, fmt: (v) => fmtNum(v, 0) },
  { field: 'cooldown', labelKey: 'upgrade.stat.cooldown', priority: 2, fmt: (v) => `${v.toFixed(1)}s` },
  { field: 'projectileCount', labelKey: 'upgrade.stat.projectiles', priority: 3, fmt: (v) => fmtNum(v, 1) },
  { field: 'chains', labelKey: 'upgrade.stat.chains', priority: 4, fmt: (v) => fmtNum(v, 1) },
  { field: 'bounces', labelKey: 'upgrade.stat.bounces', priority: 5, fmt: (v) => fmtNum(v, 1) },
  { field: 'range', labelKey: 'upgrade.stat.range', priority: 6, fmt: (v) => fmtNum(v, 1) },
  { field: 'aoeRadius', labelKey: 'upgrade.stat.aoe', priority: 7, fmt: (v) => fmtNum(v, 1) },
  { field: 'pierce', labelKey: 'upgrade.stat.pierce', priority: 8, fmt: (v) => fmtNum(v, 1) },
  { field: 'speed', labelKey: 'upgrade.stat.projSpeed', priority: 9, fmt: (v) => fmtNum(v, 1) },
];

function previewWeaponUpgrade(option: UpgradeOption, player: PlayerState): UpgradePreviewLine[] {
  const weapon = player.weapons.find(w => w.type === option.weaponType);
  if (!weapon) return [];
  const current = getWeaponStats(weapon);
  const steps = Math.max(1, option.newLevel - option.currentLevel);
  const oneStep = computeWeaponUpgradeDeltas(weapon, option.rarity);
  const deltas: WeaponLevelStats = {
    damage: oneStep.damage * steps,
    cooldown: oneStep.cooldown * steps,
    projectileCount: oneStep.projectileCount * steps,
    bounces: oneStep.bounces * steps,
    chains: oneStep.chains * steps,
    range: oneStep.range * steps,
    aoeRadius: oneStep.aoeRadius * steps,
    pierce: oneStep.pierce * steps,
    speed: oneStep.speed * steps,
  };

  return WEAPON_FIELD_META
    .map(({ field, labelKey, priority, fmt }) => {
      const delta = deltas[field];
      if (Math.abs(delta) < EPS) return null;
      // 冷却为 0 的武器（无冷却概念）不展示该行。
      if (field === 'cooldown' && current.cooldown <= 0) return null;
      const cur = current[field];
      const next = cur + delta;
      return { labelKey, value: `${fmt(cur)}${ARROW}${fmt(next)}`, priority };
    })
    .filter((x): x is UpgradePreviewLine & { priority: number } => x !== null)
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 4)
    .map(({ labelKey, value }) => ({ labelKey, value }));
}

function previewNewWeapon(weaponType: WeaponType): UpgradePreviewLine[] {
  const base = WEAPON_STATS[weaponType]?.[0];
  if (!base) return [];
  const fakeGrowth = {
    damage: 0, cooldown: 0, projectileCount: 0, bounces: 0,
    chains: 0, range: 0, aoeRadius: 0, pierce: 0, speed: 0,
  };
  const lines: UpgradePreviewLine[] = [];
  if (base.damage > 0) {
    lines.push({ labelKey: 'upgrade.stat.damage', value: String(Math.round(base.damage)) });
  }
  if (base.cooldown > 0) {
    lines.push({ labelKey: 'upgrade.stat.cooldown', value: `${base.cooldown.toFixed(1)}s` });
  }
  if (base.projectileCount > 0) {
    lines.push({ labelKey: 'upgrade.stat.projectiles', value: String(base.projectileCount) });
  }
  if (lines.length < 3 && base.range > 0) {
    lines.push({ labelKey: 'upgrade.stat.range', value: base.range.toFixed(1) });
  }
  return lines.slice(0, 3);
}

/**
 * 典籍数值预览：展示「当前累计值 → 升级后累计值」。
 * 累计倍率取自 tome.growth（getTomePower），新值 = 当前 + 本次升级增量。
 */
function previewTome(option: UpgradeOption, player: PlayerState): UpgradePreviewLine[] {
  const tomeType = option.tomeType ?? option.passiveType;
  if (!tomeType) return [];
  const steps = Math.max(1, option.newLevel - option.currentLevel);
  const existing = player.tomes?.find(tm => tm.type === tomeType);
  const curPower = getTomePower(existing);
  const newPower = curPower + getTomeUpgradePower(option.rarity) * steps;

  // 百分比类：当前% → 升级后%
  const pct = (base: number): string =>
    `${fmtNum(base * curPower * 100, 1)}%${ARROW}${fmtNum(base * newPower * 100, 1)}%`;
  // 整数类：当前 → 升级后
  const intv = (base: number): string =>
    `${fmtNum(base * curPower, 0)}${ARROW}${fmtNum(base * newPower, 0)}`;
  // 小数类：当前 → 升级后（保留 1 位）
  const dec = (base: number): string =>
    `${fmtNum(base * curPower, 1)}${ARROW}${fmtNum(base * newPower, 1)}`;

  switch (tomeType) {
    case 'attack_speed_tome':
      return [{ labelKey: 'upgrade.stat.attackSpeed', value: pct(0.10) }];
    case 'life_tome':
      return [{ labelKey: 'upgrade.stat.maxHp', value: intv(15) }];
    case 'consumable_tome':
      return [{ labelKey: 'upgrade.stat.consumableDrop', value: pct(0.05) }];
    case 'speed_tome':
      return [{ labelKey: 'upgrade.stat.moveSpeed', value: pct(0.08) }];
    case 'attraction_tome':
      return [{ labelKey: 'upgrade.stat.pickupRadius', value: dec(1.2) }];
    case 'shield_tome':
      return [
        { labelKey: 'upgrade.stat.armor', value: intv(2) },
        { labelKey: 'upgrade.stat.shieldReduction', value: pct(0.05) },
      ];
    case 'precision_tome':
      return [
        { labelKey: 'upgrade.stat.critChance', value: pct(0.05) },
        { labelKey: 'upgrade.stat.critDamage', value: pct(0.10) },
      ];
    case 'thorns_tome':
      return [{ labelKey: 'upgrade.stat.thorns', value: intv(3) }];
    case 'knockback_tome':
      return [{ labelKey: 'upgrade.stat.knockback', value: pct(0.30) }];
    case 'xp_gain_tome':
      return [{ labelKey: 'upgrade.stat.xpGain', value: pct(0.15) }];
    case 'curse_tome':
      return [
        { labelKey: 'upgrade.stat.curseSpawn', value: pct(0.10) },
        { labelKey: 'upgrade.stat.xpGain', value: pct(0.20) },
      ];
    case 'luck_tome':
      return [{ labelKey: 'upgrade.stat.luck', value: intv(5) }];
    default: {
      const def = TOMES[tomeType];
      return def ? [{ labelKey: 'upgrade.stat.generic', value: '+1' }] : [];
    }
  }
}

/** 为升级选项生成数值预览行（供 client 选项卡展示）。 */
export function getUpgradePreviewLines(option: UpgradeOption, player: PlayerState): UpgradePreviewLine[] {
  switch (option.kind) {
    case 'weapon_upgrade':
      return previewWeaponUpgrade(option, player);
    case 'new_weapon':
      return option.weaponType ? previewNewWeapon(option.weaponType) : [];
    case 'tome':
      return previewTome(option, player);
    case 'bond_activate':
    case 'bond_upgrade':
      return [{ labelKey: 'upgrade.stat.bondTier', value: `T${option.currentLevel} → T${option.newLevel}` }];
    default:
      return [];
  }
}
