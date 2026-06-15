/**
 * 暂停界面左右侧栏（背包 / 属性）背景框。
 *
 * 视觉来源：public/ui/panel/svg/panel_pause_data.svg（231×311）
 *   - 顶部深色条（40.25 / 311 ≈ 12.94% 高）：主标题
 *   - 下方浅色框：分组内容 / 属性行
 *
 * 框图 background-size:100% 100% 随面板横纵拉伸，ResizeObserver 同步标题条高度与 SVG 分界。
 */
import { uiPlainText } from './textStyle.ts';
import { uiPx } from './scale.ts';

export const PAUSE_DATA_PANEL_BG = '/ui/panel/svg/panel_pause_data.svg';

/** panel_pause_data.svg 原图尺寸 */
export const PAUSE_DATA_PANEL_SIZE = { w: 231, h: 311 } as const;

/** 深色标题条底边 y（SVG 坐标，相对 viewBox 高度 311） */
const TITLE_BAR_BOTTOM_Y = 40.25;

/** 深色标题条占整面板高度比例 */
const TITLE_BAR_RATIO = TITLE_BAR_BOTTOM_Y / PAUSE_DATA_PANEL_SIZE.h;

/** 内容区左右内缩（SVG 边距 4.5 / 231） */
const CONTENT_INSET_X_RATIO = 4.5 / PAUSE_DATA_PANEL_SIZE.w;

/** 暂停侧栏设计宽（对齐 SVG 231px 宽，经 uiPx 缩放） */
export const PAUSE_SIDE_PANEL_WIDTH = uiPx(PAUSE_DATA_PANEL_SIZE.w);

export interface PauseDataPanelParts {
  panel: HTMLDivElement;
  titleEl: HTMLDivElement;
  content: HTMLDivElement;
}

function bindPausePanelTitleBarSync(panel: HTMLDivElement, titleBar: HTMLDivElement, content: HTMLDivElement): void {
  const minTitleH = uiPx(Math.round(TITLE_BAR_BOTTOM_Y));

  const apply = (): void => {
    const contentH = content.getBoundingClientRect().height;
    const titleH = Math.max(
      minTitleH,
      Math.round(contentH * TITLE_BAR_RATIO / (1 - TITLE_BAR_RATIO)),
    );
    titleBar.style.flex = '0 0 auto';
    titleBar.style.height = `${titleH}px`;
    titleBar.style.minHeight = `${titleH}px`;
  };

  apply();
  const ro = new ResizeObserver(apply);
  ro.observe(panel);
  ro.observe(content);

  const mo = new MutationObserver(() => {
    if (!panel.isConnected) {
      ro.disconnect();
      mo.disconnect();
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
}

export function createPauseDataPanel(title: string, titleColor?: string): PauseDataPanelParts {
  const contentPadX = `${(CONTENT_INSET_X_RATIO * 100).toFixed(2)}%`;

  const panel = document.createElement('div');
  panel.style.cssText = `
    position:relative;width:100%;box-sizing:border-box;
    background:url(${PAUSE_DATA_PANEL_BG}) center center/100% 100% no-repeat;
    display:flex;flex-direction:column;align-items:stretch;
    filter:drop-shadow(0 4px 12px rgba(0,0,0,0.55));
  `;

  const titleBar = document.createElement('div');
  titleBar.style.cssText = `
    flex:0 0 auto;min-height:${uiPx(Math.round(TITLE_BAR_BOTTOM_Y))}px;
    display:flex;align-items:center;justify-content:center;
    padding:0 ${contentPadX};box-sizing:border-box;overflow:hidden;flex-shrink:0;
  `;

  const titleEl = document.createElement('div');
  titleEl.style.cssText = uiPlainText(
    `font-size:clamp(${uiPx(12)}px,3.2vmin,${uiPx(16)}px);font-weight:bold;line-height:1.05;text-align:center;width:100%;${titleColor ? `color:${titleColor};` : ''}`,
  );
  titleEl.textContent = title;

  const content = document.createElement('div');
  content.style.cssText = `
    flex:1 1 auto;display:flex;flex-direction:column;
    padding:clamp(5px,1.4vmin,9px) ${contentPadX} clamp(9px,2vmin,13px);
    box-sizing:border-box;gap:clamp(4px,1vh,7px);width:100%;
  `;

  titleBar.appendChild(titleEl);
  panel.appendChild(titleBar);
  panel.appendChild(content);
  bindPausePanelTitleBarSync(panel, titleBar, content);

  return { panel, titleEl, content };
}
