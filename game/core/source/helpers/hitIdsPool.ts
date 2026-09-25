/**
 * `hitEnemyIds` 数组对象池。
 *
 * 投射物（ProjectileState）每次 spawn 都需要一个空 `hitEnemyIds: number[]` 用于
 * 记录已命中目标（去重 + chain 排除）。late game 武器密集发射时每秒 spawn
 * 数十次，每次新建一个空数组 = 持续 alloc 压力。池化后所有数组永久复用。
 *
 * 安全前提：
 *   - 调用方 spawn 时拿 `acquireHitIds()`，确保拿到的数组已 `.length = 0`。
 *   - 调用方 splice（销毁 projectile）前调 `releaseHitIds(proj.hitEnemyIds)`。
 *   - **不要**在投射物存活期间替换 `proj.hitEnemyIds` 引用，否则池里残留外部引用，
 *     释放时归还的是错误数组。当前代码仅在构造时赋值，符合契约。
 *
 * 容量上限：极端情况下（密集投射物 + 池一直被 acquire 不归还）池可能短期膨胀，
 * release 时若超 POOL_CAP 直接丢弃数组（让 GC 回收），保证最坏情况内存有界。
 *
 * 注：AreaEffect 也有可选 `hitEnemyIds?: number[]`，但生命周期 / 长度（涟漪几百上千）
 * 都与 projectile 不同，本池不覆盖那种用法。
 */

const pool: number[][] = [];
const POOL_CAP = 256;

/** 从池里取一个干净（已清空）的数组；没有则新建。 */
export function acquireHitIds(): number[] {
  const arr = pool.pop();
  if (arr) {
    arr.length = 0;
    return arr;
  }
  return [];
}

/** 把数组归还池中。超过 cap 则丢弃。 */
export function releaseHitIds(arr: number[] | undefined | null): void {
  if (!arr) return;
  if (pool.length >= POOL_CAP) return;
  arr.length = 0;
  pool.push(arr);
}
