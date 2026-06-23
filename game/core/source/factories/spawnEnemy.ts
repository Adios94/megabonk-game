/**
 * 敌人实体工厂。
 *
 * 唯一负责构造 EnemyState 的位置 —— 所有 spawn 调用点（wave / mini-boss /
 * necromancer summon / boss summon_wave）都走这里。
 *
 * 不同 spawn 模式的 scaling 规则：
 * - 'wave':              full 进度缩放 (timeScale × tier × 等级 × Final Swarm × overtime × elite buff 50%)
 * - 'miniBoss':          3× hp, 2× damage, isMiniBoss, summonCooldown=8, 带等级缩放
 * - 'necromancerSummon': 仅 cfg.hp × timeScale, 无 tier 无其它
 * - 'bossSummon':        raw cfg, 无任何缩放
 */
import type { EnemyState, EnemyType, PlayerState, EnemyBehavior, DifficultyTier } from '../types.ts';
import {
  TIER_CONFIGS,
  REGULAR_GAME_DURATION,
  FINAL_SWARM_START_TIME,
  FINAL_SWARM_HP_GROWTH,
  FINAL_SWARM_DAMAGE_GROWTH,
  FINAL_SWARM_OVERTIME_GROWTH_RATIO,
  OVERTIME_STEP_SECONDS,
  OVERTIME_HP_PER_STEP,
  OVERTIME_DAMAGE_PER_STEP,
  OVERTIME_SPEED_PER_STEP,
} from '../config.ts';
import { ENEMIES } from '../data/enemies.ts';

const ENEMY_LEVEL_SCALE_START = 10;
const ENEMY_HP_PER_LEVEL = 0.03;
const ENEMY_HP_QUADRATIC = 0.00075;
const ENEMY_DAMAGE_PER_LEVEL = 0.015;
const ENEMY_DAMAGE_QUADRATIC = 0.00025;
const ENEMY_SPEED_PER_LEVEL = 0.003;
const ENEMY_SPEED_CAP = 1.12;

function computeEnemyLevelScale(playerLevel: number): { hp: number; damage: number; speed: number } {
  const levels = Math.max(0, playerLevel - ENEMY_LEVEL_SCALE_START);
  return {
    hp: 1 + levels * ENEMY_HP_PER_LEVEL + levels * levels * ENEMY_HP_QUADRATIC,
    damage: 1 + levels * ENEMY_DAMAGE_PER_LEVEL + levels * levels * ENEMY_DAMAGE_QUADRATIC,
    speed: Math.min(ENEMY_SPEED_CAP, 1 + levels * ENEMY_SPEED_PER_LEVEL),
  };
}

function computeFinalSwarmScale(gameTime: number): { hp: number; damage: number } {
  if (gameTime < FINAL_SWARM_START_TIME) {
    return { hp: 1, damage: 1 };
  }

  const duration = REGULAR_GAME_DURATION - FINAL_SWARM_START_TIME;
  const progress = gameTime < REGULAR_GAME_DURATION
    ? (duration > 0 ? (gameTime - FINAL_SWARM_START_TIME) / duration : 1)
    : FINAL_SWARM_OVERTIME_GROWTH_RATIO +
      (duration > 0 ? (gameTime - REGULAR_GAME_DURATION) / duration * FINAL_SWARM_OVERTIME_GROWTH_RATIO : 0);
  const clamped = Math.max(0, progress);
  return {
    hp: 1 + FINAL_SWARM_HP_GROWTH * clamped,
    damage: 1 + FINAL_SWARM_DAMAGE_GROWTH * clamped,
  };
}

function computeEffectiveOvertimeSeconds(
  overtimeSeconds: number,
  anchorSeconds: number | undefined,
  growthMultiplier: number | undefined,
): number {
  if (overtimeSeconds <= 0 || anchorSeconds === undefined || growthMultiplier === undefined) {
    return overtimeSeconds;
  }

  const anchor = Math.max(0, Math.min(overtimeSeconds, anchorSeconds));
  return anchor + (overtimeSeconds - anchor) * growthMultiplier;
}

export interface SpawnEnemyContext {
  gameTime: number;
  tier: DifficultyTier;
  /** Overtime 累积秒数，0 表示常规生存期。按 OVERTIME_STEP_SECONDS 归一后连续提升。 */
  overtimeSeconds?: number;
  /** Boss 生成时的 overtime 秒数；只放慢该锚点之后的成长增量。 */
  overtimeGrowthAnchorSeconds?: number;
  /** Boss 存活期间 overtime 成长速率倍率；undefined 表示不调整。 */
  overtimeGrowthMultiplier?: number;
  player: PlayerState;     // 用于 targetX/Z 初始化
  nextId: () => number;    // 调用方维护 nextEnemyId
}

export interface SpawnEnemyOpts {
  /** spawn mode 决定 scaling. Default: 'wave' */
  mode?: 'wave' | 'miniBoss' | 'necromancerSummon' | 'bossSummon';
  /** 'wave' 模式下是否对 isElite 应用 50% 随机 buff. Default true */
  applyEliteRoll?: boolean;
}

export function spawnEnemy(
  type: EnemyType,
  x: number, z: number,
  ctx: SpawnEnemyContext,
  opts: SpawnEnemyOpts = {},
): EnemyState {
  const def = ENEMIES[type];
  const mode = opts.mode ?? 'wave';

  let hp: number, damage: number, speed: number;
  let isElite = def.isElite;
  let isMiniBoss = false;
  let summonCooldown = type === 'necromancer' ? 8 : 0;
  // 这两个字段不同 spawn mode 的 legacy 行为不一致, 由 switch 设
  let orbitAngle = 0;

  // Overtime 系数（仅对 wave / miniBoss 应用；necromancer/boss summon 保持原始数值）。
  // 使用连续曲线，避免按档位突跳，同时让超时压迫感从第一秒就开始增强。
  const rawOvertimeSeconds = ctx.overtimeSeconds ?? 0;
  const effectiveOvertimeSeconds = computeEffectiveOvertimeSeconds(
    rawOvertimeSeconds,
    ctx.overtimeGrowthAnchorSeconds,
    ctx.overtimeGrowthMultiplier,
  );
  const effectiveGameTime = rawOvertimeSeconds > 0 && ctx.gameTime >= REGULAR_GAME_DURATION
    ? REGULAR_GAME_DURATION + effectiveOvertimeSeconds
    : ctx.gameTime;
  const overtimeSteps = Math.max(0, effectiveOvertimeSeconds / OVERTIME_STEP_SECONDS);
  const overtimeHpFactor = 1 + OVERTIME_HP_PER_STEP * overtimeSteps;
  const overtimeDamageFactor = 1 + OVERTIME_DAMAGE_PER_STEP * overtimeSteps;
  const overtimeSpeedFactor = 1 + OVERTIME_SPEED_PER_STEP * overtimeSteps;
  const shrineDifficulty = ctx.player.difficultyMult ?? 1;
  const levelScale = computeEnemyLevelScale(ctx.player.level);
  const finalSwarmScale = computeFinalSwarmScale(effectiveGameTime);

  switch (mode) {
    case 'wave': {
      const timeScale = 1 + effectiveGameTime / 600;
      let hpScale = timeScale;
      if (effectiveGameTime >= 180) {
        hpScale *= (1 + (effectiveGameTime - 180) / 60 * 0.1);
      }
      const tierCfg = TIER_CONFIGS[ctx.tier];
      hp = Math.round(def.hp * hpScale * tierCfg.enemyHpMultiplier * levelScale.hp * finalSwarmScale.hp * overtimeHpFactor * shrineDifficulty);
      damage = Math.round(def.damage * tierCfg.enemyDamageMultiplier * levelScale.damage * finalSwarmScale.damage * overtimeDamageFactor * shrineDifficulty);
      speed = def.speed * tierCfg.enemySpeedMultiplier * levelScale.speed * overtimeSpeedFactor * Math.sqrt(shrineDifficulty);

      if (isElite && (opts.applyEliteRoll ?? true) && Math.random() < 0.5) {
        const buff = Math.floor(Math.random() * 3);
        switch (buff) {
          case 0: speed *= 1.4; break;
          case 1: hp = Math.round(hp * 1.5); break;
          case 2: damage = Math.round(damage * 1.5); break;
        }
      }
      orbitAngle = Math.random() * Math.PI * 2;  // legacy spawnSingleEnemy
      break;
    }
    case 'miniBoss': {
      const timeScale = 1 + effectiveGameTime / 600;
      const tierCfg = TIER_CONFIGS[ctx.tier];
      hp = Math.round(def.hp * timeScale * 3 * tierCfg.enemyHpMultiplier * levelScale.hp * overtimeHpFactor * shrineDifficulty);
      damage = Math.round(def.damage * 2 * tierCfg.enemyDamageMultiplier * levelScale.damage * overtimeDamageFactor * shrineDifficulty);
      speed = def.speed * tierCfg.enemySpeedMultiplier * levelScale.speed * overtimeSpeedFactor * Math.sqrt(shrineDifficulty);
      isElite = true;
      isMiniBoss = true;
      summonCooldown = 8;
      orbitAngle = Math.random() * Math.PI * 2;  // legacy spawnMiniBoss
      break;
    }
    case 'necromancerSummon': {
      // 召唤的小骷髅 — legacy isElite=false, summonCooldown=0, orbitAngle=0
      const timeScale = 1 + effectiveGameTime / 600;
      hp = Math.round(def.hp * timeScale);
      damage = def.damage;
      speed = def.speed;
      isElite = false;
      summonCooldown = 0;
      orbitAngle = 0;
      break;
    }
    case 'bossSummon': {
      // boss summon_wave — legacy isElite=false, summonCooldown=0, orbitAngle=random
      hp = def.hp;
      damage = def.damage;
      speed = def.speed;
      isElite = false;
      summonCooldown = 0;
      orbitAngle = Math.random() * Math.PI * 2;
      break;
    }
  }

  const id = ctx.nextId();
  return {
    id,
    type,
    x,
    y: type === 'gargoyle' ? 3 : 0,
    z,
    hp, maxHp: hp,
    speed, damage,
    behavior: def.behavior as EnemyBehavior,
    isElite,
    isMiniBoss,
    hitFlashTimer: 0,
    attackCooldown: 0,
    attackCooldownMax: def.attackCooldown,
    targetX: ctx.player.x,
    targetZ: ctx.player.z,
    /** AI 错峰计算相位（0-3）：用 id % 4 确定性分配，零 RNG 消耗，保证回放/seed 稳定 */
    aiPhase: id % 4,
    chargeState: 'idle',
    chargeTimer: 0,
    chargeTargetX: 0,
    chargeTargetZ: 0,
    summonCooldown,
    orbitAngle,
    orbitTimer: 0,
    diveState: 'flying',
    diveTimer: 0,
  };
}
