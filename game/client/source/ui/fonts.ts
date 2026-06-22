/**
 * 游戏 UI 字体加载（Lilita One + Noto Sans SC 本地两件套）。
 *
 * - 不依赖 Google Fonts CDN（自托管 woff/ttf）。
 * - `installGameUIFonts()` 注入一次 `<style id="megabonk-ui-fonts">`（idempotent）。
 * - `ensureGameUIFontsLoaded()` 等候 4 个 weight/family 真正可用，避免「先白屏后跳变」。
 *
 * `UI_FONT_FACE` 是默认的 font-family stack，HUD / 菜单都从这里读。
 */

// 本地 Lilita One（拉丁） + Noto Sans SC（中文/CJK）。
// 不再走 Google Fonts CDN，也不再叠像素字体 fallback。
export const UI_FONT_FACE = '"Lilita One","Noto Sans SC",Arial,sans-serif';

export const GAME_UI_FONT_FILES = {
  lilitaOneTtf: '/fonts/LilitaOne-Regular.ttf',
  notoSansScVf: '/fonts/NotoSansSC-VF.ttf',
} as const;

export function installGameUIFonts(): void {
  if (document.getElementById('megabonk-ui-fonts')) return;
  const style = document.createElement('style');
  style.id = 'megabonk-ui-fonts';
  // Noto Sans SC 用可变字体（wght 100~900），单文件覆盖 Regular/Bold；
  // font-synthesis: none 防止浏览器对 Lilita One（仅 400 一档）合成假粗体扭曲笔画——
  // 中文加粗由 Noto 可变轴提供真实 700 字重。
  style.textContent = `
@font-face {
  font-family: 'Lilita One';
  src: url('${GAME_UI_FONT_FILES.lilitaOneTtf}') format('truetype');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Noto Sans SC';
  src: url('${GAME_UI_FONT_FILES.notoSansScVf}') format('truetype');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}
html, body {
  font-synthesis: none;
  /* 全局禁用文本选区：游戏 UI 不需要复制/选词，长按或拖拽误触会破坏体验。 */
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  /* 关掉 iOS 长按浮出的"拷贝/查找"气泡。 */
  -webkit-touch-callout: none;
  /* 关掉移动端点击时的灰色高亮闪烁。 */
  -webkit-tap-highlight-color: transparent;
}
/* 真正需要输入的元素（音量条 / 等级输入 / 未来的聊天框）仍保留正常选区行为。 */
input, textarea, [contenteditable="true"], [contenteditable=""] {
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
  user-select: text;
  -webkit-touch-callout: default;
}
  `.trim();
  document.head.appendChild(style);
}

export async function ensureGameUIFontsLoaded(): Promise<void> {
  installGameUIFonts();
  await Promise.all([
    document.fonts.load(`16px "Lilita One"`),
    document.fonts.load(`bold 60px "Lilita One"`),
    document.fonts.load(`16px "Noto Sans SC"`),
    document.fonts.load(`bold 16px "Noto Sans SC"`),
  ]);
}
