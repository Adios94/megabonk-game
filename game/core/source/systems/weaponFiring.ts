/**
 * 武器开火 ECS 路径调度。
 *
 * Phase 2: 仅作为 GameInstance.fireWeapons 内的 dispatch 助手 ——
 *   对单个武器尝试走 ECS 路径（数据查 WEAPONS → 行为查 BEHAVIORS → 调用）。
 *   返回 true 表示已处理；false 表示武器不在 ECS 注册表，调用方应走旧 switch。
 *
 * Phase 3: 武器全部迁移后，本函数升级为系统主循环（每帧扣 cooldown + 派发），
 *   GameInstance.fireWeapons 退化为薄 facade。
 */
import { WEAPONS } from '../data/weapons.ts';
import { BEHAVIORS } from '../behaviors/index.ts';
import type { BehaviorEffects } from '../behaviors/types.ts';
import type { GameWorld } from '../world.ts';
import type { PlayerState, EnemyState, BossState, WeaponState } from '../types.ts';
import type { WeaponLevelStats } from '../config.ts';

export function tryFireWeaponEcs(
  world: GameWorld,
  weapon: WeaponState,
  stats: WeaponLevelStats,
  player: PlayerState,
  enemies: EnemyState[],
  boss: BossState | null,
  effects: BehaviorEffects,
): boolean {
  const def = WEAPONS[weapon.type];
  if (!def) return false;
  const fn = BEHAVIORS[def.behavior];
  if (!fn) return false;
  fn(world, { player, enemies, boss, weapon, def, stats, effects });
  return true;
}
