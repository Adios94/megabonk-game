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

export const PICKUP_LIFETIME = 30;
export const PICKUP_ATTRACT_SPEED = 12;

// Teleporter settings
export const TELEPORTER_ACTIVATION_DURATION = 3.0; // seconds to activate
export const TELEPORTER_APPEAR_TIME = 300; // when teleporter spawns (5 min)
export const TELEPORTER_RADIUS = 2.0; // player must be within this range to activate

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

// Enemy configs
export interface EnemyConfig {
  hp: number;
  damage: number;
  speed: number;
  behavior: string;
  xpReward: number;
  attackCooldown: number;
  isElite: boolean;
  firstAppear: number;
  spawnWeight: number;
  preferredRange?: number;
}

export const ENEMY_CONFIGS: Record<string, EnemyConfig> = {
  skeleton_soldier: { hp: 15, damage: 5, speed: 3.0, behavior: 'chase', xpReward: 1, attackCooldown: 1.5, isElite: false, firstAppear: 0, spawnWeight: 40 },
  ghost: { hp: 10, damage: 8, speed: 4.0, behavior: 'chase', xpReward: 2, attackCooldown: 2.0, isElite: false, firstAppear: 60, spawnWeight: 25 },
  bat: { hp: 5, damage: 3, speed: 5.0, behavior: 'swarm', xpReward: 1, attackCooldown: 1.0, isElite: false, firstAppear: 30, spawnWeight: 30 },
  zombie: { hp: 30, damage: 10, speed: 1.5, behavior: 'chase', xpReward: 3, attackCooldown: 2.5, isElite: false, firstAppear: 90, spawnWeight: 20 },
  skeleton_archer: { hp: 12, damage: 7, speed: 2.5, behavior: 'ranged', xpReward: 3, attackCooldown: 3.0, isElite: false, firstAppear: 120, spawnWeight: 15, preferredRange: 8 },
  skeleton_knight: { hp: 120, damage: 20, speed: 3.5, behavior: 'charge', xpReward: 25, attackCooldown: 2.0, isElite: true, firstAppear: 180, spawnWeight: 5 },
  necromancer: { hp: 80, damage: 15, speed: 2.0, behavior: 'ranged', xpReward: 30, attackCooldown: 4.0, isElite: true, firstAppear: 240, spawnWeight: 3, preferredRange: 10 },
  gargoyle: { hp: 200, damage: 25, speed: 4.0, behavior: 'dive', xpReward: 40, attackCooldown: 3.0, isElite: true, firstAppear: 360, spawnWeight: 2 },
};

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
  { timeStart: 0, timeEnd: 60, spawnInterval: 2.0, maxAlive: 30, enemies: ['skeleton_soldier', 'bat'], groupSize: [1, 3], eliteChance: 0 },
  { timeStart: 60, timeEnd: 180, spawnInterval: 1.5, maxAlive: 50, enemies: ['skeleton_soldier', 'ghost', 'bat', 'zombie'], groupSize: [2, 4], eliteChance: 0.05 },
  { timeStart: 180, timeEnd: 300, spawnInterval: 1.2, maxAlive: 70, enemies: ['skeleton_soldier', 'ghost', 'zombie', 'skeleton_archer'], groupSize: [3, 5], eliteChance: 0.1 },
  { timeStart: 300, timeEnd: 420, spawnInterval: 1.0, maxAlive: 85, enemies: ['ghost', 'zombie', 'skeleton_archer', 'bat'], groupSize: [3, 6], eliteChance: 0.15 },
  { timeStart: 420, timeEnd: 540, spawnInterval: 0.8, maxAlive: 100, enemies: ['zombie', 'skeleton_archer', 'bat', 'ghost'], groupSize: [4, 8], eliteChance: 0.2 },
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
  revolver: [
    { damage: 14, cooldown: 0.6, projectileCount: 1, bounces: 0, chains: 0, range: 20, aoeRadius: 0, pierce: 0, speed: 20 },
    { damage: 17, cooldown: 0.55, projectileCount: 1, bounces: 0, chains: 0, range: 22, aoeRadius: 0, pierce: 0, speed: 22 },
    { damage: 20, cooldown: 0.5, projectileCount: 1, bounces: 0, chains: 0, range: 24, aoeRadius: 0, pierce: 0, speed: 22 },
    { damage: 24, cooldown: 0.45, projectileCount: 1, bounces: 0, chains: 0, range: 26, aoeRadius: 0, pierce: 0, speed: 24 },
    { damage: 28, cooldown: 0.4, projectileCount: 2, bounces: 0, chains: 0, range: 28, aoeRadius: 0, pierce: 0, speed: 24 },
    { damage: 32, cooldown: 0.35, projectileCount: 2, bounces: 0, chains: 0, range: 30, aoeRadius: 0, pierce: 0, speed: 26 },
    { damage: 38, cooldown: 0.3, projectileCount: 2, bounces: 0, chains: 0, range: 32, aoeRadius: 0, pierce: 1, speed: 26 },
    { damage: 45, cooldown: 0.25, projectileCount: 3, bounces: 0, chains: 0, range: 35, aoeRadius: 0, pierce: 1, speed: 28 },
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
  fire_staff: [
    { damage: 22, cooldown: 1.8, projectileCount: 1, bounces: 0, chains: 0, range: 0, aoeRadius: 2.5, pierce: 0, speed: 8 },
    { damage: 26, cooldown: 1.7, projectileCount: 1, bounces: 0, chains: 0, range: 0, aoeRadius: 2.8, pierce: 0, speed: 8 },
    { damage: 30, cooldown: 1.6, projectileCount: 1, bounces: 0, chains: 0, range: 0, aoeRadius: 3.0, pierce: 0, speed: 9 },
    { damage: 35, cooldown: 1.5, projectileCount: 1, bounces: 0, chains: 0, range: 0, aoeRadius: 3.2, pierce: 0, speed: 9 },
    { damage: 40, cooldown: 1.4, projectileCount: 2, bounces: 0, chains: 0, range: 0, aoeRadius: 3.5, pierce: 0, speed: 10 },
    { damage: 46, cooldown: 1.3, projectileCount: 2, bounces: 0, chains: 0, range: 0, aoeRadius: 3.8, pierce: 0, speed: 10 },
    { damage: 54, cooldown: 1.2, projectileCount: 2, bounces: 0, chains: 0, range: 0, aoeRadius: 4.0, pierce: 0, speed: 11 },
    { damage: 65, cooldown: 1.0, projectileCount: 3, bounces: 0, chains: 0, range: 0, aoeRadius: 4.5, pierce: 0, speed: 12 },
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
  tornado: [
    { damage: 6, cooldown: 2.5, projectileCount: 1, bounces: 0, chains: 0, range: 0, aoeRadius: 1.5, pierce: 999, speed: 4 },
    { damage: 7, cooldown: 2.4, projectileCount: 1, bounces: 0, chains: 0, range: 0, aoeRadius: 1.6, pierce: 999, speed: 4.5 },
    { damage: 8, cooldown: 2.3, projectileCount: 1, bounces: 0, chains: 0, range: 0, aoeRadius: 1.8, pierce: 999, speed: 5 },
    { damage: 10, cooldown: 2.2, projectileCount: 2, bounces: 0, chains: 0, range: 0, aoeRadius: 2.0, pierce: 999, speed: 5 },
    { damage: 12, cooldown: 2.0, projectileCount: 2, bounces: 0, chains: 0, range: 0, aoeRadius: 2.2, pierce: 999, speed: 5.5 },
    { damage: 14, cooldown: 1.8, projectileCount: 2, bounces: 0, chains: 0, range: 0, aoeRadius: 2.5, pierce: 999, speed: 6 },
    { damage: 16, cooldown: 1.6, projectileCount: 3, bounces: 0, chains: 0, range: 0, aoeRadius: 2.8, pierce: 999, speed: 6 },
    { damage: 20, cooldown: 1.4, projectileCount: 3, bounces: 0, chains: 0, range: 0, aoeRadius: 3.0, pierce: 999, speed: 7 },
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
  black_hole: [
    { damage: 5, cooldown: 4.0, projectileCount: 1, bounces: 0, chains: 0, range: 0, aoeRadius: 4.0, pierce: 999, speed: 0 },
    { damage: 6, cooldown: 3.8, projectileCount: 1, bounces: 0, chains: 0, range: 0, aoeRadius: 4.5, pierce: 999, speed: 0 },
    { damage: 7, cooldown: 3.6, projectileCount: 1, bounces: 0, chains: 0, range: 0, aoeRadius: 5.0, pierce: 999, speed: 0 },
    { damage: 8, cooldown: 3.4, projectileCount: 1, bounces: 0, chains: 0, range: 0, aoeRadius: 5.5, pierce: 999, speed: 0 },
    { damage: 10, cooldown: 3.2, projectileCount: 2, bounces: 0, chains: 0, range: 0, aoeRadius: 6.0, pierce: 999, speed: 0 },
    { damage: 12, cooldown: 3.0, projectileCount: 2, bounces: 0, chains: 0, range: 0, aoeRadius: 6.5, pierce: 999, speed: 0 },
    { damage: 14, cooldown: 2.8, projectileCount: 2, bounces: 0, chains: 0, range: 0, aoeRadius: 7.0, pierce: 999, speed: 0 },
    { damage: 18, cooldown: 2.5, projectileCount: 3, bounces: 0, chains: 0, range: 0, aoeRadius: 8.0, pierce: 999, speed: 0 },
  ],
  katana: [
    { damage: 16, cooldown: 0.5, projectileCount: 1, bounces: 0, chains: 0, range: 3.0, aoeRadius: 1.5, pierce: 2, speed: 18 },
    { damage: 19, cooldown: 0.48, projectileCount: 1, bounces: 0, chains: 0, range: 3.2, aoeRadius: 1.5, pierce: 2, speed: 19 },
    { damage: 22, cooldown: 0.45, projectileCount: 1, bounces: 0, chains: 0, range: 3.5, aoeRadius: 1.8, pierce: 3, speed: 20 },
    { damage: 26, cooldown: 0.42, projectileCount: 1, bounces: 0, chains: 0, range: 3.8, aoeRadius: 1.8, pierce: 3, speed: 21 },
    { damage: 30, cooldown: 0.4, projectileCount: 2, bounces: 0, chains: 0, range: 4.0, aoeRadius: 2.0, pierce: 4, speed: 22 },
    { damage: 34, cooldown: 0.38, projectileCount: 2, bounces: 0, chains: 0, range: 4.2, aoeRadius: 2.0, pierce: 4, speed: 23 },
    { damage: 40, cooldown: 0.35, projectileCount: 2, bounces: 0, chains: 0, range: 4.5, aoeRadius: 2.2, pierce: 5, speed: 24 },
    { damage: 48, cooldown: 0.3, projectileCount: 3, bounces: 0, chains: 0, range: 5.0, aoeRadius: 2.5, pierce: 6, speed: 26 },
  ],
  aura: [
    { damage: 3, cooldown: 0.8, projectileCount: 0, bounces: 0, chains: 0, range: 3.0, aoeRadius: 3.0, pierce: 0, speed: 0 },
    { damage: 4, cooldown: 0.8, projectileCount: 0, bounces: 0, chains: 0, range: 3.5, aoeRadius: 3.5, pierce: 0, speed: 0 },
    { damage: 5, cooldown: 0.7, projectileCount: 0, bounces: 0, chains: 0, range: 4.0, aoeRadius: 4.0, pierce: 0, speed: 0 },
    { damage: 6, cooldown: 0.7, projectileCount: 0, bounces: 0, chains: 0, range: 4.5, aoeRadius: 4.5, pierce: 0, speed: 0 },
    { damage: 7, cooldown: 0.6, projectileCount: 0, bounces: 0, chains: 0, range: 5.0, aoeRadius: 5.0, pierce: 0, speed: 0 },
    { damage: 9, cooldown: 0.6, projectileCount: 0, bounces: 0, chains: 0, range: 5.5, aoeRadius: 5.5, pierce: 0, speed: 0 },
    { damage: 11, cooldown: 0.5, projectileCount: 0, bounces: 0, chains: 0, range: 6.0, aoeRadius: 6.0, pierce: 0, speed: 0 },
    { damage: 14, cooldown: 0.5, projectileCount: 0, bounces: 0, chains: 0, range: 7.0, aoeRadius: 7.0, pierce: 0, speed: 0 },
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
  'sword', 'bone_bouncer', 'axe', 'revolver', 'bow',
  'lightning_staff', 'fire_staff', 'flame_ring', 'tornado',
  'shotgun', 'black_hole', 'katana', 'aura',
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
  { baseWeapon: 'revolver', requiredTome: 'precision_tome', requiredTomeLevel: 3, evolvedName: 'Deagle', damageMultiplier: 3.0, specialEffect: 'pierce_all' },
  { baseWeapon: 'lightning_staff', requiredTome: 'curse_tome', requiredTomeLevel: 3, evolvedName: 'Thunder God', damageMultiplier: 2.5, specialEffect: 'chain_all' },
  { baseWeapon: 'fire_staff', requiredTome: 'thorns_tome', requiredTomeLevel: 3, evolvedName: 'Inferno', damageMultiplier: 2.0, specialEffect: 'fire_trail' },
  { baseWeapon: 'tornado', requiredTome: 'speed_tome', requiredTomeLevel: 5, evolvedName: 'Hurricane', damageMultiplier: 2.5, specialEffect: 'multiple_tornados' },
  { baseWeapon: 'black_hole', requiredTome: 'attraction_tome', requiredTomeLevel: 5, evolvedName: 'Singularity', damageMultiplier: 3.0, specialEffect: 'screen_pull' },
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
  teleporterCount: number;
  bossHpMultiplier: number;
}

export const TIER_CONFIGS: Record<DifficultyTier, TierConfig> = {
  1: { tier: 1, name: 'Normal', enemyHpMultiplier: 1.0, enemyDamageMultiplier: 1.0, enemySpeedMultiplier: 1.0, xpMultiplier: 1.0, silverMultiplier: 1.0, teleporterCount: 0, bossHpMultiplier: 1.0 },
  2: { tier: 2, name: 'Hard', enemyHpMultiplier: 1.5, enemyDamageMultiplier: 1.3, enemySpeedMultiplier: 1.1, xpMultiplier: 1.5, silverMultiplier: 2.0, teleporterCount: 1, bossHpMultiplier: 1.5 },
  3: { tier: 3, name: 'Nightmare', enemyHpMultiplier: 2.5, enemyDamageMultiplier: 1.8, enemySpeedMultiplier: 1.2, xpMultiplier: 2.0, silverMultiplier: 3.0, teleporterCount: 2, bossHpMultiplier: 2.5 },
};
