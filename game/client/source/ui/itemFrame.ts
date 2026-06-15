/**
 * 局内「获取物品」展示框（升级 / 神殿 / 宝箱共用）。
 *
 * 视觉来源：public/ui/panel/svg/frame_item_<rarity>.svg（149×170）
 * 每个框分两段：
 *   - 顶部彩色标题条（SVG y 0~31.5 / 170 ≈ 18.5% 高）：放居中标题（白字黑描边）
 *   - 下方浅色内容区（SVG y 31.5~170）：放图标 / 描述 / 数值，footer（等级、稀有度）贴底部
 *
 * 框用 background-size:100% 100% 拉伸贴满卡片，所有内部分区用百分比高度，
 * 因此无论卡片被 flex 拉高还是按 aspect-ratio 自适应，标题条与内容区分界都自动对齐。
 */
import { uiColoredText, uiPlainText } from './textStyle.ts';

/** 框图原图尺寸（与 SVG viewBox 一致，用于 aspect-ratio）。 */
export const ITEM_FRAME_SIZE = { w: 149, h: 170 } as const;

/** 标题条底边 y 坐标（SVG 坐标系）。 */
const TITLE_BAR_BOTTOM_Y = 31.5;

export const ITEM_FRAME_RARITIES = ['common', 'uncommon', 'rare', 'legendary', 'bond'] as const;
export type ItemFrameRarity = (typeof ITEM_FRAME_RARITIES)[number];

const FRAME_SRC: Record<ItemFrameRarity, string> = {
  common: '/ui/panel/svg/frame_item_common.svg',
  uncommon: '/ui/panel/svg/frame_item_uncommon.svg',
  rare: '/ui/panel/svg/frame_item_rare.svg',
  legendary: '/ui/panel/svg/frame_item_legendary.svg',
  bond: '/ui/panel/svg/frame_item_bond.svg',
};

/** 框图 URL（也用于宝箱开箱的稀有度闪烁动画切换）。 */
export function itemFrameUrl(rarity: ItemFrameRarity): string {
  return FRAME_SRC[rarity] ?? FRAME_SRC.common;
}

const TITLE_BAR_HEIGHT = `${(TITLE_BAR_BOTTOM_Y / ITEM_FRAME_SIZE.h) * 100}%`;

export interface ItemFrameParts {
  /** 外层框，append 到卡片行；可点击时由调用方绑定 click。 */
  card: HTMLDivElement;
  /** 彩色标题条里的标题文字元素（宝箱闪烁时可改文本）。 */
  titleEl: HTMLDivElement;
  /** 浅色内容区（图标 / 描述 / 数值）。 */
  content: HTMLDivElement;
  /** 贴内容区底部的 footer（等级、稀有度说明）。 */
  footer: HTMLDivElement;
}

export interface ItemFrameOptions {
  /** 决定用哪张框图。 */
  rarity: ItemFrameRarity;
  /** 稀有度强调色（供调用方 footer 等使用；标题条已自带底色，标题用白字）。 */
  accentColor: string;
  /** 标题文案（物品名）。 */
  title: string;
  /** 卡片宽度，默认由局内奖励行均分（见 layout.inGameRewardCardWidth）。 */
  width?: string;
  /** 是否可交互（hover 缩放 + 指针手势）。 */
  interactive?: boolean;
}

export function createItemFrameCard(opts: ItemFrameOptions): ItemFrameParts {
  const { rarity, title, width = 'min(128px,24vw)', interactive = false } = opts;

  const card = document.createElement('div');
  card.style.cssText = `
    width:${width};aspect-ratio:${ITEM_FRAME_SIZE.w} / ${ITEM_FRAME_SIZE.h};box-sizing:border-box;
    background:url(${itemFrameUrl(rarity)}) center / 100% 100% no-repeat;
    display:flex;flex-direction:column;align-items:stretch;
    filter:drop-shadow(0 4px 10px rgba(0,0,0,0.5));
    ${interactive ? 'cursor:pointer;touch-action:manipulation;user-select:none;transition:transform 0.15s;' : ''}
  `;

  // 顶部彩色标题条：白字黑描边（底色已由框图着色）
  const titleBar = document.createElement('div');
  titleBar.style.cssText = `
    flex:0 0 ${TITLE_BAR_HEIGHT};min-height:0;display:flex;align-items:center;justify-content:center;
    padding:0 8%;box-sizing:border-box;overflow:hidden;
  `;
  const titleEl = document.createElement('div');
  titleEl.style.cssText = uiPlainText(
    'font-size:clamp(9px,2.4vw,12px);font-weight:bold;line-height:1.05;text-align:center;width:100%;',
  );
  titleEl.textContent = title;
  titleBar.appendChild(titleEl);

  // 浅色内容区 + footer
  const lower = document.createElement('div');
  lower.style.cssText = `
    flex:1 1 auto;min-height:0;display:flex;flex-direction:column;align-items:center;
    padding:4% 7% 5%;box-sizing:border-box;
  `;

  // 不设 min-height:0 / overflow:hidden —— 内容多时撑高卡片（框图随之拉伸），避免裁切。
  const content = document.createElement('div');
  content.style.cssText = `
    flex:1 1 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;
    gap:4px;width:100%;
  `;

  const footer = document.createElement('div');
  footer.style.cssText = `
    flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:2px;
    width:100%;margin-top:4px;
  `;

  lower.appendChild(content);
  lower.appendChild(footer);
  card.appendChild(titleBar);
  card.appendChild(lower);

  if (interactive) {
    card.addEventListener('mouseenter', () => { card.style.transform = 'scale(1.05)'; });
    card.addEventListener('mouseleave', () => { card.style.transform = 'scale(1)'; });
  }

  return { card, titleEl, content, footer };
}

/** footer 行：白字 + 黑描边（等级、说明）。 */
export function itemFramePlainLine(text: string, extraCss = ''): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = uiPlainText(`font-size:clamp(8px,2.2vw,11px);line-height:1.3;text-align:center;${extraCss}`);
  el.textContent = text;
  return el;
}

/** footer 行：稀有度色 + 黑描边（稀有度说明）。 */
export function itemFrameAccentLine(text: string, color: string, extraCss = ''): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = uiColoredText(color, '') + `font-size:clamp(8px,2.2vw,11px);font-weight:bold;letter-spacing:0.5px;line-height:1.3;text-align:center;${extraCss}`;
  el.textContent = text;
  return el;
}
