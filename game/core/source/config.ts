import type { GameConfig, CharacterType, CharacterConfig, TomeType, WeaponType, DifficultyTier } from './types.ts';

export const MAP_SIZE = 120;
export const TICK_INTERVAL_MS = 1000 / 60;
export const MAX_ENEMIES = 100;
export const MAX_PROJECTILES = 200;
export const MAX_PICKUPS = 300;

export const PLAYER_BASE_HP = 100;
export const PLAYER_BASE_SPEED = 4.0;
export const PLAYER_BASE_CRIT_CHANCE = 0.05;
export const PLAYER_BASE_CRIT_DAMAGE = 1.5;
export const PLAYER_PICKUP_RADIUS = 2.0;
export const PLAYER_INVINCIBLE_DURATION = 0.5;

export const DASH_DISTANCE = 6;
export const DASH_DURATION = 0.2;
export const DASH_COOLDOWN = 5;

// Jump & Slide (MegaBonk movement)
export const JUMP_FORCE = 6.0;
export const GRAVITY = 18.0;
export const SLIDE_DURATION = 0.5;
export const SLIDE_SPEED_MULTIPLIER = 1.6;
export const SLIDE_COOLDOWN = 0.3;
export const BUNNY_HOP_WINDOW = 0.15; // seconds after landing to chain jump
export const BUNNY_HOP_BONUS = 1.2; // extra jump height multiplier for bunny hops

export const MAX_LEVEL = 40;
export const MAX_WEAPONS_DEFAULT = 2; // Start with 2 weapon slots (MegaBonk progression)
export const MAX_WEAPONS_CAP = 6; // Absolute max weapon slots
export const XP_BASE = 10;
export const XP_GROWTH = 0.35;

export const BOSS_SPAWN_TIME = 540;
export const BOSS_HP = 2000;
export const BOSS_INTRO_DURATION = 2.0;
/**
 * 常规生存期（秒）。超过这个时间且玩家未进传送门 → 进入 overtime。
 * 与 BOSS_SPAWN_TIME 数值相同，但语义不同：BOSS_SPAWN_TIME 是历史遗留的硬编码触发时间，
 * 现在已不再用作 Boss 触发条件，仅供测试 / 兼容引用。
 */
export const REGULAR_GAME_DURATION = 540;

export const PICKUP_LIFETIME = 30;
export const PICKUP_ATTRACT_SPEED = 12;

// Health drop chances (on enemy death)
export const HEALTH_DROP_CHANCE = 0.03;       // 3% chance for full heart (50 HP)
export const HEALTH_SMALL_DROP_CHANCE = 0.08; // 8% chance for half heart (25 HP)

// Chest settings
export const CHEST_COUNT = 4;                 // Number of chests per game
export const CHEST_INTERACT_RADIUS = 2.5;
export const CHEST_SILVER_MIN = 50;
export const CHEST_SILVER_MAX = 200;

// Altar (formerly Teleporter) settings
/** 召唤 Boss 的读条秒数（防误触）。 */
export const ALTAR_SUMMON_DURATION = 1.0;
/** 玩家与祭坛 / 传送门交互的触发半径。 */
export const ALTAR_INTERACT_RADIUS = 2.0;
/** 祭坛距出生点的最小距离（要求玩家探索才能找到）。 */
export const ALTAR_MIN_DISTANCE = 25;
/** 祭坛距地图中心的最大相对距离（halfMap 系数）。避免出图边。 */
export const ALTAR_MAX_DISTANCE_RATIO = 0.6;

/**
 * @deprecated 旧 teleporter 系统的常量，保留为 alias 以减少破坏。新代码用 ALTAR_*。
 */
export const TELEPORTER_ACTIVATION_DURATION = ALTAR_SUMMON_DURATION;
/**
 * @deprecated 旧 teleporter 出现时间。新设计开局即生成；本常量仅留兼容。
 */
export const TELEPORTER_APPEAR_TIME = 0;
/**
 * @deprecated 使用 ALTAR_INTERACT_RADIUS。
 */
export const TELEPORTER_RADIUS = ALTAR_INTERACT_RADIUS;

// Charge Shrine settings
/** 一局生成多少个充能圣殿。 */
export const SHRINE_COUNT = 3;
/** 玩家进入充能圈的半径。 */
export const SHRINE_RADIUS = 2.5;
/** 充满 / 解锁需要的站立秒数。 */
export const SHRINE_CHARGE_DURATION = 4.0;
/** 解锁后的奖励选项数量（megabonk 充能圣殿固定为 4 选 1）。 */
export const SHRINE_REWARD_COUNT = 4;
/** 护盾每秒回满的速率（玩家护盾比 HP 恢复快得多）。 */
export const SHIELD_REGEN_RATE = 5.0;
/** 离开战斗多久护盾才开始回（其它情况护盾不回）。 */
export const SHIELD_REGEN_DELAY = 3.0;

// XP values for pickup types
export const XP_VALUES: Record<string, number> = {
  xp_green: 1,
  xp_blue: 5,
  xp_purple: 25,
  xp_orange: 100,
};

// === Character Configs ===
export const CHARACTER_CONFIGS: Record<CharacterType, CharacterConfig> = {
  megachad: {
    type: 'megachad',
    hp: 100,
    speed: 4.0,
    damage: 1.2,
    armor: 0,
    critChance: 0.08,
    weaponSlots: 2,
    startingWeapon: 'sword',
  },
  roberto: {
    type: 'roberto',
    hp: 150,
    speed: 3.2,
    damage: 1.0,
    armor: 3,
    critChance: 0.05,
    weaponSlots: 2,
    startingWeapon: 'axe',
  },
  skateboard_skeleton: {
    type: 'skateboard_skeleton',
    hp: 70,
    speed: 5.0,
    damage: 0.9,
    armor: 0,
    critChance: 0.1,
    weaponSlots: 2,
    startingWeapon: 'bone_bouncer',
  },
};

// Enemy configs — moved to data/enemies.ts (Phase 4a, single source of truth)
// `index.ts` re-exports ENEMY_CONFIGS + EnemyConfig from data/enemies.ts as legacy aliases.

// Wave configs
export interface WaveConfig {
  timeStart: number;
  timeEnd: number;
  spawnInterval: number;
  maxAlive: number;
  enemies: string[];
  groupSize: [number, number];
  eliteChance: number;
}

export const WAVE_CONFIGS: WaveConfig[] = [
  { timeStart: 0, timeEnd: 60, spawnInterval: 2.0, maxAlive: 30, enemies: ['skeleton_soldier'], groupSize: [1, 3], eliteChance: 0 },
  { timeStart: 60, timeEnd: 180, spawnInterval: 1.5, maxAlive: 50, enemies: ['skeleton_soldier', 'zombie'], groupSize: [2, 4], eliteChance: 0.05 },
  { timeStart: 180, timeEnd: 300, spawnInterval: 1.2, maxAlive: 70, enemies: ['skeleton_soldier', 'zombie', 'skeleton_archer'], groupSize: [3, 5], eliteChance: 0.1 },
  { timeStart: 300, timeEnd: 420, spawnInterval: 1.0, maxAlive: 85, enemies: ['zombie', 'skeleton_archer', 'skeleton_soldier'], groupSize: [3, 6], eliteChance: 0.15 },
  { timeStart: 420, timeEnd: 540, spawnInterval: 0.8, maxAlive: 100, enemies: ['zombie', 'skeleton_archer', 'skeleton_soldier'], groupSize: [4, 8], eliteChance: 0.2 },
];

// Weapon level stats
export interface WeaponLevelStats {
  damage: number;
  cooldown: number;
  projectileCount: number;
  bounces: number;
  chains: number;
  range: number;
  aoeRadius: number;
  pierce: number;
  speed: number;
}

export const WEAPON_STATS: Record<string, WeaponLevelStats[]> = {
  sword: [
    { damage: 12, cooldown: 0.8, projectileCount: 1, bounces: 0, chains: 0, range: 2.5, aoeRadius: 2.5, pierce: 999, speed: 0 },
    { damage: 15, cooldown: 0.8, projectileCount: 1, bounces: 0, chains: 0, range: 2.8, aoeRadius: 2.8, pierce: 999, speed: 0 },
    { damage: 18, cooldown: 0.7, projectileCount: 1, bounces: 0, chains: 0, range: 3.0, aoeRadius: 3.0, pierce: 999, speed: 0 },
    { damage: 22, cooldown: 0.7, projectileCount: 1, bounces: 0, chains: 0, range: 3.2, aoeRadius: 3.2, pierce: 999, speed: 0 },
    { damage: 26, cooldown: 0.6, projectileCount: 1, bounces: 0, chains: 0, range: 3.5, aoeRadius: 3.5, pierce: 999, speed: 0 },
    { damage: 30, cooldown: 0.6, projectileCount: 2, bounces: 0, chains: 0, range: 3.8, aoeRadius: 3.8, pierce: 999, speed: 0 },
    { damage: 35, cooldown: 0.5, projectileCount: 2, bounces: 0, chains: 0, range: 4.0, aoeRadius: 4.0, pierce: 999, speed: 0 },
    { damage: 42, cooldown: 0.5, projectileCount: 3, bounces: 0, chains: 0, range: 4.5, aoeRadius: 4.5, pierce: 999, speed: 0 },
  ],
  bone_bouncer: [
    { damage: 8, cooldown: 1.2, projectileCount: 1, bounces: 2, chains: 0, range: 0, aoeRadius: 0, pierce: 0, speed: 12 },
    { damage: 10, cooldown: 1.2, projectileCount: 1, bounces: 2, chains: 0, range: 0, aoeRadius: 0, pierce: 0, speed: 12 },
    { damage: 10, cooldown: 1.2, projectileCount: 1, bounces: 3, chains: 0, range: 0, aoeRadius: 0, pierce: 0, speed: 12 },
    { damage: 12, cooldown: 1.0, projectileCount: 1, bounces: 3, chains: 0, range: 0, aoeRadius: 0, pierce: 0, speed: 13 },
    { damage: 12, cooldown: 1.0, projectileCount: 2, bounces: 4, chains: 0, range: 0, aoeRadius: 0, pierce: 0, speed: 13 },
    { damage: 16, cooldown: 1.0, projectileCount: 2, bounces: 4, chains: 0, range: 0, aoeRadius: 0, pierce: 0, speed: 14 },
    { damage: 16, cooldown: 0.8, projectileCount: 2, bounces: 5, chains: 0, range: 0, aoeRadius: 0, pierce: 0, speed: 14 },
    { damage: 20, cooldown: 0.8, projectileCount: 3, bounces: 6, chains: 0, range: 0, aoeRadius: 0, pierce: 0, speed: 15 },
  ],
  axe: [
    { damage: 10, cooldown: 1.5, projectileCount: 1, bounces: 0, chains: 0, range: 3.0, aoeRadius: 1.0, pierce: 999, speed: 4 },
    { damage: 12, cooldown: 1.5, projectileCount: 1, bounces: 0, chains: 0, range: 3.0, aoeRadius: 1.0, pierce: 999, speed: 4 },
    { damage: 14, cooldown: 1.4, projectileCount: 2, bounces: 0, chains: 0, range: 3.5, aoeRadius: 1.0, pierce: 999, speed: 4.5 },
    { damage: 16, cooldown: 1.3, projectileCount: 2, bounces: 0, chains: 0, range: 3.5, aoeRadius: 1.2, pierce: 999, speed: 4.5 },
    { damage: 18, cooldown: 1.2, projectileCount: 3, bounces: 0, chains: 0, range: 4.0, aoeRadius: 1.2, pierce: 999, speed: 5 },
    { damage: 22, cooldown: 1.1, projectileCount: 3, bounces: 0, chains: 0, range: 4.0, aoeRadius: 1.4, pierce: 999, speed: 5 },
    { damage: 26, cooldown: 1.0, projectileCount: 4, bounces: 0, chains: 0, range: 4.5, aoeRadius: 1.4, pierce: 999, speed: 5.5 },
    { damage: 32, cooldown: 0.9, projectileCount: 4, bounces: 0, chains: 0, range: 5.0, aoeRadius: 1.6, pierce: 999, speed: 6 },
  ],
  bow: [
    { damage: 18, cooldown: 1.0, projectileCount: 1, bounces: 0, chains: 0, range: 30, aoeRadius: 0, pierce: 0, speed: 25 },
    { damage: 22, cooldown: 1.0, projectileCount: 1, bounces: 0, chains: 0, range: 32, aoeRadius: 0, pierce: 0, speed: 26 },
    { damage: 26, cooldown: 0.9, projectileCount: 1, bounces: 0, chains: 0, range: 34, aoeRadius: 0, pierce: 1, speed: 27 },
    { damage: 30, cooldown: 0.85, projectileCount: 2, bounces: 0, chains: 0, range: 36, aoeRadius: 0, pierce: 1, speed: 28 },
    { damage: 35, cooldown: 0.8, projectileCount: 2, bounces: 0, chains: 0, range: 38, aoeRadius: 0, pierce: 2, speed: 29 },
    { damage: 40, cooldown: 0.75, projectileCount: 2, bounces: 0, chains: 0, range: 40, aoeRadius: 0, pierce: 2, speed: 30 },
    { damage: 48, cooldown: 0.7, projectileCount: 3, bounces: 0, chains: 0, range: 42, aoeRadius: 0, pierce: 3, speed: 32 },
    { damage: 58, cooldown: 0.6, projectileCount: 3, bounces: 0, chains: 0, range: 45, aoeRadius: 0, pierce: 4, speed: 35 },
  ],
  lightning_staff: [
    { damage: 15, cooldown: 2.0, projectileCount: 1, bounces: 0, chains: 3, range: 8, aoeRadius: 0, pierce: 0, speed: 0 },
    { damage: 18, cooldown: 2.0, projectileCount: 1, bounces: 0, chains: 3, range: 8, aoeRadius: 0, pierce: 0, speed: 0 },
    { damage: 18, cooldown: 2.0, projectileCount: 1, bounces: 0, chains: 4, range: 10, aoeRadius: 0, pierce: 0, speed: 0 },
    { damage: 22, cooldown: 1.7, projectileCount: 1, bounces: 0, chains: 4, range: 10, aoeRadius: 0, pierce: 0, speed: 0 },
    { damage: 22, cooldown: 1.7, projectileCount: 1, bounces: 0, chains: 5, range: 12, aoeRadius: 0, pierce: 0, speed: 0 },
    { damage: 28, cooldown: 1.5, projectileCount: 1, bounces: 0, chains: 5, range: 12, aoeRadius: 0, pierce: 0, speed: 0 },
    { damage: 28, cooldown: 1.5, projectileCount: 1, bounces: 0, chains: 6, range: 14, aoeRadius: 0, pierce: 0, speed: 0 },
    { damage: 35, cooldown: 1.2, projectileCount: 1, bounces: 0, chains: 8, range: 40, aoeRadius: 0, pierce: 0, speed: 0 },
  ],
  flame_ring: [
    { damage: 4, cooldown: 0.5, projectileCount: 0, bounces: 0, chains: 0, range: 3.5, aoeRadius: 3.5, pierce: 0, speed: 0 },
    { damage: 5, cooldown: 0.5, projectileCount: 0, bounces: 0, chains: 0, range: 3.5, aoeRadius: 3.5, pierce: 0, speed: 0 },
    { damage: 5, cooldown: 0.5, projectileCount: 0, bounces: 0, chains: 0, range: 4.5, aoeRadius: 4.5, pierce: 0, speed: 0 },
    { damage: 7, cooldown: 0.4, projectileCount: 0, bounces: 0, chains: 0, range: 4.5, aoeRadius: 4.5, pierce: 0, speed: 0 },
    { damage: 7, cooldown: 0.4, projectileCount: 0, bounces: 0, chains: 0, range: 5.5, aoeRadius: 5.5, pierce: 0, speed: 0 },
    { damage: 9, cooldown: 0.4, projectileCount: 0, bounces: 0, chains: 0, range: 5.5, aoeRadius: 5.5, pierce: 0, speed: 0 },
    { damage: 9, cooldown: 0.3, projectileCount: 0, bounces: 0, chains: 0, range: 6.5, aoeRadius: 6.5, pierce: 0, speed: 0 },
    { damage: 12, cooldown: 0.3, projectileCount: 0, bounces: 0, chains: 0, range: 8.0, aoeRadius: 8.0, pierce: 0, speed: 0 },
  ],
  shotgun: [
    { damage: 8, cooldown: 1.4, projectileCount: 5, bounces: 0, chains: 0, range: 12, aoeRadius: 0, pierce: 0, speed: 16 },
    { damage: 9, cooldown: 1.3, projectileCount: 5, bounces: 0, chains: 0, range: 13, aoeRadius: 0, pierce: 0, speed: 17 },
    { damage: 10, cooldown: 1.2, projectileCount: 6, bounces: 0, chains: 0, range: 14, aoeRadius: 0, pierce: 0, speed: 18 },
    { damage: 12, cooldown: 1.1, projectileCount: 6, bounces: 0, chains: 0, range: 15, aoeRadius: 0, pierce: 0, speed: 18 },
    { damage: 14, cooldown: 1.0, projectileCount: 7, bounces: 0, chains: 0, range: 16, aoeRadius: 0, pierce: 1, speed: 19 },
    { damage: 16, cooldown: 0.9, projectileCount: 7, bounces: 0, chains: 0, range: 17, aoeRadius: 0, pierce: 1, speed: 20 },
    { damage: 18, cooldown: 0.8, projectileCount: 8, bounces: 0, chains: 0, range: 18, aoeRadius: 0, pierce: 1, speed: 21 },
    { damage: 22, cooldown: 0.7, projectileCount: 9, bounces: 0, chains: 0, range: 20, aoeRadius: 0, pierce: 2, speed: 22 },
  ],
};

// Tome max levels
export const TOME_MAX_LEVELS: Record<TomeType, number> = {
  attack_speed_tome: 5,
  luck_tome: 3,
  thorns_tome: 5,
  shield_tome: 5,
  xp_gain_tome: 5,
  attraction_tome: 5,
  curse_tome: 3,
  precision_tome: 5,
  knockback_tome: 3,
  speed_tome: 5,
};

// Legacy alias
export const PASSIVE_MAX_LEVELS: Record<string, number> = TOME_MAX_LEVELS;

// All weapon types available in the game
export const ALL_WEAPON_TYPES: WeaponType[] = [
  'sword', 'bone_bouncer', 'axe', 'bow',
  'lightning_staff', 'flame_ring',
  'shotgun',
];

// All tome types available in the game
export const ALL_TOME_TYPES: TomeType[] = [
  'attack_speed_tome', 'luck_tome', 'thorns_tome', 'shield_tome',
  'xp_gain_tome', 'attraction_tome', 'curse_tome', 'precision_tome',
  'knockback_tome', 'speed_tome',
];

// === Weapon Evolution System ===
export interface WeaponEvolution {
  baseWeapon: WeaponType;
  requiredTome: TomeType;
  requiredTomeLevel: number;
  evolvedName: string;
  damageMultiplier: number;
  specialEffect: string;
}

export const WEAPON_EVOLUTIONS: WeaponEvolution[] = [
  { baseWeapon: 'sword', requiredTome: 'attack_speed_tome', requiredTomeLevel: 5, evolvedName: 'Dexecutioner', damageMultiplier: 2.5, specialEffect: 'massive_aoe' },
  { baseWeapon: 'axe', requiredTome: 'knockback_tome', requiredTomeLevel: 3, evolvedName: 'Berserker Axe', damageMultiplier: 2.0, specialEffect: 'triple_orbit' },
  { baseWeapon: 'bone_bouncer', requiredTome: 'luck_tome', requiredTomeLevel: 3, evolvedName: 'Bone Storm', damageMultiplier: 2.0, specialEffect: 'explode_on_hit' },
  { baseWeapon: 'bow', requiredTome: 'precision_tome', requiredTomeLevel: 3, evolvedName: 'Deagle', damageMultiplier: 3.0, specialEffect: 'pierce_all' },
  { baseWeapon: 'lightning_staff', requiredTome: 'curse_tome', requiredTomeLevel: 3, evolvedName: 'Thunder God', damageMultiplier: 2.5, specialEffect: 'chain_all' },
];

export const DEFAULT_GAME_CONFIG: GameConfig = {
  mapSize: MAP_SIZE,
  tickIntervalMs: TICK_INTERVAL_MS,
  maxEnemies: MAX_ENEMIES,
  character: 'megachad',
  tier: 1,
};

// === Difficulty Tier System ===
export interface TierConfig {
  tier: DifficultyTier;
  name: string;
  enemyHpMultiplier: number;
  enemyDamageMultiplier: number;
  enemySpeedMultiplier: number;
  xpMultiplier: number;
  silverMultiplier: number;
  /**
   * 本档生成的祭坛 / 传送门数量。当前设计统一 = 1。
   * （字段保留旧名 `teleporterCount` 以减少破坏；新代码可读作"祭坛数量"。）
   */
  teleporterCount: number;
  bossHpMultiplier: number;
}

export const TIER_CONFIGS: Record<DifficultyTier, TierConfig> = {
  1: { tier: 1, name: 'Normal', enemyHpMultiplier: 1.0, enemyDamageMultiplier: 1.0, enemySpeedMultiplier: 1.0, xpMultiplier: 1.0, silverMultiplier: 1.0, teleporterCount: 1, bossHpMultiplier: 1.0 },
  2: { tier: 2, name: 'Hard', enemyHpMultiplier: 1.5, enemyDamageMultiplier: 1.3, enemySpeedMultiplier: 1.1, xpMultiplier: 1.5, silverMultiplier: 2.0, teleporterCount: 1, bossHpMultiplier: 1.5 },
  3: { tier: 3, name: 'Nightmare', enemyHpMultiplier: 2.5, enemyDamageMultiplier: 1.8, enemySpeedMultiplier: 1.2, xpMultiplier: 2.0, silverMultiplier: 3.0, teleporterCount: 1, bossHpMultiplier: 2.5 },
};

// === Overtime 难度系数 ===
/** Overtime 系数每多少秒升一档。 */
export const OVERTIME_STEP_SECONDS = 30;
/** Overtime 每档给敌人 HP 与伤害的增量（线性）。 */
export const OVERTIME_HP_DAMAGE_PER_STEP = 0.10;
/** Overtime 每档给敌人速度的增量（更温和，避免风筝失灵）。 */
export const OVERTIME_SPEED_PER_STEP = 0.04;
