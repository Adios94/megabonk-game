/**
 * stat 修饰符。来源：武器配置 / Tome / Upgrade / 装备词条 / 临时 buff。
 *
 * `base` 不通过修饰符设置，由 `StatBlock.setBase` 直接覆盖。
 */
export type ModifierKind = 'added' | 'increased' | 'more';

export interface Modifier {
  /** 修饰符种类，对应 Stat 的三层之一 */
  kind: ModifierKind;

  /** 影响哪个 stat: 'damage' / 'attackSpeed' / 'pickupRadius' ... */
  stat: string;

  /**
   * 数值含义随 kind 而变：
   * - kind='added':     平加值（"+5" → value: 5）
   * - kind='increased': 百分比小数（"+10%" → value: 0.10）
   * - kind='more':      独立倍数（"+15% 更多" → value: 1.15）
   */
  value: number;

  /**
   * 可选标签集合。语义 = **superset AND**：
   * - 缺省 / undefined / 空：无 tag，永远生效（全局修饰符）
   * - 有 tag：query.tags 必须 superset 这里所有 tag 才生效
   *
   * 例:
   *   modifier {tags: ['fire']}        → 仅对带 'fire' tag 的攻击生效
   *   modifier {tags: ['fire','spell']} → 仅对同时带 'fire' 与 'spell' 的攻击生效
   */
  tags?: readonly string[];
}
