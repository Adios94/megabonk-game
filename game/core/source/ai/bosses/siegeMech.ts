/**
 * 攻城机甲（siege_mech）—— 第 2 关 Boss，重装炮手。
 *
 * 反向设计自 `enemy_large_gun.gltf` 的动画 clip：
 *   Idle / Walk / Run / Jump / Shoot / Attack / Attack.001 / Death
 *
 * 攻击 → 动画映射：
 *   barrage       → Shoot       炮击：6 发天降弹散布玩家附近
 *   heavy_slam    → Attack      近战重砸（5.0 内）
 *   cleave        → Attack.001  横扫 AOE（7.0 内，第二套近战 clip）
 *   leap_slam     → Jump        跳起砸地冲击波（6.0 内）
 *   charge        → Run         暴怒冲撞（speed 12）
 *   deploy_drones → Shoot       部署飞行无人机（gargoyle）
 *
 * 定位：慢、肉、范围大，强迫玩家持续走位躲炮击与冲击波。
 */
import { distanceBetween } from '../../physics.ts';
import { AOE_MAX_Y_DELTA, MAX_ENEMIES } from '../../config.ts';
import { ENEMIES } from '../../data/enemies.ts';
import type { BossState } from '../../types.ts';
import type { AiContext } from '../types.ts';
import type { BossScript, BossPhaseConfig } from './types.ts';

const HEAVY_SLAM_RANGE = 5.0;
const CLEAVE_RANGE = 7.0;
const LEAP_SLAM_RANGE = 6.0;

/** 炮击：6 发投射物从天而降落到玩家附近，每发 15 dmg（每发消费 2 个 random：ox/oz）。 */
function barrage(_boss: BossState, ctx: AiContext): void {
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
      fromBoss: true,
    });
    if (id === null) break;  // 达 MAX_PROJECTILES
  }
}

/** 近战重砸 35 dmg / 5.0 单位。 */
function heavySlam(boss: BossState, ctx: AiContext): void {
  const dist = distanceBetween(boss.x, boss.z, ctx.player.x, ctx.player.z);
  if (dist < HEAVY_SLAM_RANGE) ctx.effects.damagePlayer(35);
}

/** 横扫 AOE 40 dmg / 7.0 单位（含 Y 差限制，避免跨层命中）。 */
function cleave(boss: BossState, ctx: AiContext): void {
  const dist = distanceBetween(boss.x, boss.z, ctx.player.x, ctx.player.z);
  if (dist < CLEAVE_RANGE && Math.abs(boss.y - ctx.player.y) <= AOE_MAX_Y_DELTA) {
    ctx.effects.damagePlayer(40);
  }
}

/** 跳砸：落地冲击波 35 dmg / 6.0 单位（Jump 动画）。 */
function leapSlam(boss: BossState, ctx: AiContext): void {
  const dist = distanceBetween(boss.x, boss.z, ctx.player.x, ctx.player.z);
  if (dist < LEAP_SLAM_RANGE) ctx.effects.damagePlayer(35);
}

/** 冲撞 —— 仅设 boss.speed=12，下一帧移动逻辑高速冲玩家（phase 检查每帧复位 speed，故为单帧冲刺）。 */
function charge(boss: BossState, _ctx: AiContext): void {
  boss.speed = 12.0;
}

/** 部署无人机：phase 3 召 8 只，否则 4 只飞行 gargoyle（bossSummon 模式，每只消费 1 random）。 */
function deployDrones(boss: BossState, ctx: AiContext): void {
  const count = boss.phase === 3 ? 8 : 4;
  const droneType = 'gargoyle';
  if (!ENEMIES[droneType]) return;

  for (let i = 0; i < count; i++) {
    if (ctx.enemies.length >= MAX_ENEMIES) break;
    const angle = (i / count) * Math.PI * 2;
    const spawnDist = 5;
    ctx.effects.spawnEnemyByType(
      droneType,
      boss.x + Math.cos(angle) * spawnDist,
      boss.z + Math.sin(angle) * spawnDist,
      { mode: 'bossSummon' },
    );
  }
}

export const SIEGE_MECH_PHASES: readonly BossPhaseConfig[] = [
  { hpRatio: 0.3, phase: 3, attacks: ['cleave', 'barrage', 'leap_slam', 'charge', 'deploy_drones'], speed: 5.0, enraged: true },
  { hpRatio: 0.6, phase: 2, attacks: ['heavy_slam', 'cleave', 'barrage', 'deploy_drones'],          speed: 4.0, enraged: false },
  { hpRatio: 1.0, phase: 1, attacks: ['heavy_slam', 'barrage', 'cleave'],                            speed: 3.0, enraged: false },
] as const;

export const SIEGE_MECH: BossScript = {
  phases: SIEGE_MECH_PHASES,
  attacks: {
    idle: () => { /* no-op */ },
    barrage,
    heavy_slam: heavySlam,
    cleave,
    leap_slam: leapSlam,
    charge,
    deploy_drones: deployDrones,
  },
};
