/**
 * StatBlock —— 单个实体（玩家 / 武器 / 敌人）的 stat 集合。
 * 持有 base 表 + 修饰符列表，提供查询入口。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * **设计取舍：不缓存（Phase 1）**
 * 7 把武器 × ~1.4Hz × O(几十 modifier) ≈ <1ms / 帧。Phase 5 升级 / Tome 接入
 * 后 modifier 数量会增长，届时 profile 显示热再加脏标记缓存。在没有数据
 * 支撑前不要加缓存——会引入"何时失效"的复杂度。
 *
 * **不暴露 removeModifier**：Phase 5 升级是 append-only + 重启清空，YAGNI。
 * 真出现"临时 buff 到期需要移除"的需求再加。
 * ─────────────────────────────────────────────────────────────────────────
 */
import type { Stat } from './Stat.ts';
import { finalize } from './Stat.ts';
import type { Modifier } from './Modifier.ts';

export class StatBlock {
  private readonly base = new Map<string, number>();
  private readonly mods: Modifier[] = [];

  /**
   * 清空 base 表与修饰符列表，以便复用同一实例（避免热路径每次 new StatBlock）。
   * 仅用于单次同步计算的 scratch 复用——不要在持有 block 引用时调用。
   */
  reset(): void {
    this.base.clear();
    this.mods.length = 0;
  }

  /** 设置某个 stat 的基础值（覆盖式：多次调用以最后一次为准）。未 setBase 的 stat → base = 0。 */
  setBase(stat: string, value: number): void {
    this.base.set(stat, value);
  }

  /** 添加一个修饰符。修饰符之间无去重 / 优先级 —— 数据驱动者负责保证语义 */
  applyModifier(m: Modifier): void {
    this.mods.push(m);
  }

  /**
   * 聚合并返回该 stat 的 4 层 Stat 对象（不 finalize）。
   * 调用方可继续 push transient `more`（如 crit）后再调 `finalize`。
   *
   * @param queryTags 攻击 / 查询附带的 tag 集合，用于 superset-AND 过滤带 tag 的修饰符
   */
  getStat(stat: string, queryTags?: readonly string[]): Stat {
    const result: Stat = {
      base: this.base.get(stat) ?? 0,
      added: 0,
      increased: 0,
      more: [],
    };
    for (const m of this.mods) {
      if (m.stat !== stat) continue;
      if (!modifierApplies(m, queryTags)) continue;
      switch (m.kind) {
        case 'added':     result.added += m.value; break;
        case 'increased': result.increased += m.value; break;
        case 'more':      result.more.push(m.value); break;
      }
    }
    return result;
  }

  /** 便利方法 = `finalize(getStat(stat, queryTags))` */
  getFinal(stat: string, queryTags?: readonly string[]): number {
    return finalize(this.getStat(stat, queryTags));
  }
}

/**
 * Tag 匹配 = superset AND
 * - modifier 无 tag → 永远生效
 * - modifier 有 tag → queryTags 必须包含 modifier.tags 全部
 */
function modifierApplies(m: Modifier, queryTags?: readonly string[]): boolean {
  if (!m.tags || m.tags.length === 0) return true;
  if (!queryTags || queryTags.length === 0) return false;
  for (const t of m.tags) {
    if (!queryTags.includes(t)) return false;
  }
  return true;
}
