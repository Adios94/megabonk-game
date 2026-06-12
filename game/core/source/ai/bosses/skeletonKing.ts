/**
 * Skeleton King phase script + 7 attacks（数据驱动 boss AI）。
 *
 * Phase 4b 把原 `GameInstance.updateBossAI / executeBossAttack / chooseBossAttack /
 * getBossMeleeDamage` 抽到这里，单文件聚合。`systems/bossAi.ts` 调度它。
 *
 * Phase 切换规则（与 legacy 一致）：
 *   hp/maxHp >  0.6  → phase 1, speed 3.0
 *   hp/maxHp <= 0.6  → phase 2, speed 4.0
 *   hp/maxHp <= 0.3  → phase 3, speed 5.0, enraged=true
 *
 * 各 phase 攻击池（chooseAttack 从池里 floor(random()*len) 选）：
 *   phase 1: melee_sweep, ground_slam, dark_bolt
 *   phase 2: melee_sweep, ground_slam, summon_wave, charge, dark_bolt
 *   phase 3: aoe_explosion, dark_rain, charge, summon_wave, melee_sweep
 *
 * Math.random 消费顺序（parity 测试关心，必须与 legacy 字节级匹配）：
 *   chooseAttack: 1 random (pool 选)
 *   updateBossAI 每次 attack window: + 1 random (attackTimer 重置)
 *   summon_wave (per spawned enemy):
 *     - factory bossSummon mode: 1 random (orbitAngle)
 *   dark_rain: 6 × 2 randoms (ox, oz)
 */
import { distanceBetween, normalizeDirection } from '../../physics.ts';
import { ENEMIES } from '../../data/enemies.ts';
import { AOE_MAX_Y_DELTA, MAX_ENEMIES, MAX_PROJECTILES } from '../../config.ts';
import type { BossState, BossAttack, BossPhase } from '../../types.ts';
import type { AiContext } from '../types.ts';

export interface BossPhaseConfig {
  hpRatio: number;            // 触发该 phase 的 hp 阈值（hp/maxHp <= 这个值时进入）
  phase: BossPhase;
  attacks: readonly BossAttack[];
  speed: number;
  enraged: boolean;
}

/**
 * Skeleton King 阶段表。运行时以 hp/maxHp 比例从下往上找第一个 `<=` 命中的 phase。
 * 注：phase 1 的 hpRatio = 1.0 是兜底（任何 hp 都满足 <=1.0）。
 */
export const SKELETON_KING_PHASES: readonly BossPhaseConfig[] = [
  { hpRatio: 0.3, phase: 3, attacks: ['aoe_explosion', 'dark_rain', 'charge', 'summon_wave', 'melee_sweep'], speed: 5.0, enraged: true },
  { hpRatio: 0.6, phase: 2, attacks: ['melee_sweep', 'ground_slam', 'summon_wave', 'charge', 'dark_bolt'],   speed: 4.0, enraged: false },
  { hpRatio: 1.0, phase: 1, attacks: ['melee_sweep', 'ground_slam', 'dark_bolt'],                            speed: 3.0, enraged: false },
] as const;

/** 根据 hp/maxHp 比例查找当前 phase 配置. */
export function resolvePhase(boss: BossState): BossPhaseConfig {
  const ratio = boss.hp / boss.maxHp;
  for (const cfg of SKELETON_KING_PHASES) {
    if (ratio <= cfg.hpRatio) return cfg;
  }
  // 不可达（最后一个 hpRatio=1.0 兜底），保险返回 phase 1
  return SKELETON_KING_PHASES[SKELETON_KING_PHASES.length - 1];
}

/** 从当前 phase 的 attack pool 里随机选一个，等价 legacy chooseBossAttack. */
export function chooseAttack(cfg: BossPhaseConfig): BossAttack {
  const pool = cfg.attacks;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Boss 近战伤害（player 撞 boss 时）。phase 越高越疼。
 *
 * 由 processCollisions 调用（不在 attack switch 里）。Phase 4b 把它从
 * GameInstance 迁过来，processCollisions 改单向 import。
 */
export function getBossMeleeDamage(boss: BossState): number {
  switch (boss.phase) {
    case 1: return 20;
    case 2: return 30;
    case 3: return 40;
    default: return 20;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 7 attack 实现 —— 单文件聚合，每个签名 (boss, ctx) => void。
// ─────────────────────────────────────────────────────────────────────────

const MELEE_RANGE = 3.5;
const GROUND_SLAM_RANGE = 5.0;
const AOE_EXPLOSION_RANGE = 7.0;

/** 近战横扫 25 dmg / 3.5 单位. */
function meleeSweep(boss: BossState, ctx: AiContext): void {
  const dist = distanceBetween(boss.x, boss.z, ctx.player.x, ctx.player.z);
  if (dist < MELEE_RANGE) {
    ctx.effects.damagePlayer(25);
  }
}

/** 地震 35 dmg / 5 单位. */
function groundSlam(boss: BossState, ctx: AiContext): void {
  const dist = distanceBetween(boss.x, boss.z, ctx.player.x, ctx.player.z);
  if (dist < GROUND_SLAM_RANGE) {
    ctx.effects.damagePlayer(35);
  }
}

/** AOE 爆炸 40 dmg / 7 单位（phase 3 专属）. */
function aoeExplosion(boss: BossState, ctx: AiContext): void {
  const dist = distanceBetween(boss.x, boss.z, ctx.player.x, ctx.player.z);
  if (dist < AOE_EXPLOSION_RANGE && Math.abs(boss.y - ctx.player.y) <= AOE_MAX_Y_DELTA) {
    ctx.effects.damagePlayer(40);
  }
}

/** 暗影箭：朝玩家发射 1 个 20 dmg 的快速投射物. */
function darkBolt(boss: BossState, ctx: AiContext): void {
  const dir = normalizeDirection(ctx.player.x - boss.x, ctx.player.z - boss.z);
  ctx.effects.spawnProjectile({
    weaponType: 'flame_ring',
    x: boss.x, y: boss.y + 1.0, z: boss.z,
    vx: dir.x * 10, vy: 0, vz: dir.z * 10,
    damage: 20,
    bouncesLeft: 0, pierceLeft: 0,
    lifetime: 4.0, radius: 0.5,
    fromPlayer: false,
  });
}

/** 召唤一波小怪：phase 3 召 8, 否则 4。等距分布，phase>=2 时召 zombie. */
function summonWave(boss: BossState, ctx: AiContext): void {
  const count = boss.phase === 3 ? 8 : 4;
  const enemyType = boss.phase >= 2 ? 'zombie' : 'skeleton_soldier';
  if (!ENEMIES[enemyType]) return;

  for (let i = 0; i < count; i++) {
    if (ctx.enemies.length >= MAX_ENEMIES) break;
    const angle = (i / count) * Math.PI * 2;
    const spawnDist = 5;
    ctx.effects.spawnEnemyByType(
      enemyType,
      boss.x + Math.cos(angle) * spawnDist,
      boss.z + Math.sin(angle) * spawnDist,
      { mode: 'bossSummon' },
    );
  }
}

/**
 * 冲撞 —— 仅设 boss.speed=12，下一帧移动逻辑会高速冲玩家。
 * 注：legacy 没复位 speed，phase 阈值检查在每帧开头会重置 (3/4/5)，所以这只是单帧"冲刺"。
 */
function charge(boss: BossState, _ctx: AiContext): void {
  boss.speed = 12.0;
}

/** 暗雨：6 颗投射物从天而降到玩家附近。每颗消费 2 个 random（ox/oz）.
 *
 * Legacy 在 push 之前检查 projectiles.length >= MAX_PROJECTILES 即 break，
 * 不消费 random. 这里 spawnProjectile 内部也做该检查（返回 null 表示达上限），
 * 但 random 必须在 spawnProjectile 调用之后才消费 —— 否则达上限时会多消费 2 random
 * 破坏 parity。所以这里要让 ctx.effects 自己检查（GameInstance 已实现）。
 */
function darkRain(_boss: BossState, ctx: AiContext): void {
  for (let i = 0; i < 6; i++) {
    const ox = (Math.random() - 0.5) * 12;
    const oz = (Math.random() - 0.5) * 12;
    const id = ctx.effects.spawnProjectile({
      weaponType: 'flame_ring',
      x: ctx.player.x + ox, y: 10, z: ctx.player.z + oz,
      vx: 0, vy: -12, vz: 0,
      damage: 15,
      bouncesLeft: 0, pierceLeft: 0,
      lifetime: 2.0, radius: 1.0,
      fromPlayer: false,
    });
    if (id === null) break;  // 达 MAX_PROJECTILES, 与 legacy 一致
  }
}

/** 注册表：BossAttack tag → 函数. */
export const SKELETON_KING_ATTACKS: Record<BossAttack, (boss: BossState, ctx: AiContext) => void> = {
  melee_sweep: meleeSweep,
  ground_slam: groundSlam,
  aoe_explosion: aoeExplosion,
  dark_bolt: darkBolt,
  summon_wave: summonWave,
  charge: charge,
  dark_rain: darkRain,
  idle: () => { /* no-op */ },
};
