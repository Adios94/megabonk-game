/**
 * 通用对象池 + 命中率统计（“方法 C”验证用）。
 *
 * 背景：late game 高击杀率下，Pickup / GoldMote / Consumable / EnemyState 等实体
 * 每死一只就 `push({...})` 新建、移除时丢弃 → 这条 churn 流是后期频繁 Major GC 的
 * 主要来源。池化后对象壳被永久复用，分配速率趋近 0。
 *
 * 与 `hitIdsPool.ts` 同款思路（模块级 free-list + cap），但封装成类以复用到多个实体，
 * 并内置 created / reused 计数，便于“方法 C”自证 garbage 是否被掐断。
 *
 * 安全契约（调用方负责）：
 *   - acquire() 拿到的对象**字段值是脏的**（来自上一个被释放的对象）。调用方必须在
 *     使用前**覆盖全部字段**；带 optional 字段的类型还需把未用到的 optional 显式重置。
 *   - 每个对象只能 release 一次，且 release 前必须已从所有 live 数组中移除，
 *     否则会出现“同一对象同时在 free-list 和 live 数组”→ 二次 acquire 串引用的 bug。
 *
 * 容量上限：free-list 只增不减、上限 cap；超出后 release 直接丢弃（让 GC 回收），
 * 保证最坏内存有界。
 *
 * 统计读取（dev / 真机远程 console）：`__POOL_STATS__()` 返回各池的
 * { created, reused, free, hitRate } 快照。release 构建零额外开销（仅整型自增）。
 */

export interface ObjectPoolSnapshot {
  /** 新建（pool miss）累计次数。 */
  created: number;
  /** 复用（pool hit）累计次数。 */
  reused: number;
  /** 当前 free-list 长度。 */
  free: number;
  /** 命中率 reused / (created + reused)，0..1。预热后应趋近 1。 */
  hitRate: number;
}

const REGISTRY = new Map<string, ObjectPool<unknown>>();

export class ObjectPool<T> {
  private readonly free: T[] = [];
  private readonly make: () => T;
  private readonly cap: number;
  private created = 0;
  private reused = 0;

  constructor(name: string, make: () => T, cap = 1024) {
    this.make = make;
    this.cap = cap;
    REGISTRY.set(name, this as unknown as ObjectPool<unknown>);
  }

  /** 取一个对象壳；字段是脏的，调用方必须覆盖全部字段后再用。 */
  acquire(): T {
    const obj = this.free.pop();
    if (obj !== undefined) {
      this.reused++;
      return obj;
    }
    this.created++;
    return this.make();
  }

  /** 归还对象壳；超过 cap 直接丢弃。调用方须保证对象已脱离所有 live 数组。 */
  release(obj: T): void {
    if (this.free.length < this.cap) this.free.push(obj);
  }

  snapshot(): ObjectPoolSnapshot {
    const total = this.created + this.reused;
    return {
      created: this.created,
      reused: this.reused,
      free: this.free.length,
      hitRate: total === 0 ? 0 : this.reused / total,
    };
  }
}

/** 全部已注册池的统计快照（按名字）。 */
export function poolStatsSnapshot(): Record<string, ObjectPoolSnapshot> {
  const out: Record<string, ObjectPoolSnapshot> = {};
  for (const [name, pool] of REGISTRY) out[name] = pool.snapshot();
  return out;
}

// 真机/远程 console 自证用：随时 `__POOL_STATS__()` 看命中率。
// 仅挂一个读取函数，不引入任何每帧开销；非浏览器环境（测试/SSR）静默跳过。
if (typeof globalThis !== 'undefined') {
  (globalThis as unknown as { __POOL_STATS__?: () => Record<string, ObjectPoolSnapshot> }).__POOL_STATS__ =
    poolStatsSnapshot;
}
