import { uiPx } from './scale.ts';

/** Touch joystick sprite paths (public/ui/button). */
export const JOYSTICK_BG = '/ui/button/stick_bg.png';
export const JOYSTICK_HANDLE = '/ui/button/stick_handle.png';

interface VirtualJoystickDom {
  zoneEl?: HTMLDivElement;
  baseEl?: HTMLDivElement;
  knobEl?: HTMLDivElement;
  ghostEl?: HTMLDivElement;
  x?: number;
  y?: number;
  active?: boolean;
}

/** Below HUD modals (300+) so fullscreen overlays capture touches first. */
const JOYSTICK_Z_INDEX = { zone: '150', base: '151', knob: '152' } as const;

/** Touch zone anchor (design px). */
const JOYSTICK_ZONE_BOTTOM = 16;
const JOYSTICK_ZONE_LEFT = 0;

/** Idle ghost stick_bg offset from zone center (design px). */
const JOYSTICK_GHOST_OFFSET_LEFT = 120;
const JOYSTICK_GHOST_OFFSET_UP = 28;

function applySprite(el: HTMLElement, url: string, opacity = 1): void {
  el.style.background = 'transparent';
  el.style.backgroundColor = 'transparent';
  el.style.border = 'none';
  el.style.borderRadius = '0';
  el.style.backgroundImage = `url(${url})`;
  el.style.backgroundSize = 'contain';
  el.style.backgroundRepeat = 'no-repeat';
  el.style.backgroundPosition = 'center';
  el.style.opacity = String(opacity);
}

function applyJoystickZIndex(joystick: VirtualJoystickDom): void {
  if (joystick.zoneEl) joystick.zoneEl.style.zIndex = JOYSTICK_Z_INDEX.zone;
  if (joystick.baseEl) joystick.baseEl.style.zIndex = JOYSTICK_Z_INDEX.base;
  if (joystick.knobEl) joystick.knobEl.style.zIndex = JOYSTICK_Z_INDEX.knob;
}

function resetJoystickState(joystick: VirtualJoystickDom): void {
  joystick.x = 0;
  joystick.y = 0;
  joystick.active = false;
  if (joystick.baseEl) joystick.baseEl.style.display = 'none';
  if (joystick.knobEl) joystick.knobEl.style.display = 'none';
  if (joystick.ghostEl) joystick.ghostEl.style.display = '';
}

function applyJoystickLayout(joystick: VirtualJoystickDom): void {
  applyJoystickZIndex(joystick);
  if (joystick.zoneEl) {
    const zs = joystick.zoneEl.style;
    zs.left = `max(${uiPx(JOYSTICK_ZONE_LEFT)}px, env(safe-area-inset-left, 0px))`;
    zs.bottom = `max(${uiPx(JOYSTICK_ZONE_BOTTOM)}px, env(safe-area-inset-bottom, 0px))`;
  }

  if (joystick.ghostEl) {
    const shiftLeft = uiPx(JOYSTICK_GHOST_OFFSET_LEFT);
    const shiftUp = uiPx(JOYSTICK_GHOST_OFFSET_UP);
    const gs = joystick.ghostEl.style;
    gs.left = `calc(50% - ${shiftLeft}px)`;
    gs.top = `calc(50% - ${shiftUp}px)`;
    gs.transform = 'translate(-50%, -50%)';
  }
}

/**
 * Replace default CSS circles on @minigame/platform VirtualJoystick with game art.
 * Platform package is contract-locked; we skin its internal DOM after construction.
 */
export function applyPlatformJoystickSkin(mobileInput: unknown): void {
  const joystick = (mobileInput as { joystick?: VirtualJoystickDom } | null)?.joystick;
  if (!joystick?.baseEl || !joystick.knobEl) return;

  applyJoystickLayout(joystick);
  applySprite(joystick.baseEl, JOYSTICK_BG);
  applySprite(joystick.knobEl, JOYSTICK_HANDLE);
  if (joystick.ghostEl) {
    applySprite(joystick.ghostEl, JOYSTICK_BG, 0.45);
  }
}

/** Disable left joystick while fullscreen modal overlays are open. */
export function setMobileJoystickEnabled(mobileInput: unknown, enabled: boolean): void {
  const joystick = (mobileInput as { joystick?: VirtualJoystickDom } | null)?.joystick;
  if (!joystick?.zoneEl) return;

  applyJoystickZIndex(joystick);

  if (enabled) {
    joystick.zoneEl.style.pointerEvents = 'auto';
    joystick.zoneEl.style.visibility = 'visible';
    if (joystick.ghostEl) joystick.ghostEl.style.visibility = 'visible';
    if (joystick.baseEl) joystick.baseEl.style.visibility = 'visible';
    if (joystick.knobEl) joystick.knobEl.style.visibility = 'visible';
    return;
  }

  joystick.zoneEl.style.pointerEvents = 'none';
  joystick.zoneEl.style.visibility = 'hidden';
  if (joystick.ghostEl) joystick.ghostEl.style.visibility = 'hidden';
  if (joystick.baseEl) {
    joystick.baseEl.style.visibility = 'hidden';
    joystick.baseEl.style.display = 'none';
  }
  if (joystick.knobEl) {
    joystick.knobEl.style.visibility = 'hidden';
    joystick.knobEl.style.display = 'none';
  }
  resetJoystickState(joystick);
}
