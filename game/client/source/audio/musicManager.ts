/**
 * 背景音乐管理器（BGM）
 *
 * 两条音轨：
 *   - 封面 / 大厅音乐（begin.mp3）：主菜单 → 角色 / 难度选择阶段循环播放，
 *     点击「进入游戏」时淡出。
 *   - 战斗 / 入场音乐（fight1.mp3）：角色入场动画（黑屏仅角色）开始时播放，
 *     游戏过程中循环。
 *
 * 浏览器自动播放策略：带声音的音频必须由用户手势触发。首次 play() 被拒绝时，
 * 这里挂一次性的 pointer/touch/key 监听，待用户首次交互再补播，保证音乐尽早响起。
 *
 * 对外暴露播放动作和全局音频开关状态。SFX 使用短音频克隆播放，
 * 避免连续触发时互相打断。
 */

const MENU_MUSIC_SRC = '/audio/music/begin.mp3';
const COMBAT_MUSIC_SRC = '/audio/music/fight1.mp3';

const MENU_VOLUME = 0.6;
const COMBAT_VOLUME = 0.6;
const SFX_VOLUME = 0.504;
const AUDIO_SETTINGS_STORAGE_KEY = 'megabonk.audioSettings.v1';

export type SfxId =
  | 'click'
  | 'select'
  | 'getexp'
  | 'eat'
  | 'openchest'
  | 'powerup'
  | 'level2'
  | 'sword'
  | 'levelup'
  | 'hit'
  | 'hurt'
  | 'fall'
  | 'raygun'
  | 'gun'
  | 'bone'
  | 'magic'
  | 'lightning'
  | 'gameover'
  | 'ripple'
  | 'burn'
  | 'poison'
  | 'needle'
  | 'boss_loading'
  | 'boss_attack'
  | 'boss_alarm';

const SFX_SOURCES: Record<SfxId, string> = {
  click: '/audio/sfx/ui/click.mp3',
  select: '/audio/sfx/ui/select.mp3',
  getexp: '/audio/sfx/pickups/getexp.mp3',
  eat: '/audio/sfx/pickups/eat.mp3',
  openchest: '/audio/sfx/pickups/openchest.mp3',
  powerup: '/audio/sfx/world/powerup.mp3',
  level2: '/audio/sfx/world/level2.mp3',
  sword: '/audio/sfx/weapons/sword.mp3',
  levelup: '/audio/sfx/player/levelup.mp3',
  hit: '/audio/sfx/enemies/hit.mp3',
  hurt: '/audio/sfx/player/hurt.mp3',
  fall: '/audio/sfx/player/fall.mp3',
  raygun: '/audio/sfx/weapons/raygun.mp3',
  gun: '/audio/sfx/weapons/gun.mp3',
  bone: '/audio/sfx/weapons/bone.mp3',
  magic: '/audio/sfx/weapons/magic.mp3',
  lightning: '/audio/sfx/weapons/lightning.mp3',
  gameover: '/audio/sfx/player/gameover.mp3',
  ripple: '/audio/sfx/weapons/ripple.mp3',
  burn: '/audio/sfx/weapons/burn.mp3',
  poison: '/audio/sfx/weapons/poison.mp3',
  needle: '/audio/sfx/weapons/needle.mp3',
  boss_loading: '/audio/sfx/boss/bossloading.mp3',
  boss_attack: '/audio/sfx/boss/bossAttack.mp3',
  boss_alarm: '/audio/sfx/boss/bossalarm.mp3',
};

const FLAME_RING_LOOP_SRC = '/audio/sfx/weapons/firering.mp3';

const SFX_COOLDOWN_MS: Partial<Record<SfxId, number>> = {
  click: 45,
  select: 60,
  getexp: 55,
  eat: 70,
  level2: 1200,
  sword: 90,
  hit: 50,
  hurt: 180,
  fall: 180,
  raygun: 95,
  gun: 85,
  bone: 95,
  magic: 120,
  lightning: 140,
  ripple: 120,
  burn: 120,
  poison: 140,
  needle: 95,
  boss_loading: 500,
  boss_attack: 220,
  boss_alarm: 800,
};

export interface AudioSettings {
  musicMuted: boolean;
  sfxMuted: boolean;
}

interface Track {
  el: HTMLAudioElement;
  targetVolume: number;
  fadeRaf: number | null;
  shouldPlay: boolean;
}

let menuTrack: Track | null = null;
let combatTrack: Track | null = null;
let flameRingTrack: Track | null = null;
let settings: AudioSettings = loadAudioSettings();
const listeners = new Set<(next: AudioSettings) => void>();
const sfxBase = new Map<SfxId, HTMLAudioElement>();
const sfxLastPlayedAt = new Map<SfxId, number>();
const activeOneShotSfx = new Set<OneShotSfx>();
let buttonClickSfxInstalled = false;
let sfxDuckingMultiplier = 1;
let sfxDuckingRaf: number | null = null;
let sfxDuckingPlayTimer: number | null = null;
let sfxDuckingRestoreTimer: number | null = null;

interface OneShotSfx {
  el: HTMLAudioElement;
  baseVolume: number;
  ignoreDucking: boolean;
}

interface PlaySfxOptions {
  ignoreDucking?: boolean;
}

/** 等待用户手势解锁自动播放时，记录当前应该处于播放态的音轨。 */
let pendingTrack: Track | null = null;
let unlockAttached = false;

function loadAudioSettings(): AudioSettings {
  try {
    const raw = window.localStorage.getItem(AUDIO_SETTINGS_STORAGE_KEY);
    if (!raw) return { musicMuted: false, sfxMuted: false };
    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      musicMuted: parsed.musicMuted === true,
      sfxMuted: parsed.sfxMuted === true,
    };
  } catch {
    return { musicMuted: false, sfxMuted: false };
  }
}

function saveAudioSettings(): void {
  try {
    window.localStorage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage 可能在隐私模式 / 嵌入环境不可用；内存状态仍然有效。
  }
}

function emitAudioSettings(): void {
  const snapshot = getAudioSettings();
  for (const listener of listeners) listener(snapshot);
}

function setSettings(next: AudioSettings): void {
  if (settings.musicMuted === next.musicMuted && settings.sfxMuted === next.sfxMuted) return;
  settings = next;
  saveAudioSettings();
  applyMusicMuteState();
  applySfxMuteState();
  emitAudioSettings();
}

function createTrack(src: string, volume: number): Track {
  const el = new Audio(src);
  el.loop = true;
  el.preload = 'auto';
  el.volume = 0;
  return { el, targetVolume: volume, fadeRaf: null, shouldPlay: false };
}

function ensureMenuTrack(): Track {
  if (!menuTrack) menuTrack = createTrack(MENU_MUSIC_SRC, MENU_VOLUME);
  return menuTrack;
}

function ensureCombatTrack(): Track {
  if (!combatTrack) combatTrack = createTrack(COMBAT_MUSIC_SRC, COMBAT_VOLUME);
  return combatTrack;
}

function ensureFlameRingTrack(): Track {
  if (!flameRingTrack) flameRingTrack = createTrack(FLAME_RING_LOOP_SRC, SFX_VOLUME);
  return flameRingTrack;
}

function fade(track: Track, to: number, durationMs: number, onDone?: () => void): void {
  if (track.fadeRaf !== null) cancelAnimationFrame(track.fadeRaf);
  const from = track.el.volume;
  const start = performance.now();
  const step = (now: number): void => {
    const t = durationMs <= 0 ? 1 : Math.min(1, (now - start) / durationMs);
    track.el.volume = Math.max(0, Math.min(1, from + (to - from) * t));
    if (t < 1) {
      track.fadeRaf = requestAnimationFrame(step);
    } else {
      track.fadeRaf = null;
      onDone?.();
    }
  };
  track.fadeRaf = requestAnimationFrame(step);
}

function fadeOut(track: Track, durationMs: number, markStopped = true): void {
  if (markStopped) track.shouldPlay = false;
  fade(track, 0, durationMs, () => {
    track.el.pause();
  });
}

function attachUnlock(): void {
  if (unlockAttached) return;
  unlockAttached = true;
  const handler = (): void => {
    document.removeEventListener('pointerdown', handler);
    document.removeEventListener('touchstart', handler);
    document.removeEventListener('keydown', handler);
    unlockAttached = false;
    if (pendingTrack && pendingTrack.shouldPlay && !settings.musicMuted) {
      const track = pendingTrack;
      track.el.play().catch(() => {});
    }
  };
  document.addEventListener('pointerdown', handler, { once: true });
  document.addEventListener('touchstart', handler, { once: true });
  document.addEventListener('keydown', handler, { once: true });
}

function tryPlay(track: Track): void {
  if (settings.musicMuted || !track.shouldPlay) return;
  pendingTrack = track;
  const p = track.el.play();
  if (p && typeof p.catch === 'function') {
    p.catch(() => attachUnlock());
  }
}

function fadeToAudibleTarget(track: Track, durationMs: number): void {
  const target = settings.musicMuted ? 0 : track.targetVolume;
  if (!settings.musicMuted) tryPlay(track);
  fade(track, target, durationMs, () => {
    if (settings.musicMuted) track.el.pause();
  });
}

function applyMusicMuteState(): void {
  if (settings.musicMuted) pendingTrack = null;
  for (const track of [menuTrack, combatTrack]) {
    if (!track || !track.shouldPlay) continue;
    fadeToAudibleTarget(track, 220);
  }
}

function fadeToSfxAudibleTarget(track: Track, durationMs: number): void {
  const target = settings.sfxMuted || !track.shouldPlay ? 0 : track.targetVolume * sfxDuckingMultiplier;
  if (!settings.sfxMuted && track.shouldPlay) track.el.play().catch(() => {});
  fade(track, target, durationMs, () => {
    if (settings.sfxMuted || !track.shouldPlay) track.el.pause();
  });
}

function applySfxMuteState(): void {
  if (flameRingTrack?.shouldPlay) fadeToSfxAudibleTarget(flameRingTrack, 180);
}

function clampVolume(volume: number): number {
  return Math.max(0, Math.min(1, volume));
}

function effectiveSfxVolume(baseVolume: number, ignoreDucking = false): number {
  return clampVolume(baseVolume * (ignoreDucking ? 1 : sfxDuckingMultiplier));
}

function updateActiveOneShotSfxVolumes(): void {
  for (const sfx of activeOneShotSfx) {
    if (sfx.el.ended) {
      activeOneShotSfx.delete(sfx);
      continue;
    }
    sfx.el.volume = effectiveSfxVolume(sfx.baseVolume, sfx.ignoreDucking);
  }
}

function updateLoopingSfxDuckingVolume(): void {
  if (!flameRingTrack || !flameRingTrack.shouldPlay || settings.sfxMuted) return;
  flameRingTrack.el.volume = clampVolume(flameRingTrack.targetVolume * sfxDuckingMultiplier);
}

function setSfxDuckingMultiplier(next: number): void {
  sfxDuckingMultiplier = clampVolume(next);
  updateActiveOneShotSfxVolumes();
  updateLoopingSfxDuckingVolume();
}

function animateSfxDucking(to: number, durationMs: number): void {
  if (sfxDuckingRaf !== null) cancelAnimationFrame(sfxDuckingRaf);
  const from = sfxDuckingMultiplier;
  const start = performance.now();
  const step = (now: number): void => {
    const t = durationMs <= 0 ? 1 : Math.min(1, (now - start) / durationMs);
    setSfxDuckingMultiplier(from + (to - from) * t);
    if (t < 1) {
      sfxDuckingRaf = requestAnimationFrame(step);
    } else {
      sfxDuckingRaf = null;
    }
  };
  sfxDuckingRaf = requestAnimationFrame(step);
}

function clearSfxDuckingTimers(): void {
  if (sfxDuckingPlayTimer !== null) {
    window.clearTimeout(sfxDuckingPlayTimer);
    sfxDuckingPlayTimer = null;
  }
  if (sfxDuckingRestoreTimer !== null) {
    window.clearTimeout(sfxDuckingRestoreTimer);
    sfxDuckingRestoreTimer = null;
  }
}

/** 进入封面 / 主菜单：播放封面音乐（淡入），同时淡出战斗音乐。 */
export function playMenuMusic(fadeMs = 600): void {
  if (combatTrack) fadeOut(combatTrack, 400);
  const track = ensureMenuTrack();
  track.shouldPlay = true;
  if (track.el.paused) track.el.currentTime = 0;
  fadeToAudibleTarget(track, fadeMs);
}

/** 点击「进入游戏」：淡出封面音乐。 */
export function fadeOutMenuMusic(fadeMs = 800): void {
  if (pendingTrack === menuTrack) pendingTrack = null;
  if (menuTrack) fadeOut(menuTrack, fadeMs);
}

/** 角色入场（黑屏仅角色）：播放战斗 / 关卡音乐（淡入），同时淡出封面音乐。 */
export function playCombatMusic(fadeMs = 400): void {
  if (menuTrack) fadeOut(menuTrack, 300);
  const track = ensureCombatTrack();
  track.shouldPlay = true;
  if (track.el.paused) track.el.currentTime = 0;
  fadeToAudibleTarget(track, fadeMs);
}

/** 停止战斗音乐（淡出）。 */
export function stopCombatMusic(fadeMs = 400): void {
  if (pendingTrack === combatTrack) pendingTrack = null;
  if (combatTrack) fadeOut(combatTrack, fadeMs);
}

export function getAudioSettings(): AudioSettings {
  return { ...settings };
}

export function isMusicMuted(): boolean {
  return settings.musicMuted;
}

export function isSfxMuted(): boolean {
  return settings.sfxMuted;
}

export function setMusicMuted(muted: boolean): void {
  setSettings({ ...settings, musicMuted: muted });
}

export function setSfxMuted(muted: boolean): void {
  setSettings({ ...settings, sfxMuted: muted });
}

export function toggleMusicMuted(): boolean {
  const next = !settings.musicMuted;
  setMusicMuted(next);
  return next;
}

export function toggleSfxMuted(): boolean {
  const next = !settings.sfxMuted;
  setSfxMuted(next);
  return next;
}

/** 进入游戏时，如果 BGM 已静音，则 SFX 也跟随静音。 */
export function applyGameStartAudioPolicy(): void {
  if (settings.musicMuted) setSfxMuted(true);
}

export function onAudioSettingsChange(listener: (next: AudioSettings) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSfxBase(id: SfxId): HTMLAudioElement {
  let base = sfxBase.get(id);
  if (!base) {
    base = new Audio(SFX_SOURCES[id]);
    base.preload = 'auto';
    base.volume = SFX_VOLUME;
    sfxBase.set(id, base);
  }
  return base;
}

export function playSfx(id: SfxId, volume = SFX_VOLUME, options: PlaySfxOptions = {}): HTMLAudioElement | null {
  if (settings.sfxMuted) return null;
  const now = performance.now();
  const cooldown = SFX_COOLDOWN_MS[id] ?? 0;
  const last = sfxLastPlayedAt.get(id) ?? -Infinity;
  if (now - last < cooldown) return null;
  sfxLastPlayedAt.set(id, now);

  const audio = getSfxBase(id).cloneNode(true) as HTMLAudioElement;
  const active: OneShotSfx = {
    el: audio,
    baseVolume: clampVolume(volume),
    ignoreDucking: options.ignoreDucking === true,
  };
  audio.volume = effectiveSfxVolume(active.baseVolume, active.ignoreDucking);
  activeOneShotSfx.add(active);
  const cleanup = (): void => {
    activeOneShotSfx.delete(active);
  };
  audio.addEventListener('ended', cleanup, { once: true });
  audio.addEventListener('error', cleanup, { once: true });
  audio.play().catch(() => {});
  return audio;
}

export function playLevelTwoTransitionSfx(): void {
  if (settings.sfxMuted) return;
  clearSfxDuckingTimers();
  animateSfxDucking(0.35, 140);

  const restore = (): void => {
    if (sfxDuckingRestoreTimer !== null) {
      window.clearTimeout(sfxDuckingRestoreTimer);
      sfxDuckingRestoreTimer = null;
    }
    animateSfxDucking(1, 900);
  };

  sfxDuckingPlayTimer = window.setTimeout(() => {
    sfxDuckingPlayTimer = null;
    const audio = playSfx('level2', SFX_VOLUME, { ignoreDucking: true });
    if (!audio) {
      restore();
      return;
    }
    audio.addEventListener('ended', restore, { once: true });
    audio.addEventListener('error', restore, { once: true });
    sfxDuckingRestoreTimer = window.setTimeout(restore, 4500);
  }, 140);
}

export function setFlameRingSfxActive(active: boolean, fadeMs = 220): void {
  const track = ensureFlameRingTrack();
  if (active) {
    if (track.shouldPlay) {
      if (!settings.sfxMuted && track.el.paused) track.el.play().catch(() => {});
      return;
    }
    track.shouldPlay = true;
    fadeToSfxAudibleTarget(track, fadeMs);
    return;
  }
  if (track.shouldPlay) fadeOut(track, fadeMs);
}

export function installButtonClickSfx(): void {
  if (buttonClickSfxInstalled) return;
  buttonClickSfxInstalled = true;
  document.addEventListener('click', (ev) => {
    const target = ev.target;
    if (!(target instanceof Element)) return;
    const buttonLike = target.closest('button,[role="button"],[data-audio-click="true"]');
    if (!buttonLike) return;
    playSfx('click');
  }, true);
}
