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
  /**
   * 通用交互按键（PC: KeyE / Mobile: 屏幕按钮）。
   * 用于召唤 Boss 祭坛、进入传送门等场景交互。
   */
  interact: boolean;
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
  | 'shotgun'
  // --- New weapons (data-driven, ECS behavior path) ---
  | 'ray_gun'        // 射线枪：瞬发激光，沿直线无限穿透
  | 'poison_bomb'    // 毒气弹：抛投后生成毒气云，持续秒伤 + 中毒
  | 'paralysis_gun'  // 麻痹枪：命中施加强力减速（麻痹）
  | 'void_ripple'    // 虚空涟漪：以玩家为圆心向外扩散的环形波
  | 'scorch_boots';  // 灼地靴：行走留下灼地痕迹，间歇灼伤路过敌人

/**
 * 武器运行时成长累加值（新升级规则）。
 * 有效数值 = 基础(L1) + growth；每次升级把「本级→下一级」表步进 × 稀有度倍率累加进来。
 * 字段与 config.WeaponLevelStats 对应（此处独立声明以避免 types ←→ config 循环依赖）。
 */
export interface WeaponGrowth {
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

export interface WeaponState {
  type: WeaponType;
  level: number;
  cooldownTimer: number;
  evolved: boolean;
  /** 新升级规则的成长累加值；旧 fixture / 旧存档可不带（getWeaponStats 退回等级查表）。 */
  growth?: WeaponGrowth;
}

// --- Tomes (passive items) ---
export type TomeType =
  | 'attack_speed_tome'
  | 'life_tome'
  | 'consumable_tome'
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
  /** 升级次数：只用于 maxLevel / 进化需求等次数判定。 */
  level: number;
  /**
   * 实际成长值：每次升级把选项稀有度倍率累加进来。
   * 旧存档 / fixture 没有该字段时按 level 视作 common 累加。
   */
  growth?: number;
}

// Legacy alias
export type PassiveState = TomeState;

// --- Relics ---
export type RelicRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export type RelicId =
  | 'keen_lens'
  | 'small_shield_charm'
  | 'blood_fang'
  | 'pact_coin'
  | 'arsenal_badge'
  | 'elite_writ'
  | 'regen_core'
  | 'magazine_expander'
  | 'hourglass'
  | 'iron_heart';

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
  /** 消耗品掉落倍率（base 1.0，consumable_tome 等来源会提高）。 */
  consumableDropMult?: number;
  /** 当前生效的消耗品（timed / one_shot 待触发）；新拾取覆盖旧。 */
  activeConsumable?: ActiveConsumableState | null;
  /** F04 硬面包：下一次受伤归零。 */
  nextHitNullify?: boolean;
  /** F09 预言之书：下一次升级选项保底稀有度。 */
  nextLevelUpReroll?: boolean;
  /** F10 匠神锤：下一次武器升级额外 +N 级。 */
  nextWeaponUpgradeBonus?: number;
  /** F06 磁铁：仅扩大 XP 宝石拾取半径（默认 1）。 */
  xpPickupRadiusMult?: number;
  /** timed 消耗品派生：移速倍率（默认 1）。 */
  consumableSpeedMult?: number;
  /** timed 消耗品派生：攻速倍率（默认 1）。 */
  consumableAttackSpeedMult?: number;
  /** timed 消耗品派生：额外护甲（默认 0）。 */
  consumableArmorBonus?: number;
  /** timed 消耗品派生：伤害倍率（默认 1）。 */
  consumableDamageMult?: number;
  /** timed 消耗品派生：受伤倍率（默认 1，狂怒药 +10%）。 */
  consumableDamageTakenMult?: number;
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
  /** 本局已解锁武器槽（局内等级解锁，不超过 maxWeaponSlots）。 */
  activeWeaponSlots: number;
  /** 局内金币（宝箱 / 空池补偿等）。 */
  gold: number;
  /** 已获得遗物层数。同 ID 可无限叠加。 */
  relicStacks: Partial<Record<RelicId, number>>;
  comboCount: number;
  comboTimer: number;
  // --- Shrine bonuses (累积来自 Charge Shrine 的奖励) ---
  // 全部 optional：Phase 8 引入的字段，旧 fixture / 旧序列化数据不带这些字段也能跑。
  // 系统侧消费时统一用 `?? 0` / `?? 1`。createInitialPlayer 会写入合理默认值。
  /** 当前护盾值，受到伤害时优先消耗。 */
  shield?: number;
  /** 护盾上限。每个 +5 Shield shrine reward 累加。 */
  maxShield?: number;
  /** 护盾恢复累计计时（与 hp regen 分离，护盾恢复更快）。 */
  shieldRegenAccum?: number;
  /** HP 每秒恢复速率（来自 +HP Regen shrine reward）。 */
  hpRegenRate?: number;
  /** HP regen 累积器（< 1 时存余数）。 */
  hpRegenAccum?: number;
  /** 弹药数量额外加成（对每把武器的 projectileCount 加这么多）。 */
  projectileBonus?: number;
  /** 击退倍率（默认 1.0，shrine 会乘上去）。 */
  knockbackMult?: number;
  /** 对精英 / 小头目 / boss 的额外伤害倍率（默认 1.0）。 */
  eliteDamageMult?: number;
  /** 吸血百分比（0..1，造成伤害时按比例回血）。 */
  lifestealPct?: number;
  /** 跳跃高度倍率（默认 1.0）。 */
  jumpHeightMult?: number;
  /** 持续型武器持续时间倍率（默认 1.0），目前数据保留，未来 wire。 */
  durationMult?: number;
  /** Powerup 倍率（默认 1.0），目前数据保留。 */
  powerupMult?: number;
  /** 难度倍率（默认 1.0），目前数据保留。 */
  difficultyMult?: number;
  /** 额外幸运值（百分比，加到 luck tome 等级上参与 rolls）。 */
  luckBonus?: number;
  /** 是否正在攀爬 climb_ 体积（攀爬时关闭重力、锁定水平移动）。 */
  isClimbing?: boolean;
}

// --- Charge Shrine ---
export type ShrinePhase = 'inactive' | 'charging' | 'ready' | 'consumed';

/** Shrine 奖励类型（对应 megabonk 充能神殿的奖励池）。 */
export type ShrineRewardType =
  | 'damage'              // % damage
  | 'shield'              // +N flat shield max
  | 'pickup_range'        // % pickup radius
  | 'crit_damage'         // % crit damage
  | 'luck'                // % luck
  | 'projectile_count'    // +N projectile
  | 'hp_regen'            // +N HP regen / sec
  | 'knockback'           // % knockback
  | 'attack_speed'        // % attack speed
  | 'difficulty'          // % difficulty
  | 'lifesteal'           // % lifesteal
  | 'powerup_multiplier'  // % powerup multiplier
  | 'elite_damage'        // % elite damage
  | 'duration'            // % duration
  | 'jump_height'         // % jump height
  | 'movement_speed';     // % move speed

export interface ShrineRewardOption {
  /** 唯一 id（shrine 内）。 */
  id: string;
  /** 稀有度（影响视觉 + 数值缩放，目前主要用于 UI 边框颜色）。 */
  rarity: UpgradeRarity;
  /** 奖励类别。 */
  reward: ShrineRewardType;
  /** 奖励数值（含义随 reward 类型而变，详见 ShrineRewardType 注释）。 */
  value: number;
}

export interface ShrineState {
  id: number;
  x: number;
  z: number;
  phase: ShrinePhase;
  /** 当前充能进度（秒）。 */
  chargeTimer: number;
  /** 充满需要的时间（秒）。 */
  chargeDuration: number;
  /** 充满后随机生成的 4 个奖励选项；其它阶段 = null。 */
  options: ShrineRewardOption[] | null;
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
  // --- Status effects (新武器引入；全部 optional，旧 fixture / 存档不带也能跑) ---
  /** 中毒（gas_dot）剩余秒数；> 0 时每帧按 poisonDps 持续掉血。 */
  poisonTimer?: number;
  /** 中毒每秒伤害（来自毒气云）。 */
  poisonDps?: number;
  /** 减速（strong_slow / elite_slow_coef）剩余秒数。 */
  slowTimer?: number;
  /** 减速后的速度倍率（0..1，越小越慢；麻痹接近 0）。多源取最强（最小值）。 */
  slowFactor?: number;
}

/**
 * 命中时给敌人施加的状态效果（投射物携带，碰撞时由 collisions 统一应用）。
 * 全部 optional —— 普通投射物不带此字段，行为零成本。
 */
export interface ProjectileOnHitStatus {
  /** 中毒每秒伤害。 */
  poisonDps?: number;
  /** 中毒持续秒数。 */
  poisonDuration?: number;
  /** 减速速度倍率（0..1）。 */
  slowFactor?: number;
  /** 减速持续秒数。 */
  slowDuration?: number;
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
  /** 命中敌人时施加的状态效果（麻痹枪等）。 */
  onHitStatus?: ProjectileOnHitStatus;
}

// --- Area Effects (持续 / 扩散型武器的世界实体) ---
/**
 * 区域特效类型：
 * - `gas_cloud`    毒气云：固定位置，周期性对范围内敌人造成伤害 + 施加中毒。
 * - `void_ripple`  虚空涟漪：以中心向外扩散的环形波，波前扫过敌人时结算伤害（近者先吃）。
 * - `scorch_trail` 灼地痕迹：玩家走过留下的地面痕迹，周期性灼伤路过敌人，痕迹消失即停。
 * - `ray_beam`     射线光束：纯视觉（伤害已由行为瞬发结算），仅供客户端渲染激光线。
 */
export type AreaEffectKind = 'gas_cloud' | 'void_ripple' | 'scorch_trail' | 'ray_beam';

export interface AreaEffectState {
  id: number;
  kind: AreaEffectKind;
  weaponType: WeaponType;
  x: number;
  z: number;
  /** 当前半径（void_ripple 每帧扩大；其它为固定作用半径）。 */
  radius: number;
  /** 剩余寿命（秒）。 */
  lifetime: number;
  /** 初始寿命（秒），用于客户端做渐隐比例。 */
  maxLifetime: number;
  /** 每次结算的伤害。 */
  damage: number;
  /** 是否暴击（用于 damageEvent 显示）。 */
  isCrit?: boolean;
  /** 周期伤害的计时器（gas_cloud / scorch_trail）。 */
  tickTimer?: number;
  /** 周期伤害间隔（秒）。 */
  tickInterval?: number;
  // --- void_ripple 扩散参数 ---
  /** 扩散速度（单位/秒）。 */
  expandSpeed?: number;
  /** 最大半径，达到后消失。 */
  maxRadius?: number;
  /** 是否每帧把中心锁到玩家脚下（void_ripple 用）。 */
  followPlayer?: boolean;
  /** 已结算过伤害的敌人 id（ripple 每个敌人只吃一次）。 */
  hitEnemyIds?: number[];
  // --- ray_beam 视觉参数 ---
  /** 光束方向单位向量。 */
  dirX?: number;
  dirZ?: number;
  /** 光束长度。 */
  length?: number;
  /** 光束 / 作用宽度（半宽）。 */
  width?: number;
  // --- 命中附带状态 ---
  /** 命中时施加的中毒每秒伤害。 */
  poisonDps?: number;
  /** 中毒持续秒数。 */
  poisonDuration?: number;
}

// --- Consumables ---
export type ConsumableId =
  | 'wild_berry'
  | 'hot_soup'
  | 'mint_candy'
  | 'hard_bread'
  | 'energy_bar'
  | 'magnet'
  | 'iron_meal'
  | 'rage_potion'
  | 'prophecy_book'
  | 'craftsman_hammer';

export interface ActiveConsumableState {
  id: ConsumableId;
  /** timed 剩余秒数；-1 表示 one_shot 待触发。 */
  remaining: number;
}

export interface ConsumablePickupState {
  id: number;
  consumableId: ConsumableId;
  x: number;
  y: number;
  z: number;
  lifetime: number;
  attracted: boolean;
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

export interface GoldMoteState {
  id: number;
  x: number;
  y: number;
  z: number;
  value: number;
  lifetime: number;
}

// --- Chest ---
export interface ChestState {
  id: number;
  x: number;
  z: number;
  opened: boolean;
  relicId?: RelicId;
  relicRarity?: RelicRarity;
}

export interface ChestOpenEvent {
  chestId: number;
  x: number;
  y: number;
  z: number;
  cost: number;
  relicId: RelicId;
  rarity: RelicRarity;
}

export interface PendingChestReward extends ChestOpenEvent {
  returnPhase: GamePhase;
}

// --- Altar (formerly Teleporter) ---
/**
 * 祭坛 / 传送门状态机。
 *
 * - `ready`         玩家未交互；进入半径时 UI 显示 `[E] 召唤 Boss`
 * - `summoning`     玩家按住 E 触发的短读条（防误触），离开半径会回 `ready`
 * - `boss_active`   Boss 已生成；祭坛此时锁住、不可再交互
 * - `portal_ready`  Boss 死亡后祭坛变成传送门；UI 显示 `[E] 进入下一关`
 * - `portal_used`   玩家进入传送门；终态，会被 tier 推进流程消费
 */
export type AltarPhase = 'ready' | 'summoning' | 'boss_active' | 'portal_ready' | 'portal_used';

export interface AltarState {
  x: number;
  z: number;
  phase: AltarPhase;
  /** 召唤读条进度（秒），仅 `summoning` 阶段递增。 */
  summonTimer: number;
  /** 召唤读条总时长（秒），= `ALTAR_SUMMON_DURATION`。 */
  summonDuration: number;
}

/**
 * @deprecated 使用 `AltarPhase`。本别名仅为减少一次性破坏；新代码请用 `AltarPhase`。
 * 注意：阶段值与旧 `TeleporterPhase` 不再兼容（已重新设计为祭坛状态机）。
 */
export type TeleporterPhase = AltarPhase;

/**
 * @deprecated 使用 `AltarState`。本别名仅为减少一次性破坏；新代码请用 `AltarState`。
 */
export type TeleporterState = AltarState;

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

// --- Level-up compensation events (empty upgrade pool → gold/silver) ---
export interface LevelUpCompensationEvent {
  x: number;
  y: number;
  z: number;
  level: number;
  kind: 'gold' | 'silver';
  amount: number;
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
  /** Shield absorption feedback uses a separate visual style from HP damage. */
  isShield?: boolean;
}

// --- Game State ---
export type GamePhase = 'menu' | 'playing' | 'level_up' | 'shrine_reward' | 'chest_reward' | 'boss_intro' | 'boss_fight' | 'portal_open' | 'victory' | 'defeat' | 'paused';

export interface GameStats {
  killCount: number;
  damageDealt: number;
  damageTaken: number;
  shieldAbsorbed: number;
  silverEarned: number;
}

export interface GameState {
  tick: number;
  gameTime: number;
  /**
   * Overtime 累积时长（秒）。
   * 玩家击败 Boss 但拒绝进入传送门、且 `gameTime ≥ 540s` 后开始累加。
   * 用于驱动敌人难度系数（每 30s 一档）。
   */
  overtimeSeconds: number;
  running: boolean;
  paused: boolean;
  finished: boolean;
  phase: GamePhase;
  player: PlayerState;
  enemies: EnemyState[];
  projectiles: ProjectileState[];
  /** 持续 / 扩散型武器的区域特效（毒气云 / 涟漪 / 灼地痕迹 / 激光线）。 */
  areaEffects: AreaEffectState[];
  pickups: PickupState[];
  consumablePickups: ConsumablePickupState[];
  goldMotes: GoldMoteState[];
  chests: ChestState[];
  boss: BossState | null;
  upgradeOptions: UpgradeOption[] | null;
  damageEvents: DamageEvent[];
  /** 空池升级补偿事件（client 读完后由 tick 清空）。 */
  levelUpCompensationEvents: LevelUpCompensationEvent[];
  /** 宝箱开启事件（client 读完后由 tick 清空，用于揭示动画）。 */
  chestOpenEvents: ChestOpenEvent[];
  /** 已消耗金币和宝箱、等待玩家留下/丢弃的遗物。 */
  pendingChestReward: PendingChestReward | null;
  stats: GameStats;
  waveIndex: number;
  /**
   * 祭坛 / 传送门列表。Boss 召唤前是祭坛，Boss 死亡后变传送门，进入后被消费。
   * 旧字段名 `teleporters` 已弃用；请使用 `altars`。
   */
  altars: AltarState[];
  /** Charge shrine 列表（开局生成）。 */
  shrines: ShrineState[];
  /** 当前正在选择奖励的 shrine id；其它阶段 = null。 */
  activeShrineId: number | null;
  character: CharacterType;
  finalSwarm: boolean;
}

// --- Difficulty ---
export type DifficultyTier = 1 | 2 | 3;

// --- Config ---
// --- Level data (data-driven levels parsed from Blender .glb) ---

/**
 * 可站立地面 / 平台 —— 实为一个实体盒子。
 * height = 顶面（可站立高度）；baseY = 底面。
 * 盒子作为实体参与碰撞：可站顶面、横向挡人（除非顶面在迈步范围内可直接上）、底在头顶之上时可从下方穿过。
 */
export interface CollisionRect {
  cx: number;
  cz: number;
  halfW: number;
  halfD: number;
  height: number;
  /** 盒子底面 y。缺省视为 -∞（实心到底，旧数据兼容）。 */
  baseY?: number;
}

/** 实心遮挡体（水平阻挡）。bottomY~topY 为竖直占据区间。 */
export interface WallBox {
  cx: number;
  cz: number;
  halfW: number;
  halfD: number;
  bottomY: number;
  topY: number;
  blockProjectile?: boolean;
}

/**
 * 斜坡 —— 可**行走**上去的倾斜地面（区别于 climb_ 攀爬）。
 *
 * 顶面是一个**旋转的矩形**，沿 slopeDir 方向从低端线性升到高端。
 * 不再限制必须沿世界 X/Z 轴 —— 支持 Blender 里旋转过的斜坡。
 *
 * 中心 (cx, cz) 处高度 = (lowY + highY) / 2。
 * 高端在 (cx, cz) + halfSlope × slopeDir。
 * 低端在 (cx, cz) - halfSlope × slopeDir。
 */
export interface RampVolume {
  cx: number;
  cz: number;
  /** 沿坡道方向的半长（中心到高/低端的距离）。 */
  halfSlope: number;
  /** 垂直于坡道方向的半宽。 */
  halfPerp: number;
  /** 上升方向单位向量（XZ 平面）。从中心沿这个方向走 halfSlope 到达 highY 端。 */
  slopeDirX: number;
  slopeDirZ: number;
  /** 低端顶面高度。 */
  lowY: number;
  /** 高端顶面高度。 */
  highY: number;
}

/** 攀爬体。玩家可在 bottomY~topY 间攀爬；怪物可经此登高。 */
export interface ClimbVolume {
  cx: number;
  cz: number;
  halfW: number;
  halfD: number;
  bottomY: number;
  topY: number;
}

/** 关卡出生点。坐标已转换为游戏坐标系（x, z）。 */
export interface LevelSpawnPoints {
  player?: { x: number; z: number };
  boss?: { x: number; z: number };
  altars?: { x: number; z: number }[];
  enemyZones?: Record<string, { x: number; z: number }>;
}

/**
 * 一关的全部逻辑数据。由 client 的 LevelLoader 解析 .glb 产出，
 * 经 GameConfig.level 传入 core。缺省时回退到内置 Neon Crucible 几何。
 */
export interface LevelData {
  collisionRects: CollisionRect[];
  walls: WallBox[];
  climbVolumes: ClimbVolume[];
  ramps: RampVolume[];
  spawnPoints: LevelSpawnPoints;
  chestSpawns: { x: number; z: number }[];
}

export interface GameConfig {
  mapSize: number;
  tickIntervalMs: number;
  maxEnemies: number;
  character: CharacterType;
  tier: DifficultyTier;
  /** 可选关卡数据；缺省回退到内置 Neon Crucible 几何。 */
  level?: LevelData;
}

// --- Result ---
export interface GameResult {
  victory: boolean;
  survivalTime: number;
  killCount: number;
  level: number;
  silverEarned: number;
}
