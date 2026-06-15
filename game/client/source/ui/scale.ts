/** Mobile-first UI scale factor — see .cursor/skills/mobile-ui */

/** 设计基准短边（iPhone 14 竖屏逻辑像素宽）。 */
export const UI_BASE_SHORT = 390;

/**
 * 以视口短边相对设计基准的比例作为缩放因子，夹在 [0.75, 1.25]。
 * 用于无法用 CSS clamp/vw 表达的场景（如逐帧设置 px 字号的浮动文字）。
 */
export function getUiScale(): number {
  const short = Math.min(window.innerWidth, window.innerHeight);
  return Math.max(0.75, Math.min(short / UI_BASE_SHORT, 1.25));
}

/** 把设计基准 px 换算成当前视口下的 px（四舍五入）。 */
export function uiPx(base: number): number {
  return Math.round(base * getUiScale());
}
