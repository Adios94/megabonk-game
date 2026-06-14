/**
 * axe 的「常驻刀环」行为（方案 A）。
 *
 * 设计哲学（与 flame_ring 同源 —— 持续存在的范围伤害，而非一次性弹丸）：
 * - 玩家周围**恒定**维持 projectileCount 把刀刃，等距分布，永久绕圈（lifetime 设为极大）。
 * - 伤害靠投射物的 `rehitInterval` 周期性清空命中表实现：每隔 cooldown 秒，
 *   绕圈刀刃可以重新打到同一个敌人 → 「火焰圈」式的持续 DPS，画面恒为 N 把不堆叠。
 *
 * 触发方式仍是 weaponFiring 每 cooldown 调一次，但本行为是**幂等校准**而非每次新 spawn：
 * - 现存刀刃：刷新 damage / orbitRadius / orbitSpeed / radius / pierce / lifetime / rehitInterval。
 * - 数量不足：补齐缺口（升级 projectileCount 时）。
 * - 数量超出：把多余的标记 lifetime=0，下一帧由 tickProjectiles 移除。
 * - 数量变化时：重新均匀分布所有刀刃角度，保持等距刀环。
 *
 * 注：旧 mock（无 getPlayerOrbitProjectiles）下退化为「单次 spawn 一整组」，
 * 与方案 A 之前的弹丸语义在「单次调用」层面等价，便于单元测试。
 */
import { computeWeaponDamage } from '../stats/index.ts';
import { playerProjectileY } from '../combatHeight.ts';
import type { BehaviorContext } from './types.ts';
import type { GameWorld } from '../world.ts';

const PERSIST_LIFETIME = 1e9; // 常驻：实际不会自然过期，由数量校准控制移除

export function orbitingAxe(_world: GameWorld, ctx: BehaviorContext): void {
  const { player, weapon, def, stats, effects } = ctx;
  const desired = stats.projectileCount;
  const rehitInterval = Math.max(0.1, stats.cooldown);

  const rollDamage = () =>
    computeWeaponDamage(stats.damage, player, def.tags, Math.random() < player.critChance);

  const existing = effects.getPlayerOrbitProjectiles?.(weapon.type) ?? [];
  const countChanged = existing.length !== desired;

  // 1) 收缩：把多余的标记移除（下一帧 tickProjectiles 按 lifetime<=0 splice）
  for (let i = desired; i < existing.length; i++) {
    existing[i].lifetime = 0;
  }

  // 2) 刷新保留下来的刀刃（伤害跟随面板/buff、半径速度跟随升级、寿命续命、重击间隔）
  const keep = Math.min(existing.length, desired);
  for (let i = 0; i < keep; i++) {
    const p = existing[i];
    p.damage = rollDamage();
    p.orbitRadius = stats.range;
    p.orbitSpeed = stats.speed;
    p.radius = stats.aoeRadius;
    p.pierceLeft = stats.pierce;
    p.lifetime = PERSIST_LIFETIME;
    p.rehitInterval = rehitInterval;
    if (countChanged) {
      p.orbitAngle = (i / desired) * Math.PI * 2;
    }
  }

  // 3) 扩张：补齐缺口（首次装备 / 升级 projectileCount）
  for (let i = keep; i < desired; i++) {
    const startAngle = (i / desired) * Math.PI * 2;
    const id = effects.spawnProjectile({
      weaponType: 'axe',
      x: player.x + Math.cos(startAngle) * stats.range,
      y: playerProjectileY(player),
      z: player.z + Math.sin(startAngle) * stats.range,
      vx: 0, vy: 0, vz: 0,
      damage: rollDamage(),
      bouncesLeft: 0,
      pierceLeft: stats.pierce,
      lifetime: PERSIST_LIFETIME,
      radius: stats.aoeRadius,
      fromPlayer: true,
      orbiting: true,
      orbitAngle: startAngle,
      orbitRadius: stats.range,
      orbitSpeed: stats.speed,
      rehitInterval,
      rehitTimer: rehitInterval,
    });
    if (id === null) break;
  }
}
