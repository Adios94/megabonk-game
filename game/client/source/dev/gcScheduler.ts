/**
 * GC 调度器：把 V8 Major GC 的 ~50-200ms 卡顿挪到玩家已经在看暂停面板
 * （升级 / 开宝箱 / 神龛 / 系统暂停）的时段。
 *
 * 原理：
 *  - V8 Major GC 不可切片，单次代价正比于存活节点数；游戏堆做到 80MB+ 是常态，
 *    战斗中触发就是明显卡顿。
 *  - 利用游戏天然就有"全屏暂停 UI"那几秒，主动调 window.gc() 强制走完一次
 *    Mark-Sweep。玩家阅读升级选项的时间足够 GC 跑完，主观无感。
 *
 * 启用前提：浏览器必须以 `--js-flags="--expose-gc"` 启动，否则 window.gc 不存在，
 * 本模块全 no-op。Vite dev / 普通 Chrome 不会自动开，需要：
 *   open -na "Google Chrome" --args --user-data-dir=/tmp/chrome-gc \
 *     --js-flags="--expose-gc" http://localhost:1513
 *
 * 节流：MIN_INTERVAL_MS 防止"开升级再开宝箱"这种连击两次都各跑一次（第二次基本
 * 没东西可回收，纯浪费 ~30ms）。
 */

const MIN_INTERVAL_MS = 8000;

let lastFireAt = 0;
let lastReason = '';
let fireCount = 0;
let totalGcMs = 0;
let skippedThrottle = 0;

interface WindowWithGc extends Window {
  gc?: () => void;
}

function getGc(): (() => void) | null {
  if (typeof window === 'undefined') return null;
  const w = window as WindowWithGc;
  return typeof w.gc === 'function' ? w.gc : null;
}

/**
 * 尝试触发一次 Major GC。
 * - window.gc 不可用：直接返回（不报错、不打 log）
 * - 距上次触发 < MIN_INTERVAL_MS：跳过（计入 skipped 统计）
 * - 否则：调 window.gc()，统计耗时
 *
 * @param reason 触发原因（仅用于 dev 日志，例如 'level_up' / 'chest_reward'）
 * @returns 是否真正触发了 GC
 */
export function tryScheduleGC(reason: string): boolean {
  const gc = getGc();
  if (!gc) return false;

  const now = performance.now();
  if (now - lastFireAt < MIN_INTERVAL_MS) {
    skippedThrottle++;
    return false;
  }

  lastFireAt = now;
  lastReason = reason;
  fireCount++;
  try {
    const t0 = performance.now();
    gc();
    const dt = performance.now() - t0;
    totalGcMs += dt;
    if (import.meta.env.DEV) {
      console.log(`[gc] scheduled GC at "${reason}" took ${dt.toFixed(1)}ms (#${fireCount}, total ${totalGcMs.toFixed(0)}ms)`);
    }
    return true;
  } catch {
    return false;
  }
}

export function getGcStats(): {
  available: boolean;
  fireCount: number;
  skippedThrottle: number;
  totalGcMs: number;
  lastReason: string;
  lastFireAt: number;
} {
  return {
    available: getGc() !== null,
    fireCount,
    skippedThrottle,
    totalGcMs,
    lastReason,
    lastFireAt,
  };
}
