/**
 * 游侠机甲（gunner_mech）—— 第 1 关 Boss，敏捷射手。
 *
 * 反向设计自 `enemy_2legs_gun.gltf` 的动画 clip：
 *   Idle / Walk / Run / Jump / Shoot / Attack / Death
 *
 * 攻击 → 动画映射：
 *   aimed_burst  → Shoot   三连点射（直线弹 ×3，小扇形）
 *   suppress_fire→ Shoot   暴怒散射（直线弹 ×5，大扇形，enraged 专属）
 *   melee_swipe  → Attack  近战横扫（3.5 内）
 *   leap_strike  → Jump    跳击落地小范围 AOE（4.0 内）
 *
 * 定位：血薄机动，远程压制为主，贴脸惩罚 + 跳击换位。
 */
import { distanceBetween } from '../../physics.ts';
import type { BossState } from '../../types.ts';
import type { AiContext } from '../types.ts';
import type { BossScript, BossPhaseConfig } from './types.ts';
import { fireBolt, aimAngle, scaleBossDamage } from './common.ts';

const MELEE_RANGE = 3.5;
const LEAP_RANGE = 4.0;
const BOSS_ATTACK_MAX_Y_DELTA = 2.8;

function canHitPlayerByHeight(boss: BossState, ctx: AiContext): boolean {
  return Math.abs(boss.y - ctx.player.y) <= BOSS_ATTACK_MAX_Y_DELTA;
}

/** 三连点射：朝玩家小扇形发 3 发直线弹，每发 12 dmg（speed 12）。 */
function aimedBurst(boss: BossState, ctx: AiContext): void {
  const base = aimAngle(boss, ctx);
  for (const spread of [-0.12, 0, 0.12]) {
    if (fireBolt(boss, ctx, base + spread, 12, 12) === null) break;
  }
}

/** 暴怒散射：大扇形 5 发直线弹，每发 10 dmg（speed 10）。 */
function suppressFire(boss: BossState, ctx: AiContext): void {
  const base = aimAngle(boss, ctx);
  for (const spread of [-0.3, -0.15, 0, 0.15, 0.3]) {
    if (fireBolt(boss, ctx, base + spread, 10, 10) === null) break;
  }
}

/** 近战横扫 25 dmg / 3.5 单位。 */
function meleeSwipe(boss: BossState, ctx: AiContext): void {
  const dist = distanceBetween(boss.x, boss.z, ctx.player.x, ctx.player.z);
  if (dist < MELEE_RANGE && canHitPlayerByHeight(boss, ctx)) ctx.effects.damagePlayer(scaleBossDamage(25, boss));
}

/** 跳击：落地小范围 AOE 20 dmg / 4.0 单位（Jump 动画演出换位）。 */
function leapStrike(boss: BossState, ctx: AiContext): void {
  const dist = distanceBetween(boss.x, boss.z, ctx.player.x, ctx.player.z);
  if (dist < LEAP_RANGE && canHitPlayerByHeight(boss, ctx)) ctx.effects.damagePlayer(scaleBossDamage(20, boss));
}

export const GUNNER_MECH_PHASES: readonly BossPhaseConfig[] = [
  { hpRatio: 0.3, phase: 3, attacks: ['aimed_burst', 'suppress_fire', 'leap_strike', 'melee_swipe'], speed: 5.0, enraged: true },
  { hpRatio: 0.6, phase: 2, attacks: ['aimed_burst', 'melee_swipe', 'leap_strike'],                  speed: 4.0, enraged: false },
  { hpRatio: 1.0, phase: 1, attacks: ['aimed_burst', 'melee_swipe'],                                  speed: 3.0, enraged: false },
] as const;

export const GUNNER_MECH: BossScript = {
  phases: GUNNER_MECH_PHASES,
  attacks: {
    idle: () => { /* no-op */ },
    aimed_burst: aimedBurst,
    suppress_fire: suppressFire,
    melee_swipe: meleeSwipe,
    leap_strike: leapStrike,
  },
};
