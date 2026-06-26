import gsap from 'gsap';
import { setMobileJoystickEnabled } from './joystickSkin.ts';
import { uiPx } from './scale.ts';

export const JUMP_BUTTON_IMG = '/ui/button/btn_jump.png';
export const CHEST_OPEN_BUTTON_IMG = '/ui/button/btn_chest_open.png';

/** Design px — scaled via uiPx at runtime. */
const JUMP_BUTTON_SIZE = 80;
const CHEST_BUTTON_SIZE = 56;
const CLUSTER_BOTTOM = 56;
const CLUSTER_SAFE_AREA_EXTRA = 40;
const CLUSTER_RIGHT = 28;
const CHEST_ABOVE_JUMP = 10;
const CHEST_LEFT_OF_JUMP = 22;

interface TouchButtonsDom {
  container?: HTMLDivElement;
  buttonEls?: HTMLDivElement[];
}

function applyImageButton(el: HTMLElement, url: string, size: number): void {
  const px = uiPx(size);
  el.textContent = '';
  el.style.width = `${px}px`;
  el.style.height = `${px}px`;
  el.style.minWidth = `${px}px`;
  el.style.minHeight = `${px}px`;
  el.style.padding = '0';
  el.style.border = 'none';
  el.style.borderRadius = '0';
  el.style.background = 'transparent';
  el.style.backgroundColor = 'transparent';
  el.style.backgroundImage = `url(${url})`;
  el.style.backgroundSize = 'contain';
  el.style.backgroundRepeat = 'no-repeat';
  el.style.backgroundPosition = 'center';
  el.style.boxShadow = 'none';
  el.style.opacity = '1';
  el.style.transition = 'none';
  el.style.transformOrigin = 'center center';
  el.style.touchAction = 'manipulation';
  el.style.userSelect = 'none';
  el.style.cursor = 'pointer';
}

function wireJumpButtonSpring(jumpEl: HTMLElement): void {
  const keepOpaque = () => { jumpEl.style.opacity = '1'; };

  jumpEl.addEventListener('pointerdown', () => {
    keepOpaque();
    gsap.killTweensOf(jumpEl);
    gsap.timeline()
      .to(jumpEl, { scale: 0.86, duration: 0.07, ease: 'power2.in', overwrite: true })
      .to(jumpEl, { scale: 1, duration: 0.38, ease: 'elastic.out(1, 0.55)', overwrite: true });
  });

  const settleAfterPlatform = () => {
    keepOpaque();
    window.setTimeout(() => {
      jumpEl.style.transform = '';
      gsap.killTweensOf(jumpEl);
      gsap.fromTo(
        jumpEl,
        { scale: 0.93 },
        { scale: 1, duration: 0.3, ease: 'elastic.out(1, 0.48)', overwrite: true },
      );
    }, 0);
  };
  jumpEl.addEventListener('pointerup', settleAfterPlatform);
  jumpEl.addEventListener('pointercancel', settleAfterPlatform);
  jumpEl.addEventListener('pointerleave', settleAfterPlatform);
}

/**
 * Skin platform jump button + reposition chest interact button relative to it.
 * Platform package is contract-locked; DOM is adjusted after construction.
 */
export function setupMobileActionButtons(mobileInput: unknown, interactBtn: HTMLDivElement): void {
  const buttons = (mobileInput as { buttons?: TouchButtonsDom } | null)?.buttons;
  const jumpEl = buttons?.buttonEls?.[0];
  const platformContainer = buttons?.container;
  if (!jumpEl || !platformContainer) return;

  const jumpSize = uiPx(JUMP_BUTTON_SIZE);
  const chestSize = uiPx(CHEST_BUTTON_SIZE);

  const cluster = document.createElement('div');
  cluster.dataset.mobileActionCluster = 'true';
  cluster.style.cssText = [
    'position:fixed',
    `right:max(${uiPx(CLUSTER_RIGHT)}px, env(safe-area-inset-right, 0px))`,
    `bottom:max(${uiPx(CLUSTER_BOTTOM)}px, calc(env(safe-area-inset-bottom, 0px) + ${CLUSTER_SAFE_AREA_EXTRA}px))`,
    // Below modal overlays (upgrade/pause/game-over use z-index 300–420) so the
    // jump/chest buttons never float above a fullscreen dim layer; above the HUD (100).
    'z-index:200',
    'pointer-events:none',
    'touch-action:none',
  ].join(';');

  platformContainer.style.position = 'relative';
  platformContainer.style.right = '0';
  platformContainer.style.bottom = '0';
  platformContainer.style.gap = '0';
  platformContainer.style.pointerEvents = 'auto';

  applyImageButton(jumpEl, JUMP_BUTTON_IMG, JUMP_BUTTON_SIZE);
  wireJumpButtonSpring(jumpEl);

  setupChestInteractButton(interactBtn, chestSize, jumpSize);

  cluster.appendChild(platformContainer);
  cluster.appendChild(interactBtn);
  document.body.appendChild(cluster);
}

function setupChestInteractButton(interactBtn: HTMLDivElement, chestSize: number, jumpSize: number): void {
  interactBtn.textContent = '';
  interactBtn.dataset.cameraBlock = 'true';
  interactBtn.dataset.mode = 'chest';
  interactBtn.style.cssText = [
    'position:absolute',
    `width:${chestSize}px`,
    `height:${chestSize}px`,
    `min-width:${chestSize}px`,
    `min-height:${chestSize}px`,
    `bottom:${jumpSize + uiPx(CHEST_ABOVE_JUMP)}px`,
    `right:${uiPx(CHEST_LEFT_OF_JUMP)}px`,
    'padding:0',
    'border:none',
    'border-radius:0',
    'background:transparent',
    `background-image:url(${CHEST_OPEN_BUTTON_IMG})`,
    'background-size:contain',
    'background-repeat:no-repeat',
    'background-position:center',
    'box-shadow:none',
    'cursor:pointer',
    'pointer-events:auto',
    'user-select:none',
    'touch-action:manipulation',
    'display:none',
    'opacity:0',
    'transform-origin:center center',
  ].join(';');

}

/** Chest open button — image only; dim when player cannot afford. */
export function setMobileChestInteractState(interactBtn: HTMLDivElement, canAfford: boolean): void {
  interactBtn.dataset.mode = 'chest';
  interactBtn.style.backgroundImage = `url(${CHEST_OPEN_BUTTON_IMG})`;
  interactBtn.style.opacity = canAfford ? '1' : '0.45';
  interactBtn.style.filter = canAfford ? 'none' : 'grayscale(0.55)';
}

/** Altar interact — hidden touch target only; no prompt above the jump cluster. */
export function setMobileAltarInteractState(interactBtn: HTMLDivElement): void {
  interactBtn.dataset.mode = 'altar';
  interactBtn.style.backgroundImage = 'none';
  interactBtn.style.opacity = '1';
  interactBtn.style.filter = 'none';
}

export function removeMobileActionCluster(): void {
  document.querySelector('[data-mobile-action-cluster]')?.remove();
}

export function setInGameTouchControlsEnabled(enabled: boolean, mobileInput: unknown): void {
  setMobileActionClusterVisible(enabled);
  setMobileJoystickEnabled(mobileInput, enabled);
}

/** Hide jump/chest cluster under fullscreen modal overlays (e.g. game over). */
export function setMobileActionClusterVisible(visible: boolean): void {
  const cluster = document.querySelector('[data-mobile-action-cluster]') as HTMLElement | null;
  if (!cluster) return;
  cluster.style.visibility = visible ? 'visible' : 'hidden';
  cluster.style.pointerEvents = visible ? 'none' : 'none';
  for (const child of cluster.children) {
    if (child instanceof HTMLElement) {
      child.style.pointerEvents = visible ? 'auto' : 'none';
    }
  }
}
