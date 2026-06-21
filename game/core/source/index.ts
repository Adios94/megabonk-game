// === MegaBonk Survivor - Core Package Exports ===

export type {
  InputState,
  WeaponType,
  WeaponState,
  PassiveType,
  PassiveState,
  TomeType,
  TomeState,
  RelicId,
  RelicRarity,
  BondId,
  BondTier,
  BondProgress,
  ConsumableId,
  CharacterType,
  CharacterConfig,
  PlayerState,
  EnemyType,
  EnemyBehavior,
  EnemyState,
  ProjectileState,
  PickupType,
  PickupState,
  GoldMoteState,
  AltarPhase,
  AltarState,
  TeleporterPhase,
  TeleporterState,
  ChestState,
  ShrinePhase,
  ShrineState,
  ShrineRewardType,
  ShrineRewardOption,
  UpgradeRarity,
  UpgradeKind,
  UpgradeOption,
  BossPhase,
  BossAttack,
  BossState,
  DamageEvent,
  LevelUpCompensationEvent,
  ChestOpenEvent,
  PendingChestReward,
  GamePhase,
  GameStats,
  BondDamageStats,
  GameState,
  GameConfig,
  GameResult,
  DifficultyTier,
  RunStage,
  CollisionRect,
  WallBox,
  ClimbVolume,
  RampVolume,
  LevelSpawnPoints,
  LevelData,
} from './types.ts';

export {
  MAP_SIZE,
  TICK_INTERVAL_MS,
  MAX_ENEMIES,
  MAX_PROJECTILES,
  MAX_PICKUPS,
  PLAYER_BASE_HP,
  PLAYER_BASE_SPEED,
  PLAYER_BASE_CRIT_CHANCE,
  PLAYER_BASE_CRIT_DAMAGE,
  PLAYER_PICKUP_RADIUS,
  PLAYER_INVINCIBLE_DURATION,
  DASH_DISTANCE,
  DASH_DURATION,
  DASH_COOLDOWN,
  MAX_LEVEL,
  ACTIVE_WEAPON_SLOTS_INRUN_MAX,
  MAX_WEAPONS_DEFAULT,
  MAX_WEAPONS_CAP,
  XP_BASE,
  XP_GROWTH,
  BOSS_SPAWN_TIME,
  BOSS_HP,
  BOSS_INTRO_DURATION,
  PICKUP_LIFETIME,
  PICKUP_ATTRACT_SPEED,
  XP_VALUES,
  WAVE_CONFIGS,
  WEAPON_STATS,
  PASSIVE_MAX_LEVELS,
  TOME_MAX_LEVELS,
  CHARACTER_CONFIGS,
  ALL_WEAPON_TYPES,
  ALL_TOME_TYPES,
  DEFAULT_GAME_CONFIG,
  TIER_CONFIGS,
  CHEST_INTERACT_RADIUS,
  CHEST_INTERACT_MAX_Y_DELTA,
} from './config.ts';

export type { WaveConfig, WeaponLevelStats, TierConfig } from './config.ts';

// Phase 4a: ENEMY_CONFIGS + EnemyConfig source-of-truth 迁到 data/enemies.ts。
// 外部 API 不变 (re-export legacy 别名 + 新 ENEMIES/EnemyDef 同时暴露)。
export { ENEMIES, ENEMY_CONFIGS } from './data/enemies.ts';
export type { EnemyDef, EnemyConfig, EnemyModifierId } from './data/enemies.ts';
export { RELICS, ALL_RELIC_IDS, getRelicStack } from './data/relics.ts';
export type { RelicDef } from './data/relics.ts';

// 羁绊系统（替代武器进化）
export {
  BONDS, ALL_BOND_IDS, BONDS_BY_WEAPON,
  bondThresholds, evalBondCounts, highestEligibleTier, getBondTier,
} from './data/bonds.ts';
export type { BondDef, BondThresholds, BondCounts } from './data/bonds.ts';
export { getChestGoldCost } from './systems/relics.ts';

export { applyMovement3D, distanceBetween, normalizeDirection } from './helpers/physics.ts';
export { SpatialHash } from './helpers/spatialHash.ts';
export { fireWeapon, applyBounce, updateOrbitingProjectile, applyGravitationalPull } from './helpers/projectileMath.ts';
export { computeActiveWeaponSlots, generateUpgradeOptions, xpForLevel } from './data/upgrades.ts';
export { getUpgradePreviewLines } from './data/upgradePreview.ts';
export type { UpgradePreviewLine } from './data/upgradePreview.ts';
export { GameInstance } from './GameInstance.ts';

// Progression systems
export { loadSave, saveSave, getDefaultSave, addSilver, spendSilver, updateRunStats, recordWeaponsUsed, recordBossDefeated } from './services/save.ts';
export type { SaveData } from './services/save.ts';
export { SHOP_UPGRADES, getUpgradeCost, canAfford, purchaseUpgrade, getShopBonuses } from './data/shop.ts';
export type { ShopUpgrade } from './data/shop.ts';
export { QUESTS, checkQuestCompletion, claimQuest, getQuestProgress, getCompletedQuestCount } from './data/quests.ts';
export type { Quest, QuestReward, QuestProgress } from './data/quests.ts';
