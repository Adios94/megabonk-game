/**
 * 充能神殿圆形进度指示器（progress_temple_charge.svg 风格）。
 * 黄色圆环通过 stroke-dashoffset 按 0–100% 顺时针揭示，带平滑过渡。
 */

import { uiPx } from './scale.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

const CX = 25.48;
const CY = 25.34;
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
  setPercent(percent: number): void;
  setLabel(text: string): void;
}

function setRingPercent(ring: SVGCircleElement, percent: number): void {
  const p = Math.max(0, Math.min(100, percent));
  ring.style.strokeDashoffset = String(RING_CIRC * (1 - p / 100));
}

/** 设计基准下的圆形指示器边长（整体缩放）。 */
const ICON_SIZE_BASE = 36;

/** 在 HUD 中创建充能神殿圆形进度指示器（圆形在上、文案在下）。 */
export function createTempleChargeIndicator(): TempleChargeIndicator {
  const root = document.createElement('div');
  root.dataset.shrineChargeHud = 'true';
  applyShrineChargeHudLayout(root);

  const iconSize = uiPx(ICON_SIZE_BASE);
  const iconWrap = document.createElement('div');
  iconWrap.style.cssText = `position:relative;width:${iconSize}px;height:${iconSize}px;flex:0 0 auto;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.55));`;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 51 51');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('fill', 'none');

  const bg = document.createElementNS(SVG_NS, 'circle');
  bg.setAttribute('cx', '25.479');
  bg.setAttribute('cy', '25.3403');
  bg.setAttribute('r', '25.3403');
  bg.setAttribute('fill', '#131838');

  const mid = document.createElementNS(SVG_NS, 'circle');
  mid.setAttribute('cx', '25.4792');
  mid.setAttribute('cy', '24.6569');
  mid.setAttribute('r', '18.7405');
  mid.setAttribute('fill', '#144AA1');

  const inner = document.createElementNS(SVG_NS, 'circle');
  inner.setAttribute('cx', '25.4755');
  inner.setAttribute('cy', '24.6615');
  inner.setAttribute('r', '17.7758');
  inner.setAttribute('fill', '#35679B');

  const ring = document.createElementNS(SVG_NS, 'circle');
  ring.setAttribute('cx', String(CX));
  ring.setAttribute('cy', String(CY));
  ring.setAttribute('r', String(RING_R));
  ring.setAttribute('fill', 'none');
  ring.setAttribute('stroke', '#F4C60B');
  ring.setAttribute('stroke-width', String(RING_STROKE));
  ring.setAttribute('stroke-linecap', 'butt');
  ring.setAttribute('transform', `rotate(-90 ${CX} ${CY})`);
  ring.style.strokeDasharray = String(RING_CIRC);
  ring.style.strokeDashoffset = String(RING_CIRC);
  ring.style.transition = 'stroke-dashoffset 0.12s linear';

  const icon = document.createElementNS(SVG_NS, 'image');
  icon.setAttribute('x', '14');
  icon.setAttribute('y', '12');
  icon.setAttribute('width', '23');
  icon.setAttribute('height', '23');
  icon.setAttributeNS(XLINK_NS, 'href', TEMPLE_ICON_DATA);
  icon.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  svg.append(bg, mid, inner, ring, icon);
  iconWrap.appendChild(svg);

  const label = document.createElement('div');
  label.style.cssText = [
    'color:#88ddff',
    'font-size:clamp(10px,2.5vw,12px)',
    'font-weight:bold',
    'text-shadow:0 0 8px #4488cc,0 1px 3px rgba(0,0,0,0.8)',
    'text-align:center',
    'white-space:nowrap',
    'max-width:min(92vw,360px)',
    'margin-top:clamp(5px,1vw,7px)',
    'flex:0 0 auto',
    'line-height:1.2',
  ].join(';');

  root.append(iconWrap, label);

  return {
    root,
    setPercent: (percent: number) => setRingPercent(ring, percent),
    setLabel: (text: string) => { label.textContent = text; },
  };
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
