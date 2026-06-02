/**
 * 武器系统 —— fireWeapons + getWeaponStats + checkWeaponEvolutions.
 *
 * - tickWeapons: 扫 player.weapons, cooldown 到 → 调 tryFireWeaponEcs (走 ECS 武器路径)
 * - getWeaponStats: 武器等级查表 + evolved 时套 evolution multiplier
 * - checkWeaponEvolutions: 升级 / 选 tome 后调用, level 8 + 对应 tome 满足 → evolved=true, level=9
 */
import { WEAPON_STATS, WEAPON_EVOLUTIONS } from '../config.ts';
import { tryFireWeaponEcs } from './weaponFiring.ts';
import { loadSave, saveSave } from '../save.ts';
import type { WeaponState } from '../types.ts';
import type { Engine } from './types.ts';

export function tickWeapons(engine: Engine, dt: number): void {
  const player = engine.state.player;
  if (!player.alive) return;

  for (const weapon of player.weapons) {
    weapon.cooldownTimer -= dt * player.attackSpeedMultiplier;
    if (weapon.cooldownTimer <= 0) {
      const stats = getWeaponStats(weapon);
      weapon.cooldownTimer = stats.cooldown;
      tryFireWeaponEcs(
        engine.world, weapon, stats,
        player, engine.state.enemies, engine.state.boss,
        engine.effects,
      );
    }
  }
}

export function getWeaponStats(weapon: WeaponState) {
  const levelStats = WEAPON_STATS[weapon.type];
  if (!levelStats) return WEAPON_STATS['bone_bouncer'][0];
  // Evolved 用 max level stats
  const idx = Math.max(0, Math.min((weapon.evolved ? 7 : weapon.level - 1), levelStats.length - 1));
  const baseStats = levelStats[idx];

  if (weapon.evolved) {
    const evolution = WEAPON_EVOLUTIONS.find(e => e.baseWeapon === weapon.type);
    if (evolution) {
      return {
        ...baseStats,
        damage: Math.round(baseStats.damage * evolution.damageMultiplier),
        projectileCount: baseStats.projectileCount + 1,
      };
    }
  }
  return baseStats;
}

/** 升级 / 选 tome 后调，level 8 + 对应 tome 满 → 进化（写 save 统计）. */
export function checkWeaponEvolutions(engine: Engine): void {
  const player = engine.state.player;
  for (const weapon of player.weapons) {
    if (weapon.evolved) continue;
    if (weapon.level < 8) continue;

    const evolution = WEAPON_EVOLUTIONS.find(e => e.baseWeapon === weapon.type);
    if (!evolution) continue;

    const tome = player.tomes.find(t => t.type === evolution.requiredTome);
    if (!tome || tome.level < evolution.requiredTomeLevel) continue;

    weapon.evolved = true;
    weapon.level = 9;

    const save = loadSave();
    save.stats.totalEvolutions += 1;
    saveSave(save);
  }
}
