/** Mobile-first layout breakpoints — see .cursor/skills/mobile-ui */
export const UI_BP_NARROW = 480;
export const UI_BP_SHORT = 600;

export function isUiNarrow(): boolean {
  return window.innerWidth < UI_BP_NARROW;
}

export function isUiShort(): boolean {
  return window.innerHeight < UI_BP_SHORT;
}

export function isUiLandscape(): boolean {
  return window.innerWidth > window.innerHeight;
}

/** Safe-area padding for full-screen fixed overlays */
export const OVERLAY_SAFE_AREA = `
  padding-top:env(safe-area-inset-top,0px);
  padding-bottom:env(safe-area-inset-bottom,0px);
  padding-left:env(safe-area-inset-left,0px);
  padding-right:env(safe-area-inset-right,0px);
  box-sizing:border-box;
`;

/** Bottom HUD clearance for platform virtual controls */
export const HUD_BOTTOM_CLEARANCE = 'max(80px,env(safe-area-inset-bottom,0px))';

/** Top offset below HUD cluster */
export const HUD_TOP_BELOW_CLUSTER = 'max(56px,calc(env(safe-area-inset-top,0px) + 44px))';

/** Centered modal overlay with safe-area; scrolls on short viewports */
export function modalOverlayStyle(extra = ''): string {
  const justify = isUiShort() ? 'flex-start' : 'center';
  return `
    position:fixed;top:0;left:0;width:100%;height:100%;
    display:flex;flex-direction:column;align-items:center;
    justify-content:${justify};
    overflow-y:auto;
    ${OVERLAY_SAFE_AREA}
    ${extra}
  `.replace(/\s+/g, ' ').trim();
}

/** 局内选择面板遮罩：标题 + 选项整体相对屏幕居中（升级 / 神殿 / 宝箱等）。 */
export function inGameChoiceOverlayStyle(extra = ''): string {
  return modalOverlayStyle(`justify-content:center;${extra}`);
}

export function inGameChoiceCenterGroupStyle(maxWidth = 'min(98vw,800px)'): string {
  return [
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'width:100%',
    `max-width:${maxWidth}`,
    'margin:auto',
    'flex-shrink:0',
    'padding:clamp(10px,2.5vh,16px) clamp(8px,2.5vw,12px)',
    'box-sizing:border-box',
  ].join(';');
}

/** 局内奖励行间距（升级 / 神殿等 N 选 1）。 */
export const INGAME_REWARD_ROW_GAP = 'clamp(6px,1.5vw,10px)';

/** 单行均分宽度：严禁换行，四选一也保持同一行。 */
export function inGameRewardCardWidth(cardCount: number): string {
  const count = Math.max(1, cardCount);
  const gaps = count - 1;
  return gaps > 0
    ? `calc((100% - ${INGAME_REWARD_ROW_GAP} * ${gaps}) / ${count})`
    : '100%';
}

export const INGAME_CHOICE_CARD_ROW_STYLE =
  `display:flex;gap:${INGAME_REWARD_ROW_GAP};flex-wrap:nowrap;flex-direction:row;justify-content:center;align-items:stretch;width:100%;`;

export function createInGameChoiceCenterGroup(maxWidth?: string): HTMLDivElement {
  const group = document.createElement('div');
  group.style.cssText = inGameChoiceCenterGroupStyle(maxWidth);
  return group;
}

export function createInGameChoiceCardRow(): HTMLDivElement {
  const row = document.createElement('div');
  row.style.cssText = INGAME_CHOICE_CARD_ROW_STYLE;
  return row;
}

/** 局内奖励卡片：均分一行宽度，允许在窄屏下继续缩小。 */
export function applyInGameRewardCardSize(card: HTMLElement, cardCount: number): void {
  const width = inGameRewardCardWidth(cardCount);
  card.style.width = width;
  card.style.maxWidth = width;
  card.style.flex = '1 1 0';
  card.style.minWidth = '0';
}

export function shopGridColumnCount(): number {
  return isUiNarrow() ? 2 : 4;
}

/**
 * 在 `el` 存活期间响应视口变化（resize / 旋转）。
 * 立即执行一次 `apply`；当 `el` 从 DOM 移除后，监听器自动解绑（无需手动 unsubscribe）。
 */
export function bindResponsiveLayout(el: HTMLElement, apply: () => void): void {
  apply();
  const handler = (): void => {
    if (!el.isConnected) {
      window.removeEventListener('resize', handler);
      return;
    }
    apply();
  };
  window.addEventListener('resize', handler);
}

/** 卡片行：窄屏纵向单列、宽屏横向并排。配合 flex-wrap 使用。 */
export function applyCardRowDirection(cardRow: HTMLElement): void {
  if (isUiNarrow()) {
    cardRow.style.flexDirection = 'column';
    cardRow.style.alignItems = 'center';
  } else {
    cardRow.style.flexDirection = 'row';
    cardRow.style.alignItems = 'stretch';
  }
}

const SCROLLBAR_STYLE_ID = 'megabonk-ui-scrollbar';

/** 滚动条轨道透明；滑块半透明白。需配合 class `ui-scrollbar-transparent`。 */
export function ensureTransparentScrollbarStyles(): void {
  if (document.getElementById(SCROLLBAR_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = SCROLLBAR_STYLE_ID;
  style.textContent = `
    .ui-scrollbar-transparent {
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.38) transparent;
    }
    .ui-scrollbar-transparent::-webkit-scrollbar {
      width: clamp(4px, 1vw, 6px);
    }
    .ui-scrollbar-transparent::-webkit-scrollbar-track {
      background: transparent;
    }
    .ui-scrollbar-transparent::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.38);
      border-radius: 999px;
    }
  `;
  document.head.appendChild(style);
}

export const UI_SCROLLBAR_TRANSPARENT_CLASS = 'ui-scrollbar-transparent';
