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
import { uiColoredText, uiColoredTextCrisp, uiPlainText, uiPlainTextCrisp } from './textStyle.ts';

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

// ============================================================================
// 升级卡片专用框（局内 level-up 面板）
// ----------------------------------------------------------------------------
// 视觉来源：public/ui/panel/svg/frame_upgrade_<rarity>.svg（viewBox 1897×2642）
// 与 frame_item_*.svg 不同的地方：
//   - 顶部 banner 是独立色块带，下沿有黑色 divider
//   - 底部多了一个稀有度 tab，向下凸出于卡身
//   - 中部预留区域里 SVG 自带一个内嵌槽（y=1309~2073），用于放数值面板
// 三个区段按 SVG 锚点对齐（百分比对应 viewBox 的 y 坐标）：
//   banner 区 0%~14.04%   （SVG y 0~371，含 divider；色带可视 y 25~346）
//   主体区 14.04%~86.64%  （SVG y 371~2289，内嵌槽位于其中 y 1309~2073）
//   稀有度 tab 区 86.64%~100%（SVG y 2289~2642，tab 外层 2289~2585）
// ============================================================================

/** 升级卡 SVG viewBox 尺寸（用于 aspect-ratio）。 */
export const UPGRADE_FRAME_SIZE = { w: 1897, h: 2642 } as const;

const UPGRADE_FRAME_SRC: Record<ItemFrameRarity, string> = {
  common: '/ui/panel/svg/frame_upgrade_common.svg',
  uncommon: '/ui/panel/svg/frame_upgrade_uncommon.svg',
  rare: '/ui/panel/svg/frame_upgrade_rare.svg',
  legendary: '/ui/panel/svg/frame_upgrade_legendary.svg',
  bond: '/ui/panel/svg/frame_upgrade_bond.svg',
};

const UPGRADE_TITLE_BAR_PCT = `${(371 / UPGRADE_FRAME_SIZE.h) * 100}%`; // 14.04% — banner 区（含 divider）
const UPGRADE_RARITY_BAR_PCT = `${((2642 - 2289) / UPGRADE_FRAME_SIZE.h) * 100}%`; // 13.36% — tab 区

export interface UpgradeFrameOptions {
  rarity: ItemFrameRarity;
  /** 数值面板边框 / 等级行强调色。 */
  accentColor: string;
  /** 物品名（顶部 banner）。 */
  title: string;
  /** 卡片宽度。 */
  width?: string;
  interactive?: boolean;
  /**
   * 标题在 banner 内的垂直偏移（增大→标题更靠下）。
   * 默认 '4px'：新 SVG banner 容器与可视色带几乎居中对齐，只需微调。
   */
  titlePaddingTop?: string;
  /**
   * 稀有度文字在 tab 内的垂直偏移（增大→文字更靠上）。
   * 默认 '4px'：新 SVG tab 中心略高于容器中心，向上推一点点。
   */
  rarityPaddingBottom?: string;
  /**
   * 等级行 margin-top（负值→等级行往上贴近数值面板）。默认 '-2px'。
   */
  levelMarginTop?: string;
}

export interface UpgradeFrameParts {
  /** 外层框，append 到卡片行；可点击时由调用方绑定 click。 */
  card: HTMLDivElement;
  /** 顶部 banner 里的物品名。 */
  titleEl: HTMLDivElement;
  /** 图标槽（appendChild 一个 div / img / emoji 即可）。 */
  iconSlot: HTMLDivElement;
  /** 描述行。 */
  descEl: HTMLDivElement;
  /** 内嵌数值面板（带稀有度色边框，调用方 appendChild 每行）。 */
  statsBox: HTMLDivElement;
  /** 等级行（"等级 1 → 2"）；位于数值面板下方、稀有度 tab 上方。 */
  levelEl: HTMLDivElement;
  /** 底部 tab 里的稀有度文案。 */
  rarityEl: HTMLDivElement;
}

export function createUpgradeFrameCard(opts: UpgradeFrameOptions): UpgradeFrameParts {
  const {
    rarity,
    accentColor,
    title,
    width = 'min(180px,90vw)',
    interactive = false,
    titlePaddingTop = '4px',
    rarityPaddingBottom = '4px',
    levelMarginTop = '-2px',
  } = opts;

  const card = document.createElement('div');
  card.style.cssText = `
    width:${width};aspect-ratio:${UPGRADE_FRAME_SIZE.w} / ${UPGRADE_FRAME_SIZE.h};box-sizing:border-box;
    background:url(${UPGRADE_FRAME_SRC[rarity] ?? UPGRADE_FRAME_SRC.common}) center / 100% 100% no-repeat;
    display:flex;flex-direction:column;align-items:stretch;
    filter:drop-shadow(0 4px 10px rgba(0,0,0,0.5));
    ${interactive ? 'cursor:pointer;touch-action:manipulation;user-select:none;transition:transform 0.15s;' : ''}
  `;

  // === 顶部 banner（物品名）===
  // banner 容器覆盖 SVG y 0~371（含黑色 divider），可视色带为 y 25~346，中心 y≈186
  const titleBar = document.createElement('div');
  titleBar.style.cssText = `
    flex:0 0 ${UPGRADE_TITLE_BAR_PCT};min-height:0;display:flex;align-items:center;justify-content:center;
    padding:${titlePaddingTop} 12% 0;box-sizing:border-box;overflow:hidden;
  `;
  const titleEl = document.createElement('div');
  titleEl.style.cssText = uiPlainTextCrisp(
    'font-size:clamp(11px,3.2vw,14px);font-weight:bold;line-height:1.05;text-align:center;width:100%;',
  );
  titleEl.textContent = title;
  titleBar.appendChild(titleEl);

  // === 中部主体（icon + desc + stats + level）===
  const mid = document.createElement('div');
  mid.style.cssText = `
    flex:1 1 auto;min-height:0;display:flex;flex-direction:column;align-items:center;
    padding:5% 9% 3%;box-sizing:border-box;gap:3px;
  `;

  const iconSlot = document.createElement('div');
  iconSlot.style.cssText = `
    display:flex;align-items:center;justify-content:center;
    width:100%;font-size:clamp(28px,8vw,36px);line-height:1;
  `;

  const descEl = document.createElement('div');
  descEl.style.cssText = uiPlainTextCrisp(
    'font-size:clamp(10px,2.7vw,11px);line-height:1.3;text-align:center;width:100%;',
  );

  // 数值面板：SVG 自带内嵌槽（y=1309~2073，已有描边和浅色填充），CSS 这层只做内部布局，
  // 不再叠加自己的 background 和 border，避免与 SVG 内嵌槽出现"框中框"。
  const statsBox = document.createElement('div');
  statsBox.style.cssText = `
    width:100%;padding:4px 7px;box-sizing:border-box;
    display:flex;flex-direction:column;gap:1px;
  `;

  const grow = document.createElement('div');
  grow.style.cssText = 'flex:1 1 auto;min-height:0;';

  const levelEl = document.createElement('div');
  levelEl.style.cssText = uiPlainTextCrisp(
    `font-size:clamp(10px,2.7vw,12px);font-weight:bold;line-height:1.2;text-align:center;width:100%;margin-top:${levelMarginTop};`,
  );

  mid.appendChild(iconSlot);
  mid.appendChild(descEl);
  mid.appendChild(statsBox);
  mid.appendChild(grow);
  mid.appendChild(levelEl);

  // === 底部 tab（稀有度）===
  // tab 容器覆盖 SVG y 2289~2642（13.36%），tab 可视范围 y 2289~2585，中心 y≈2437
  // 容器中心 y≈2465，略低于 tab 中心，用 padding-bottom 往上推少量
  const rarityBar = document.createElement('div');
  rarityBar.style.cssText = `
    flex:0 0 ${UPGRADE_RARITY_BAR_PCT};min-height:0;display:flex;align-items:center;justify-content:center;
    padding:0 25% ${rarityPaddingBottom};box-sizing:border-box;overflow:hidden;
  `;
  const rarityEl = document.createElement('div');
  rarityEl.style.cssText = uiPlainTextCrisp(
    'font-size:clamp(10px,2.6vw,12px);font-weight:bold;letter-spacing:0.5px;line-height:1;text-align:center;width:100%;',
  );
  rarityBar.appendChild(rarityEl);

  card.appendChild(titleBar);
  card.appendChild(mid);
  card.appendChild(rarityBar);

  if (interactive) {
    card.addEventListener('mouseenter', () => { card.style.transform = 'scale(1.05)'; });
    card.addEventListener('mouseleave', () => { card.style.transform = 'scale(1)'; });
  }

  return { card, titleEl, iconSlot, descEl, statsBox, levelEl, rarityEl };
}

/** 升级卡数值面板的一行（左标签 / 右数值），值用稀有度色。 */
export function upgradeStatRow(label: string, value: string, accentColor: string): HTMLDivElement {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;justify-content:space-between;gap:6px;line-height:1.45;';
  const lab = document.createElement('span');
  lab.style.cssText = uiPlainTextCrisp('font-size:clamp(9px,2.6vw,11px);line-height:1.45;');
  lab.textContent = label;
  const val = document.createElement('span');
  val.style.cssText = uiColoredTextCrisp(accentColor, '') + 'font-size:clamp(9px,2.6vw,11px);font-weight:bold;line-height:1.45;';
  val.textContent = value;
  row.appendChild(lab);
  row.appendChild(val);
  return row;
}
