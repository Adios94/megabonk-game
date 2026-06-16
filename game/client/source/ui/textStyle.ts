/** 局内普通文案：白字 + 8 向黑描边（像素风） */

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



/** 描边 + 像素字体 side bearing 留白，避免 overflow:hidden 裁切左侧 */

export const UI_TEXT_OUTLINE_GUTTER = 'padding-inline:3px;box-sizing:border-box;';



/**
 * 全局轻量加粗：用同色 text-stroke 模拟 ~0.4px 的字重增加。
 * 之所以不直接调 font-weight：Lilita One 只有 400 一档，单调 weight 只能让中文/像素字体变粗，
 * 英文不动会显得脱节。text-stroke 对所有字体一视同仁。
 */
export const UI_TEXT_FAUX_BOLD = '-webkit-text-stroke:0.4px currentColor;text-stroke:0.4px currentColor;paint-order:stroke fill;';



export const UI_PLAIN_TEXT_COLOR = '#ffffff';



/**
 * 统一字体族：英文/数字优先 Lilita One，中文优先 Noto Sans SC，
 * 兜底为 MegaBonk UI（zlabs pixel + zlabs-roundpix-m-cn）→ Arial → sans-serif。
 * 与 game/client/source/index.ts 的 UI_FONT_FACE 保持一致。
 */
export const UI_FONT_FAMILY = '"Lilita One","Noto Sans SC","MegaBonk UI",Arial,sans-serif';



export function uiPlainText(extraCss = ''): string {

  const base = `color:${UI_PLAIN_TEXT_COLOR};font-family:${UI_FONT_FAMILY};text-shadow:${UI_TEXT_OUTLINE_SHADOW};${UI_TEXT_FAUX_BOLD}${UI_TEXT_OUTLINE_GUTTER}`;

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

