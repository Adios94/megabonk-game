// === MegaBonk Survivor - Type Definitions ===

import type { Modifier } from './stats/Modifier.ts';

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
  | 'pistol'
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

// --- Bonds (羁绊系统; replaces weapon evolutions) ---
/** 9 条语义羁绊的 id（见 data/bonds.ts）。 */
export type BondId =
  | 'iron_blood'      // B1 铁血    N=2  sword / axe
  | 'arcane'          // B2 奥术    N=4  lightning / flame / void / scorch
  | 'zero_range'      // B3 零距寸劲 N=4  sword / axe / void / shotgun
  | 'ember_trail'     // B4 余烬轨迹 N=2  flame / scorch
  | 'volley'          // B5 弹幕    N=4  pistol / shotgun / bone / poison
  | 'bone_crush'      // B6 碎骨震   N=3  pistol / sword / bone
  | 'arc_conductor'   // B7 弧光导体 N=3  ray / lightning / void
  | 'poison_master'   // B8 毒师    N=2  poison / paralysis
  | 'hunter_mark';    // B9 猎标烙印 N=3  pistol / ray / paralysis

/** 羁绊等级：0=未激活，1/2/3=已激活档位。 */
export type BondTier = 0 | 1 | 2 | 3;

/** 局内已激活的羁绊进度。 */
export interface BondProgress {
  bondId: BondId;
  /** 当前激活档位（1..3）。 */
  tier: BondTier;
}

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
  /** 角色天赋派生：经验获取加成（0.044 = +4.4%）。 */
  characterTraitXpBonus?: number;
  /** 角色天赋派生：暴击率加成，供重复刷新时撤销旧值。 */
  characterTraitCritChanceBonus?: number;
  /** 角色天赋派生：暴击伤害加成，供重复刷新时撤销旧值。 */
  characterTraitCritDamageBonus?: number;
  /** 角色天赋派生：攻速加成，供重复刷新时撤销旧值。 */
  characterTraitAttackSpeedBonus?: number;
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
  // --- Bonds (羁绊系统) ---
  /** 局内已激活的羁绊（tier 1..3）。createInitialPlayer 初始化为 []。 */
  bonds?: BondProgress[];
  /**
   * 由 recomputeBondState 预算出的「无条件、按武器 type 限定」的伤害增益修饰符。
   * computeWeaponDamage 直接读取并按 tag superset-AND 过滤生效。
   */
  bondDamageMods?: Modifier[];
  // --- Bond runtime state（全部 optional；激活对应羁绊后由 systems/bonds 维护）---
  /** B2 奥术：累计「奥秘」点数。 */
  bondMystery?: number;
  /** B2 奥术：本秒已获得的奥秘点数（每秒上限 15）。 */
  bondMysterySecGain?: number;
  /** B2 奥术：本秒计时累积。 */
  bondMysterySecTimer?: number;
  /** B1 铁血 T2：下次斩击的叠层加成数（受击刷新）。 */
  bondIronStacks?: number;
  /** B1 铁血 T3：受击后的暴怒计时（攻速/伤害提升）。 */
  bondIronRageTimer?: number;
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
  /** 对精英 / 小头目 / boss 的额外伤害倍率（默认 1.0）。来自 charge shrine 的 elite_damage 奖励；
   *  与 elite_writ 遗物（按 stack 计）在 applyRelicTargetDamage 里相乘。 */
  eliteDamageMult?: number;
  /**
   * Charge shrine 中会被 recomputePlayerStats 重算覆盖的 5 个 stat 的累计加成。
   * recompute 末尾二次合并，避免被 tome 升级 / 开宝箱触发的 recompute 清掉
   * （damage / attack_speed / movement_speed / pickup_range / crit_damage shrine 奖励走这里）。
   */
  shrineBonuses?: {
    damageMult: number;
    attackSpeedMult: number;
    speedMult: number;
    pickupRadiusMult: number;
    critDamageAdd: number;
  };
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
  y?: number;
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
  /** AI错峰计算相位（0-3），每帧只有对应aiPhase的敌人重算目标 */
  aiPhase: number;
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
  // --- Bond marks（羁绊 T2/T3 机制；全部 optional）---
  /** B7 弧光导体：导体标记剩余秒数（被 void_ripple 命中后获得）。 */
  conductorMarkTimer?: number;
  /** B6 碎骨震：易伤剩余秒数（受到羁绊内武器伤害 +bondVulnPct）。 */
  bondVulnTimer?: number;
  /** B6 碎骨震：易伤增伤比例（如 0.16）。 */
  bondVulnPct?: number;
  /** B8 毒师：神经毒素层数。 */
  neuroStacks?: number;
  /** B8 毒师：神经毒素剩余秒数。 */
  neuroTimer?: number;
  /** B8 毒师：神经毒素周期触发计时器。 */
  neuroPulseTimer?: number;
  /** B9 猎标烙印：是否被烙印（不可解除，受羁绊内武器伤害 +16%、优先索敌）。 */
  hunterBranded?: boolean;
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
  /**
   * 是否由 Boss 发射（而非普通敌人）。仅在 `fromPlayer === false` 时有意义。
   * 客户端据此选择渲染方式：Boss 弹丸用 bullet.glb 模型，普通敌人弹丸用火焰 billboard。
   * 与具体 `weaponType` 解耦——Boss 改用任意 weaponType 都不影响识别。
   */
  fromBoss?: boolean;
  hitEnemyIds: number[];
  // Special behaviors
  orbiting?: boolean;
  orbitAngle?: number;
  orbitRadius?: number;
  orbitSpeed?: number;
  /**
   * 周期性重置命中表的间隔（秒）。用于「常驻环绕」武器（axe 刀环）：
   * 每隔 rehitInterval 清空 hitEnemyIds，使持续绕圈的刀刃能反复打到同一敌人，
   * 表现为「火焰圈」式的持续伤害，而非一次性弹丸。未设置时退化为旧的「一次命中」行为。
   */
  rehitInterval?: number;
  /** rehitInterval 的倒计时（秒），≤0 时清空 hitEnemyIds 并重置。 */
  rehitTimer?: number;
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
  /** 效果所在支撑面高度（玩家脚下 / 敌人死亡点）；用于垂直分层 AoE 结算与客户端贴地渲染。 */
  y: number;
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
  /** 可选地表高度。旧数据可不填，client 会回落到 0。 */
  y?: number;
  z: number;
  opened: boolean;
  /** Boss 死亡掉落的宝箱，不计入普通宝箱刷新上限和费用增长。 */
  bossDrop?: boolean;
  relicId?: RelicId;
  relicRarity?: RelicRarity;
}

export interface ChestOpenEvent {
  chestId: number;
  x: number;
  y: number;
  z: number;
  cost: number;
  /** Boss 死亡掉落的免费宝箱。 */
  bossDrop?: boolean;
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
 * - `cooldown`      第二关及以后 Boss 死亡后的再召唤冷却
 * - `portal_ready`  Boss 死亡后祭坛变成传送门；UI 显示 `[E] 进入下一关`
 * - `portal_used`   玩家进入传送门；终态，会被 tier 推进流程消费
 */
export type AltarPhase = 'ready' | 'summoning' | 'boss_active' | 'cooldown' | 'portal_ready' | 'portal_used';

export interface AltarState {
  x: number;
  z: number;
  /** 祭坛所在地表高度（贴地用）。关卡模式由 getTerrainHeightAt 求得；平面 arena / 缺省为 0。 */
  y?: number;
  phase: AltarPhase;
  /** 召唤读条进度（秒），仅 `summoning` 阶段递增。 */
  summonTimer: number;
  /** 召唤读条总时长（秒），= `ALTAR_SUMMON_DURATION`。 */
  summonDuration: number;
  /** 再召唤冷却剩余秒数，仅 `cooldown` 阶段递减。 */
  cooldownTimer?: number;
  /** 再召唤冷却总时长，供 client 显示进度。 */
  cooldownDuration?: number;
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
export type UpgradeKind = 'weapon_upgrade' | 'new_weapon' | 'tome' | 'bond_activate' | 'bond_upgrade';

export interface UpgradeOption {
  id: string;
  kind: UpgradeKind;
  rarity: UpgradeRarity;
  weaponType?: WeaponType;
  tomeType?: TomeType;
  /** @deprecated use tomeType */
  passiveType?: TomeType;
  /** bond_activate / bond_upgrade 选项指向的羁绊。 */
  bondId?: BondId;
  currentLevel: number;
  newLevel: number;
}

// --- Boss ---
export type BossPhase = 1 | 2 | 3;

/**
 * Boss 种类 —— 每种对应一套独立 phase script（攻击池 / 数值 / 动画映射）。
 *   gunner_mech：第 1 关「游侠机甲」，敏捷射手（enemy_2legs_gun 模型）
 *   siege_mech ：第 2 关「攻城机甲」，重装炮手（enemy_large_gun 模型）
 */
export type BossType = 'gunner_mech' | 'siege_mech';

/**
 * Boss 攻击 tag —— 反向设计自两套机甲模型实际拥有的动画 clip
 * （Idle / Walk / Run / Jump / Shoot / Attack / Attack.001 / Death）。
 *   游侠机甲：aimed_burst(Shoot) / melee_swipe(Attack) / leap_strike(Jump) / suppress_fire(Shoot)
 *   攻城机甲：barrage(Shoot) / heavy_slam(Attack) / cleave(Attack.001) / leap_slam(Jump) / charge(Run) / deploy_drones(Shoot)
 */
export type BossAttack =
  | 'idle'
  | 'aimed_burst'
  | 'melee_swipe'
  | 'leap_strike'
  | 'suppress_fire'
  | 'barrage'
  | 'heavy_slam'
  | 'cleave'
  | 'leap_slam'
  | 'charge'
  | 'deploy_drones';

export interface BossState {
  x: number;
  y: number;
  z: number;
  hp: number;
  maxHp: number;
  /** 种类，决定走哪套 phase script（registry 选择）。 */
  bossType: BossType;
  phase: BossPhase;
  currentAttack: BossAttack;
  attackTimer: number;
  /** 攻击动画播放窗口（秒）。>0 时客户端播放 currentAttack 对应的攻击 clip。 */
  attackAnimTimer: number;
  attackCooldown: number;
  hitFlashTimer: number;
  speed: number;
  enraged: boolean;
  // --- Bond marks（羁绊 T2/T3 机制；boss 同样可被标记/施加，全部 optional）---
  /** B7 弧光导体：导体标记剩余秒数。 */
  conductorMarkTimer?: number;
  /** B6 碎骨震：易伤剩余秒数。 */
  bondVulnTimer?: number;
  /** B6 碎骨震：易伤增伤比例。 */
  bondVulnPct?: number;
  /** B8 毒师：神经毒素层数。 */
  neuroStacks?: number;
  /** B8 毒师：神经毒素剩余秒数。 */
  neuroTimer?: number;
  /** B8 毒师：神经毒素周期触发计时器。 */
  neuroPulseTimer?: number;
  /** B9 猎标烙印：是否被烙印（boss 免疫处决，但吃 +伤）。 */
  hunterBranded?: boolean;
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

/**
 * 羁绊视觉特效事件（client 读取后渲染，由 tick 在帧间清空）。
 *   - arcane_burst：蓝紫光球从玩家头顶飞向目标，命中处生成蓝紫烟雾。
 *   - ember_explode：余烬羁绊敌人爆炸 —— 在原地生成红色烟雾。
 */
export interface BondVfxEvent {
  kind: 'arcane_burst' | 'ember_explode';
  x: number;
  y: number;
  z: number;
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
  /** 当前难度档位（普通/困难/噩梦），整局保持为玩家选择的难度。 */
  tier: DifficultyTier;
  /** 当前是第几关：第一关 Boss 死亡开传送门，第二关及以后 Boss 死亡进入祭坛冷却。 */
  stage: RunStage;
  /**
   * Overtime 累积时长（秒）。
   * 玩家击败 Boss 但拒绝进入传送门、且 `gameTime ≥ 540s` 后开始累加。
   * 用于驱动敌人难度系数（按秒连续提升）。
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
  /** 羁绊视觉特效事件（client 读完后由 tick 清空）。 */
  bondVfxEvents: BondVfxEvent[];
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

export type RunStage = 1 | 2;

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

/** 圆形/圆柱可站立平台（col_ 的圆形版，glb 前缀 colcyl_）。顶面 height、半径 radius。 */
export interface DiscVolume {
  cx: number;
  cz: number;
  radius: number;
  height: number;
  /** 圆柱底面 y。缺省视为 -∞（实心到底）。 */
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
  /** spawn_player 标记（开局随机选 1 个）。 */
  players?: { x: number; y?: number; z: number }[];
  /** @deprecated Boss 已绑定触发的 spawn_altar；旧 spawn_boss 仅作兼容解析。 */
  bosses?: { x: number; z: number }[];
  /** spawn_altar 标记（开局随机选固定数量）。 */
  altars?: { x: number; z: number }[];
  /** spawn_enemy_* 标记（仅解析保留；当前刷怪仍按玩家附近环带）。 */
  enemyZones?: Record<string, { x: number; z: number }[]>;
}

/**
 * 一关的全部逻辑数据。由 client 的 LevelLoader 解析 .glb 产出，
 * 经 GameConfig.level 传入 core。缺省时回退到内置 Neon Crucible 几何。
 */
export interface LevelData {
  collisionRects: CollisionRect[];
  /** 圆形可站立平台（colcyl_）。缺省为空，兼容旧关卡。 */
  collisionDiscs?: DiscVolume[];
  walls: WallBox[];
  climbVolumes: ClimbVolume[];
  ramps: RampVolume[];
  spawnPoints: LevelSpawnPoints;
  chestSpawns: { x: number; y?: number; z: number }[];
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
