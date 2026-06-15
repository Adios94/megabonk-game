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



export const UI_PLAIN_TEXT_COLOR = '#ffffff';



export function uiPlainText(extraCss = ''): string {

  const base = `color:${UI_PLAIN_TEXT_COLOR};text-shadow:${UI_TEXT_OUTLINE_SHADOW};${UI_TEXT_OUTLINE_GUTTER}`;

  return extraCss ? `${base};${extraCss}` : base;

}



/** 保留语义色，叠加黑描边（伤害数字、稀有度等） */

export function uiColoredText(color: string, extraShadow = ''): string {

  const shadow = extraShadow

    ? `${UI_TEXT_OUTLINE_SHADOW},${extraShadow}`

    : UI_TEXT_OUTLINE_SHADOW;

  return `color:${color};text-shadow:${shadow};${UI_TEXT_OUTLINE_GUTTER}`;

}



/** 用于 tooltip innerHTML 内联 style */

export const UI_PLAIN_TEXT_STYLE = `color:${UI_PLAIN_TEXT_COLOR};text-shadow:${UI_TEXT_OUTLINE_SHADOW};${UI_TEXT_OUTLINE_GUTTER}`;



/** 进度条外壳：填充层单独裁剪，文字层不被 overflow 裁切 */

export const UI_BAR_FILL_CLIP = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;border-radius:inherit;';



/** 进度条文字层（叠在填充层之上） */

export const UI_BAR_TEXT_LAYER = 'position:absolute;inset:0;z-index:1;display:flex;align-items:center;justify-content:center;padding-inline:3px;box-sizing:border-box;overflow:visible;';

