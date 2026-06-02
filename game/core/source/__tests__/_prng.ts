/**
 * Mulberry32 seeded PRNG —— 测试专用。
 *
 * 用法：`vi.spyOn(Math, 'random').mockImplementation(mulberry32(42))` 喂同一 seed
 * 给两条路径，random 序列完全确定，parity 对比无随机噪音。
 *
 * 性能 ~10ns/call, 不在 hot path（仅测试）。
 *
 * 算法来源：https://github.com/bryc/code/blob/master/jshash/PRNGs.md#mulberry32
 */
export function mulberry32(seed: number): () => number {
  let state = seed;
  return function (): number {
    state = (state + 0x6D2B79F5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
