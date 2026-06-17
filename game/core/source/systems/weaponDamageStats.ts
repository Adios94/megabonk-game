import type { BondDamageStats, BondId, BossState, EnemyState, WeaponDamageStats, WeaponType } from '../types.ts';
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

function getBondStat(engine: Engine, bondId: BondId): BondDamageStats {
  let stat = engine.state.bondDamageStats.find(s => s.bondId === bondId);
  if (!stat) {
    stat = { bondId, killCount: 0, totalDamage: 0, dps: 0 };
    engine.state.bondDamageStats.push(stat);
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

function refreshBondDps(engine: Engine, bondId: BondId): void {
  const now = engine.state.gameTime;
  const cutoff = now - DPS_WINDOW_SECONDS;
  const key = `bond:${bondId}` as const;
  const window = engine.weaponDamageWindows[key] ?? [];
  while (window.length > 0 && window[0].time < cutoff) window.shift();

  const recentDamage = window.reduce((sum, entry) => sum + entry.damage, 0);
  getBondStat(engine, bondId).dps = recentDamage / DPS_WINDOW_SECONDS;
}

function applyLifesteal(engine: Engine, damage: number): void {
  const player = engine.state.player;
  const pct = player.lifestealPct ?? 0;
  if (pct <= 0 || player.hp >= player.maxHp || !player.alive) return;
  player.hp = Math.min(player.maxHp, player.hp + damage * pct);
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
  applyLifesteal(engine, damage);

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

export function recordBondDamage(
  engine: Engine,
  bondId: BondId,
  damage: number,
  target?: EnemyState | BossState | null,
  creditWeaponType?: WeaponType,
): void {
  if (damage <= 0 || !Number.isFinite(damage)) return;

  engine.state.stats.damageDealt += damage;
  const stat = getBondStat(engine, bondId);
  stat.totalDamage += damage;
  applyLifesteal(engine, damage);

  const key = `bond:${bondId}` as const;
  const window = engine.weaponDamageWindows[key] ?? [];
  window.push({ time: engine.state.gameTime, damage });
  engine.weaponDamageWindows[key] = window;
  refreshBondDps(engine, bondId);

  if (target && 'type' in target) {
    target.lastHitBondId = bondId;
    if (creditWeaponType) target.lastHitWeaponType = creditWeaponType;
  }
}

export function recordBondKill(engine: Engine, bondId: BondId): void {
  getBondStat(engine, bondId).killCount++;
}

export function refreshAllWeaponDps(engine: Engine): void {
  for (const stat of engine.state.weaponDamageStats) {
    refreshWeaponDps(engine, stat.weaponType);
  }
  for (const stat of engine.state.bondDamageStats) {
    refreshBondDps(engine, stat.bondId);
  }
}
