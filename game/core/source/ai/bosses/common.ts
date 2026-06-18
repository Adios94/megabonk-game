/**
 * Boss 通用工具 —— phase 解析 / 攻击选择 / 近战伤害 / 投射物发射帮手。
 *
 * 两套机甲（gunnerMech / siegeMech）共用这些纯函数；各自只提供 phases + attacks。
 */
import type { BossState, BossAttack } from '../../types.ts';
import type { AiContext } from '../types.ts';
import type { BossPhaseConfig } from './types.ts';

export const BOSS_DAMAGE_MULTIPLIER = 1.2;

export function scaleBossDamage(damage: number, boss?: Pick<BossState, 'damageMultiplier'>): number {
  return Math.max(1, Math.round(damage * BOSS_DAMAGE_MULTIPLIER * (boss?.damageMultiplier ?? 1)));
}

/** 根据 hp/maxHp 比例在给定 phases 表里查找当前 phase 配置。 */
export function resolvePhase(boss: BossState, phases: readonly BossPhaseConfig[]): BossPhaseConfig {
  const ratio = boss.hp / boss.maxHp;
  for (const cfg of phases) {
    if (ratio <= cfg.hpRatio) return cfg;
  }
  // 不可达（最后一个 hpRatio=1.0 兜底），保险返回最后一个
  return phases[phases.length - 1];
}

/** 从当前 phase 的 attack pool 里随机选一个（消费 1 个 Math.random）。 */
export function chooseAttack(cfg: BossPhaseConfig): BossAttack {
  const pool = cfg.attacks;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Boss 近战伤害（player 撞 boss 时）。phase 越高越疼。
 * 由 processCollisions 调用（不在 attack switch 里），两套机甲共用。
 */
export function getBossMeleeDamage(boss: BossState): number {
  let damage: number;
  switch (boss.phase) {
    case 1: damage = 20; break;
    case 2: damage = 30; break;
    case 3: damage = 40; break;
    default: damage = 20; break;
  }
  return scaleBossDamage(damage, boss);
}

/**
 * 发射一发朝指定世界角度的直线弹（boss 远程攻击通用）。
 *
 * @param angle  atan2(dx, dz) 风格角度（与 normalizeDirection 同坐标系：vx=sin, vz=cos）
 * @returns spawnProjectile 的返回（达 MAX_PROJECTILES 时为 null）
 */
export function fireBolt(
  boss: BossState,
  ctx: AiContext,
  angle: number,
  speed: number,
  damage: number,
): number | null {
  return ctx.effects.spawnProjectile({
    weaponType: 'flame_ring',
    x: boss.x,
    y: boss.y + 1.0,
    z: boss.z,
    vx: Math.sin(angle) * speed,
    vy: 0,
    vz: Math.cos(angle) * speed,
    damage: scaleBossDamage(damage, boss),
    bouncesLeft: 0,
    pierceLeft: 0,
    lifetime: 4.0,
    radius: 0.5,
    fromPlayer: false,
    fromBoss: true,
  });
}

/** 玩家相对 boss 的瞄准角度（atan2(dx, dz)）。 */
export function aimAngle(boss: BossState, ctx: AiContext): number {
  return Math.atan2(ctx.player.x - boss.x, ctx.player.z - boss.z);
}
