/**
 * 敌人实体工厂。
 *
 * 唯一负责构造 EnemyState 的位置 —— 所有 spawn 调用点（wave / mini-boss /
 * necromancer summon / boss summon_wave）都走这里。
 *
 * 不同 spawn 模式的 scaling 规则：
 * - 'wave':              full 进度缩放 (timeScale × tier × 时间增长 × elite buff 50%)
 * - 'miniBoss':          3× hp, 2× damage, isMiniBoss, summonCooldown=8
 * - 'necromancerSummon': 仅 cfg.hp × timeScale, 无 tier 无其它
 * - 'bossSummon':        raw cfg, 无任何缩放
 */
import type { EnemyState, EnemyType, PlayerState, EnemyBehavior, DifficultyTier } from '../types.ts';
import {
  TIER_CONFIGS,
  OVERTIME_STEP_SECONDS,
  OVERTIME_HP_DAMAGE_PER_STEP,
  OVERTIME_SPEED_PER_STEP,
} from '../config.ts';
import { ENEMIES } from '../data/enemies.ts';

export interface SpawnEnemyContext {
  gameTime: number;
  tier: DifficultyTier;
  /** Overtime 累积秒数，0 表示常规生存期。每 OVERTIME_STEP_SECONDS 升一档系数。 */
  overtimeSeconds?: number;
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

  // Overtime 系数（仅对 wave / miniBoss 应用；necromancer/boss summon 保持原始数值）
  const overtimeStep = Math.max(0, Math.floor((ctx.overtimeSeconds ?? 0) / OVERTIME_STEP_SECONDS));
  const overtimeHpDmgFactor = 1 + OVERTIME_HP_DAMAGE_PER_STEP * overtimeStep;
  const overtimeSpeedFactor = 1 + OVERTIME_SPEED_PER_STEP * overtimeStep;

  switch (mode) {
    case 'wave': {
      const timeScale = 1 + ctx.gameTime / 600;
      let hpScale = timeScale;
      if (ctx.gameTime >= 180) {
        hpScale *= (1 + (ctx.gameTime - 180) / 60 * 0.1);
      }
      const tierCfg = TIER_CONFIGS[ctx.tier];
      hp = Math.round(def.hp * hpScale * tierCfg.enemyHpMultiplier * overtimeHpDmgFactor);
      damage = Math.round(def.damage * tierCfg.enemyDamageMultiplier * overtimeHpDmgFactor);
      speed = def.speed * tierCfg.enemySpeedMultiplier * overtimeSpeedFactor;

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
      const timeScale = 1 + ctx.gameTime / 600;
      const tierCfg = TIER_CONFIGS[ctx.tier];
      hp = Math.round(def.hp * timeScale * 3 * tierCfg.enemyHpMultiplier * overtimeHpDmgFactor);
      damage = Math.round(def.damage * 2 * tierCfg.enemyDamageMultiplier * overtimeHpDmgFactor);
      speed = def.speed * tierCfg.enemySpeedMultiplier * overtimeSpeedFactor;
      isElite = true;
      isMiniBoss = true;
      summonCooldown = 8;
      orbitAngle = Math.random() * Math.PI * 2;  // legacy spawnMiniBoss
      break;
    }
    case 'necromancerSummon': {
      // 召唤的小骷髅 — legacy isElite=false, summonCooldown=0, orbitAngle=0
      const timeScale = 1 + ctx.gameTime / 600;
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
