/**
 * 暂停界面左右侧栏（背包 / 属性）。
 *
 * 布局：标题为独立表头，相对内容横向居中，置于侧栏顶部；
 *       内容紧贴标题下方（仅留一点点间距）。标题与内容不再合并为同一框体。
 */
import { uiPlainText } from './textStyle.ts';
import { uiPx } from './scale.ts';

export const PAUSE_DATA_PANEL_BG = '/ui/panel/svg/panel_pause_data.svg';

/** panel_pause_data.svg 原图尺寸（仅用于推导侧栏设计宽） */
export const PAUSE_DATA_PANEL_SIZE = { w: 231, h: 311 } as const;

/** 内容区左右内缩（SVG 边距 4.5 / 231） */
const CONTENT_INSET_X_RATIO = 4.5 / PAUSE_DATA_PANEL_SIZE.w;

/** 暂停侧栏设计宽（对齐 SVG 231px 宽，经 uiPx 缩放） */
export const PAUSE_SIDE_PANEL_WIDTH = uiPx(PAUSE_DATA_PANEL_SIZE.w);

export interface PauseDataPanelParts {
  panel: HTMLDivElement;
  titleEl: HTMLDivElement;
  content: HTMLDivElement;
}

export function createPauseDataPanel(title: string, titleColor?: string): PauseDataPanelParts {
  const contentPadX = `${(CONTENT_INSET_X_RATIO * 100).toFixed(2)}%`;

  const panel = document.createElement('div');
  panel.style.cssText = `
    position:relative;width:100%;box-sizing:border-box;
    display:flex;flex-direction:column;align-items:stretch;
  `;

  const titleEl = document.createElement('div');
  titleEl.style.cssText = uiPlainText(
    `flex:0 0 auto;width:100%;text-align:center;font-size:clamp(${uiPx(12)}px,3.2vmin,${uiPx(16)}px);font-weight:bold;line-height:1.1;margin:0 0 clamp(4px,1.2vmin,7px);${titleColor ? `color:${titleColor};` : ''}`,
  );
  titleEl.textContent = title;

  const content = document.createElement('div');
  content.style.cssText = `
    flex:1 1 auto;display:flex;flex-direction:column;
    padding:0 ${contentPadX};
    box-sizing:border-box;gap:clamp(4px,1vh,7px);width:100%;
  `;

  panel.appendChild(titleEl);
  panel.appendChild(content);

  return { panel, titleEl, content };
}
