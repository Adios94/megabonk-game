import type { GameConfig, CharacterType, CharacterConfig, TomeType, WeaponType, DifficultyTier } from './types.ts';

export const MAP_SIZE = 120;
export const TICK_INTERVAL_MS = 1000 / 60;
export const MAX_ENEMIES = 100;
export const MAX_PROJECTILES = 200;
export const MAX_PICKUPS = 300;
/** 区域特效（毒气云/涟漪/灼地/激光线）数量上限，防高攻速 + 多 AoE 配装下无界增长。 */
export const MAX_AREA_EFFECTS = 150;

export const PLAYER_BASE_HP = 100;
export const PLAYER_BASE_SPEED = 4.0;
/** 默认移动速度倍率：旧 Shift/slide 加速手感现在并入基础速度。 */
export const PLAYER_MOVE_SPEED_MULTIPLIER = 1.6;
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
/** 自动迈步高度：相邻地面高度差 ≤ 此值时走路无缝上去；超过则被当作墙挡住。 */
export const STEP_HEIGHT = 0.5;
/** 地面 AoE（烈焰环 / 涟漪 / 灼地痕）垂直命中容差：目标与效果面高度差超过此值不结算。 */
export const AOE_MAX_Y_DELTA = 1.2;
/** 跌落到此 y 以下（掉出关卡虚空）时，把玩家传送回出生点。 */
export const FALL_RESPAWN_Y = -20;
/** 攀爬上升 / 下降速度（单位/秒）。 */
export const CLIMB_SPEED = 4.0;
/** 攀爬抓取水平margin：玩家中心进入 climb_ 体积外扩此距离即可抓墙。 */
export const CLIMB_GRAB_MARGIN = 0.6;
export const SLIDE_DURATION = 0.5;
/** @deprecated slide 不再额外提速；使用 PLAYER_MOVE_SPEED_MULTIPLIER 表示基础速度倍率。 */
export const SLIDE_SPEED_MULTIPLIER = PLAYER_MOVE_SPEED_MULTIPLIER;
export const SLIDE_COOLDOWN = 0.3;
export const BUNNY_HOP_WINDOW = 0.15; // seconds after landing to chain jump
export const BUNNY_HOP_BONUS = 1.2; // extra jump height multiplier for bunny hops

export const MAX_LEVEL = 100;
/** 局内等级解锁的武器槽上限（无局外任务奖励时）。 */
export const ACTIVE_WEAPON_SLOTS_INRUN_MAX = 5;
export const MAX_WEAPONS_CAP = 6; // 局外任务 +1 后的绝对上限
/** @deprecated 旧角色配置字段；槽位改由 ACTIVE_WEAPON_SLOTS_INRUN_MAX + extraWeaponSlots 决定。 */
export const MAX_WEAPONS_DEFAULT = ACTIVE_WEAPON_SLOTS_INRUN_MAX;
export const WEAPON_MAX_LEVEL = 10; // 单把武器等级上限（= 单局最多出现次数）
export const XP_BASE = 10;
export const XP_GROWTH = 0.35;

export const BOSS_SPAWN_TIME = 540;
export const BOSS_HP = 60000;
export const BOSS_INTRO_DURATION = 2.0;
/**
 * 常规生存期（秒）。超过这个时间且玩家未进传送门 → 进入 overtime。
 * 与 BOSS_SPAWN_TIME 数值相同，但语义不同：BOSS_SPAWN_TIME 是历史遗留的硬编码触发时间，
 * 现在已不再用作 Boss 触发条件，仅供测试 / 兼容引用。
 */
export const REGULAR_GAME_DURATION = 540;
/** 最终狂潮开始时间：Boss/超时前的最后 60 秒。 */
export const FINAL_SWARM_START_TIME = 480;
/** 最终狂潮结束前，wave 敌人额外获得的 HP 成长上限。 */
export const FINAL_SWARM_HP_GROWTH = 0.5;
/** 最终狂潮结束前，wave 敌人额外获得的伤害成长上限。 */
export const FINAL_SWARM_DAMAGE_GROWTH = 0.25;
/** 最终狂潮期间敌人移动速度倍率（原 +20%，提高 50% 后为 +30%）。 */
export const FINAL_SWARM_SPEED_MULTIPLIER = 1.3;
/** 进入 overtime 后，继承并延续的最终狂潮成长比例。 */
export const FINAL_SWARM_OVERTIME_GROWTH_RATIO = 0.5;

export const PICKUP_LIFETIME = 30;
export const PICKUP_ATTRACT_SPEED = 12;

// Health drop chances (on enemy death)
export const HEALTH_DROP_CHANCE = 0.03;       // 3% chance for full heart (50 HP)
export const HEALTH_SMALL_DROP_CHANCE = 0.08; // 8% chance for half heart (25 HP)

// Chest settings
export const CHEST_COUNT = 10;                // Initial chests per game
export const CHEST_MAX_ACTIVE = 10;           // Maximum unopened chests in the field
export const CHEST_RESPAWN_MIN_SECONDS = 30;
export const CHEST_RESPAWN_MAX_SECONDS = 60;
export const CHEST_INTERACT_RADIUS = 2.5;
/** 宝箱交互的垂直高度容差：玩家与宝箱的 y 差超过此值不可开启（防止在高处平台开下方宝箱）。 */
export const CHEST_INTERACT_MAX_Y_DELTA = 2.5;
export const CHEST_SILVER_MIN = 50;
export const CHEST_SILVER_MAX = 200;
export const CHEST_PLAYER_MIN_DISTANCE = 12;     // Min distance from player when spawning fallback chests
export const CHEST_PLAYER_MAX_DISTANCE = 35;     // Max distance from player when spawning fallback chests
export const CHEST_SURFACE_GRID_SIZE = 20;       // Sampling grid when scattering chests across level surfaces
export const CHEST_LEVEL_MAX = 24;               // Cap on chests generated from level data
export const CHEST_MIN_SEPARATION = 6;           // Min distance between two unopened chests

// Altar (formerly Teleporter) settings
/** 召唤 Boss 的读条秒数。 */
export const ALTAR_SUMMON_DURATION = 2.0;
/**
 * 玩家离开召唤半径后，读条进度的回落速率（相对充能速率的倍数）。
 * 0.5 表示回落速度为充能的一半，进度缓慢减少直到归零才取消召唤。
 */
export const ALTAR_SUMMON_DECAY_RATE = 0.5;
/** 第二关及以后 Boss 击败后，祭坛再次可召唤前的冷却秒数。 */
export const ALTAR_BOSS_RESPAWN_COOLDOWN = 60;
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
export const SHRINE_COUNT = 5;
/** 玩家进入充能圈的半径。 */
export const SHRINE_RADIUS = 2.5;
/** 充满 / 解锁需要的站立秒数。 */
export const SHRINE_CHARGE_DURATION = 4.0;
/**
 * 玩家离开充能圈后，充能进度的回落速率（相对充能速率的倍数）。
 * 0.5 表示回落速度为充能的一半，进度缓慢减少直到归零，而非立刻消失。
 */
export const SHRINE_CHARGE_DECAY_RATE = 0.5;
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
  { timeStart: 300, timeEnd: 420, spawnInterval: 1.0, maxAlive: 85, enemies: ['zombie', 'skeleton_archer', 'skeleton_soldier', 'gargoyle'], groupSize: [3, 6], eliteChance: 0.15 },
  { timeStart: 420, timeEnd: 540, spawnInterval: 0.8, maxAlive: 100, enemies: ['zombie', 'skeleton_archer', 'skeleton_soldier', 'gargoyle'], groupSize: [4, 8], eliteChance: 0.2 },
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
  // damage 已含近战 +30% 补偿（贴脸风险 + 定向覆盖短板）。
  sword: [
    { damage: 16, cooldown: 0.8, projectileCount: 1, bounces: 0, chains: 0, range: 3.0, aoeRadius: 3.0, pierce: 999, speed: 10 },
    { damage: 20, cooldown: 0.8, projectileCount: 1, bounces: 0, chains: 0, range: 3.7, aoeRadius: 3.4, pierce: 999, speed: 11 },
    { damage: 23, cooldown: 0.7, projectileCount: 1, bounces: 0, chains: 0, range: 4.4, aoeRadius: 3.8, pierce: 999, speed: 12 },
    { damage: 29, cooldown: 0.7, projectileCount: 1, bounces: 0, chains: 0, range: 5.1, aoeRadius: 4.2, pierce: 999, speed: 14 },
    { damage: 34, cooldown: 0.6, projectileCount: 1, bounces: 0, chains: 0, range: 5.8, aoeRadius: 4.6, pierce: 999, speed: 15 },
    { damage: 39, cooldown: 0.6, projectileCount: 2, bounces: 0, chains: 0, range: 6.5, aoeRadius: 5.0, pierce: 999, speed: 17 },
    { damage: 46, cooldown: 0.5, projectileCount: 2, bounces: 0, chains: 0, range: 7.2, aoeRadius: 5.5, pierce: 999, speed: 18 },
    { damage: 55, cooldown: 0.5, projectileCount: 3, bounces: 0, chains: 0, range: 8.0, aoeRadius: 6.0, pierce: 999, speed: 20 },
  ],
  bone_bouncer: [
    { damage: 10, cooldown: 1.2, projectileCount: 1, bounces: 2, chains: 0, range: 0, aoeRadius: 0, pierce: 0, speed: 12 },
    { damage: 13, cooldown: 1.1, projectileCount: 1, bounces: 2, chains: 0, range: 0, aoeRadius: 0, pierce: 0, speed: 13 },
    { damage: 16, cooldown: 1.0, projectileCount: 1, bounces: 3, chains: 0, range: 0, aoeRadius: 0, pierce: 0, speed: 14 },
    { damage: 19, cooldown: 0.9, projectileCount: 1, bounces: 3, chains: 0, range: 0, aoeRadius: 0, pierce: 0, speed: 15 },
    { damage: 22, cooldown: 0.8, projectileCount: 2, bounces: 4, chains: 0, range: 0, aoeRadius: 0, pierce: 0, speed: 16 },
    { damage: 25, cooldown: 0.7, projectileCount: 2, bounces: 4, chains: 0, range: 0, aoeRadius: 0, pierce: 0, speed: 17 },
    { damage: 28, cooldown: 0.65, projectileCount: 2, bounces: 5, chains: 0, range: 0, aoeRadius: 0, pierce: 0, speed: 17 },
    { damage: 30, cooldown: 0.6, projectileCount: 3, bounces: 6, chains: 0, range: 0, aoeRadius: 0, pierce: 0, speed: 18 },
  ],
  // 斧（常驻刀环，方案 A）：projectileCount 把刀刃永久等距绕玩家旋转，不再每次 spawn 新弹丸。
  //   cooldown   = 「重击间隔」(rehitInterval)：同一刀刃多久能重新打到同一敌人（不再是 spawn 节奏）。
  //   range      = 环绕半径；speed = 旋转角速度(rad/s)；aoeRadius = 刀刃命中半径；pierce 对常驻刀环已无实义。
  axe: [
    { damage: 10, cooldown: 1.5, projectileCount: 1, bounces: 0, chains: 0, range: 3.0, aoeRadius: 1.0, pierce: 999, speed: 4 },
    { damage: 12, cooldown: 1.5, projectileCount: 1, bounces: 0, chains: 0, range: 3.0, aoeRadius: 1.0, pierce: 999, speed: 4 },
    { damage: 14, cooldown: 1.4, projectileCount: 2, bounces: 0, chains: 0, range: 3.5, aoeRadius: 1.0, pierce: 999, speed: 4.5 },
    { damage: 16, cooldown: 1.3, projectileCount: 2, bounces: 0, chains: 0, range: 3.5, aoeRadius: 1.0, pierce: 999, speed: 4.5 },
    { damage: 18, cooldown: 1.2, projectileCount: 3, bounces: 0, chains: 0, range: 4.0, aoeRadius: 1.0, pierce: 999, speed: 5 },
    { damage: 20, cooldown: 1.1, projectileCount: 3, bounces: 0, chains: 0, range: 4.0, aoeRadius: 1.0, pierce: 999, speed: 5 },
    { damage: 22, cooldown: 1.0, projectileCount: 3, bounces: 0, chains: 0, range: 4.5, aoeRadius: 1.0, pierce: 999, speed: 5.5 },
    { damage: 24, cooldown: 0.9, projectileCount: 3, bounces: 0, chains: 0, range: 5.0, aoeRadius: 1.0, pierce: 999, speed: 6 },
  ],
  pistol: [
    { damage: 18, cooldown: 1.2, projectileCount: 1, bounces: 0, chains: 0, range: 20, aoeRadius: 0, pierce: 0, speed: 25 },
    { damage: 22, cooldown: 1.15, projectileCount: 1, bounces: 0, chains: 0, range: 23, aoeRadius: 0, pierce: 0, speed: 26 },
    { damage: 26, cooldown: 1.1, projectileCount: 1, bounces: 0, chains: 0, range: 26, aoeRadius: 0, pierce: 1, speed: 27 },
    { damage: 30, cooldown: 1.0, projectileCount: 2, bounces: 0, chains: 0, range: 29, aoeRadius: 0, pierce: 1, speed: 28 },
    { damage: 35, cooldown: 0.95, projectileCount: 2, bounces: 0, chains: 0, range: 32, aoeRadius: 0, pierce: 2, speed: 29 },
    { damage: 40, cooldown: 0.9, projectileCount: 2, bounces: 0, chains: 0, range: 35, aoeRadius: 0, pierce: 2, speed: 30 },
    { damage: 48, cooldown: 0.85, projectileCount: 3, bounces: 0, chains: 0, range: 38, aoeRadius: 0, pierce: 3, speed: 32 },
    { damage: 58, cooldown: 0.8, projectileCount: 3, bounces: 0, chains: 0, range: 40, aoeRadius: 0, pierce: 4, speed: 35 },
  ],
  lightning_staff: [
    { damage: 15, cooldown: 1.8, projectileCount: 1, bounces: 0, chains: 3, range: 8, aoeRadius: 0, pierce: 0, speed: 0 },
    { damage: 18, cooldown: 1.6, projectileCount: 1, bounces: 0, chains: 3, range: 8, aoeRadius: 0, pierce: 0, speed: 0 },
    { damage: 18, cooldown: 1.4, projectileCount: 1, bounces: 0, chains: 4, range: 10, aoeRadius: 0, pierce: 0, speed: 0 },
    { damage: 22, cooldown: 1.2, projectileCount: 1, bounces: 0, chains: 4, range: 10, aoeRadius: 0, pierce: 0, speed: 0 },
    { damage: 22, cooldown: 1.0, projectileCount: 1, bounces: 0, chains: 5, range: 12, aoeRadius: 0, pierce: 0, speed: 0 },
    { damage: 28, cooldown: 0.8, projectileCount: 1, bounces: 0, chains: 5, range: 12, aoeRadius: 0, pierce: 0, speed: 0 },
    { damage: 28, cooldown: 0.7, projectileCount: 1, bounces: 0, chains: 6, range: 14, aoeRadius: 0, pierce: 0, speed: 0 },
    { damage: 35, cooldown: 0.6, projectileCount: 1, bounces: 0, chains: 8, range: 40, aoeRadius: 0, pierce: 0, speed: 0 },
  ],
  flame_ring: [
    { damage: 4, cooldown: 0.5, projectileCount: 0, bounces: 0, chains: 0, range: 3.5, aoeRadius: 3.5, pierce: 0, speed: 0 },
    { damage: 5, cooldown: 0.5, projectileCount: 0, bounces: 0, chains: 0, range: 3.5, aoeRadius: 3.5, pierce: 0, speed: 0 },
    { damage: 5, cooldown: 0.5, projectileCount: 0, bounces: 0, chains: 0, range: 4.5, aoeRadius: 4.5, pierce: 0, speed: 0 },
    { damage: 7, cooldown: 0.4, projectileCount: 0, bounces: 0, chains: 0, range: 4.5, aoeRadius: 4.5, pierce: 0, speed: 0 },
    { damage: 7, cooldown: 0.4, projectileCount: 0, bounces: 0, chains: 0, range: 5.5, aoeRadius: 5.5, pierce: 0, speed: 0 },
    { damage: 9, cooldown: 0.4, projectileCount: 0, bounces: 0, chains: 0, range: 5.5, aoeRadius: 5.5, pierce: 0, speed: 0 },
    { damage: 9, cooldown: 0.3, projectileCount: 0, bounces: 0, chains: 0, range: 6.5, aoeRadius: 6.5, pierce: 0, speed: 0 },
    { damage: 16, cooldown: 0.3, projectileCount: 0, bounces: 0, chains: 0, range: 8.0, aoeRadius: 8.0, pierce: 0, speed: 0 },
  ],
  shotgun: [
    { damage: 16, cooldown: 1.4, projectileCount: 5, bounces: 0, chains: 0, range: 12, aoeRadius: 0, pierce: 0, speed: 18 },
    { damage: 18, cooldown: 1.3, projectileCount: 5, bounces: 0, chains: 0, range: 13, aoeRadius: 0, pierce: 0, speed: 21 },
    { damage: 20, cooldown: 1.2, projectileCount: 6, bounces: 0, chains: 0, range: 14, aoeRadius: 0, pierce: 0, speed: 24 },
    { damage: 23, cooldown: 1.1, projectileCount: 6, bounces: 0, chains: 0, range: 15, aoeRadius: 0, pierce: 0, speed: 27 },
    { damage: 26, cooldown: 1.0, projectileCount: 7, bounces: 0, chains: 0, range: 16, aoeRadius: 0, pierce: 1, speed: 30 },
    { damage: 29, cooldown: 0.9, projectileCount: 7, bounces: 0, chains: 0, range: 17, aoeRadius: 0, pierce: 1, speed: 33 },
    { damage: 32, cooldown: 0.75, projectileCount: 8, bounces: 0, chains: 0, range: 18, aoeRadius: 0, pierce: 1, speed: 36 },
    { damage: 36, cooldown: 0.6, projectileCount: 9, bounces: 0, chains: 0, range: 20, aoeRadius: 0, pierce: 2, speed: 38 },
  ],
  // 射线枪：瞬发激光，沿直线无限穿透（pierce 999）。range = 索敌距离；aoeRadius = 光束半宽。
  ray_gun: [
    { damage: 6, cooldown: 1.50, projectileCount: 1, bounces: 0, chains: 0, range: 8, aoeRadius: 0.50, pierce: 999, speed: 0 },
    { damage: 9, cooldown: 1.40, projectileCount: 1, bounces: 0, chains: 0, range: 10, aoeRadius: 0.52, pierce: 999, speed: 0 },
    { damage: 12, cooldown: 1.30, projectileCount: 1, bounces: 0, chains: 0, range: 12, aoeRadius: 0.54, pierce: 999, speed: 0 },
    { damage: 15, cooldown: 1.20, projectileCount: 1, bounces: 0, chains: 0, range: 14, aoeRadius: 0.55, pierce: 999, speed: 0 },
    { damage: 18, cooldown: 1.10, projectileCount: 1, bounces: 0, chains: 0, range: 15, aoeRadius: 0.56, pierce: 999, speed: 0 },
    { damage: 21, cooldown: 1.00, projectileCount: 1, bounces: 0, chains: 0, range: 16, aoeRadius: 0.58, pierce: 999, speed: 0 },
    { damage: 24, cooldown: 0.95, projectileCount: 1, bounces: 0, chains: 0, range: 17, aoeRadius: 0.59, pierce: 999, speed: 0 },
    { damage: 26, cooldown: 0.90, projectileCount: 1, bounces: 0, chains: 0, range: 18, aoeRadius: 0.60, pierce: 999, speed: 0 },
  ],
  // 毒气弹：抛投生成毒气云。damage = 中毒每秒伤害（DoT），后期成长陡峭；aoeRadius = 云半径；range = 投掷距离。
  poison_bomb: [
    { damage: 6, cooldown: 2.00, projectileCount: 1, bounces: 0, chains: 0, range: 10, aoeRadius: 3.0, pierce: 0, speed: 0 },
    { damage: 8, cooldown: 1.90, projectileCount: 1, bounces: 0, chains: 0, range: 12, aoeRadius: 3.0, pierce: 0, speed: 0 },
    { damage: 11, cooldown: 1.80, projectileCount: 1, bounces: 0, chains: 0, range: 14, aoeRadius: 3.3, pierce: 0, speed: 0 },
    { damage: 14, cooldown: 1.70, projectileCount: 2, bounces: 0, chains: 0, range: 16, aoeRadius: 3.6, pierce: 0, speed: 0 },
    { damage: 18, cooldown: 1.60, projectileCount: 2, bounces: 0, chains: 0, range: 18, aoeRadius: 3.9, pierce: 0, speed: 0 },
    { damage: 22, cooldown: 1.50, projectileCount: 2, bounces: 0, chains: 0, range: 20, aoeRadius: 4.2, pierce: 0, speed: 0 },
    { damage: 27, cooldown: 1.45, projectileCount: 3, bounces: 0, chains: 0, range: 22, aoeRadius: 4.5, pierce: 0, speed: 0 },
    { damage: 34, cooldown: 1.40, projectileCount: 3, bounces: 0, chains: 0, range: 24, aoeRadius: 4.8, pierce: 0, speed: 0 },
  ],
  // 麻痹枪：自动索敌投射物，命中施加强力减速。damage 直伤；pierce 随等级提升；speed 弹速。
  paralysis_gun: [
    { damage: 14, cooldown: 1.10, projectileCount: 1, bounces: 0, chains: 0, range: 24, aoeRadius: 0, pierce: 0, speed: 26 },
    { damage: 17, cooldown: 1.05, projectileCount: 1, bounces: 0, chains: 0, range: 26, aoeRadius: 0, pierce: 0, speed: 27 },
    { damage: 20, cooldown: 1.00, projectileCount: 2, bounces: 0, chains: 0, range: 28, aoeRadius: 0, pierce: 1, speed: 28 },
    { damage: 23, cooldown: 0.95, projectileCount: 2, bounces: 0, chains: 0, range: 30, aoeRadius: 0, pierce: 1, speed: 29 },
    { damage: 27, cooldown: 0.90, projectileCount: 3, bounces: 0, chains: 0, range: 31, aoeRadius: 0, pierce: 2, speed: 30 },
    { damage: 31, cooldown: 0.85, projectileCount: 3, bounces: 0, chains: 0, range: 32, aoeRadius: 0, pierce: 2, speed: 31 },
    { damage: 35, cooldown: 0.78, projectileCount: 4, bounces: 0, chains: 0, range: 33, aoeRadius: 0, pierce: 3, speed: 33 },
    { damage: 38, cooldown: 0.70, projectileCount: 4, bounces: 0, chains: 0, range: 34, aoeRadius: 0, pierce: 3, speed: 35 },
  ],
  // 虚空涟漪：以玩家为圆心向外扩散的环形波。damage 直伤；aoeRadius = 最大半径；speed = 扩散速度。
  void_ripple: [
    { damage: 12, cooldown: 2.20, projectileCount: 1, bounces: 0, chains: 0, range: 0, aoeRadius: 4.0, pierce: 0, speed: 8.0 },
    { damage: 15, cooldown: 2.10, projectileCount: 1, bounces: 0, chains: 0, range: 0, aoeRadius: 4.4, pierce: 0, speed: 8.5 },
    { damage: 18, cooldown: 2.00, projectileCount: 1, bounces: 0, chains: 0, range: 0, aoeRadius: 4.8, pierce: 0, speed: 9.0 },
    { damage: 21, cooldown: 1.90, projectileCount: 1, bounces: 0, chains: 0, range: 0, aoeRadius: 5.2, pierce: 0, speed: 9.5 },
    { damage: 24, cooldown: 1.80, projectileCount: 1, bounces: 0, chains: 0, range: 0, aoeRadius: 5.6, pierce: 0, speed: 10.0 },
    { damage: 28, cooldown: 1.70, projectileCount: 1, bounces: 0, chains: 0, range: 0, aoeRadius: 6.1, pierce: 0, speed: 10.5 },
    { damage: 32, cooldown: 1.60, projectileCount: 1, bounces: 0, chains: 0, range: 0, aoeRadius: 6.5, pierce: 0, speed: 11.0 },
    { damage: 36, cooldown: 1.50, projectileCount: 1, bounces: 0, chains: 0, range: 0, aoeRadius: 7.0, pierce: 0, speed: 12.0 },
  ],
  // 灼地靴：高频在脚下留下灼地痕迹（短 cooldown）。damage = 每次灼伤；aoeRadius = 痕迹半径。
  scorch_boots: [
    { damage: 5, cooldown: 0.30, projectileCount: 1, bounces: 0, chains: 0, range: 0, aoeRadius: 0.9, pierce: 0, speed: 0 },
    { damage: 6, cooldown: 0.30, projectileCount: 1, bounces: 0, chains: 0, range: 0, aoeRadius: 1.0, pierce: 0, speed: 0 },
    { damage: 7, cooldown: 0.28, projectileCount: 1, bounces: 0, chains: 0, range: 0, aoeRadius: 1.1, pierce: 0, speed: 0 },
    { damage: 9, cooldown: 0.28, projectileCount: 1, bounces: 0, chains: 0, range: 0, aoeRadius: 1.2, pierce: 0, speed: 0 },
    { damage: 11, cooldown: 0.26, projectileCount: 1, bounces: 0, chains: 0, range: 0, aoeRadius: 1.3, pierce: 0, speed: 0 },
    { damage: 13, cooldown: 0.26, projectileCount: 1, bounces: 0, chains: 0, range: 0, aoeRadius: 1.4, pierce: 0, speed: 0 },
    { damage: 16, cooldown: 0.24, projectileCount: 1, bounces: 0, chains: 0, range: 0, aoeRadius: 1.5, pierce: 0, speed: 0 },
    { damage: 20, cooldown: 0.22, projectileCount: 1, bounces: 0, chains: 0, range: 0, aoeRadius: 2.0, pierce: 0, speed: 0 },
  ],
};

// === 状态效果 / 区域特效常量（新武器） ===
/** 毒气云存活秒数。 */
export const GAS_CLOUD_LIFETIME = 4.0;
/** 毒气云刷新中毒状态的间隔（秒）。 */
export const GAS_CLOUD_TICK_INTERVAL = 0.5;
/** 毒气云每次刷新写入的中毒持续秒数（略大于 tick 间隔，保证云内持续中毒）。 */
export const GAS_POISON_REFRESH_DURATION = 1.0;
/** 麻痹枪命中施加的减速速度倍率（0.2 = 仅剩 20% 速度）。 */
export const PARALYSIS_SLOW_FACTOR = 0.2;
/** 麻痹枪减速持续秒数。 */
export const PARALYSIS_SLOW_DURATION = 1.5;
/** 灼地痕迹存活秒数。 */
export const SCORCH_TRAIL_LIFETIME = 2.5;
/** 灼地痕迹灼伤间隔（秒）。 */
export const SCORCH_TRAIL_TICK_INTERVAL = 0.4;
/** ray_beam 视觉存活秒数（伤害已瞬发结算，仅渲染用）。 */
export const RAY_BEAM_VISUAL_LIFETIME = 0.12;
/** 射线枪光束最大长度（穿透打到底）。 */
export const RAY_GUN_BEAM_LENGTH = 60;
/**
 * ray_beam 命中半宽相对 aoeRadius 的系数，使伤害范围与客户端渲染的细激光对齐。
 * 注意：必须与 client 渲染宽度一致——client 用 `width * 0.625` 作直径，故视觉半宽 = `width * 0.3125`。
 * aoeRadius 仍作为 spawnAreaEffect 的 width/radius（渲染尺寸），判定时再乘本系数收窄。
 */
export const RAY_BEAM_HIT_WIDTH_SCALE = 0.3125;
/**
 * 精英 / 小头目 / Boss 的减速抗性系数（elite_slow_coef）。
 * 有效减速 = 1 - (1 - factor) × coef；coef 越小，精英越难被减速。
 */
export const ELITE_SLOW_COEF = 0.5;

// Tome max levels
export const TOME_MAX_LEVELS: Record<TomeType, number> = {
  attack_speed_tome: 8,
  life_tome: 8,
  consumable_tome: 8,
  luck_tome: 8,
  thorns_tome: 8,
  shield_tome: 8,
  xp_gain_tome: 8,
  attraction_tome: 8,
  curse_tome: 8,
  precision_tome: 8,
  knockback_tome: 8,
  speed_tome: 8,
};

// Legacy alias
export const PASSIVE_MAX_LEVELS: Record<string, number> = TOME_MAX_LEVELS;

// All weapon types available in the game
export const ALL_WEAPON_TYPES: WeaponType[] = [
  'sword', 'bone_bouncer', 'axe', 'pistol',
  'lightning_staff', 'flame_ring',
  'shotgun',
  'ray_gun', 'poison_bomb', 'paralysis_gun', 'void_ripple', 'scorch_boots',
];

// All tome types available in the game
export const ALL_TOME_TYPES: TomeType[] = [
  'attack_speed_tome', 'life_tome', 'consumable_tome', 'luck_tome', 'thorns_tome', 'shield_tome',
  'xp_gain_tome', 'attraction_tome', 'curse_tome', 'precision_tome',
  'knockback_tome', 'speed_tome',
];

// 旧的武器进化系统（WEAPON_EVOLUTIONS / WeaponEvolution）已被「羁绊系统」取代。
// 见 data/bonds.ts + systems/bonds.ts。

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
export const OVERTIME_STEP_SECONDS = 10;
/** Overtime 每档给敌人 HP 的增量（连续线性）。 */
export const OVERTIME_HP_PER_STEP = 0.2;
/** Overtime 每档给敌人伤害的增量（连续线性）。 */
export const OVERTIME_DAMAGE_PER_STEP = 0.1;
/** Overtime 每档给敌人速度的增量（连续线性）。 */
export const OVERTIME_SPEED_PER_STEP = 0.05;
