/**
 * 局内圆形进度指示器（充能神殿 / Boss 召唤祭坛）。
 * 黄色圆环通过 stroke-dashoffset 按 0-100% 顺时针揭示，带平滑过渡。
 */

import { uiPx } from './scale.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

/** 黄色环描边圆心半径（略小于原稿，整体更紧凑）。 */
const RING_R = 21.2;
const RING_STROKE = 4.8;
const RING_CIRC = 2 * Math.PI * RING_R;

/** 与 game/core config SHRINE_RADIUS 一致。 */
export const SHRINE_INTERACT_RADIUS = 2.5;

const TEMPLE_ICON_DATA =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAACXBIWXMAAAsTAAALEwEAmpwYAAADxUlEQVR4nO2dPYgdVRTHr/EL/GhELBRErNRGVCT2YiUIIoiFH5UIYmFhK9sp8TsYEueet00iolsIdoKFGKLEeM4mRSpBUNcEYogRggSD5icDW8TN6kyyb965c+f84F/u45z//903O2/OvS+lIAiCIAiCS2XlKNe0uuQ/DLbG7AA3ZmWfGOey8mdW9u46yg3edU0GMRoxuFDZ2O1d12QQ4+TGAEQ54V3XJACuuMj8dgUo571rmwREAL4QAfhCBOALEYAvRAC+EAH4QgTgCxGAL0QAvhAB+EIE4AsRwLA0ytWivJ2VXzcz+rKknMjGm+1re/dXPNl4a27GX7xKdnj3VzQrK1yZldNDBSDKb0uwzbvPYlle5Z7BzF9Xo9zl3Wex5FWeHToAMZ727rNYsrFzAQG8691nsWTjwAIC2O/dZ5EswTZRzgwegHImLsRBEATBpFm/6923gP96/lfZWFn6kqvS1BBl5m3+BSFImhJZedzbdNkYgvJkmszXzcZP3obLRilrk9hrIMpz7mbb5poZz6TaEeUzb6Plv/VpmsDjxN8LMJrN1D6LaGtMtdIot3ubLB3ac5jbUq3IdzzibbB0aGY8nGpFjJe8DZYONcqLqVay8r63wdKh9qFQqhVRvvA2WLr1eaqVbPxc/ApQfkw1svcI17fTa94GS5eUvxvlulQbs0Pc526u9dPyKvem2miMp7yNlSl/MZeVJW9jpf/H0KupNkT5yN1Y660Pvf0KgiAIgi2Pm2flqwIuqlyO1mu/O42NmXGrGJ+M4s7XOkM4n5WP257SGMjKQ2Ic9zZO5q/jjbI9lUxjPJGNswWYxSCrwTjbjtSkEmmU+8X4w9skWUAIzSoPppLYfYRbsnLM2xxZlJS1Rrk5lYIYu9xNsYXrvVQCew5zR3t4agGGsEi1PS8f4s7BDd75Pde2G9vaPbbeTctIlI1T7W7/uYw6ZuUd74ZkpGp3/W85gHjnsxWdjABs5AGMYZZHap4xkm+4adPDskN0mH9qbvcKYrzg3ZCMTFl5Ps11F7tx0LspGY907rvxxXigHVoqoDlGMNi1fWG/XBHiX8rKB4OYHwRBEEyD9uyEbHzrfUGTenSwPRujdwAz5ZUCiqYmZeXl3u9+UX7xLlgqU/vIttfJvY3xmHexUqlmyqOdAcQDGIbUG50BiPJ1AYVSqfZXsZNRRqps/NBnBQx/dudElZXTfVbAX96FSr06170C6hyspQgpa90rQNnhXqjVqWy81msQqw1hUrOeNrDxyrFsvD6JM+mCIAiCIAhSH/4BsItX/FWhQRwAAAAASUVORK5CYII=';

export interface TempleChargeIndicator {
  root: HTMLDivElement;
  /** 设置进度 0-100；immediate=true 时跳过过渡动画（用于重新出现时复位，避免回抽）。 */
  setPercent(percent: number, immediate?: boolean): void;
}

export type BossSummonIndicator = TempleChargeIndicator;

interface CircleSpec {
  cx: number;
  cy: number;
  r: number;
  fill: string;
}

interface CircularProgressStyle {
  datasetKey: string;
  viewBox: string;
  ringCenterX: number;
  ringCenterY: number;
  bg: CircleSpec;
  mid: CircleSpec;
  inner: CircleSpec;
  appendIcon(svg: SVGSVGElement): void;
}

function setRingPercent(ring: SVGCircleElement, percent: number, immediate = false): void {
  const p = Math.max(0, Math.min(100, percent));
  if (immediate) {
    const prevTransition = ring.style.transition;
    ring.style.transition = 'none';
    ring.style.strokeDashoffset = String(RING_CIRC * (1 - p / 100));
    // 强制 reflow 让无过渡的赋值即时生效，再恢复过渡。
    void ring.getBoundingClientRect();
    ring.style.transition = prevTransition;
    return;
  }
  ring.style.strokeDashoffset = String(RING_CIRC * (1 - p / 100));
}

function appendCircle(svg: SVGSVGElement, spec: CircleSpec): void {
  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', String(spec.cx));
  circle.setAttribute('cy', String(spec.cy));
  circle.setAttribute('r', String(spec.r));
  circle.setAttribute('fill', spec.fill);
  svg.appendChild(circle);
}

function appendTempleIcon(svg: SVGSVGElement): void {
  const icon = document.createElementNS(SVG_NS, 'image');
  icon.setAttribute('x', '14');
  icon.setAttribute('y', '12');
  icon.setAttribute('width', '23');
  icon.setAttribute('height', '23');
  icon.setAttributeNS(XLINK_NS, 'href', TEMPLE_ICON_DATA);
  icon.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.appendChild(icon);
}

function appendBossIcon(svg: SVGSVGElement): void {
  const iconGroup = document.createElementNS(SVG_NS, 'g');

  const hitArea = document.createElementNS(SVG_NS, 'path');
  hitArea.setAttribute('d', 'M12 15H39V42H12V15Z');
  hitArea.setAttribute('fill', 'black');
  hitArea.setAttribute('fill-opacity', '0.01');

  const icon = document.createElementNS(SVG_NS, 'path');
  icon.setAttribute('d', 'M25.4628 16.0092C21.1761 16.0004 17.0066 18.2224 14.7069 22.2058C11.2839 28.1345 13.3089 35.7023 19.2377 39.1252C25.1665 42.5482 32.733 40.518 36.1558 34.5893C39.5788 28.6606 37.5519 21.096 31.6232 17.673C29.6778 16.5499 27.5563 16.0135 25.4628 16.0092V16.0092ZM29.2736 21.5168C30.5334 21.522 31.7826 21.8356 32.9185 22.4911C36.7448 24.6989 37.8537 29.9597 35.3885 34.2271C32.9234 38.4942 27.8081 40.1689 23.9818 37.9611C20.1556 35.7532 19.049 30.4886 21.5141 26.2214C23.2475 23.2208 26.2899 21.5041 29.2736 21.5167V21.5168ZM32.9573 23.7526C33.6802 24.9299 33.9615 26.4736 33.7733 28.1187C33.42 27.478 32.9062 26.9336 32.2464 26.5538C30.1333 25.3372 27.3039 26.2572 25.9425 28.6086C24.581 30.9598 25.1937 33.8683 27.3069 35.0847C27.8616 35.4041 28.4662 35.5757 29.0805 35.6128C27.1585 36.803 25.018 37.0609 23.3327 36.0883C23.2292 36.0283 23.1283 35.9642 23.0301 35.896C23.4606 36.3548 23.9564 36.7477 24.5014 37.062C27.8908 39.0177 32.3952 37.5399 34.5788 33.7598C36.6375 30.1962 35.8894 25.8746 32.9573 23.7526ZM30.1566 27.0242C30.6984 27.0307 31.2359 27.1684 31.7268 27.451C33.4026 28.4157 33.8825 30.6934 32.8028 32.5581C31.7232 34.4228 29.5022 35.1524 27.8263 34.1877C26.373 33.351 25.8222 31.523 26.4056 29.836C26.6304 30.7311 27.4457 31.401 28.4073 31.401C29.5403 31.401 30.4684 30.4712 30.4684 29.3386C30.4684 28.3187 29.7157 27.4653 28.7385 27.3056C29.1607 27.13 29.605 27.0336 30.0484 27.0247C30.0845 27.024 30.1206 27.0238 30.1567 27.0243L30.1566 27.0242Z');
  icon.setAttribute('fill', '#FFBAB4');

  iconGroup.append(hitArea, icon);
  svg.appendChild(iconGroup);
}

const TEMPLE_STYLE: CircularProgressStyle = {
  datasetKey: 'shrineChargeHud',
  viewBox: '0 0 51 51',
  ringCenterX: 25.48,
  ringCenterY: 25.34,
  bg: { cx: 25.479, cy: 25.3403, r: 25.3403, fill: '#131838' },
  mid: { cx: 25.4792, cy: 24.6569, r: 18.7405, fill: '#144AA1' },
  inner: { cx: 25.4755, cy: 24.6615, r: 17.7758, fill: '#35679B' },
  appendIcon: appendTempleIcon,
};

const BOSS_STYLE: CircularProgressStyle = {
  datasetKey: 'bossSummonHud',
  viewBox: '0 0 51 54',
  ringCenterX: 25.48,
  ringCenterY: 28.34,
  bg: { cx: 25.479, cy: 28.3403, r: 25.3403, fill: '#131838' },
  mid: { cx: 25.4792, cy: 27.6569, r: 18.7405, fill: '#D32D1D' },
  inner: { cx: 25.4755, cy: 27.6615, r: 17.7758, fill: '#A74747' },
  appendIcon: appendBossIcon,
};

/** 设计基准下的圆形指示器边长（整体缩放）。 */
const ICON_SIZE_BASE = 36;

function createCircularProgressIndicator(style: CircularProgressStyle): TempleChargeIndicator {
  const root = document.createElement('div');
  root.dataset[style.datasetKey] = 'true';
  applyShrineChargeHudLayout(root);

  const iconSize = uiPx(ICON_SIZE_BASE);
  const iconWrap = document.createElement('div');
  iconWrap.style.cssText = `position:relative;width:${iconSize}px;height:${iconSize}px;flex:0 0 auto;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.55));`;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', style.viewBox);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('fill', 'none');

  appendCircle(svg, style.bg);
  appendCircle(svg, style.mid);
  appendCircle(svg, style.inner);

  const ring = document.createElementNS(SVG_NS, 'circle');
  ring.setAttribute('cx', String(style.ringCenterX));
  ring.setAttribute('cy', String(style.ringCenterY));
  ring.setAttribute('r', String(RING_R));
  ring.setAttribute('fill', 'none');
  ring.setAttribute('stroke', '#F4C60B');
  ring.setAttribute('stroke-width', String(RING_STROKE));
  ring.setAttribute('stroke-linecap', 'butt');
  ring.setAttribute('transform', `rotate(-90 ${style.ringCenterX} ${style.ringCenterY})`);
  ring.style.strokeDasharray = String(RING_CIRC);
  ring.style.strokeDashoffset = String(RING_CIRC);
  ring.style.transition = 'stroke-dashoffset 0.12s linear';

  svg.appendChild(ring);
  style.appendIcon(svg);
  iconWrap.appendChild(svg);

  root.appendChild(iconWrap);

  return {
    root,
    setPercent: (percent: number, immediate = false) => setRingPercent(ring, percent, immediate),
  };
}

/** 在 HUD 中创建充能神殿圆形进度指示器（圆形在上、文案在下）。 */
export function createTempleChargeIndicator(): TempleChargeIndicator {
  return createCircularProgressIndicator(TEMPLE_STYLE);
}

/** 在 HUD 中创建 Boss 召唤祭坛圆形进度指示器（使用 progress_boss_fill.svg 风格）。 */
export function createBossSummonIndicator(): BossSummonIndicator {
  return createCircularProgressIndicator(BOSS_STYLE);
}

/** 充能 HUD 根节点布局（圆形块在上、文案在下）。index.ts 定位时须保留这些属性。 */
export function applyShrineChargeHudLayout(el: HTMLElement): void {
  el.style.display = 'none';
  el.style.opacity = '0';
  el.style.pointerEvents = 'none';
  el.style.flexDirection = 'column';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'flex-start';
}
