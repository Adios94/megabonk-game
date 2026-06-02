/**
 * Tome 数据驱动定义。
 *
 * Phase 5 把原 `GameInstance.recalculateTomeStats` 内的 switch case 抽到这里，
 * 每个 tome 在数据上声明 "level → modifier 列表"，喂给 stat pipeline。
 *
 * 5 个 stat tomes（speed/attack_speed/attraction/shield/precision）输出 modifiers。
 * 5 个 contextual tomes（thorns/knockback/luck/xp_gain/curse）的效果在各自代码路径
 * 直接读 `player.tomes.find(...)?.level`，本表里 `modifiers: () => []`，仅作 metadata。
 *
 * 加一个 tome = 在此处加一行 + （如需）对应代码路径接 player.tomes 即可。
 */
import type { Modifier } from '../stats/Modifier.ts';
import type { TomeType } from '../types.ts';

/**
 * Stat ID 命名约定 —— 喂给 player StatBlock 的 stat 字符串：
 *
 * - `moveSpeed`     → 玩家移速 (charCfg.speed + shopBonus 是 base)
 * - `attackSpeed`   → 玩家攻速倍率 (base 1.0)
 * - `damageMult`    → 玩家全局伤害倍率 (charCfg.damage + shopBonus 是 base)
 * - `critChance`    → 暴击率 (charCfg.critChance + shopBonus 是 base)
 * - `critDamage`    → 暴击伤害倍数 (PLAYER_BASE_CRIT_DAMAGE 是 base)
 * - `armor`         → 护甲 (charCfg.armor + shopBonus 是 base)
 * - `pickupRadius`  → 拾取半径 (PLAYER_PICKUP_RADIUS + shopBonus 是 base)
 *
 * 这些 ID 与 stats/recomputePlayerStats.ts 互相对应。
 */
export type PlayerStatId =
  | 'moveSpeed'
  | 'attackSpeed'
  | 'damageMult'
  | 'critChance'
  | 'critDamage'
  | 'armor'
  | 'pickupRadius';

export interface TomeDef {
  type: TomeType;
  maxLevel: number;
  /**
   * 给定 level 返回该 tome 提供的 modifier 列表。喂给 player StatBlock。
   * Contextual tomes（thorns/knockback/luck/xp_gain/curse）返回空数组。
   */
  modifiers(level: number): readonly Modifier[];
  /**
   * 标记 contextual tome —— 文档 / debug 用。代码路径通过 player.tomes.find 直接读 level，
   * 不走 stat pipeline。设为 true 时 modifiers() 必须返回空。
   */
  contextOnly?: boolean;
  /** 简短说明（描述用，不参与计算） */
  description: string;
  tags?: readonly string[];
}

// ─────────────────────────────────────────────────────────────────────────
// 5 个 stat tomes —— 走 stat pipeline
// ─────────────────────────────────────────────────────────────────────────

const attackSpeedTome: TomeDef = {
  type: 'attack_speed_tome',
  maxLevel: 5,
  modifiers: (lv) => [{ kind: 'increased', stat: 'attackSpeed', value: lv * 0.10 }],
  description: '攻速 +10%/级',
  tags: ['offensive'],
};

const speedTome: TomeDef = {
  type: 'speed_tome',
  maxLevel: 5,
  modifiers: (lv) => [{ kind: 'increased', stat: 'moveSpeed', value: lv * 0.08 }],
  description: '移速 +8%/级',
  tags: ['mobility'],
};

const attractionTome: TomeDef = {
  type: 'attraction_tome',
  maxLevel: 5,
  modifiers: (lv) => [{ kind: 'added', stat: 'pickupRadius', value: lv * 1.2 }],
  description: '拾取半径 +1.2/级',
  tags: ['utility'],
};

const shieldTome: TomeDef = {
  type: 'shield_tome',
  maxLevel: 5,
  /**
   * shield_tome 既给 armor +2/级（stat pipeline），又在 damagePlayer 路径
   * 读 level 应用 5%/级 的二次减免。后者属于 contextual 部分，本 def 只声明 armor。
   */
  modifiers: (lv) => [{ kind: 'added', stat: 'armor', value: lv * 2 }],
  description: '护甲 +2/级；伤害减免 +5%/级（contextual）',
  tags: ['defense'],
};

const precisionTome: TomeDef = {
  type: 'precision_tome',
  maxLevel: 5,
  modifiers: (lv) => [
    { kind: 'added', stat: 'critChance', value: lv * 0.05 },
    { kind: 'added', stat: 'critDamage', value: lv * 0.10 },
  ],
  description: '暴击率 +5%/级，暴击伤害 +10%/级',
  tags: ['offensive'],
};

// ─────────────────────────────────────────────────────────────────────────
// 5 个 contextual tomes —— 仅在各自代码路径读 level，不出 modifier
// ─────────────────────────────────────────────────────────────────────────

const thornsTome: TomeDef = {
  type: 'thorns_tome',
  maxLevel: 5,
  modifiers: () => [],
  contextOnly: true,
  description: '反伤 (applyThornsDamage 直接读 level)',
};

const knockbackTome: TomeDef = {
  type: 'knockback_tome',
  maxLevel: 3,
  modifiers: () => [],
  contextOnly: true,
  description: '击退增强 (applyKnockback 路径)',
};

const luckTome: TomeDef = {
  type: 'luck_tome',
  maxLevel: 3,
  modifiers: () => [],
  contextOnly: true,
  description: '稀有度倾斜 (rollRarity 读 level)',
};

const xpGainTome: TomeDef = {
  type: 'xp_gain_tome',
  maxLevel: 5,
  modifiers: () => [],
  contextOnly: true,
  description: '经验加成 (spawnPickupFromEnemy 路径)',
};

const curseTome: TomeDef = {
  type: 'curse_tome',
  maxLevel: 3,
  modifiers: () => [],
  contextOnly: true,
  description: '敌人移速 +10%/级；XP +多倍 (moveEnemy / spawnPickup 路径)',
};

export const TOMES: Record<TomeType, TomeDef> = {
  attack_speed_tome: attackSpeedTome,
  speed_tome: speedTome,
  attraction_tome: attractionTome,
  shield_tome: shieldTome,
  precision_tome: precisionTome,
  thorns_tome: thornsTome,
  knockback_tome: knockbackTome,
  luck_tome: luckTome,
  xp_gain_tome: xpGainTome,
  curse_tome: curseTome,
};

/** 便利：导出 max level 表（与原 config.TOME_MAX_LEVELS 等价 + 单一 source of truth） */
export const TOME_MAX_LEVELS_FROM_DATA: Record<TomeType, number> = {
  attack_speed_tome: TOMES.attack_speed_tome.maxLevel,
  luck_tome: TOMES.luck_tome.maxLevel,
  thorns_tome: TOMES.thorns_tome.maxLevel,
  shield_tome: TOMES.shield_tome.maxLevel,
  xp_gain_tome: TOMES.xp_gain_tome.maxLevel,
  attraction_tome: TOMES.attraction_tome.maxLevel,
  curse_tome: TOMES.curse_tome.maxLevel,
  precision_tome: TOMES.precision_tome.maxLevel,
  knockback_tome: TOMES.knockback_tome.maxLevel,
  speed_tome: TOMES.speed_tome.maxLevel,
};
