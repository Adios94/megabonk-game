import { t } from '@minigame/i18n';
import { uiPlainTextBold } from '../ui/textStyle.ts';
import { UI_FONT_FACE } from '../ui/fonts.ts';

let bootLoadingOverlay: HTMLDivElement | null = null;
let bootLoadingBar: HTMLDivElement | null = null;
let bootLoadingPct = 0;

export function showBootLoadingOverlay(): void {
  const overlay = document.createElement('div');
  overlay.id = 'boot-loading';
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:5000;display:flex;flex-direction:column;align-items:center;' +
    'justify-content:center;gap:18px;background:#87ceeb;color:#fff;' +
    'padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);' +
    'padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px);' +
    'box-sizing:border-box;' +
    `font-family:${UI_FONT_FACE};`;

  const title = document.createElement('div');
  title.textContent = t('game.title');
  // 主菜单游戏标题（loading 屏 / 大 logo 字）：32-64px 用 2px 8 向描边统一卡通厚度感。
  title.style.cssText = uiPlainTextBold('font-size:clamp(32px,10vw,64px);font-weight:700;letter-spacing:2px;');

  const track = document.createElement('div');
  track.style.cssText =
    'width:min(70vw,420px);height:14px;border:3px solid rgba(0,0,0,0.5);border-radius:8px;' +
    'background:rgba(0,0,0,0.2);overflow:hidden;';
  const bar = document.createElement('div');
  bar.style.cssText = 'width:0%;height:100%;background:#ffd93b;transition:width 0.2s ease-out;';
  track.appendChild(bar);

  const hint = document.createElement('div');
  hint.textContent = t('boot.loading');
  hint.style.cssText = 'font-size:clamp(8px,2.5vw,11px);opacity:0.85;';

  overlay.appendChild(title);
  overlay.appendChild(track);
  overlay.appendChild(hint);
  document.body.appendChild(overlay);

  bootLoadingOverlay = overlay;
  bootLoadingBar = bar;
  bootLoadingPct = 0;
}

export function setBootLoadingProgress(pct: number): void {
  // 单调不减：load 队列 total 会随阶段增长导致比例回跳，这里取历史最大值平滑显示。
  const clamped = Math.max(bootLoadingPct, Math.min(100, Math.round(pct)));
  bootLoadingPct = clamped;
  if (bootLoadingBar) bootLoadingBar.style.width = `${clamped}%`;
}

export function hideBootLoadingOverlay(): void {
  setBootLoadingProgress(100);
  const overlay = bootLoadingOverlay;
  if (!overlay) return;
  bootLoadingOverlay = null;
  bootLoadingBar = null;
  overlay.style.transition = 'opacity 0.35s ease-out';
  overlay.style.opacity = '0';
  window.setTimeout(() => overlay.remove(), 400);
}
