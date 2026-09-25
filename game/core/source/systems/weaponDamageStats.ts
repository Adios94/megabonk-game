import type { BondDamageStats, BondId, BossState, EnemyState, WeaponDamageStats, WeaponType } from '../types.ts';
import type { Engine } from './types.ts';

const DPS_WINDOW_SECONDS = 5;

type DamageWindow = { times: number[]; damages: number[]; head: number };

/** head 段攒到这么多条才触发一次 copyWithin 压实（平摊掉前移成本）。 */
const WINDOW_COMPACT_THRESHOLD = 64;

/** 取（或新建）对应武器/羁绊的滚动窗口；并行数组结构避免 per-hit 对象 alloc。 */
function getWindow(
  engine: Engine,
  key: WeaponType | `bond:${BondId}`,
): DamageWindow {
  let win = engine.weaponDamageWindows[key];
  if (!win) {
    win = { times: [], damages: [], head: 0 };
    engine.weaponDamageWindows[key] = win;
  }
  return win;
}

/**
 * 滑动窗口：推进 head 游标越过 cutoff 之前的过期条目，返回剩余 damage 总和。
 * 用游标代替每次命中 shift()（O(n) 重排 + 数组 backing 抖动）；过期前缀攒够后用
 * copyWithin 一次性前移压实（无分配），避免数组无限增长。times 按 record 顺序单调递增。
 */
function sumRecentDamage(win: DamageWindow, cutoff: number): number {
  const { times, damages } = win;
  const len = times.length;
  let head = win.head;
  while (head < len && times[head] < cutoff) head++;

  let sum = 0;
  for (let i = head; i < len; i++) sum += damages[i];

  if (head >= WINDOW_COMPACT_THRESHOLD && head * 2 > len) {
    const remaining = len - head;
    times.copyWithin(0, head);
    times.length = remaining;
    damages.copyWithin(0, head);
    damages.length = remaining;
    win.head = 0;
  } else {
    win.head = head;
  }
  return sum;
}

function getWeaponStat(engine: Engine, weaponType: WeaponType): WeaponDamageStats {
  // for 循环代替 .find(closure)：避免每次命中新建箭头闭包（密集战斗下是 GC churn 热点）。
  const stats = engine.state.weaponDamageStats;
  for (let i = 0; i < stats.length; i++) {
    if (stats[i].weaponType === weaponType) return stats[i];
  }
  const stat: WeaponDamageStats = { weaponType, killCount: 0, totalDamage: 0, dps: 0 };
  stats.push(stat);
  return stat;
}

function getBondStat(engine: Engine, bondId: BondId): BondDamageStats {
  const stats = engine.state.bondDamageStats;
  for (let i = 0; i < stats.length; i++) {
    if (stats[i].bondId === bondId) return stats[i];
  }
  const stat: BondDamageStats = { bondId, killCount: 0, totalDamage: 0, dps: 0 };
  stats.push(stat);
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
