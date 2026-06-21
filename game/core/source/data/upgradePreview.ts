/**
 * 升级选项卡数值预览 —— 根据表内步进 × 稀有度（武器）或每级增益（典籍）生成展示行。
 */
import { WEAPON_STATS } from '../config.ts';
import { TOMES } from './tomes.ts';
import { computeWeaponUpgradeDeltas, getWeaponStats } from '../systems/weapons.ts';
import { getTomeUpgradePower } from './tomeProgression.ts';
import type { PlayerState, UpgradeOption, WeaponType } from '../types.ts';
import type { WeaponLevelStats } from '../config.ts';

export interface UpgradePreviewLine {
  /** i18n key，如 upgrade.stat.damage */
  labelKey: string;
  /** 已格式化的数值，如 +12.5% / +3.0 / +1 */
  value: string;
}

const EPS = 0.001;

function fmtSigned(value: number, decimals: number): string {
  const rounded = Number(value.toFixed(decimals));
  const prefix = rounded > 0 ? '+' : '';
  return `${prefix}${rounded.toFixed(decimals)}`;
}

function fmtPercent(delta: number): string {
  return `${fmtSigned(delta * 100, 1)}%`;
}

function fmtInt(delta: number): string {
  const rounded = Math.round(delta);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

type WeaponField = keyof WeaponLevelStats;

const WEAPON_FIELD_META: {
  field: WeaponField;
  labelKey: string;
  priority: number;
  format: (delta: number, current: WeaponLevelStats) => string | null;
}[] = [
  {
    field: 'damage',
    labelKey: 'upgrade.stat.damage',
    priority: 1,
    format: (d) => (Math.abs(d) < EPS ? null : fmtInt(d)),
  },
  {
    field: 'cooldown',
    labelKey: 'upgrade.stat.attackSpeed',
    priority: 2,
    format: (d, cur) => {
      if (Math.abs(d) < EPS || cur.cooldown <= 0) return null;
      // 冷却缩短 → 等效攻速提升（百分数，一位小数）
      return fmtPercent(-d / cur.cooldown);
    },
  },
  {
    field: 'projectileCount',
    labelKey: 'upgrade.stat.projectiles',
    priority: 3,
    format: (d) => (Math.abs(d) < EPS ? null : fmtSigned(d, 1)),
  },
  {
    field: 'chains',
    labelKey: 'upgrade.stat.chains',
    priority: 4,
    format: (d) => (Math.abs(d) < EPS ? null : fmtSigned(d, 1)),
  },
  {
    field: 'bounces',
    labelKey: 'upgrade.stat.bounces',
    priority: 5,
    format: (d) => (Math.abs(d) < EPS ? null : fmtSigned(d, 1)),
  },
  {
    field: 'range',
    labelKey: 'upgrade.stat.range',
    priority: 6,
    format: (d) => (Math.abs(d) < EPS ? null : fmtSigned(d, 1)),
  },
  {
    field: 'aoeRadius',
    labelKey: 'upgrade.stat.aoe',
    priority: 7,
    format: (d) => (Math.abs(d) < EPS ? null : fmtSigned(d, 1)),
  },
  {
    field: 'pierce',
    labelKey: 'upgrade.stat.pierce',
    priority: 8,
    format: (d) => (Math.abs(d) < EPS ? null : fmtSigned(d, 1)),
  },
  {
    field: 'speed',
    labelKey: 'upgrade.stat.projSpeed',
    priority: 9,
    format: (d) => (Math.abs(d) < EPS ? null : fmtSigned(d, 1)),
  },
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
    .map(({ field, labelKey, priority, format }) => {
      const text = format(deltas[field], current);
      return text ? { labelKey, value: text, priority } : null;
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

/** 典籍每升 1 级的固定增益（contextual 典籍走硬编码每级值）。 */
function previewTome(option: UpgradeOption): UpgradePreviewLine[] {
  const tomeType = option.tomeType ?? option.passiveType;
  if (!tomeType) return [];
  const power = getTomeUpgradePower(option.rarity) * Math.max(1, option.newLevel - option.currentLevel);

  switch (tomeType) {
    case 'attack_speed_tome':
      return [{ labelKey: 'upgrade.stat.attackSpeed', value: fmtPercent(0.10 * power) }];
    case 'life_tome':
      return [{ labelKey: 'upgrade.stat.maxHp', value: fmtInt(15 * power) }];
    case 'consumable_tome':
      return [{ labelKey: 'upgrade.stat.consumableDrop', value: fmtPercent(0.05 * power) }];
    case 'speed_tome':
      return [{ labelKey: 'upgrade.stat.moveSpeed', value: fmtPercent(0.08 * power) }];
    case 'attraction_tome':
      return [{ labelKey: 'upgrade.stat.pickupRadius', value: fmtSigned(1.2 * power, 1) }];
    case 'shield_tome':
      return [
        { labelKey: 'upgrade.stat.armor', value: fmtInt(2 * power) },
        { labelKey: 'upgrade.stat.shieldReduction', value: fmtPercent(0.05 * power) },
      ];
    case 'precision_tome':
      return [
        { labelKey: 'upgrade.stat.critChance', value: fmtPercent(0.05 * power) },
        { labelKey: 'upgrade.stat.critDamage', value: fmtPercent(0.10 * power) },
      ];
    case 'thorns_tome':
      return [{ labelKey: 'upgrade.stat.thorns', value: fmtInt(3 * power) }];
    case 'knockback_tome':
      return [{ labelKey: 'upgrade.stat.knockback', value: fmtPercent(0.30 * power) }];
    case 'xp_gain_tome':
      return [{ labelKey: 'upgrade.stat.xpGain', value: fmtPercent(0.15 * power) }];
    case 'curse_tome':
      return [
        { labelKey: 'upgrade.stat.curseSpawn', value: fmtPercent(0.10 * power) },
        { labelKey: 'upgrade.stat.xpGain', value: fmtPercent(0.20 * power) },
      ];
    case 'luck_tome':
      return [{ labelKey: 'upgrade.stat.luck', value: fmtInt(5 * power) }];
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
      return previewTome(option);
    case 'bond_activate':
    case 'bond_upgrade':
      return [{ labelKey: 'upgrade.stat.bondTier', value: `T${option.currentLevel} → T${option.newLevel}` }];
    default:
      return [];
  }
}
