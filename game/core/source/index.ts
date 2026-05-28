// === MegaBonk Survivor - Core Package Exports ===

export type {
  InputState,
  WeaponType,
  WeaponState,
  PassiveType,
  PassiveState,
  TomeType,
  TomeState,
  CharacterType,
  CharacterConfig,
  PlayerState,
  EnemyType,
  EnemyBehavior,
  EnemyState,
  ProjectileState,
  PickupType,
  PickupState,
  TeleporterPhase,
  TeleporterState,
  ChestState,
  UpgradeRarity,
  UpgradeKind,
  UpgradeOption,
  BossPhase,
  BossAttack,
  BossState,
  DamageEvent,
  GamePhase,
  GameStats,
  GameState,
  GameConfig,
  GameResult,
  DifficultyTier,
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
  ENEMY_CONFIGS,
  WAVE_CONFIGS,
  WEAPON_STATS,
  PASSIVE_MAX_LEVELS,
  TOME_MAX_LEVELS,
  CHARACTER_CONFIGS,
  ALL_WEAPON_TYPES,
  ALL_TOME_TYPES,
  DEFAULT_GAME_CONFIG,
  WEAPON_EVOLUTIONS,
  TIER_CONFIGS,
} from './config.ts';

export type { EnemyConfig, WaveConfig, WeaponLevelStats, WeaponEvolution, TierConfig } from './config.ts';

export { applyMovement3D, distanceBetween, normalizeDirection } from './physics.ts';
export { SpatialHash } from './spatial-hash.ts';
export { fireWeapon, applyBounce, updateOrbitingProjectile, updateSpinningProjectile, applyGravitationalPull } from './weapons.ts';
export { generateUpgradeOptions, xpForLevel } from './upgrades.ts';
export { GameInstance } from './GameInstance.ts';

// Progression systems
export { loadSave, saveSave, getDefaultSave, addSilver, spendSilver, updateRunStats } from './save.ts';
export type { SaveData } from './save.ts';
export { SHOP_UPGRADES, getUpgradeCost, canAfford, purchaseUpgrade, getShopBonuses } from './shop.ts';
export type { ShopUpgrade } from './shop.ts';
export { QUESTS, checkQuestCompletion, getQuestProgress, getCompletedQuestCount } from './quests.ts';
export type { Quest, QuestReward, QuestProgress } from './quests.ts';
