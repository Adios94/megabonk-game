import type { BondDamageStats, BondId, BossState, EnemyState, WeaponDamageStats, WeaponType } from '../types.ts';
import type { Engine } from './types.ts';

const DPS_WINDOW_SECONDS = 5;

type DamageWindow = { times: number[]; damages: number[] };

/** 取（或新建）对应武器/羁绊的滚动窗口；并行数组结构避免 per-hit 对象 alloc。 */
function getWindow(
  engine: Engine,
  key: WeaponType | `bond:${BondId}`,
): DamageWindow {
  let win = engine.weaponDamageWindows[key];
  if (!win) {
    win = { times: [], damages: [] };
    engine.weaponDamageWindows[key] = win;
  }
  return win;
}

/** 滑动窗口：丢弃 cutoff 之前的条目并返回剩余 damage 总和。 */
function sumRecentDamage(win: DamageWindow, cutoff: number): number {
  const { times, damages } = win;
  // 清掉过期 head 段；times 单调递增（按 record 顺序写入）。
  // shift() O(n)，但窗口长度小（5s × 命中频率，几十到几百），可接受。
  while (times.length > 0 && times[0] < cutoff) {
    times.shift();
    damages.shift();
  }
  let sum = 0;
  for (let i = 0; i < damages.length; i++) sum += damages[i];
  return sum;
}

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
  const cutoff = engine.state.gameTime - DPS_WINDOW_SECONDS;
  const win = engine.weaponDamageWindows[weaponType];
  if (!win) {
    getWeaponStat(engine, weaponType).dps = 0;
    return;
  }
  getWeaponStat(engine, weaponType).dps = sumRecentDamage(win, cutoff) / DPS_WINDOW_SECONDS;
}

function refreshBondDps(engine: Engine, bondId: BondId): void {
  const cutoff = engine.state.gameTime - DPS_WINDOW_SECONDS;
  const win = engine.weaponDamageWindows[`bond:${bondId}` as const];
  if (!win) {
    getBondStat(engine, bondId).dps = 0;
    return;
  }
  getBondStat(engine, bondId).dps = sumRecentDamage(win, cutoff) / DPS_WINDOW_SECONDS;
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

  const win = getWindow(engine, weaponType);
  win.times.push(engine.state.gameTime);
  win.damages.push(damage);
  refreshWeaponDps(engine, weaponType);

  if (target) {
    target.hitFlashWeaponType = weaponType;
    target.hitFlashColor = undefined;
  }
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

  const win = getWindow(engine, `bond:${bondId}` as const);
  win.times.push(engine.state.gameTime);
  win.damages.push(damage);
  refreshBondDps(engine, bondId);

  if (target && creditWeaponType) {
    target.hitFlashWeaponType = creditWeaponType;
    target.hitFlashColor = undefined;
  }
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
