import type { BossState, EnemyState, WeaponDamageStats, WeaponType } from '../types.ts';
import type { Engine } from './types.ts';

const DPS_WINDOW_SECONDS = 5;

function getWeaponStat(engine: Engine, weaponType: WeaponType): WeaponDamageStats {
  let stat = engine.state.weaponDamageStats.find(s => s.weaponType === weaponType);
  if (!stat) {
    stat = { weaponType, killCount: 0, totalDamage: 0, dps: 0 };
    engine.state.weaponDamageStats.push(stat);
  }
  return stat;
}

function refreshWeaponDps(engine: Engine, weaponType: WeaponType): void {
  const now = engine.state.gameTime;
  const cutoff = now - DPS_WINDOW_SECONDS;
  const window = engine.weaponDamageWindows[weaponType] ?? [];
  while (window.length > 0 && window[0].time < cutoff) window.shift();

  const recentDamage = window.reduce((sum, entry) => sum + entry.damage, 0);
  getWeaponStat(engine, weaponType).dps = recentDamage / DPS_WINDOW_SECONDS;
}

export function recordWeaponDamage(
  engine: Engine,
  weaponType: WeaponType,
  damage: number,
  target?: EnemyState | BossState | null,
): void {
  if (damage <= 0 || !Number.isFinite(damage)) return;

  engine.state.stats.damageDealt += damage;
  const stat = getWeaponStat(engine, weaponType);
  stat.totalDamage += damage;

  const window = engine.weaponDamageWindows[weaponType] ?? [];
  window.push({ time: engine.state.gameTime, damage });
  engine.weaponDamageWindows[weaponType] = window;
  refreshWeaponDps(engine, weaponType);

  if (target && 'type' in target) {
    target.lastHitWeaponType = weaponType;
  }
}

export function recordWeaponKill(engine: Engine, weaponType: WeaponType): void {
  getWeaponStat(engine, weaponType).killCount++;
}

export function refreshAllWeaponDps(engine: Engine): void {
  for (const stat of engine.state.weaponDamageStats) {
    refreshWeaponDps(engine, stat.weaponType);
  }
}
