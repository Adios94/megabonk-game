/**
 * 羁绊系统数据表（替代旧武器进化 + 21 条双武融合）。
 *
 * 9 条语义羁绊，单条 N=2~4 把武器。每条三档：
 *   - T1 数值档：纯 stat（无条件伤害%、护甲、攻速、暴击、debuff 时长…）
 *   - T2 机制档：引入新战斗规则（mechanicId）
 *   - T3 升格档：在 T2 机制上数值/机制升级（不另起机制）
 *
 * 本文件是纯数据 + 纯函数（无副作用、不引入 systems）。
 * 运行时机制实现见 `systems/bonds.ts`；伤害管线接入见 `stats/computeWeaponDamage.ts`。
 */
import type { WeaponType, WeaponState, PlayerState, BondId, BondTier } from '../types.ts';
import type { Modifier } from '../stats/Modifier.ts';

/** T1 数值档配置（按档位门槛激活后立即生效）。 */
export interface BondT1Def {
  /** 对组内武器无条件的伤害 increased（0.06 = +6%）。 */
  damageInc?: number;
  /** 立即获得的护甲（铁血 +10）。 */
  armor?: number;
  /** damageMult added（奥术 +0.1）。 */
  damageMult?: number;
  /** 全局攻速 increased（弹幕 +5%、弧光攻击间隔降低）。 */
  attackSpeed?: number;
  /** 暴击率 added（猎标 +5%）。 */
  critChance?: number;
  /** 暴击伤害 increased（猎标 +10%）。 */
  critDamage?: number;
  /** 负面效果持续 +秒（毒师 +0.8s）。 */
  debuffDuration?: number;
  /** 条件增伤：仅满足条件时对组内武器额外 increased。 */
  conditional?: { cond: 'close' | 'hp_above_50'; value: number };
}

export interface BondDef {
  id: BondId;
  /** i18n 名称键 `bond.<id>.name`。 */
  nameKey: string;
  /** 菱形 HUD 占位图标（emoji）。 */
  icon: string;
  /** 组内武器（length = N，2~4）。 */
  weapons: WeaponType[];
  /** T2 机制 id（T3 仅升级此机制，不新增）。 */
  mechanicId: string;
  /** T1 数值档。 */
  t1: BondT1Def;
  /** T2/T3 机制使用的数值参数（systems/bonds.ts 读取）。 */
  params: Record<string, number>;
}

const ic = {
  iron: '🛡️', arcane: '🔮', zero: '👊', ember: '🔥',
  volley: '🎯', bone: '☠️', arc: '⚡', poison: '☣️', hunter: '🏹',
};

export const BONDS: Record<BondId, BondDef> = {
  iron_blood: {
    id: 'iron_blood', nameKey: 'bond.iron_blood.name', icon: ic.iron,
    weapons: ['sword', 'axe'], mechanicId: 'iron_blood_counter',
    t1: { damageInc: 0.06, armor: 10 },
    params: { nextHitInc: 0.08, rageDuration: 10, rageDamageInc: 0.15, rageAttackSpeed: 0.15 },
  },
  arcane: {
    id: 'arcane', nameKey: 'bond.arcane.name', icon: ic.arcane,
    weapons: ['lightning_staff', 'flame_ring', 'void_ripple', 'scorch_boots'], mechanicId: 'arcane_mystery',
    t1: { damageInc: 0.04, damageMult: 0.1 },
    params: { threshold: 100, thresholdT3: 60, rateCap: 15, splash: 0.5, burstPerLevel: 8, burstT3Mult: 1.5 },
  },
  zero_range: {
    id: 'zero_range', nameKey: 'bond.zero_range.name', icon: ic.zero,
    weapons: ['sword', 'axe', 'void_ripple', 'shotgun'], mechanicId: 'knockback_impact',
    t1: { conditional: { cond: 'close', value: 0.08 } },
    params: { closeRange: 3, knockbackDmgScale: 6, t3WallDmg: 40, t3KnockbackMult: 1.6 },
  },
  ember_trail: {
    id: 'ember_trail', nameKey: 'bond.ember_trail.name', icon: ic.ember,
    weapons: ['flame_ring', 'scorch_boots'], mechanicId: 'ember_detonate',
    t1: { damageInc: 0.08 },
    params: { explodeRadius: 2.4, explodeDamagePct: 0.4, t3RadiusMult: 1.5, t3DamageMult: 1.6, t3ScorchDuration: 3 },
  },
  volley: {
    id: 'volley', nameKey: 'bond.volley.name', icon: ic.volley,
    weapons: ['bow', 'shotgun', 'bone_bouncer', 'poison_bomb'], mechanicId: 'volley_tempo',
    t1: { damageInc: 0.05, attackSpeed: 0.05 },
    params: { perLevelAtkSpeed: 0.01 },
  },
  bone_crush: {
    id: 'bone_crush', nameKey: 'bond.bone_crush.name', icon: ic.bone,
    weapons: ['bow', 'sword', 'bone_bouncer'], mechanicId: 'bone_crush_priority',
    t1: { conditional: { cond: 'hp_above_50', value: 0.08 } },
    params: { vulnDuration: 5, vulnPct: 0.16, priorityHp: 0.7 },
  },
  arc_conductor: {
    id: 'arc_conductor', nameKey: 'bond.arc_conductor.name', icon: ic.arc,
    weapons: ['ray_gun', 'lightning_staff', 'void_ripple'], mechanicId: 'conductor_mark',
    t1: { damageInc: 0.06, attackSpeed: 0.04 },
    params: { chainPct: 0.08, chainPctT3: 0.16, markDuration: 3, markDurationT3: 6 },
  },
  poison_master: {
    id: 'poison_master', nameKey: 'bond.poison_master.name', icon: ic.poison,
    weapons: ['poison_bomb', 'paralysis_gun'], mechanicId: 'neuro_toxin',
    t1: { debuffDuration: 0.8 },
    params: {
      duration: 5, durationT3: 7, maxStacks: 5, maxStacksT3: 7,
      pulseInterval: 2, slowDuration: 1, slowFactor: 0.45, slowFactorT3: 0.3,
      hpPctPerStack: 0.01, eliteCoef: 0.5,
    },
  },
  hunter_mark: {
    id: 'hunter_mark', nameKey: 'bond.hunter_mark.name', icon: ic.hunter,
    weapons: ['bow', 'ray_gun', 'paralysis_gun'], mechanicId: 'hunter_brand',
    t1: { critChance: 0.05, critDamage: 0.10 },
    params: { brandDmgInc: 0.16, executeHpPct: 0.16 },
  },
};

export const ALL_BOND_IDS: BondId[] = [
  'iron_blood', 'arcane', 'zero_range', 'ember_trail', 'volley',
  'bone_crush', 'arc_conductor', 'poison_master', 'hunter_mark',
];

/** weapon type → 它参与的羁绊 id 列表（反查表）。 */
export const BONDS_BY_WEAPON: Partial<Record<WeaponType, BondId[]>> = (() => {
  const map: Partial<Record<WeaponType, BondId[]>> = {};
  for (const id of ALL_BOND_IDS) {
    for (const w of BONDS[id].weapons) {
      (map[w] ??= []).push(id);
    }
  }
  return map;
})();

// ─── 档位门槛（按 N 分档，见 docs/index.html「档位门槛」表）───
export interface BondThresholds {
  t1k: number;
  t2k: number; t2sum: number;
  t3k: number; t3sum: number; t3min: number;
}

export function bondThresholds(n: number): BondThresholds {
  switch (n) {
    case 2: return { t1k: 2, t2k: 2, t2sum: 8, t3k: 2, t3sum: 14, t3min: 5 };
    case 3: return { t1k: 2, t2k: 3, t2sum: 12, t3k: 3, t3sum: 18, t3min: 5 };
    default: return { t1k: 2, t2k: 3, t2sum: 12, t3k: 4, t3sum: 20, t3min: 4 }; // N=4
  }
}

export interface BondCounts {
  /** 持有的组内武器种类数。 */
  k: number;
  /** 组内武器等级之和。 */
  lSum: number;
  /** 组内武器最低等级（无持有时 0）。 */
  lMin: number;
  /** 持有的组内武器实例。 */
  owned: WeaponState[];
}

export function evalBondCounts(player: PlayerState, def: BondDef): BondCounts {
  const owned = player.weapons.filter(w => def.weapons.includes(w.type));
  const k = owned.length;
  const lSum = owned.reduce((s, w) => s + w.level, 0);
  const lMin = k > 0 ? Math.min(...owned.map(w => w.level)) : 0;
  return { k, lSum, lMin, owned };
}

/** 仅看武器组合 / 等级能达到的最高档（不考虑当前已激活档）。 */
export function highestEligibleTier(player: PlayerState, def: BondDef): BondTier {
  const n = def.weapons.length;
  const th = bondThresholds(n);
  const { k, lSum, lMin } = evalBondCounts(player, def);
  if (k >= th.t3k && lSum >= th.t3sum && lMin >= th.t3min) return 3;
  if (k >= th.t2k && lSum >= th.t2sum) return 2;
  if (k >= th.t1k) return 1;
  return 0;
}

/** 当前已激活的羁绊档位（未激活返回 0）。 */
export function getBondTier(player: PlayerState, bondId: BondId): BondTier {
  return player.bonds?.find(b => b.bondId === bondId)?.tier ?? 0;
}

export interface BondUpgradeTarget {
  bondId: BondId;
  fromTier: BondTier;
  toTier: BondTier;
  /** true = bond_activate（0→1）；false = bond_upgrade（1→2 / 2→3）。 */
  isActivate: boolean;
}

/** 当前可在升级池里出现的羁绊激活/升级目标（每条最多前进一档）。 */
export function bondUpgradeTargets(player: PlayerState): BondUpgradeTarget[] {
  const out: BondUpgradeTarget[] = [];
  for (const id of ALL_BOND_IDS) {
    const def = BONDS[id];
    const cur = getBondTier(player, id);
    if (cur >= 3) continue;
    const elig = highestEligibleTier(player, def);
    if (elig > cur) {
      const toTier = (cur + 1) as BondTier;
      out.push({ bondId: id, fromTier: cur, toTier, isActivate: cur === 0 });
    }
  }
  return out;
}

// ─── stat 修饰符派生（喂给 recomputePlayerStats / computeWeaponDamage）───

/**
 * 全局玩家 stat 修饰符（护甲 / damageMult / 攻速 / 暴击）。
 * 由 recomputePlayerStats 在每次重算时应用。
 */
export function bondGlobalModifiers(player: PlayerState): Modifier[] {
  const mods: Modifier[] = [];
  for (const prog of player.bonds ?? []) {
    const def = BONDS[prog.bondId];
    if (!def) continue;
    const t1 = def.t1;
    if (t1.armor) mods.push({ kind: 'added', stat: 'armor', value: t1.armor });
    if (t1.damageMult) mods.push({ kind: 'added', stat: 'damageMult', value: t1.damageMult });
    if (t1.critChance) mods.push({ kind: 'added', stat: 'critChance', value: t1.critChance });
    if (t1.critDamage) mods.push({ kind: 'increased', stat: 'critDamage', value: t1.critDamage });
    let atkSpeed = t1.attackSpeed ?? 0;
    // volley T2: 每个组内武器等级 +1% 攻速（全局近似）。
    if (def.id === 'volley' && prog.tier >= 2) {
      const { lSum } = evalBondCounts(player, def);
      atkSpeed += lSum * (def.params.perLevelAtkSpeed ?? 0.01);
    }
    if (atkSpeed) mods.push({ kind: 'increased', stat: 'attackSpeed', value: atkSpeed });
  }
  return mods;
}

/**
 * 「无条件、按武器 type 限定」的伤害 increased 修饰符。
 * 存到 player.bondDamageMods，computeWeaponDamage 按 tag superset-AND 过滤生效
 * （武器 def.tags[0] === 武器 type，因此 tag=[weaponType] 恰好命中对应武器）。
 */
export function bondWeaponDamageMods(player: PlayerState): Modifier[] {
  const incByWeapon = new Map<WeaponType, number>();
  for (const prog of player.bonds ?? []) {
    const def = BONDS[prog.bondId];
    if (!def || !def.t1.damageInc) continue;
    for (const w of def.weapons) {
      incByWeapon.set(w, (incByWeapon.get(w) ?? 0) + def.t1.damageInc);
    }
  }
  const mods: Modifier[] = [];
  for (const [w, inc] of incByWeapon) {
    mods.push({ kind: 'increased', stat: 'damage', value: inc, tags: [w] });
  }
  return mods;
}

/** 玩家是否持有任一激活羁绊且该武器属于它（用于条件/机制快速判断）。 */
export function weaponBondTier(player: PlayerState, weaponType: WeaponType, bondId: BondId): BondTier {
  const def = BONDS[bondId];
  if (!def.weapons.includes(weaponType)) return 0;
  return getBondTier(player, bondId);
}

/** computeWeaponDamage 用的轻量目标视图（EnemyState / BossState 均满足）。 */
export interface BondDamageTarget {
  hp: number;
  maxHp: number;
  x: number;
  z: number;
  bondVulnTimer?: number;
  bondVulnPct?: number;
  hunterBranded?: boolean;
}

/**
 * 与目标相关的「条件 / 机制」额外伤害 increased 总和（不含无条件 T1，那部分走 bondDamageMods）。
 * 纯读取，无副作用。computeWeaponDamage 把返回值作为一条 increased 修饰符注入。
 */
export function bondConditionalDamageInc(
  player: PlayerState,
  weaponType: WeaponType,
  target: BondDamageTarget | null | undefined,
): number {
  const bondIds = BONDS_BY_WEAPON[weaponType];
  if (!bondIds || bondIds.length === 0) return 0;
  let inc = 0;

  for (const id of bondIds) {
    const tier = getBondTier(player, id);
    if (tier === 0) continue;
    const def = BONDS[id];

    // —— 条件 T1 ——（zero_range 贴身 / bone_crush 高血量）
    const cond = def.t1.conditional;
    if (cond && target) {
      if (cond.cond === 'close') {
        const dx = target.x - player.x;
        const dz = target.z - player.z;
        if (dx * dx + dz * dz <= (def.params.closeRange ?? 3) ** 2) inc += cond.value;
      } else if (cond.cond === 'hp_above_50') {
        if (target.maxHp > 0 && target.hp / target.maxHp > 0.5) inc += cond.value;
      }
    }

    // —— T2/T3 目标相关机制增伤 ——
    if (id === 'bone_crush' && tier >= 2 && target && (target.bondVulnTimer ?? 0) > 0) {
      inc += target.bondVulnPct ?? def.params.vulnPct;
    }
    if (id === 'hunter_mark' && tier >= 2 && target && target.hunterBranded) {
      inc += def.params.brandDmgInc;
    }
    if (id === 'iron_blood') {
      if (tier >= 2 && weaponType === 'sword' && (player.bondIronStacks ?? 0) > 0) {
        inc += def.params.nextHitInc * (player.bondIronStacks ?? 0);
      }
      if (tier >= 3 && (player.bondIronRageTimer ?? 0) > 0) {
        inc += def.params.rageDamageInc;
      }
    }
  }
  return inc;
}
