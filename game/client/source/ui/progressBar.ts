/**
 * SVG 进度条工具。
 *
 * 设计目标：进度变化时填充图**不变形**。
 * 做法：轨道层 + 满宽填充层两张 SVG 叠放，均 `preserveAspectRatio="none"` 铺满容器；
 * 进度通过对填充层施加 `clip-path: inset(...)` 的「窗口」来揭示，
 * 填充图本身始终保持容器满宽，因此放大/缩小进度只是裁剪窗口宽度变化，artwork 不被拉伸。
 *
 * 容器自身的尺寸 / 定位由调用方决定，这里只负责铺设图层与裁剪。
 */

const LAYER_STYLE =
  'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;user-select:none;display:block;';
const FILL_STYLE = `${LAYER_STYLE}transition:clip-path 0.25s ease-out;will-change:clip-path;`;

function clipForPercent(percent: number): string {
  const p = Math.max(0, Math.min(100, percent));
  // 从右侧裁掉 (100 - p)%，露出左侧 p% 的填充窗口。
  return `inset(0 ${100 - p}% 0 0)`;
}

/** 直接设置填充层进度（0–100）。 */
export function setSvgBarPercent(fill: HTMLElement, percent: number): void {
  fill.style.clipPath = clipForPercent(percent);
}

export interface SvgBarLayers {
  /** 填充 <img>，用于后续设置进度。 */
  fill: HTMLImageElement;
  /** 设置进度（0–100），带 CSS 过渡。 */
  set(percent: number): void;
}

/**
 * 在已有容器内铺设 SVG 进度条图层（轨道 + 满宽填充，可选顶层装饰）。
 * 不修改容器自身的尺寸 / 定位样式；图层以绝对定位铺满容器。
 * 返回的图层位于容器最底部，调用方之后 append 的文字层会自然叠在上方。
 */
export function mountSvgBar(
  container: HTMLElement,
  trackSrc: string,
  fillSrc: string,
  overlaySrc?: string,
): SvgBarLayers {
  const track = document.createElement('img');
  track.src = trackSrc;
  track.alt = '';
  track.draggable = false;
  track.style.cssText = LAYER_STYLE;

  const fill = document.createElement('img');
  fill.src = fillSrc;
  fill.alt = '';
  fill.draggable = false;
  fill.style.cssText = FILL_STYLE;
  fill.style.clipPath = clipForPercent(0);

  container.appendChild(track);
  container.appendChild(fill);

  if (overlaySrc) {
    const overlay = document.createElement('img');
    overlay.src = overlaySrc;
    overlay.alt = '';
    overlay.draggable = false;
    overlay.style.cssText = LAYER_STYLE;
    container.appendChild(overlay);
  }

  return {
    fill,
    set: (percent: number) => setSvgBarPercent(fill, percent),
  };
}

export interface SlicedBarOptions {
  /**
   * border-image-slice 值，单位是源图像素。
   * 例：'0 6 fill' 表示上下不切、左右各保留 6px 端帽、并填充中段。
   */
  slice: string;
  /** 端帽在屏幕上的像素宽度（左右 border 宽度）。 */
  capPx: number;
}

/**
 * 9-slice（border-image）版进度条：左右端帽固定不拉伸，仅中段横向拉伸，
 * 因此进度条可任意加长而圆角 / 端帽不畸变。进度同样用 clip-path 揭示。
 */
export function mountSvgBarSliced(
  container: HTMLElement,
  trackSrc: string,
  fillSrc: string,
  opts: SlicedBarOptions,
): { fill: HTMLElement; set: (percent: number) => void } {
  const base = (src: string): string =>
    'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;user-select:none;box-sizing:border-box;' +
    `border-style:solid;border-color:transparent;border-width:0 ${opts.capPx}px;` +
    `border-image-source:url(${src});border-image-slice:${opts.slice};` +
    `border-image-width:0 ${opts.capPx}px;border-image-repeat:stretch;`;

  const track = document.createElement('div');
  track.style.cssText = base(trackSrc);

  const fill = document.createElement('div');
  fill.style.cssText = `${base(fillSrc)}transition:clip-path 0.25s ease-out;will-change:clip-path;`;
  fill.style.clipPath = clipForPercent(0);

  container.appendChild(track);
  container.appendChild(fill);

  return {
    fill,
    set: (percent: number) => setSvgBarPercent(fill, percent),
  };
}

/** 进度条 SVG 资源路径表。 */
export const BAR_ASSETS = {
  hp: { track: '/ui/bar/hp_track.svg', fill: '/ui/bar/hp_fill.svg' },
  shield: { track: '/ui/bar/shield_track.svg', fill: '/ui/bar/shield_fill.svg' },
  xp: { track: '/ui/bar/xp_track.svg', fill: '/ui/bar/xp_fill.svg' },
  boss: { track: '/ui/bar/boss_track.svg', fill: '/ui/bar/boss_fill.svg' },
  quest: { track: '/ui/bar/quest_track.svg', fill: '/ui/bar/quest_fill.svg', flag: '/ui/bar/quest_flag.svg' },
  stat: { track: '/ui/bar/stat_track.svg', fill: '/ui/bar/stat_fill.svg' },
} as const;
