// === MegaBonk Survivor - Type Definitions ===

// --- Input ---
export interface InputState {
  moveX: number; // -1~1
  moveY: number; // -1~1
  dash: boolean;
  skill1: boolean;
  skill2: boolean;
  jump: boolean;
  slide: boolean;
}

// --- Characters ---
export type CharacterType = 'megachad' | 'roberto' | 'skateboard_skeleton';

export interface CharacterConfig {
  type: CharacterType;
  hp: number;
  speed: number;
  damage: number;
  armor: number;
  critChance: number;
  weaponSlots: number;
  startingWeapon: WeaponType;
}

// --- Weapons ---
export type WeaponType =
  | 'sword'
  | 'bone_bouncer'
  | 'axe'
  | 'bow'
  | 'lightning_staff'
  | 'flame_ring'
  | 'tornado'
  | 'shotgun';

export interface WeaponState {
  type: WeaponType;
  level: number;
  cooldownTimer: number;
  evolved: boolean;
}

// --- Tomes (passive items) ---
export type TomeType =
  | 'attack_speed_tome'
  | 'luck_tome'
  | 'thorns_tome'
  | 'shield_tome'
  | 'xp_gain_tome'
  | 'attraction_tome'
  | 'curse_tome'
  | 'precision_tome'
  | 'knockback_tome'
  | 'speed_tome';

// Legacy alias
export type PassiveType = TomeType;

export interface TomeState {
  type: TomeType;
  level: number;
}

// Legacy alias
export type PassiveState = TomeState;

// --- Player ---
export interface PlayerState {
  x: number;
  y: number;
  z: number;
  rotation: number;
  velocityY: number;
  isGrounded: boolean;
  isJumping: boolean;
  isSliding: boolean;
  slideTimer: number;
  slideSpeedBoost: number;
  bunnyHopTimer: number;
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  xpToNext: number;
  speed: number;
  currentSpeed: number; // actual speed (lerps toward target for acceleration feel)
  damageMultiplier: number;
  attackSpeedMultiplier: number;
  critChance: number;
  critDamage: number;
  armor: number;
  pickupRadius: number;
  weapons: WeaponState[];
  tomes: TomeState[];
  // Legacy alias kept for compatibility
  passives: TomeState[];
  dashCooldown: number;
  dashCooldownMax: number;
  dashTimer: number;
  invincibleTimer: number;
  alive: boolean;
  character: CharacterType;
  maxWeaponSlots: number;
  comboCount: number;
  comboTimer: number;
}

// --- Enemies ---
export type EnemyType =
  | 'skeleton_soldier'
  | 'zombie'
  | 'skeleton_archer'
  | 'skeleton_knight'
  | 'necromancer'
  | 'gargoyle';

export type EnemyBehavior = 'chase' | 'ranged' | 'charge' | 'dive';

export interface EnemyState {
  id: number;
  type: EnemyType;
  x: number;
  y: number;
  z: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  behavior: EnemyBehavior;
  isElite: boolean;
  isMiniBoss: boolean;
  hitFlashTimer: number;
  attackCooldown: number;
  attackCooldownMax: number;
  targetX: number;
  targetZ: number;
  // Charge behavior (skeleton_knight)
  chargeState: 'idle' | 'windup' | 'charging' | 'cooldown';
  chargeTimer: number;
  chargeTargetX: number;
  chargeTargetZ: number;
  // Necromancer summon
  summonCooldown: number;
  // Bat swarm orbit
  orbitAngle: number;
  orbitTimer: number;
  // Gargoyle dive state
  diveState: 'flying' | 'diving' | 'landing' | 'rising';
  diveTimer: number;
}

// --- Projectiles ---
export interface ProjectileState {
  id: number;
  weaponType: WeaponType;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  damage: number;
  bouncesLeft: number;
  pierceLeft: number;
  lifetime: number;
  radius: number;
  fromPlayer: boolean;
  hitEnemyIds: number[];
  // Special behaviors
  orbiting?: boolean;
  orbitAngle?: number;
  orbitRadius?: number;
  orbitSpeed?: number;
  gravitational?: boolean;
  gravityStrength?: number;
  spinning?: boolean;
  spinAngle?: number;
}

// --- Pickups ---
export type PickupType = 'xp_green' | 'xp_blue' | 'xp_purple' | 'xp_orange' | 'silver' | 'health' | 'health_small';

export interface PickupState {
  id: number;
  type: PickupType;
  x: number;
  y: number;
  z: number;
  value: number;
  lifetime: number;
  attracted: boolean;
}

// --- Chest ---
export interface ChestState {
  id: number;
  x: number;
  z: number;
  opened: boolean;
  reward: number; // silver amount
}

// --- Teleporter ---
export type TeleporterPhase = 'inactive' | 'available' | 'activating' | 'activated';

export interface TeleporterState {
  x: number;
  z: number;
  phase: TeleporterPhase;
  activationTimer: number;
  activationDuration: number;
}

// --- Upgrades ---
export type UpgradeRarity = 'common' | 'uncommon' | 'rare' | 'legendary';
export type UpgradeKind = 'weapon_upgrade' | 'new_weapon' | 'tome';

export interface UpgradeOption {
  id: string;
  kind: UpgradeKind;
  rarity: UpgradeRarity;
  weaponType?: WeaponType;
  tomeType?: TomeType;
  /** @deprecated use tomeType */
  passiveType?: TomeType;
  currentLevel: number;
  newLevel: number;
}

// --- Boss ---
export type BossPhase = 1 | 2 | 3;
export type BossAttack = 'melee_sweep' | 'ground_slam' | 'summon_wave' | 'dark_bolt' | 'aoe_explosion' | 'charge' | 'dark_rain' | 'idle';

export interface BossState {
  x: number;
  y: number;
  z: number;
  hp: number;
  maxHp: number;
  phase: BossPhase;
  currentAttack: BossAttack;
  attackTimer: number;
  attackCooldown: number;
  hitFlashTimer: number;
  speed: number;
  enraged: boolean;
}

// --- Damage Events (for rendering feedback) ---
export interface DamageEvent {
  x: number;
  y: number;
  z: number;
  damage: number;
  isCrit: boolean;
  isPlayerDamage: boolean;
  /** Optional source weapon — used by client to drive weapon-specific VFX. */
  weaponType?: WeaponType;
}

// --- Game State ---
export type GamePhase = 'menu' | 'playing' | 'level_up' | 'boss_intro' | 'boss_fight' | 'victory' | 'defeat' | 'paused';

export interface GameStats {
  killCount: number;
  damageDealt: number;
  damageTaken: number;
  silverEarned: number;
}

export interface GameState {
  tick: number;
  gameTime: number;
  running: boolean;
  paused: boolean;
  finished: boolean;
  phase: GamePhase;
  player: PlayerState;
  enemies: EnemyState[];
  projectiles: ProjectileState[];
  pickups: PickupState[];
  chests: ChestState[];
  boss: BossState | null;
  upgradeOptions: UpgradeOption[] | null;
  damageEvents: DamageEvent[];
  stats: GameStats;
  waveIndex: number;
  teleporters: TeleporterState[];
  character: CharacterType;
  finalSwarm: boolean;
}

// --- Difficulty ---
export type DifficultyTier = 1 | 2 | 3;

// --- Config ---
export interface GameConfig {
  mapSize: number;
  tickIntervalMs: number;
  maxEnemies: number;
  character: CharacterType;
  tier: DifficultyTier;
}

// --- Result ---
export interface GameResult {
  victory: boolean;
  survivalTime: number;
  killCount: number;
  level: number;
  silverEarned: number;
}
