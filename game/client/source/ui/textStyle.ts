/** 局内普通文案：白字 + 8 向黑描边（卡通描边风） */

export const UI_TEXT_OUTLINE_SHADOW = [

  '-1px -1px 0 #000',

  '1px -1px 0 #000',

  '-1px 1px 0 #000',

  '1px 1px 0 #000',

  '0 -1px 0 #000',

  '0 1px 0 #000',

  '-1px 0 0 #000',

  '1px 0 0 #000',

].join(',');

/**
 * 加粗版 2px 描边，用于大字号标题/横幅（≥ 18px）。
 * 1px 描边在 14px+ 字体上视觉过细，2px 才是"卡通丝带 logo"该有的厚度。
 * 小字号（<14px）继续用 UI_TEXT_OUTLINE_SHADOW，否则会糊边。
 *
 * 用 16 向盖章（5×5 圆盘，所有 |dx|≤2 ∧ |dy|≤2 ∧ (dx,dy)≠(0,0) 的整数偏移），
 * 而不是常见的 8 向（仅正交 + 45°）。原因：8 向只覆盖 (±2,0)/(0,±2)/(±2,±2)
 * 8 个偏移，(±2,±1) 与 (±1,±2) 这 8 个"中间方向"会留下空缺 → 描边边缘呈
 * 星芒/毛刺状。补满 16 向后描边轮廓是平滑圆角，毛刺消失。
 *
 * 只保留黑色描边，不叠底部投影。
 */
export const UI_TEXT_OUTLINE_SHADOW_BOLD = [

  '-2px -2px 0 #000',

  '-1px -2px 0 #000',

  '0 -2px 0 #000',

  '1px -2px 0 #000',

  '2px -2px 0 #000',

  '-2px -1px 0 #000',

  '2px -1px 0 #000',

  '-2px 0 0 #000',

  '2px 0 0 #000',

  '-2px 1px 0 #000',

  '2px 1px 0 #000',

  '-2px 2px 0 #000',

  '-1px 2px 0 #000',

  '0 2px 0 #000',

  '1px 2px 0 #000',

  '2px 2px 0 #000',

].join(',');



/** 描边外扩 + side bearing 留白，避免 overflow:hidden 裁切左侧 */

export const UI_TEXT_OUTLINE_GUTTER = 'padding-inline:3px;box-sizing:border-box;';



/**
 * 全局轻量加粗：用同色 text-stroke 模拟 ~0.4px 的字重增加。
 * 之所以不直接调 font-weight：Lilita One 只有 400 一档，浏览器合成的假粗体会扭曲笔画，
 * 单纯调 weight 也会让中文（江城圆体固定 600w）和英文（不动）观感脱节。
 * text-stroke 对所有字体一视同仁，能保证中英文同步加粗。
 */
export const UI_TEXT_FAUX_BOLD = '-webkit-text-stroke:0.4px currentColor;text-stroke:0.4px currentColor;paint-order:stroke fill;';



export const UI_PLAIN_TEXT_COLOR = '#ffffff';



/**
 * 统一字体族：英文/数字优先 Lilita One，中文优先 Jiang Cheng Yuan Ti，最终回退到系统 Arial / sans-serif。
 * 与 game/client/source/index.ts 的 UI_FONT_FACE 保持一致。
 * 字体文件本地装载，见 installGameUIFonts()。
 */
export const UI_FONT_FAMILY = '"Lilita One","Jiang Cheng Yuan Ti",Arial,sans-serif';



export function uiPlainText(extraCss = ''): string {

  const base = `color:${UI_PLAIN_TEXT_COLOR};font-family:${UI_FONT_FAMILY};text-shadow:${UI_TEXT_OUTLINE_SHADOW};${UI_TEXT_FAUX_BOLD}${UI_TEXT_OUTLINE_GUTTER}`;

  return extraCss ? `${base};${extraCss}` : base;

}



/**
 * 大字号标题文案：白字 + 2px 8 向黑描边（"商店/任务红丝带标题"风）。
 * 用在标题、横幅、弹窗 H1 等 ≥ 18px 的字号。13px 以下请继续用 uiPlainText/Crisp。
 */
export function uiPlainTextBold(extraCss = ''): string {

  const base = `color:${UI_PLAIN_TEXT_COLOR};font-family:${UI_FONT_FAMILY};text-shadow:${UI_TEXT_OUTLINE_SHADOW_BOLD};${UI_TEXT_FAUX_BOLD}${UI_TEXT_OUTLINE_GUTTER}`;

  return extraCss ? `${base};${extraCss}` : base;

}



/** 小字号紧凑文案：省略 faux-bold stroke，避免 9–12px 字号糊边。 */
export function uiPlainTextCrisp(extraCss = ''): string {

  const base = `color:${UI_PLAIN_TEXT_COLOR};font-family:${UI_FONT_FAMILY};text-shadow:${UI_TEXT_OUTLINE_SHADOW};${UI_TEXT_OUTLINE_GUTTER}-webkit-font-smoothing:antialiased;`;

  return extraCss ? `${base};${extraCss}` : base;

}



/** 保留语义色，叠加黑描边（伤害数字、稀有度等） */

export function uiColoredText(color: string, extraShadow = ''): string {

  const shadow = extraShadow

    ? `${UI_TEXT_OUTLINE_SHADOW},${extraShadow}`

    : UI_TEXT_OUTLINE_SHADOW;

  return `color:${color};font-family:${UI_FONT_FAMILY};text-shadow:${shadow};${UI_TEXT_FAUX_BOLD}${UI_TEXT_OUTLINE_GUTTER}`;

}



/** uiColoredText 的加粗版（2px 8 向描边）。带 glow 的标题用 extraShadow 叠 glow，
 *  描边自动放在最前保证字形清晰。 */

export function uiColoredTextBold(color: string, extraShadow = ''): string {

  const shadow = extraShadow

    ? `${UI_TEXT_OUTLINE_SHADOW_BOLD},${extraShadow}`

    : UI_TEXT_OUTLINE_SHADOW_BOLD;

  return `color:${color};font-family:${UI_FONT_FAMILY};text-shadow:${shadow};${UI_TEXT_FAUX_BOLD}${UI_TEXT_OUTLINE_GUTTER}`;

}



/** 小字号紧凑语义色文案：省略 faux-bold stroke。 */
export function uiColoredTextCrisp(color: string, extraShadow = ''): string {

  const shadow = extraShadow

    ? `${UI_TEXT_OUTLINE_SHADOW},${extraShadow}`

    : UI_TEXT_OUTLINE_SHADOW;

  return `color:${color};font-family:${UI_FONT_FAMILY};text-shadow:${shadow};${UI_TEXT_OUTLINE_GUTTER}-webkit-font-smoothing:antialiased;`;

}



/** 用于 tooltip innerHTML 内联 style */

export const UI_PLAIN_TEXT_STYLE = `color:${UI_PLAIN_TEXT_COLOR};font-family:${UI_FONT_FAMILY};text-shadow:${UI_TEXT_OUTLINE_SHADOW};${UI_TEXT_FAUX_BOLD}${UI_TEXT_OUTLINE_GUTTER}`;



/** 进度条外壳：填充层单独裁剪，文字层不被 overflow 裁切 */

export const UI_BAR_FILL_CLIP = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;border-radius:inherit;';



/** 进度条文字层（叠在填充层之上） */

export const UI_BAR_TEXT_LAYER = 'position:absolute;inset:0;z-index:1;display:flex;align-items:center;justify-content:center;padding-inline:3px;box-sizing:border-box;overflow:visible;';

