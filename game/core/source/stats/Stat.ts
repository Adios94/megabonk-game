/**
 * PoE 风格四层 stat 模型。
 *
 * 公式: `(base + added) × (1 + Σincreased) × Π(more)`
 *
 * - `base`      基础值，由 `StatBlock.setBase` 直接写入
 * - `added`     平加修饰符之和（"+5 伤害"）
 * - `increased` 累加百分比之和（多个 increased 同桶相加，"+10%" + "+20%" → 0.30）
 * - `more`      独立倍数列表（每个 more 独立相乘，"+15% 更多" → 1.15 push 进数组）
 */
export interface Stat {
  base: number;
  added: number;
  increased: number;
  more: number[];
}

/**
 * Stat → 最终数值。纯函数：同输入永远同输出，无副作用、无随机。
 */
export function finalize(s: Stat): number {
  return (s.base + s.added) * (1 + s.increased) * s.more.reduce((acc, m) => acc * m, 1);
}
