/// <reference types="vite/client" />
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
// @ts-ignore
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
// @ts-ignore
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
// @ts-ignore
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
// @ts-ignore
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import {
  GameInstance,
  TICK_INTERVAL_MS,
  MAX_ENEMIES,
  MAX_PROJECTILES,
  MAX_PICKUPS,
  DEFAULT_GAME_CONFIG,
  CHARACTER_CONFIGS,
  WEAPON_STATS,
  TOME_MAX_LEVELS,
  SHOP_UPGRADES,
  QUESTS,
  TIER_CONFIGS,
  CHEST_INTERACT_RADIUS,
  RELICS,
  BONDS,
  evalBondCounts,
  bondThresholds,
  type BondId,
  type BondTier,
  type ConsumableId,
  getChestGoldCost,
  loadSave,
  purchaseUpgrade,
  getUpgradeCost,
  canAfford,
  getQuestProgress,
  checkQuestCompletion,
  claimQuest,
  type Quest,
  type QuestProgress,
  getUpgradePreviewLines,
  type GameConfig,
  type GameState,
  type GameResult,
  type InputState,
  type WeaponState,
  type TomeState,
  type WeaponLevelStats,
  type EnemyState,
  type EnemyType,
  type ProjectileState,
  type PickupState,
  type GoldMoteState,
  type PickupType,
  type BossState,
  type DamageEvent,
  type LevelUpCompensationEvent,
  type ChestOpenEvent,
  type PendingChestReward,
  type UpgradeOption,
  type GamePhase,
  type UpgradeRarity,
  type CharacterType,
  type AltarState,
  type ChestState,
  type DifficultyTier,
  type ShrineState,
  type ShrineRewardOption,
  type LevelData,
  type RelicId,
  type RampVolume,
} from '@minigame/core';
import { PlatformInput } from '@minigame/platform';
import { installThreeHighDpi } from '@minigame/render-adapter';
import { initI18n, t, getLocale, setLocale, getAvailableLocales, getMode } from '@minigame/i18n';
import { CameraOrbit } from './systems/cameraOrbit.ts';
import { PlayerInvincibilityFx } from './systems/playerFx.ts';
import { BlobShadowPool } from './systems/blobShadows.ts';
import { gsapAnimations } from './gsap-animations.ts';
import type { I18nMode } from '@minigame/i18n';
import { EventEmitter } from './session/EventEmitter.ts';

import zhLocale from '../../../i18n/zh.json';
import enLocale from '../../../i18n/en.json';

// =============================================================================
// Runtime Event Types
// =============================================================================

export type GameRuntimeEvents = {
  game_init: { state: GameState };
  game_update: { state: GameState };
  game_over: { result: GameResult };
  game_reset: null;
};

// =============================================================================
// Billboard VFX 类型
// =============================================================================

/**
 * 已注册的 VFX 贴图 key（对应 public/textures/vfx/<key>.png）。
 * 增加新贴图时同步更新 `VFX_TEXTURE_FILES` 和此 union。
 */
type VfxTextureKey =
  | 'spark' | 'star' | 'smoke' | 'light' | 'slash'
  | 'muzzle' | 'magic_circle' | 'portal_swirl' | 'scorch' | 'dirt' | 'flame';

const VFX_TEXTURE_FILES: Record<VfxTextureKey, string> = {
  spark: '/textures/vfx/spark.png',
  star: '/textures/vfx/star.png',
  smoke: '/textures/vfx/smoke.png',
  light: '/textures/vfx/light.png',
  slash: '/textures/vfx/slash.png',
  muzzle: '/textures/vfx/muzzle.png',
  magic_circle: '/textures/vfx/magic_circle.png',
  portal_swirl: '/textures/vfx/portal_swirl.png',
  scorch: '/textures/vfx/scorch.png',
  dirt: '/textures/vfx/dirt.png',
  flame: '/textures/vfx/flame.png',
};

/** Billboard 池中每个槽位的运行时状态。 */
interface BillboardVfxItem {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  active: boolean;
  age: number;
  lifetime: number;
  startScale: number;
  endScale: number;
  startOpacity: number;
  /** 'fadeOut' = 起始 opacity → 0；'flash' = 0 → 起始 → 0；'constant' = 不变。 */
  opacityCurve: 'fadeOut' | 'flash' | 'constant';
  rotationSpeed: number;
  /** 'camera' = 始终面向相机；'up' = 平躺地面（不旋转）。 */
  facing: 'camera' | 'up';
}

/** spawnBillboard 选项。 */
interface BillboardSpawnOpts {
  texture: VfxTextureKey;
  x: number;
  y: number;
  z: number;
  /** 起始大小（m）。 */
  scale: number;
  /** 终止大小，默认 = scale（不缩放）。 */
  endScale?: number;
  /** 持续时间（s）。 */
  lifetime: number;
  /** 起始透明度，默认 1。 */
  opacity?: number;
  /** 渐隐曲线，默认 'fadeOut'。 */
  opacityCurve?: 'fadeOut' | 'flash' | 'constant';
  /** 染色，默认 0xffffff。 */
  color?: number;
  /** 初始旋转（弧度）。 */
  rotation?: number;
  /** 旋转速度（弧度/秒），默认 0。 */
  rotationSpeed?: number;
  /** 朝向：'camera' 面向相机，'up' 平躺地面（地面贴花用）。默认 'camera'。 */
  facing?: 'camera' | 'up';
  /** Blending 模式，默认 'additive'（光效）；'normal' 适合烧痕等不发光贴花。 */
  blending?: 'additive' | 'normal';
}

// =============================================================================
// LocalGameSession
// =============================================================================

export class LocalGameSession {
  private readonly events = new EventEmitter<GameRuntimeEvents>();
  private game: GameInstance;
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly config: GameConfig = DEFAULT_GAME_CONFIG) {
    this.game = new GameInstance(config);
  }

  start(): void {
    this.game.start();
    this.events.emit('game_init', { state: this.game.getState() });
    this.startTickLoop();
  }

  on<TKey extends keyof GameRuntimeEvents>(
    event: TKey,
    callback: (payload: GameRuntimeEvents[TKey]) => void,
  ): () => void {
    return this.events.on(event, callback);
  }

  sendAction(input: InputState): void {
    this.game.applyAction(input);
  }

  selectUpgrade(id: string): void {
    this.game.selectUpgrade(id);
  }

  selectShrineReward(id: string): void {
    this.game.selectShrineReward(id);
  }

  selectChestReward(keep: boolean): void {
    this.game.selectChestReward(keep);
  }

  getRenderState(): GameState {
    return this.game.getState();
  }

  pause(): void {
    this.game.pause();
  }

  resume(): void {
    this.game.resume();
  }

  reset(): void {
    this.stopTickLoop();
    this.game = new GameInstance(this.config);
    this.events.emit('game_reset', null);
  }

  restart(): void {
    this.reset();
    this.start();
  }

  private startTickLoop(): void {
    this.stopTickLoop();
    this.tickTimer = setInterval(() => {
      const finished = this.game.tick();
      const state = this.game.getState();
      this.events.emit('game_update', { state });

      if (finished) {
        const result = this.game.getResult();
        this.events.emit('game_over', { result });
        this.stopTickLoop();
      }
    }, TICK_INTERVAL_MS);
  }

  private stopTickLoop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }
}

// =============================================================================
// Constants
// =============================================================================

const ENEMY_COLORS: Record<string, number> = {
  skeleton_soldier: 0xd4a574,
  zombie: 0x44cc55,
  skeleton_archer: 0xc87533,
  skeleton_knight: 0xdd4444,
  necromancer: 0x9944cc,
  gargoyle: 0x667788,
};

const WEAPON_PROJECTILE_COLORS: Record<string, number> = {
  sword: 0xcccccc,
  bone_bouncer: 0xf5f5dc,
  axe: 0x888888,
  bow: 0xffcc44, // displayed as Revolver — gold/brass bullet
  lightning_staff: 0x44aaff,
  flame_ring: 0xff6600,
  shotgun: 0xffee44,
  ray_gun: 0xff3366,        // 激光红
  poison_bomb: 0x4caf3a,    // 深绿
  paralysis_gun: 0xffdd22,  // 麻痹黄
  void_ripple: 0x00ffff,    // 青色虚空涟漪
  scorch_boots: 0xff7a1a,   // 灼地橙
};

const PICKUP_COLORS: Record<string, number> = {
  xp_green: 0x00ff66,
  xp_blue: 0x22aaff,
  xp_purple: 0xcc44ff,
  xp_orange: 0xffaa00,
  gold: 0xffcc33,
  silver: 0xeeeeee,
  health: 0xff2222,
  health_small: 0xff6666,
};

const MAX_CONSUMABLE_PICKUPS = 50;

const CONSUMABLE_COLORS: Record<string, number> = {
  wild_berry: 0xcc44aa,
  hot_soup: 0xff8844,
  mint_candy: 0x66ddff,
  hard_bread: 0xddbb88,
  energy_bar: 0xffcc33,
  magnet: 0x4488ff,
  iron_meal: 0x8899aa,
  rage_potion: 0xff3344,
  prophecy_book: 0xaa66ff,
  craftsman_hammer: 0xffaa44,
};

const CONSUMABLE_EMOJI: Record<string, string> = {
  wild_berry: '🫐',
  hot_soup: '🍲',
  mint_candy: '🍬',
  hard_bread: '🥖',
  energy_bar: '🍫',
  magnet: '🧲',
  iron_meal: '🍱',
  rage_potion: '💢',
  prophecy_book: '📖',
  craftsman_hammer: '🔨',
};

const consumableEmojiTextureCache = new Map<string, THREE.Texture>();
let paralysisTriangleTexture: THREE.Texture | null = null;
let neuroTriangleTexture: THREE.Texture | null = null;
let hunterCrosshairTexture: THREE.Texture | null = null;
let conductorGlowTexture: THREE.Texture | null = null;
let arcaneOrbTexture: THREE.Texture | null = null;

function getConsumableEmojiTexture(consumableId: string): THREE.Texture {
  const cached = consumableEmojiTextureCache.get(consumableId);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);

  const glow = CONSUMABLE_COLORS[consumableId] ?? 0xcc66ff;
  const r = ((glow >> 16) & 0xff);
  const g = ((glow >> 8) & 0xff);
  const b = (glow & 0xff);
  const grad = ctx.createRadialGradient(64, 64, 10, 64, 64, 58);
  grad.addColorStop(0, `rgba(${r},${g},${b},0.55)`);
  grad.addColorStop(0.55, `rgba(${r},${g},${b},0.22)`);
  grad.addColorStop(1, 'rgba(20,10,40,0.05)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(64, 64, 56, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(${r},${g},${b},0.75)`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(64, 64, 54, 0, Math.PI * 2);
  ctx.stroke();

  ctx.font = '68px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(CONSUMABLE_EMOJI[consumableId] ?? '✨', 64, 66);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  consumableEmojiTextureCache.set(consumableId, texture);
  return texture;
}

function getParalysisTriangleTexture(): THREE.Texture {
  if (paralysisTriangleTexture) return paralysisTriangleTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);

  ctx.shadowColor = 'rgba(0,0,0,0.75)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = 'rgba(30,20,8,0.95)';
  ctx.beginPath();
  ctx.moveTo(20, 26);
  ctx.lineTo(108, 26);
  ctx.lineTo(64, 110);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(194,128,32,0.92)';
  ctx.beginPath();
  ctx.moveTo(29, 34);
  ctx.lineTo(99, 34);
  ctx.lineTo(64, 98);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(12,8,4,0.98)';
  ctx.lineWidth = 8;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(20, 26);
  ctx.lineTo(108, 26);
  ctx.lineTo(64, 110);
  ctx.closePath();
  ctx.stroke();

  ctx.strokeStyle = 'rgba(238,190,72,0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(38, 43);
  ctx.lineTo(90, 43);
  ctx.stroke();

  paralysisTriangleTexture = new THREE.CanvasTexture(canvas);
  paralysisTriangleTexture.colorSpace = THREE.SRGBColorSpace;
  return paralysisTriangleTexture;
}

/** 毒师神经毒素：墨绿色倒三角标记（形似麻痹三角，配色改墨绿）。 */
function getNeuroTriangleTexture(): THREE.Texture {
  if (neuroTriangleTexture) return neuroTriangleTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);

  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = 'rgba(6,28,12,0.95)';
  ctx.beginPath();
  ctx.moveTo(20, 26);
  ctx.lineTo(108, 26);
  ctx.lineTo(64, 110);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(31,94,42,0.95)'; // 墨绿
  ctx.beginPath();
  ctx.moveTo(29, 34);
  ctx.lineTo(99, 34);
  ctx.lineTo(64, 98);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(4,18,8,0.98)';
  ctx.lineWidth = 8;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(20, 26);
  ctx.lineTo(108, 26);
  ctx.lineTo(64, 110);
  ctx.closePath();
  ctx.stroke();

  ctx.strokeStyle = 'rgba(120,200,110,0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(38, 43);
  ctx.lineTo(90, 43);
  ctx.stroke();

  neuroTriangleTexture = new THREE.CanvasTexture(canvas);
  neuroTriangleTexture.colorSpace = THREE.SRGBColorSpace;
  return neuroTriangleTexture;
}

/** 猎标烙印：红色狙击瞄准标识（圆环 + 十字）。 */
function getHunterCrosshairTexture(): THREE.Texture {
  if (hunterCrosshairTexture) return hunterCrosshairTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);

  ctx.shadowColor = 'rgba(255,40,40,0.7)';
  ctx.shadowBlur = 8;
  ctx.strokeStyle = 'rgba(255,40,40,0.95)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(64, 64, 40, 0, Math.PI * 2);
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.lineWidth = 5;
  // 十字（四段，留出中心空隙）
  ctx.beginPath();
  ctx.moveTo(64, 8); ctx.lineTo(64, 40);
  ctx.moveTo(64, 88); ctx.lineTo(64, 120);
  ctx.moveTo(8, 64); ctx.lineTo(40, 64);
  ctx.moveTo(88, 64); ctx.lineTo(120, 64);
  ctx.stroke();

  // 中心点
  ctx.fillStyle = 'rgba(255,60,60,0.95)';
  ctx.beginPath();
  ctx.arc(64, 64, 5, 0, Math.PI * 2);
  ctx.fill();

  hunterCrosshairTexture = new THREE.CanvasTexture(canvas);
  hunterCrosshairTexture.colorSpace = THREE.SRGBColorSpace;
  return hunterCrosshairTexture;
}

/** 弧光导体：蓝色径向发光（加色混合贴敌人身上）。 */
function getConductorGlowTexture(): THREE.Texture {
  if (conductorGlowTexture) return conductorGlowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(120,200,255,0.85)');
  grad.addColorStop(0.4, 'rgba(40,120,255,0.45)');
  grad.addColorStop(1, 'rgba(20,60,200,0.0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(64, 64, 62, 0, Math.PI * 2);
  ctx.fill();
  conductorGlowTexture = new THREE.CanvasTexture(canvas);
  conductorGlowTexture.colorSpace = THREE.SRGBColorSpace;
  return conductorGlowTexture;
}

/** 奥术奥秘爆发光球：蓝紫径向发光。 */
function getArcaneOrbTexture(): THREE.Texture {
  if (arcaneOrbTexture) return arcaneOrbTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);
  const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  grad.addColorStop(0, 'rgba(220,210,255,0.95)');
  grad.addColorStop(0.35, 'rgba(150,90,255,0.8)');
  grad.addColorStop(0.7, 'rgba(80,60,230,0.35)');
  grad.addColorStop(1, 'rgba(60,40,180,0.0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(64, 64, 62, 0, Math.PI * 2);
  ctx.fill();
  arcaneOrbTexture = new THREE.CanvasTexture(canvas);
  arcaneOrbTexture.colorSpace = THREE.SRGBColorSpace;
  return arcaneOrbTexture;
}

const RARITY_COLORS: Record<string, string> = {
  common: '#aaaaaa',
  uncommon: '#44cc44',
  rare: '#4488ff',
  legendary: '#ffaa00',
};

// 羁绊档位边框：T1 铜 / T2 银 / T3 金
const BOND_TIER_COLORS: Record<number, string> = {
  1: '#cd7f32',
  2: '#c8c8d4',
  3: '#ffcc00',
};

const SHRINE_REWARD_ICONS: Record<string, string> = {
  damage: '⚔️',
  shield: '🛡️',
  pickup_range: '🧲',
  crit_damage: '💥',
  luck: '🍀',
  projectile_count: '🏹',
  hp_regen: '❤️',
  knockback: '💨',
  attack_speed: '⚡',
  difficulty: '☠️',
  lifesteal: '🩸',
  powerup_multiplier: '🔋',
  elite_damage: '👑',
  duration: '⏳',
  jump_height: '🪂',
  movement_speed: '👟',
};

const CHARACTER_COLORS: Record<string, number> = {
  megachad: 0xa8e6cf,
  roberto: 0xff4444,
  skateboard_skeleton: 0x999999,
};

const CHARACTER_AVATAR_PATHS: Record<CharacterType, string> = {
  megachad: '/ui/characters/megachad_avatar.png',
  roberto: '/ui/characters/roberto_avatar.png',
  skateboard_skeleton: '/ui/characters/skateboard_skeleton_avatar.png',
};

const CHARACTER_FULL_PATHS: Record<CharacterType, string> = {
  megachad: '/ui/characters/megachad_full.png',
  roberto: '/ui/characters/roberto_full.png',
  skateboard_skeleton: '/ui/characters/skateboard_skeleton_full.png',
};

const CHARACTER_SELECT_BACK_ICON = '/ui/button/back.png';
const LANG_BUTTON_CN = '/ui/button/btn_lang_cn.png';
const LANG_BUTTON_EN = '/ui/button/btn_lang_en.png';
const CHARACTER_DETAIL_PANEL_BG = '/ui/panel/character_detail.png';
/** character_detail.png 原图 1025×1651，背景可拉伸；文本 inset 按原图像素换算为百分比 */
const CHARACTER_DETAIL_PANEL_SIZE = { w: 1025, h: 1651 } as const;
const CHARACTER_WEAPON_DETAIL_PANEL_BG = '/ui/panel/character_weapon_detail.png';
/** character_weapon_detail.png 原图 1435×621 */
const CHARACTER_WEAPON_DETAIL_PANEL_SIZE = { w: 1435, h: 621 } as const;
const CHARACTER_DETAIL_LAYOUT = {
  /** 背景内边距：左右对称；顶部高于名称；底部低于确认按钮 */
  pad: { top: 84, x: 92, bottom: 80 },
  sectionGap: 'clamp(6px,1.2vw,10px)',
  weaponPad: { top: 24, left: 100, right: 60, bottom: 24 },
  /** 武器子面板相对内容区宽度 */
  weaponPanelWidth: '100%',
  confirmGap: 'clamp(4px,1vw,8px)',
} as const;

const CHARACTER_CONFIRM_BUTTON_WIDTH = '96px';

function characterDetailInsetXPct(value: number): string {
  return `${((value / CHARACTER_DETAIL_PANEL_SIZE.w) * 100).toFixed(3)}%`;
}

function characterDetailInsetYPct(value: number): string {
  return `${((value / CHARACTER_DETAIL_PANEL_SIZE.h) * 100).toFixed(3)}%`;
}

function weaponDetailInsetXPct(value: number): string {
  return `${((value / CHARACTER_WEAPON_DETAIL_PANEL_SIZE.w) * 100).toFixed(3)}%`;
}

function weaponDetailInsetYPct(value: number): string {
  return `${((value / CHARACTER_WEAPON_DETAIL_PANEL_SIZE.h) * 100).toFixed(3)}%`;
}

const TIER_PANEL_BGS: Record<DifficultyTier, string> = {
  1: '/ui/panel/difficulty_normal.png',
  2: '/ui/panel/difficulty_hard.png',
  3: '/ui/panel/difficulty_nightmare.png',
};

/** 各难度面板原图尺寸（用于 aspect-ratio，避免拉伸） */
const TIER_PANEL_SIZE: Record<DifficultyTier, { w: number; h: number }> = {
  1: { w: 602, h: 920 },
  2: { w: 580, h: 920 },
  3: { w: 584, h: 919 },
};

const SHOP_ITEM_LIST_PANEL_BG = '/ui/shop/shop_panel_itemlist.png';
/** shop_panel_itemlist.png 原图 966×646，用于 aspect-ratio，避免拉伸 */
const SHOP_ITEM_LIST_PANEL_SIZE = { w: 966, h: 646 } as const;

const SHOP_ITEM_PANEL_BG = '/ui/shop/shop_item_bg.png';
/** shop_item_bg.png 原图 353×331，用于 aspect-ratio，避免拉伸 */
const SHOP_ITEM_PANEL_SIZE = { w: 353, h: 331 } as const;
const SHOP_BUY_BUTTON_FRAME = '/ui/button/button_green.png';
const SHOP_BUY_BUTTON_PRESSED_FRAME = '/ui/button/button_green_pressed.png';
const SHOP_ITEM_TITLE_COLOR = '#1a3a6e';

const SHOP_ITEM_ICONS: Record<string, string> = {
  max_hp: '/ui/shop/shop_item_hp.png',
  damage: '/ui/shop/shop_item_atk.png',
  speed: '/ui/shop/shop_item_spd.png',
  crit: '/ui/shop/shop_item_crit.png',
  pickup_radius: '/ui/shop/shop_item_range.png',
  armor: '/ui/shop/shop_item_armor.png',
  xp_gain: '/ui/shop/shop_item_exp.png',
  starting_level: '/ui/shop/shop_item_lv.png',
};

const SHOP_LEVEL_SEGMENT_GREEN = '#44aa44';
const SHOP_LEVEL_SEGMENT_GRAY = '#c0c8d4';

function createShopLevelSegments(currentLevel: number, maxLevel: number): HTMLDivElement {
  const container = document.createElement('div');
  container.style.cssText = `
    display:flex;align-items:stretch;gap:clamp(1px,0.3vw,2px);
    flex:1;min-width:0;height:clamp(5px,1.2vw,7px);
  `;
  for (let i = 0; i < maxLevel; i++) {
    const seg = document.createElement('div');
    seg.style.cssText = `
      flex:1;min-width:0;height:100%;border-radius:1px;
      background:${i < currentLevel ? SHOP_LEVEL_SEGMENT_GREEN : SHOP_LEVEL_SEGMENT_GRAY};
    `;
    container.appendChild(seg);
  }
  return container;
}

const TIER_MONSTER_FRAME = '/ui/panel/frame_monster.png';
const TIER_MONSTER_FRAME_SIZE = { w: 692, h: 922 };
/** 绿 / 黄 / 紫僵尸头像，对应 zombie_basic · zombie_chubby · zombie_arm */
const TIER_MONSTER_AVATARS = [
  '/ui/characters/green_zombie_avatar.png',
  '/ui/characters/yellow_zombie_avatar.png',
  '/ui/characters/purple_zombie_avatar.png',
] as const;

const CHARACTER_AVATAR_FRAMES: Record<CharacterType, { normal: string; selected: string }> = {
  megachad: {
    normal: '/ui/button/frame_avatar_green_normal.png',
    selected: '/ui/button/frame_avatar_green_selected.png',
  },
  roberto: {
    normal: '/ui/button/frame_avatar_red_normal.png',
    selected: '/ui/button/frame_avatar_red_selected.png',
  },
  skateboard_skeleton: {
    normal: '/ui/button/frame_avatar_gray_normal.png',
    selected: '/ui/button/frame_avatar_gray_selected.png',
  },
};

const STARTING_WEAPON_IMAGE_PATHS: Record<string, string> = {
  sword: '/ui/weapons/sword.png',
  axe: '/ui/weapons/axe.png',
  bone_bouncer: '/ui/weapons/bone_bouncer.png',
};

/** 选角右侧详情面板正文色（深蓝，与主菜单按钮字色一致） */
const CHARACTER_DETAIL_TEXT_COLOR = '#1a3a6e';
const CHARACTER_DETAIL_TRAIT_DESC_COLOR = '#5a5a6e';
const CHARACTER_PREVIEW_STAGE_BG = 'rgba(220,225,232,0.7)';

/** 与 docs/index.html#characters 百分条分母一致 */
const CHARACTER_STAT_BAR_MAX = {
  hp: 200,
  speed: 6,
  damage: 1.5,
  armor: 5,
  crit: 0.15,
} as const;

const STAT_BAR_TRACK_BG = '#d9e0ed';
/** 进度条填充：亮蓝，区别于正文深蓝 CHARACTER_DETAIL_TEXT_COLOR */
const STAT_BAR_FILL = '#3b7ddd';

const TITLE_IMAGE_PATH = '/ui/title/megabonk_title.png';
const LOBBY_BG_PATH = '/ui/common/bg_lobby.png';
const SHOP_BG_PATH = '/ui/common/bg_shop.png';
const QUESTS_BG_PATH = '/ui/common/bg_quests.png';
const QUEST_LIST_PANEL_BG = '/ui/quests/task_panel_list.png';
/** task_panel_list.png 原图 966×646，用于 aspect-ratio，避免拉伸 */
const QUEST_LIST_PANEL_SIZE = { w: 966, h: 646 } as const;
const QUEST_ITEM_BG = '/ui/quests/task_item_bg.png';
/** 滚动区相对 panel 图片内容区的内边距比例 */
const QUEST_LIST_SCROLL_INSET = { top: 0.11, right: 0.09, bottom: 0.11, left: 0.09 } as const;
/** 分类列表相对 panel 图片顶部的额外下移比例 */
const QUEST_CATEGORY_SIDEBAR_OFFSET_RATIO = 0.05;

const MENU_BUTTON_FRAME = '/ui/button/button.png';
const CHARACTER_CONFIRM_BUTTON_FRAME = '/ui/button/button_orange.png';
const TIER_SELECT_BUTTON_NORMAL = '/ui/button/button_orange.png';
const TIER_SELECT_BUTTON_PRESSED = '/ui/button/button_orange_pressed.png';
const QUEST_CATEGORY_BUTTON_NORMAL = '/ui/button/button_gray.png';
const QUEST_ACTION_BUTTON_ORANGE = '/ui/button/button_orange.png';
const QUEST_ACTION_BUTTON_ORANGE_PRESSED = '/ui/button/button_orange_pressed.png';
const QUEST_ACTION_BUTTON_GREEN = '/ui/button/button_green.png';
const QUEST_ACTION_BUTTON_GREEN_PRESSED = '/ui/button/button_green_pressed.png';
const QUEST_ACTION_BUTTON_GRAY = '/ui/button/button_gray.png';
const QUEST_ACTION_BUTTON_GRAY_PRESSED = '/ui/button/button_gray_pressed.png';
const QUEST_TEXT_COLOR = '#1a3a6e';
const MENU_BUTTON_ICONS = {
  start: '/ui/button/pause.png',
  shop: '/ui/button/shop.png',
  quest: '/ui/button/task.png',
} as const;

const MENU_BUTTON_LABEL_COLOR = '#1a3a6e';

const SILVER_COIN_ICON_PATH = '/ui/panel/coin_silver.png';
const SILVER_BADGE_BG = '#1a3a6e';

function createSilverBadge(count: number, prefix = ''): HTMLDivElement {
  const badge = document.createElement('div');
  badge.dataset.silverBadge = '1';
  badge.style.cssText = `
    display:inline-flex;align-items:center;gap:8px;
    background:${SILVER_BADGE_BG};border-radius:9999px;box-sizing:border-box;
    padding:0 14px 0 4px;
  `;

  const icon = document.createElement('img');
  icon.src = SILVER_COIN_ICON_PATH;
  icon.alt = '';
  icon.draggable = false;
  icon.style.cssText = 'width:36px;height:36px;object-fit:contain;flex-shrink:0;display:block;';

  const amount = document.createElement('span');
  amount.className = 'silver-badge-amount';
  amount.style.cssText = 'color:#ffffff;font-size:17px;font-weight:bold;line-height:1;white-space:nowrap;';
  amount.textContent = `${prefix}${count}`;

  badge.appendChild(icon);
  badge.appendChild(amount);
  return badge;
}

function setSilverBadgeAmount(badge: HTMLDivElement, count: number, prefix = ''): void {
  const amount = badge.querySelector('.silver-badge-amount');
  if (amount) amount.textContent = `${prefix}${count}`;
}

function createGoldBadge(count: number): HTMLDivElement {
  const badge = document.createElement('div');
  badge.dataset.goldBadge = '1';
  badge.style.cssText = `
    display:inline-flex;align-items:center;gap:6px;
    background:rgba(84,54,10,0.86);border:1px solid rgba(255,204,51,0.55);
    border-radius:9999px;box-sizing:border-box;padding:5px 12px;
    color:#ffe28a;font-size:15px;font-weight:bold;line-height:1;
    text-shadow:0 1px 3px rgba(0,0,0,0.85);
    box-shadow:0 0 12px rgba(255,190,40,0.18);
  `;
  const icon = document.createElement('span');
  icon.textContent = '🪙';
  icon.style.cssText = 'font-size:17px;line-height:1;';
  const amount = document.createElement('span');
  amount.className = 'gold-badge-amount';
  amount.textContent = String(count);
  badge.appendChild(icon);
  badge.appendChild(amount);
  return badge;
}

function setGoldBadgeAmount(badge: HTMLDivElement, count: number): void {
  const amount = badge.querySelector('.gold-badge-amount');
  if (amount) amount.textContent = String(count);
}

/** Strip the pill background/border so a coin badge renders as a bare icon + number (for the in-run HUD). */
function stripBadgeBackground(badge: HTMLDivElement): void {
  badge.style.background = 'transparent';
  badge.style.border = 'none';
  badge.style.boxShadow = 'none';
  badge.style.padding = '0';
  badge.style.gap = '4px';
  badge.style.textShadow = '0 1px 3px rgba(0,0,0,0.9)';
  // Normalize an oversized image icon (silver coin is 36px in the pill) to match the row.
  const img = badge.querySelector('img');
  if (img) {
    (img as HTMLImageElement).style.width = '22px';
    (img as HTMLImageElement).style.height = '22px';
  }
}

function languageButtonIconSrc(): string {
  return getLocale() === 'zh' ? LANG_BUTTON_CN : LANG_BUTTON_EN;
}

/** Icon-based language switcher; skipped when i18n mode is locked or only one locale. */
function createLanguageSwitcherButton(): HTMLButtonElement | null {
  if (getMode() === 'locked') return null;
  const locales = getAvailableLocales();
  if (locales.length < 2) return null;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Switch language / 切换语言');
  btn.title = 'Switch language / 切换语言';
  btn.style.cssText = `
    min-width:44px;min-height:44px;padding:0;border:none;background:transparent;cursor:pointer;
    touch-action:manipulation;display:flex;align-items:center;justify-content:center;flex-shrink:0;
    transition:transform 0.15s;
  `;

  const img = document.createElement('img');
  img.src = languageButtonIconSrc();
  img.alt = '';
  img.draggable = false;
  img.style.cssText = 'width:44px;height:44px;object-fit:contain;pointer-events:none;';
  btn.appendChild(img);

  btn.addEventListener('click', () => {
    const current = getLocale();
    const idx = locales.indexOf(current);
    const next = locales[(idx + 1) % locales.length];
    setLocale(next);
    location.reload();
  });
  btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.05)'; });
  btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; });
  return btn;
}

const GROUND_SIZE = 120;
const DAMAGE_NUM_POOL_SIZE = 30;

// =============================================================================
// Toon/Cel-Shading Utilities
// =============================================================================

/** 3-step gradient map for MeshToonMaterial (shadow / mid / highlight) */
function createToonGradientMap(): THREE.DataTexture {
  // 3 段明暗阶梯（阴影 / 中间调 / 高光）—— 荒野乱斗式光影断层。
  // MeshToonMaterial 按 NdotL 采样此 ramp 的 .r 通道；NearestFilter 保证硬断层不被插值糊掉。
  // 暗端用高地板（130 而非 0）：背光面仍明亮、阴影不发黑发闷 —— 荒野乱斗的高亮通透感。
  const colors = new Uint8Array([
    85, 85, 85, 255,     // 阴影（拉开对比找回立体感，但不死黑）
    180, 180, 180, 255,  // 中间调
    255, 255, 255, 255,  // 高光
  ]);
  const gradMap = new THREE.DataTexture(colors, colors.length / 4, 1, THREE.RGBAFormat);
  gradMap.minFilter = THREE.NearestFilter;
  gradMap.magFilter = THREE.NearestFilter;
  gradMap.needsUpdate = true;
  return gradMap;
}

const toonGradientMap = createToonGradientMap();

/**
 * Convert all mesh materials in a scene to MeshToonMaterial (cel-shading).
 * Preserves color/map/normalMap from original materials.
 */
/** 提升颜色饱和度（HSL 的 s ×factor），用于 toon 的"饱满高饱和纯色块"观感。 */
function boostMaterialSaturation(color: THREE.Color, factor: number): void {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  color.setHSL(hsl.h, Math.min(1, hsl.s * factor), hsl.l);
}

/** 贴图过滤：各向异性 + mipmap，提升近景 / 斜视下的贴图清晰度（PR #56）。 */
function tuneToonTexture(tex: THREE.Texture | null | undefined): void {
  if (!tex) return;
  tex.anisotropy = 8;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
}

/**
 * 风格化叠加 GLSL（注入到 MeshToonMaterial 片元，在 <opaque_fragment> 前）：
 *   1) Rim light（菲涅尔边缘光）—— 角色边缘一圈冷亮，从背景弹出（荒野乱斗最关键的质感）。
 *   2) Toon specular（硬边高光）—— 塑料玩具般的光泽点。
 *   3) Colored shadow（暗部染冷色）—— 阴影不发黑发闷，带通透冷调。
 * 全部在线性空间叠加；光向用「固定视空间方向」(随相机稳定，免每帧更新 uniform)。
 * 调参直接改下面的常量：rim 的 pow(越大越细)/×强度/色；spec 的 pow(越大越紧)/边/强；shadow 的 tint/阈值/量。
 */
const STYLIZED_TOON_GLSL = `
	{
		vec3 N = normalize( normal );
		vec3 V = normalize( vViewPosition );                       // 片元 -> 相机(视空间)
		vec3 LDIR = normalize( vec3( -0.35, 0.65, 0.55 ) );        // 固定视空间光向(左上前)
		float NdL = dot( N, LDIR );

		// 1) Rim light（菲涅尔边缘光）
		float fres = 1.0 - saturate( dot( N, V ) );
		float rim = pow( fres, 2.5 ) * 0.55;                       // pow=细度, 0.55=强度
		rim *= smoothstep( -0.3, 0.4, NdL );                       // 背光侧淡出
		outgoingLight += rim * vec3( 1.0, 1.05, 1.2 );             // 冷白 rim 色

		// 2) Toon specular（硬边高光）—— 强度按 uSpec（怪物/场景=0 哑光，主角/武器>0）
		vec3 H = normalize( LDIR + V );
		float sp = pow( saturate( dot( N, H ) ), 24.0 );           // 24=高光紧致度
		sp = smoothstep( 0.5, 0.53, sp ) * uSpec;                  // 硬边 × per-material 强度
		sp *= saturate( NdL );                                     // 背光无高光
		outgoingLight += vec3( sp );

		// 3) Colored shadow（暗部染冷色）
		float lum = dot( outgoingLight, vec3( 0.299, 0.587, 0.114 ) );
		float shMask = 1.0 - smoothstep( 0.0, 0.35, lum );         // 0.35=暗部判定阈值
		outgoingLight = mix( outgoingLight, outgoingLight * vec3( 0.82, 0.88, 1.12 ), shMask * 0.4 ); // 冷 tint, 0.4 量
	}
`;

/**
 * 给 MeshToonMaterial 挂上风格化叠加（rim + toon spec + 染色阴影）。
 * specStrength：toon 高光强度（per-material uniform）。怪物/场景传 0（哑光，避免"油光水滑"），
 * 主角/武器传 >0 保留塑料玩具光泽。rim 与染色阴影对所有材质恒定。
 * 幂等（userData 标记，避免重复注入触发重编译）；共享同一编译程序（uSpec 只是 uniform 值差异）。
 */
function applyStylizedToonShading(mat: THREE.MeshToonMaterial, specStrength = 0): void {
  if (mat.userData['__stylized']) return;
  mat.userData['__stylized'] = true;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms['uSpec'] = { value: specStrength };
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uSpec;\nvoid main() {')
      .replace(
        '#include <opaque_fragment>',
        `${STYLIZED_TOON_GLSL}\n\t#include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => 'stylized-toon-v1';
}

/**
 * EffectComposer 首道 pass：用 OutlineEffect 把「场景 + 黑描边」渲进 composer 缓冲，
 * 让后续 bloom 能在保留描边的前提下叠加辉光（OutlineEffect 尊重预设 renderTarget）。
 * 渲到目标时引擎自动禁 in-material tonemap → 缓冲为线性 HDR，交末端 OutputPass 统一 ACES+sRGB。
 */
class OutlineComposerPass extends Pass {
  constructor(
    private readonly outline: { render(scene: THREE.Scene, camera: THREE.Camera): void },
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
  ) {
    super();
    this.needsSwap = false;
    this.clear = true;
  }

  render(renderer: THREE.WebGLRenderer, _writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    if (this.clear) renderer.clear();
    this.outline.render(this.scene, this.camera);
  }
}

function convertToToonMaterials(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const toonMats = materials.map((mat) => {
      if (mat instanceof THREE.MeshToonMaterial) {
        tuneToonTexture(mat.map);
        tuneToonTexture(mat.emissiveMap);
        applyStylizedToonShading(mat); // 已是 toon：补挂风格化叠加
        return mat;
      }
      const oldMat = mat as THREE.MeshStandardMaterial | THREE.MeshPhongMaterial | THREE.MeshLambertMaterial;
      const color = (oldMat.color ?? new THREE.Color(0xffffff)).clone();
      boostMaterialSaturation(color, 1.5); // 敌人/场景/道具统一高饱和（与玩家 ×1.6 对齐）
      // 保留 emissive / emissiveMap：霓虹屏幕、发光贴图在 toon 转换后不丢（PR #56）。
      const map = oldMat.map ?? null;
      const emissiveMap = oldMat.emissiveMap ?? null;
      tuneToonTexture(map);
      tuneToonTexture(emissiveMap);
      const toon = new THREE.MeshToonMaterial({
        color,
        map,
        emissive: oldMat.emissive ?? new THREE.Color(0x000000),
        emissiveMap,
        gradientMap: toonGradientMap,
        side: oldMat.side ?? THREE.FrontSide,
        transparent: oldMat.transparent ?? false,
        opacity: oldMat.opacity ?? 1,
      });
      toon.name = oldMat.name || 'ToonMat';
      applyStylizedToonShading(toon); // rim + toon spec + 染色阴影
      return toon;
    });
    mesh.material = toonMats.length === 1 ? toonMats[0] : toonMats;
  });
}

/**
 * Lift weapon materials so they don't collapse to near-black under our 3-step
 * toon ramp. Applies a gamma curve (darks brighten more than brights) plus a
 * small emissive floor so the shadow side stays readable.
 *
 * IMPORTANT: only call this on weapon meshes. Chests, scenery, and player
 * models intentionally keep their original tones.
 */
function brightenWeaponMaterials(root: THREE.Object3D): void {
  const gamma = 0.55;
  const emissiveFloor = 0.18;
  root.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const lifted = mats.map((mat) => {
      const m = mat as THREE.MeshToonMaterial;
      const original = (m.color ?? new THREE.Color(0xffffff)).clone();
      const c = new THREE.Color(
        Math.pow(original.r, gamma),
        Math.pow(original.g, gamma),
        Math.pow(original.b, gamma),
      );
      const newMat = new THREE.MeshToonMaterial({
        color: c,
        emissive: c.clone().multiplyScalar(emissiveFloor),
        map: m.map ?? null,
        gradientMap: m.gradientMap ?? toonGradientMap,
        side: m.side ?? THREE.FrontSide,
        transparent: m.transparent ?? false,
        opacity: m.opacity ?? 1,
      });
      newMat.name = m.name || 'WeaponToon';
      applyStylizedToonShading(newMat, 0.35); // 武器留一点高光
      return newMat;
    });
    mesh.material = lifted.length === 1 ? lifted[0] : lifted;
  });
}

function applyChestGoldMaterials(root: THREE.Object3D): void {
  let meshIndex = 0;
  root.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const lifted = mats.map((mat, matIndex) => {
      const source = mat as THREE.MeshToonMaterial;
      const sourceColor = source.color ?? new THREE.Color(0x8a4a20);
      const isMetal = meshIndex % 3 === 0 || matIndex > 0 || sourceColor.r > sourceColor.g;
      const color = isMetal ? new THREE.Color(0xffc44d) : new THREE.Color(0x9a5528);
      const emissive = isMetal ? new THREE.Color(0x7a4a10) : new THREE.Color(0x261006);
      const chestMat = new THREE.MeshToonMaterial({
        color,
        emissive,
        gradientMap: toonGradientMap,
        side: source.side ?? THREE.FrontSide,
        transparent: source.transparent ?? false,
        opacity: source.opacity ?? 1,
      });
      chestMat.name = `ChestReadable_${meshIndex}_${matIndex}`;
      return chestMat;
    });
    mesh.material = lifted.length === 1 ? lifted[0] : lifted;
    meshIndex++;
  });
}

const WEAPON_ICONS: Record<string, string> = {
  sword: '🗡️',
  bone_bouncer: '🦴',
  axe: '🪓',
  bow: '🔫',
  lightning_staff: '⚡',
  flame_ring: '🔥',
  shotgun: '💥',
  ray_gun: '🔴',
  poison_bomb: '☠️',
  paralysis_gun: '⚠️',
  void_ripple: '🌀',
  scorch_boots: '🥾',
};

const TOME_ICONS: Record<string, string> = {
  attack_speed_tome: '⚡',
  life_tome: '❤️',
  consumable_tome: '🎒',
  luck_tome: '🍀',
  thorns_tome: '🌹',
  shield_tome: '🛡️',
  xp_gain_tome: '📚',
  attraction_tome: '🧲',
  curse_tome: '💀',
  precision_tome: '🎯',
  knockback_tome: '💨',
  speed_tome: '👟',
};

const TOME_COLORS: Record<string, string> = {
  attack_speed_tome: '#ffaa00',
  life_tome: '#ff6666',
  consumable_tome: '#cc9966',
  luck_tome: '#44cc44',
  thorns_tome: '#cc4444',
  shield_tome: '#4488ff',
  xp_gain_tome: '#aa44ff',
  attraction_tome: '#ff44aa',
  curse_tome: '#884488',
  precision_tome: '#ff8800',
  knockback_tome: '#88cccc',
  speed_tome: '#44ffaa',
};

function escapeTooltipText(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTooltipNumber(value: number, digits = 1): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function formatTooltipPercent(value: number, digits = 0): string {
  return `${formatTooltipNumber(value * 100, digits)}%`;
}

const TIER_COLORS: Record<number, string> = {
  1: '#aaaaaa',
  2: '#ff8844',
  3: '#ff4444',
};

// =============================================================================
// Asset Loader — loads GLB models
// =============================================================================

interface LoadedModels {
  player: THREE.Group | null;
  zombie_basic: THREE.Group | null;
  zombie_chubby: THREE.Group | null;
  zombie_arm: THREE.Group | null;
  boss: THREE.Group | null;
  tombstone: THREE.Group | null;
  tree: THREE.Group | null;
  teleporter: THREE.Group | null;
  platform: THREE.Group | null;
  pickup: THREE.Group | null;
  // Cyberpunk platform models
  platform_4x4: THREE.Group | null;
  platform_4x2: THREE.Group | null;
  platform_2x2: THREE.Group | null;
  platform_1x1: THREE.Group | null;
  support: THREE.Group | null;
  support_long: THREE.Group | null;
  rail_long: THREE.Group | null;
  fence_platform: THREE.Group | null;
  light_street: THREE.Group | null;
  sign_1: THREE.Group | null;
  sign_2: THREE.Group | null;
  ac_unit: THREE.Group | null;
  pipe_1: THREE.Group | null;
  door: THREE.Group | null;
}

const gltfLoader = new GLTFLoader();
const loadedModels: LoadedModels = {
  player: null,
  zombie_basic: null,
  zombie_chubby: null,
  zombie_arm: null,
  boss: null,
  tombstone: null,
  tree: null,
  teleporter: null,
  platform: null,
  pickup: null,
  // Cyberpunk platform models
  platform_4x4: null,
  platform_4x2: null,
  platform_2x2: null,
  platform_1x1: null,
  support: null,
  support_long: null,
  rail_long: null,
  fence_platform: null,
  light_street: null,
  sign_1: null,
  sign_2: null,
  ac_unit: null,
  pipe_1: null,
  door: null,
};

// Animation clips storage per model key
const loadedAnimClips: Map<string, THREE.AnimationClip[]> = new Map();

async function loadModels(): Promise<void> {
  const modelPaths: [keyof LoadedModels, string][] = [
    ['player', '/models/player_cyberpunk.gltf'],
    ['zombie_basic', '/models/zombie_basic.gltf'],
    ['zombie_chubby', '/models/zombie_chubby.gltf'],
    ['zombie_arm', '/models/zombie_arm.gltf'],
    ['boss', '/models/enemy_large_gun.gltf'],
    ['teleporter', '/models/turret_teleporter.gltf'],
    ['platform', '/models/platform_4x1.gltf'],
    ['pickup', '/models/collectible_gear.gltf'],
    ['tombstone', '/models/tombstone.glb'],
    ['tree', '/models/tree.glb'],
    // Cyberpunk platform kit
    ['platform_4x4', '/models/platform_4x4_full.gltf'],
    ['platform_4x2', '/models/platform_4x2.gltf'],
    ['platform_2x2', '/models/platform_2x2.gltf'],
    ['platform_1x1', '/models/platform_1x1.gltf'],
    ['support', '/models/support.gltf'],
    ['support_long', '/models/support_long.gltf'],
    ['rail_long', '/models/rail_long.gltf'],
    ['fence_platform', '/models/fence_platform.gltf'],
    ['light_street', '/models/light_street_1.gltf'],
    ['sign_1', '/models/sign_1.gltf'],
    ['sign_2', '/models/sign_2.gltf'],
    ['ac_unit', '/models/ac_unit.gltf'],
    ['pipe_1', '/models/pipe_1.gltf'],
    ['door', '/models/door.gltf'],
  ];

  const promises = modelPaths.map(async ([key, path]) => {
    try {
      const gltf = await gltfLoader.loadAsync(path);
      const model = gltf.scene;
      model.name = `Model_${key}`;
      // Convert all materials to cel-shading toon style
      convertToToonMaterials(model);
      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      loadedModels[key] = model;
      // Store animation clips for skeletal animation
      if (gltf.animations && gltf.animations.length > 0) {
        loadedAnimClips.set(key, gltf.animations);
        console.log(`[Assets] Loaded: ${key} (${path}) — ${gltf.animations.length} animations`);
      } else {
        console.log(`[Assets] Loaded: ${key} (${path})`);
      }
    } catch (err) {
      console.warn(`[Assets] Failed to load ${key} (${path}):`, err);
      loadedModels[key] = null;
    }
  });

  await Promise.all(promises);

  // Load OBJ item models for pickups/projectiles
  await loadObjItems();
}

// =============================================================================
// Level Loader — parse a Blender-exported .glb into LevelData + whitebox scene
// =============================================================================
//
// 约定（见 level-editor/WHITEBOX_SPEC.md）：
//   导出时勾 +Y Up，所以加载进 Three 后的坐标已是游戏坐标系（无需再转 Y→-Z）。
//   物体名前缀决定类型：
//     col_*   → 可站立地面（height = 包围盒顶面 box.max.y）
//     wall_*  → 实心遮挡（bottomY~topY = 包围盒）
//     climb_* → 攀爬体（同 wall_）
//     spawn_player / spawn_altar / spawn_chest / spawn_enemy_*
//     其它    → 视觉模型（直接随场景渲染）
//
// === 双文件模式（推荐生产用）===
//   /models/levels/level_${name}.glb         视觉高模（玩家看到的关卡）
//   /models/levels/level_${name}_col.glb     碰撞低模（只含 col_/wall_/climb_/ramp_/spawn_*）
//
//   - 双文件都存在 → 视觉用 visual 文件，碰撞 100% 来自 col 文件（视觉文件里的 col_*
//     prefix 会被忽略，避免双源冲突）
//   - 只有 visual  → 单文件模式（向后兼容），从 visual 同时解析视觉 + 碰撞
//   - 只有 col     → 灰盒/纯碰撞测试，col 同时充当视觉
//   - 都不在       → 回退到内置 Neon Crucible

const DEFAULT_LEVEL_NAME = 'whitebox';

/** 已加载的关卡（数据 + 用于渲染的场景）。null = 用内置硬编码 arena。 */
let loadedLevel: { data: LevelData; scene: THREE.Object3D } | null = null;

const _box = new THREE.Box3();
const _vec = new THREE.Vector3();

/**
 * 分析一个物体「朝上的表面」是平的还是斜的。
 *
 * 关键算法：用**面积加权的法线累加**算斜坡的真实上坡方向 ——
 * 比单纯取「最低/最高顶点的 XZ 连线」鲁棒得多（后者在多顶点共享 lo/hi y 时
 * 容易选到对角顶点，误差大）。
 *
 * 返回：
 *   - sloped: 顶面 y 跨度 > 0.3 即视为斜坡
 *   - lowY / highY: 顶面 y 范围
 *   - normalSum: 所有朝上三角面法线的面积加权和（未归一化）
 *   - topVerts: 所有顶面顶点的世界坐标拷贝
 */
function analyzeTopSurface(node: THREE.Object3D): {
  sloped: boolean;
  lowY: number;
  highY: number;
  normalSum: { x: number; y: number; z: number };
  topVerts: THREE.Vector3[];
} {
  let lowY = Infinity;
  let highY = -Infinity;
  let nx = 0, ny = 0, nz = 0;
  const topVerts: THREE.Vector3[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const n = new THREE.Vector3();

  node.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const pos = mesh.geometry.attributes.position as THREE.BufferAttribute | undefined;
    if (!pos) return;
    mesh.updateWorldMatrix(true, false);
    const m = mesh.matrixWorld;
    const index = mesh.geometry.index;
    const triCount = index ? index.count / 3 : pos.count / 3;
    for (let t = 0; t < triCount; t++) {
      const i0 = index ? index.getX(t * 3) : t * 3;
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(m);
      b.fromBufferAttribute(pos, i1).applyMatrix4(m);
      c.fromBufferAttribute(pos, i2).applyMatrix4(m);
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      n.crossVectors(ab, ac); // 未归一化（长度 = 2 × 三角面积）
      const len = n.length();
      if (len < 1e-6) continue; // 退化三角面
      // 判定朝上（unit n.y > 0.5）。法线已未归一化，单独算 unit y。
      if (n.y / len <= 0.5) continue;
      // 面积加权累加（直接加未归一化法线 ⇒ area weighted）
      nx += n.x; ny += n.y; nz += n.z;
      for (const v of [a, b, c]) {
        if (v.y < lowY) lowY = v.y;
        if (v.y > highY) highY = v.y;
        topVerts.push(v.clone());
      }
    }
  });

  const sloped =
    Number.isFinite(lowY) && Number.isFinite(highY) && highY - lowY > 0.3;
  return { sloped, lowY, highY, normalSum: { x: nx, y: ny, z: nz }, topVerts };
}

/** 从顶面分析结果构建 RampVolume，并为三角/梯形剖面的左右侧面生成实体侧墙。 */
function buildRampFromSurface(surf: ReturnType<typeof analyzeTopSurface>, box: THREE.Box3): RampVolume {
  const nHorizLen = Math.hypot(surf.normalSum.x, surf.normalSum.z);
  let slopeDirX = 1, slopeDirZ = 0;
  if (nHorizLen > 1e-4) {
    slopeDirX = -surf.normalSum.x / nHorizLen;
    slopeDirZ = -surf.normalSum.z / nHorizLen;
  }
  const perpX = -slopeDirZ;
  const perpZ = slopeDirX;
  let minS = Infinity, maxS = -Infinity, minP = Infinity, maxP = -Infinity;
  for (const v of surf.topVerts) {
    const s = v.x * slopeDirX + v.z * slopeDirZ;
    const p = v.x * perpX + v.z * perpZ;
    if (s < minS) minS = s;
    if (s > maxS) maxS = s;
    if (p < minP) minP = p;
    if (p > maxP) maxP = p;
  }
  const centerS = (minS + maxS) / 2;
  const centerP = (minP + maxP) / 2;
  const cx = centerS * slopeDirX + centerP * perpX;
  const cz = centerS * slopeDirZ + centerP * perpZ;
  const span = maxS - minS;
  const sBand = Math.max(span * 0.12, 0.05);
  // 取端点处的 MAX Y（= 上表面顶点高度），不用平均。
  // 厚楔形体低端的 upward-facing 三角面顶点同时包含上表面和底边顶点，
  // 平均值会被底边拉低，导致玩家内嵌在斜坡里。MAX 确保走在上表面。
  let lowMax = -Infinity, highMax = -Infinity;
  for (const v of surf.topVerts) {
    const s = v.x * slopeDirX + v.z * slopeDirZ;
    if (s <= minS + sBand && v.y > lowMax) lowMax = v.y;
    if (s >= maxS - sBand && v.y > highMax) highMax = v.y;
  }
  const halfSlope = span / 2;
  const halfPerp = (maxP - minP) / 2;
  return {
    cx, cz,
    halfSlope,
    halfPerp,
    slopeDirX, slopeDirZ,
    lowY: Number.isFinite(lowMax) ? lowMax : surf.lowY,
    highY: Number.isFinite(highMax) ? highMax : surf.highY,
  };
}

/**
 * 把 mesh 写成 ramp 或 col 实体盒（严格模式，对齐 WHITEBOX_SPEC §2.4）。
 * - ramp_ 前缀：可行走斜坡（顶面斜）。
 * - col_ 前缀：仅平顶平台（AABB 顶面）；顶面倾斜则**不生成碰撞**（纯视觉），
 *   避免厚楔形体挡路；要走斜坡必须在 Blender 单独摆薄 ramp_。
 */
function pushColOrRamp(
  node: THREE.Object3D,
  box: THREE.Box3,
  data: LevelData,
  isExplicitRamp: boolean,
): void {
  const surf = analyzeTopSurface(node);
  if (isExplicitRamp) {
    if (!surf.sloped || surf.topVerts.length === 0) {
      console.warn(`[Level] "${node.name}" 前缀是 ramp_ 但未检测到可行走斜面，已忽略。`);
      return;
    }
    data.ramps.push(buildRampFromSurface(surf, box));
    return;
  }
  if (surf.sloped) {
    console.warn(
      `[Level] "${node.name}" 顶面倾斜但前缀是 col_ → 不生成碰撞（纯视觉）。` +
      ` 要走斜坡请单独加薄 ramp_（见 WHITEBOX_SPEC §2.4）。`,
    );
    return;
  }
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  const halfW = (box.max.x - box.min.x) / 2;
  const halfD = (box.max.z - box.min.z) / 2;
  data.collisionRects.push({
    cx, cz, halfW, halfD,
    height: box.max.y,
    baseY: box.min.y,
  });
}

function parseLevelGltf(root: THREE.Object3D): LevelData {
  root.updateMatrixWorld(true);

  const data: LevelData = {
    collisionRects: [],
    collisionDiscs: [],
    walls: [],
    climbVolumes: [],
    ramps: [],
    spawnPoints: {},
    chestSpawns: [],
  };

  root.traverse((node) => {
    const name = node.name;
    if (!name) return;

    if (name.startsWith('colcyl_')) {
      // 圆形可站立平台：半径取包围盒 XZ 半宽的较大值，顶面取 box.max.y。
      _box.setFromObject(node);
      if (_box.isEmpty()) return;
      data.collisionDiscs!.push({
        cx: (_box.min.x + _box.max.x) / 2,
        cz: (_box.min.z + _box.max.z) / 2,
        radius: Math.max(_box.max.x - _box.min.x, _box.max.z - _box.min.z) / 2,
        height: _box.max.y,
        baseY: _box.min.y,
      });
    } else if (name.startsWith('col_')) {
      _box.setFromObject(node);
      if (_box.isEmpty()) return;
      pushColOrRamp(node, _box, data, false);
    } else if (name.startsWith('wall_')) {
      _box.setFromObject(node);
      if (_box.isEmpty()) return;
      data.walls.push({
        cx: (_box.min.x + _box.max.x) / 2,
        cz: (_box.min.z + _box.max.z) / 2,
        halfW: (_box.max.x - _box.min.x) / 2,
        halfD: (_box.max.z - _box.min.z) / 2,
        bottomY: _box.min.y,
        topY: _box.max.y,
      });
    } else if (name.startsWith('climb_')) {
      _box.setFromObject(node);
      if (_box.isEmpty()) return;
      data.climbVolumes.push({
        cx: (_box.min.x + _box.max.x) / 2,
        cz: (_box.min.z + _box.max.z) / 2,
        halfW: (_box.max.x - _box.min.x) / 2,
        halfD: (_box.max.z - _box.min.z) / 2,
        bottomY: _box.min.y,
        topY: _box.max.y,
      });
    } else if (name.startsWith('ramp_')) {
      _box.setFromObject(node);
      if (_box.isEmpty()) return;
      pushColOrRamp(node, _box, data, true);
    } else if (name.startsWith('spawn_')) {
      node.getWorldPosition(_vec);
      const p = { x: _vec.x, y: _vec.y, z: _vec.z };
      if (name.startsWith('spawn_player')) (data.spawnPoints.players ??= []).push(p);
      else if (name.startsWith('spawn_boss')) (data.spawnPoints.bosses ??= []).push(p);
      else if (name.startsWith('spawn_altar') || name.startsWith('spawn_teleporter')) {
        (data.spawnPoints.altars ??= []).push(p);
      } else if (name.startsWith('spawn_chest')) {
        data.chestSpawns.push(p);
      } else if (name.startsWith('spawn_enemy_')) {
        const key = name.replace(/\.\d+$/, '');
        ((data.spawnPoints.enemyZones ??= {})[key] ??= []).push(p);
      }
    }
  });

  return data;
}

/**
 * 尝试加载关卡 glb。支持「双文件模式」：
 *   - level_${name}.glb       视觉高模（必须，缺则尝试只用 col）
 *   - level_${name}_col.glb   碰撞低模（可选；存在则碰撞数据 100% 来自这里）
 *
 * 任一文件 404 都会被静默捕获，并按可用文件降级。两个都没有 → 回退到内置 arena。
 *
 * 白盒迭代单文件：把导出的关卡丢到 public/models/levels/level_whitebox.glb 即可。
 * 生产双文件：再导出一个低模到 level_whitebox_col.glb；视觉文件里的 col_/wall_/climb_/ramp_
 * 不必清理（双文件模式下会被忽略），但建议清理掉避免迷惑。
 */
async function tryLoadLevel(name: string = DEFAULT_LEVEL_NAME): Promise<void> {
  const visualPath = `/models/levels/level_${name}.glb`;
  const colPath = `/models/levels/level_${name}_col.glb`;

  const [visualResult, colResult] = await Promise.allSettled([
    gltfLoader.loadAsync(visualPath),
    gltfLoader.loadAsync(colPath),
  ]);

  const visualScene =
    visualResult.status === 'fulfilled' ? visualResult.value.scene : null;
  const colScene = colResult.status === 'fulfilled' ? colResult.value.scene : null;

  if (!visualScene && !colScene) {
    loadedLevel = null;
    console.log(`[Level] No level at ${visualPath} (or ${colPath}) — using built-in arena.`);
    return;
  }

  // 决定视觉源 / 碰撞源：
  //   两个都在 → visual 渲染，col 解析（双源分离）
  //   只有 visual → 都用 visual（单文件兼容模式）
  //   只有 col → 都用 col（纯灰盒）
  const renderScene = visualScene ?? colScene!;
  const colSource = colScene ?? visualScene!;

  renderScene.name = 'LoadedLevel';
  convertToToonMaterials(renderScene);
  renderScene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });

  const data = parseLevelGltf(colSource);
  loadedLevel = { data, scene: renderScene };

  // 双文件模式下：col scene 解析完已无用，显式 dispose 释放 BufferGeometry / Material
  // 持有的 typed array，避免等 GC（renderer 还没碰过它，所以没有 GPU 端可释放的）。
  if (visualScene && colScene) {
    colScene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry?.dispose();
        const mat = mesh.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      }
    });
  }

  const mode = visualScene && colScene ? 'two-file' : visualScene ? 'visual-only' : 'col-only';
  console.log(
    `[Level] Loaded (${mode}) ${visualScene ? visualPath : ''}${visualScene && colScene ? ' + ' : ''}${colScene ? colPath : ''}: ` +
      `${data.collisionRects.length} col, ${data.walls.length} wall, ` +
      `${data.climbVolumes.length} climb, ${data.ramps.length} ramp, ${data.chestSpawns.length} chest, ` +
      `player=${data.spawnPoints.players?.length ?? 0} altar=${data.spawnPoints.altars?.length ?? 0}`,
  );
}

// OBJ geometry cache for pickups/projectiles
let crystalGeometry: THREE.BufferGeometry | null = null;
let crystal2Geometry: THREE.BufferGeometry | null = null;
let crystal3Geometry: THREE.BufferGeometry | null = null;
let crystal4Geometry: THREE.BufferGeometry | null = null;
let crystal5Geometry: THREE.BufferGeometry | null = null;
let heartGeometry: THREE.BufferGeometry | null = null;
let boneGeometry: THREE.BufferGeometry | null = null;
let axeModel: THREE.Group | null = null; // Full model with materials
let swordModel: THREE.Group | null = null;
let katanaModel: THREE.Group | null = null;
let bowModel: THREE.Group | null = null;
let daggerModel: THREE.Group | null = null;
let hammerModel: THREE.Group | null = null;
let dartModel: THREE.Group | null = null;
let dartGoldenModel: THREE.Group | null = null; // Used for shotgun pellets
// Evolved (golden) variants
let swordGoldenModel: THREE.Group | null = null;
let axeGoldenModel: THREE.Group | null = null;
let bowGoldenModel: THREE.Group | null = null;
let daggerGoldenModel: THREE.Group | null = null;
let katanaGoldenModel: THREE.Group | null = null;
let chestClosedObj: THREE.Group | null = null;
let chestOpenObj: THREE.Group | null = null;

async function loadObjItems(): Promise<void> {
  const objLoader = new OBJLoader();

  const loadAndNormalize = async (path: string, targetSize: number): Promise<THREE.BufferGeometry> => {
    try {
      const obj = await objLoader.loadAsync(path) as THREE.Group;
      let foundGeo: THREE.BufferGeometry | null = null;
      obj.traverse((child: THREE.Object3D) => {
        if (!foundGeo && (child as THREE.Mesh).isMesh) {
          foundGeo = (child as THREE.Mesh).geometry;
        }
      });
      if (!foundGeo) return new THREE.OctahedronGeometry(targetSize, 0);
      const geo: THREE.BufferGeometry = foundGeo;
      // Normalize size
      geo.computeBoundingBox();
      const box = geo.boundingBox!;
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 0.01);
      const scale = targetSize / maxDim;
      geo.scale(scale, scale, scale);
      // Center
      geo.computeBoundingBox();
      const center = geo.boundingBox!.getCenter(new THREE.Vector3());
      geo.translate(-center.x, -center.y, -center.z);
      console.log(`[OBJ] Loaded: ${path} (${(geo.getAttribute('position') as THREE.BufferAttribute).count} verts)`);
      return geo;
    } catch (err) {
      console.warn(`[OBJ] Failed: ${path}`, err);
      return new THREE.OctahedronGeometry(targetSize, 0);
    }
  };

  [crystalGeometry, heartGeometry, boneGeometry, crystal2Geometry, crystal3Geometry, crystal4Geometry, crystal5Geometry] = await Promise.all([
    loadAndNormalize('/models/items/Crystal1.obj', 0.4),
    loadAndNormalize('/models/items/Heart.obj', 0.5),
    loadAndNormalize('/models/items/Bone.obj', 0.5),
    loadAndNormalize('/models/items/Crystal2.obj', 0.4),
    loadAndNormalize('/models/items/Crystal3.obj', 0.4),
    loadAndNormalize('/models/items/Crystal4.obj', 0.4),
    loadAndNormalize('/models/items/Crystal5.obj', 0.4),
  ]);

  // Helper: load full model with materials (MTL + OBJ)
  // brighten=true also lifts dark Kd values so the model isn't a black blob
  // under our 3-step toon ramp. Use it for weapons; chests stay original.
  const loadFullModel = async (
    name: string,
    mtlPath: string,
    objPath: string,
    targetSize: number,
    brighten = false,
  ): Promise<THREE.Group | null> => {
    try {
      const mtlLoader = new MTLLoader();
      const mtl = await mtlLoader.loadAsync(mtlPath);
      mtl.preload();
      const loader = new OBJLoader();
      loader.setMaterials(mtl);
      const obj = await loader.loadAsync(objPath) as THREE.Group;
      obj.name = name;
      convertToToonMaterials(obj);
      if (brighten) brightenWeaponMaterials(obj);
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 0.01);
      const s = targetSize / maxDim;
      obj.scale.set(s, s, s);
      console.log(`[OBJ] Loaded ${name} model`);
      return obj;
    } catch (err) {
      console.warn(`[OBJ] Failed to load ${name}:`, err);
      return null;
    }
  };

  // Helper: load full GLB weapon model (with embedded materials)
  // Used for weapons that ship as .glb instead of .obj/.mtl pair.
  const loadGlbWeaponModel = async (
    name: string,
    glbPath: string,
    targetSize: number,
    brighten = false,
  ): Promise<THREE.Group | null> => {
    try {
      const gltf = await gltfLoader.loadAsync(glbPath);
      const obj = gltf.scene as THREE.Group;
      obj.name = name;
      convertToToonMaterials(obj);
      if (brighten) brightenWeaponMaterials(obj);
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 0.01);
      const s = targetSize / maxDim;
      obj.scale.set(s, s, s);
      console.log(`[GLB] Loaded ${name} model`);
      return obj;
    } catch (err) {
      console.warn(`[GLB] Failed to load ${name}:`, err);
      return null;
    }
  };

  // Load all weapon models in parallel — pass brighten=true for weapons only
  const [ax, sw, kat, bow, dag, ham, dar, darG, swG, axG, bowG, dagG, katG] = await Promise.all([
    loadFullModel('AxeModel', '/models/items/Axe_small.mtl', '/models/items/Axe_small.obj', 0.6, true),
    loadFullModel('SwordModel', '/models/items/Sword.mtl', '/models/items/Sword.obj', 0.8, true),
    loadFullModel('KatanaModel', '/models/items/Sword_big.mtl', '/models/items/Sword_big.obj', 0.9, true),
    // "bow" weapon is displayed in-game as the Revolver — use the GLB pistol model
    loadGlbWeaponModel('BowModel', '/models/items/Revolver.glb', 0.7, true),
    loadFullModel('DaggerModel', '/models/items/Dagger.mtl', '/models/items/Dagger.obj', 0.4, true),
    loadFullModel('HammerModel', '/models/items/Hammer_Double.mtl', '/models/items/Hammer_Double.obj', 0.7, true),
    loadFullModel('DartModel', '/models/items/Dart.mtl', '/models/items/Dart.obj', 0.4, true),
    loadFullModel('DartGoldenModel', '/models/items/Dart_Golden.mtl', '/models/items/Dart_Golden.obj', 0.45, true),
    loadFullModel('SwordGolden', '/models/items/Sword_Golden.mtl', '/models/items/Sword_Golden.obj', 0.8, true),
    loadFullModel('AxeGolden', '/models/items/Axe_Double_Golden.mtl', '/models/items/Axe_Double_Golden.obj', 0.7, true),
    loadFullModel('BowGolden', '/models/items/Bow_Golden.mtl', '/models/items/Bow_Golden.obj', 0.7, true),
    loadFullModel('DaggerGolden', '/models/items/Dagger_Golden.mtl', '/models/items/Dagger_Golden.obj', 0.4, true),
    loadFullModel('KatanaGolden', '/models/items/Sword_big_Golden.mtl', '/models/items/Sword_big_Golden.obj', 0.9, true),
  ]);
  axeModel = ax;
  swordModel = sw;
  katanaModel = kat;
  bowModel = bow;
  daggerModel = dag;
  hammerModel = ham;
  dartModel = dar;
  dartGoldenModel = darG;
  swordGoldenModel = swG;
  axeGoldenModel = axG;
  bowGoldenModel = bowG;
  daggerGoldenModel = dagG;
  katanaGoldenModel = katG;

  // Load chest models with materials (MTL + OBJ)
  try {
    const mtlLoader = new MTLLoader();

    const closedMtl = await mtlLoader.loadAsync('/models/items/Chest_Closed.mtl');
    closedMtl.preload();
    const closedObjLoader = new OBJLoader();
    closedObjLoader.setMaterials(closedMtl);
    const chestClosed = await closedObjLoader.loadAsync('/models/items/Chest_Closed.obj') as THREE.Group;
    chestClosed.name = 'ChestClosed';
    convertToToonMaterials(chestClosed);
    applyChestGoldMaterials(chestClosed);
    chestClosedObj = chestClosed;

    const openMtl = await mtlLoader.loadAsync('/models/items/Chest_Open.mtl');
    openMtl.preload();
    const openObjLoader = new OBJLoader();
    openObjLoader.setMaterials(openMtl);
    const chestOpen = await openObjLoader.loadAsync('/models/items/Chest_Open.obj') as THREE.Group;
    chestOpen.name = 'ChestOpen';
    convertToToonMaterials(chestOpen);
    applyChestGoldMaterials(chestOpen);
    chestOpenObj = chestOpen;

    console.log('[OBJ] Loaded chest models with materials');
  } catch (err) {
    console.warn('[OBJ] Failed to load chests:', err);
  }
}

// =============================================================================
// GameScene - Three.js Rendering
// =============================================================================

export class GameScene {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly outlineEffect: any; // OutlineEffect
  private composer: EffectComposer | null = null;
  private blobShadows: BlobShadowPool | null = null;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly platformInput: PlatformInput;
  private session: LocalGameSession;
  private animationId: number | null = null;
  private removeDisplayListener: (() => void) | null = null;

  // Pre-allocated temporaries
  private readonly _dummy = new THREE.Object3D();
  private readonly _tempVec = new THREE.Vector3();
  private readonly _tempColor = new THREE.Color();

  // Scene objects
  private playerMesh!: THREE.Mesh;
  private playerRing!: THREE.Mesh;
  private playerAuraMesh!: THREE.Mesh;
  private groundMesh!: THREE.Mesh;
  private gridLines!: THREE.LineSegments;
  private bossMesh: THREE.Mesh | null = null;
  /** Boss 的 base scale（auto-scaled to TARGET_BOSS_HEIGHT），attack/enrage 脉冲基于此值。 */
  private bossBaseScale = 1.0;
  private playerSpotLight!: THREE.SpotLight;
  // 常驻共享闪电闪光灯：永远在场景里、待命强度 0。闪电复用它而非每道新建/移除 PointLight
  // —— 场景光源数恒定，避免每次触发引发全场材质 shader 重编译（掉帧主因）。
  private lightningFlashLight!: THREE.PointLight;

  // Weapon orbs (legacy — disabled, kept to avoid breaking older saves)
  private weaponOrbMesh!: THREE.InstancedMesh;
  private readonly MAX_WEAPON_ORBS = 6;

  // Weapon floaters — physical weapons orbit the player as visual indicator
  // Magic weapons (lightning_staff / flame_ring) use VFX only
  private weaponFloaters: Map<string, THREE.Object3D> = new Map();
  private static readonly FLOATER_WEAPON_TYPES: ReadonlyArray<string> = [
    'sword', 'bone_bouncer', 'axe', 'bow', 'shotgun',
  ];

  // Transient mesh-based VFX (slash arcs, lightning columns)
  private slashEffects: Array<{ mesh: THREE.Mesh; life: number; maxLife: number }> = [];
  // Procedural multi-layer lightning: jagged path + glow/core tubes + impact light + ground ring
  private lightningBolts: Array<{
    core: THREE.Mesh;
    glow: THREE.Mesh;
    ring: THREE.Mesh;
    endX: number;
    endY: number;
    endZ: number;
    height: number;
    life: number;
    maxLife: number;
    flickerTimer: number;
  }> = [];
  // Persistent flame_ring disk centered on player while equipped
  private flameRingDisk: THREE.Mesh | null = null;
  private flameRingTime = 0;
  // Edge-detect weapon firing for one-shot VFX
  private lastWeaponCooldown: Map<string, number> = new Map();

  // Animation state
  private deathAnimTimer = 0;
  private levelUpAnimTimer = 0;
  private levelCompPulseTimer = 0;
  private wasAlive = true;
  private wasGrounded = true; // Track grounded state for jump animation trigger
  private lastPhase: GamePhase = 'playing';
  private screenFlashEl: HTMLDivElement | null = null;

  // GSAP animation state
  private lastHpPercent = 100;
  private lastXpPercent = 0;
  private lastBossHpPercent = 100;
  private levelPulseAnimation: any = null;

  // Player skeletal animation
  private playerMixer: THREE.AnimationMixer | null = null;
  private playerAnimations: Map<string, THREE.AnimationAction> = new Map();
  private currentPlayerAnim: string = '';

  // Teleporter meshes
  private teleporterMeshes: THREE.Mesh[] = [];
  private teleporterGlowMeshes: THREE.Mesh[] = [];
  /**
   * 祭坛 / 传送门的地面 decal（魔法圆 / 漩涡），与祭坛索引一一对应。
   * 每帧根据 altar.phase 切换贴图（magic_circle ↔ portal_swirl）+ 旋转。
   */
  private altarDecals: THREE.Mesh[] = [];

  // Charge Shrine meshes (1 entry per shrine, persistent)
  private shrineMeshes: Map<number, THREE.Object3D> = new Map();
  private shrinePanel: HTMLDivElement | null = null;
  private shrineIndicator: HTMLDivElement | null = null;

  // Chest rendering
  private chestObjects: Map<number, THREE.Object3D> = new Map();
  private chestRewardPanel: HTMLDivElement | null = null;
  private chestRewardPanelKey: string | null = null;

  // InstancedMeshes
  // Enemy rendering — individual cloned models (preserves full materials)
  private enemyMeshes: Map<string, THREE.InstancedMesh> = new Map(); // legacy, kept for type compat
  private enemyObjects: Map<number, THREE.Object3D> = new Map(); // id → cloned model
  private enemyPool: Map<string, THREE.Object3D[]> = new Map(); // type → available pool
  private enemyMixers: Map<number, THREE.AnimationMixer> = new Map(); // id → animation mixer
  private enemyAnimStates: Map<number, string> = new Map(); // id → current anim name
  private enemyAnimActions: Map<number, Map<string, THREE.AnimationAction>> = new Map(); // id → actions map
  private paralysisTriangleSprites: Map<number, THREE.Sprite[]> = new Map(); // enemy id → paralysis marker sprites
  private neuroMarkerSprites: Map<number, THREE.Sprite> = new Map(); // 毒师神经毒素 墨绿倒三角
  private hunterMarkerSprites: Map<number, THREE.Sprite> = new Map(); // 猎标烙印 红色瞄准圈
  private conductorGlowSprites: Map<number, THREE.Sprite> = new Map(); // 弧光导体 蓝色发光
  private mysteryNumberSprite: THREE.Sprite | null = null; // 奥术奥秘计数（玩家头顶）
  private mysteryNumberValue = -1;
  private arcaneBurstOrbs: { sprite: THREE.Sprite; from: THREE.Vector3; to: THREE.Vector3; t: number; life: number }[] = [];
  private projectileMesh!: THREE.InstancedMesh;
  private axeObjects: Map<number, THREE.Object3D> = new Map(); // axe projectile id → cloned model
  private weaponObjects: Map<number, THREE.Object3D> = new Map(); // other weapon projectiles → cloned model
  private areaEffectObjects: Map<number, THREE.Object3D> = new Map(); // area effect id → mesh (gas/ripple/scorch/beam)
  private pickupMesh!: THREE.InstancedMesh;
  private consumableSprites: Map<number, THREE.Sprite> = new Map();
  private goldMoteTexture!: THREE.Texture;
  private goldMoteSprites: Map<number, THREE.Sprite> = new Map();

  // VFX Particle System
  private readonly MAX_PARTICLES = 500;
  private vfxParticles: {
    x: number; y: number; z: number;
    vx: number; vy: number; vz: number;
    size: number;
    life: number;
    maxLife: number;
    r: number; g: number; b: number;
    active: boolean;
  }[] = [];
  private vfxGeometry!: THREE.BufferGeometry;
  private vfxMaterial!: THREE.ShaderMaterial;
  private vfxPoints!: THREE.Points;
  private vfxTexture!: THREE.Texture;

  // === Billboard VFX system ===
  // 给"单帧贴图特效"用：剑气、撞击、魔法圆、烧痕、枪口火光等。
  // 池化 Plane Mesh，每帧渐隐 + 缩放 + 旋转 + 生命到了归还。
  // 与上面 vfxPoints 的点云粒子互补：点云适合大量 sparkle，billboard 适合少量"漂亮"贴图。
  private vfxTextures: Record<VfxTextureKey, THREE.Texture> = {} as Record<VfxTextureKey, THREE.Texture>;
  private readonly MAX_BILLBOARDS = 64;
  private billboardPool: BillboardVfxItem[] = [];

  // DOM overlays
  private hudContainer!: HTMLDivElement;
  private hpBar!: HTMLDivElement;
  private hpBarInner!: HTMLDivElement;
  private hpText!: HTMLDivElement;
  private shieldBar!: HTMLDivElement;
  private shieldBarInner!: HTMLDivElement;
  private shieldText!: HTMLDivElement;
  private xpBar!: HTMLDivElement;
  private xpBarInner!: HTMLDivElement;
  private xpNumbers!: HTMLDivElement;
  private levelLabel!: HTMLDivElement;
  private timerLabel!: HTMLDivElement;
  private killLabel!: HTMLDivElement;
  private goldLabel!: HTMLDivElement;
  private silverLabel!: HTMLDivElement;
  /** 局内任务条（武器槽下方）。 */
  private questRow!: HTMLDivElement;
  private questCheckbox!: HTMLDivElement;
  /** 经验条上方的 buff 行：左消耗品 / 右羁绊。 */
  private buffRow!: HTMLDivElement;
  private consumableBuffsContainer!: HTMLDivElement;
  /** 羁绊点击展开的详情浮层。 */
  private bondDetailOverlay!: HTMLDivElement;
  private openBondId: BondId | null = null;
  private bondDetailOutsideHandler: ((ev: PointerEvent) => void) | null = null;
  /** timed 消耗品记录到的最大剩余时间，用于阴影下降比例。 */
  private consumableMaxRemaining = 0;
  private consumableLabel!: HTMLDivElement;
  private weaponSlotsContainer!: HTMLDivElement;
  private tomesSlotsContainer!: HTMLDivElement;
  private relicSlotsContainer!: HTMLDivElement;
  private bondSlotsContainer!: HTMLDivElement;
  private itemTooltip: HTMLDivElement | null = null;
  private itemTooltipContent = new WeakMap<HTMLElement, string>();
  private bossHpContainer!: HTMLDivElement;
  private bossHpBarInner!: HTMLDivElement;
  private bossNameLabel!: HTMLDivElement;
  private bossPhaseMarkers!: HTMLDivElement;
  private tierBadge!: HTMLDivElement;
  private stageBadge!: HTMLDivElement;
  private teleporterIndicator!: HTMLDivElement;
  private interactBtn!: HTMLDivElement;
  private overtimeBanner!: HTMLDivElement;
  private majorNoticeEl: HTMLDivElement | null = null;
  private majorNoticeTimer: ReturnType<typeof setTimeout> | null = null;
  private pauseBtn!: HTMLDivElement;
  private upgradePanel: HTMLDivElement | null = null;
  private gameOverPanel: HTMLDivElement | null = null;
  private pausePanel: HTMLDivElement | null = null;
  private questCompleteAtRunStart: Set<string> = new Set();
  private damageNums: HTMLDivElement[] = [];
  private damageNumIndex = 0;
  private finalSwarmLabel: HTMLDivElement | null = null;
  private finalSwarmBorder: HTMLDivElement | null = null;
  private lastNoticeTier: DifficultyTier | null = null;
  private wasOvertime = false;
  private xpFlashTimer = 0;
  private seenChestOpenEvents = new Set<string>();

  // State
  private isPaused = false;
  private jumpKeyDown = false;
  /**
   * 交互按键的边缘状态。`interactKeyPressed` 在按下的那一帧为 true，
   * 发完一帧后立即清零，避免长按反复触发祭坛召唤。
   */
  private interactKeyPressed = false;
  /** 移动端交互按钮被按下时由 UI 设置一次 true，发送一帧后清零（同 interactKeyPressed）。 */
  private mobileInteractPressed = false;
  private lastTime = 0;
  private frameDt = 1 / 60;

  // Dying enemies (death animation tracking)
  private dyingEnemies: Map<number, { obj: THREE.Object3D; timer: number; type: string }> = new Map();

  // Boss attack warning elements
  private bossWarningRing: THREE.Mesh | null = null;
  private bossAoeFlashTimer = 0;

  /** GM 调试：碰撞盒可视化层（col_/wall_/climb_/ramp_/spawn_），按需 lazy 构建。 */
  private collisionDebugGroup: THREE.Group | null = null;
  private collisionDebugVisible = false;

  // Combo HUD elements
  private comboLabel: HTMLDivElement | null = null;
  private comboFadeTimer = 0;
  private lastComboCount = 0;

  // Advanced Camera System
  private cameraAngle = 0;
  // 镜头朝向 + 跟随逻辑全部封装在 CameraOrbit（systems/cameraOrbit.ts）。
  // 这里只持有引用；事件监听、yaw/pitch 状态、平滑 lookAt 都在 CameraOrbit 内。
  private cameraOrbit!: CameraOrbit;
  /** 碰撞推镜的静态遮挡物（关卡平台/支柱 + 加载关卡根；不含怪/特效/地面）。 */
  private cameraOccluders: THREE.Object3D[] = [];
  // 主角无敌闪烁效果（半透明脉冲，避免硬 visible 频闪）。封装在 PlayerInvincibilityFx。
  private readonly playerFx = new PlayerInvincibilityFx();
  private currentFOV = 60;
  private targetFOV = 60;
  private hitStopTimer = 0;
  private shakeOffsetX = 0;
  private shakeOffsetY = 0;
  private shakeIntensity = 0;
  private shakeDecay = 0;
  private shakeFrequency = 0;
  private shakeTime = 0;
  private dampingSpeed = 0.06;
  private playerLastX = 0;
  private playerLastZ = 0;
  private playerVelX = 0;
  private playerVelZ = 0;

  constructor(session: LocalGameSession) {
    this.session = session;

    const container = document.getElementById('game-container');
    if (!container) throw new Error('Missing #game-container');
    this.container = container;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    // 关实时方向光阴影（每帧多渲一遍全场景，手机最贵的一项）——改用脚下 blob 圆阴影。
    this.renderer.shadowMap.enabled = false;
    this.renderer.toneMapping = THREE.NeutralToneMapping; // 更亮、更保饱和（Q 版鲜艳调性，替代偏暗去饱和的 ACES）
    this.renderer.toneMappingExposure = 1.5; // 整体再提亮
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; // 显式 sRGB，保证饱和度正确还原
    this.renderer.domElement.style.display = 'block';
    this.container.appendChild(this.renderer.domElement);

    // Outline Effect (cel-shading edge lines)
    this.outlineEffect = new OutlineEffect(this.renderer, {
      defaultThickness: 0.003, // 黑描边（细一点，更轻）
      defaultColor: [0, 0, 0],
      defaultAlpha: 0.8,
    });

    // Scene
    this.scene = new THREE.Scene();
    this.scene.name = 'MainScene';
    this.scene.background = new THREE.Color('#87CEEB');
    this.scene.fog = new THREE.Fog('#87CEEB', 40, 120);

    // Camera
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300);
    this.camera.name = 'MainCamera';
    this.camera.position.set(0, 4, -8);
    this.camera.lookAt(0, 0, 0);

    // Platform input
    this.platformInput = new PlatformInput({
      mode: 'joystick',
      canvas: this.renderer.domElement,
    });

    const mobileInput = this.platformInput.getMobileInput();
    if (mobileInput) {
      mobileInput.attachButtons({
        buttons: [
          { label: '⬆️', color: 'rgba(100,200,255,0.3)', size: 56 },
          { label: '⬇️', color: 'rgba(255,200,50,0.3)', size: 48 },
          { label: '🔥', color: 'rgba(255,100,50,0.3)', size: 48 },
        ],
      });
    }

    // Keyboard bindings
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') { this.jumpKeyDown = true; e.preventDefault(); }
      if (e.code === 'KeyE') {
        // 边缘触发：keydown 那一帧标记为 pressed；发送过 input 后会清零（见 handleInput）
        if (!e.repeat) this.interactKeyPressed = true;
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') { this.jumpKeyDown = false; }
    });

    // 镜头视图系统：FPS pointer lock + 拖拽 + 手机右半屏滑动 + pitch 夹紧。
    // 所有事件监听、yaw/pitch 状态都封装在内；GameScene 通过 getYaw() / update() 交互。
    this.cameraOrbit = new CameraOrbit(this.renderer.domElement);
  }

  start(): void {
    this.questCompleteAtRunStart = new Set(
      getQuestProgress().filter(p => p.completed).map(p => p.questId),
    );
    this.setupLighting();
    this.setupGround();
    this.setupPlayer();
    this.setupWeaponOrbs();
    this.setupEnemyMeshes();
    this.setupProjectileMesh();
    this.setupPickupMesh();
    this.setupGoldMoteMesh();
    this.setupVFX();
    this.setupHUD();
    this.setupDamageNumbers();

    this.setupComposer();

    this.removeDisplayListener = installThreeHighDpi({
      renderer: this.renderer,
      container: this.container,
      onResize: ({ width, height, pixelRatio }) => {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        if (this.composer) {
          this.composer.setPixelRatio(pixelRatio);
          this.composer.setSize(width, height);
        }
      },
    });

    this.session.on('game_update', ({ state }) => {
      this.handlePhaseChange(state);
    });

    this.session.on('game_over', ({ result }) => {
      this.showGameOver(result);
    });

    this.animate();
  }

  destroy(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    // kill 所有 GSAP tween/timeline（含 repeat:-1 的无限脉冲），否则它们会指向已移除 DOM 永久 tick、跨局泄漏
    gsapAnimations.cleanup();
    this.levelPulseAnimation = null;
    this.removeDisplayListener?.();
    this.cameraOrbit?.dispose();
    this.platformInput.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.hudContainer?.remove();
    this.upgradePanel?.remove();
    this.gameOverPanel?.remove();
    this.pausePanel?.remove();
    this.pausePanel = null;
    this.shrinePanel?.remove();
    this.chestRewardPanel?.remove();
    this.shrineIndicator?.remove();
    this.finalSwarmLabel?.remove();
    this.finalSwarmBorder?.remove();
    if (this.majorNoticeTimer) {
      clearTimeout(this.majorNoticeTimer);
      this.majorNoticeTimer = null;
    }
    this.majorNoticeEl?.remove();
    this.majorNoticeEl = null;
    this.itemTooltip?.remove();
    this.itemTooltip = null;
    this.closeBondDetail();
    this.bondDetailOverlay?.remove();
    this.screenFlashEl?.remove();
    this.comboLabel?.remove();
    for (const el of this.damageNums) el.remove();
  }

  // ===========================================================================
  // Setup
  // ===========================================================================

  private setupLighting(): void {
    // 通透阳光基底：抬高环境光让暗部仍有色彩（不死黑）。
    // 仍低于平行光，使 toon 阶梯保留：平行光被 gradientMap 量化成断层、主导明面；
    // 环境光只是给阴影侧兜底色彩。
    const ambient = new THREE.AmbientLight('#eef4ff', 0.9);
    ambient.name = 'AmbientLight';
    this.scene.add(ambient);

    // 暖色方向主光（被阶梯化的那束）——降低强度/对比，明暗反差柔和但断层仍在。
    const dir = new THREE.DirectionalLight('#FFF5E0', 1.5);
    dir.name = 'DirectionalLight';
    dir.position.set(5, 10, 5);
    // 不再投实时阴影（改用 blob 圆阴影）——省掉每帧的阴影贴图渲染。
    dir.castShadow = false;
    this.scene.add(dir);

    // 半球补光：天蓝/地暖给暗部一点通透的环境色（删去第二个冗余半球）。
    const hemi = new THREE.HemisphereLight('#bfe4ff', '#b8a888', 0.7);
    hemi.name = 'HemisphereLight';
    this.scene.add(hemi);

    // Player spotlight (softer, warm tint)
    this.playerSpotLight = new THREE.SpotLight('#FFF5E0', 0.3, 25, Math.PI / 5, 0.6, 1);
    this.playerSpotLight.name = 'PlayerSpotLight';
    this.playerSpotLight.position.set(0, 12, 0);
    this.scene.add(this.playerSpotLight);
    this.scene.add(this.playerSpotLight.target);

    // 常驻闪电闪光灯（强度 0 待命）：闪电复用它，避免动态增删光源触发全场 shader 重编译。
    this.lightningFlashLight = new THREE.PointLight(0x88ccff, 0, 10, 2);
    this.lightningFlashLight.name = 'LightningFlashLight';
    this.lightningFlashLight.visible = true; // 必须始终可见，否则光源数变化仍会重编译
    this.scene.add(this.lightningFlashLight);
  }

  /**
   * 后处理：OutlineEffect（场景+描边）→ 微微 bloom（仅高亮 / 发光特效）→ OutputPass（ACES+sRGB）。
   * bloom 阈值高、强度低：只让大招特效、发光物等"超亮"像素辉光，不糊整体画面。
   */
  private setupComposer(): void {
    const composer = new EffectComposer(this.renderer); // 默认 HalfFloat 目标，保 HDR
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const dpr = this.renderer.getPixelRatio();
    composer.setPixelRatio(dpr);
    composer.setSize(w, h);

    composer.addPass(new OutlineComposerPass(this.outlineEffect, this.scene, this.camera));

    const bloom = new UnrealBloomPass(
      new THREE.Vector2(Math.max(1, w * dpr * 0.5), Math.max(1, h * dpr * 0.5)), // 半分辨率省手机
      0.35, // strength：微微
      0.5,  // radius
      0.9,  // threshold：高 → 只让发光体辉光
    );
    composer.addPass(bloom);

    composer.addPass(new OutputPass()); // 末端唯一 tone map：ACES + sRGB

    this.composer = composer;
  }

  private renderFrame(): void {
    if (this.composer) this.composer.render();
    else this.outlineEffect.render(this.scene, this.camera);
  }

  private setupGround(): void {
    // =========================================================================
    // 1. Dark base ground under everything
    // =========================================================================
    const baseGeo = new THREE.PlaneGeometry(400, 400);
    baseGeo.rotateX(-Math.PI / 2);
    const baseMat = new THREE.MeshToonMaterial({ color: '#4A7FB5', gradientMap: toonGradientMap });
    this.groundMesh = new THREE.Mesh(baseGeo, baseMat);
    this.groundMesh.name = 'Ground_Base';
    this.groundMesh.receiveShadow = true;
    this.groundMesh.position.y = -0.5;
    this.scene.add(this.groundMesh);

    // =========================================================================
    // 2. Build arena — loaded level (whitebox) if present, else built-in arena
    // =========================================================================
    if (loadedLevel) {
      const levelScene = cloneSkeleton(loadedLevel.scene) as THREE.Object3D;
      levelScene.name = 'LevelRoot';
      this.scene.add(levelScene);
      this.cameraOccluders.push(levelScene); // 加载关卡整根作为镜头遮挡目标
    } else {
      this.buildArena();
    }

    // 把收集到的静态遮挡物交给镜头做碰撞推镜
    this.cameraOrbit.setOccluders(this.cameraOccluders);

    // =========================================================================
    // 3. Hidden grid lines (required by type)
    // =========================================================================
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    const gridMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0 });
    this.gridLines = new THREE.LineSegments(gridGeo, gridMat);
    this.gridLines.name = 'GridLines';
    this.gridLines.visible = false;
    this.scene.add(this.gridLines);
  }

  private placeModel(modelKey: keyof LoadedModels, x: number, y: number, z: number, rotY: number = 0, scale: number = 1): void {
    const model = loadedModels[modelKey];
    if (!model) return;
    const clone = cloneSkeleton(model) as THREE.Object3D;
    clone.name = `Placed_${modelKey}_${x.toFixed(0)}_${z.toFixed(0)}`;
    clone.position.set(x, y, z);
    clone.rotation.y = rotY;
    clone.scale.set(scale, scale, scale);
    this.scene.add(clone);
    // 只把结构性大件（平台/支柱）登记为镜头遮挡物，避免管道/招牌等小道具造成噪声推镜。
    if (modelKey.startsWith('platform_') || (modelKey as string).startsWith('support')) {
      this.cameraOccluders.push(clone);
    }
  }

  private buildArena(): void {
    const HALF = GROUND_SIZE / 2; // 60

    // ═══════════════════════════════════════════════════════════════════
    // A. GROUND FLOOR — Central Arena (The Pit)
    // 4×4 platform tiles, scale 2.0 = 8×8 per tile
    // ═══════════════════════════════════════════════════════════════════

    const floorScale = 2.0;
    const tileSize = 8; // 4 * 2.0 scale

    // Central 4×4 grid (covers ±16 area)
    for (let gx = -2; gx <= 1; gx++) {
      for (let gz = -2; gz <= 1; gz++) {
        this.placeModel('platform_4x4', gx * tileSize + 4, 0, gz * tileSize + 4, 0, floorScale);
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // B. CORRIDORS — Four arms extending from center
    // Using platform_4x2 (8×4 at scale 2.0) along each arm
    // ═══════════════════════════════════════════════════════════════════

    // North corridor (z = -16 to -55)
    for (let nz = -20; nz >= -52; nz -= 8) {
      this.placeModel('platform_4x2', -4, 0, nz, 0, floorScale);
      this.placeModel('platform_4x2', 4, 0, nz, 0, floorScale);
    }

    // South corridor (z = +16 to +55)
    for (let sz = 20; sz <= 52; sz += 8) {
      this.placeModel('platform_4x2', -4, 0, sz, 0, floorScale);
      this.placeModel('platform_4x2', 4, 0, sz, 0, floorScale);
    }

    // East corridor (x = +16 to +55)
    for (let ex = 20; ex <= 52; ex += 8) {
      this.placeModel('platform_4x2', ex, 0, -4, Math.PI / 2, floorScale);
      this.placeModel('platform_4x2', ex, 0, 4, Math.PI / 2, floorScale);
    }

    // West corridor (x = -16 to -55)
    for (let wx = -20; wx >= -52; wx -= 8) {
      this.placeModel('platform_4x2', wx, 0, -4, Math.PI / 2, floorScale);
      this.placeModel('platform_4x2', wx, 0, 4, Math.PI / 2, floorScale);
    }

    // Diagonal fill patches (platform_2x2 at scale 2.0)
    const diagonalFills: [number, number][] = [
      [14, -14], [-14, -14], [14, 14], [-14, 14],
      [18, -10], [-18, -10], [18, 10], [-18, 10],
      [10, -18], [-10, -18], [10, 18], [-10, 18],
    ];
    for (const [dx, dz] of diagonalFills) {
      this.placeModel('platform_2x2', dx, 0, dz, 0, floorScale);
    }

    // ═══════════════════════════════════════════════════════════════════
    // C. MID-LEVEL RING (y=2) — The Catwalk
    // Elevated platforms forming a ring around center
    // ═══════════════════════════════════════════════════════════════════

    // N station
    this.placeModel('platform_4x2', 0, 2, -25, 0, 2.5);
    this.placeModel('support', -4, 0, -25, 0, 1.8);
    this.placeModel('support', 4, 0, -25, 0, 1.8);

    // S station
    this.placeModel('platform_4x2', 0, 2, 25, 0, 2.5);
    this.placeModel('support', -4, 0, 25, 0, 1.8);
    this.placeModel('support', 4, 0, 25, 0, 1.8);

    // E station
    this.placeModel('platform_4x2', 25, 2, 0, Math.PI / 2, 2.5);
    this.placeModel('support', 25, 0, -4, 0, 1.8);
    this.placeModel('support', 25, 0, 4, 0, 1.8);

    // W station
    this.placeModel('platform_4x2', -25, 2, 0, Math.PI / 2, 2.5);
    this.placeModel('support', -25, 0, -4, 0, 1.8);
    this.placeModel('support', -25, 0, 4, 0, 1.8);

    // Diagonal junctions — platform_2x2 at y=2
    const junctions: [number, number, number][] = [
      [20, -20, Math.PI / 4],
      [-20, -20, -Math.PI / 4],
      [20, 20, -Math.PI / 4],
      [-20, 20, Math.PI / 4],
    ];
    for (const [jx, jz, jr] of junctions) {
      this.placeModel('platform_2x2', jx, 2, jz, jr, 2.5);
      this.placeModel('support', jx, 0, jz, 0, 1.8);
      this.placeModel('rail_long', jx + Math.sign(jx) * 4, 2.1, jz, jr + Math.PI / 2, 1.8);
    }

    // ═══════════════════════════════════════════════════════════════════
    // D. WATCHTOWERS (y=4) — Cardinal Overlooks
    // ═══════════════════════════════════════════════════════════════════

    const towers: [number, number, number][] = [
      [0, -40, 0],
      [0, 40, Math.PI],
      [40, 0, -Math.PI / 2],
      [-40, 0, Math.PI / 2],
    ];
    for (const [tx, tz, tr] of towers) {
      this.placeModel('platform_4x4', tx, 4, tz, tr, 2.5);
      this.placeModel('support_long', tx - 4, 0, tz - 4, 0, 2.2);
      this.placeModel('support_long', tx + 4, 0, tz - 4, 0, 2.2);
      this.placeModel('support_long', tx - 4, 0, tz + 4, 0, 2.2);
      this.placeModel('support_long', tx + 4, 0, tz + 4, 0, 2.2);
      this.placeModel('rail_long', tx, 4.1, tz - 5, 0, 2.2);
      this.placeModel('rail_long', tx, 4.1, tz + 5, Math.PI, 2.2);
      this.placeModel('rail_long', tx - 5, 4.1, tz, Math.PI / 2, 2.2);
      this.placeModel('rail_long', tx + 5, 4.1, tz, -Math.PI / 2, 2.2);
      this.placeModel('door', tx, 4, tz + (tz < 0 ? 5 : -5), tr, 1.8);
      this.placeModel('sign_1', tx + 3, 5.5, tz, tr, 1.5);
    }

    // ═══════════════════════════════════════════════════════════════════
    // E. NESTS (y=6) — Diagonal Pinnacles
    // ═══════════════════════════════════════════════════════════════════

    const nests: [number, number, number][] = [
      [38, -38, Math.PI / 4],
      [-38, -38, -Math.PI / 4],
      [38, 38, -Math.PI / 4],
      [-38, 38, Math.PI / 4],
    ];
    for (const [nx, nz, nr] of nests) {
      this.placeModel('platform_1x1', nx, 6, nz, nr, 3.0);
      this.placeModel('support_long', nx, 0, nz, 0, 3.0);
      this.placeModel('pipe_1', nx, 6.5, nz, 0, 1.5);
    }

    // ═══════════════════════════════════════════════════════════════════
    // F. ARENA BOUNDARY — Fences around 120×120 perimeter
    // ═══════════════════════════════════════════════════════════════════

    const fenceSpacing = 5;
    for (let fx = -HALF; fx <= HALF; fx += fenceSpacing) {
      this.placeModel('fence_platform', fx, 0, -HALF, 0, 2.0);
      this.placeModel('fence_platform', fx, 0, HALF, Math.PI, 2.0);
    }
    for (let fz = -HALF; fz <= HALF; fz += fenceSpacing) {
      this.placeModel('fence_platform', -HALF, 0, fz, Math.PI / 2, 2.0);
      this.placeModel('fence_platform', HALF, 0, fz, -Math.PI / 2, 2.0);
    }
    this.placeModel('support_long', -HALF, 0, -HALF, 0, 3.5);
    this.placeModel('support_long', HALF, 0, -HALF, 0, 3.5);
    this.placeModel('support_long', -HALF, 0, HALF, 0, 3.5);
    this.placeModel('support_long', HALF, 0, HALF, 0, 3.5);

    // ═══════════════════════════════════════════════════════════════════
    // G. STREET LIGHTING — Along corridors and at key intersections
    // ═══════════════════════════════════════════════════════════════════

    const streetLights: [number, number, number, number][] = [
      [-12, 0, -12, Math.PI / 4],
      [12, 0, -12, -Math.PI / 4],
      [-12, 0, 12, -Math.PI / 4],
      [12, 0, 12, Math.PI / 4],
      [-7, 0, -22, 0], [7, 0, -22, Math.PI],
      [-7, 0, -36, 0], [7, 0, -36, Math.PI],
      [-7, 0, -50, 0], [7, 0, -50, Math.PI],
      [-7, 0, 22, Math.PI], [7, 0, 22, 0],
      [-7, 0, 36, Math.PI], [7, 0, 36, 0],
      [-7, 0, 50, Math.PI], [7, 0, 50, 0],
      [22, 0, -7, -Math.PI / 2], [22, 0, 7, Math.PI / 2],
      [36, 0, -7, -Math.PI / 2], [36, 0, 7, Math.PI / 2],
      [50, 0, -7, -Math.PI / 2], [50, 0, 7, Math.PI / 2],
      [-22, 0, -7, Math.PI / 2], [-22, 0, 7, -Math.PI / 2],
      [-36, 0, -7, Math.PI / 2], [-36, 0, 7, -Math.PI / 2],
      [-50, 0, -7, Math.PI / 2], [-50, 0, 7, -Math.PI / 2],
    ];
    for (const [lx, ly, lz, lr] of streetLights) {
      this.placeModel('light_street', lx, ly, lz, lr, 1.8);
    }

    // ═══════════════════════════════════════════════════════════════════
    // H. SIGNS & NEON — On towers and at corridor entrances
    // ═══════════════════════════════════════════════════════════════════

    const signs: [keyof LoadedModels, number, number, number, number, number][] = [
      ['sign_2', -8, 3, -16, 0, 2.0],
      ['sign_2', 8, 3, -16, Math.PI, 2.0],
      ['sign_1', -8, 3, 16, Math.PI, 2.0],
      ['sign_1', 8, 3, 16, 0, 2.0],
      ['sign_2', -16, 3, -8, Math.PI / 2, 2.0],
      ['sign_1', -16, 3, 8, Math.PI / 2, 2.0],
      ['sign_2', 16, 3, -8, -Math.PI / 2, 2.0],
      ['sign_1', 16, 3, 8, -Math.PI / 2, 2.0],
      ['sign_1', 2, 6, -42, 0, 1.8],
      ['sign_2', -2, 6, 42, Math.PI, 1.8],
      ['sign_1', 42, 6, 2, -Math.PI / 2, 1.8],
      ['sign_2', -42, 6, -2, Math.PI / 2, 1.8],
    ];
    for (const [sk, sx, sy, sz, sr, ss] of signs) {
      this.placeModel(sk, sx, sy, sz, sr, ss);
    }

    // ═══════════════════════════════════════════════════════════════════
    // I. AC UNITS & PIPES — Environmental detail / soft cover
    // ═══════════════════════════════════════════════════════════════════

    // Central arena cover positions
    const coverPositions: [number, number, number, number][] = [
      [6, 0, -6, 0], [-6, 0, -6, Math.PI / 2],
      [6, 0, 6, Math.PI], [-6, 0, 6, -Math.PI / 2],
      [0, 0, -10, 0], [0, 0, 10, Math.PI],
      [10, 0, 0, -Math.PI / 2], [-10, 0, 0, Math.PI / 2],
    ];
    for (const [cx, cy, cz, cr] of coverPositions) {
      this.placeModel('ac_unit', cx, cy, cz, cr, 1.8);
    }

    // Pipes along corridor walls
    const pipePositions: [number, number, number, number][] = [
      [-7, 0.5, -28, 0], [7, 0.5, -28, Math.PI],
      [-7, 0.5, -42, 0], [7, 0.5, -42, Math.PI],
      [-7, 0.5, 28, Math.PI], [7, 0.5, 28, 0],
      [-7, 0.5, 42, Math.PI], [7, 0.5, 42, 0],
      [28, 0.5, -7, -Math.PI / 2], [28, 0.5, 7, Math.PI / 2],
      [42, 0.5, -7, -Math.PI / 2], [42, 0.5, 7, Math.PI / 2],
      [-28, 0.5, -7, Math.PI / 2], [-28, 0.5, 7, -Math.PI / 2],
      [-42, 0.5, -7, Math.PI / 2], [-42, 0.5, 7, -Math.PI / 2],
    ];
    for (const [px, py, pz, pr] of pipePositions) {
      this.placeModel('pipe_1', px, py, pz, pr, 1.8);
    }

    // AC units on watchtower supports
    for (const [tx, tz] of [[0, -40], [0, 40], [40, 0], [-40, 0]] as [number, number][]) {
      this.placeModel('ac_unit', tx + 5, 2, tz, Math.PI / 2, 1.5);
      this.placeModel('ac_unit', tx - 5, 2, tz, -Math.PI / 2, 1.5);
    }

    // ═══════════════════════════════════════════════════════════════════
    // J. RAIL GUARDS — Safety rails on elevated platforms
    // ═══════════════════════════════════════════════════════════════════

    const ringRails: [number, number, number, number][] = [
      [0, 2.1, -29, 0],
      [0, 2.1, 29, Math.PI],
      [29, 2.1, 0, -Math.PI / 2],
      [-29, 2.1, 0, Math.PI / 2],
    ];
    for (const [rx, ry, rz, rr] of ringRails) {
      this.placeModel('rail_long', rx, ry, rz, rr, 2.0);
    }

    // ═══════════════════════════════════════════════════════════════════
    // K. NEON FLOOR PANELS — Emissive quads for cyberpunk atmosphere
    // ═══════════════════════════════════════════════════════════════════

    const glowPositions: [number, number, number][] = [
      [0, 0, 0x00ffcc], [-8, 0, 0xff00ff], [8, 0, 0x00ffcc],
      [0, -8, 0xff00ff], [0, 8, 0x00ffcc],
      [0, -30, 0x00ffcc], [0, 30, 0xff00ff],
      [30, 0, 0x00ffcc], [-30, 0, 0xff00ff],
      [20, -20, 0x00ffcc], [-20, -20, 0xff00ff],
      [20, 20, 0xff00ff], [-20, 20, 0x00ffcc],
    ];
    for (let gi = 0; gi < glowPositions.length; gi++) {
      const [gx, gz, gColor] = glowPositions[gi];
      const glowGeo = new THREE.PlaneGeometry(2.5, 2.5);
      glowGeo.rotateX(-Math.PI / 2);
      const glowMat = new THREE.MeshBasicMaterial({
        color: gColor,
        transparent: true,
        opacity: 0.15,
      });
      const glowMesh = new THREE.Mesh(glowGeo, glowMat);
      glowMesh.name = `FloorGlow_${gi}`;
      glowMesh.position.set(gx, 0.02, gz);
      this.scene.add(glowMesh);
    }
  }

  private setupPlayer(): void {
    const state = this.session.getRenderState();
    const charColor = CHARACTER_COLORS[state.character] ?? 0xa8e6cf;

    // Character → model mapping
    const CHARACTER_MODELS: Record<string, string> = {
      megachad: '/models/player_george.gltf',
      roberto: '/models/player_stan.gltf',
      skateboard_skeleton: '/models/player_leela.gltf',
    };
    const modelPath = CHARACTER_MODELS[state.character] ?? CHARACTER_MODELS['megachad'];

    // Always start with fallback — will be replaced once model loads
    const bodyGeo = new THREE.CapsuleGeometry(0.5, 1.0, 8, 16);
    const bodyMat = new THREE.MeshToonMaterial({ color: charColor, gradientMap: toonGradientMap });
    applyStylizedToonShading(bodyMat, 0.3);
    this.playerMesh = new THREE.Mesh(bodyGeo, bodyMat);
    this.playerMesh.name = 'Player';
    this.playerMesh.position.y = 1.0;
    this.scene.add(this.playerMesh);

    // Attempt to load and replace with GLTF model
    const loader = new GLTFLoader();
    loader.load(modelPath, (gltf) => {
      const model = gltf.scene;
      model.name = 'Player';
      // Convert to simplified toon — boost saturation for vibrant cartoon look
      model.traverse((child) => {
        if (!(child as THREE.Mesh).isMesh) return;
        const mesh = child as THREE.Mesh;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const toonMats = materials.map((mat) => {
          const oldMat = mat as THREE.MeshStandardMaterial;
          // Boost color saturation
          const color = oldMat.color ? oldMat.color.clone() : new THREE.Color(0xffffff);
          const hsl = { h: 0, s: 0, l: 0 };
          color.getHSL(hsl);
          // 主角更明艳：饱和更高（艳）+ 明度略提（明）
          color.setHSL(hsl.h, Math.min(hsl.s * 2.0, 1.0), Math.min(hsl.l * 1.12, 1.0));
          const toon = new THREE.MeshToonMaterial({
            color,
            emissive: color.clone().multiplyScalar(0.12), // 一点本色自发光：阴影侧也保持明艳、主角更跳（低于 bloom 阈值，不发光）
            map: oldMat.map ?? null,
            gradientMap: toonGradientMap,
            side: oldMat.side ?? THREE.FrontSide,
          });
          toon.name = 'PlayerToon';
          applyStylizedToonShading(toon, 0.3); // 主角留一点塑料玩具光泽
          return toon;
        });
        mesh.material = toonMats.length === 1 ? toonMats[0] : toonMats;
      });
      // Calculate proper scale based on actual bounding box
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const targetHeight = 1.8;
      const autoScale = targetHeight / Math.max(size.y, 0.01);
      model.scale.set(autoScale, autoScale, autoScale);
      // Center on ground
      const newBox = new THREE.Box3().setFromObject(model);
      model.position.y = -newBox.min.y;

      // Replace the fallback mesh
      this.scene.remove(this.playerMesh);
      this.playerMesh = model as unknown as THREE.Mesh;
      this.scene.add(this.playerMesh);

      // Setup animation mixer
      this.playerMixer = new THREE.AnimationMixer(model);
      for (const clip of gltf.animations) {
        const action = this.playerMixer.clipAction(clip);
        this.playerAnimations.set(clip.name, action);
      }
      // Play idle by default
      this.playPlayerAnim('Idle');

      console.log(`[Player] Model loaded! size=${size.y.toFixed(3)}, scale=${autoScale.toFixed(1)}, anims: ${gltf.animations.map(a => a.name).join(', ')}`);
    }, undefined, (err) => {
      console.warn('[Player] GLTF failed, keeping fallback:', err);
    });

    // Ground circle indicator
    const ringGeo = new THREE.RingGeometry(0.6, 0.75, 16);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
    this.playerRing = new THREE.Mesh(ringGeo, ringMat);
    this.playerRing.name = 'PlayerRing';
    this.playerRing.rotation.x = -Math.PI / 2;
    this.playerRing.position.y = 0.02;
    this.scene.add(this.playerRing);

    // Evolved weapon golden aura (invisible by default)
    const auraGeo = new THREE.SphereGeometry(1.2, 12, 8);
    const auraMat = new THREE.MeshBasicMaterial({
      color: 0xffcc00,
      transparent: true,
      opacity: 0,
    });
    this.playerAuraMesh = new THREE.Mesh(auraGeo, auraMat);
    this.playerAuraMesh.name = 'PlayerAura';
    this.playerAuraMesh.visible = false;
    this.scene.add(this.playerAuraMesh);
  }

  private playPlayerAnim(name: string, timeScale: number = 1.0): void {
    if (this.currentPlayerAnim === name) {
      // Update speed of current animation without restarting
      const action = this.playerAnimations.get(name);
      if (action) action.timeScale = timeScale;
      return;
    }
    const prevAction = this.playerAnimations.get(this.currentPlayerAnim);
    const newAction = this.playerAnimations.get(name);
    if (!newAction) {
      // Fallback: if animation doesn't exist (e.g. Run_Holding on Leela), use Run
      if (name === 'Run_Holding') {
        this.playPlayerAnim('Run', timeScale);
        return;
      }
      return;
    }
    if (prevAction) prevAction.fadeOut(0.15);
    newAction.reset().fadeIn(0.15).play();
    newAction.timeScale = timeScale;

    // Jump: play once through the full takeoff→air→landing sequence
    if (name === 'Jump') {
      newAction.setLoop(THREE.LoopOnce, 1);
      newAction.clampWhenFinished = false;
    } else {
      newAction.setLoop(THREE.LoopRepeat, Infinity);
      newAction.clampWhenFinished = false;
    }

    this.currentPlayerAnim = name;
  }

  private playEnemyAnim(enemyId: number, name: string): void {
    const currentAnim = this.enemyAnimStates.get(enemyId);
    if (currentAnim === name) return;
    const actionsMap = this.enemyAnimActions.get(enemyId);
    if (!actionsMap) return;

    // Fallback chain for animations not present on all zombie variants
    let targetName = name;
    if (!actionsMap.has(name)) {
      const fallbacks: Record<string, string[]> = {
        'Run_Attack': ['Run_Arms', 'Run'],
        'Run_Arms': ['Run', 'Walk'],
        'Punch': ['Idle_Attack', 'Run_Attack', 'Idle'],
        'HitReact': ['Idle'],
        'Idle_Attack': ['Punch', 'Idle'],
      };
      const chain = fallbacks[name];
      if (chain) {
        for (const fb of chain) {
          if (actionsMap.has(fb)) { targetName = fb; break; }
        }
      }
      if (!actionsMap.has(targetName)) targetName = 'Idle';
    }

    const prevAction = actionsMap.get(currentAnim ?? '');
    const newAction = actionsMap.get(targetName);
    if (prevAction) prevAction.fadeOut(0.2);
    if (newAction) {
      newAction.reset().fadeIn(0.2).play();
    }
    this.enemyAnimStates.set(enemyId, targetName);
  }

  private setupWeaponOrbs(): void {
    const orbGeo = new THREE.SphereGeometry(0.15, 6, 4);
    const orbMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.weaponOrbMesh = new THREE.InstancedMesh(orbGeo, orbMat, this.MAX_WEAPON_ORBS);
    this.weaponOrbMesh.name = 'WeaponOrbs';
    this.weaponOrbMesh.count = 0;
    this.weaponOrbMesh.frustumCulled = false;
    this.weaponOrbMesh.visible = false; // Hidden — weapon orbs disabled
    this.scene.add(this.weaponOrbMesh);
  }

  private setupEnemyMeshes(): void {
    const enemyTypes: string[] = [
      'skeleton_soldier', 'zombie', 'skeleton_archer',
      'skeleton_knight', 'necromancer', 'gargoyle',
    ];

    // Map enemy types to loaded models for geometry extraction
    const enemyModelMap: Record<string, keyof LoadedModels> = {
      skeleton_soldier: 'zombie_basic',     // 普通步兵 → Basic僵尸
      zombie: 'zombie_chubby',              // 僵尸(高HP) → 胖僵尸
      skeleton_archer: 'zombie_arm',        // 弓手(远程) → 断臂僵尸
      skeleton_knight: 'zombie_chubby',     // 骑士(精英冲刺) → 胖僵尸(大型)
      necromancer: 'zombie_basic',          // 法师(召唤) → Basic僵尸
      gargoyle: 'zombie_arm',              // 石像鬼(飞行俯冲) → 断臂僵尸
    };

    // Scale per enemy type — zombie size variety (small/medium/large)
    const enemyScales: Record<string, number> = {
      skeleton_soldier: 0.675,   // Basic zombie — standard (small)
      zombie: 1.1,              // Chubby — big tank
      skeleton_archer: 0.8,     // Arm zombie — lean
      skeleton_knight: 1.3,     // Chubby — elite, extra large
      necromancer: 0.675,       // Basic — caster (small)
      gargoyle: 0.85,           // Arm zombie — lunging
    };

    // Fallback box geometry if model not loaded
    const fallbackGeo = new THREE.BoxGeometry(0.9, 1.2, 0.9);

    for (const type of enemyTypes) {
      const color = ENEMY_COLORS[type] ?? 0x888888;

      // Try to extract geometry AND material from loaded model
      let geo: THREE.BufferGeometry = fallbackGeo;
      let mat: THREE.Material = new THREE.MeshToonMaterial({ color, gradientMap: toonGradientMap });

      const modelKey = enemyModelMap[type];
      const model = modelKey ? loadedModels[modelKey] : null;
      if (model) {
        let foundMesh = false;
        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh && !foundMesh) {
            foundMesh = true;
            const meshChild = child as THREE.Mesh;
            geo = meshChild.geometry.clone();
            // Use the model's original material (preserves textures/colors)
            if (meshChild.material) {
              const originalMat = Array.isArray(meshChild.material) ? meshChild.material[0] : meshChild.material;
              mat = originalMat.clone();
            }
            // Normalize geometry scale
            geo.computeBoundingBox();
            const box = geo.boundingBox!;
            const size = box.max.clone().sub(box.min);
            const maxDim = Math.max(size.x, size.y, size.z);
            const targetScale = (enemyScales[type] ?? 1.0) / maxDim;
            geo.scale(targetScale, targetScale, targetScale);
            geo.center();
          }
        });
      }

      const mesh = new THREE.InstancedMesh(geo, mat, MAX_ENEMIES);
      mesh.name = `Enemy_${type}`;
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.enemyMeshes.set(type, mesh);
      this.scene.add(mesh);
    }
  }

  private setupProjectileMesh(): void {
    const geo = new THREE.SphereGeometry(0.25, 6, 4);
    const mat = new THREE.MeshToonMaterial({ color: 0xffee44, gradientMap: toonGradientMap });
    this.projectileMesh = new THREE.InstancedMesh(geo, mat, MAX_PROJECTILES);
    this.projectileMesh.name = 'Projectiles';
    this.projectileMesh.count = 0;
    this.projectileMesh.frustumCulled = false;
    this.scene.add(this.projectileMesh);
  }

  private setupPickupMesh(): void {
    // Use Crystal OBJ geometry if loaded, otherwise fallback to octahedron
    const geo = crystalGeometry ?? new THREE.OctahedronGeometry(0.35, 0);
    const mat = new THREE.MeshToonMaterial({ color: 0x00ff66, gradientMap: toonGradientMap });
    this.pickupMesh = new THREE.InstancedMesh(geo, mat, MAX_PICKUPS);
    this.pickupMesh.name = 'Pickups';
    this.pickupMesh.count = 0;
    this.pickupMesh.frustumCulled = false;
    this.scene.add(this.pickupMesh);
  }

  private setupGoldMoteMesh(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 64, 64);

    const coin = ctx.createRadialGradient(24, 20, 4, 32, 32, 28);
    coin.addColorStop(0.0, '#fff28a');
    coin.addColorStop(0.34, '#ffd21a');
    coin.addColorStop(0.72, '#e79800');
    coin.addColorStop(1.0, '#9a5a00');
    ctx.fillStyle = coin;
    ctx.beginPath();
    ctx.arc(32, 32, 25, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 5;
    ctx.strokeStyle = '#ffe066';
    ctx.stroke();

    ctx.lineWidth = 3;
    ctx.strokeStyle = '#a86400';
    ctx.beginPath();
    ctx.arc(32, 32, 15, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,210,0.85)';
    ctx.beginPath();
    ctx.ellipse(25, 22, 8, 4, -0.65, 0, Math.PI * 2);
    ctx.fill();

    this.goldMoteTexture = new THREE.CanvasTexture(canvas);
    this.goldMoteTexture.colorSpace = THREE.SRGBColorSpace;
  }

  private setupVFX(): void {
    // Pre-allocate particle pool
    for (let i = 0; i < this.MAX_PARTICLES; i++) {
      this.vfxParticles.push({
        x: 0, y: -100, z: 0,
        vx: 0, vy: 0, vz: 0,
        size: 1,
        life: 0,
        maxLife: 1,
        r: 1, g: 1, b: 1,
        active: false,
      });
    }

    // Load particle texture（升级到 Kenney spark：比 circle 更有"火花感"）
    const textureLoader = new THREE.TextureLoader();
    this.vfxTexture = textureLoader.load('/textures/vfx/spark.png');

    // Create buffer geometry with per-particle attributes
    this.vfxGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.MAX_PARTICLES * 3);
    const sizes = new Float32Array(this.MAX_PARTICLES);
    const lifes = new Float32Array(this.MAX_PARTICLES);
    const colors = new Float32Array(this.MAX_PARTICLES * 3);

    this.vfxGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.vfxGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.vfxGeometry.setAttribute('aLife', new THREE.BufferAttribute(lifes, 1));
    this.vfxGeometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

    // Custom ShaderMaterial
    this.vfxMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: this.vfxTexture },
      },
      vertexShader: `
        attribute float aSize;
        attribute float aLife;
        attribute vec3 aColor;

        varying float vLife;
        varying vec3 vColor;

        void main() {
          vLife = aLife;
          vColor = aColor;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (400.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D uTexture;
        varying float vLife;
        varying vec3 vColor;

        void main() {
          vec4 texColor = texture2D(uTexture, gl_PointCoord);
          float alpha = texColor.a * vLife;
          gl_FragColor = vec4(vColor * texColor.rgb, alpha);
          if (gl_FragColor.a < 0.01) discard;
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.vfxPoints = new THREE.Points(this.vfxGeometry, this.vfxMaterial);
    this.vfxPoints.name = 'VFXParticles';
    this.vfxPoints.frustumCulled = false;
    this.scene.add(this.vfxPoints);

    // ─── Billboard VFX：预加载贴图 + 预分配 plane 池 ───
    const billboardLoader = new THREE.TextureLoader();
    for (const key of Object.keys(VFX_TEXTURE_FILES) as VfxTextureKey[]) {
      const tex = billboardLoader.load(VFX_TEXTURE_FILES[key]);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.vfxTextures[key] = tex;
    }

    const planeGeo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < this.MAX_BILLBOARDS; i++) {
      const mat = new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(planeGeo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 5;  // 在 outline 之上、HUD 之下
      this.scene.add(mesh);
      this.billboardPool.push({
        mesh,
        active: false,
        age: 0,
        lifetime: 1,
        startScale: 1,
        endScale: 1,
        startOpacity: 1,
        opacityCurve: 'fadeOut',
        rotationSpeed: 0,
        facing: 'camera',
      });
    }
  }

  /**
   * 触发一个一次性贴图特效。从 billboard 池里取一个 plane，
   * 配置好材质 / 位置 / 朝向 / 缩放 / 透明度曲线，由 updateBillboardVfx 每帧推进。
   *
   * 池满时静默丢弃（不阻塞，不报错）。VFX 帧丢失对体感几乎无影响。
   */
  spawnBillboard(opts: BillboardSpawnOpts): void {
    const slot = this.billboardPool.find(b => !b.active);
    if (!slot) return;

    slot.active = true;
    slot.age = 0;
    slot.lifetime = Math.max(0.05, opts.lifetime);
    slot.startScale = opts.scale;
    slot.endScale = opts.endScale ?? opts.scale;
    slot.startOpacity = opts.opacity ?? 1;
    slot.opacityCurve = opts.opacityCurve ?? 'fadeOut';
    slot.rotationSpeed = opts.rotationSpeed ?? 0;
    slot.facing = opts.facing ?? 'camera';

    const mat = slot.mesh.material;
    mat.map = this.vfxTextures[opts.texture];
    mat.color.setHex(opts.color ?? 0xffffff);
    mat.opacity = slot.startOpacity;
    mat.blending = opts.blending === 'normal' ? THREE.NormalBlending : THREE.AdditiveBlending;
    mat.needsUpdate = true;

    slot.mesh.position.set(opts.x, opts.y, opts.z);
    slot.mesh.scale.set(slot.startScale, slot.startScale, slot.startScale);
    slot.mesh.visible = true;

    if (slot.facing === 'up') {
      // 平躺地面：plane 默认面向 +Z，绕 X 轴 -90° 让法线朝 +Y
      slot.mesh.rotation.set(-Math.PI / 2, 0, opts.rotation ?? 0);
    } else {
      // 朝向相机：每帧在 update 里 lookAt(camera)；初始 rotation 仅决定贴图自旋
      slot.mesh.rotation.set(0, 0, opts.rotation ?? 0);
    }
  }

  /**
   * 每帧推进所有 active billboard：
   *   - lerp scale (start → end)
   *   - lerp opacity 按曲线
   *   - 自旋
   *   - facing='camera' 时 lookAt(相机)
   *   - lifetime 到了归还槽位
   */
  private updateBillboardVfx(dt: number): void {
    const cam = this.camera;
    const _camPos = new THREE.Vector3();
    cam.getWorldPosition(_camPos);

    for (const b of this.billboardPool) {
      if (!b.active) continue;
      b.age += dt;
      if (b.age >= b.lifetime) {
        b.active = false;
        b.mesh.visible = false;
        continue;
      }

      const t = b.age / b.lifetime;  // 0..1
      const scale = b.startScale + (b.endScale - b.startScale) * t;
      b.mesh.scale.set(scale, scale, scale);

      let alpha: number;
      switch (b.opacityCurve) {
        case 'flash':
          // 0 → start → 0 (sin 曲线)
          alpha = b.startOpacity * Math.sin(t * Math.PI);
          break;
        case 'constant':
          alpha = b.startOpacity;
          break;
        case 'fadeOut':
        default:
          alpha = b.startOpacity * (1 - t);
          break;
      }
      b.mesh.material.opacity = Math.max(0, alpha);

      if (b.rotationSpeed !== 0) {
        if (b.facing === 'up') {
          b.mesh.rotation.z += b.rotationSpeed * dt;
        } else {
          // camera-facing 时由 lookAt 接管 X/Y rotation；自旋走 Z
          // 但 lookAt 之后我们再叠 Z rotation
          b.mesh.rotation.z += b.rotationSpeed * dt;
        }
      }

      if (b.facing === 'camera') {
        // 让 plane 法线指向相机（保留 z 自旋）
        const zRot = b.mesh.rotation.z;
        b.mesh.lookAt(_camPos);
        b.mesh.rotation.z = zRot;
      }
    }
  }

  // ===========================================================================
  // HUD
  // ===========================================================================

  private setupHUD(): void {
    this.hudContainer = document.createElement('div');
    this.hudContainer.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:100;font-family:Arial,sans-serif;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);box-sizing:border-box;';
    document.body.appendChild(this.hudContainer);

    // ---------------------------------------------------------------------
    // Top-left cluster: HP + shield row → weapon slots → quest line
    // ---------------------------------------------------------------------
    const topLeft = document.createElement('div');
    topLeft.style.cssText = 'position:absolute;top:max(12px,env(safe-area-inset-top));left:max(12px,env(safe-area-inset-left));display:flex;flex-direction:column;align-items:flex-start;gap:8px;max-width:min(70vw,420px);pointer-events:none;';

    // HP + shield bars on one row
    const barsRow = document.createElement('div');
    barsRow.style.cssText = 'display:flex;align-items:center;gap:6px;';

    const hpContainer = document.createElement('div');
    hpContainer.style.cssText = 'position:relative;width:clamp(150px,42vw,220px);height:clamp(18px,5vw,22px);background:rgba(40,12,12,0.82);border-radius:11px;overflow:hidden;border:1px solid rgba(255,90,90,0.45);box-shadow:0 1px 4px rgba(0,0,0,0.5);';
    this.hpBarInner = document.createElement('div');
    this.hpBarInner.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#cc2222,#ff4d4d);border-radius:11px;';
    hpContainer.appendChild(this.hpBarInner);
    this.hpText = document.createElement('div');
    this.hpText.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:clamp(10px,2.6vw,13px);font-weight:bold;text-shadow:0 1px 2px rgba(0,0,0,0.95);white-space:nowrap;';
    hpContainer.appendChild(this.hpText);
    this.hpBar = hpContainer;
    barsRow.appendChild(hpContainer);

    const shieldContainer = document.createElement('div');
    shieldContainer.style.cssText = 'position:relative;width:clamp(90px,26vw,138px);height:clamp(16px,4.4vw,19px);background:rgba(16,30,46,0.82);border-radius:10px;overflow:hidden;border:1px solid rgba(120,200,255,0.5);box-shadow:0 1px 4px rgba(0,0,0,0.5);display:none;';
    this.shieldBarInner = document.createElement('div');
    this.shieldBarInner.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#3a86c9,#7fd0ff);border-radius:10px;';
    shieldContainer.appendChild(this.shieldBarInner);
    this.shieldText = document.createElement('div');
    this.shieldText.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#eaf7ff;font-size:clamp(9px,2.3vw,12px);font-weight:bold;text-shadow:0 1px 2px rgba(0,0,0,0.95);white-space:nowrap;';
    shieldContainer.appendChild(this.shieldText);
    this.shieldBar = shieldContainer;
    barsRow.appendChild(shieldContainer);

    topLeft.appendChild(barsRow);

    // Weapon slots (6 total: 5 base + 1 lockable)
    this.weaponSlotsContainer = document.createElement('div');
    this.weaponSlotsContainer.dataset.cameraBlock = 'true';
    this.weaponSlotsContainer.style.cssText = 'display:flex;gap:5px;flex-wrap:wrap;max-width:min(70vw,420px);pointer-events:auto;';
    topLeft.appendChild(this.weaponSlotsContainer);

    // Quest line (checkbox + text)
    this.questRow = document.createElement('div');
    this.questRow.style.cssText = 'display:flex;align-items:center;gap:8px;background:rgba(15,15,28,0.66);padding:5px 10px;border-radius:9px;max-width:min(70vw,420px);pointer-events:none;';
    this.questCheckbox = document.createElement('div');
    this.questCheckbox.style.cssText = 'flex-shrink:0;width:16px;height:16px;border:2px solid rgba(255,255,255,0.6);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:12px;line-height:1;color:#5dff9b;font-weight:bold;';
    const questLabel = document.createElement('div');
    questLabel.style.cssText = 'color:#e6e6f0;font-size:clamp(10px,2.6vw,13px);line-height:1.3;text-shadow:0 1px 2px rgba(0,0,0,0.9);';
    questLabel.textContent = t('hud.quest');
    this.questRow.appendChild(this.questCheckbox);
    this.questRow.appendChild(questLabel);
    topLeft.appendChild(this.questRow);

    this.hudContainer.appendChild(topLeft);

    // ---------------------------------------------------------------------
    // Top-right cluster: stats column (difficulty/timer/silver/kills/pause)
    // then a tome stack row beneath it.
    // ---------------------------------------------------------------------
    const topRight = document.createElement('div');
    topRight.style.cssText = 'position:absolute;top:max(12px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));display:flex;flex-direction:column;align-items:flex-end;gap:8px;pointer-events:none;';

    // Row 1: difficulty / timer / silver / kills / pause — laid out horizontally.
    const rightHudStack = document.createElement('div');
    rightHudStack.style.cssText = 'display:flex;flex-direction:row;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;max-width:min(88vw,540px);pointer-events:none;';

    // Difficulty badge (no background box — text only, colored by tier)
    this.tierBadge = document.createElement('div');
    this.tierBadge.style.cssText = 'color:#ffffff;font-size:clamp(11px,2.8vw,15px);font-weight:bold;text-shadow:0 1px 3px rgba(0,0,0,0.9);white-space:nowrap;';
    rightHudStack.appendChild(this.tierBadge);

    // Stage badge (I / II) between difficulty and timer
    this.stageBadge = document.createElement('div');
    this.stageBadge.style.cssText = 'color:#ffe08a;font-size:clamp(11px,2.8vw,15px);font-weight:900;text-shadow:0 1px 3px rgba(0,0,0,0.9);letter-spacing:1px;white-space:nowrap;';
    rightHudStack.appendChild(this.stageBadge);

    // Timer (no background box)
    this.timerLabel = document.createElement('div');
    this.timerLabel.style.cssText = 'display:flex;align-items:center;gap:5px;color:#ffffff;font-size:clamp(11px,2.8vw,18px);font-weight:bold;text-shadow:0 1px 3px rgba(0,0,0,0.9);font-variant-numeric:tabular-nums;white-space:nowrap;';
    rightHudStack.appendChild(this.timerLabel);

    // Gold this run (moved into the top-right cluster, no background box)
    this.goldLabel = createGoldBadge(0);
    stripBadgeBackground(this.goldLabel);
    rightHudStack.appendChild(this.goldLabel);

    // Silver earned this run (no background box)
    this.silverLabel = createSilverBadge(0);
    stripBadgeBackground(this.silverLabel);
    rightHudStack.appendChild(this.silverLabel);

    // Kill count (no background box)
    this.killLabel = document.createElement('div');
    this.killLabel.style.cssText = 'display:flex;align-items:center;gap:5px;color:#ffffff;font-size:clamp(11px,2.8vw,15px);font-weight:bold;text-shadow:0 1px 3px rgba(0,0,0,0.9);font-variant-numeric:tabular-nums;white-space:nowrap;';
    rightHudStack.appendChild(this.killLabel);

    // Pause button (end of row)
    this.pauseBtn = document.createElement('div');
    this.pauseBtn.dataset.cameraBlock = 'true';
    this.pauseBtn.style.cssText = 'color:#ffffff;font-size:clamp(12px, 2.5vw, 16px);background:rgba(80,80,120,0.7);padding:8px 16px;border-radius:8px;cursor:pointer;pointer-events:auto;user-select:none;min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center;touch-action:manipulation;';
    this.pauseBtn.textContent = t('hud.pause');
    this.pauseBtn.addEventListener('click', () => this.togglePause());
    rightHudStack.appendChild(this.pauseBtn);

    topRight.appendChild(rightHudStack);

    // Row 2: tome stack (newest tome appended at the right, older shift left)
    this.tomesSlotsContainer = document.createElement('div');
    this.tomesSlotsContainer.dataset.cameraBlock = 'true';
    this.tomesSlotsContainer.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;max-width:min(60vw,260px);justify-content:flex-end;pointer-events:auto;';
    topRight.appendChild(this.tomesSlotsContainer);

    this.hudContainer.appendChild(topRight);

    // Hidden legacy consumable label (kept to satisfy references; buffs now render in the buff row)
    this.consumableLabel = document.createElement('div');
    this.consumableLabel.style.cssText = 'display:none;';

    // ---------------------------------------------------------------------
    // Bottom cluster: buff row → green XP bar → relic bar (flush to bottom)
    // ---------------------------------------------------------------------
    const bottomGroup = document.createElement('div');
    bottomGroup.style.cssText = 'position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;gap:6px;padding-bottom:max(6px,env(safe-area-inset-bottom));pointer-events:none;';

    // Buff row: consumables on the left, bonds on the right
    this.buffRow = document.createElement('div');
    this.buffRow.style.cssText = 'width:min(86vw,560px);display:flex;justify-content:space-between;align-items:flex-end;pointer-events:none;';
    this.consumableBuffsContainer = document.createElement('div');
    this.consumableBuffsContainer.style.cssText = 'display:flex;gap:6px;align-items:flex-end;pointer-events:none;';
    this.buffRow.appendChild(this.consumableBuffsContainer);
    this.bondSlotsContainer = document.createElement('div');
    this.bondSlotsContainer.dataset.cameraBlock = 'true';
    this.bondSlotsContainer.style.cssText = 'display:flex;gap:6px;align-items:flex-end;justify-content:flex-end;flex-wrap:wrap;max-width:60vw;pointer-events:auto;';
    this.buffRow.appendChild(this.bondSlotsContainer);
    bottomGroup.appendChild(this.buffRow);

    // XP bar (green) with level in the middle
    const xpContainer = document.createElement('div');
    xpContainer.style.cssText = 'position:relative;width:min(86vw,560px);height:clamp(16px,4.2vw,22px);background:rgba(20,40,22,0.82);border-radius:8px;overflow:hidden;border:1px solid rgba(120,255,140,0.35);box-shadow:0 1px 4px rgba(0,0,0,0.5);';
    this.xpBarInner = document.createElement('div');
    this.xpBarInner.style.cssText = 'width:0%;height:100%;background:linear-gradient(90deg,#2f9e44,#69db7c);border-radius:8px;';
    xpContainer.appendChild(this.xpBarInner);
    this.levelLabel = document.createElement('div');
    this.levelLabel.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#ffffff;font-size:clamp(10px,2.8vw,15px);font-weight:bold;text-shadow:0 1px 3px rgba(0,0,0,0.9);transition:color 0.3s;';
    xpContainer.appendChild(this.levelLabel);
    this.xpBar = xpContainer;
    bottomGroup.appendChild(xpContainer);

    // Legacy xp numbers element kept (hidden) for compatibility
    this.xpNumbers = document.createElement('div');
    this.xpNumbers.style.cssText = 'display:none;';

    // Relic bar (long, flush to bottom edge, relics added left→right)
    this.relicSlotsContainer = document.createElement('div');
    this.relicSlotsContainer.dataset.cameraBlock = 'true';
    this.relicSlotsContainer.style.cssText = 'width:min(94vw,640px);min-height:clamp(34px,9vw,42px);background:rgba(10,10,20,0.62);border-top:1px solid rgba(255,255,255,0.12);border-radius:10px 10px 0 0;display:flex;gap:6px;align-items:center;justify-content:flex-start;padding:4px 8px;overflow-x:auto;box-sizing:border-box;pointer-events:auto;';
    bottomGroup.appendChild(this.relicSlotsContainer);

    this.hudContainer.appendChild(bottomGroup);

    // Bond detail floating layer (opens above buff row when a bond is tapped)
    this.bondDetailOverlay = document.createElement('div');
    this.bondDetailOverlay.dataset.cameraBlock = 'true'; // 交互浮层：阻断镜头拖拽（见 cameraOrbit 约定）
    this.bondDetailOverlay.style.cssText = `
      position:fixed;left:0;bottom:0;display:none;z-index:240;pointer-events:auto;
      max-width:min(320px,calc(100vw - 24px));padding:10px 12px;border-radius:10px;
      background:linear-gradient(180deg,rgba(18,18,32,0.97),rgba(8,8,16,0.97));
      border:1px solid rgba(255,255,255,0.18);box-shadow:0 12px 34px rgba(0,0,0,0.6);
      color:#f5f2ff;font-size:12px;line-height:1.35;text-shadow:0 1px 2px rgba(0,0,0,0.9);
    `;
    document.body.appendChild(this.bondDetailOverlay);

    this.itemTooltip = document.createElement('div');
    this.itemTooltip.style.cssText = `
      position:fixed;left:0;top:0;display:none;z-index:650;pointer-events:none;
      max-width:min(320px,calc(100vw - 24px));padding:10px 12px;border-radius:10px;
      background:linear-gradient(180deg,rgba(18,18,32,0.96),rgba(8,8,16,0.96));
      border:1px solid rgba(255,255,255,0.18);box-shadow:0 12px 34px rgba(0,0,0,0.55);
      color:#f5f2ff;font-size:12px;line-height:1.35;text-shadow:0 1px 2px rgba(0,0,0,0.9);
      backdrop-filter:blur(4px);
    `;
    document.body.appendChild(this.itemTooltip);
    this.installItemTooltipHandlers(this.weaponSlotsContainer);
    this.installItemTooltipHandlers(this.tomesSlotsContainer);
    this.installItemTooltipHandlers(this.relicSlotsContainer);
    this.installItemTooltipHandlers(this.bondSlotsContainer);

    // Boss HP bar (top-center, hidden by default)
    this.bossHpContainer = document.createElement('div');
    this.bossHpContainer.style.cssText = 'position:absolute;top:50px;left:50%;transform:translateX(-50%);width:60%;max-width:500px;height:22px;background:rgba(20,20,20,0.9);border-radius:4px;overflow:hidden;border:1px solid rgba(255,100,0,0.4);display:none;';
    this.bossHpBarInner = document.createElement('div');
    this.bossHpBarInner.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#cc3300,#ff6600);border-radius:4px;';
    this.bossHpContainer.appendChild(this.bossHpBarInner);
    // Phase threshold markers
    this.bossPhaseMarkers = document.createElement('div');
    this.bossPhaseMarkers.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    // 60% marker
    const marker60 = document.createElement('div');
    marker60.style.cssText = 'position:absolute;left:60%;top:0;width:2px;height:100%;background:rgba(255,255,255,0.4);';
    this.bossPhaseMarkers.appendChild(marker60);
    // 30% marker
    const marker30 = document.createElement('div');
    marker30.style.cssText = 'position:absolute;left:30%;top:0;width:2px;height:100%;background:rgba(255,255,255,0.4);';
    this.bossPhaseMarkers.appendChild(marker30);
    this.bossHpContainer.appendChild(this.bossPhaseMarkers);
    // Boss name label
    this.bossNameLabel = document.createElement('div');
    this.bossNameLabel.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#ffffff;font-size:11px;font-weight:bold;text-shadow:0 1px 2px rgba(0,0,0,0.9);pointer-events:none;';
    this.bossHpContainer.appendChild(this.bossNameLabel);
    this.hudContainer.appendChild(this.bossHpContainer);

    // Teleporter indicator
    this.teleporterIndicator = document.createElement('div');
    this.teleporterIndicator.style.cssText = 'position:absolute;top:90px;left:50%;transform:translateX(-50%);color:#00ccff;font-size:13px;font-weight:bold;text-shadow:0 0 8px #00ccff,0 1px 3px rgba(0,0,0,0.8);display:none;background:rgba(0,20,40,0.6);padding:4px 12px;border-radius:6px;';
    this.hudContainer.appendChild(this.teleporterIndicator);

    // 移动端"激活 Boss / 进入传送门"按钮（PC 不显示，统一通过 KeyE 处理）
    this.interactBtn = document.createElement('div');
    this.interactBtn.dataset.cameraBlock = 'true';
    this.interactBtn.style.cssText = 'position:absolute;bottom:120px;left:50%;transform:translateX(-50%);color:#fff;font-size:14px;font-weight:bold;background:rgba(170,68,255,0.85);padding:14px 28px;border-radius:30px;cursor:pointer;pointer-events:auto;user-select:none;display:none;text-shadow:0 1px 3px rgba(0,0,0,0.8);box-shadow:0 4px 16px rgba(170,68,255,0.5);min-width:120px;text-align:center;touch-action:manipulation;';
    this.interactBtn.textContent = '';
    // 触屏 / 鼠标点击都触发一次"按下"
    const onInteractTap = (ev: Event) => { ev.preventDefault(); this.mobileInteractPressed = true; };
    this.interactBtn.addEventListener('touchstart', onInteractTap);
    this.interactBtn.addEventListener('mousedown', onInteractTap);
    this.hudContainer.appendChild(this.interactBtn);

    // Overtime 横幅（gameTime 超过 540 + 玩家未进传送门时显示）
    this.overtimeBanner = document.createElement('div');
    this.overtimeBanner.style.cssText = 'position:absolute;top:50px;left:50%;transform:translateX(-50%);color:#ffaa00;font-size:14px;font-weight:bold;background:rgba(60,20,0,0.7);padding:6px 18px;border-radius:6px;border:1px solid #ff6600;display:none;text-shadow:0 1px 3px rgba(0,0,0,0.9);';
    this.hudContainer.appendChild(this.overtimeBanner);

    // Combo label (hidden initially)
    this.comboLabel = document.createElement('div');
    this.comboLabel.style.cssText = 'position:absolute;top:35%;left:50%;transform:translate(-50%,-50%);color:#ffd700;font-size:28px;font-weight:bold;text-shadow:0 0 12px rgba(255,215,0,0.8),0 2px 4px rgba(0,0,0,0.9);pointer-events:none;opacity:0;transition:opacity 0.3s ease-out;white-space:nowrap;';
    this.hudContainer.appendChild(this.comboLabel);

    // Boss attack warning ring (3D scene)
    const ringGeo = new THREE.RingGeometry(0.5, 3.5, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
    this.bossWarningRing = new THREE.Mesh(ringGeo, ringMat);
    this.bossWarningRing.name = 'BossWarningRing';
    this.bossWarningRing.visible = false;
    this.scene.add(this.bossWarningRing);
  }

  private setupDamageNumbers(): void {
    for (let i = 0; i < DAMAGE_NUM_POOL_SIZE; i++) {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;pointer-events:none;font-size:16px;font-weight:bold;opacity:0;transition:none;z-index:200;text-shadow:0 1px 3px rgba(0,0,0,0.9);white-space:nowrap;';
      el.dataset.animId = String(i);  // 稳定 id：GSAP 按元素 keying，池复用时 cancel 上一个 tween
      document.body.appendChild(el);
      this.damageNums.push(el);
    }
  }

  // ===========================================================================
  // Camera Effects — Layered Shake & Hit Stop
  // ===========================================================================

  triggerCameraShake(intensity: number, frequency: number, decay: number): void {
    this.shakeIntensity += intensity;
    // Cap maximum shake intensity
    this.shakeIntensity = Math.min(this.shakeIntensity, 0.15);
    this.shakeFrequency = frequency;
    this.shakeDecay = decay;
  }

  triggerHitStop(duration: number): void {
    this.hitStopTimer = duration;
  }

  // GM debug: 强制在指定坐标劈一道闪电（测试用）
  debugSpawnLightning(x: number, y: number, z: number): void {
    this.spawnLightningBolt(x, y, z);
  }

  /**
   * GM debug：切换碰撞盒可视化层。
   *
   * 颜色编码（透明 wireframe）：
   *   - 绿 col_  : 可站立平台（顶面 = 可走面）
   *   - 红 wall_ : 实心遮挡（横向阻挡 + 头顶下穿）
   *   - 蓝 climb_: 攀爬体（按 jump 抓墙）
   *   - 黄 ramp_ : 可行走斜坡（线性插值高度）
   *   - 品红 spawn_player/boss/altar/chest 标记球
   *
   * 数据源：客户端 `loadedLevel.data`（LevelLoader 解析的 LevelData）。
   * 没加载关卡时（默认 Neon Crucible）打印提示后跳过 —— Neon Crucible 的
   * col_ 矩形定义在 core/collision.ts 内置，客户端可以加载默认场景肉眼校对。
   */
  debugToggleCollisionViz(): boolean {
    if (this.collisionDebugGroup) {
      this.collisionDebugVisible = !this.collisionDebugVisible;
      this.collisionDebugGroup.visible = this.collisionDebugVisible;
      return this.collisionDebugVisible;
    }
    // 首次启用：lazy 构建
    if (!loadedLevel) {
      console.warn('[GM] 当前是内置 Neon Crucible（无 LevelData）。要可视化关卡碰撞，请用 ?level 加载白盒。');
      return false;
    }
    this.collisionDebugGroup = this.buildCollisionDebugGroup(loadedLevel.data);
    this.scene.add(this.collisionDebugGroup);
    this.collisionDebugVisible = true;
    return true;
  }

  private buildCollisionDebugGroup(data: LevelData): THREE.Group {
    const group = new THREE.Group();
    group.name = 'CollisionDebug';

    // 加色实心 fill（占据体积感，加色让重叠处更亮）
    const fillMat = (color: number, opacity: number) =>
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity,
        depthWrite: false, depthTest: false, // 永远置顶（debug overlay）
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });

    // 高亮 wireframe 边缘（用 EdgesGeometry，比 wireframe:true 干净）
    const edgeMat = (color: number) =>
      new THREE.LineBasicMaterial({
        color, transparent: true, opacity: 0.95,
        depthWrite: false, depthTest: false,
      });

    // 给一个 box 加一组 fill + edge，自动放进 group 并提高 renderOrder。
    const addBox = (
      cx: number, cy: number, cz: number,
      sx: number, sy: number, sz: number,
      color: number, fillOpacity: number,
    ) => {
      const geo = new THREE.BoxGeometry(sx, sy, sz);
      const fill = new THREE.Mesh(geo, fillMat(color, fillOpacity));
      fill.position.set(cx, cy, cz);
      fill.renderOrder = 9999;
      group.add(fill);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat(color));
      edges.position.set(cx, cy, cz);
      edges.renderOrder = 10000;
      group.add(edges);
    };

    // col_: 绿色（顶面 = 可走面；baseY 缺省 = height - 1 即视觉厚 1 单位）
    for (const r of data.collisionRects) {
      const baseY = r.baseY ?? r.height - 1;
      const sy = Math.max(r.height - baseY, 0.01);
      addBox(r.cx, (baseY + r.height) / 2, r.cz, r.halfW * 2, sy, r.halfD * 2, 0x00ff44, 0.18);
    }

    // wall_: 红色（亮一点的 fill 凸显挡墙）
    for (const w of data.walls ?? []) {
      const sy = Math.max(w.topY - w.bottomY, 0.01);
      addBox(w.cx, (w.bottomY + w.topY) / 2, w.cz, w.halfW * 2, sy, w.halfD * 2, 0xff3355, 0.28);
    }

    // climb_: 蓝色
    for (const c of data.climbVolumes ?? []) {
      const sy = Math.max(c.topY - c.bottomY, 0.01);
      addBox(c.cx, (c.bottomY + c.topY) / 2, c.cz, c.halfW * 2, sy, c.halfD * 2, 0x33aaff, 0.25);
    }

    // ramp_: 黄色——按 slopeDir 旋转的盒子，对齐真实斜面 footprint
    for (const r of data.ramps ?? []) {
      const sy = Math.max(r.highY - r.lowY, 0.01);
      const cy = (r.lowY + r.highY) / 2;
      const rotY = Math.atan2(-r.slopeDirZ, r.slopeDirX); // 对齐 local +X 到 slopeDir
      const geo = new THREE.BoxGeometry(r.halfSlope * 2, sy, r.halfPerp * 2);
      const fill = new THREE.Mesh(geo, fillMat(0xffcc00, 0.20));
      fill.position.set(r.cx, cy, r.cz);
      fill.rotation.y = rotY;
      fill.renderOrder = 9999;
      group.add(fill);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat(0xffcc00));
      edges.position.set(r.cx, cy, r.cz);
      edges.rotation.y = rotY;
      edges.renderOrder = 10000;
      group.add(edges);
    }

    // spawn 点：品红色发光大球（半径 0.7，永远置顶）
    const spawnFillMat = new THREE.MeshBasicMaterial({
      color: 0xff33ff, transparent: true, opacity: 0.9,
      depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    const markSpawn = (x: number, z: number, label: string) => {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 12), spawnFillMat);
      ball.position.set(x, 0.7, z);
      ball.name = `Spawn_${label}`;
      ball.renderOrder = 10001;
      group.add(ball);
      // 顶上加一根细立柱（高 5 单位）让远处也能看见
      const pillarGeo = new THREE.CylinderGeometry(0.06, 0.06, 5, 8);
      const pillar = new THREE.Mesh(pillarGeo, spawnFillMat);
      pillar.position.set(x, 2.5, z);
      pillar.renderOrder = 10001;
      group.add(pillar);
    };
    for (const p of data.spawnPoints?.players ?? []) markSpawn(p.x, p.z, 'player');
    for (const p of data.spawnPoints?.bosses ?? []) markSpawn(p.x, p.z, 'boss');
    for (const a of data.spawnPoints?.altars ?? []) markSpawn(a.x, a.z, 'altar');
    for (const c of data.chestSpawns ?? []) markSpawn(c.x, c.z, 'chest');

    console.log(
      `[GM] CollisionDebug: ${data.collisionRects.length} col, ${data.walls?.length ?? 0} wall, ` +
      `${data.climbVolumes?.length ?? 0} climb, ${data.ramps?.length ?? 0} ramp, ` +
      `${(data.spawnPoints?.players?.length ?? 0) + (data.spawnPoints?.bosses?.length ?? 0) + (data.spawnPoints?.altars?.length ?? 0) + (data.chestSpawns?.length ?? 0)} spawn`,
    );
    return group;
  }

  // ===========================================================================
  // Animate Loop
  // ===========================================================================

  private animate(): void {
    this.animationId = requestAnimationFrame(() => this.animate());

    const now = performance.now();
    const dt = this.lastTime > 0 ? Math.min((now - this.lastTime) / 1000, 0.05) : 1 / 60;
    this.lastTime = now;
    this.frameDt = dt;

    // Hit Stop / Freeze Frame (顿帧) — skip rendering updates while timer active
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= dt;
      // Still render the frozen frame
      this.renderFrame();
      return;
    }

    const state = this.session.getRenderState();

    // 玩家在 playing / boss_fight / portal_open 阶段都能控制角色：
    // - portal_open 是 Boss 击败后、玩家可选进传送门或留下打 overtime 的中间态
    if (state.phase === 'playing' || state.phase === 'boss_fight' || state.phase === 'portal_open') {
      this.handleInput();
    }

    // Blob 阴影：每帧前重置，玩家/敌人/boss 在各自 render 里贴脚下圆阴影。
    if (!this.blobShadows) this.blobShadows = new BlobShadowPool(this.scene);
    this.blobShadows.begin();

    this.renderPlayer(state);
    this.renderEnemies(state.enemies);
    this.renderProjectiles(state.projectiles);
    this.renderPickups(state.pickups);
    this.renderConsumablePickups(state.consumablePickups ?? []);
    this.renderGoldMotes(state.goldMotes ?? []);
    this.renderBoss(state.boss);

    this.blobShadows.end(); // 回收本帧未用到的贴片
    this.renderTeleporters(state.altars);
    this.renderChests(state.chests);
    this.renderShrines(state.shrines, state.player.x, state.player.z);
    this.updateVFX(state, dt);
    this.updateBillboardVfx(dt);
    this.updateCamera(state);

    // Process damage events for camera effects
    for (const evt of state.damageEvents) {
      if (evt.isPlayerDamage) {
        // Player took damage: only meaningful shake event
        this.triggerCameraShake(0.12, 12, 10);
      }
      // Crits and normal hits: no shake (too frequent with multiple projectiles)
    }

    // Boss attack shake — only on heavy attacks
    if (state.boss && state.boss.currentAttack === 'ground_slam' && state.boss.attackTimer > 0 && state.boss.attackTimer < 0.05) {
      this.triggerCameraShake(0.15, 10, 8);
    }

    // Dynamic zoom: brief zoom-in when weapon evolves (detected via level-up with evolved weapon)
    const hasEvolvedWeapon = state.player.weapons.some(w => w.evolved);
    if (hasEvolvedWeapon && state.phase === 'level_up' && this.lastPhase !== 'level_up') {
      this.targetFOV = 50;
      // Reset to base after 0.3s equivalent via the lerp
    }

    this.updateHUD(state);

    this.renderFrame();
  }

  // ===========================================================================
  // Input
  // ===========================================================================

  private handleInput(): void {
    const raw = this.platformInput.getInput();
    // Apply deadzone
    let mx = raw.moveX ?? 0;
    let my = raw.moveY ?? 0;
    if (Math.abs(mx) < 0.15) mx = 0;
    if (Math.abs(my) < 0.15) my = 0;

    // 镜头相对移动：摇杆/WASD 的"前进"始终朝镜头看向的方向（只用 yaw，不用 pitch，
    // 即看向天空 W 也是水平前进，第三人称游戏标准做法）。
    // yaw = 0 时退化为原行为：moveX = -mx（横移），moveY = -my（+Z 前进）。
    const yaw = this.cameraOrbit.getYaw();
    const f = -my;
    const s = -mx;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const input: InputState = {
      moveX: f * sy + s * cy,
      moveY: f * cy - s * sy,
      dash: false,
      skill1: raw.action3 ?? false,
      skill2: false,
      jump: this.jumpKeyDown || (raw.action1 ?? false),
      slide: raw.action2 ?? false,
      interact: this.interactKeyPressed || (this.mobileInteractPressed ?? false),
    };
    // 边缘触发：发出后立即清零，避免长按反复触发
    this.interactKeyPressed = false;
    this.mobileInteractPressed = false;
    this.platformInput.endFrame();
    this.session.sendAction(input);
  }

  // ===========================================================================
  // Rendering
  // ===========================================================================

  private renderPlayer(state: GameState): void {
    const p = state.player;
    const time = performance.now() * 0.001;

    // === Update animation mixer with real delta time ===
    if (this.playerMixer) {
      this.playerMixer.update(this.frameDt);
    }

    // === Position (y=0 for loaded model, y=1.0 for fallback capsule) ===
    const isGltfModel = this.playerMesh.name === 'Player' && this.playerMesh.children.length > 0;
    const modelY = isGltfModel ? 0 : 1.0;
    this.playerMesh.position.set(p.x, p.y + modelY, p.z);

    // Blob 阴影贴在玩家脚下（p.y 即脚位）
    if (p.alive) this.blobShadows?.place(p.x, p.y, p.z, 0.55);

    // === Rotation: smooth interpolation, only when moving ===
    if (p.currentSpeed > 0.3) {
      // Smoothly rotate toward target (prevent sudden spinning)
      let angleDiff = p.rotation - this.playerMesh.rotation.y;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      // Faster rotation at low speed (immediate turn), slower at high speed (smooth arc)
      const rotSpeed = p.currentSpeed > 3.0 ? 0.12 : 0.2;
      this.playerMesh.rotation.y += angleDiff * rotSpeed;
    }
    this.playerMesh.visible = p.alive;

    // === Death Animation ===
    if (!p.alive && this.wasAlive) {
      // Player just died — trigger death animation
      this.deathAnimTimer = 0.5;
      this.spawnDeathBurst(p.x, p.y, p.z);
      this.triggerScreenFlash('#ff0000', 0.3);
      this.playPlayerAnim('Death');
    }
    this.wasAlive = p.alive;

    if (this.deathAnimTimer > 0) {
      const dt = 1 / 60;
      this.deathAnimTimer -= dt;
      this.playerMesh.visible = true; // keep visible during death anim
      if (this.deathAnimTimer <= 0) {
        this.playerMesh.visible = false;
      }
    } else if (p.alive) {
      // === Choose skeletal animation based on state ===
      if (p.isSliding) {
        this.playPlayerAnim('Run_Holding', 1.5); // Crouched run = slide visual, sped up
      } else if (p.isJumping || !p.isGrounded) {
        // Only trigger Jump animation once on takeoff — let it play through fully
        if (this.wasGrounded) {
          // Just left the ground: trigger Jump animation
          // timeScale 1.3 = animation(0.87s) matches physics airtime(0.67s)
          this.playPlayerAnim('Jump', 1.3);
        }
        // While in air: don't re-trigger, let animation play
      } else if (p.currentSpeed > 3.0) {
        // Run — scale animation speed with movement speed
        const runScale = Math.min(p.currentSpeed / 4.0, 1.4);
        this.playPlayerAnim('Run', runScale);
      } else if (p.currentSpeed > 0.3) {
        // Walk — scale animation speed with movement speed
        const walkScale = Math.min(p.currentSpeed / 2.0, 1.3);
        this.playPlayerAnim('Walk', walkScale);
      } else {
        this.playPlayerAnim('Idle', 1.0);
      }
      this.wasGrounded = p.isGrounded;

      // === Invincibility flash === 委托给 playerFx（半透明脉冲，避免频闪）
      this.playerFx.update(this.playerMesh, p.invincibleTimer, time);

      // Keep scale at 1 (skeletal animation handles deformation)
      this.playerMesh.scale.set(
        this.playerMesh.scale.x > 0 ? Math.abs(this.playerMesh.scale.x) : 1,
        this.playerMesh.scale.y > 0 ? Math.abs(this.playerMesh.scale.y) : 1,
        this.playerMesh.scale.z > 0 ? Math.abs(this.playerMesh.scale.z) : 1,
      );
    }

    // === Level Up Animation ===
    if (state.phase === 'level_up' && this.lastPhase !== 'level_up') {
      this.levelUpAnimTimer = 0.3;
      this.spawnLevelUpBurst(p.x, p.y, p.z);
      this.triggerScreenFlash('#ffcc00', 0.2);
    }
    this.lastPhase = state.phase;

    if (this.levelUpAnimTimer > 0 && p.alive && this.deathAnimTimer <= 0) {
      const dt = 1 / 60;
      this.levelUpAnimTimer -= dt;
    }

    // === Ring follows player ===
    this.playerRing.position.set(p.x, p.y + 0.02, p.z);
    this.playerRing.visible = p.alive;

    // === Spotlight follows player ===
    this.playerSpotLight.position.set(p.x, p.y + 12, p.z);
    this.playerSpotLight.target.position.set(p.x, p.y, p.z);

    // Ring pulse when many pickups attracted
    const ringMat = this.playerRing.material as THREE.MeshBasicMaterial;
    const attractedCount = state.pickups.filter(pk => pk.attracted).length;
    if (attractedCount > 5) {
      const pulse = 0.7 + Math.sin(time * 8) * 0.3;
      ringMat.opacity = pulse;
      this.playerRing.scale.set(1 + attractedCount * 0.02, 1, 1 + attractedCount * 0.02);
    } else {
      ringMat.opacity = 0.7;
      this.playerRing.scale.set(1, 1, 1);
    }

    // === Evolved weapon glow ===
    const hasEvolved = p.weapons.some(w => w.evolved);
    if (hasEvolved) {
      ringMat.color.setHex(0xffcc00);
      const ringPulse = 0.7 + Math.sin(time * 5) * 0.3;
      ringMat.opacity = ringPulse;
      const ringScale = 1.0 + Math.sin(time * 3) * 0.15;
      this.playerRing.scale.set(ringScale, 1, ringScale);

      // Golden aura
      this.playerAuraMesh.visible = p.alive;
      this.playerAuraMesh.position.set(p.x, p.y + modelY, p.z);
      const auraPulse = 0.08 + Math.sin(time * 4) * 0.04;
      (this.playerAuraMesh.material as THREE.MeshBasicMaterial).opacity = auraPulse;
      const auraScale = 1.0 + Math.sin(time * 2.5) * 0.1;
      this.playerAuraMesh.scale.set(auraScale, auraScale, auraScale);
    } else {
      ringMat.color.setHex(0x00ff88);
      this.playerAuraMesh.visible = false;
    }

    // === Weapon orbs (legacy stub) ===
    this.renderWeaponOrbs(state);
    // === Floating weapon display (physical weapons hover near player) ===
    this.renderWeaponFloaters(state);
  }

  private renderWeaponOrbs(state: GameState): void {
    const weapons = state.player.weapons;
    const time = performance.now() * 0.002;
    const count = Math.min(weapons.length, this.MAX_WEAPON_ORBS);

    for (let i = 0; i < count; i++) {
      const angle = time + i * (Math.PI * 2 / count);
      const radius = 1.5;
      const orbX = state.player.x + Math.cos(angle) * radius;
      const orbZ = state.player.z + Math.sin(angle) * radius;
      const orbY = state.player.y + 0.8 + Math.sin(time * 3 + i) * 0.1;

      this._dummy.position.set(orbX, orbY, orbZ);
      this._dummy.scale.set(1, 1, 1);
      this._dummy.rotation.set(0, 0, 0);
      this._dummy.updateMatrix();
      this.weaponOrbMesh.setMatrixAt(i, this._dummy.matrix);

      // Color based on weapon type
      const wColor = WEAPON_PROJECTILE_COLORS[weapons[i].type] ?? 0xffffff;
      this._tempColor.setHex(wColor);
      this.weaponOrbMesh.setColorAt(i, this._tempColor);
    }

    this.weaponOrbMesh.count = state.player.alive ? count : 0;
    this.weaponOrbMesh.instanceMatrix.needsUpdate = true;
    if (this.weaponOrbMesh.instanceColor) this.weaponOrbMesh.instanceColor.needsUpdate = true;
  }

  // Build a base 3D model for the given physical weapon type to float near
  // the player. Always returns base (unevolved) model — upgrades are reflected
  // through stats/effects, not floater geometry.
  private buildFloaterModel(weaponType: string): THREE.Object3D | null {
    switch (weaponType) {
      case 'sword':    return swordModel ? swordModel.clone(true) : null;
      case 'axe':      return axeModel ? axeModel.clone(true) : null;
      case 'bow':      return bowModel ? bowModel.clone(true) : null; // Revolver model
      case 'shotgun':  return dartGoldenModel ? dartGoldenModel.clone(true) : null;
      case 'bone_bouncer': {
        if (!boneGeometry) return null;
        const mat = new THREE.MeshToonMaterial({ color: 0xf5f5dc, gradientMap: toonGradientMap });
        return new THREE.Mesh(boneGeometry.clone(), mat);
      }
      default: return null;
    }
  }

  // Renders physical weapons (sword/axe/bone/bow/shotgun) as visual
  // floaters that orbit the player. Magic weapons render no floater —
  // they express themselves entirely through VFX (see updateVFX).
  private renderWeaponFloaters(state: GameState): void {
    const player = state.player;
    if (!player.alive) {
      for (const obj of this.weaponFloaters.values()) obj.visible = false;
      return;
    }

    const time = performance.now() * 0.001;

    // Equipped physical weapon types (preserve weapons[] order so each
    // floater keeps a stable orbit slot)
    const equipped: string[] = [];
    for (const w of player.weapons) {
      if (GameScene.FLOATER_WEAPON_TYPES.includes(w.type)) equipped.push(w.type);
    }
    const equippedSet = new Set(equipped);

    // Hide unequipped floaters
    for (const [type, obj] of this.weaponFloaters) {
      if (!equippedSet.has(type)) obj.visible = false;
    }

    if (equipped.length === 0) return;

    const orbitRadius = 1.4;
    const orbitSpeed = 0.6; // rad/sec
    const slotCount = equipped.length;

    for (let i = 0; i < slotCount; i++) {
      const type = equipped[i];
      let obj = this.weaponFloaters.get(type);
      if (!obj) {
        const built = this.buildFloaterModel(type);
        if (!built) continue;
        obj = built;
        obj.name = `Floater_${type}`;
        this.scene.add(obj);
        this.weaponFloaters.set(type, obj);
      }

      // Distribute around player
      const slotAngle = (i / slotCount) * Math.PI * 2;
      const angle = time * orbitSpeed + slotAngle;
      const orbX = player.x + Math.cos(angle) * orbitRadius;
      const orbZ = player.z + Math.sin(angle) * orbitRadius;
      const bobY = player.y + 1.5 + Math.sin(time * 2.0 + i * 1.3) * 0.18;
      obj.position.set(orbX, bobY, orbZ);

      // Per-weapon self-rotation: each weapon has a recognizable idle pose
      obj.rotation.order = 'YXZ';
      switch (type) {
        case 'axe':
          // Spin like a discus: blade axis points outward from player
          obj.rotation.set(Math.PI / 2, angle + Math.PI / 2, time * 6);
          break;
        case 'sword':
          // Tip up, slow yaw spin
          obj.rotation.set(0, time * 1.4, 0);
          break;
        case 'bow':
        case 'shotgun':
          // Dart points along orbit tangent (forward direction of travel)
          obj.rotation.set(Math.sin(time * 2 + i) * 0.15, angle + Math.PI / 2, 0);
          break;
        case 'bone_bouncer':
          // Tumbling bone
          obj.rotation.set(time * 1.6 + i, time * 2.2 + i * 0.7, time * 1.0);
          break;
      }
      obj.visible = true;
    }
  }

  // === Magic weapon VFX ===

  // Sword slash arc: a horizontal ring-segment plane that flashes on cooldown reset
  private spawnSlashArc(x: number, y: number, z: number, angle: number): void {
    // 120° arc, inner 1.0 → outer 1.9
    const geo = new THREE.RingGeometry(1.0, 1.9, 24, 1, -Math.PI / 3, (Math.PI * 2) / 3);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xddffff,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    // Lay flat on horizontal plane
    mesh.rotation.x = -Math.PI / 2;
    // Aim the arc opening toward the target direction
    mesh.rotation.z = -angle + Math.PI / 2;
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.slashEffects.push({ mesh, life: 0.18, maxLife: 0.18 });
  }

  // Lightning bolt: procedural jagged path with double-layer glow, impact light, ground ring
  private spawnLightningBolt(x: number, y: number, z: number): void {
    const height = 8;
    const segments = 12;
    const jitter = 0.4;
    const maxLife = 0.25;       // 适中寿命，不长不短

    // ---- Jagged path ----
    const path = this.buildLightningPath(x, y, z, height, segments, jitter);

    // ---- Outer glow tube: thick, light blue, low opacity ----
    // 段数收敛（tubular 12 / radial 4）：TubeGeometry 构建是 CPU 重活，多道齐发时省开销。
    const glowGeo = new THREE.TubeGeometry(path, 12, 0.45, 4, false);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x66bbff,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.name = 'LightningGlow';

    // ---- Inner core tube: thin, white, full bright ----
    const coreGeo = new THREE.TubeGeometry(path, 12, 0.11, 4, false);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.name = 'LightningCore';

    // 闪光由常驻共享灯负责（不再每道新建 PointLight）：定位 + 点亮，强度在 update 里衰减。
    this.lightningFlashLight.position.set(x, y + 0.5, z);
    this.lightningFlashLight.intensity = 6;

    // ---- Ground impact ring: expands outward and fades ----
    const ringGeo = new THREE.RingGeometry(0.3, 0.5, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xaaddff,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y + 0.02, z);
    ring.name = 'LightningRing';

    this.scene.add(glow);
    this.scene.add(core);
    this.scene.add(ring);

    this.lightningBolts.push({
      core, glow, ring,
      endX: x, endY: y, endZ: z, height,
      life: maxLife, maxLife,
      flickerTimer: 0.05,
    });

    // Spark burst at impact — light blue/white
    const sparkCount = 14;
    for (let i = 0; i < sparkCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 4;
      const sg = 0.85 + Math.random() * 0.15;
      const sb = 1.0;
      const sr = 0.6 + Math.random() * 0.4;
      this.spawnParticle(
        x, y + 0.4, z,
        Math.cos(a) * speed, 4 + Math.random() * 3, Math.sin(a) * speed,
        1.4 + Math.random() * 0.6,
        0.3 + Math.random() * 0.2,
        sr, sg, sb,
      );
    }
  }

  // Generate a jagged top-down lightning path. Endpoints are anchored; middle vertices jitter.
  private buildLightningPath(
    x: number, y: number, z: number,
    height: number, segments: number, jitter: number,
  ): THREE.CatmullRomCurve3 {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const damp = (i === 0 || i === segments) ? 0 : 1;
      const dx = (Math.random() - 0.5) * 2 * jitter * damp;
      const dz = (Math.random() - 0.5) * 2 * jitter * damp;
      points.push(new THREE.Vector3(
        x + dx,
        y + height * (1 - t),
        z + dz,
      ));
    }
    return new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
  }

  // Persistent flame ring disk — created lazily, follows player while equipped
  private ensureFlameRingDisk(): THREE.Mesh {
    if (this.flameRingDisk) return this.flameRingDisk;
    const geo = new THREE.RingGeometry(1.7, 2.7, 48);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff5511,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.name = 'FlameRingDisk';
    this.scene.add(mesh);
    this.flameRingDisk = mesh;
    return mesh;
  }

  // Drive transient meshes (slash arcs, lightning bolts): fade and dispose
  private updateTransientEffects(dt: number): void {
    // Slash arcs: scale up + fade
    for (let i = this.slashEffects.length - 1; i >= 0; i--) {
      const e = this.slashEffects[i];
      e.life -= dt;
      if (e.life <= 0) {
        this.scene.remove(e.mesh);
        e.mesh.geometry.dispose();
        (e.mesh.material as THREE.Material).dispose();
        this.slashEffects.splice(i, 1);
        continue;
      }
      const t = e.life / e.maxLife;     // 1 → 0
      const grow = 1 + (1 - t) * 0.45;
      e.mesh.scale.set(grow, grow, 1);
      (e.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * t;
    }

    // Lightning bolts: jagged path flickers, tubes/ring fade together. 闪光交给常驻共享灯。
    let flashIntensity = 0; // 本帧所有闪电对共享灯的最强贡献
    let flashX = 0, flashY = 0, flashZ = 0;
    for (let i = this.lightningBolts.length - 1; i >= 0; i--) {
      const e = this.lightningBolts[i];
      e.life -= dt;
      e.flickerTimer -= dt;

      if (e.life <= 0) {
        this.scene.remove(e.core);
        this.scene.remove(e.glow);
        this.scene.remove(e.ring);
        e.core.geometry.dispose();
        (e.core.material as THREE.Material).dispose();
        e.glow.geometry.dispose();
        (e.glow.material as THREE.Material).dispose();
        e.ring.geometry.dispose();
        (e.ring.material as THREE.Material).dispose();
        this.lightningBolts.splice(i, 1);
        continue;
      }

      const t = e.life / e.maxLife;
      const inv = 1 - t;
      // 标准二次衰减
      const fade = t * t;

      // 1. Flicker: 只在寿命中段重建一次路径（之前每 60ms 重建两根 tube，CPU 太重）。
      if (e.flickerTimer <= 0) {
        e.flickerTimer = Number.POSITIVE_INFINITY; // 只重建一次
        const newPath = this.buildLightningPath(e.endX, e.endY, e.endZ, e.height, 12, 0.4);
        e.core.geometry.dispose();
        e.glow.geometry.dispose();
        e.core.geometry = new THREE.TubeGeometry(newPath, 12, 0.11, 4, false);
        e.glow.geometry = new THREE.TubeGeometry(newPath, 12, 0.45, 4, false);
      }

      // 2. Opacity
      (e.core.material as THREE.MeshBasicMaterial).opacity = fade;
      (e.glow.material as THREE.MeshBasicMaterial).opacity = 0.5 * fade;

      // 3. 收集对共享闪光灯的贡献（取最亮的一道定位）
      const lit = 6 * fade;
      if (lit > flashIntensity) { flashIntensity = lit; flashX = e.endX; flashY = e.endY + 0.5; flashZ = e.endZ; }

      // 4. Ground ring: expand and fade
      const ringScale = 0.3 + inv * 5;
      e.ring.scale.set(ringScale, ringScale, 1);
      (e.ring.material as THREE.MeshBasicMaterial).opacity = 0.7 * fade;
    }
    // 驱动常驻共享灯：有闪电就跟最亮那道，否则归零（光源数始终不变，无重编译）。
    this.lightningFlashLight.intensity = flashIntensity;
    if (flashIntensity > 0) this.lightningFlashLight.position.set(flashX, flashY, flashZ);
  }

  private spawnSlideDust(x: number, y: number, z: number): void {
    const count = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      this.spawnParticle(
        x + (Math.random() - 0.5) * 0.5,
        y + Math.random() * 0.2,
        z + (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 1.0,
        Math.random() * 0.5,
        (Math.random() - 0.5) * 1.0,
        0.4,
        0.3,
        0.8, 0.8, 0.7,
      );
    }
  }

  private spawnDeathBurst(x: number, y: number, z: number): void {
    this.emitDeathBurst(x, y, z, 'generic');
  }

  private spawnLevelUpBurst(x: number, y: number, z: number): void {
    this.emitLevelUpBurst(x, y, z);
    // Billboard: 仪式感 ↑ —— 头顶大星光 + 上升光柱
    this.spawnBillboard({
      texture: 'star',
      x, y: y + 1.6, z,
      scale: 1.5,
      endScale: 4.5,
      lifetime: 0.7,
      opacityCurve: 'flash',
      opacity: 1.0,
      color: 0xffd866,
      rotationSpeed: 4.0,
    });
    this.spawnBillboard({
      texture: 'light',
      x, y: y + 0.5, z,
      scale: 2.0,
      endScale: 3.5,
      lifetime: 0.8,
      opacityCurve: 'fadeOut',
      opacity: 0.85,
      color: 0xffe080,
    });
  }

  private triggerScreenFlash(color: string, duration: number): void {
    // 使用 GSAP 屏幕闪光动画
    gsapAnimations.screenFlash(color, duration);

    // 清理旧的屏幕闪光元素（如果有）
    if (this.screenFlashEl) {
      this.screenFlashEl.remove();
      this.screenFlashEl = null;
    }
  }

  private renderEnemies(enemies: EnemyState[]): void {
    // Track which enemy IDs are alive this frame
    const aliveIds = new Set<number>();
    for (const enemy of enemies) {
      aliveIds.add(enemy.id);
    }

    // Move newly dead enemies to dying animation state instead of immediately removing
    for (const [id, obj] of this.enemyObjects) {
      if (!aliveIds.has(id) && !this.dyingEnemies.has(id)) {
        // Start death animation
        this.playEnemyAnim(id, 'Death');
        this.dyingEnemies.set(id, { obj, timer: 0.6, type: obj.userData['enemyType'] as string });
        this.enemyObjects.delete(id);
      }
    }

    // Update dying enemies (play death anim, count down timer)
    const dt = 1 / 60;
    for (const [id, dying] of this.dyingEnemies) {
      dying.timer -= dt;
      // Keep updating mixer for death animation
      const mixer = this.enemyMixers.get(id);
      if (mixer) {
        mixer.update(dt);
      }
      // Sink into ground and fade
      dying.obj.position.y -= dt * 1.5;
      if (dying.timer <= 0) {
        // Fully dead — hide and recycle
        dying.obj.visible = false;
        if (mixer) {
          mixer.stopAllAction();
          this.enemyMixers.delete(id);
        }
        this.enemyAnimStates.delete(id);
        this.enemyAnimActions.delete(id);
        // Return to pool
        const pool = this.enemyPool.get(dying.type) ?? [];
        pool.push(dying.obj);
        this.enemyPool.set(dying.type, pool);
        this.dyingEnemies.delete(id);
      }
    }

    // Map enemy types to model keys
    const enemyModelMap: Record<string, keyof LoadedModels> = {
      skeleton_soldier: 'zombie_basic',
      zombie: 'zombie_chubby',
      skeleton_archer: 'zombie_arm',
      skeleton_knight: 'zombie_chubby',
      necromancer: 'zombie_basic',
      gargoyle: 'zombie_arm',
    };

    const enemyScales: Record<string, number> = {
      skeleton_soldier: 0.9,   // Basic zombie — smaller
      zombie: 1.4,             // Chubby — bigger tank
      skeleton_archer: 1.1,    // Arm — lean
      skeleton_knight: 1.8,    // Chubby — elite, large
      necromancer: 0.9,        // Basic — caster (smaller)
      gargoyle: 1.1,           // Arm — lunging
    };

    // Update or create objects for each alive enemy
    for (const enemy of enemies) {
      let obj = this.enemyObjects.get(enemy.id);

      if (!obj) {
        // Try get from pool or create new
        const pool = this.enemyPool.get(enemy.type);
        if (pool && pool.length > 0) {
          obj = pool.pop()!;
          // Reset animation state for recycled object — create new mixer
          const modelKey = enemyModelMap[enemy.type];
          const clips = modelKey ? loadedAnimClips.get(modelKey) : undefined;
          if (clips && clips.length > 0) {
            const mixer = new THREE.AnimationMixer(obj);
            this.enemyMixers.set(enemy.id, mixer);
            const actionsMap = new Map<string, THREE.AnimationAction>();
            for (const clip of clips) {
              actionsMap.set(clip.name, mixer.clipAction(clip));
            }
            this.enemyAnimActions.set(enemy.id, actionsMap);
            // Play idle by default
            const idleClip = clips.find(c => c.name === 'Idle') ?? clips.find(c => c.name === 'Walk');
            if (idleClip) {
              mixer.clipAction(idleClip).play();
              this.enemyAnimStates.set(enemy.id, idleClip.name);
            }
          }
        } else {
          // Clone from loaded model
          const modelKey = enemyModelMap[enemy.type];
          const model = modelKey ? loadedModels[modelKey] : null;
          if (model) {
            obj = cloneSkeleton(model) as THREE.Object3D;
            // Setup animation mixer for cloned model
            const clips = modelKey ? loadedAnimClips.get(modelKey) : undefined;
            if (clips && clips.length > 0) {
              const mixer = new THREE.AnimationMixer(obj);
              this.enemyMixers.set(enemy.id, mixer);
              const actionsMap = new Map<string, THREE.AnimationAction>();
              for (const clip of clips) {
                actionsMap.set(clip.name, mixer.clipAction(clip));
              }
              this.enemyAnimActions.set(enemy.id, actionsMap);
              // Play idle by default
              const idleClip = clips.find(c => c.name === 'Idle') ?? clips.find(c => c.name === 'Walk');
              if (idleClip) {
                mixer.clipAction(idleClip).play();
                this.enemyAnimStates.set(enemy.id, idleClip.name);
              }
            }
          } else {
            // Fallback: colored box
            const geo = new THREE.BoxGeometry(0.9, 1.2, 0.9);
            const mat = new THREE.MeshToonMaterial({ color: ENEMY_COLORS[enemy.type] ?? 0x888888, gradientMap: toonGradientMap });
            obj = new THREE.Mesh(geo, mat);
          }
          obj.name = `Enemy_${enemy.type}_${enemy.id}`;
          obj.userData['enemyType'] = enemy.type;
          this.scene.add(obj);
        }
        this.enemyObjects.set(enemy.id, obj);
      }

      // Update transform
      const baseScale = enemyScales[enemy.type] ?? 0.6;
      const sizeMultiplier = enemy.isMiniBoss ? 1.5 : (enemy.isElite ? 1.2 : 1.0);
      const s = baseScale * sizeMultiplier;
      obj.position.set(enemy.x, enemy.y, enemy.z);
      obj.scale.set(s, s, s);
      obj.visible = true;

      // Blob 阴影贴脚下（飞行的 gargoyle 不贴 —— 它在空中，脚位非地面）
      if (enemy.type !== 'gargoyle') {
        this.blobShadows?.place(enemy.x, enemy.y, enemy.z, s * 0.5);
      }

      // Face toward player (or movement direction)
      const state = this.session.getRenderState();
      const dx = state.player.x - enemy.x;
      const dz = state.player.z - enemy.z;
      if (dx !== 0 || dz !== 0) {
        obj.rotation.y = Math.atan2(dx, dz);
      }

      // Choose enemy animation based on state
      if (enemy.hitFlashTimer > 0) {
        this.playEnemyAnim(enemy.id, 'HitReact');
        obj.visible = Math.sin(performance.now() * 0.03) > 0;
      } else if (enemy.chargeState === 'charging') {
        this.playEnemyAnim(enemy.id, 'Run_Attack');
        obj.visible = true;
      } else if (enemy.chargeState === 'windup') {
        this.playEnemyAnim(enemy.id, 'Idle');
      } else if (enemy.attackCooldown > enemy.attackCooldownMax * 0.8) {
        // Just attacked (cooldown just reset)
        this.playEnemyAnim(enemy.id, 'Punch');
      } else if (enemy.speed > 0.3) {
        // Moving enemy — prefer Run_Arms (zombie arms out), fallback to Run/Walk
        const actionsMap = this.enemyAnimActions.get(enemy.id);
        if (actionsMap?.has('Run_Arms')) {
          this.playEnemyAnim(enemy.id, 'Run_Arms');
        } else if (actionsMap?.has('Run')) {
          this.playEnemyAnim(enemy.id, 'Run');
        } else {
          this.playEnemyAnim(enemy.id, 'Walk');
        }
      } else {
        this.playEnemyAnim(enemy.id, 'Idle');
      }

      // Update enemy mixer
      const mixer = this.enemyMixers.get(enemy.id);
      if (mixer) {
        mixer.update(this.frameDt);
      }
    }

    this.updateParalysisTriangleSprites(enemies);
    this.updateBondEnemyMarkers(enemies);

    // Hide InstancedMesh (legacy — keep count at 0)
    for (const [, mesh] of this.enemyMeshes) {
      mesh.count = 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private updateParalysisTriangleSprites(enemies: EnemyState[]): void {
    const markedIds = new Set<number>();
    const offsets = [
      { x: 0.0, y: 1.45, z: 0.0, scale: 0.46, phase: 0.0 },
      { x: -0.34, y: 1.15, z: 0.18, scale: 0.36, phase: 1.2 },
      { x: 0.34, y: 1.05, z: -0.18, scale: 0.36, phase: 2.4 },
      { x: -0.24, y: 0.72, z: -0.24, scale: 0.3, phase: 3.1 },
      { x: 0.24, y: 0.78, z: 0.24, scale: 0.3, phase: 4.0 },
    ];
    const time = performance.now() * 0.004;

    for (const enemy of enemies) {
      if (enemy.hp <= 0 || (enemy.slowTimer ?? 0) <= 0) continue;
      markedIds.add(enemy.id);

      let sprites = this.paralysisTriangleSprites.get(enemy.id);
      if (!sprites) {
        const texture = getParalysisTriangleTexture();
        sprites = offsets.map((offset, index) => {
          const material = new THREE.SpriteMaterial({
            map: texture,
            color: 0xffffff,
            transparent: true,
            opacity: 0.86,
            depthWrite: false,
            depthTest: true,
          });
          const sprite = new THREE.Sprite(material);
          sprite.name = `ParalysisTriangle_${enemy.id}_${index}`;
          sprite.renderOrder = 6;
          this.scene.add(sprite);
          return sprite;
        });
        this.paralysisTriangleSprites.set(enemy.id, sprites);
      }

      sprites.forEach((sprite, index) => {
        const offset = offsets[index];
        const bob = Math.sin(time * 2.5 + enemy.id * 0.37 + offset.phase) * 0.045;
        const pulse = 0.88 + Math.sin(time * 3.4 + offset.phase) * 0.12;
        sprite.position.set(enemy.x + offset.x, enemy.y + offset.y + bob, enemy.z + offset.z);
        sprite.scale.setScalar(offset.scale * pulse);
        sprite.material.opacity = 0.74 + Math.sin(time * 5.0 + offset.phase) * 0.16;
        sprite.visible = true;
      });
    }

    for (const [id, sprites] of this.paralysisTriangleSprites) {
      if (markedIds.has(id)) continue;
      for (const sprite of sprites) {
        this.scene.remove(sprite);
        sprite.material.dispose();
      }
      this.paralysisTriangleSprites.delete(id);
    }
  }

  /** 维护单精灵覆盖标记（neuro / hunter / conductor），随敌人位置浮动并脉冲。 */
  private updateSingleMarkerSprites(
    enemies: EnemyState[],
    store: Map<number, THREE.Sprite>,
    makeTexture: () => THREE.Texture,
    predicate: (e: EnemyState) => boolean,
    cfg: { y: number; scale: number; renderOrder: number; additive: boolean; baseOpacity: number },
  ): void {
    const alive = new Set<number>();
    const time = performance.now() * 0.004;
    for (const e of enemies) {
      if (e.hp <= 0 || !predicate(e)) continue;
      alive.add(e.id);
      let sprite = store.get(e.id);
      if (!sprite) {
        const material = new THREE.SpriteMaterial({
          map: makeTexture(),
          color: 0xffffff,
          transparent: true,
          opacity: cfg.baseOpacity,
          depthWrite: false,
          depthTest: true,
          blending: cfg.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        });
        sprite = new THREE.Sprite(material);
        sprite.renderOrder = cfg.renderOrder;
        this.scene.add(sprite);
        store.set(e.id, sprite);
      }
      const pulse = 0.85 + Math.sin(time * 3.2 + e.id * 0.5) * 0.15;
      sprite.position.set(e.x, e.y + cfg.y, e.z);
      sprite.scale.setScalar(cfg.scale * pulse);
      sprite.material.opacity = cfg.baseOpacity * (0.85 + Math.sin(time * 4 + e.id) * 0.15);
      sprite.visible = true;
    }
    for (const [id, sprite] of store) {
      if (alive.has(id)) continue;
      this.scene.remove(sprite);
      sprite.material.dispose();
      store.delete(id);
    }
  }

  /** 羁绊敌人覆盖标记：毒师墨绿倒三角 / 猎标红色瞄准圈 / 弧光导体蓝色发光。 */
  private updateBondEnemyMarkers(enemies: EnemyState[]): void {
    this.updateSingleMarkerSprites(
      enemies, this.neuroMarkerSprites, getNeuroTriangleTexture,
      (e) => (e.neuroStacks ?? 0) > 0,
      { y: 1.5, scale: 0.5, renderOrder: 6, additive: false, baseOpacity: 0.9 },
    );
    this.updateSingleMarkerSprites(
      enemies, this.hunterMarkerSprites, getHunterCrosshairTexture,
      (e) => e.hunterBranded === true,
      { y: 1.9, scale: 0.55, renderOrder: 7, additive: false, baseOpacity: 0.95 },
    );
    this.updateSingleMarkerSprites(
      enemies, this.conductorGlowSprites, getConductorGlowTexture,
      (e) => (e.conductorMarkTimer ?? 0) > 0,
      { y: 0.9, scale: 1.8, renderOrder: 2, additive: true, baseOpacity: 0.8 },
    );
  }

  private renderProjectiles(projectiles: ProjectileState[]): void {
    let count = 0;
    const time = performance.now() * 0.005;
    const activeAxeIds = new Set<number>();
    const activeWeaponIds = new Set<number>();

    // Helper: get the model for a weapon type (handles evolved variants)
    const getWeaponModel = (weaponType: string, evolved: boolean): THREE.Group | null => {
      if (evolved) {
        switch (weaponType) {
          case 'sword': return swordGoldenModel ?? swordModel;
          case 'axe': return axeGoldenModel ?? axeModel;
          case 'bow': return null; // revolver-style bullets via InstancedMesh
          case 'katana': return katanaGoldenModel ?? katanaModel;
          default: return null;
        }
      }
      switch (weaponType) {
        case 'axe': return axeModel;
        case 'sword': return swordModel;
        case 'katana': return katanaModel;
        case 'bow': return null; // displayed as Revolver — fires bullets via InstancedMesh
        case 'bone_bouncer': return null; // handled with boneGeometry fallback below
        case 'revolver': return null; // uses InstancedMesh (bullet)
        case 'shotgun': return dartGoldenModel; // golden dart pellets
        case 'hammer': return hammerModel;
        case 'dagger': return daggerModel;
        case 'dart': return dartModel;
        default: return null;
      }
    };

    // Weapon types that use individual model clones (not InstancedMesh)
    // Note: 'bow' is NOT included — it's the in-game Revolver and uses bullet InstancedMesh
    const modelWeaponTypes = new Set(['axe', 'sword', 'katana', 'hammer', 'dagger', 'dart', 'bone_bouncer', 'revolver', 'shotgun']);

    for (const proj of projectiles) {
      // Axe projectiles: orbiting, blade faces outward
      if (proj.weaponType === 'axe') {
        activeAxeIds.add(proj.id);
        let axeObj = this.axeObjects.get(proj.id);
        if (!axeObj) {
          const model = getWeaponModel('axe', false);
          if (model) {
            axeObj = model.clone();
          } else {
            const geo = new THREE.ConeGeometry(0.3, 0.6, 4);
            const mat = new THREE.MeshToonMaterial({ color: 0x666688, gradientMap: toonGradientMap });
            axeObj = new THREE.Mesh(geo, mat);
          }
          axeObj.name = `Axe_${proj.id}`;
          this.scene.add(axeObj);
          this.axeObjects.set(proj.id, axeObj);
        }
        axeObj.position.set(proj.x, proj.y, proj.z);
        const state = this.session.getRenderState();
        const angleFromPlayer = Math.atan2(proj.x - state.player.x, proj.z - state.player.z);
        axeObj.rotation.set(0, 0, 0);
        axeObj.rotation.order = 'YXZ';
        axeObj.rotation.x = Math.PI / 2;
        axeObj.rotation.y = angleFromPlayer;
        axeObj.visible = true;
        continue;
      }

      // Hammer: orbiting like axe, head faces outward
      if ((proj.weaponType as string) === 'hammer' && proj.fromPlayer) {
        activeWeaponIds.add(proj.id);
        let obj = this.weaponObjects.get(proj.id);
        if (!obj) {
          const model = hammerModel;
          if (model) {
            obj = model.clone();
          } else {
            const geo = new THREE.BoxGeometry(0.4, 0.4, 0.6);
            const mat = new THREE.MeshToonMaterial({ color: 0x888888, gradientMap: toonGradientMap });
            obj = new THREE.Mesh(geo, mat);
          }
          obj.name = `Hammer_${proj.id}`;
          this.scene.add(obj);
          this.weaponObjects.set(proj.id, obj);
        }
        obj.position.set(proj.x, proj.y, proj.z);
        const state = this.session.getRenderState();
        const angleFromPlayer = Math.atan2(proj.x - state.player.x, proj.z - state.player.z);
        obj.rotation.set(0, 0, 0);
        obj.rotation.order = 'YXZ';
        obj.rotation.x = Math.PI / 2;
        obj.rotation.y = angleFromPlayer;
        obj.visible = true;
        continue;
      }

      // Sword/Katana/Dagger/Dart/Bow(arrow): directional, tip faces movement direction
      if (modelWeaponTypes.has(proj.weaponType as string) && proj.fromPlayer && (proj.weaponType as string) !== 'axe' && (proj.weaponType as string) !== 'hammer') {
        activeWeaponIds.add(proj.id);
        let obj = this.weaponObjects.get(proj.id);
        if (!obj) {
          const model = getWeaponModel(proj.weaponType, false);
          if (model) {
            obj = model.clone();
          } else if (proj.weaponType === 'bone_bouncer' && boneGeometry) {
            const mat = new THREE.MeshToonMaterial({ color: 0xf5f5dc, gradientMap: toonGradientMap });
            obj = new THREE.Mesh(boneGeometry.clone(), mat);
          } else {
            const geo = new THREE.ConeGeometry(0.15, 0.5, 6);
            const mat = new THREE.MeshToonMaterial({ color: 0xcccccc, gradientMap: toonGradientMap });
            obj = new THREE.Mesh(geo, mat);
          }
          obj.name = `Weapon_${proj.weaponType}_${proj.id}`;
          this.scene.add(obj);
          this.weaponObjects.set(proj.id, obj);
        }
        obj.position.set(proj.x, proj.y, proj.z);
        // Rotation based on weapon type
        if (proj.weaponType === 'bone_bouncer') {
          // Bone tumbles/spins while bouncing
          obj.rotation.set(time * 4 + proj.id, time * 6 + proj.id * 0.7, time * 3);
        } else {
          // Point in movement direction
          const moveAngle = Math.atan2(proj.vx, proj.vz);
          obj.rotation.set(0, 0, 0);
          obj.rotation.order = 'YXZ';
          obj.rotation.y = moveAngle;
        }
        obj.visible = true;
        continue;
      }

      // All other projectiles: use InstancedMesh (spheres)
      this._dummy.position.set(proj.x, proj.y, proj.z);

      // Projectile visual variety: scale by weapon type
      let scale = proj.fromPlayer ? 1.0 : 1.8;
      if (proj.fromPlayer) {
        switch (proj.weaponType) {
          case 'sword': scale = 1.2; break;
          case 'bow': scale = 0.6; break;
          case 'shotgun': scale = 0.4; break;
          case 'bone_bouncer': scale = 0.8; break;
          default: scale = 1.0;
        }
      }

      // Add spinning for bone_bouncer
      if (proj.weaponType === 'bone_bouncer') {
        this._dummy.rotation.set(0, time * 4 + proj.id, time * 2);
      } else if (proj.weaponType === 'sword') {
        const speed = Math.sqrt(proj.vx * proj.vx + proj.vz * proj.vz);
        if (speed > 0.1) {
          const angle = Math.atan2(proj.vx, proj.vz);
          this._dummy.rotation.set(0, angle, 0);
          this._dummy.scale.set(scale * 0.5, scale * 0.4, scale * 2.0);
        } else {
          this._dummy.scale.set(scale, scale, scale);
          this._dummy.rotation.set(0, 0, 0);
        }
      } else {
        this._dummy.rotation.set(0, 0, 0);
      }

      if (proj.weaponType !== 'sword') {
        this._dummy.scale.set(scale, scale, scale);
      }

      this._dummy.updateMatrix();
      this.projectileMesh.setMatrixAt(count, this._dummy.matrix);

      if (proj.fromPlayer) {
        const color = WEAPON_PROJECTILE_COLORS[proj.weaponType] ?? 0xffdd44;
        this._tempColor.setHex(color);
      } else {
        const pulse = 0.7 + Math.sin(time * 3 + proj.id) * 0.3;
        this._tempColor.setRGB(1.0, 0.25 + pulse * 0.2, 0.0);
      }
      this.projectileMesh.setColorAt(count, this._tempColor);
      count++;
    }

    this.projectileMesh.count = count;
    this.projectileMesh.instanceMatrix.needsUpdate = true;
    if (this.projectileMesh.instanceColor) this.projectileMesh.instanceColor.needsUpdate = true;

    // Remove axe objects that are no longer active
    for (const [id, obj] of this.axeObjects) {
      if (!activeAxeIds.has(id)) {
        this.scene.remove(obj);
        this.axeObjects.delete(id);
      }
    }
    // Remove weapon objects that are no longer active
    for (const [id, obj] of this.weaponObjects) {
      if (!activeWeaponIds.has(id)) {
        this.scene.remove(obj);
        this.weaponObjects.delete(id);
      }
    }
  }

  private renderConsumablePickups(pickups: NonNullable<GameState['consumablePickups']>): void {
    const time = performance.now() * 0.004;
    const active = new Set<number>();
    for (const pickup of pickups) {
      if (active.size >= MAX_CONSUMABLE_PICKUPS) break;
      active.add(pickup.id);

      let sprite = this.consumableSprites.get(pickup.id);
      const texture = getConsumableEmojiTexture(pickup.consumableId);
      if (!sprite) {
        const mat = new THREE.SpriteMaterial({
          map: texture,
          color: 0xffffff,
          transparent: true,
          opacity: 1,
          depthWrite: false,
          depthTest: true,
          toneMapped: false,
        });
        sprite = new THREE.Sprite(mat);
        sprite.name = `Consumable_${pickup.id}`;
        this.scene.add(sprite);
        this.consumableSprites.set(pickup.id, sprite);
      } else if (sprite.material.map !== texture) {
        sprite.material.map = texture;
        sprite.material.needsUpdate = true;
      }

      const bob = Math.sin(time * 1.8 + pickup.id) * 0.22;
      const baseScale = pickup.attracted ? 0.62 : 0.72;
      const pulse = baseScale + Math.sin(time * 5 + pickup.id) * (pickup.attracted ? 0.08 : 0.05);
      sprite.position.set(pickup.x, pickup.y + 0.4 + bob, pickup.z);
      sprite.scale.set(pulse, pulse, pulse);
    }

    for (const [id, sprite] of this.consumableSprites) {
      if (active.has(id)) continue;
      this.scene.remove(sprite);
      sprite.material.dispose();
      this.consumableSprites.delete(id);
    }
  }

  private renderPickups(pickups: PickupState[]): void {
    let count = 0;
    const time = performance.now() * 0.004; // Faster spin
    for (const pickup of pickups) {
      if (count >= MAX_PICKUPS) break;
      // Larger bobbing amplitude (0.3) for more visual pop
      const bob = Math.sin(time * 1.5 + pickup.id) * 0.3;
      this._dummy.position.set(pickup.x, pickup.y + 0.2 + bob, pickup.z);

      // Pulsing scale when attracted for "swoosh" feel
      let scaleVal = 1.0;
      if (pickup.attracted) {
        scaleVal = 0.7 + Math.sin(time * 6 + pickup.id) * 0.3;
      }
      this._dummy.scale.set(scaleVal, scaleVal, scaleVal);
      // Faster spin for more visual energy
      this._dummy.rotation.set(0, time * 2 + pickup.id, 0);
      this._dummy.updateMatrix();
      this.pickupMesh.setMatrixAt(count, this._dummy.matrix);

      this._tempColor.setHex(PICKUP_COLORS[pickup.type] ?? 0x44ff44);
      this.pickupMesh.setColorAt(count, this._tempColor);
      count++;
    }
    this.pickupMesh.count = count;
    this.pickupMesh.instanceMatrix.needsUpdate = true;
    if (this.pickupMesh.instanceColor) this.pickupMesh.instanceColor.needsUpdate = true;
  }

  private renderGoldMotes(goldMotes: GoldMoteState[]): void {
    const time = performance.now() * 0.004;
    const active = new Set<number>();
    for (const mote of goldMotes) {
      active.add(mote.id);
      let sprite = this.goldMoteSprites.get(mote.id);
      if (!sprite) {
        const mat = new THREE.SpriteMaterial({
          map: this.goldMoteTexture,
          color: 0xffffff,
          transparent: true,
          opacity: 1,
          depthWrite: false,
          depthTest: true,
          toneMapped: false,
        });
        sprite = new THREE.Sprite(mat);
        sprite.name = `GoldMote_${mote.id}`;
        this.scene.add(sprite);
        this.goldMoteSprites.set(mote.id, sprite);
      }
      const pulse = 0.85 + Math.sin(time * 9 + mote.id) * 0.25;
      sprite.position.set(mote.x, mote.y, mote.z);
      sprite.scale.set(0.36 * pulse, 0.36 * pulse, 0.36 * pulse);
      sprite.material.rotation = time * 5 + mote.id;
    }
    for (const [id, sprite] of this.goldMoteSprites) {
      if (active.has(id)) continue;
      this.scene.remove(sprite);
      sprite.material.dispose();
      this.goldMoteSprites.delete(id);
    }
  }

  private renderBoss(boss: BossState | null): void {
    if (!boss || boss.hp <= 0) {
      if (this.bossMesh) {
        this.bossMesh.visible = false;
      }
      if (this.bossWarningRing) {
        this.bossWarningRing.visible = false;
      }
      return;
    }

    if (!this.bossMesh) {
      // Use loaded boss model if available
      if (loadedModels.boss) {
        this.bossMesh = cloneSkeleton(loadedModels.boss) as unknown as THREE.Mesh;
        this.bossMesh.name = 'Boss';
        // Auto-scale to a target height (~3× player height = imposing but not absurd).
        // 旧代码硬编码 scale=10 假设原模型 0.5 单位高，但 enemy_large_gun.gltf 实际更大，
        // 导致 Boss 超出屏幕。改为按 bounding box 算 scale。
        const box = new THREE.Box3().setFromObject(this.bossMesh);
        const size = box.getSize(new THREE.Vector3());
        const TARGET_BOSS_HEIGHT = 5.0;
        const autoScale = TARGET_BOSS_HEIGHT / Math.max(size.y, 0.01);
        this.bossMesh.scale.set(autoScale, autoScale, autoScale);
        // 把脚踩到地面（同 player 的处理）
        const newBox = new THREE.Box3().setFromObject(this.bossMesh);
        this.bossMesh.position.y = -newBox.min.y;
        // 缓存 base scale，给 attack 脉冲 / enrage 脉冲用
        this.bossBaseScale = autoScale;
        this.scene.add(this.bossMesh);
      } else {
        // Fallback
        const geo = new THREE.BoxGeometry(2.4, 3.0, 2.4);
        const mat = new THREE.MeshToonMaterial({ color: 0x9933cc, gradientMap: toonGradientMap });
        this.bossMesh = new THREE.Mesh(geo, mat);
        this.bossMesh.name = 'Boss';
        this.bossBaseScale = 1.0;
        this.scene.add(this.bossMesh);
      }
    }

    this.bossMesh.visible = true;
    this.bossMesh.position.set(boss.x, boss.y || 0, boss.z);

    // Boss 大号 blob 阴影
    this.blobShadows?.place(boss.x, boss.y || 0, boss.z, 1.8);

    // Hit flash / enrage color (only works on fallback geometry)
    if (!loadedModels.boss) {
      const mat = this.bossMesh.material as THREE.MeshToonMaterial;
      if (boss.hitFlashTimer > 0) {
        mat.color.setHex(0xffffff);
      } else if (boss.enraged) {
        mat.color.setHex(0xff3333);
      } else {
        mat.color.setHex(0x9933cc);
      }
    }

    // === Boss Attack Warning (#4) ===
    const time = performance.now() * 0.001;

    // 1. Ground warning ring when boss is charging an attack
    if (this.bossWarningRing && boss.attackTimer > 0 && boss.currentAttack !== 'idle') {
      this.bossWarningRing.visible = true;
      // Position at the player (where damage will land)
      const state = this.session.getRenderState();
      this.bossWarningRing.position.set(state.player.x, state.player.y + 0.05, state.player.z);
      // Scale from 0 to 1 as attack timer counts down
      const maxTimer = boss.enraged ? 2.5 : 3.5;
      const progress = 1 - Math.min(boss.attackTimer / maxTimer, 1);
      this.bossWarningRing.scale.set(progress, 1, progress);
      // Pulse opacity
      const ringMat = this.bossWarningRing.material as THREE.MeshBasicMaterial;
      ringMat.opacity = 0.3 + Math.sin(time * 10) * 0.2;
    } else if (this.bossWarningRing) {
      this.bossWarningRing.visible = false;
    }

    // 2. Boss scale pulse when charging (body glow effect)
    // 用 auto-scale 算出来的 baseScale，避免硬编码 10x 把 Boss 撑爆
    const baseScale = this.bossBaseScale;
    // 脉冲振幅：相对 baseScale 的 ±5% 而不是固定 ±0.5（在 baseScale=10 时 ±0.5 是 5%，
    // 改成相对值后不同模型大小都 OK）
    const pulseAmp = baseScale * 0.05;
    if (boss.attackTimer > 0 && boss.currentAttack !== 'idle') {
      const scale = baseScale + Math.sin(time * 12) * pulseAmp;
      this.bossMesh.scale.set(scale, scale, scale);
    } else if (boss.enraged) {
      const scale = baseScale + Math.sin(time) * pulseAmp;
      this.bossMesh.scale.set(scale, scale, scale);
    } else {
      this.bossMesh.scale.set(baseScale, baseScale, baseScale);
    }

    // 3. Full-screen red flash on AOE explosion
    if (boss.currentAttack === 'aoe_explosion' && boss.attackTimer > 0 && boss.attackTimer < 0.1) {
      if (this.bossAoeFlashTimer <= 0) {
        this.triggerScreenFlash('#ff0000', 0.4);
        this.bossAoeFlashTimer = 1.0;
      }
    }
    if (this.bossAoeFlashTimer > 0) {
      this.bossAoeFlashTimer -= 1 / 60;
    }
  }

  private renderTeleporters(altars: AltarState[]): void {
    const time = performance.now() * 0.003;

    // Create or update altar meshes
    while (this.teleporterMeshes.length < altars.length) {
      // Try using loaded teleporter model
      if (loadedModels.teleporter) {
        const tp = cloneSkeleton(loadedModels.teleporter) as THREE.Object3D;
        tp.name = 'Altar_Model';
        tp.scale.set(1.5, 1.5, 1.5);
        this.scene.add(tp);
        this.teleporterMeshes.push(tp as unknown as THREE.Mesh);
      } else {
        // Fallback: ring on ground
        const ringGeo = new THREE.RingGeometry(1.5, 2.0, 24);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0x00ccff,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.8,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.name = 'Altar_Ring';
        ring.rotation.x = -Math.PI / 2;
        this.scene.add(ring);
        this.teleporterMeshes.push(ring);
      }

      // Glow pillar
      const pillarGeo = new THREE.CylinderGeometry(0.3, 1.5, 4, 12);
      const pillarMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.3,
      });
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.name = 'Altar_Glow';
      this.scene.add(pillar);
      this.teleporterGlowMeshes.push(pillar);

      // Ground decal: magic circle / portal swirl（按 phase 切贴图）
      const decalGeo = new THREE.PlaneGeometry(5, 5);
      const decalMat = new THREE.MeshBasicMaterial({
        map: this.vfxTextures.magic_circle,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const decal = new THREE.Mesh(decalGeo, decalMat);
      decal.name = 'Altar_Decal';
      decal.rotation.x = -Math.PI / 2;
      decal.renderOrder = 4;
      this.scene.add(decal);
      this.altarDecals.push(decal);
    }

    for (let i = 0; i < this.teleporterMeshes.length; i++) {
      if (i < altars.length) {
        const tp = altars[i];
        const ring = this.teleporterMeshes[i];
        const pillar = this.teleporterGlowMeshes[i];
        const decal = this.altarDecals[i];

        ring.visible = true;
        ring.position.set(tp.x, 0.1, tp.z);
        ring.rotation.z = time;

        pillar.visible = true;
        pillar.position.set(tp.x, 2, tp.z);

        // 地面 decal 始终可见（除 portal_used 终态）
        decal.visible = tp.phase !== 'portal_used';
        decal.position.set(tp.x, 0.06, tp.z);

        // Color based on phase.
        // 注意：ring 可能是 GLB 模型（Object3D，无 .material）也可能是 fallback 的
        // MeshBasicMaterial 圆环。glow pillar 始终是 MeshBasicMaterial，可放心染色。
        const ringMaterial = (ring as THREE.Mesh).material;
        const ringMat = (ringMaterial && !Array.isArray(ringMaterial))
          ? ringMaterial as THREE.MeshBasicMaterial
          : null;
        const pillarMat = pillar.material as THREE.MeshBasicMaterial;
        const decalMat = decal.material as THREE.MeshBasicMaterial;

        switch (tp.phase) {
          case 'summoning': {
            // 召唤读条阶段：金黄脉冲 + 魔法圆加速旋转
            const pulse = 0.5 + Math.sin(time * 4) * 0.3;
            ringMat?.color.setHex(0xffaa00);
            pillarMat.color.setHex(0xffcc00);
            pillarMat.opacity = pulse;
            decalMat.map = this.vfxTextures.magic_circle;
            decalMat.color.setHex(0xffcc44);
            decalMat.opacity = 0.95;
            decal.rotation.z = -time * 4;  // 加速旋转
            break;
          }
          case 'boss_active': {
            // Boss 战进行中：祭坛沉默（decal 暗淡）
            ringMat?.color.setHex(0xff2200);
            pillarMat.color.setHex(0xff4400);
            pillarMat.opacity = 0.4;
            decalMat.color.setHex(0x661100);
            decalMat.opacity = 0.3;
            decal.rotation.z = -time * 0.5;
            break;
          }
          case 'cooldown': {
            // 冷却：低亮度蓝紫，表示暂不可交互
            ringMat?.color.setHex(0x5566aa);
            pillarMat.color.setHex(0x6677cc);
            pillarMat.opacity = 0.22 + Math.sin(time * 0.8) * 0.08;
            decalMat.map = this.vfxTextures.magic_circle;
            decalMat.color.setHex(0x6677cc);
            decalMat.opacity = 0.35;
            decal.rotation.z = -time * 0.4;
            break;
          }
          case 'portal_ready':
          case 'portal_used': {
            // 传送门：换贴图 → 紫色 swirl，反向飞速旋转
            ringMat?.color.setHex(0xaa44ff);
            pillarMat.color.setHex(0xcc66ff);
            pillarMat.opacity = 0.6 + Math.sin(time * 2) * 0.2;
            decalMat.map = this.vfxTextures.portal_swirl;
            decalMat.color.setHex(0xcc66ff);
            decalMat.opacity = 0.95;
            decal.rotation.z = time * 6;
            break;
          }
          case 'ready':
          default: {
            // 待召唤：青蓝色平稳呼吸 + 魔法圆缓慢旋转
            ringMat?.color.setHex(0x00ccff);
            pillarMat.color.setHex(0x00ffff);
            pillarMat.opacity = 0.3 + Math.sin(time) * 0.1;
            decalMat.map = this.vfxTextures.magic_circle;
            decalMat.color.setHex(0x66ddff);
            decalMat.opacity = 0.7 + Math.sin(time * 0.8) * 0.15;
            decal.rotation.z = -time * 1.2;
            break;
          }
        }
      } else {
        this.teleporterMeshes[i].visible = false;
        this.teleporterGlowMeshes[i].visible = false;
        if (this.altarDecals[i]) this.altarDecals[i].visible = false;
      }
    }
  }

  // ===========================================================================
  // VFX Particle System
  // ===========================================================================

  private static readonly WEAPON_VFX_COLORS: Record<string, [number, number, number]> = {
    sword: [1.0, 1.0, 1.0],
    bone_bouncer: [0.95, 0.9, 0.8],
    axe: [1.0, 0.6, 0.1],
    bow: [0.8, 1.0, 0.3],
    lightning_staff: [0.3, 0.8, 1.0],
    flame_ring: [1.0, 0.5, 0.0],
    shotgun: [1.0, 0.8, 0.2],
    ray_gun: [1.0, 0.25, 0.45],
    poison_bomb: [0.35, 0.8, 0.25],
    paralysis_gun: [1.0, 0.88, 0.15],
    void_ripple: [0.0, 1.0, 1.0],
    scorch_boots: [1.0, 0.5, 0.12],
  };

  private static readonly PICKUP_VFX_COLORS: Record<string, [number, number, number]> = {
    xp_green: [0.2, 1.0, 0.4],
    xp_blue: [0.2, 0.7, 1.0],
    xp_purple: [0.8, 0.3, 1.0],
    xp_orange: [1.0, 0.7, 0.0],
    gold: [1.0, 0.8, 0.15],
    silver: [0.9, 0.9, 0.9],
  };

  private spawnParticle(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    size: number, life: number,
    r: number, g: number, b: number,
  ): void {
    // Find an inactive particle in the pool
    for (let i = 0; i < this.MAX_PARTICLES; i++) {
      const p = this.vfxParticles[i];
      if (!p.active) {
        p.x = x; p.y = y; p.z = z;
        p.vx = vx; p.vy = vy; p.vz = vz;
        p.size = size;
        p.life = life;
        p.maxLife = life;
        p.r = r; p.g = g; p.b = b;
        p.active = true;
        return;
      }
    }
  }

  private emitHitSparks(x: number, y: number, z: number, weaponType: string): void {
    const color = GameScene.WEAPON_VFX_COLORS[weaponType] ?? [1.0, 0.9, 0.5];
    const count = 10 + Math.floor(Math.random() * 8);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const elevation = Math.random() * Math.PI * 0.6;
      const speed = 4 + Math.random() * 6;
      const vx = Math.cos(angle) * Math.cos(elevation) * speed;
      const vy = Math.sin(elevation) * speed + 2;
      const vz = Math.sin(angle) * Math.cos(elevation) * speed;
      const size = 1.0 + Math.random() * 1.5;
      const life = 0.4 + Math.random() * 0.4;
      const cr = Math.min(1.0, color[0] + (Math.random() - 0.5) * 0.2);
      const cg = Math.min(1.0, color[1] + (Math.random() - 0.5) * 0.2);
      const cb = Math.min(1.0, color[2] + (Math.random() - 0.5) * 0.2);
      this.spawnParticle(x, y, z, vx, vy, vz, size, life, cr, cg, cb);
    }
    // Billboard: 一闪而过的撞击光晕（朝相机），跟武器染色一致
    const colorHex = ((Math.round(color[0] * 255) << 16) | (Math.round(color[1] * 255) << 8) | Math.round(color[2] * 255)) >>> 0;
    this.spawnBillboard({
      texture: 'muzzle',
      x, y, z,
      scale: 1.6,
      endScale: 2.4,
      lifetime: 0.18,
      opacityCurve: 'flash',
      opacity: 0.9,
      color: colorHex,
      rotation: Math.random() * Math.PI * 2,
    });
  }

  private emitDeathBurst(x: number, y: number, z: number, _enemyType: string): void {
    // 极简死亡爆点：稀疏粒子、超短寿命、近距扩散，避免叠加产生半透糊感
    const count = 5 + Math.floor(Math.random() * 3);    // 5–7（原 12–15）
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const elevation = (Math.random() - 0.3) * Math.PI;
      const speed = 2 + Math.random() * 1.5;            // 2–3.5（原 3–6）
      const vx = Math.cos(angle) * Math.cos(elevation) * speed;
      const vy = Math.abs(Math.sin(elevation)) * speed + 1.5;
      const vz = Math.sin(angle) * Math.cos(elevation) * speed;
      const size = 2.2 + Math.random() * 1.3;           // 2.2–3.5（原 2.4–4.2）
      const life = 0.14 + Math.random() * 0.1;          // 0.14–0.24s（原 0.25–0.45s）
      // Red/orange death particles
      const r = 0.8 + Math.random() * 0.2;
      const g = 0.2 + Math.random() * 0.4;
      const b = Math.random() * 0.15;
      this.spawnParticle(x, y + 0.5, z, vx, vy, vz, size, life, r, g, b);
    }
    // Billboard: 一团短命烟雾 + 地面烧痕，让死亡有"实体痕迹"
    this.spawnBillboard({
      texture: 'smoke',
      x, y: y + 0.6, z,
      scale: 1.2,
      endScale: 2.4,
      lifetime: 0.5,
      opacityCurve: 'fadeOut',
      opacity: 0.7,
      color: 0x553322,
      rotation: Math.random() * Math.PI * 2,
      blending: 'normal',
    });
    this.spawnBillboard({
      texture: 'scorch',
      x, y: y + 0.05, z,
      scale: 1.4,
      endScale: 1.8,
      lifetime: 1.5,
      opacityCurve: 'fadeOut',
      opacity: 0.55,
      color: 0x000000,
      facing: 'up',
      rotation: Math.random() * Math.PI * 2,
      blending: 'normal',
    });
  }

  private emitPickupSparkle(x: number, y: number, z: number, pickupType: string): void {
    const color = GameScene.PICKUP_VFX_COLORS[pickupType] ?? [0.5, 1.0, 0.5];
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const vx = (Math.random() - 0.5) * 1.5;
      const vy = 2 + Math.random() * 2;
      const vz = (Math.random() - 0.5) * 1.5;
      const size = 0.2 + Math.random() * 0.3;
      const life = 0.3 + Math.random() * 0.3;
      this.spawnParticle(x, y, z, vx, vy, vz, size, life, color[0], color[1], color[2]);
    }
    // Billboard: 一颗小星星，金色拾取仪式感
    const colorHex = ((Math.round(color[0] * 255) << 16) | (Math.round(color[1] * 255) << 8) | Math.round(color[2] * 255)) >>> 0;
    this.spawnBillboard({
      texture: 'star',
      x, y: y + 0.3, z,
      scale: 0.5,
      endScale: 1.0,
      lifetime: 0.35,
      opacityCurve: 'flash',
      opacity: 0.85,
      color: colorHex,
      rotationSpeed: 6.0,
    });
  }

  private emitLevelUpBurst(x: number, y: number, z: number): void {
    this.emitCompensationBurst(x, y, z, 'gold');
  }

  /** 空池升级补偿粒子：金币金黄、银币蓝白。 */
  private emitCompensationBurst(x: number, y: number, z: number, kind: 'gold' | 'silver'): void {
    const count = kind === 'silver' ? 36 : 30;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = 3 + Math.random() * 2.5;
      const vx = Math.cos(angle) * speed;
      const vy = 1.8 + Math.random() * 2;
      const vz = Math.sin(angle) * speed;
      const size = 0.55 + Math.random() * 0.55;
      const life = 0.65 + Math.random() * 0.45;
      let r: number, g: number, b: number;
      if (kind === 'silver') {
        r = 0.75 + Math.random() * 0.2;
        g = 0.85 + Math.random() * 0.15;
        b = 1.0;
      } else {
        r = 1.0;
        g = 0.8 + Math.random() * 0.2;
        b = 0.1 + Math.random() * 0.2;
      }
      this.spawnParticle(x, y + 0.5, z, vx, vy, vz, size, life, r, g, b);
    }
    // 中心星光 + 光柱（与正常升级类似的仪式感，颜色按奖励类型区分）
    const color = kind === 'silver' ? 0xaaccff : 0xffd866;
    this.spawnBillboard({
      texture: 'star',
      x, y: y + 1.4, z,
      scale: 1.2,
      endScale: 4.0,
      lifetime: 0.65,
      opacityCurve: 'flash',
      opacity: 1.0,
      color,
      rotationSpeed: 5.0,
    });
    this.spawnBillboard({
      texture: 'light',
      x, y: y + 0.4, z,
      scale: 1.8,
      endScale: 3.2,
      lifetime: 0.75,
      opacityCurve: 'fadeOut',
      opacity: 0.8,
      color: kind === 'silver' ? 0xccdfff : 0xffe080,
    });
  }

  private playCompensationLevelUpFx(evt: LevelUpCompensationEvent): void {
    this.levelUpAnimTimer = 0.45;
    this.levelCompPulseTimer = 0.9;
    this.emitCompensationBurst(evt.x, evt.y, evt.z, evt.kind);
    this.triggerScreenFlash(evt.kind === 'silver' ? '#8899ff' : '#ffcc00', 0.22);
    this.spawnCompensationFloatText(evt);
    this.showCompensationToast(evt);
    // 银币时让 HUD 银币徽章闪一下
    if (evt.kind === 'silver' && this.silverLabel) {
      this.silverLabel.style.transition = 'transform 0.15s';
      this.silverLabel.style.transform = 'scale(1.25)';
      setTimeout(() => {
        if (this.silverLabel) this.silverLabel.style.transform = 'scale(1)';
      }, 200);
    }
  }

  private playChestOpenFx(evt: ChestOpenEvent): void {
    this.emitCompensationBurst(evt.x, evt.y, evt.z, 'gold');
    this.triggerScreenFlash(RARITY_COLORS[evt.rarity] ?? '#ffcc00', 0.18);
    if (this.goldLabel) {
      this.goldLabel.style.transition = 'transform 0.15s';
      this.goldLabel.style.transform = 'scale(1.2)';
      setTimeout(() => {
        if (this.goldLabel) this.goldLabel.style.transform = 'scale(1)';
      }, 180);
    }
  }

  private handleChestRewardPhaseChange(state: GameState): void {
    const reward = state.pendingChestReward;
    if (state.phase === 'chest_reward' && reward) {
      const key = `${reward.chestId}:${reward.relicId}`;
      if (!this.chestRewardPanel || this.chestRewardPanelKey !== key) {
        this.hideChestRewardPanel();
        this.showChestRewardPanel(reward);
      }
      return;
    }
    if (this.chestRewardPanel) this.hideChestRewardPanel();
  }

  private showChestRewardPanel(reward: PendingChestReward): void {
    const relic = RELICS[reward.relicId];
    if (!relic) return;

    const overlay = document.createElement('div');
    this.chestRewardPanel = overlay;
    this.chestRewardPanelKey = `${reward.chestId}:${reward.relicId}`;
    overlay.dataset.cameraBlock = 'true'; // 全屏交互面板：阻断镜头拖拽（见 cameraOrbit 约定）
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:320;pointer-events:auto;
      display:flex;align-items:center;justify-content:center;
      background:radial-gradient(circle at 50% 45%, rgba(255,220,120,0.16), rgba(0,0,0,0.78) 62%);
      font-family:Arial,sans-serif;
    `;

    const card = document.createElement('div');
    card.style.cssText = `
      width:230px;min-height:250px;padding:22px 18px;box-sizing:border-box;
      background:rgba(12,12,28,0.96);border:3px solid #aaaaaa;border-radius:18px;
      box-shadow:0 0 34px rgba(255,255,255,0.18), inset 0 0 20px rgba(255,255,255,0.06);
      display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;
      transform:scale(0.8) rotate(-2deg);opacity:0;
      transition:transform 0.22s cubic-bezier(0.2,1.5,0.4,1), opacity 0.18s ease-out, border-color 0.08s;
    `;

    const rarity = document.createElement('div');
    rarity.style.cssText = 'font-size:11px;text-transform:uppercase;letter-spacing:2px;font-weight:bold;margin-bottom:10px;color:#aaaaaa;';
    rarity.textContent = '???';

    const icon = document.createElement('div');
    icon.style.cssText = 'font-size:58px;line-height:1;margin:8px 0 12px;text-shadow:0 0 18px rgba(255,255,255,0.28);';
    icon.textContent = '?';

    const name = document.createElement('div');
    name.style.cssText = 'color:#ffffff;font-size:22px;font-weight:bold;text-shadow:0 2px 8px rgba(0,0,0,0.9);';
    name.textContent = '遗物';

    const desc = document.createElement('div');
    desc.style.cssText = 'color:#cfd3ff;font-size:13px;line-height:1.45;margin-top:12px;min-height:36px;';
    desc.textContent = reward.bossDrop || reward.cost <= 0 ? 'Boss 宝箱 · 免费开启' : `消耗 ${reward.cost} 金币`;

    const buttonRow = document.createElement('div');
    buttonRow.style.cssText = 'display:none;gap:12px;margin-top:18px;';

    const discardBtn = document.createElement('button');
    discardBtn.type = 'button';
    discardBtn.textContent = '丢弃';
    discardBtn.style.cssText = `
      padding:9px 18px;border-radius:999px;border:1px solid rgba(255,255,255,0.35);
      background:rgba(40,40,52,0.95);color:#ddd;font-weight:bold;cursor:pointer;
    `;
    discardBtn.addEventListener('click', () => {
      this.session.selectChestReward(false);
      this.hideChestRewardPanel();
    });

    const keepBtn = document.createElement('button');
    keepBtn.type = 'button';
    keepBtn.textContent = '留下';
    keepBtn.style.cssText = `
      padding:9px 18px;border-radius:999px;border:1px solid #ffd35a;
      background:linear-gradient(180deg,#ffd35a,#b87800);color:#241200;font-weight:bold;cursor:pointer;
      box-shadow:0 0 18px rgba(255,180,0,0.35);
    `;
    keepBtn.addEventListener('click', () => {
      this.session.selectChestReward(true);
      this.hideChestRewardPanel();
    });

    buttonRow.appendChild(discardBtn);
    buttonRow.appendChild(keepBtn);

    card.appendChild(rarity);
    card.appendChild(icon);
    card.appendChild(name);
    card.appendChild(desc);
    card.appendChild(buttonRow);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      card.style.opacity = '1';
      card.style.transform = 'scale(1) rotate(0deg)';
    });

    const rarities = ['common', 'uncommon', 'rare', 'legendary'] as const;
    let flashes = 0;
    const flashTimer = window.setInterval(() => {
      const r = rarities[flashes % rarities.length];
      const color = RARITY_COLORS[r] ?? '#aaaaaa';
      card.style.borderColor = color;
      card.style.boxShadow = `0 0 32px ${color}88, inset 0 0 20px ${color}22`;
      rarity.style.color = color;
      rarity.textContent = r.toUpperCase();
      icon.textContent = '?';
      flashes++;
      if (flashes >= 9) {
        window.clearInterval(flashTimer);
        const finalColor = RARITY_COLORS[reward.rarity] ?? '#aaaaaa';
        card.style.borderColor = finalColor;
        card.style.boxShadow = `0 0 42px ${finalColor}aa, inset 0 0 24px ${finalColor}22`;
        rarity.style.color = finalColor;
        rarity.textContent = reward.rarity.toUpperCase();
        icon.textContent = relic.emoji;
        name.textContent = relic.name;
        desc.textContent = relic.description;
        card.style.transform = 'scale(1.12) rotate(0deg)';
        setTimeout(() => { card.style.transform = 'scale(1) rotate(0deg)'; }, 140);
        buttonRow.style.display = 'flex';
      }
    }, 70);
  }

  private hideChestRewardPanel(): void {
    this.chestRewardPanel?.remove();
    this.chestRewardPanel = null;
    this.chestRewardPanelKey = null;
  }

  private spawnCompensationFloatText(evt: LevelUpCompensationEvent): void {
    const el = this.damageNums[this.damageNumIndex];
    this.damageNumIndex = (this.damageNumIndex + 1) % DAMAGE_NUM_POOL_SIZE;

    this._tempVec.set(evt.x, evt.y + 1.2, evt.z);
    this._tempVec.project(this.camera);
    const hw = window.innerWidth / 2;
    const hh = window.innerHeight / 2;
    const screenX = this._tempVec.x * hw + hw;
    const screenY = -(this._tempVec.y * hh) + hh;

    const isSilver = evt.kind === 'silver';
    const label = isSilver
      ? t('upgrade.compensationSilver', { amount: String(evt.amount) })
      : t('upgrade.compensationGold', { amount: String(evt.amount) });

    // 走 GSAP（与伤害数字共用同一池 + 同一 keying），避免 CSS transition 与 GSAP 争 transform。
    gsapAnimations.showFloatText(el, {
      text: label,
      color: isSilver ? '#cce0ff' : '#ffd700',
      x: screenX,
      y: screenY,
      fontSize: 20,
      textShadow: isSilver
        ? '0 0 8px rgba(120,160,255,0.9)'
        : '0 0 8px rgba(255,200,0,0.9)',
    });
  }

  private showCompensationToast(evt: LevelUpCompensationEvent): void {
    const toast = document.createElement('div');
    const accent = evt.kind === 'silver' ? '#aaccff' : '#ffdd44';
    toast.style.cssText = `
      position:fixed;top:18%;left:50%;transform:translateX(-50%) scale(0.85);
      z-index:250;pointer-events:none;text-align:center;
      font-family:Arial,sans-serif;opacity:0;
    `;

    const title = document.createElement('div');
    title.style.cssText = `color:${accent};font-size:28px;font-weight:bold;letter-spacing:2px;text-shadow:0 0 20px ${accent}88,0 2px 8px rgba(0,0,0,0.8);`;
    title.textContent = t('upgrade.compensationTitle');
    toast.appendChild(title);

    const levelLine = document.createElement('div');
    levelLine.style.cssText = 'color:#ffffff;font-size:16px;margin-top:4px;text-shadow:0 1px 4px rgba(0,0,0,0.8);';
    levelLine.textContent = t('hud.level', { level: String(evt.level) });
    toast.appendChild(levelLine);

    const rewardLine = document.createElement('div');
    rewardLine.style.cssText = `color:${accent};font-size:22px;font-weight:bold;margin-top:8px;text-shadow:0 0 12px ${accent}66;`;
    rewardLine.textContent = evt.kind === 'silver'
      ? t('upgrade.compensationSilver', { amount: String(evt.amount) })
      : t('upgrade.compensationGold', { amount: String(evt.amount) });
    toast.appendChild(rewardLine);

    const sub = document.createElement('div');
    sub.style.cssText = 'color:#aaaacc;font-size:12px;margin-top:6px;';
    sub.textContent = t('upgrade.compensationSubtitle');
    toast.appendChild(sub);

    document.body.appendChild(toast);

    // 使用 GSAP 吐司通知动画
    gsapAnimations.showToast(toast, 1.2);
  }

  private emitFlameRingParticles(x: number, y: number, z: number, radius: number): void {
    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const px = x + Math.cos(angle) * radius;
      const pz = z + Math.sin(angle) * radius;
      const vx = (Math.random() - 0.5) * 0.5;
      const vy = 1 + Math.random() * 1.5;
      const vz = (Math.random() - 0.5) * 0.5;
      const size = 0.2 + Math.random() * 0.2;
      const life = 0.2 + Math.random() * 0.2;
      // Orange-red fire
      const r = 1.0;
      const g = 0.3 + Math.random() * 0.3;
      const b = Math.random() * 0.1;
      this.spawnParticle(px, y + 0.3, pz, vx, vy, vz, size, life, r, g, b);
    }
  }

  private emitBlackHoleVortex(x: number, y: number, z: number, radius: number): void {
    const count = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = radius * (0.8 + Math.random() * 0.4);
      const px = x + Math.cos(angle) * dist;
      const pz = z + Math.sin(angle) * dist;
      // Spiral inward
      const inwardSpeed = 3 + Math.random() * 2;
      const tangentialSpeed = 2 + Math.random();
      const vx = -Math.cos(angle) * inwardSpeed + Math.sin(angle) * tangentialSpeed;
      const vy = (Math.random() - 0.5) * 1.0;
      const vz = -Math.sin(angle) * inwardSpeed - Math.cos(angle) * tangentialSpeed;
      const size = 0.3 + Math.random() * 0.3;
      const life = 0.3 + Math.random() * 0.2;
      // Purple/dark blue
      const r = 0.4 + Math.random() * 0.3;
      const g = 0.1 + Math.random() * 0.2;
      const b = 0.7 + Math.random() * 0.3;
      this.spawnParticle(px, y + 0.5, pz, vx, vy, vz, size, life, r, g, b);
    }
  }

  private createReadableChestObject(): THREE.Object3D {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshToonMaterial({
      color: 0x7a3f20,
      emissive: 0x1a0804,
      gradientMap: toonGradientMap,
    });
    const lidMat = new THREE.MeshToonMaterial({
      color: 0x9a5528,
      emissive: 0x221006,
      gradientMap: toonGradientMap,
    });
    const trimMat = new THREE.MeshToonMaterial({
      color: 0xd99a2b,
      emissive: 0x3a2406,
      gradientMap: toonGradientMap,
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 0.75), bodyMat);
    body.position.y = 0.3;
    group.add(body);

    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.24, 0.82), lidMat);
    lid.position.y = 0.72;
    group.add(lid);

    const frontBand = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.04), trimMat);
    frontBand.position.set(0, 0.52, -0.42);
    group.add(frontBand);

    const lidBand = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.06, 0.86), trimMat);
    lidBand.position.set(0, 0.86, 0);
    group.add(lidBand);

    for (const x of [-0.38, 0.38]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.82, 0.04), trimMat);
      strap.position.set(x, 0.52, -0.43);
      group.add(strap);
    }

    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.06), trimMat);
    lock.position.set(0, 0.42, -0.46);
    group.add(lock);

    return group;
  }

  private createBossChestGlowObject(): THREE.Object3D {
    const glow = new THREE.Group();
    glow.name = 'BossChestGoldGlow';

    const ringGeo = new THREE.RingGeometry(0.95, 1.45, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd34d,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.name = 'BossChestGoldRing';
    ring.position.y = 0.05;
    glow.add(ring);

    const pillarGeo = new THREE.CylinderGeometry(0.45, 0.95, 2.8, 24, 1, true);
    const pillarMat = new THREE.MeshBasicMaterial({
      color: 0xffc84a,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.name = 'BossChestGoldPillar';
    pillar.position.y = 1.45;
    glow.add(pillar);

    const light = new THREE.PointLight(0xffcc55, 1.8, 5, 2);
    light.name = 'BossChestGoldLight';
    light.position.set(0, 1.1, 0);
    glow.add(light);

    return glow;
  }

  private ensureBossChestGlow(obj: THREE.Object3D): THREE.Object3D {
    const existing = obj.getObjectByName('BossChestGoldGlow');
    if (existing) return existing;
    const glow = this.createBossChestGlowObject();
    obj.add(glow);
    return glow;
  }

  private updateBossChestGlow(glow: THREE.Object3D, time: number): void {
    const pulse = 0.72 + Math.sin(time * 3.2) * 0.18;
    glow.rotation.y = time * 0.8;
    const ring = glow.getObjectByName('BossChestGoldRing') as THREE.Mesh | undefined;
    const pillar = glow.getObjectByName('BossChestGoldPillar') as THREE.Mesh | undefined;
    const light = glow.getObjectByName('BossChestGoldLight') as THREE.PointLight | undefined;
    if (ring) {
      ring.scale.setScalar(0.9 + pulse * 0.18);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.55 + pulse * 0.22;
    }
    if (pillar) {
      (pillar.material as THREE.MeshBasicMaterial).opacity = 0.16 + pulse * 0.12;
    }
    if (light) {
      light.intensity = 1.4 + pulse * 0.8;
    }
  }

  private renderChests(chests: ChestState[]): void {
    const visibleChestIds = new Set<number>();

    for (const chest of chests) {
      let obj = this.chestObjects.get(chest.id);

      if (chest.opened) {
        // Opened: remove from scene and spawn particles (once)
        if (obj) {
          this.scene.remove(obj);
          this.chestObjects.delete(chest.id);
          this.spawnPickupBurst(chest.x, (chest.y ?? 0) + 0.6, chest.z, 0xffdd00);
        }
        continue;
      }

      visibleChestIds.add(chest.id);

      if (!obj) {
        obj = this.createReadableChestObject();
        obj.name = `Chest_${chest.id}`;
        // Normalize to ~1.2 units
        const box = new THREE.Box3().setFromObject(obj);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z, 0.01);
        const scale = 1.2 / maxDim;
        obj.scale.set(scale, scale, scale);
        this.scene.add(obj);
        this.chestObjects.set(chest.id, obj);
      }

      // Gentle hover animation
      const time = performance.now() * 0.001;
      obj.position.set(chest.x, (chest.y ?? 0) + 0.1 + Math.sin(time * 1.5 + chest.id) * 0.05, chest.z);
      if (chest.bossDrop) {
        this.updateBossChestGlow(this.ensureBossChestGlow(obj), time + chest.id);
      } else {
        obj.getObjectByName('BossChestGoldGlow')?.removeFromParent();
      }
    }

    for (const [id, obj] of this.chestObjects) {
      if (visibleChestIds.has(id)) continue;
      this.scene.remove(obj);
      this.chestObjects.delete(id);
    }
  }

  /**
   * Charge Shrine 渲染 —— 每个 shrine 用程序化几何（base + 漂浮宝石 + 充能进度环）。
   *   - charging: 蓝紫色，根据 chargeTimer/chargeDuration 显示进度
   *   - ready:    全亮 + 强光 (玩家应已进入 shrine_reward UI)
   *   - consumed: 灰暗 + 不再脉动
   */
  private renderShrines(shrines: ShrineState[], playerX: number, playerZ: number): void {
    const time = performance.now() * 0.001;
    const seenIds = new Set<number>();

    for (const shrine of shrines) {
      seenIds.add(shrine.id);
      let group = this.shrineMeshes.get(shrine.id);
      if (!group) {
        group = new THREE.Group();
        group.name = `Shrine_${shrine.id}`;

        // Base disc on the ground (large activation circle)
        const discGeo = new THREE.CircleGeometry(2.5, 32);
        discGeo.rotateX(-Math.PI / 2);
        const discMat = new THREE.MeshBasicMaterial({
          color: 0x88aaff,
          transparent: true,
          opacity: 0.3,
          side: THREE.DoubleSide,
        });
        const disc = new THREE.Mesh(discGeo, discMat);
        disc.name = 'Shrine_Disc';
        disc.position.y = 0.05;
        group.add(disc);

        // Outer ring — charge progress meter (rotated wedge approx via ring)
        const ringGeo = new THREE.RingGeometry(2.45, 2.65, 48);
        ringGeo.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0x66ddff,
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.name = 'Shrine_Ring';
        ring.position.y = 0.06;
        group.add(ring);

        // Crystal: hovering octahedron over the shrine
        const crystalGeo = new THREE.OctahedronGeometry(0.55, 0);
        const crystalMat = new THREE.MeshToonMaterial({
          color: 0x99bbff,
          gradientMap: toonGradientMap,
          emissive: 0x4466cc,
          emissiveIntensity: 0.6,
        });
        const crystal = new THREE.Mesh(crystalGeo, crystalMat);
        crystal.name = 'Shrine_Crystal';
        crystal.position.y = 1.6;
        group.add(crystal);

        // Light pillar
        const pillarGeo = new THREE.CylinderGeometry(0.18, 0.5, 3.5, 12);
        const pillarMat = new THREE.MeshBasicMaterial({
          color: 0x88ccff,
          transparent: true,
          opacity: 0.25,
        });
        const pillar = new THREE.Mesh(pillarGeo, pillarMat);
        pillar.name = 'Shrine_Pillar';
        pillar.position.y = 1.75;
        group.add(pillar);

        group.position.set(shrine.x, 0, shrine.z);
        this.scene.add(group);
        this.shrineMeshes.set(shrine.id, group);
      }

      // Animate by phase
      const disc = group.children[0] as THREE.Mesh;
      const ring = group.children[1] as THREE.Mesh;
      const crystal = group.children[2] as THREE.Mesh;
      const pillar = group.children[3] as THREE.Mesh;
      const discMat = disc.material as THREE.MeshBasicMaterial;
      const ringMat = ring.material as THREE.MeshBasicMaterial;
      const crystalMat = crystal.material as THREE.MeshToonMaterial;
      const pillarMat = pillar.material as THREE.MeshBasicMaterial;

      crystal.rotation.y += 0.012;

      if (shrine.phase === 'consumed') {
        // Dim everything; keep crystal sunken & gray
        crystal.position.y = 0.7 + Math.sin(time * 0.8 + shrine.id) * 0.05;
        crystalMat.color.setHex(0x555566);
        crystalMat.emissive.setHex(0x111122);
        crystalMat.emissiveIntensity = 0.1;
        discMat.opacity = 0.08;
        ringMat.opacity = 0.15;
        pillarMat.opacity = 0.05;
      } else if (shrine.phase === 'ready') {
        // Bright pulsing gold
        const pulse = 0.5 + Math.sin(time * 6) * 0.5;
        crystal.position.y = 1.6 + Math.sin(time * 2 + shrine.id) * 0.2;
        crystalMat.color.setHex(0xffd966);
        crystalMat.emissive.setHex(0xffaa22);
        crystalMat.emissiveIntensity = 1.5 + pulse;
        discMat.color.setHex(0xffcc44);
        discMat.opacity = 0.55 + pulse * 0.2;
        ringMat.color.setHex(0xffdd66);
        ringMat.opacity = 0.95;
        pillarMat.color.setHex(0xffcc44);
        pillarMat.opacity = 0.55;
      } else {
        // charging or inactive: blue with progress-indicating glow strength
        const pct = shrine.chargeDuration > 0
          ? Math.min(1, shrine.chargeTimer / shrine.chargeDuration)
          : 0;
        crystal.position.y = 1.6 + Math.sin(time * 1.5 + shrine.id) * 0.12;
        // Color blends from cool blue → warm cyan as charging progresses
        crystalMat.color.setHex(pct > 0.05 ? 0xaaccff : 0x99bbff);
        crystalMat.emissive.setHex(0x3366cc);
        crystalMat.emissiveIntensity = 0.6 + pct * 1.2;
        discMat.color.setHex(0x88aaff);
        discMat.opacity = 0.18 + pct * 0.4;
        ringMat.color.setHex(pct > 0.95 ? 0xffee66 : 0x66ddff);
        ringMat.opacity = 0.4 + pct * 0.55;
        pillarMat.color.setHex(0x88ccff);
        pillarMat.opacity = 0.2 + pct * 0.35;
      }
    }

    // Cleanup meshes whose shrines no longer exist (defensive — list is persistent in practice)
    for (const [id, mesh] of this.shrineMeshes) {
      if (!seenIds.has(id)) {
        this.scene.remove(mesh);
        this.shrineMeshes.delete(id);
      }
    }

    // Update HUD indicator (nearest charging shrine within range)
    this.updateShrineIndicator(shrines, playerX, playerZ);
  }

  /** 玩家在 charging shrine 附近时显示 "Charging... XX%"，未在范围则显示距离。 */
  private updateShrineIndicator(shrines: ShrineState[], playerX: number, playerZ: number): void {
    if (!this.shrineIndicator) {
      this.shrineIndicator = document.createElement('div');
      this.shrineIndicator.style.cssText = 'position:absolute;top:118px;left:50%;transform:translateX(-50%);color:#88ddff;font-size:13px;font-weight:bold;text-shadow:0 0 8px #4488cc,0 1px 3px rgba(0,0,0,0.8);display:none;background:rgba(20,30,60,0.7);padding:4px 12px;border-radius:6px;pointer-events:none;';
      this.hudContainer.appendChild(this.shrineIndicator);
    }
    const ind = this.shrineIndicator;

    // Find the most relevant shrine: charging in range > nearest charging in <30m
    let chargingHere: ShrineState | null = null;
    let nearestCharging: ShrineState | null = null;
    let nearestDist = Infinity;
    for (const s of shrines) {
      if (s.phase !== 'charging') continue;
      const dx = s.x - playerX;
      const dz = s.z - playerZ;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (s.chargeTimer > 0) {
        chargingHere = s;
      }
      if (d < nearestDist) {
        nearestDist = d;
        nearestCharging = s;
      }
    }

    if (chargingHere) {
      const pct = Math.round((chargingHere.chargeTimer / chargingHere.chargeDuration) * 100);
      ind.style.display = 'block';
      ind.textContent = t('shrine.indicator_charging', { percent: String(pct) });
    } else if (nearestCharging && nearestDist < 30) {
      ind.style.display = 'block';
      ind.textContent = t('shrine.indicator_far', { dist: String(Math.round(nearestDist)) });
    } else {
      ind.style.display = 'none';
    }
  }

  // ---- Shrine Reward Panel (4 选 1 UI, 触发自 phase==='shrine_reward') ----

  private handleShrinePhaseChange(state: GameState): void {
    const isShrinePhase = state.phase === 'shrine_reward';
    if (isShrinePhase && !this.shrinePanel && state.activeShrineId != null) {
      const shrine = state.shrines.find(s => s.id === state.activeShrineId);
      if (shrine && shrine.options) {
        this.showShrineRewardPanel(shrine.options);
      }
    } else if (!isShrinePhase && this.shrinePanel) {
      this.hideShrineRewardPanel();
    }
  }

  private showShrineRewardPanel(options: ShrineRewardOption[]): void {
    this.cameraOrbit.setEnabled(false);
    this.shrinePanel = document.createElement('div');
    this.shrinePanel.dataset.cameraBlock = 'true';
    this.shrinePanel.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:radial-gradient(ellipse at center,rgba(40,30,80,0.85),rgba(0,0,0,0.85));display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:300;font-family:Arial,sans-serif;';

    const title = document.createElement('div');
    title.style.cssText = 'color:#ffd966;font-size:26px;font-weight:bold;margin-bottom:24px;text-shadow:0 2px 6px rgba(0,0,0,0.9),0 0 14px rgba(255,200,80,0.5);letter-spacing:1px;';
    title.textContent = `⚡ ${t('shrine.title')} ⚡`;
    this.shrinePanel.appendChild(title);

    const cardRow = document.createElement('div');
    cardRow.style.cssText = 'display:flex;gap:14px;flex-wrap:wrap;justify-content:center;padding:0 16px;max-width:100%;';
    if (window.innerWidth < 500) {
      cardRow.style.flexDirection = 'column';
      cardRow.style.alignItems = 'center';
    }

    for (const option of options) {
      const card = this.createShrineRewardCard(option);
      cardRow.appendChild(card);
    }

    this.shrinePanel.appendChild(cardRow);
    document.body.appendChild(this.shrinePanel);
  }

  private createShrineRewardCard(option: ShrineRewardOption): HTMLDivElement {
    const card = document.createElement('div');
    const borderColor = RARITY_COLORS[option.rarity] ?? '#aaaaaa';
    card.style.cssText = `
      width:170px;padding:18px 14px;background:rgba(20,20,40,0.96);border:2px solid ${borderColor};
      border-radius:14px;cursor:pointer;text-align:center;transition:transform 0.15s, box-shadow 0.15s;
      box-shadow:0 4px 14px rgba(0,0,0,0.6),0 0 0 1px ${borderColor}55 inset;
    `;
    card.addEventListener('mouseenter', () => {
      card.style.transform = 'scale(1.05)';
      card.style.boxShadow = `0 8px 24px ${borderColor}66, 0 0 0 1px ${borderColor}aa inset`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'scale(1)';
      card.style.boxShadow = `0 4px 14px rgba(0,0,0,0.6),0 0 0 1px ${borderColor}55 inset`;
    });

    // Rarity badge top
    const rarityEl = document.createElement('div');
    rarityEl.style.cssText = `color:${borderColor};font-size:11px;text-transform:uppercase;letter-spacing:2px;margin-bottom:6px;font-weight:bold;`;
    rarityEl.textContent = t(`shrine.rarity.${option.rarity}`);
    card.appendChild(rarityEl);

    // Icon
    const iconEl = document.createElement('div');
    iconEl.style.cssText = 'font-size:30px;margin-bottom:4px;';
    iconEl.textContent = SHRINE_REWARD_ICONS[option.reward] ?? '⚡';
    card.appendChild(iconEl);

    // Name
    const nameEl = document.createElement('div');
    nameEl.style.cssText = `color:${borderColor};font-size:15px;font-weight:bold;margin-bottom:8px;`;
    const percent = Math.round(option.value * 1000) / 10; // %.1
    nameEl.textContent = t(`shrine.reward.${option.reward}_name`, {
      value: String(option.value),
      percent: String(percent),
    });
    card.appendChild(nameEl);

    // Description
    const descEl = document.createElement('div');
    descEl.style.cssText = 'color:#cccccc;font-size:11px;line-height:1.4;';
    descEl.textContent = t(`shrine.reward.${option.reward}_desc`, {
      value: String(option.value),
      percent: String(percent),
    });
    card.appendChild(descEl);

    card.addEventListener('click', () => {
      this.session.selectShrineReward(option.id);
      this.hideShrineRewardPanel();
    });

    return card;
  }

  private hideShrineRewardPanel(): void {
    this.shrinePanel?.remove();
    this.shrinePanel = null;
    this.cameraOrbit.setEnabled(true);
  }

  private spawnPickupBurst(x: number, y: number, z: number, color: number): void {
    const c = new THREE.Color(color);
    for (let i = 0; i < 8; i++) {
      const p = this.vfxParticles.find(pp => !pp.active);
      if (!p) break;
      p.active = true;
      p.x = x; p.y = y; p.z = z;
      p.vx = (Math.random() - 0.5) * 3;
      p.vy = 2 + Math.random() * 3;
      p.vz = (Math.random() - 0.5) * 3;
      p.r = c.r; p.g = c.g; p.b = c.b;
      p.size = 3 + Math.random() * 2;
      p.life = 0.8;
      p.maxLife = 0.8;
    }
  }

  /**
   * 渲染区域特效（毒气云 / 虚空涟漪 / 灼地痕迹 / 激光线）。
   * 按 id 维护 Mesh，新增即创建、消失即移除，每帧更新位置 / 半径 / 透明度。
   */
  private updateAreaEffects(state: GameState, _dt: number): void {
    const live = new Set<number>();

    for (const ae of state.areaEffects) {
      live.add(ae.id);
      let obj = this.areaEffectObjects.get(ae.id);
      const ratio = ae.maxLifetime > 0 ? Math.max(0, ae.lifetime / ae.maxLifetime) : 1;

      if (!obj) {
        obj = this.createAreaEffectMesh(ae);
        this.scene.add(obj);
        this.areaEffectObjects.set(ae.id, obj);
      }

      switch (ae.kind) {
        case 'ray_beam': {
          // 细长发光盒：从玩家沿 dir 延伸 length，宽度 = width*2
          const dx = ae.dirX ?? 0, dz = ae.dirZ ?? 1;
          const len = ae.length ?? 40;
          obj.position.set(ae.x + dx * len * 0.5, ae.y + 1.0, ae.z + dz * len * 0.5);
          obj.rotation.set(0, Math.atan2(dx, dz), 0);
          const w = (ae.width ?? 0.5) * 2;
          obj.scale.set(w, w, len);
          const m = (obj as THREE.Mesh).material as THREE.MeshBasicMaterial;
          m.opacity = 0.85 * ratio;
          break;
        }
        case 'gas_cloud': {
          obj.position.set(ae.x, ae.y + 0.1, ae.z);
          obj.scale.setScalar(ae.radius);
          const m = (obj as THREE.Mesh).material as THREE.MeshBasicMaterial;
          m.opacity = 0.32 * ratio;
          obj.rotation.z += 0.01;
          // 飘动的绿色毒气粒子
          if (state.tick % 3 === 0) {
            const a = Math.random() * Math.PI * 2;
            const r = Math.random() * ae.radius;
            this.spawnParticle(
              ae.x + Math.cos(a) * r, ae.y + 0.3 + Math.random() * 0.8, ae.z + Math.sin(a) * r,
              0, 0.3 + Math.random() * 0.4, 0,
              0.6, 0.5, 0.25, 0.7, 0.12,
            );
          }
          break;
        }
        case 'void_ripple': {
          obj.position.set(ae.x, ae.y + 0.08, ae.z);
          obj.scale.setScalar(Math.max(0.01, ae.radius));
          const m = (obj as THREE.Mesh).material as THREE.MeshBasicMaterial;
          m.color.setHex(0x00ffff);
          m.opacity = 0.6 * ratio;
          break;
        }
        case 'scorch_trail': {
          obj.position.set(ae.x, ae.y + 0.06, ae.z);
          obj.scale.setScalar(ae.radius);
          const m = (obj as THREE.Mesh).material as THREE.MeshBasicMaterial;
          m.opacity = 0.7 * ratio;
          break;
        }
      }
    }

    // 清除已消失的区域特效 mesh
    for (const [id, obj] of this.areaEffectObjects) {
      if (!live.has(id)) {
        this.scene.remove(obj);
        const mesh = obj as THREE.Mesh;
        if (mesh.material) (mesh.material as THREE.Material).dispose?.();
        this.areaEffectObjects.delete(id);
      }
    }
  }

  private createAreaEffectMesh(ae: GameState['areaEffects'][number]): THREE.Object3D {
    switch (ae.kind) {
      case 'ray_beam': {
        // 单位长方体（z 长 1），靠 scale 拉伸；红色激光 + 加色混合
        const geo = new THREE.BoxGeometry(1, 1, 1);
        const mat = new THREE.MeshBasicMaterial({
          color: 0xff3366, transparent: true, opacity: 0.85,
          blending: THREE.AdditiveBlending, depthWrite: false,
        });
        return new THREE.Mesh(geo, mat);
      }
      case 'gas_cloud': {
        const geo = new THREE.CircleGeometry(1, 24);
        const mat = new THREE.MeshBasicMaterial({
          color: 0x2f7d24, transparent: true, opacity: 0.3,
          side: THREE.DoubleSide, depthWrite: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        return mesh;
      }
      case 'void_ripple': {
        // 单位环（内 0.82 外 1），靠 scale 放大
        const geo = new THREE.RingGeometry(0.82, 1.0, 48);
        const mat = new THREE.MeshBasicMaterial({
          color: 0x00ffff, transparent: true, opacity: 0.6,
          side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        return mesh;
      }
      case 'scorch_trail':
      default: {
        const geo = new THREE.CircleGeometry(1, 20);
        const mat = new THREE.MeshBasicMaterial({
          color: 0xff6a1a, transparent: true, opacity: 0.7,
          side: THREE.DoubleSide, depthWrite: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        return mesh;
      }
    }
  }

  /** 给中毒 / 麻痹的敌人喷少量状态粒子（绿色毒雾 / 黄色麻痹电花）。 */
  private updateEnemyStatusVfx(state: GameState): void {
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      if ((e.poisonTimer ?? 0) > 0 && state.tick % 4 === 0) {
        const a = Math.random() * Math.PI * 2;
        this.spawnParticle(
          e.x + Math.cos(a) * 0.4, e.y + 0.6 + Math.random() * 0.6, e.z + Math.sin(a) * 0.4,
          0, 0.4 + Math.random() * 0.4, 0,
          0.4, 0.45, 0.3, 0.85, 0.2,
        );
      }
      if ((e.slowTimer ?? 0) > 0 && state.tick % 5 === 0) {
        const a = Math.random() * Math.PI * 2;
        this.spawnParticle(
          e.x + Math.cos(a) * 0.5, e.y + 0.8 + Math.random() * 0.5, e.z + Math.sin(a) * 0.5,
          (Math.random() - 0.5) * 1.2, 0.6, (Math.random() - 0.5) * 1.2,
          0.4, 0.18, 1.0, 0.85, 0.1,
        );
      }
    }
  }

  /** 生成奥术「奥秘」计数贴图（蓝紫渐变描边数字）。 */
  private makeMysteryNumberTexture(value: number): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 128, 96);
    const text = String(value);
    ctx.font = 'bold 60px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const grad = ctx.createLinearGradient(0, 18, 0, 78);
    grad.addColorStop(0, '#c79bff');
    grad.addColorStop(1, '#5a8cff');
    ctx.lineWidth = 7;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(10,4,30,0.92)';
    ctx.strokeText(text, 64, 50);
    ctx.fillStyle = grad;
    ctx.fillText(text, 64, 50);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** 奥术 T2+：在玩家头顶显示当前奥秘数值（蓝紫渐变）。 */
  private updateMysteryNumber(state: GameState): void {
    const player = state.player;
    const arcaneTier = player.bonds?.find(b => b.bondId === 'arcane')?.tier ?? 0;
    const value = Math.floor(player.bondMystery ?? 0);
    if (arcaneTier < 2 || !player.alive) {
      if (this.mysteryNumberSprite) this.mysteryNumberSprite.visible = false;
      return;
    }
    if (!this.mysteryNumberSprite) {
      const mat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, opacity: 0.96 });
      this.mysteryNumberSprite = new THREE.Sprite(mat);
      this.mysteryNumberSprite.renderOrder = 20;
      this.scene.add(this.mysteryNumberSprite);
    }
    const sprite = this.mysteryNumberSprite;
    if (value !== this.mysteryNumberValue) {
      this.mysteryNumberValue = value;
      const oldMap = sprite.material.map;
      sprite.material.map = this.makeMysteryNumberTexture(value);
      sprite.material.needsUpdate = true;
      oldMap?.dispose();
    }
    sprite.visible = true;
    sprite.position.set(player.x, player.y + 2.5, player.z);
    sprite.scale.set(1.15, 0.86, 1);
  }

  /** 消费羁绊 VFX 事件：奥术光球 / 余烬红色爆炸烟雾。 */
  private processBondVfxEvents(state: GameState): void {
    const player = state.player;
    for (const evt of state.bondVfxEvents ?? []) {
      if (evt.kind === 'arcane_burst') {
        const from = new THREE.Vector3(player.x, player.y + 2.5, player.z);
        const to = new THREE.Vector3(evt.x, evt.y, evt.z);
        const mat = new THREE.SpriteMaterial({
          map: getArcaneOrbTexture(), transparent: true, depthWrite: false,
          blending: THREE.AdditiveBlending, opacity: 1,
        });
        const sprite = new THREE.Sprite(mat);
        sprite.renderOrder = 18;
        sprite.scale.setScalar(1.8);
        sprite.position.copy(from);
        this.scene.add(sprite);
        // 起手闪光，强调发射
        this.spawnBillboard({
          texture: 'muzzle', x: from.x, y: from.y, z: from.z,
          scale: 1.6, endScale: 2.6, lifetime: 0.22, opacityCurve: 'flash',
          opacity: 0.95, color: 0xa97bff, rotation: Math.random() * Math.PI * 2,
        });
        this.arcaneBurstOrbs.push({ sprite, from, to, t: 0, life: 0.42 });
      } else if (evt.kind === 'ember_explode') {
        this.emitEmberExplosion(evt.x, evt.y, evt.z);
      }
    }
  }

  /** 推进奥术光球；沿途留蓝紫尾迹，抵达目标时生成蓝紫烟雾。 */
  private updateArcaneBurstOrbs(dt: number): void {
    for (let i = this.arcaneBurstOrbs.length - 1; i >= 0; i--) {
      const orb = this.arcaneBurstOrbs[i];
      const prevK = Math.min(1, orb.t / orb.life);
      orb.t += dt;
      const k = Math.min(1, orb.t / orb.life);
      orb.sprite.position.lerpVectors(orb.from, orb.to, k);
      orb.sprite.position.y += Math.sin(k * Math.PI) * 0.8; // 抛物线小拱
      // 脉动放大，强调存在感
      orb.sprite.scale.setScalar(1.7 + Math.sin(orb.t * 40) * 0.25);

      // 尾迹：在本帧位移区间补几颗蓝紫拖尾粒子（独立于帧率）
      const pos = orb.sprite.position;
      const trailCount = 3;
      for (let s = 0; s < trailCount; s++) {
        const kk = prevK + (k - prevK) * (s / trailCount);
        const tx = orb.from.x + (orb.to.x - orb.from.x) * kk + (Math.random() - 0.5) * 0.25;
        const ty = orb.from.y + (orb.to.y - orb.from.y) * kk + Math.sin(kk * Math.PI) * 0.8 + (Math.random() - 0.5) * 0.25;
        const tz = orb.from.z + (orb.to.z - orb.from.z) * kk + (Math.random() - 0.5) * 0.25;
        this.spawnParticle(
          tx, ty, tz,
          (Math.random() - 0.5) * 0.6, (Math.random() - 0.3) * 0.6, (Math.random() - 0.5) * 0.6,
          1.4 + Math.random() * 0.8, 0.3 + Math.random() * 0.2,
          0.62 + Math.random() * 0.2, 0.45 + Math.random() * 0.15, 1.0,
        );
      }
      // 朝相机的发光拖影
      this.spawnBillboard({
        texture: 'smoke', x: pos.x, y: pos.y, z: pos.z,
        scale: 1.3, endScale: 0.5, lifetime: 0.28, opacityCurve: 'fadeOut',
        opacity: 0.65, color: 0x9a6bff, blending: 'additive',
        rotation: Math.random() * Math.PI * 2,
      });

      if (k >= 1) {
        this.emitArcaneSmoke(orb.to.x, orb.to.y, orb.to.z);
        this.scene.remove(orb.sprite);
        orb.sprite.material.dispose(); // 贴图为共享缓存，不 dispose
        this.arcaneBurstOrbs.splice(i, 1);
      }
    }
  }

  /** 蓝紫色范围烟雾（奥秘爆发命中点）。 */
  private emitArcaneSmoke(x: number, y: number, z: number): void {
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2.2 + Math.random() * 3.0;
      this.spawnParticle(
        x, y, z,
        Math.cos(a) * sp, 0.6 + Math.random() * 2.2, Math.sin(a) * sp,
        2.6 + Math.random() * 1.8, 0.45 + Math.random() * 0.35,
        0.55 + Math.random() * 0.2, 0.4 + Math.random() * 0.2, 0.98,
      );
    }
    // 命中爆闪（朝相机，强对比强调命中）
    this.spawnBillboard({
      texture: 'muzzle', x, y, z, scale: 2.0, endScale: 3.6, lifetime: 0.22,
      opacityCurve: 'flash', opacity: 1.0, color: 0xc8a0ff,
      rotation: Math.random() * Math.PI * 2, blending: 'additive',
    });
    // 蓝紫扩散烟团
    this.spawnBillboard({
      texture: 'smoke', x, y, z, scale: 2.0, endScale: 4.4, lifetime: 0.6,
      opacityCurve: 'fadeOut', opacity: 0.8, color: 0x8a5cff,
      rotation: Math.random() * Math.PI * 2, blending: 'additive',
    });
    // 地面蓝紫光环
    this.spawnBillboard({
      texture: 'scorch', x, y: y - 1.0 + 0.06, z, scale: 1.6, endScale: 3.0, lifetime: 0.45,
      opacityCurve: 'fadeOut', opacity: 0.6, color: 0x6a4cff,
      facing: 'up', rotation: Math.random() * Math.PI * 2, blending: 'additive',
    });
  }

  /** 红色爆炸烟雾（余烬羁绊敌人爆炸）。 */
  private emitEmberExplosion(x: number, y: number, z: number): void {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 2.5;
      this.spawnParticle(
        x, y, z,
        Math.cos(a) * sp, 0.8 + Math.random() * 1.8, Math.sin(a) * sp,
        2.4 + Math.random() * 1.5, 0.3 + Math.random() * 0.25,
        0.95, 0.25 + Math.random() * 0.2, 0.12,
      );
    }
    this.spawnBillboard({
      texture: 'smoke', x, y, z, scale: 1.8, endScale: 3.6, lifetime: 0.55,
      opacityCurve: 'fadeOut', opacity: 0.8, color: 0xcc2a1a,
      rotation: Math.random() * Math.PI * 2, blending: 'normal',
    });
  }

  private updateVFX(state: GameState, dt: number): void {
    const enemies = state.enemies;
    const player = state.player;

    this.updateAreaEffects(state, dt);
    this.updateEnemyStatusVfx(state);
    this.updateMysteryNumber(state);
    this.processBondVfxEvents(state);
    this.updateArcaneBurstOrbs(dt);

    // --- Emit particles based on game events ---

    // Hit sparks from damage events
    for (const event of state.damageEvents) {
      if (event.isPlayerDamage) continue;

      // Death detection
      const isDeath = event.damage > 10 && !enemies.some(e =>
        e.hp > 0 && Math.abs(e.x - event.x) < 0.5 && Math.abs(e.z - event.z) < 0.5
      );

      if (isDeath) {
        this.emitDeathBurst(event.x, event.y - 1.0, event.z, 'generic');
      } else {
        // Prefer the event's source weapon for spark color; fall back to first equipped weapon
        const weaponType = event.weaponType
          ?? (player.weapons.length > 0 ? player.weapons[0].type : 'sword');
        this.emitHitSparks(event.x, event.y + 0.5, event.z, weaponType);
      }

      // Lightning staff: drop a column at each strike
      if (event.weaponType === 'lightning_staff') {
        this.spawnLightningBolt(event.x, event.y - 1.0, event.z);
      }
    }

    // Continuous weapon effects
    let hasFlameRing = false;
    for (const weapon of player.weapons) {
      if (weapon.type === 'flame_ring' && player.alive) {
        this.emitFlameRingParticles(player.x, player.y, player.z, 2.5);
        hasFlameRing = true;
      }
    }

    // Flame ring persistent disk (lazy-create + follow player)
    if (hasFlameRing && player.alive) {
      const disk = this.ensureFlameRingDisk();
      disk.visible = true;
      disk.position.set(player.x, player.y + 0.05, player.z);
      this.flameRingTime += dt;
      const pulse = 0.35 + Math.sin(this.flameRingTime * 4) * 0.15;
      (disk.material as THREE.MeshBasicMaterial).opacity = pulse;
      disk.rotation.z = this.flameRingTime * 0.8;
    } else if (this.flameRingDisk) {
      this.flameRingDisk.visible = false;
    }

    // === Weapon Trail VFX (#12) ===
    // Projectile trails for player weapons
    for (const proj of state.projectiles) {
      if (!proj.fromPlayer) continue;

      // Other player projectiles: short trail dot every 2 ticks
      if (state.tick % 2 === 0) {
        const color = GameScene.WEAPON_VFX_COLORS[proj.weaponType] ?? [1, 1, 1];
        // Shotgun: brighter, larger trail to read as buckshot
        const isShotgun = proj.weaponType === 'shotgun';
        this.spawnParticle(
          proj.x, proj.y, proj.z,
          0, 0, 0,
          isShotgun ? 0.6 : 0.4,
          isShotgun ? 0.25 : 0.2,
          color[0] * (isShotgun ? 1.0 : 0.7),
          color[1] * (isShotgun ? 1.0 : 0.7),
          color[2] * (isShotgun ? 1.0 : 0.7),
        );
      }
    }

    // Sword slash arc + bow/shotgun muzzle flash —— 边缘触发，每次开火一次
    for (const weapon of player.weapons) {
      const prev = this.lastWeaponCooldown.get(weapon.type) ?? Infinity;
      const curr = weapon.cooldownTimer;
      // cooldownTimer just jumped UP → weapon fired this frame
      const justFired = curr > prev + 0.05 && player.alive;

      if (justFired && weapon.type === 'sword') {
        // Find nearest enemy for slash direction
        let slashAngle = player.rotation;
        let nearestDist = Infinity;
        for (const enemy of state.enemies) {
          if (enemy.hp <= 0) continue;
          const edx = enemy.x - player.x;
          const edz = enemy.z - player.z;
          const eDist = edx * edx + edz * edz;
          if (eDist < nearestDist) {
            nearestDist = eDist;
            slashAngle = Math.atan2(edx, edz);
          }
        }

        // Big horizontal arc plane that flashes & fades
        this.spawnSlashArc(player.x, player.y + 0.6, player.z, slashAngle);

        // Kenney slash 贴图：横躺地面 + 沿 swing 方向贴
        this.spawnBillboard({
          texture: 'slash',
          x: player.x + Math.sin(slashAngle) * 1.5,
          y: player.y + 0.15,
          z: player.z + Math.cos(slashAngle) * 1.5,
          scale: 3.5,
          endScale: 4.5,
          lifetime: 0.18,
          opacityCurve: 'flash',
          opacity: 0.85,
          color: 0xeef4ff,
          facing: 'up',
          // slash 贴图本身朝右，需要旋转到 swing 方向（+ 90° 修正贴图朝向）
          rotation: -slashAngle + Math.PI / 2,
        });

        // 12 lightweight particles streaking along the arc for extra punch
        for (let i = 0; i < 12; i++) {
          const arcAngle = slashAngle + (i - 5.5) * 0.18;
          const dist = 1.5 + Math.random() * 0.6;
          const px = player.x + Math.sin(arcAngle) * dist;
          const pz = player.z + Math.cos(arcAngle) * dist;
          this.spawnParticle(
            px, player.y + 1.0, pz,
            Math.sin(arcAngle) * 1.8, 0.8 + Math.random() * 0.6, Math.cos(arcAngle) * 1.8,
            0.5,
            0.18,
            0.95, 0.97, 1.0,
          );
        }
      }

      // Bow / shotgun 开火 → 玩家身前一瞬间 muzzle flash
      if (justFired && (weapon.type === 'bow' || weapon.type === 'shotgun')) {
        const facing = player.rotation;
        const fwd = 0.8;
        const color = weapon.type === 'shotgun' ? 0xffaa44 : 0xffe0a0;
        this.spawnBillboard({
          texture: 'muzzle',
          x: player.x + Math.sin(facing) * fwd,
          y: player.y + 1.2,
          z: player.z + Math.cos(facing) * fwd,
          scale: weapon.type === 'shotgun' ? 1.4 : 0.9,
          endScale: weapon.type === 'shotgun' ? 2.2 : 1.5,
          lifetime: 0.1,
          opacityCurve: 'flash',
          opacity: 1.0,
          color,
          rotation: Math.random() * Math.PI * 2,
        });
      }

      this.lastWeaponCooldown.set(weapon.type, curr);
    }

    // Drive transient mesh effects (slash arcs, lightning bolts)
    this.updateTransientEffects(dt);

    // --- Update particle physics ---
    const positions = this.vfxGeometry.attributes.position as THREE.BufferAttribute;
    const sizes = this.vfxGeometry.attributes.aSize as THREE.BufferAttribute;
    const lifes = this.vfxGeometry.attributes.aLife as THREE.BufferAttribute;
    const colors = this.vfxGeometry.attributes.aColor as THREE.BufferAttribute;

    let activeCount = 0;
    for (let i = 0; i < this.MAX_PARTICLES; i++) {
      const p = this.vfxParticles[i];
      if (!p.active) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }

      // Update position
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= 3.0 * dt; // slight gravity

      // Write to buffers
      const lifeRatio = p.life / p.maxLife;
      positions.setXYZ(activeCount, p.x, p.y, p.z);
      sizes.setX(activeCount, p.size * lifeRatio);
      lifes.setX(activeCount, lifeRatio);
      colors.setXYZ(activeCount, p.r, p.g, p.b);
      activeCount++;
    }

    // Fill rest with invisible positions
    for (let i = activeCount; i < this.MAX_PARTICLES; i++) {
      positions.setXYZ(i, 0, -100, 0);
      sizes.setX(i, 0);
      lifes.setX(i, 0);
      colors.setXYZ(i, 0, 0, 0);
    }

    positions.needsUpdate = true;
    sizes.needsUpdate = true;
    lifes.needsUpdate = true;
    colors.needsUpdate = true;
    this.vfxGeometry.setDrawRange(0, activeCount);
  }

  private updateCamera(state: GameState): void {
    const p = state.player;

    // 镜头位置 + lookAt + 平滑跟随 全部委托给 CameraOrbit（用 frameDt 做 dt-based 平滑）。
    // 这里只保留游戏特有的 FOV 自适应 + 屏震叠加（与玩法挂钩，不属于镜头通用逻辑）。
    this.cameraOrbit.update(this.camera, p, this.frameDt);

    // === Dynamic FOV based on enemy density (very gentle, no frequent updates) ===
    const enemyCount = state.enemies.length;
    if (state.boss) {
      this.targetFOV = 68;
    } else if (enemyCount > 50) {
      this.targetFOV = 65;
    } else {
      this.targetFOV = 60;
    }
    // Only update projection when FOV actually differs noticeably
    const fovDiff = this.targetFOV - this.currentFOV;
    if (Math.abs(fovDiff) > 0.01) {
      this.currentFOV += fovDiff * 0.01;
      this.camera.fov = this.currentFOV;
      this.camera.updateProjectionMatrix();
    }

    // === Screen shake (layered, additive) ===
    if (this.shakeIntensity > 0.001) {
      this.shakeTime += 1 / 60;
      const shakeX = Math.sin(this.shakeTime * this.shakeFrequency) * this.shakeIntensity;
      const shakeY = Math.sin(this.shakeTime * this.shakeFrequency * 1.3 + 1.7) * this.shakeIntensity * 0.4;
      this.camera.position.x += shakeX;
      this.camera.position.y += shakeY;
      this.shakeIntensity *= Math.pow(0.15, this.shakeDecay / 60);
      if (this.shakeIntensity < 0.001) this.shakeIntensity = 0;
    }
  }

  // ===========================================================================
  // HUD Update
  // ===========================================================================

  private updateHUD(state: GameState): void {
    const p = state.player;
    const time = performance.now();

    // HP bar with GSAP animation + numeric label (current / max)
    const hpPercent = Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100));
    if (hpPercent !== this.lastHpPercent) {
      gsapAnimations.animateHealthBar(this.hpBarInner, hpPercent);
      this.lastHpPercent = hpPercent;
    }
    this.hpText.textContent = `${Math.max(0, Math.ceil(p.hp))} / ${Math.ceil(p.maxHp)}`;

    // Shield bar (only shown when player has shield capacity)
    const maxShield = p.maxShield ?? 0;
    const shield = p.shield ?? 0;
    if (maxShield > 0) {
      this.shieldBar.style.display = 'block';
      const shieldPercent = Math.max(0, Math.min(100, (shield / maxShield) * 100));
      this.shieldBarInner.style.width = `${shieldPercent}%`;
      this.shieldText.textContent = `${Math.max(0, Math.ceil(shield))} / ${Math.ceil(maxShield)}`;
    } else {
      this.shieldBar.style.display = 'none';
    }

    // XP bar with GSAP animation
    const xpPercent = p.xpToNext > 0 ? Math.max(0, Math.min(100, (p.xp / p.xpToNext) * 100)) : 0;
    if (xpPercent !== this.lastXpPercent) {
      gsapAnimations.animateHealthBar(this.xpBarInner, xpPercent);
      this.lastXpPercent = xpPercent;
    }

    // Level label (centered inside the XP bar) with GSAP pulse animation
    this.levelLabel.textContent = t('hud.level', { level: String(p.level) });
    if (this.levelCompPulseTimer > 0) {
      this.levelCompPulseTimer -= 1 / 60;
      if (!this.levelPulseAnimation) {
        this.levelPulseAnimation = gsapAnimations.playLevelLabelPulse(this.levelLabel);
      }
    } else {
      if (this.levelPulseAnimation) {
        this.levelPulseAnimation.kill();
        this.levelPulseAnimation = null;
      }
      this.levelLabel.style.transform = 'scale(1)';
      this.levelLabel.style.color = '#ffffff';
      this.levelLabel.style.textShadow = '0 1px 3px rgba(0,0,0,0.9)';
    }

    // Difficulty / timer / silver / kills
    const totalSec = Math.floor(state.gameTime);
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    this.setTierBadge(state.tier);
    this.setStageBadge(state.stage);
    this.timerLabel.textContent = `⏱ ${timeStr}`;
    this.killLabel.textContent = `💀 ${state.stats.killCount}`;
    setSilverBadgeAmount(this.silverLabel, state.stats.silverEarned);
    setGoldBadgeAmount(this.goldLabel, p.gold);

    // --- Quest line: mark complete once the boss is defeated (altar becomes a portal) ---
    const bossDefeated = state.altars.some(a => a.phase === 'portal_ready' || a.phase === 'portal_used');
    if (bossDefeated) {
      this.questCheckbox.textContent = '✓';
      this.questCheckbox.style.background = 'rgba(93,255,155,0.18)';
      this.questCheckbox.style.borderColor = '#5dff9b';
    } else {
      this.questCheckbox.textContent = '';
      this.questCheckbox.style.background = 'transparent';
      this.questCheckbox.style.borderColor = 'rgba(255,255,255,0.6)';
    }

    // --- Consumable buff icons (left of buff row) with timed countdown shadow ---
    this.renderConsumableBuffs(p);

    // --- Weapon slots (top-left): fixed grid of maxWeaponSlots + a locked 6th slot ---
    this.renderWeaponSlots(p);

    // --- Tome stack (top-right second column): newest on the right ---
    this.tomesSlotsContainer.innerHTML = '';
    for (const tome of p.tomes) {
      const slot = document.createElement('div');
      const bgColor = TOME_COLORS[tome.type] ?? '#444';
      slot.style.cssText = `width:clamp(34px,9vw,40px);height:clamp(34px,9vw,40px);background:${bgColor}33;border:1px solid ${bgColor};border-radius:6px;position:relative;display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:help;`;
      this.setItemTooltip(slot, this.createTomeTooltipHtml(tome));
      const icon = document.createElement('span');
      icon.style.cssText = 'font-size:clamp(14px,4vw,18px);';
      icon.textContent = TOME_ICONS[tome.type] ?? '📖';
      slot.appendChild(icon);
      // Level number (Lv.N) bottom-center
      const lvl = document.createElement('span');
      lvl.style.cssText = 'position:absolute;bottom:-1px;left:0;right:0;text-align:center;font-size:8px;font-weight:bold;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.95);';
      lvl.textContent = `Lv.${tome.level}`;
      slot.appendChild(lvl);
      this.tomesSlotsContainer.appendChild(slot);
    }

    // --- Relic bar (bottom): fixed empty placeholder slots, filled left → right ---
    this.relicSlotsContainer.innerHTML = '';
    const acquiredRelics = (Object.entries(p.relicStacks ?? {}) as Array<[RelicId, number]>)
      .filter(([id, count]) => count > 0 && RELICS[id]);
    // 槽位数：先按遗物种类数兜底，再按遗物栏实际宽度算出能铺满整条框的数量，
    // 用空占位槽把整个框填满（已获取数量更多时则以已获取数为准，多出的由横向滚动承载）。
    const slotPx = Math.min(36, Math.max(30, window.innerWidth * 0.08)); // 对应 clamp(30px,8vw,36px)
    const gapPx = 6;
    const barInnerWidth = this.relicSlotsContainer.clientWidth - 16; // padding 左右各 8px
    const fitCount = barInnerWidth > 0
      ? Math.floor((barInnerWidth + gapPx) / (slotPx + gapPx))
      : 0;
    const RELIC_SLOT_COUNT = Math.max(acquiredRelics.length, Object.keys(RELICS).length, fitCount);
    for (let i = 0; i < RELIC_SLOT_COUNT; i++) {
      const entry = acquiredRelics[i];
      const slot = document.createElement('div');
      if (!entry) {
        // 空占位槽
        slot.style.cssText = `
          width:clamp(30px,8vw,36px);height:clamp(30px,8vw,36px);background:rgba(0,0,0,0.32);
          border:1px dashed rgba(255,255,255,0.16);border-radius:8px;flex-shrink:0;box-sizing:border-box;
        `;
        this.relicSlotsContainer.appendChild(slot);
        continue;
      }
      const [id, count] = entry;
      const relic = RELICS[id];
      const borderColor = RARITY_COLORS[relic.rarity] ?? '#aaaaaa';
      this.setItemTooltip(slot, this.createRelicTooltipHtml(id, count, state));
      slot.style.cssText = `
        width:clamp(30px,8vw,36px);height:clamp(30px,8vw,36px);background:rgba(10,10,22,0.78);border:1px solid ${borderColor};
        border-radius:8px;position:relative;display:flex;align-items:center;justify-content:center;
        flex-shrink:0;box-shadow:0 0 10px ${borderColor}40;cursor:help;
      `;
      const icon = document.createElement('span');
      icon.style.cssText = 'font-size:clamp(15px,4vw,18px);';
      icon.textContent = relic.emoji;
      slot.appendChild(icon);
      const stack = document.createElement('span');
      stack.style.cssText = 'position:absolute;right:-4px;bottom:-5px;min-width:15px;height:15px;padding:0 3px;border-radius:999px;background:rgba(0,0,0,0.82);border:1px solid rgba(255,255,255,0.35);color:#fff;font-size:9px;font-weight:bold;display:flex;align-items:center;justify-content:center;text-shadow:0 1px 2px #000;';
      stack.textContent = String(count);
      slot.appendChild(stack);
      this.relicSlotsContainer.appendChild(slot);
    }

    // --- Bond slots (right of buff row); tap to expand a detail layer ---
    this.renderBondSlots(state);

    // --- Boss HP Bar with GSAP animation ---
    if (state.boss && state.boss.hp > 0) {
      // 使用 GSAP 淡入显示
      if (this.bossHpContainer.style.display === 'none') {
        gsapAnimations.fadeInElement(this.bossHpContainer, 0.2);
      }

      const bossHpPercent = Math.max(0, Math.min(100, (state.boss.hp / state.boss.maxHp) * 100));

      // 使用 GSAP 动画更新血条宽度
      if (bossHpPercent !== this.lastBossHpPercent) {
        gsapAnimations.animateBossHealthBar(this.bossHpBarInner, bossHpPercent);
        this.lastBossHpPercent = bossHpPercent;
      }

      this.bossNameLabel.textContent = `${t('boss.anubis')} - Phase ${state.boss.phase}`;

      // Pulsing glow when enraged
      if (state.boss.enraged) {
        const pulse = 0.6 + Math.sin(time * 0.008) * 0.4;
        this.bossHpContainer.style.boxShadow = `0 0 ${8 + pulse * 8}px rgba(255,50,0,${pulse})`;
      } else {
        this.bossHpContainer.style.boxShadow = 'none';
      }
    } else {
      // 使用 GSAP 淡出隐藏
      if (this.bossHpContainer.style.display !== 'none') {
        gsapAnimations.fadeOutElement(this.bossHpContainer, 0.2);
      }
    }

    // --- Altar / Portal Indicator ---
    // 显示距离最近的祭坛 / 宝箱（或玩家在交互半径里时的 prompt）。
    // 跳过终态：boss_active（Boss 战中无意义）/ portal_used（即将被消费）。
    const nearestChest = state.chests
      .filter(c => !c.opened)
      .map(c => ({ chest: c, dist: Math.hypot(c.x - p.x, c.z - p.z) }))
      .sort((a, b) => a.dist - b.dist)[0] ?? null;
    const openedChestCount = state.chests.filter(c => c.opened && !c.bossDrop).length;
    const chestCost = nearestChest?.chest.bossDrop ? 0 : getChestGoldCost(p.level, openedChestCount);
    const chestInRange = nearestChest != null && nearestChest.dist <= CHEST_INTERACT_RADIUS;
    const visibleAltar = state.altars.find(a => a.phase !== 'boss_active' && a.phase !== 'portal_used');
    if (chestInRange && nearestChest) {
      // 使用 GSAP 动画显示传送门指示器
      gsapAnimations.animateTeleporterIndicator(this.teleporterIndicator, true, 0.2);
      const isBossChest = nearestChest.chest.bossDrop === true;
      const canAfford = isBossChest || p.gold >= chestCost;
      this.teleporterIndicator.style.color = canAfford ? '#ffdd66' : '#999999';
      this.teleporterIndicator.style.textShadow = canAfford
        ? '0 0 8px #ffcc33,0 1px 3px rgba(0,0,0,0.8)'
        : '0 1px 3px rgba(0,0,0,0.8)';
      this.teleporterIndicator.textContent = isBossChest
        ? '🎁 [E] 开启 Boss 宝箱'
        : canAfford
        ? `🎁 [E] 开启宝箱 - ${chestCost} 金币`
        : `🎁 金币不足 ${p.gold}/${chestCost}`;
    } else if (visibleAltar) {
      // 使用 GSAP 动画显示传送门指示器
      gsapAnimations.animateTeleporterIndicator(this.teleporterIndicator, true, 0.2);
      this.teleporterIndicator.style.color = '#00ccff';
      this.teleporterIndicator.style.textShadow = '0 0 8px #00ccff,0 1px 3px rgba(0,0,0,0.8)';
      const dx = visibleAltar.x - p.x;
      const dz = visibleAltar.z - p.z;
      const dist = Math.round(Math.sqrt(dx * dx + dz * dz));
      switch (visibleAltar.phase) {
        case 'summoning': {
          const pct = Math.min(100, Math.round((visibleAltar.summonTimer / visibleAltar.summonDuration) * 100));
          this.teleporterIndicator.textContent = `${t('altar.summoning')} ${pct}%`;
          break;
        }
        case 'portal_ready': {
          // 已通关 Boss → 传送门
          this.teleporterIndicator.textContent = dist <= 2
            ? `🌀 ${t('altar.prompt.enterPortal')}`
            : `🌀 ${t('hud.compass.portal')}: ${dist}m`;
          break;
        }
        case 'cooldown': {
          const remaining = Math.ceil(visibleAltar.cooldownTimer ?? 0);
          this.teleporterIndicator.textContent = `⛩️ ${t('altar.cooldown', { seconds: String(remaining) })}`;
          break;
        }
        case 'ready':
        default: {
          // 等待召唤
          this.teleporterIndicator.textContent = dist <= 2
            ? `⛩️ ${t('altar.prompt.summon')}`
            : `⛩️ ${t('hud.compass.altar')}: ${dist}m`;
          break;
        }
      }
    } else if (nearestChest) {
      // 使用 GSAP 动画显示传送门指示器
      gsapAnimations.animateTeleporterIndicator(this.teleporterIndicator, true, 0.2);
      this.teleporterIndicator.style.color = '#ffdd66';
      this.teleporterIndicator.style.textShadow = '0 0 8px #ffcc33,0 1px 3px rgba(0,0,0,0.8)';
      this.teleporterIndicator.textContent = nearestChest.chest.bossDrop
        ? `🎁 Boss 宝箱: ${Math.round(nearestChest.dist)}m`
        : `🎁 宝箱: ${Math.round(nearestChest.dist)}m`;
    } else {
      // 使用 GSAP 动画隐藏传送门指示器
      gsapAnimations.animateTeleporterIndicator(this.teleporterIndicator, false, 0.2);
    }

    // --- 移动端交互按钮：仅在玩家位于祭坛 / 传送门 / 宝箱交互半径内时显示 ---
    const altarInRange = state.altars.find(a =>
      (a.phase === 'ready' || a.phase === 'portal_ready')
      && Math.hypot(a.x - p.x, a.z - p.z) <= 2.0
    );
    // 简易移动端判定：能 hover 的设备视作 PC，不显示按钮（避免 PC 用户看到双重 UI）
    const isMobile = !window.matchMedia('(hover: hover)').matches;
    if ((altarInRange || chestInRange) && isMobile) {
      // 使用 GSAP 动画显示交互按钮
      gsapAnimations.animateInteractButton(this.interactBtn, true, 0.3);
      if (chestInRange) {
        const isBossChest = nearestChest?.chest.bossDrop === true;
        const canAfford = isBossChest || p.gold >= chestCost;
        this.interactBtn.style.background = canAfford ? 'rgba(210,145,24,0.88)' : 'rgba(80,80,80,0.82)';
        this.interactBtn.textContent = isBossChest
          ? '开启 Boss 宝箱'
          : canAfford ? `开启宝箱 ${chestCost}` : `金币不足 ${p.gold}/${chestCost}`;
      } else if (altarInRange) {
        this.interactBtn.style.background = 'rgba(170,68,255,0.85)';
        this.interactBtn.textContent = altarInRange.phase === 'portal_ready'
          ? t('altar.prompt.enterPortal')
          : t('altar.prompt.summon');
      }
    } else {
      // 使用 GSAP 动画隐藏交互按钮
      gsapAnimations.animateInteractButton(this.interactBtn, false, 0.3);
    }

    // --- Overtime banner ---
    if (state.overtimeSeconds > 0) {
      // 使用 GSAP 动画显示超时横幅
      gsapAnimations.animateOvertimeBanner(this.overtimeBanner, true, 0.4);
      const sec = Math.floor(state.overtimeSeconds);
      const mm = Math.floor(sec / 60).toString().padStart(2, '0');
      const ss = (sec % 60).toString().padStart(2, '0');
      this.overtimeBanner.textContent = `⏱ ${t('overtime.banner')} ${mm}:${ss}`;
    } else {
      // 使用 GSAP 动画隐藏超时横幅
      gsapAnimations.animateOvertimeBanner(this.overtimeBanner, false, 0.4);
    }

    // --- Final Swarm visual effects ---
    if (state.finalSwarm) {
      // Show pulsing red border
      if (!this.finalSwarmBorder) {
        this.finalSwarmBorder = document.createElement('div');
        this.finalSwarmBorder.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:90;border:4px solid rgba(255,50,50,0.6);box-sizing:border-box;';
        document.body.appendChild(this.finalSwarmBorder);
        // 启动 GSAP 边框动画
        gsapAnimations.animateFinalSwarmBorder(this.finalSwarmBorder, 0.5);
      }

      // Show "FINAL SWARM!" text
      if (!this.finalSwarmLabel) {
        this.finalSwarmLabel = document.createElement('div');
        this.finalSwarmLabel.style.cssText = 'position:fixed;top:66px;left:50%;transform:translateX(-50%);color:#ff4444;font-size:20px;font-weight:bold;text-shadow:0 0 10px #ff0000,0 2px 4px rgba(0,0,0,0.8);pointer-events:none;z-index:101;letter-spacing:2px;';
        this.finalSwarmLabel.textContent = `⚠️ ${t('hud.finalSwarm')} ⚠️`;
        document.body.appendChild(this.finalSwarmLabel);
        // 启动 GSAP 标签动画
        gsapAnimations.animateFinalSwarmLabel(this.finalSwarmLabel, 0.5);
      }

      // Red-tint HUD elements during final swarm
      this.timerLabel.style.color = '#ff8888';
      this.killLabel.style.color = '#ff8888';
    } else {
      // Remove final swarm visuals
      if (this.finalSwarmBorder) {
        gsapAnimations.stopFinalSwarmAnimations();
        this.finalSwarmBorder.remove();
        this.finalSwarmBorder = null;
      }
      if (this.finalSwarmLabel) {
        this.finalSwarmLabel.remove();
        this.finalSwarmLabel = null;
      }
      this.timerLabel.style.color = '#ffffff';
      this.killLabel.style.color = '#cccccc';
    }

    // Damage numbers
    for (const evt of state.damageEvents) {
      this.spawnDamageNumber(evt);
    }

    // 空池升级补偿特效（银币/金币）
    for (const evt of state.levelUpCompensationEvents) {
      this.playCompensationLevelUpFx(evt);
    }

    // 宝箱开启揭示特效（事件在下一次 core tick 会清空，render loop 内用 key 防重复）
    for (const evt of state.chestOpenEvents ?? []) {
      const key = `${state.tick}:${evt.chestId}:${evt.relicId}`;
      if (this.seenChestOpenEvents.has(key)) continue;
      this.seenChestOpenEvents.add(key);
      if (this.seenChestOpenEvents.size > 80) this.seenChestOpenEvents.clear();
      this.playChestOpenFx(evt);
    }

    // === Combo HUD (#6) ===
    if (this.comboLabel) {
      const combo = state.player.comboCount;
      if (combo > 3) {
        // 使用 GSAP 动画显示组合标签
        gsapAnimations.animateComboLabel(this.comboLabel, true, 0.3);
        this.comboLabel.textContent = t('hud.combo', { count: String(combo) });
        // Scale up with combo count
        const fontSize = Math.min(28 + combo * 1.5, 56);
        this.comboLabel.style.fontSize = `${fontSize}px`;
        this.comboFadeTimer = 0.5;
        this.lastComboCount = combo;
      } else if (this.lastComboCount > 3 && combo <= 3) {
        // Combo dropped — fade out
        gsapAnimations.animateComboLabel(this.comboLabel, false, 0.3);
        this.lastComboCount = combo;
      }
    }
  }

  private getWeaponCooldownInfo(weapon: { type: string; cooldownTimer: number; level: number; evolved: boolean }): { cooldownPercent: number } {
    // Show cooldown as proportion — use a reasonable max cooldown for visual display
    const maxCd = 4.0;
    const pct = Math.max(0, Math.min(100, (weapon.cooldownTimer / maxCd) * 100));
    return { cooldownPercent: pct };
  }

  /**
   * 武器槽（左上角，血条下方）。
   * 固定展示 6 个格子：前 `maxWeaponSlots` 个为开放槽（有武器则显示武器，否则空），
   * 第 6 个槽在未完成「7 把不同武器」局外任务（maxWeaponSlots < 6）时显示一把锁。
   */
  private renderWeaponSlots(p: GameState['player']): void {
    const TOTAL_SLOTS = 6;
    const unlocked = Math.max(1, Math.min(TOTAL_SLOTS, p.maxWeaponSlots ?? 5));
    this.weaponSlotsContainer.innerHTML = '';
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      const weapon = p.weapons[i];
      const isLocked = i >= unlocked;
      const slot = document.createElement('div');
      const borderColor = weapon?.evolved ? '#ffcc00' : (isLocked ? 'rgba(255,255,255,0.18)' : '#555');
      slot.style.cssText = `width:clamp(40px,11vw,46px);height:clamp(40px,11vw,46px);background:${isLocked ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.6)'};border:2px solid ${borderColor};border-radius:6px;position:relative;display:flex;align-items:center;justify-content:center;flex-shrink:0;${isLocked ? '' : 'cursor:help;'}`;

      if (isLocked) {
        const lock = document.createElement('span');
        lock.style.cssText = 'font-size:clamp(16px,4.5vw,20px);opacity:0.7;';
        lock.textContent = '🔒';
        slot.appendChild(lock);
        this.setItemTooltip(slot, `<div style="max-width:200px;">${escapeTooltipText(t('hud.weaponSlotLocked'))}</div>`);
        this.weaponSlotsContainer.appendChild(slot);
        continue;
      }

      if (weapon) {
        this.setItemTooltip(slot, this.createWeaponTooltipHtml(weapon));
        const icon = document.createElement('span');
        icon.style.cssText = 'font-size:clamp(18px,5vw,22px);';
        icon.textContent = WEAPON_ICONS[weapon.type] ?? '?';
        slot.appendChild(icon);
        const cd = this.getWeaponCooldownInfo(weapon);
        if (cd.cooldownPercent > 0) {
          const overlay = document.createElement('div');
          overlay.style.cssText = `position:absolute;bottom:0;left:0;right:0;height:${cd.cooldownPercent}%;background:rgba(0,0,0,0.7);border-radius:0 0 4px 4px;pointer-events:none;`;
          slot.appendChild(overlay);
        }
        const lvl = document.createElement('span');
        lvl.style.cssText = 'position:absolute;bottom:-1px;left:0;right:0;text-align:center;font-size:8px;font-weight:bold;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.95);';
        lvl.textContent = `Lv.${weapon.level}`;
        slot.appendChild(lvl);
      }
      this.weaponSlotsContainer.appendChild(slot);
    }
  }

  /**
   * 消耗品 buff 图标（buff 行左侧）。
   * 限时 buff 用从顶部向下降的阴影表示剩余时间；时间到 / 一次性 buff 触发后图标消失。
   */
  private renderConsumableBuffs(p: GameState['player']): void {
    const active = p.activeConsumable;
    if (!active) {
      this.consumableMaxRemaining = 0;
      this.consumableBuffsContainer.innerHTML = '';
      return;
    }
    // 追踪 timed buff 的最大剩余值，用于阴影下降比例
    if (active.remaining > this.consumableMaxRemaining) {
      this.consumableMaxRemaining = active.remaining;
    }

    this.consumableBuffsContainer.innerHTML = '';
    const slot = document.createElement('div');
    slot.style.cssText = 'width:clamp(38px,10vw,44px);height:clamp(38px,10vw,44px);background:rgba(20,12,34,0.82);border:1px solid rgba(180,120,255,0.5);border-radius:8px;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 0 10px rgba(160,90,255,0.25);';
    this.setItemTooltip(slot, this.createConsumableTooltipHtml(active.id, active.remaining));

    const icon = document.createElement('span');
    icon.style.cssText = 'font-size:clamp(18px,5vw,22px);line-height:1;';
    icon.textContent = CONSUMABLE_EMOJI[active.id] ?? '✨';
    slot.appendChild(icon);

    // 限时 buff：顶部向下降的阴影（剩余越少阴影越高）
    if (active.remaining > 0 && this.consumableMaxRemaining > 0) {
      const ratio = Math.max(0, Math.min(1, active.remaining / this.consumableMaxRemaining));
      const shade = document.createElement('div');
      shade.style.cssText = `position:absolute;top:0;left:0;right:0;height:${Math.round((1 - ratio) * 100)}%;background:rgba(0,0,0,0.62);pointer-events:none;`;
      slot.appendChild(shade);
      const secs = document.createElement('span');
      secs.style.cssText = 'position:absolute;bottom:-1px;left:0;right:0;text-align:center;font-size:8px;font-weight:bold;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.95);';
      secs.textContent = `${Math.ceil(active.remaining)}s`;
      slot.appendChild(secs);
    }
    this.consumableBuffsContainer.appendChild(slot);
  }

  private createConsumableTooltipHtml(id: ConsumableId, remaining: number): string {
    const name = t(`consumable.${id}`);
    const desc = t(`consumable.${id}_desc`);
    const timerText = remaining < 0
      ? t('consumable.pending')
      : t('consumable.timer', { seconds: String(Math.ceil(remaining)) });
    return `
      <div style="display:flex;align-items:center;gap:6px;font-weight:700;">
        <span style="font-size:16px;">${CONSUMABLE_EMOJI[id] ?? '✨'}</span>
        <span>${escapeTooltipText(name)}</span>
        <span style="opacity:0.8;font-size:11px;">${escapeTooltipText(timerText)}</span>
      </div>
      <div style="margin-top:4px;color:#d8c8ff;font-size:11px;line-height:1.35;">${escapeTooltipText(desc)}</div>
    `;
  }

  /**
   * 羁绊槽（buff 行右侧）。每个槽内部下方显示档位（T1/T2/T3）；
   * 点击展开 / 收起上方的羁绊详情浮层。
   */
  private renderBondSlots(state: GameState): void {
    const bonds = state.player.bonds ?? [];
    this.bondSlotsContainer.innerHTML = '';
    // 当前展开的羁绊若已不存在则关闭浮层
    if (this.openBondId && !bonds.some(b => b.bondId === this.openBondId)) {
      this.closeBondDetail();
    }
    for (const prog of bonds) {
      const def = BONDS[prog.bondId];
      if (!def) continue;
      const tierColor = BOND_TIER_COLORS[prog.tier] ?? BOND_TIER_COLORS[1];
      const slot = document.createElement('div');
      slot.dataset.cameraBlock = 'true';
      slot.style.cssText = `width:clamp(36px,9.5vw,42px);height:clamp(36px,9.5vw,42px);position:relative;flex-shrink:0;display:flex;align-items:center;justify-content:center;cursor:pointer;touch-action:manipulation;`;
      this.setItemTooltip(slot, this.createBondTooltipHtml(prog.bondId, prog.tier, state));
      const diamond = document.createElement('div');
      diamond.style.cssText = `position:absolute;inset:3px;transform:rotate(45deg);background:rgba(10,10,22,0.85);border:2px solid ${tierColor};border-radius:6px;box-shadow:0 0 10px ${tierColor}66;`;
      slot.appendChild(diamond);
      const icon = document.createElement('span');
      icon.style.cssText = 'position:relative;z-index:1;font-size:clamp(14px,4vw,17px);line-height:1;';
      icon.textContent = def.icon;
      slot.appendChild(icon);
      // Tier label (T1/T2/T3) bottom-center
      const tierLabel = document.createElement('span');
      tierLabel.style.cssText = `position:absolute;bottom:-3px;left:0;right:0;text-align:center;font-size:9px;font-weight:bold;color:${tierColor};text-shadow:0 1px 2px rgba(0,0,0,0.95);z-index:2;`;
      tierLabel.textContent = `T${prog.tier}`;
      slot.appendChild(tierLabel);

      const bondId = prog.bondId;
      const tier = prog.tier;
      slot.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (this.openBondId === bondId) {
          this.closeBondDetail();
        } else {
          this.openBondDetail(bondId, tier, state, slot);
        }
      });
      this.bondSlotsContainer.appendChild(slot);
    }

    // 浮层若已打开，刷新其内容（数值会随游戏推进变化）
    if (this.openBondId) {
      const prog = bonds.find(b => b.bondId === this.openBondId);
      if (prog) this.bondDetailOverlay.innerHTML = this.createBondTooltipHtml(prog.bondId, prog.tier, state);
    }
  }

  private openBondDetail(bondId: BondId, tier: BondTier, state: GameState, anchor: HTMLElement): void {
    this.openBondId = bondId;
    this.bondDetailOverlay.innerHTML = this.createBondTooltipHtml(bondId, tier, state);
    this.bondDetailOverlay.style.display = 'block';
    // 定位到锚点正上方，避免超出视口
    const rect = anchor.getBoundingClientRect();
    const ov = this.bondDetailOverlay;
    ov.style.bottom = `${Math.round(window.innerHeight - rect.top + 8)}px`;
    // 先显示再测宽度
    const ovWidth = ov.offsetWidth || 280;
    let left = Math.round(rect.left + rect.width / 2 - ovWidth / 2);
    left = Math.max(12, Math.min(left, window.innerWidth - ovWidth - 12));
    ov.style.left = `${left}px`;
    if (!this.bondDetailOutsideHandler) {
      this.bondDetailOutsideHandler = (ev: PointerEvent) => {
        const target = ev.target as Node | null;
        // 点击浮层内部或羁绊槽时不关闭（羁绊槽自己的 click 负责切换）
        if (target && (this.bondDetailOverlay.contains(target) || this.bondSlotsContainer.contains(target))) {
          return;
        }
        this.closeBondDetail();
      };
      // 延迟注册，避免本次点击立即触发关闭
      setTimeout(() => {
        if (this.bondDetailOutsideHandler) {
          window.addEventListener('pointerdown', this.bondDetailOutsideHandler);
        }
      }, 0);
    }
  }

  private closeBondDetail(): void {
    this.openBondId = null;
    this.bondDetailOverlay.style.display = 'none';
    if (this.bondDetailOutsideHandler) {
      window.removeEventListener('pointerdown', this.bondDetailOutsideHandler);
      this.bondDetailOutsideHandler = null;
    }
  }

  private installItemTooltipHandlers(container: HTMLElement): void {
    container.addEventListener('mousemove', (event) => {
      const target = (event.target as HTMLElement).closest('[data-tooltip-item]') as HTMLElement | null;
      if (!target || !container.contains(target)) {
        this.hideItemTooltip();
        return;
      }
      const html = this.itemTooltipContent.get(target);
      if (!html) {
        this.hideItemTooltip();
        return;
      }
      this.showItemTooltip(html, event);
    });
    container.addEventListener('pointerdown', (event) => {
      const target = (event.target as HTMLElement).closest('[data-tooltip-item]') as HTMLElement | null;
      if (!target || !container.contains(target)) {
        this.hideItemTooltip();
        return;
      }
      const html = this.itemTooltipContent.get(target);
      if (!html) {
        this.hideItemTooltip();
        return;
      }
      this.showItemTooltipAt(html, event.clientX, event.clientY);
    });
    container.addEventListener('pointermove', (event) => {
      if (!this.itemTooltip || this.itemTooltip.style.display === 'none') return;
      const target = (event.target as HTMLElement).closest('[data-tooltip-item]') as HTMLElement | null;
      if (!target || !container.contains(target)) return;
      this.moveItemTooltipTo(event.clientX, event.clientY);
    });
    container.addEventListener('pointercancel', () => this.hideItemTooltip());
    container.addEventListener('mouseleave', () => this.hideItemTooltip());
  }

  private setItemTooltip(el: HTMLElement, html: string): void {
    el.dataset.tooltipItem = 'true';
    this.itemTooltipContent.set(el, html);
  }

  private showItemTooltip(html: string, event: MouseEvent): void {
    if (!this.itemTooltip) return;
    if (this.itemTooltip.innerHTML !== html) {
      this.itemTooltip.innerHTML = html;
    }
    this.itemTooltip.style.display = 'block';
    this.moveItemTooltip(event);
  }

  private showItemTooltipAt(html: string, clientX: number, clientY: number): void {
    if (!this.itemTooltip) return;
    if (this.itemTooltip.innerHTML !== html) {
      this.itemTooltip.innerHTML = html;
    }
    this.itemTooltip.style.display = 'block';
    this.moveItemTooltipTo(clientX, clientY);
  }

  private hideItemTooltip(): void {
    if (!this.itemTooltip) return;
    this.itemTooltip.style.display = 'none';
  }

  private moveItemTooltip(event: MouseEvent): void {
    this.moveItemTooltipTo(event.clientX, event.clientY);
  }

  private moveItemTooltipTo(clientX: number, clientY: number): void {
    if (!this.itemTooltip) return;
    const gap = 16;
    const margin = 8;
    const rect = this.itemTooltip.getBoundingClientRect();
    let x = clientX + gap;
    let y = clientY + gap;
    if (x + rect.width > window.innerWidth - margin) {
      x = clientX - rect.width - gap;
    }
    if (y + rect.height > window.innerHeight - margin) {
      y = clientY - rect.height - gap;
    }
    this.itemTooltip.style.left = `${Math.max(margin, x)}px`;
    this.itemTooltip.style.top = `${Math.max(margin, y)}px`;
  }

  private buildItemTooltipHtml(args: {
    title: string;
    subtitle?: string;
    description?: string;
    rows: Array<[string, string]>;
    accent: string;
  }): string {
    const rows = args.rows.map(([label, value]) => `
      <div style="display:flex;justify-content:space-between;gap:18px;margin-top:3px;">
        <span style="color:#b9b4cc;">${escapeTooltipText(label)}</span>
        <span style="color:#ffffff;font-weight:700;text-align:right;">${escapeTooltipText(value)}</span>
      </div>
    `).join('');

    return `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
        <div style="width:7px;height:24px;border-radius:999px;background:${args.accent};box-shadow:0 0 12px ${args.accent}aa;"></div>
        <div>
          <div style="font-size:14px;font-weight:800;color:#fff;">${escapeTooltipText(args.title)}</div>
          ${args.subtitle ? `<div style="font-size:10px;color:${args.accent};font-weight:700;letter-spacing:0.4px;">${escapeTooltipText(args.subtitle)}</div>` : ''}
        </div>
      </div>
      ${args.description ? `<div style="color:#d8d1ee;margin:6px 0 8px;">${escapeTooltipText(args.description)}</div>` : ''}
      ${rows ? `<div style="border-top:1px solid rgba(255,255,255,0.12);padding-top:6px;">${rows}</div>` : ''}
    `;
  }

  private getEffectiveWeaponStats(weapon: WeaponState): WeaponLevelStats {
    const levelStats = WEAPON_STATS[weapon.type] ?? WEAPON_STATS.bone_bouncer;
    const base = levelStats[0];
    let effective: WeaponLevelStats;

    if (weapon.growth) {
      const g = weapon.growth;
      effective = {
        damage: Math.round(base.damage + g.damage),
        cooldown: Math.max(0.1, base.cooldown + g.cooldown),
        projectileCount: Math.floor(base.projectileCount + g.projectileCount),
        bounces: Math.floor(base.bounces + g.bounces),
        chains: Math.floor(base.chains + g.chains),
        range: base.range + g.range,
        aoeRadius: base.aoeRadius + g.aoeRadius,
        pierce: Math.floor(base.pierce + g.pierce),
        speed: base.speed + g.speed,
      };
    } else {
      const idx = Math.max(0, Math.min(weapon.level - 1, levelStats.length - 1));
      effective = levelStats[idx];
    }

    return effective;
  }

  private createWeaponTooltipHtml(weapon: WeaponState): string {
    const stats = this.getEffectiveWeaponStats(weapon);
    const rows: Array<[string, string]> = [
      [t('upgrade.stat.damage'), String(stats.damage)],
      [t('upgrade.stat.cooldown'), `${formatTooltipNumber(stats.cooldown, 2)}s`],
    ];
    if (stats.projectileCount > 0) rows.push([t('upgrade.stat.projectiles'), String(stats.projectileCount)]);
    if (stats.range > 0) rows.push([t('upgrade.stat.range'), formatTooltipNumber(stats.range, 1)]);
    if (stats.aoeRadius > 0) rows.push([t('upgrade.stat.aoe'), formatTooltipNumber(stats.aoeRadius, 1)]);
    if (stats.pierce > 0 && stats.pierce < 999) rows.push([t('upgrade.stat.pierce'), String(stats.pierce)]);
    if (stats.pierce >= 999) rows.push([t('upgrade.stat.pierce'), '∞']);
    if (stats.bounces > 0) rows.push([t('upgrade.stat.bounces'), String(stats.bounces)]);
    if (stats.chains > 0) rows.push([t('upgrade.stat.chains'), String(stats.chains)]);
    if (stats.speed > 0) rows.push([t('upgrade.stat.projSpeed'), formatTooltipNumber(stats.speed, 1)]);
    if (weapon.cooldownTimer > 0) rows.push(['剩余冷却', `${formatTooltipNumber(weapon.cooldownTimer, 1)}s`]);

    return this.buildItemTooltipHtml({
      title: `${WEAPON_ICONS[weapon.type] ?? '?'} ${t(`upgrade.weapon.${weapon.type}`)}`,
      subtitle: weapon.evolved ? `Lv.${weapon.level} · 已进化` : `Lv.${weapon.level}`,
      description: t(`upgrade.weapon.${weapon.type}_desc`),
      rows,
      accent: weapon.evolved ? '#ffcc00' : '#7aa7ff',
    });
  }

  private createTomeTooltipHtml(tome: TomeState): string {
    const power = tome.growth ?? tome.level;
    const rows: Array<[string, string]> = [];
    switch (tome.type) {
      case 'attack_speed_tome':
        rows.push([t('upgrade.stat.attackSpeed'), `+${formatTooltipPercent(0.10 * power)}`]);
        break;
      case 'life_tome':
        rows.push([t('upgrade.stat.maxHp'), `+${formatTooltipNumber(15 * power, 0)}`]);
        break;
      case 'consumable_tome':
        rows.push([t('upgrade.stat.consumableDrop'), `+${formatTooltipPercent(0.05 * power)}`]);
        break;
      case 'luck_tome':
        rows.push([t('upgrade.stat.luck'), `+${formatTooltipNumber(5 * power, 0)}`]);
        break;
      case 'thorns_tome':
        rows.push([t('upgrade.stat.thorns'), `${formatTooltipNumber(3 * power, 0)}`]);
        break;
      case 'shield_tome':
        rows.push([t('upgrade.stat.armor'), `+${formatTooltipNumber(2 * power, 0)}`]);
        rows.push([t('upgrade.stat.shieldReduction'), `+${formatTooltipPercent(0.05 * power)}`]);
        break;
      case 'xp_gain_tome':
        rows.push([t('upgrade.stat.xpGain'), `+${formatTooltipPercent(0.15 * power)}`]);
        break;
      case 'attraction_tome':
        rows.push([t('upgrade.stat.pickupRadius'), `+${formatTooltipNumber(1.2 * power, 1)}`]);
        break;
      case 'curse_tome':
        rows.push([t('upgrade.stat.curseSpawn'), `+${formatTooltipPercent(0.10 * power)}`]);
        rows.push([t('upgrade.stat.xpGain'), `+${formatTooltipPercent(0.20 * power)}`]);
        break;
      case 'precision_tome':
        rows.push([t('upgrade.stat.critChance'), `+${formatTooltipPercent(0.05 * power)}`]);
        rows.push([t('upgrade.stat.critDamage'), `+${formatTooltipPercent(0.10 * power)}`]);
        break;
      case 'knockback_tome':
        rows.push([t('upgrade.stat.knockback'), `+${formatTooltipPercent(0.30 * power)}`]);
        break;
      case 'speed_tome':
        rows.push([t('upgrade.stat.moveSpeed'), `+${formatTooltipPercent(0.08 * power)}`]);
        break;
    }

    return this.buildItemTooltipHtml({
      title: `${TOME_ICONS[tome.type] ?? '📖'} ${t(`upgrade.tome.${tome.type}`)}`,
      subtitle: `Lv.${tome.level}/${TOME_MAX_LEVELS[tome.type] ?? 8} · 强度 ${formatTooltipNumber(power, 1)}`,
      description: t(`upgrade.tome.${tome.type}_desc`),
      rows,
      accent: TOME_COLORS[tome.type] ?? '#aa88ff',
    });
  }

  private createRelicTooltipHtml(id: RelicId, stacks: number, state: GameState): string {
    const relic = RELICS[id];
    const rows: Array<[string, string]> = [];
    switch (id) {
      case 'keen_lens':
        rows.push([t('upgrade.stat.critChance'), `+${formatTooltipPercent(0.03 * stacks)}`]);
        break;
      case 'small_shield_charm':
        rows.push(['护盾值', `+${2 * stacks}`]);
        rows.push(['最大护盾', `+${5 * stacks}`]);
        break;
      case 'blood_fang':
        rows.push(['击杀回复', `${2 * stacks} HP`]);
        rows.push(['精英击杀回复', `${3 * stacks} HP`]);
        break;
      case 'pact_coin':
        rows.push(['击杀金币', `+${stacks}`]);
        break;
      case 'arsenal_badge': {
        const level10Weapons = state.player.weapons.filter(w => w.level >= 10).length;
        rows.push(['每把 Lv10 武器', `+${formatTooltipPercent(0.04 * stacks)} 伤害`]);
        rows.push(['当前总伤害', `+${formatTooltipPercent(level10Weapons * 0.04 * stacks)}`]);
        break;
      }
      case 'elite_writ':
        rows.push(['对精英伤害', `+${formatTooltipPercent(0.10 * stacks)}`]);
        break;
      case 'regen_core':
        rows.push(['生命恢复', `+${formatTooltipNumber(0.5 * stacks, 1)}/s`]);
        break;
      case 'magazine_expander':
        rows.push([t('upgrade.stat.projectiles'), `+${stacks}`]);
        break;
      case 'hourglass':
        rows.push(['Overtime 每秒全伤', `+${formatTooltipPercent(0.0012 * stacks, 2)}`]);
        if (state.overtimeSeconds > 0) {
          rows.push(['当前全伤', `+${formatTooltipPercent(state.overtimeSeconds * 0.0012 * stacks, 1)}`]);
        }
        break;
      case 'iron_heart':
        rows.push([t('upgrade.stat.maxHp'), `+${formatTooltipPercent(0.12 * stacks)}`]);
        rows.push([t('upgrade.stat.armor'), `+${2 * stacks}`]);
        break;
    }

    return this.buildItemTooltipHtml({
      title: `${relic.emoji} ${relic.name}`,
      subtitle: `${relic.rarity.toUpperCase()} · x${stacks}`,
      description: relic.description,
      rows,
      accent: RARITY_COLORS[relic.rarity] ?? '#aaaaaa',
    });
  }

  private createBondTooltipHtml(bondId: BondId, tier: BondTier, state: GameState): string {
    const def = BONDS[bondId];
    const player = state.player;
    const tierColor = BOND_TIER_COLORS[tier] ?? BOND_TIER_COLORS[1];
    const name = t(`bond.${bondId}.name`);
    const tierName = t(`bond.tier.${tier}`);

    // 武器：已获取正常显示（含等级），未获取黯淡
    const weaponRows = def.weapons.map((wt) => {
      const owned = player.weapons.find(w => w.type === wt);
      const wname = t(`upgrade.weapon.${wt}`);
      if (owned) {
        return `<div style="color:#e8e4ff;">• ${escapeTooltipText(wname)} <span style="color:#9aa0c0;">Lv.${owned.level}</span></div>`;
      }
      return `<div style="color:#65657c;">• ${escapeTooltipText(wname)}</div>`;
    }).join('');

    // 三档效果：已生效白色高亮，未生效灰色
    const effectRow = (n: BondTier): string => {
      const active = tier >= n;
      const textColor = active ? '#ffffff' : '#65657c';
      const badgeColor = active ? (BOND_TIER_COLORS[n] ?? '#cd7f32') : '#4a4a5a';
      const txt = t(`bond.${bondId}.t${n}`);
      return `<div style="display:flex;gap:6px;margin-top:4px;">
        <span style="flex-shrink:0;color:${badgeColor};font-weight:700;">T${n}</span>
        <span style="color:${textColor};">${escapeTooltipText(txt)}</span>
      </div>`;
    };

    const nextHtml = this.bondNextConditionHtml(bondId, tier, player);

    return `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
        <div style="width:7px;height:24px;border-radius:999px;background:${tierColor};box-shadow:0 0 12px ${tierColor}aa;"></div>
        <div>
          <div style="font-size:14px;font-weight:800;color:#fff;">${escapeTooltipText(def.icon)} ${escapeTooltipText(name)}</div>
          <div style="font-size:10px;color:${tierColor};font-weight:700;letter-spacing:0.4px;">${escapeTooltipText(tierName)} · T${tier}</div>
        </div>
      </div>
      <div style="color:#b9b4cc;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;margin:6px 0 2px;">${escapeTooltipText(t('bond.weaponsLabel'))}</div>
      ${weaponRows}
      <div style="color:#b9b4cc;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;margin:8px 0 0;">${escapeTooltipText(t('bond.effectsLabel'))}</div>
      ${effectRow(1 as BondTier)}${effectRow(2 as BondTier)}${effectRow(3 as BondTier)}
      <div style="border-top:1px solid rgba(255,255,255,0.12);margin-top:8px;padding-top:6px;">${nextHtml}</div>
    `;
  }

  private bondNextConditionHtml(bondId: BondId, tier: BondTier, player: GameState['player']): string {
    if (tier >= 3) {
      return `<span style="color:#ffcc00;font-weight:700;">${escapeTooltipText(t('bond.max'))}</span>`;
    }
    const def = BONDS[bondId];
    const th = bondThresholds(def.weapons.length);
    const counts = evalBondCounts(player, def);
    const toTier = (tier + 1) as BondTier;
    const lines: string[] = [];
    if (toTier === 1) {
      lines.push(t('bond.cond.weapons', { k: String(th.t1k), have: String(counts.k) }));
    } else if (toTier === 2) {
      lines.push(t('bond.cond.weapons', { k: String(th.t2k), have: String(counts.k) }));
      lines.push(t('bond.cond.sum', { sum: String(th.t2sum), have: String(counts.lSum) }));
    } else {
      lines.push(t('bond.cond.weapons', { k: String(th.t3k), have: String(counts.k) }));
      lines.push(t('bond.cond.sum', { sum: String(th.t3sum), have: String(counts.lSum) }));
      lines.push(t('bond.cond.min', { min: String(th.t3min), have: String(counts.lMin) }));
    }
    const header = t('bond.next', { tier: String(toTier) });
    const rows = lines.map(l => `<div style="color:#cfd3e8;">${escapeTooltipText(l)}</div>`).join('');
    return `<div style="color:#b9b4cc;font-weight:700;margin-bottom:2px;">${escapeTooltipText(header)}</div>${rows}`;
  }

  // ===========================================================================
  // Damage Numbers
  // ===========================================================================

  private spawnDamageNumber(evt: DamageEvent): void {
    const el = this.damageNums[this.damageNumIndex];
    this.damageNumIndex = (this.damageNumIndex + 1) % DAMAGE_NUM_POOL_SIZE;

    this._tempVec.set(evt.x, evt.y, evt.z);
    this._tempVec.project(this.camera);

    const hw = window.innerWidth / 2;
    const hh = window.innerHeight / 2;
    const screenX = this._tempVec.x * hw + hw;
    const screenY = -(this._tempVec.y * hh) + hh;

    let color = '#ffffff';
    if (evt.isShield) color = '#66ddff';
    else if (evt.isPlayerDamage) color = '#ff4444';
    else if (evt.isCrit) color = '#ffd700'; // gold for crits

    // Damage number scaling by value
    let fontSize = 14;
    if (evt.damage > 50) fontSize = 24;
    else if (evt.damage > 20) fontSize = 18;

    // Crits: 1.5x size + "CRIT!" suffix
    if (evt.isCrit) {
      fontSize = Math.round(fontSize * 1.5);
    }

    const dmgText = evt.isShield ? `+${Math.round(evt.damage)}` : String(Math.round(evt.damage));
    // Use GSAP for damage number animation
    gsapAnimations.showDamageNumber(el, {
      text: evt.isCrit ? `${dmgText} CRIT!` : dmgText,
      color: color,
      x: screenX,
      y: screenY,
      fontSize: fontSize,
      isCrit: evt.isCrit,
      damage: evt.damage
    });
  }

  // ===========================================================================
  // Upgrade Panel
  // ===========================================================================

  private handlePhaseChange(state: GameState): void {
    if (this.lastNoticeTier === null) {
      this.lastNoticeTier = state.tier;
    } else if (state.tier !== this.lastNoticeTier) {
      this.lastNoticeTier = state.tier;
      const cfg = TIER_CONFIGS[state.tier];
      this.showMajorNotice(
        t('tier.notice.title', { value: String(state.tier) }),
        t('tier.notice.body', {
          hp: cfg.enemyHpMultiplier.toFixed(1),
          damage: cfg.enemyDamageMultiplier.toFixed(1),
          speed: cfg.enemySpeedMultiplier.toFixed(1),
        }),
        TIER_COLORS[state.tier] ?? '#ffcc00',
      );
    }

    const isOvertime = state.overtimeSeconds > 0;
    if (isOvertime && !this.wasOvertime) {
      this.showMajorNotice(
        t('overtime.notice.title'),
        t('overtime.notice.body'),
        '#ff6600',
      );
    }
    this.wasOvertime = isOvertime;

    if (state.phase === 'level_up' && state.upgradeOptions && !this.upgradePanel) {
      this.showUpgradePanel(state.upgradeOptions);
    } else if (state.phase !== 'level_up' && this.upgradePanel) {
      this.hideUpgradePanel();
    }
    // Charge Shrine 4 选 1 panel
    this.handleShrinePhaseChange(state);
    this.handleChestRewardPhaseChange(state);
  }

  private showMajorNotice(titleText: string, bodyText: string, accentColor: string): void {
    if (this.majorNoticeTimer) {
      clearTimeout(this.majorNoticeTimer);
      this.majorNoticeTimer = null;
    }
    this.majorNoticeEl?.remove();

    const notice = document.createElement('div');
    notice.style.cssText = `
      position:fixed;left:50%;top:42%;transform:translate(-50%,-50%) scale(0.92);
      width:min(86vw,560px);padding:clamp(20px,5vw,34px);
      border:2px solid ${accentColor};border-radius:18px;
      background:radial-gradient(circle at 50% 0%, ${accentColor}33, rgba(8,8,18,0.94) 58%);
      box-shadow:0 0 34px ${accentColor}88,0 18px 70px rgba(0,0,0,0.68);
      color:#fff;text-align:center;pointer-events:none;z-index:260;opacity:0;
      transition:opacity 180ms ease,transform 220ms ease;
      font-family:Arial,sans-serif;box-sizing:border-box;
    `;

    const title = document.createElement('div');
    title.style.cssText = `color:${accentColor};font-size:clamp(28px,8vw,54px);font-weight:900;letter-spacing:2px;text-shadow:0 0 18px ${accentColor},0 3px 8px #000;`;
    title.textContent = titleText;

    const body = document.createElement('div');
    body.style.cssText = 'margin-top:12px;color:#f5f1ff;font-size:clamp(14px,3.8vw,20px);font-weight:700;line-height:1.45;text-shadow:0 2px 5px rgba(0,0,0,0.9);';
    body.textContent = bodyText;

    notice.appendChild(title);
    notice.appendChild(body);
    document.body.appendChild(notice);
    this.majorNoticeEl = notice;

    requestAnimationFrame(() => {
      notice.style.opacity = '1';
      notice.style.transform = 'translate(-50%,-50%) scale(1)';
    });

    this.majorNoticeTimer = setTimeout(() => {
      notice.style.opacity = '0';
      notice.style.transform = 'translate(-50%,-50%) scale(1.05)';
      this.majorNoticeTimer = setTimeout(() => {
        notice.remove();
        if (this.majorNoticeEl === notice) this.majorNoticeEl = null;
        this.majorNoticeTimer = null;
      }, 260);
    }, 2800);
  }

  private showUpgradePanel(options: UpgradeOption[]): void {
    // 面板打开 → 退出 pointer lock，鼠标恢复正常，方便点卡片选择升级
    this.cameraOrbit.setEnabled(false);
    const player = this.session.getRenderState().player;
    this.upgradePanel = document.createElement('div');
    this.upgradePanel.dataset.cameraBlock = 'true';
    this.upgradePanel.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:300;font-family:Arial,sans-serif;';

    const title = document.createElement('div');
    title.style.cssText = 'color:#ffcc00;font-size:24px;font-weight:bold;margin-bottom:20px;text-shadow:0 2px 4px rgba(0,0,0,0.8);';
    title.textContent = t('upgrade.title');
    this.upgradePanel.appendChild(title);

    const cardRow = document.createElement('div');
    cardRow.style.cssText = 'display:flex;gap:16px;flex-wrap:wrap;justify-content:center;padding:0 16px;max-width:100%;';

    // On narrow screens (<400px), force vertical layout
    if (window.innerWidth < 400) {
      cardRow.style.flexDirection = 'column';
      cardRow.style.alignItems = 'center';
    }

    for (const option of options) {
      const card = this.createUpgradeCard(option, player);
      cardRow.appendChild(card);
    }

    this.upgradePanel.appendChild(cardRow);
    document.body.appendChild(this.upgradePanel);
  }

  private createUpgradeCard(option: UpgradeOption, player: GameState['player']): HTMLDivElement {
    const card = document.createElement('div');
    const isBond = option.kind === 'bond_activate' || option.kind === 'bond_upgrade';
    // 羁绊卡片：发光金黄边框，与普通武器/典籍卡片区分
    const borderColor = isBond ? '#ffd633' : (RARITY_COLORS[option.rarity] ?? '#aaaaaa');
    const restShadow = isBond
      ? '0 0 18px rgba(255,210,40,0.65),0 4px 12px rgba(0,0,0,0.5)'
      : '0 4px 12px rgba(0,0,0,0.5)';
    const hoverShadow = isBond
      ? '0 0 26px rgba(255,210,40,0.9),0 6px 20px rgba(255,210,40,0.5)'
      : `0 6px 20px ${borderColor}44`;

    card.style.cssText = `
      width:160px;padding:16px;background:rgba(20,20,40,0.95);border:2px solid ${borderColor};
      border-radius:12px;cursor:pointer;text-align:center;transition:transform 0.15s,box-shadow 0.15s;
      box-shadow:${restShadow};
    `;

    card.addEventListener('mouseenter', () => {
      card.style.transform = 'scale(1.05)';
      card.style.boxShadow = hoverShadow;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'scale(1)';
      card.style.boxShadow = restShadow;
    });

    // Icon / Kind indicator
    const iconEl = document.createElement('div');
    iconEl.style.cssText = 'font-size:24px;margin-bottom:6px;';
    if (option.kind === 'new_weapon') iconEl.textContent = '⚔️';
    else if (option.kind === 'weapon_upgrade') iconEl.textContent = '⬆️';
    else if (option.kind === 'bond_activate' || option.kind === 'bond_upgrade') {
      iconEl.textContent = option.bondId ? BONDS[option.bondId].icon : '🔗';
    }
    else iconEl.textContent = '📖';
    card.appendChild(iconEl);

    // Name
    const nameEl = document.createElement('div');
    nameEl.style.cssText = `color:${borderColor};font-size:14px;font-weight:bold;margin-bottom:8px;`;
    nameEl.textContent = this.getUpgradeName(option);
    card.appendChild(nameEl);

    // Description
    const descEl = document.createElement('div');
    descEl.style.cssText = 'color:#cccccc;font-size:11px;margin-bottom:8px;line-height:1.35;';
    descEl.textContent = this.getUpgradeDesc(option);
    card.appendChild(descEl);

    // 数值预览（基础步进 × 稀有度 / 典籍每级增益）
    const previewLines = getUpgradePreviewLines(option, player);
    if (previewLines.length > 0) {
      const statsEl = document.createElement('div');
      statsEl.style.cssText = 'margin-bottom:8px;padding:6px 8px;background:rgba(255,255,255,0.06);border-radius:6px;text-align:left;';
      for (const line of previewLines) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;gap:6px;font-size:11px;line-height:1.5;';
        const label = document.createElement('span');
        label.style.color = '#9999aa';
        const key = line.labelKey.replace('upgrade.stat.', '');
        label.textContent = t(`upgrade.stat.${key}`);
        const val = document.createElement('span');
        val.style.cssText = `color:${borderColor};font-weight:bold;`;
        val.textContent = line.value;
        row.appendChild(label);
        row.appendChild(val);
        statsEl.appendChild(row);
      }
      card.appendChild(statsEl);
    }

    // Level info
    const levelEl = document.createElement('div');
    levelEl.style.cssText = 'color:#888888;font-size:11px;';
    levelEl.textContent = t('upgrade.levelUp', { from: String(option.currentLevel), to: String(option.newLevel) });
    card.appendChild(levelEl);

    // Rarity badge
    const rarityEl = document.createElement('div');
    rarityEl.style.cssText = `color:${borderColor};font-size:10px;text-transform:uppercase;margin-top:6px;letter-spacing:1px;`;
    rarityEl.textContent = option.rarity;
    card.appendChild(rarityEl);

    card.addEventListener('click', () => {
      this.session.selectUpgrade(option.id);
      // Immediately hide panel (don't wait for next game_update cycle)
      this.hideUpgradePanel();
    });

    return card;
  }

  private getUpgradeName(option: UpgradeOption): string {
    if (option.kind === 'new_weapon' || option.kind === 'weapon_upgrade') {
      return t(`upgrade.weapon.${option.weaponType}`);
    }
    if (option.kind === 'bond_activate' || option.kind === 'bond_upgrade') {
      const label = option.kind === 'bond_activate' ? t('bond.activate') : t('bond.upgrade');
      return option.bondId ? `${t(`bond.${option.bondId}.name`)} — ${label}` : label;
    }
    const tomeType = option.tomeType ?? option.passiveType;
    return t(`upgrade.tome.${tomeType}`);
  }

  private getUpgradeDesc(option: UpgradeOption): string {
    if (option.kind === 'new_weapon' || option.kind === 'weapon_upgrade') {
      return t(`upgrade.weapon.${option.weaponType}_desc`);
    }
    if (option.kind === 'bond_activate' || option.kind === 'bond_upgrade') {
      return option.bondId ? t(`bond.${option.bondId}.t${option.newLevel}`) : '';
    }
    const tomeType = option.tomeType ?? option.passiveType;
    return t(`upgrade.tome.${tomeType}_desc`);
  }

  private hideUpgradePanel(): void {
    this.upgradePanel?.remove();
    this.upgradePanel = null;
    // 面板关闭 → 恢复镜头输入；鼠标若已在画布上会自动重新获取 lock
    this.cameraOrbit.setEnabled(true);
  }

  // ===========================================================================
  // Game Over
  // ===========================================================================

  private showGameOver(result: GameResult): void {
    if (this.gameOverPanel) return;
    this.cameraOrbit.setEnabled(false);

    // Detect quests that newly reached completion this run (rewards must be claimed manually)
    const newQuests = checkQuestCompletion(this.questCompleteAtRunStart);

    this.gameOverPanel = document.createElement('div');
    this.gameOverPanel.dataset.cameraBlock = 'true';
    this.gameOverPanel.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:400;font-family:Arial,sans-serif;gap:12px;';

    const title = document.createElement('div');
    title.style.cssText = `font-size:40px;font-weight:bold;text-shadow:0 2px 8px rgba(0,0,0,0.9);color:${result.victory ? '#ffcc00' : '#ff4444'};`;
    title.textContent = result.victory ? t('result.victory') : t('result.defeat');
    this.gameOverPanel.appendChild(title);

    const statsContainer = document.createElement('div');
    statsContainer.style.cssText = 'display:flex;flex-direction:column;gap:6px;align-items:center;margin:16px 0;';

    const totalSec = Math.floor(result.survivalTime);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    const timeStr = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;

    const lines = [
      t('result.time', { time: timeStr }),
      t('result.kills', { count: String(result.killCount) }),
      t('result.level', { level: String(result.level) }),
    ];

    // Show quest completions if any
    if (newQuests.length > 0) {
      lines.push(t('result.quests', { count: String(newQuests.length) }));
    }

    for (const line of lines) {
      const el = document.createElement('div');
      el.style.cssText = 'color:#cccccc;font-size:14px;';
      el.textContent = line;
      statsContainer.appendChild(el);
    }

    const silverRow = document.createElement('div');
    silverRow.style.cssText = 'display:flex;justify-content:center;margin-top:2px;';
    silverRow.appendChild(createSilverBadge(result.silverEarned));
    statsContainer.appendChild(silverRow);

    if (newQuests.length > 0) {
      const questHeader = document.createElement('div');
      questHeader.style.cssText = 'color:#ffcc00;font-size:13px;font-weight:bold;margin-top:8px;';
      questHeader.textContent = t('quest.ready_to_claim');
      statsContainer.appendChild(questHeader);

      for (const qId of newQuests) {
        const quest = QUESTS.find(q => q.id === qId);
        if (!quest) continue;
        const el = document.createElement('div');
        el.style.cssText = 'color:#88ff88;font-size:12px;';
        el.textContent = t(quest.description);
        statsContainer.appendChild(el);
      }
    }

    this.gameOverPanel.appendChild(statsContainer);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:16px;margin-top:12px;';

    const retryBtn = document.createElement('div');
    retryBtn.style.cssText = 'padding:10px 24px;background:#44aa44;color:#ffffff;font-size:16px;font-weight:bold;border-radius:8px;cursor:pointer;user-select:none;';
    retryBtn.textContent = t('result.retry');
    retryBtn.addEventListener('click', () => {
      this.hideGameOver();
      this.session.restart();
    });
    btnRow.appendChild(retryBtn);

    const menuBtn = document.createElement('div');
    menuBtn.style.cssText = 'padding:10px 24px;background:#555566;color:#ffffff;font-size:16px;font-weight:bold;border-radius:8px;cursor:pointer;user-select:none;';
    menuBtn.textContent = t('result.menu');
    menuBtn.addEventListener('click', () => {
      this.hideGameOver();
      this.destroy();
      showMainMenu();
    });
    btnRow.appendChild(menuBtn);

    this.gameOverPanel.appendChild(btnRow);
    document.body.appendChild(this.gameOverPanel);
  }

  private hideGameOver(): void {
    this.gameOverPanel?.remove();
    this.gameOverPanel = null;
    this.cameraOrbit.setEnabled(true);
  }

  // ===========================================================================
  // Pause
  // ===========================================================================

  private togglePause(): void {
    if (this.isPaused) {
      this.resumeGame();
    } else {
      this.session.pause();
      this.isPaused = true;
      this.pauseBtn.textContent = '▶';
      this.cameraOrbit.setEnabled(false);
      this.showPauseMenu();
    }
  }

  /** 关闭暂停菜单并继续游戏。 */
  private resumeGame(): void {
    this.hidePauseMenu();
    this.session.resume();
    this.isPaused = false;
    this.pauseBtn.textContent = t('hud.pause');
    this.cameraOrbit.setEnabled(true);
  }

  private hidePauseMenu(): void {
    this.pausePanel?.remove();
    this.pausePanel = null;
    this.hideItemTooltip();
  }

  /**
   * 暂停弹窗：左侧背包（武器 / 典籍 / 遗物），右侧人物属性，底部操作按钮。
   * 窄屏（flex-wrap）自动转单列；内容过高时整列可滚动。
   */
  private showPauseMenu(): void {
    if (this.pausePanel) return;

    const state = this.session.getRenderState();

    const overlay = document.createElement('div');
    overlay.dataset.cameraBlock = 'true';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.84);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:420;font-family:Arial,sans-serif;padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));box-sizing:border-box;overflow:hidden;';
    this.installItemTooltipHandlers(overlay);

    const panel = document.createElement('div');
    panel.style.cssText = 'width:min(96vw,880px);max-height:100%;display:flex;flex-direction:column;gap:clamp(10px,2.2vh,16px);box-sizing:border-box;';

    const title = document.createElement('div');
    title.style.cssText = 'flex:0 0 auto;text-align:center;color:#ffffff;font-size:clamp(24px,6vw,38px);font-weight:bold;text-shadow:0 2px 8px rgba(0,0,0,0.9);';
    title.textContent = t('pause.title');
    panel.appendChild(title);

    const makeBtn = (label: string, bg: string, onClick: () => void): HTMLDivElement => {
      const btn = document.createElement('div');
      btn.dataset.cameraBlock = 'true';
      btn.style.cssText = `width:100%;max-width:260px;min-height:48px;display:flex;align-items:center;justify-content:center;padding:12px 20px;background:${bg};color:#ffffff;font-size:clamp(15px,4vw,18px);font-weight:bold;border-radius:10px;cursor:pointer;pointer-events:auto;user-select:none;touch-action:manipulation;box-sizing:border-box;text-align:center;`;
      btn.textContent = label;
      btn.addEventListener('click', (ev) => { ev.stopPropagation(); onClick(); });
      return btn;
    };

    // 三列：左背包 / 中按钮 / 右属性（窄屏 flex-wrap 自动竖排）。
    const contentRow = document.createElement('div');
    contentRow.style.cssText = 'flex:1 1 auto;min-height:0;display:flex;flex-wrap:wrap;gap:clamp(8px,2vw,14px);align-items:stretch;justify-content:center;overflow-y:auto;';

    const left = this.buildPauseInventory(state);
    left.style.cssText += 'flex:2 1 300px;min-width:min(100%,280px);';

    const middle = document.createElement('div');
    middle.style.cssText = 'flex:0 1 200px;min-width:min(100%,170px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:clamp(10px,2vh,16px);';
    middle.appendChild(makeBtn(t('pause.resume'), '#44aa44', () => this.resumeGame()));
    middle.appendChild(makeBtn(t('pause.restart'), '#555566', () => this.restartGame()));
    middle.appendChild(makeBtn(t('pause.exit'), '#aa5544', () => this.showExitConfirm(overlay)));

    const right = this.buildPauseStats(state);
    right.style.cssText += 'flex:1 1 220px;min-width:min(100%,220px);';

    contentRow.appendChild(left);
    contentRow.appendChild(middle);
    contentRow.appendChild(right);
    panel.appendChild(contentRow);

    overlay.appendChild(panel);
    this.pausePanel = overlay;
    document.body.appendChild(overlay);
  }

  /** 暂停面板左侧：背包（武器 / 典籍 / 遗物，均为本局获得）。 */
  private buildPauseInventory(state: GameState): HTMLDivElement {
    const p = state.player;
    const card = document.createElement('div');
    card.style.cssText = 'background:linear-gradient(180deg,rgba(28,28,44,0.92),rgba(16,16,28,0.92));border:1px solid rgba(255,255,255,0.14);border-radius:14px;padding:clamp(12px,2.5vw,18px);box-sizing:border-box;display:flex;flex-direction:column;gap:clamp(10px,2vh,16px);';

    const header = document.createElement('div');
    header.style.cssText = 'color:#ffd97a;font-size:clamp(16px,4vw,20px);font-weight:bold;text-shadow:0 1px 3px rgba(0,0,0,0.8);';
    header.textContent = t('pause.inventory');
    card.appendChild(header);

    card.appendChild(this.buildPauseItemSection(
      t('pause.weapons'),
      p.weapons.map(w => ({
        icon: WEAPON_ICONS[w.type] ?? '?',
        name: t(`upgrade.weapon.${w.type}`),
        inner: `Lv.${w.level}`,
        accent: w.evolved ? '#ffcc00' : '#7aa7ff',
        tooltipHtml: this.createWeaponTooltipHtml(w),
      })),
    ));

    card.appendChild(this.buildPauseItemSection(
      t('pause.tomes'),
      p.tomes.map(tm => ({
        icon: TOME_ICONS[tm.type] ?? '📖',
        name: t(`upgrade.tome.${tm.type}`),
        inner: `Lv.${tm.level}`,
        accent: TOME_COLORS[tm.type] ?? '#aa88ff',
        tooltipHtml: this.createTomeTooltipHtml(tm),
      })),
    ));

    const relics = (Object.entries(p.relicStacks ?? {}) as Array<[RelicId, number]>)
      .filter(([id, count]) => count > 0 && RELICS[id]);
    card.appendChild(this.buildPauseItemSection(
      t('pause.relics'),
      relics.map(([id, count]) => ({
        icon: RELICS[id].emoji,
        name: RELICS[id].name,
        inner: `x${count}`,
        accent: RARITY_COLORS[RELICS[id].rarity] ?? '#aaaaaa',
        tooltipHtml: this.createRelicTooltipHtml(id, count, state),
      })),
    ));

    card.appendChild(this.buildPauseItemSection(
      t('pause.bonds'),
      (p.bonds ?? []).map(bond => ({
        icon: BONDS[bond.bondId]?.icon ?? '✦',
        name: t(`bond.${bond.bondId}.name`),
        inner: `T${bond.tier}`,
        accent: BOND_TIER_COLORS[bond.tier] ?? BOND_TIER_COLORS[1],
        tooltipHtml: this.createBondTooltipHtml(bond.bondId, bond.tier, state),
      })),
    ));

    return card;
  }

  /**
   * 背包内一个分组（武器 / 典籍 / 遗物）：标题 + 槽位流式排列。
   * 每个槽位与局内一致：单独图标，图标内部下方显示等级（Lv.N）/层数（xN），图标下方再显示名字。
   */
  private buildPauseItemSection(
    titleText: string,
    items: Array<{ icon: string; name: string; inner: string; accent: string; tooltipHtml?: string }>,
  ): HTMLDivElement {
    const section = document.createElement('div');
    section.style.cssText = 'display:flex;flex-direction:column;gap:6px;';

    const label = document.createElement('div');
    label.style.cssText = 'color:#cfd2e0;font-size:clamp(12px,3vw,15px);font-weight:bold;opacity:0.85;';
    label.textContent = titleText;
    section.appendChild(label);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:clamp(8px,2vw,12px);';

    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color:#888;font-size:clamp(11px,2.8vw,13px);padding:4px 2px;';
      empty.textContent = t('pause.empty');
      row.appendChild(empty);
    } else {
      for (const it of items) {
        const cell = document.createElement('div');
        cell.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px;width:clamp(48px,13vw,58px);cursor:help;touch-action:manipulation;';
        if (it.tooltipHtml) {
          this.setItemTooltip(cell, it.tooltipHtml);
        }

        const box = document.createElement('div');
        box.style.cssText = `position:relative;width:clamp(44px,12vw,52px);height:clamp(44px,12vw,52px);background:rgba(0,0,0,0.55);border:2px solid ${it.accent};border-radius:8px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 8px ${it.accent}40;box-sizing:border-box;`;
        const icon = document.createElement('span');
        icon.style.cssText = 'font-size:clamp(20px,5.5vw,26px);line-height:1;';
        icon.textContent = it.icon;
        box.appendChild(icon);
        const inner = document.createElement('span');
        inner.style.cssText = 'position:absolute;bottom:-1px;left:0;right:0;text-align:center;font-size:9px;font-weight:bold;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.95);';
        inner.textContent = it.inner;
        box.appendChild(inner);
        cell.appendChild(box);

        const name = document.createElement('span');
        name.style.cssText = 'width:100%;text-align:center;color:#dfe3f0;font-size:clamp(9px,2.4vw,11px);line-height:1.15;word-break:break-word;';
        name.textContent = it.name;
        cell.appendChild(name);

        row.appendChild(cell);
      }
    }
    section.appendChild(row);
    return section;
  }

  /** 暂停面板右侧：当前人物属性一览。 */
  private buildPauseStats(state: GameState): HTMLDivElement {
    const p = state.player;
    const card = document.createElement('div');
    card.style.cssText = 'background:linear-gradient(180deg,rgba(28,28,44,0.92),rgba(16,16,28,0.92));border:1px solid rgba(255,255,255,0.14);border-radius:14px;padding:clamp(12px,2.5vw,18px);box-sizing:border-box;display:flex;flex-direction:column;gap:clamp(6px,1.4vh,10px);';

    const header = document.createElement('div');
    header.style.cssText = 'color:#7affc0;font-size:clamp(16px,4vw,20px);font-weight:bold;text-shadow:0 1px 3px rgba(0,0,0,0.8);';
    header.textContent = t('pause.attributes');
    card.appendChild(header);

    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const num1 = (v: number) => formatTooltipNumber(v, 1);

    const rows: Array<[string, string]> = [
      [t('pause.attr.maxHp'), `${Math.round(p.hp)} / ${Math.round(p.maxHp)}`],
      [t('pause.attr.shield'), `${Math.round(p.shield ?? 0)} / ${Math.round(p.maxShield ?? 0)}`],
      [t('pause.attr.damage'), `${num1(p.damageMultiplier)}x`],
      [t('pause.attr.attackSpeed'), `${num1(p.attackSpeedMultiplier)}x`],
      [t('pause.attr.critChance'), pct(p.critChance)],
      [t('pause.attr.critDamage'), pct(p.critDamage)],
      [t('pause.attr.armor'), String(Math.round(p.armor))],
      [t('pause.attr.moveSpeed'), num1(p.speed)],
      [t('pause.attr.pickupRadius'), num1(p.pickupRadius)],
      [t('pause.attr.projectileBonus'), `+${p.projectileBonus ?? 0}`],
    ];

    for (const [labelText, valueText] of rows) {
      const r = document.createElement('div');
      r.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;padding:5px 2px;border-bottom:1px solid rgba(255,255,255,0.07);';
      const l = document.createElement('span');
      l.style.cssText = 'color:#cfd2e0;font-size:clamp(12px,3vw,14px);';
      l.textContent = labelText;
      const v = document.createElement('span');
      v.style.cssText = 'color:#fff;font-size:clamp(12px,3vw,15px);font-weight:bold;font-variant-numeric:tabular-nums;white-space:nowrap;';
      v.textContent = valueText;
      r.appendChild(l);
      r.appendChild(v);
      card.appendChild(r);
    }

    return card;
  }

  /** 重新开始：清空所有游戏状态，重开本局。 */
  private restartGame(): void {
    this.hidePauseMenu();
    this.isPaused = false;
    this.pauseBtn.textContent = t('hud.pause');
    this.cameraOrbit.setEnabled(true);
    this.lastNoticeTier = null;
    this.wasOvertime = false;
    this.session.restart();
  }

  /** 退出二级确认弹窗：取消 / 退出（不结算奖励，回主菜单）。 */
  private showExitConfirm(parent: HTMLElement): void {
    const confirm = document.createElement('div');
    confirm.dataset.cameraBlock = 'true';
    confirm.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:clamp(12px,3vh,20px);padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);box-sizing:border-box;';

    const box = document.createElement('div');
    box.style.cssText = 'width:min(86vw,360px);background:linear-gradient(180deg,rgba(28,28,44,0.98),rgba(14,14,24,0.98));border:1px solid rgba(255,255,255,0.18);border-radius:14px;box-shadow:0 16px 44px rgba(0,0,0,0.6);padding:clamp(18px,4vw,26px);display:flex;flex-direction:column;align-items:center;gap:clamp(14px,3vh,22px);box-sizing:border-box;';

    const msg = document.createElement('div');
    msg.style.cssText = 'color:#f0e6e6;font-size:clamp(13px,3.6vw,16px);font-weight:600;line-height:1.5;text-align:center;';
    msg.textContent = t('pause.confirmExitMessage');
    box.appendChild(msg);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:12px;width:100%;justify-content:center;flex-wrap:wrap;';

    const cancelBtn = document.createElement('div');
    cancelBtn.dataset.cameraBlock = 'true';
    cancelBtn.style.cssText = 'flex:1;min-width:110px;min-height:46px;display:flex;align-items:center;justify-content:center;padding:10px 18px;background:#555566;color:#fff;font-size:clamp(14px,3.8vw,16px);font-weight:bold;border-radius:9px;cursor:pointer;pointer-events:auto;user-select:none;touch-action:manipulation;box-sizing:border-box;';
    cancelBtn.textContent = t('pause.cancel');
    cancelBtn.addEventListener('click', (ev) => { ev.stopPropagation(); confirm.remove(); });
    row.appendChild(cancelBtn);

    const exitBtn = document.createElement('div');
    exitBtn.dataset.cameraBlock = 'true';
    exitBtn.style.cssText = 'flex:1;min-width:110px;min-height:46px;display:flex;align-items:center;justify-content:center;padding:10px 18px;background:#cc3322;color:#fff;font-size:clamp(14px,3.8vw,16px);font-weight:bold;border-radius:9px;cursor:pointer;pointer-events:auto;user-select:none;touch-action:manipulation;box-sizing:border-box;';
    exitBtn.textContent = t('pause.exit');
    exitBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      // 退出本局：不结算奖励，直接销毁并回主菜单
      this.hidePauseMenu();
      this.destroy();
      showMainMenu();
    });
    row.appendChild(exitBtn);

    box.appendChild(row);
    confirm.appendChild(box);
    parent.appendChild(confirm);
  }

  setTierBadge(tier: DifficultyTier): void {
    const color = TIER_COLORS[tier] ?? '#aaa';
    this.tierBadge.textContent = t(`tier.${tier}`);
    this.tierBadge.style.borderColor = color;
    this.tierBadge.style.color = color;
  }

  setStageBadge(stage: GameState['stage']): void {
    this.stageBadge.textContent = stage === 2 ? 'II' : 'I';
  }
}

// =============================================================================
// Character Selection
// =============================================================================

let selectedCharacter: CharacterType = 'megachad';
let selectedTier: DifficultyTier = 1;

const CHARACTER_ORDER: CharacterType[] = ['megachad', 'roberto', 'skateboard_skeleton'];

const PREP_SCREEN_STYLE = `
  position:fixed;top:0;left:0;width:100%;height:100%;box-sizing:border-box;
  z-index:550;font-family:Arial,sans-serif;
  background:#0a0a1a url(${LOBBY_BG_PATH}) center center/cover no-repeat;
  padding-top:env(safe-area-inset-top,0px);
  padding-bottom:env(safe-area-inset-bottom,0px);
  padding-left:env(safe-area-inset-left,0px);
  padding-right:env(safe-area-inset-right,0px);
`;

const PREP_SCREEN_HEADER_STYLE = `
  display:flex;align-items:center;justify-content:space-between;width:100%;flex-shrink:0;
  padding:10px 14px;box-sizing:border-box;z-index:2;
`;

/** 预备界面（英雄/难度选择）的固定设计尺寸：横屏锚定，不随屏幕放大、不换行重排 */
const PREP_STAGE_WIDTH = 860;
const PREP_STAGE_HEIGHT = 450;
const PREP_STAGE_STYLE = `
  flex:1;min-height:0;width:100%;display:flex;align-items:center;justify-content:center;
  padding:0 14px 14px;box-sizing:border-box;overflow:auto;
`;
const PREP_STAGE_BODY_STYLE = `
  width:${PREP_STAGE_WIDTH}px;height:${PREP_STAGE_HEIGHT}px;max-width:100%;max-height:100%;
  box-sizing:border-box;
`;

function createPrepBackButton(onClick: () => void): HTMLButtonElement {
  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.setAttribute('aria-label', t('characterSelect.back'));
  backBtn.style.cssText = `
    min-width:44px;min-height:44px;padding:0;border:none;background:transparent;cursor:pointer;
    touch-action:manipulation;display:flex;align-items:center;justify-content:center;flex-shrink:0;
    transition:transform 0.15s;
  `;
  const backImg = document.createElement('img');
  backImg.src = CHARACTER_SELECT_BACK_ICON;
  backImg.alt = '';
  backImg.draggable = false;
  backImg.style.cssText = 'width:44px;height:44px;object-fit:contain;pointer-events:none;';
  backBtn.appendChild(backImg);
  backBtn.addEventListener('mouseenter', () => { backBtn.style.transform = 'scale(1.05)'; });
  backBtn.addEventListener('mouseleave', () => { backBtn.style.transform = 'scale(1)'; });
  backBtn.addEventListener('click', onClick);
  return backBtn;
}

const PREP_SCREEN_TITLE_STYLE = `
  font-size:clamp(18px,5vw,24px);font-weight:bold;color:#ffffff;
  text-shadow:0 2px 4px rgba(0,0,0,0.5);white-space:nowrap;
`;

function createPrepScreenHeader(
  title: string,
  onBack: () => void,
  rightContent: HTMLElement,
): HTMLElement {
  const header = document.createElement('header');
  header.style.cssText = PREP_SCREEN_HEADER_STYLE;

  const leftGroup = document.createElement('div');
  leftGroup.style.cssText = 'display:flex;align-items:center;gap:6px;min-width:0;';
  leftGroup.appendChild(createPrepBackButton(onBack));
  const titleEl = document.createElement('span');
  titleEl.style.cssText = PREP_SCREEN_TITLE_STYLE;
  titleEl.textContent = title;
  leftGroup.appendChild(titleEl);
  header.appendChild(leftGroup);

  header.appendChild(rightContent);
  return header;
}

const SHOP_OVERLAY_STYLE = `
  position:fixed;top:0;left:0;width:100%;height:100%;box-sizing:border-box;
  background:#0a0a1a url(${SHOP_BG_PATH}) center center/cover no-repeat;
  display:flex;align-items:center;justify-content:center;
  z-index:600;font-family:Arial,sans-serif;
  padding-top:env(safe-area-inset-top,0px);
  padding-bottom:env(safe-area-inset-bottom,0px);
  padding-left:env(safe-area-inset-left,0px);
  padding-right:env(safe-area-inset-right,0px);
`;

const QUESTS_OVERLAY_STYLE = `
  position:fixed;top:0;left:0;width:100%;height:100%;box-sizing:border-box;
  background:#0a0a1a url(${QUESTS_BG_PATH}) center center/cover no-repeat;
  display:flex;flex-direction:column;
  z-index:600;font-family:Arial,sans-serif;
  padding-top:env(safe-area-inset-top,0px);
  padding-bottom:env(safe-area-inset-bottom,0px);
  padding-left:env(safe-area-inset-left,0px);
  padding-right:env(safe-area-inset-right,0px);
`;

function characterColorHex(char: CharacterType): string {
  const charColor = CHARACTER_COLORS[char] ?? 0xa8e6cf;
  return `#${charColor.toString(16).padStart(6, '0')}`;
}

let characterSelectSlotsHost: HTMLElement | null = null;
let characterSelectPreviewHost: HTMLElement | null = null;
let characterSelectDetailHost: HTMLElement | null = null;
let characterSelectBodyEl: HTMLElement | null = null;
let characterSelectResizeHandler: (() => void) | null = null;

/** 详情面板高度与立绘灰色背景对齐，内容过高时等比缩小，禁止滚动 */
function syncCharacterSelectDetailLayout(): void {
  const stage = characterSelectPreviewHost?.firstElementChild as HTMLElement | null;
  const host = characterSelectDetailHost;
  const card = host?.querySelector('[data-region="detail-card"]') as HTMLElement | null;
  const scaleOuter = card?.querySelector('[data-region="detail-scale"]') as HTMLElement | null;
  const contentWrap = card?.querySelector('[data-region="detail-content"]') as HTMLElement | null;
  const confirmSection = card?.querySelector('[data-region="detail-confirm"]') as HTMLElement | null;
  if (!stage || !host || !card || !scaleOuter || !contentWrap || !confirmSection) return;

  const stageHeight = stage.getBoundingClientRect().height;
  if (stageHeight <= 0) return;

  host.style.height = `${Math.round(stageHeight)}px`;
  host.style.overflow = 'hidden';

  card.style.height = `${Math.round(stageHeight)}px`;
  card.style.width = '100%';

  contentWrap.style.transform = 'none';
  contentWrap.style.width = '100%';
  contentWrap.style.maxWidth = '100%';

  const cardStyles = getComputedStyle(card);
  const padT = parseFloat(cardStyles.paddingTop) || 0;
  const padB = parseFloat(cardStyles.paddingBottom) || 0;
  const confirmStyles = getComputedStyle(confirmSection);
  const confirmBlock =
    confirmSection.offsetHeight
    + (parseFloat(confirmStyles.marginTop) || 0)
    + (parseFloat(confirmStyles.marginBottom) || 0);
  const available = stageHeight - padT - padB - confirmBlock;
  const contentHeight = contentWrap.scrollHeight;

  if (contentHeight > available + 0.5) {
    const scale = available / contentHeight;
    contentWrap.style.transformOrigin = 'top center';
    contentWrap.style.transform = `scale(${scale})`;
    contentWrap.style.width = `${(100 / scale).toFixed(4)}%`;
    contentWrap.style.maxWidth = `${(100 / scale).toFixed(4)}%`;
  }
}

function scheduleCharacterSelectDetailLayout(): void {
  requestAnimationFrame(() => {
    syncCharacterSelectDetailLayout();
  });
}

function mountCharacterSelectSlots(host: HTMLElement): void {
  host.replaceChildren();

  for (const char of CHARACTER_ORDER) {
    const isSelected = char === selectedCharacter;
    const frames = CHARACTER_AVATAR_FRAMES[char];

    const slot = document.createElement('div');
    slot.style.cssText = `
      position:relative;width:64px;min-width:44px;min-height:44px;
      cursor:pointer;flex-shrink:0;transition:transform 0.15s;
      touch-action:manipulation;user-select:none;
    `;

    const frameImg = document.createElement('img');
    frameImg.src = isSelected ? frames.selected : frames.normal;
    frameImg.alt = '';
    frameImg.draggable = false;
    frameImg.style.cssText = 'width:100%;height:auto;display:block;pointer-events:none;';

    const icon = document.createElement('img');
    icon.src = CHARACTER_AVATAR_PATHS[char];
    icon.alt = t(`character.${char}`);
    icon.draggable = false;
    icon.style.cssText = `
      position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
      width:74%;height:74%;object-fit:cover;border-radius:6px;pointer-events:none;
    `;

    slot.appendChild(frameImg);
    slot.appendChild(icon);

    slot.addEventListener('click', () => {
      selectedCharacter = char;
      mountCharacterSelectSlots(host);
      refreshCharacterSelectUI();
    });
    slot.addEventListener('mouseenter', () => { slot.style.transform = 'scale(1.05)'; });
    slot.addEventListener('mouseleave', () => { slot.style.transform = 'scale(1)'; });

    host.appendChild(slot);
  }
}

function createShopBuyButton(cost: number, affordable: boolean, onClick?: () => void): HTMLDivElement {
  const btn = document.createElement('div');
  btn.style.cssText = `
    position:relative;width:100%;max-width:100%;
    cursor:${affordable ? 'pointer' : 'default'};user-select:none;
    touch-action:manipulation;transition:transform 0.15s;
  `;

  const frame = document.createElement('img');
  frame.src = SHOP_BUY_BUTTON_FRAME;
  frame.alt = '';
  frame.draggable = false;
  frame.style.cssText = 'display:block;width:100%;height:auto;pointer-events:none;';

  const content = document.createElement('div');
  content.style.cssText = `
    position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
    gap:clamp(1px,0.4vw,3px);padding:0 clamp(2px,0.6vw,5px);box-sizing:border-box;
    pointer-events:none;
  `;

  const coin = document.createElement('img');
  coin.src = SILVER_COIN_ICON_PATH;
  coin.alt = '';
  coin.draggable = false;
  coin.style.cssText = 'height:62%;width:auto;aspect-ratio:1/1;object-fit:contain;flex-shrink:0;';

  const amount = document.createElement('span');
  amount.style.cssText = 'color:#ffffff;font-size:clamp(8px,2.6vw,12px);font-weight:bold;line-height:1;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,0.35);';
  amount.textContent = String(cost);

  content.appendChild(coin);
  content.appendChild(amount);
  btn.appendChild(frame);
  btn.appendChild(content);

  if (affordable && onClick) {
    btn.addEventListener('click', onClick);
    btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.05)'; });
    btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; });
  }

  return btn;
}

function createShopMaxedButton(): HTMLDivElement {
  const btn = document.createElement('div');
  btn.style.cssText = 'position:relative;width:100%;max-width:100%;user-select:none;';

  const frame = document.createElement('img');
  frame.src = SHOP_BUY_BUTTON_PRESSED_FRAME;
  frame.alt = '';
  frame.draggable = false;
  frame.style.cssText = 'display:block;width:100%;height:auto;pointer-events:none;';

  const label = document.createElement('span');
  label.style.cssText = `
    position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
    color:#ffffff;font-size:clamp(7px,2.2vw,11px);font-weight:bold;line-height:1;
    white-space:nowrap;pointer-events:none;text-shadow:0 1px 2px rgba(0,0,0,0.35);
  `;
  label.textContent = t('shop.maxed');

  btn.appendChild(frame);
  btn.appendChild(label);
  return btn;
}

function createCharacterConfirmButton(label: string, onClick: () => void): HTMLDivElement {
  const btn = document.createElement('div');
  btn.dataset.action = 'confirm';
  btn.style.cssText = `
    position:relative;width:${CHARACTER_CONFIRM_BUTTON_WIDTH};min-width:44px;max-width:100%;
    cursor:pointer;user-select:none;touch-action:manipulation;transition:transform 0.15s;
  `;

  const frame = document.createElement('img');
  frame.src = CHARACTER_CONFIRM_BUTTON_FRAME;
  frame.alt = '';
  frame.draggable = false;
  frame.style.cssText = 'display:block;width:100%;height:auto;pointer-events:none;';

  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  labelEl.style.cssText = `
    position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
    color:#ffffff;font-size:clamp(12px,2.8vw,13px);font-weight:bold;line-height:1.2;
    pointer-events:none;text-shadow:0 1px 2px rgba(0,0,0,0.35);
  `;

  btn.appendChild(frame);
  btn.appendChild(labelEl);
  btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.05)'; });
  btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; });
  btn.addEventListener('click', onClick);
  return btn;
}

function createCharacterStatBar(label: string, valueText: string, ratio: number, textColor: string): HTMLElement {
  const pct = Math.min(100, Math.max(0, ratio * 100));

  const row = document.createElement('div');
  row.style.cssText = `
    display:flex;align-items:center;gap:10px;
    font-size:clamp(10px,2.2vw,12px);margin:3px 0;width:100%;
  `;

  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  labelEl.style.cssText = `
    flex:0 0 72px;color:${textColor};font-weight:600;flex-shrink:0;
  `;

  const track = document.createElement('div');
  track.style.cssText = `
    flex:1;height:8px;background:${STAT_BAR_TRACK_BG};
    border-radius:4px;overflow:hidden;min-width:0;
  `;

  const fill = document.createElement('div');
  fill.style.cssText = `
    height:100%;width:${pct}%;background:${STAT_BAR_FILL};border-radius:4px;
    transition:width 0.2s ease;
  `;
  track.appendChild(fill);

  const valEl = document.createElement('span');
  valEl.textContent = valueText;
  valEl.style.cssText = `
    flex:0 0 52px;text-align:right;color:${textColor};
    font-weight:600;font-variant-numeric:tabular-nums;flex-shrink:0;
  `;

  row.appendChild(labelEl);
  row.appendChild(track);
  row.appendChild(valEl);
  return row;
}

function formatWeaponStatLines(weaponType: string): string[] {
  const stats = WEAPON_STATS[weaponType]?.[0];
  if (!stats) return [];

  const lines: string[] = [
    t('characterSelect.weaponStat.damage', { value: String(stats.damage) }),
    t('characterSelect.weaponStat.cooldown', { value: String(stats.cooldown) }),
  ];
  if (stats.projectileCount > 1) {
    lines.push(t('characterSelect.weaponStat.projectiles', { value: String(stats.projectileCount) }));
  }
  if (stats.bounces > 0) {
    lines.push(t('characterSelect.weaponStat.bounces', { value: String(stats.bounces) }));
  }
  if (stats.chains > 0) {
    lines.push(t('characterSelect.weaponStat.chains', { value: String(stats.chains) }));
  }
  if (stats.range > 0) {
    lines.push(t('characterSelect.weaponStat.range', { value: String(stats.range) }));
  }
  if (stats.aoeRadius > 0 && stats.aoeRadius !== stats.range) {
    lines.push(t('characterSelect.weaponStat.aoe', { value: String(stats.aoeRadius) }));
  }
  return lines;
}

function refreshCharacterSelectDetail(): void {
  if (!characterSelectDetailHost) return;

  const id = selectedCharacter;
  const cfg = CHARACTER_CONFIGS[id];
  const weapon = cfg.startingWeapon;
  const textColor = CHARACTER_DETAIL_TEXT_COLOR;
  const detailFont = (size: string, extra = '') =>
    `margin:0;color:${textColor};font-size:${size};line-height:1.45;${extra}`;

  const { pad, sectionGap, weaponPad, weaponPanelWidth, confirmGap } = CHARACTER_DETAIL_LAYOUT;

  const card = document.createElement('div');
  card.dataset.region = 'detail-card';
  card.style.cssText = `
    width:100%;max-width:100%;height:100%;box-sizing:border-box;
    display:flex;flex-direction:column;align-items:stretch;overflow:hidden;
    background:url(${CHARACTER_DETAIL_PANEL_BG}) center center/100% 100% no-repeat;
    padding:${characterDetailInsetYPct(pad.top)} ${characterDetailInsetXPct(pad.x)}
      ${characterDetailInsetYPct(pad.bottom)} ${characterDetailInsetXPct(pad.x)};
    filter:drop-shadow(0 4px 16px rgba(0,40,80,0.15));color:${textColor};
  `;

  const scaleOuter = document.createElement('div');
  scaleOuter.dataset.region = 'detail-scale';
  scaleOuter.style.cssText = `
    width:100%;flex:1 1 auto;min-height:0;box-sizing:border-box;
    display:flex;justify-content:center;align-items:flex-start;overflow:hidden;
  `;

  const contentWrap = document.createElement('div');
  contentWrap.dataset.region = 'detail-content';
  contentWrap.style.cssText = `
    display:flex;flex-direction:column;align-items:stretch;
    gap:${sectionGap};width:100%;max-width:100%;box-sizing:border-box;
  `;

  const nameEl = document.createElement('h2');
  nameEl.style.cssText = detailFont('clamp(18px,4.5vw,24px)', 'font-weight:bold;flex:0 0 auto;');
  nameEl.textContent = t(`character.${id}`);
  contentWrap.appendChild(nameEl);

  const descEl = document.createElement('p');
  descEl.style.cssText = detailFont('clamp(11px,2.6vw,14px)', 'font-weight:bold;flex:0 0 auto;');
  descEl.textContent = t(`character.${id}_desc`);
  contentWrap.appendChild(descEl);

  const statsEl = document.createElement('div');
  statsEl.style.cssText = 'display:flex;flex-direction:column;width:100%;flex:0 0 auto;';
  const characterStatRows: Array<{ key: keyof typeof CHARACTER_STAT_BAR_MAX; value: number; text: string }> = [
    { key: 'hp', value: cfg.hp, text: String(cfg.hp) },
    { key: 'speed', value: cfg.speed, text: cfg.speed.toFixed(1) },
    { key: 'damage', value: cfg.damage, text: `${cfg.damage.toFixed(1)}×` },
    { key: 'armor', value: cfg.armor, text: String(cfg.armor) },
    { key: 'crit', value: cfg.critChance, text: `${Math.round(cfg.critChance * 100)}%` },
  ];
  for (const stat of characterStatRows) {
    statsEl.appendChild(createCharacterStatBar(
      t(`characterSelect.statLabel.${stat.key}`),
      stat.text,
      stat.value / CHARACTER_STAT_BAR_MAX[stat.key],
      textColor,
    ));
  }
  contentWrap.appendChild(statsEl);

  const traitEl = document.createElement('p');
  traitEl.style.cssText = detailFont(
    'clamp(10px,2.2vw,12px)',
    `color:${CHARACTER_DETAIL_TRAIT_DESC_COLOR};font-weight:bold;flex:0 0 auto;`,
  );
  traitEl.textContent = `${t('characterSelect.traitTitle')}：${t(`character.${id}_trait`)}`;
  contentWrap.appendChild(traitEl);

  const weaponSection = document.createElement('div');
  weaponSection.style.cssText = `
    flex:0 0 auto;width:100%;box-sizing:border-box;
    display:flex;justify-content:center;
  `;

  const weaponPanel = document.createElement('div');
  weaponPanel.style.cssText = `
    box-sizing:border-box;width:${weaponPanelWidth};max-width:100%;
    aspect-ratio:${CHARACTER_WEAPON_DETAIL_PANEL_SIZE.w}/${CHARACTER_WEAPON_DETAIL_PANEL_SIZE.h};
    background:url(${CHARACTER_WEAPON_DETAIL_PANEL_BG}) center center/100% 100% no-repeat;
    display:flex;align-items:center;
    padding:${weaponDetailInsetYPct(weaponPad.top)} ${weaponDetailInsetXPct(weaponPad.right)}
      ${weaponDetailInsetYPct(weaponPad.bottom)} ${weaponDetailInsetXPct(weaponPad.left)};
  `;

  const weaponRow = document.createElement('div');
  weaponRow.style.cssText = `
    display:flex;align-items:center;gap:clamp(6px,1.5vw,10px);width:100%;box-sizing:border-box;
  `;

  const weaponBoxSize = 'clamp(48px,14vw,72px)';
  const weaponImgWrap = document.createElement('div');
  weaponImgWrap.style.cssText = `
    flex-shrink:0;display:flex;align-items:center;justify-content:center;
    width:${weaponBoxSize};height:${weaponBoxSize};aspect-ratio:1/1;
    box-sizing:border-box;padding:6px;
  `;
  const weaponSrc = STARTING_WEAPON_IMAGE_PATHS[weapon];
  if (weaponSrc) {
    const weaponImg = document.createElement('img');
    weaponImg.src = weaponSrc;
    weaponImg.alt = t(`upgrade.weapon.${weapon}`);
    weaponImg.draggable = false;
    weaponImg.style.cssText = 'width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain;';
    weaponImg.onerror = () => {
      weaponImg.remove();
      const fallback = document.createElement('div');
      fallback.style.cssText = `font-size:36px;line-height:1;color:${textColor};`;
      fallback.textContent = '⚔️';
      weaponImgWrap.appendChild(fallback);
    };
    weaponImgWrap.appendChild(weaponImg);
  } else {
    const fallback = document.createElement('div');
    fallback.style.cssText = `font-size:36px;line-height:1;color:${textColor};`;
    fallback.textContent = '⚔️';
    weaponImgWrap.appendChild(fallback);
  }
  weaponRow.appendChild(weaponImgWrap);

  const weaponTextCol = document.createElement('div');
  const weaponTextMarginTop = weapon === 'axe' ? '-8px' : '0';
  weaponTextCol.style.cssText = `
    flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;margin-top:${weaponTextMarginTop};
  `;

  const weaponNameEl = document.createElement('div');
  weaponNameEl.style.cssText = detailFont('clamp(12px,2.8vw,15px)', 'font-weight:bold;');
  weaponNameEl.textContent = t(`upgrade.weapon.${weapon}`);
  weaponTextCol.appendChild(weaponNameEl);

  const weaponDescEl = document.createElement('p');
  weaponDescEl.style.cssText = detailFont('clamp(10px,2.2vw,12px)', 'font-weight:bold;margin-top:2px;margin-bottom:1px;');
  weaponDescEl.textContent = t(`upgrade.weapon.${weapon}_desc`);
  weaponTextCol.appendChild(weaponDescEl);

  const weaponStatsEl = document.createElement('div');
  weaponStatsEl.style.cssText = detailFont('clamp(9px,2vw,11px)', 'display:flex;flex-direction:column;gap:1px;');
  for (const line of formatWeaponStatLines(weapon)) {
    const row = document.createElement('div');
    row.textContent = line;
    weaponStatsEl.appendChild(row);
  }
  weaponTextCol.appendChild(weaponStatsEl);

  weaponRow.appendChild(weaponTextCol);
  weaponPanel.appendChild(weaponRow);
  weaponSection.appendChild(weaponPanel);
  contentWrap.appendChild(weaponSection);

  scaleOuter.appendChild(contentWrap);
  card.appendChild(scaleOuter);

  const confirmSection = document.createElement('div');
  confirmSection.dataset.region = 'detail-confirm';
  confirmSection.style.cssText = `
    flex:0 0 auto;width:100%;display:flex;align-items:center;justify-content:center;
    box-sizing:border-box;margin-top:${confirmGap};
  `;
  confirmSection.appendChild(createCharacterConfirmButton(t('characterSelect.confirm'), () => {
    destroyCharacterSelectScreen();
    showTierSelectScreen();
  }));
  card.appendChild(confirmSection);

  characterSelectDetailHost.replaceChildren(card);
  scheduleCharacterSelectDetailLayout();
}

function refreshCharacterSelectPreview(): void {
  if (!characterSelectPreviewHost) return;

  const id = selectedCharacter;
  const stage = document.createElement('div');
  stage.style.cssText = `
    width:min(72%,340px);max-width:100%;height:100%;margin:0 auto;box-sizing:border-box;
    display:flex;align-items:center;justify-content:center;
    background:${CHARACTER_PREVIEW_STAGE_BG};border:none;border-radius:16px;
    padding:8px;overflow:hidden;
  `;

  const preview = document.createElement('img');
  preview.src = CHARACTER_FULL_PATHS[id];
  preview.alt = t(`character.${id}`);
  preview.draggable = false;
  preview.style.cssText = `
    width:auto;height:auto;max-width:100%;max-height:100%;
    object-fit:contain;object-position:center center;
    filter:drop-shadow(0 8px 24px rgba(0,0,0,0.25));pointer-events:none;user-select:none;
  `;
  preview.onerror = () => {
    preview.src = CHARACTER_AVATAR_PATHS[id];
    preview.style.height = 'auto';
    preview.style.maxHeight = '100%';
    scheduleCharacterSelectDetailLayout();
  };
  preview.onload = () => scheduleCharacterSelectDetailLayout();

  stage.appendChild(preview);
  characterSelectPreviewHost.replaceChildren(stage);
  scheduleCharacterSelectDetailLayout();
}

function refreshCharacterSelectUI(): void {
  refreshCharacterSelectPreview();
  refreshCharacterSelectDetail();
}

let characterSelectEl: HTMLDivElement | null = null;
let tierSelectEl: HTMLDivElement | null = null;

function showCharacterSelectScreen(): void {
  if (characterSelectEl) return;

  characterSelectEl = document.createElement('div');
  characterSelectEl.id = 'character-select-root';
  characterSelectEl.style.cssText = `${PREP_SCREEN_STYLE}display:flex;flex-direction:column;`;

  const header = document.createElement('header');
  header.dataset.region = 'header';
  header.style.cssText = PREP_SCREEN_HEADER_STYLE;

  header.appendChild(createPrepBackButton(() => {
    destroyCharacterSelectScreen();
    showMainMenu();
  }));

  const silverWrap = document.createElement('div');
  silverWrap.dataset.region = 'silver';
  silverWrap.appendChild(createSilverBadge(loadSave().silver));
  header.appendChild(silverWrap);
  characterSelectEl.appendChild(header);

  const stageWrap = document.createElement('div');
  stageWrap.dataset.region = 'stage';
  stageWrap.style.cssText = `${PREP_STAGE_STYLE}overflow:hidden;`;

  const body = document.createElement('main');
  body.dataset.region = 'body';
  body.style.cssText = `
    ${PREP_STAGE_BODY_STYLE}display:flex;flex-direction:row;gap:8px;align-items:stretch;
  `;
  characterSelectBodyEl = body;

  const rail = document.createElement('aside');
  rail.dataset.region = 'rail';
  rail.style.cssText = `
    display:flex;flex-direction:column;gap:10px;
    flex:0 0 auto;align-items:center;align-self:flex-start;
  `;
  characterSelectSlotsHost = rail;
  mountCharacterSelectSlots(rail);
  body.appendChild(rail);

  const center = document.createElement('section');
  center.dataset.region = 'center';
  center.style.cssText = `
    flex:1 1 52%;min-width:0;min-height:0;display:flex;align-items:stretch;justify-content:center;
    padding:0;box-sizing:border-box;overflow:hidden;
  `;
  characterSelectPreviewHost = center;
  body.appendChild(center);

  const detail = document.createElement('aside');
  detail.dataset.region = 'detail';
  detail.style.cssText = `
    flex:1 1 44%;width:auto;min-width:300px;max-width:420px;
    display:flex;flex-direction:column;min-height:0;align-self:stretch;
    align-items:stretch;justify-content:flex-start;position:relative;
  `;

  const detailInner = document.createElement('div');
  detailInner.dataset.region = 'detail-inner';
  detailInner.style.cssText = `
    flex:1;min-height:0;width:100%;display:flex;flex-direction:column;
    align-items:stretch;justify-content:flex-start;overflow:hidden;box-sizing:border-box;
  `;
  characterSelectDetailHost = detailInner;
  detail.appendChild(detailInner);

  body.appendChild(detail);

  stageWrap.appendChild(body);
  characterSelectEl.appendChild(stageWrap);
  refreshCharacterSelectUI();

  characterSelectResizeHandler = () => scheduleCharacterSelectDetailLayout();
  window.addEventListener('resize', characterSelectResizeHandler);

  document.body.appendChild(characterSelectEl);
}

function destroyCharacterSelectScreen(): void {
  if (characterSelectResizeHandler) {
    window.removeEventListener('resize', characterSelectResizeHandler);
    characterSelectResizeHandler = null;
  }
  characterSelectEl?.remove();
  characterSelectEl = null;
  characterSelectSlotsHost = null;
  characterSelectPreviewHost = null;
  characterSelectDetailHost = null;
  characterSelectBodyEl = null;
}

function showTierSelectScreen(): void {
  if (tierSelectEl) return;

  tierSelectEl = document.createElement('div');
  tierSelectEl.style.cssText = `${PREP_SCREEN_STYLE}display:flex;flex-direction:column;`;

  const header = document.createElement('header');
  header.dataset.region = 'header';
  header.style.cssText = PREP_SCREEN_HEADER_STYLE;

  header.appendChild(createPrepBackButton(() => {
    destroyTierSelectScreen();
    showCharacterSelectScreen();
  }));

  const silverWrap = document.createElement('div');
  silverWrap.dataset.region = 'silver';
  silverWrap.appendChild(createSilverBadge(loadSave().silver));
  header.appendChild(silverWrap);
  tierSelectEl.appendChild(header);

  const stageWrap = document.createElement('div');
  stageWrap.dataset.region = 'stage';
  stageWrap.style.cssText = PREP_STAGE_STYLE;

  const body = document.createElement('main');
  body.dataset.region = 'body';
  body.style.cssText = `
    width:720px;max-width:100%;display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:20px;box-sizing:border-box;
  `;

  const tierPanel = showTierSelect((_tier) => {
    // selectedTier updated inside showTierSelect
  });
  body.appendChild(tierPanel);

  const startWrap = document.createElement('div');
  startWrap.style.cssText = 'margin-top:16px;width:100%;display:flex;justify-content:center;box-sizing:border-box;';
  startWrap.appendChild(createMainMenuButton(MENU_BUTTON_ICONS.start, t('menu.start'), () => {
    destroyTierSelectScreen();
    startGame(selectedCharacter);
  }));
  body.appendChild(startWrap);

  stageWrap.appendChild(body);
  tierSelectEl.appendChild(stageWrap);
  document.body.appendChild(tierSelectEl);
}

function destroyTierSelectScreen(): void {
  tierSelectEl?.remove();
  tierSelectEl = null;
}

// =============================================================================
// Tier Selection
// =============================================================================

function createTierMonsterAvatarRow(): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText = `
    display:flex;align-items:center;justify-content:space-between;width:100%;
    gap:6px;margin-top:8px;box-sizing:border-box;
  `;

  const { w: fw, h: fh } = TIER_MONSTER_FRAME_SIZE;
  for (const src of TIER_MONSTER_AVATARS) {
    const slot = document.createElement('div');
    slot.style.cssText = `
      flex:1 1 0;min-width:0;position:relative;height:42px;
      aspect-ratio:${fw}/${fh};
      background:url(${TIER_MONSTER_FRAME}) center center/contain no-repeat;
    `;

    const avatar = document.createElement('img');
    avatar.src = src;
    avatar.alt = '';
    avatar.draggable = false;
    avatar.style.cssText = `
      position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
      width:62%;height:62%;object-fit:contain;pointer-events:none;user-select:none;
    `;
    slot.appendChild(avatar);
    row.appendChild(slot);
  }
  return row;
}

function createTierPanelSelectButton(isSelected: boolean, onClick: () => void): HTMLDivElement {
  const btn = document.createElement('div');
  btn.setAttribute('role', 'button');
  btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
  btn.style.cssText = `
    position:relative;width:60px;min-width:44px;max-width:100%;
    cursor:${isSelected ? 'default' : 'pointer'};user-select:none;touch-action:manipulation;
    transition:transform 0.15s;
  `;

  const frame = document.createElement('img');
  frame.src = isSelected ? TIER_SELECT_BUTTON_PRESSED : TIER_SELECT_BUTTON_NORMAL;
  frame.alt = '';
  frame.draggable = false;
  frame.style.cssText = 'display:block;width:100%;height:auto;pointer-events:none;';

  const labelEl = document.createElement('span');
  labelEl.textContent = t(isSelected ? 'tier.chosen' : 'tier.choose');
  labelEl.style.cssText = `
    position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
    color:#ffffff;font-size:11px;font-weight:bold;line-height:1.2;
    pointer-events:none;text-shadow:0 1px 2px rgba(0,0,0,0.35);
  `;

  btn.appendChild(frame);
  btn.appendChild(labelEl);
  if (!isSelected) {
    btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.05)'; });
    btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; });
    btn.addEventListener('click', onClick);
  }
  return btn;
}

function showTierSelect(onSelect: (tier: DifficultyTier) => void): HTMLDivElement {
  const panel = document.createElement('div');
  panel.style.cssText = `
    display:flex;gap:14px;flex-wrap:nowrap;justify-content:center;
    width:100%;max-width:100%;box-sizing:border-box;
  `;

  const tiers: DifficultyTier[] = [1, 2, 3];
  const statColor = CHARACTER_DETAIL_TEXT_COLOR;

  for (const tier of tiers) {
    const cfg = TIER_CONFIGS[tier];
    const isSelected = tier === selectedTier;
    const panelSize = TIER_PANEL_SIZE[tier];

    const card = document.createElement('div');
    card.setAttribute('aria-label', t(`tier.${tier}`));
    card.style.cssText = `
      position:relative;width:160px;max-width:32%;aspect-ratio:${panelSize.w}/${panelSize.h};height:auto;
      box-sizing:border-box;
      background:url(${TIER_PANEL_BGS[tier]}) center center/contain no-repeat;
      border:none;border-radius:12px;overflow:visible;
    `;

    const descEl = document.createElement('div');
    descEl.style.cssText = `
      position:absolute;top:28%;left:11%;right:11%;box-sizing:border-box;text-align:left;
      color:${statColor};font-size:11px;line-height:1.45;font-weight:600;
    `;
    const tierStatRows = [
      t('tier.stat.enemyHp', { value: String(cfg.enemyHpMultiplier) }),
      t('tier.stat.enemyDamage', { value: String(cfg.enemyDamageMultiplier) }),
      t('tier.stat.silver', { value: String(cfg.silverMultiplier) }),
    ];
    for (const statText of tierStatRows) {
      const statEl = document.createElement('div');
      statEl.textContent = statText;
      descEl.appendChild(statEl);
    }
    descEl.appendChild(createTierMonsterAvatarRow());
    card.appendChild(descEl);

    const actionWrap = document.createElement('div');
    actionWrap.style.cssText = `
      position:absolute;left:0;right:0;bottom:5%;display:flex;justify-content:center;
      padding:0 8%;box-sizing:border-box;
    `;
    actionWrap.appendChild(createTierPanelSelectButton(isSelected, () => {
      if (selectedTier === tier) return;
      selectedTier = tier;
      onSelect(tier);
      const newPanel = showTierSelect(onSelect);
      panel.replaceWith(newPanel);
    }));
    card.appendChild(actionWrap);

    panel.appendChild(card);
  }

  return panel;
}

// =============================================================================
// Main Menu
// =============================================================================

let mainMenuEl: HTMLDivElement | null = null;

function createMainMenuButton(iconSrc: string, label: string, onClick: () => void): HTMLDivElement {
  const btn = document.createElement('div');
  btn.style.cssText = `
    position:relative;width:232px;max-width:100%;cursor:pointer;user-select:none;
    touch-action:manipulation;transition:transform 0.15s;
  `;

  const frame = document.createElement('img');
  frame.src = MENU_BUTTON_FRAME;
  frame.alt = '';
  frame.draggable = false;
  frame.style.cssText = 'display:block;width:100%;height:auto;pointer-events:none;';

  const content = document.createElement('div');
  content.style.cssText = `
    position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
    gap:10px;padding:0 12px;box-sizing:border-box;pointer-events:none;
    max-width:100%;overflow:hidden;
  `;

  const icon = document.createElement('img');
  icon.src = iconSrc;
  icon.alt = '';
  icon.draggable = false;
  icon.style.cssText = 'width:30px;height:30px;object-fit:contain;flex-shrink:0;';

  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  labelEl.style.cssText = `color:${MENU_BUTTON_LABEL_COLOR};font-size:16px;font-weight:bold;line-height:1.2;white-space:nowrap;flex-shrink:1;min-width:0;overflow:hidden;text-overflow:ellipsis;`;

  content.appendChild(icon);
  content.appendChild(labelEl);
  btn.appendChild(frame);
  btn.appendChild(content);
  btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.05)'; });
  btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; });
  btn.addEventListener('click', onClick);
  return btn;
}

function showMainMenu(): void {
  mainMenuEl = document.createElement('div');
  mainMenuEl.style.cssText = `
    position:fixed;top:0;left:0;width:100%;height:100%;box-sizing:border-box;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    z-index:500;font-family:Arial,sans-serif;gap:16px;
    background:#0a0a1a url(${LOBBY_BG_PATH}) center center/cover no-repeat;
  `;

  const save = loadSave();
  const silverDisplay = createSilverBadge(save.silver);
  silverDisplay.style.position = 'absolute';
  silverDisplay.style.top = 'max(16px, env(safe-area-inset-top, 0px))';
  silverDisplay.style.right = 'max(16px, env(safe-area-inset-right, 0px))';
  mainMenuEl.appendChild(silverDisplay);

  const langBtn = createLanguageSwitcherButton();
  if (langBtn) {
    langBtn.style.position = 'absolute';
    langBtn.style.left = 'max(12px, env(safe-area-inset-left, 0px))';
    langBtn.style.bottom = 'max(12px, env(safe-area-inset-bottom, 0px))';
    mainMenuEl.appendChild(langBtn);
  }

  // Title
  const title = document.createElement('img');
  title.src = TITLE_IMAGE_PATH;
  title.alt = t('game.title');
  title.draggable = false;
  title.style.cssText = 'width:520px;max-width:90%;height:auto;object-fit:contain;margin-bottom:8px;filter:drop-shadow(0 4px 12px rgba(0,0,0,0.65));user-select:none;';
  mainMenuEl.appendChild(title);

  // Button row (Start + Shop + Quests)
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;flex-direction:column;gap:12px;margin-top:16px;align-items:center;box-sizing:border-box;';

  btnRow.appendChild(createMainMenuButton(MENU_BUTTON_ICONS.start, t('menu.start'), () => {
    destroyMainMenu();
    showCharacterSelectScreen();
  }));
  btnRow.appendChild(createMainMenuButton(MENU_BUTTON_ICONS.shop, t('menu.shop'), () => {
    showShopOverlay();
  }));
  const questBtn = createMainMenuButton(MENU_BUTTON_ICONS.quest, t('menu.quests'), () => {
    showQuestsOverlay();
  });
  questBtn.dataset.menuQuestBtn = 'true';
  setNotificationDotVisible(questBtn, hasClaimableQuests(), 'menuQuest');
  btnRow.appendChild(questBtn);

  mainMenuEl.appendChild(btnRow);
  document.body.appendChild(mainMenuEl);
}

function destroyMainMenu(): void {
  mainMenuEl?.remove();
  mainMenuEl = null;
}

// =============================================================================
// Shop Overlay
// =============================================================================

let shopOverlayEl: HTMLDivElement | null = null;

function showShopOverlay(): void {
  if (shopOverlayEl) return;

  shopOverlayEl = document.createElement('div');
  shopOverlayEl.style.cssText = SHOP_OVERLAY_STYLE;

  const save = loadSave();
  const silverWrap = document.createElement('div');
  silverWrap.appendChild(createSilverBadge(save.silver));
  const header = createPrepScreenHeader(t('menu.shop'), () => {
    hideShopOverlay();
    if (mainMenuEl) {
      const silverDisp = mainMenuEl.querySelector('[data-silver-badge]') as HTMLDivElement | null;
      if (silverDisp) {
        setSilverBadgeAmount(silverDisp, loadSave().silver);
      }
    }
  }, silverWrap);
  header.style.position = 'absolute';
  header.style.top = '0';
  header.style.left = '0';
  header.style.right = '0';
  header.style.zIndex = '2';
  shopOverlayEl.appendChild(header);

  const content = document.createElement('div');
  content.style.cssText = `
    display:flex;align-items:center;justify-content:center;
    width:100%;height:100%;max-width:100%;max-height:100%;
    padding:clamp(52px,14vw,68px) clamp(8px,3vw,14px) clamp(12px,3vw,20px);
    box-sizing:border-box;overflow-y:auto;
  `;

  const itemListPanel = document.createElement('div');
  itemListPanel.style.cssText = `
    position:relative;box-sizing:border-box;flex-shrink:0;
    width:min(94vw,840px);max-height:100%;
    aspect-ratio:${SHOP_ITEM_LIST_PANEL_SIZE.w}/${SHOP_ITEM_LIST_PANEL_SIZE.h};
    background:url(${SHOP_ITEM_LIST_PANEL_BG}) center center/contain no-repeat;
  `;

  const gridWrap = document.createElement('div');
  gridWrap.style.cssText = `
    position:absolute;inset:8%;
    display:flex;align-items:center;justify-content:center;
    box-sizing:border-box;
  `;

  // Upgrade grid — 4 items per row, wrap to next line
  const grid = document.createElement('div');
  grid.style.cssText = `
    display:grid;grid-template-columns:repeat(4,minmax(0,1fr));
    gap:clamp(4px,1vw,8px);width:100%;box-sizing:border-box;
  `;

  const shopText = (size: string, extra = '') =>
    `margin:0;color:#2a2a3e;font-size:${size};line-height:1.3;${extra}`;

  for (const upgrade of SHOP_UPGRADES) {
    const currentLevel = save.shopLevels[upgrade.id] ?? 0;
    const isMaxed = currentLevel >= upgrade.maxLevel;
    const cost = isMaxed ? null : upgrade.costPerLevel[currentLevel];
    const affordable = cost !== null && save.silver >= cost;

    const card = document.createElement('div');
    card.style.cssText = `
      position:relative;box-sizing:border-box;min-width:0;
      aspect-ratio:${SHOP_ITEM_PANEL_SIZE.w}/${SHOP_ITEM_PANEL_SIZE.h};
      background:url(${SHOP_ITEM_PANEL_BG}) center center/contain no-repeat;
      overflow:hidden;
      ${isMaxed ? 'opacity:0.65;' : ''}
    `;

    const cardInner = document.createElement('div');
    cardInner.style.cssText = `
      position:absolute;inset:6% 6% 10% 6%;
      display:flex;flex-direction:column;align-items:center;
      box-sizing:border-box;
    `;

    const infoArea = document.createElement('div');
    infoArea.style.cssText = `
      display:flex;flex-direction:column;align-items:center;justify-content:flex-start;
      text-align:center;flex-shrink:0;gap:clamp(2px,0.6vw,4px);width:100%;
      margin-top:clamp(6px,2vw,14px);
    `;

    const nameRow = document.createElement('div');
    nameRow.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:clamp(4px,1vw,8px);max-width:100%;flex-shrink:0;';

    const iconSrc = SHOP_ITEM_ICONS[upgrade.id];
    if (iconSrc) {
      const iconEl = document.createElement('img');
      iconEl.src = iconSrc;
      iconEl.alt = '';
      iconEl.draggable = false;
      iconEl.style.cssText = 'width:clamp(20px,7.5vw,32px);height:clamp(20px,7.5vw,32px);object-fit:contain;flex-shrink:0;';
      nameRow.appendChild(iconEl);
    }

    const nameEl = document.createElement('div');
    nameEl.style.cssText = shopText('clamp(10px,3.2vw,16px)', `color:${SHOP_ITEM_TITLE_COLOR};font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`);
    nameEl.textContent = t(upgrade.nameKey);
    nameRow.appendChild(nameEl);
    infoArea.appendChild(nameRow);

    const descEl = document.createElement('div');
    descEl.style.cssText = shopText('clamp(8px,2.2vw,11px)', 'color:#5a5a6e;max-width:90%;margin-top:clamp(6px,1.8vw,12px);overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;text-align:center;');
    descEl.textContent = t(upgrade.descKey);
    infoArea.appendChild(descEl);
    cardInner.appendChild(infoArea);

    const bottomArea = document.createElement('div');
    bottomArea.style.cssText = `
      width:88%;margin-top:auto;margin-bottom:2%;
      display:flex;flex-direction:column;align-items:center;
      gap:clamp(2px,0.5vw,4px);
    `;

    const progressRow = document.createElement('div');
    progressRow.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:clamp(3px,0.8vw,6px);width:100%;';

    const levelEl = document.createElement('div');
    levelEl.style.cssText = shopText('clamp(7px,2vw,10px)', `color:${SHOP_ITEM_TITLE_COLOR};font-weight:bold;flex-shrink:0;white-space:nowrap;`);
    levelEl.textContent = t('shop.level', { current: String(currentLevel), max: String(upgrade.maxLevel) });
    progressRow.appendChild(levelEl);
    progressRow.appendChild(createShopLevelSegments(currentLevel, upgrade.maxLevel));
    bottomArea.appendChild(progressRow);

    const buyRow = document.createElement('div');
    buyRow.style.cssText = 'display:flex;justify-content:center;align-items:center;width:42%;align-self:center;';

    if (isMaxed) {
      buyRow.appendChild(createShopMaxedButton());
    } else {
      buyRow.appendChild(createShopBuyButton(cost!, affordable, affordable ? () => {
        const success = purchaseUpgrade(upgrade.id);
        if (success) {
          hideShopOverlay();
          showShopOverlay();
        }
      } : undefined));
    }

    bottomArea.appendChild(buyRow);
    cardInner.appendChild(bottomArea);
    card.appendChild(cardInner);
    grid.appendChild(card);
  }

  gridWrap.appendChild(grid);
  itemListPanel.appendChild(gridWrap);
  content.appendChild(itemListPanel);
  shopOverlayEl.appendChild(content);

  document.body.appendChild(shopOverlayEl);
}

function hideShopOverlay(): void {
  shopOverlayEl?.remove();
  shopOverlayEl = null;
}

// =============================================================================
// Quests Overlay
// =============================================================================

type QuestCategory = 'all' | 'challenge' | 'growth' | 'wealth' | 'weapons';

const QUEST_CATEGORY_ICONS: Record<QuestCategory, string> = {
  all: '/ui/quests/tab_task_all.png',
  challenge: '/ui/quests/tab_task_challenge.png',
  growth: '/ui/quests/tab_task_grow.png',
  wealth: '/ui/quests/tab_task_wealth.png',
  weapons: '/ui/quests/tab_task_weapon.png',
};

const QUEST_CATEGORIES: { id: QuestCategory; labelKey: string }[] = [
  { id: 'all', labelKey: 'quest.category.all' },
  { id: 'challenge', labelKey: 'quest.category.challenge' },
  { id: 'growth', labelKey: 'quest.category.growth' },
  { id: 'wealth', labelKey: 'quest.category.wealth' },
  { id: 'weapons', labelKey: 'quest.category.weapons' },
];

function getQuestCategory(type: Quest['type']): QuestCategory {
  switch (type) {
    case 'kill':
    case 'boss':
    case 'no_damage':
      return 'challenge';
    case 'survive':
    case 'level':
    case 'bond':
      return 'growth';
    case 'collect':
      return 'wealth';
    case 'weapons_used':
      return 'weapons';
    default:
      return 'all';
  }
}

function questMatchesCategory(quest: Quest, category: QuestCategory): boolean {
  return category === 'all' || getQuestCategory(quest.type) === category;
}

const NOTIFICATION_DOT_ATTR = 'data-notification-dot';

type NotificationDotPlacement = 'default' | 'menuQuest';

function createNotificationDot(placement: NotificationDotPlacement = 'default'): HTMLDivElement {
  const position = placement === 'menuQuest'
    ? 'top:clamp(8px,2.2vw,12px);right:clamp(18px,5vw,28px);transform:none;'
    : 'top:0;right:0;transform:translate(25%,-25%);';

  const dot = document.createElement('div');
  dot.setAttribute(NOTIFICATION_DOT_ATTR, 'true');
  dot.style.cssText = `
    position:absolute;${position}
    width:clamp(8px,2.2vw,10px);height:clamp(8px,2.2vw,10px);
    background:#ff4444;border-radius:50%;
    border:clamp(1px,0.3vw,2px) solid #ffffff;
    box-sizing:border-box;pointer-events:none;z-index:2;
  `;
  return dot;
}

function setNotificationDotVisible(
  host: HTMLElement,
  visible: boolean,
  placement: NotificationDotPlacement = 'default',
): void {
  const existing = host.querySelector(`[${NOTIFICATION_DOT_ATTR}]`);
  if (visible) {
    if (!existing) host.appendChild(createNotificationDot(placement));
  } else {
    existing?.remove();
  }
}

function isQuestClaimable(progress: QuestProgress): boolean {
  return progress.completed && !progress.claimed;
}

function hasClaimableQuests(): boolean {
  return getQuestProgress().some(isQuestClaimable);
}

function getClaimableQuestCategories(): Set<QuestCategory> {
  const categories = new Set<QuestCategory>();
  const progressList = getQuestProgress();
  for (let i = 0; i < QUESTS.length; i++) {
    if (!isQuestClaimable(progressList[i])) continue;
    categories.add(getQuestCategory(QUESTS[i].type));
    categories.add('all');
  }
  return categories;
}

function updateMainMenuQuestNotification(): void {
  if (!mainMenuEl) return;
  const questBtn = mainMenuEl.querySelector('[data-menu-quest-btn]') as HTMLElement | null;
  if (questBtn) setNotificationDotVisible(questBtn, hasClaimableQuests(), 'menuQuest');
}

function updateQuestCategoryNotifications(
  categoryButtons: Map<QuestCategory, HTMLDivElement>,
): void {
  const claimable = getClaimableQuestCategories();
  for (const [id, btn] of categoryButtons) {
    setNotificationDotVisible(btn, claimable.has(id));
  }
}

type QuestActionState = 'incomplete' | 'claimable' | 'claimed';

function createQuestActionButton(
  state: QuestActionState,
  onClick?: () => void,
): HTMLDivElement {
  const config = {
    incomplete: {
      frame: QUEST_ACTION_BUTTON_ORANGE,
      pressed: QUEST_ACTION_BUTTON_ORANGE_PRESSED,
      label: t('quest.go_complete'),
      color: '#ffffff',
      interactive: true,
    },
    claimable: {
      frame: QUEST_ACTION_BUTTON_GREEN,
      pressed: QUEST_ACTION_BUTTON_GREEN_PRESSED,
      label: t('quest.claim'),
      color: '#ffffff',
      interactive: true,
    },
    claimed: {
      frame: QUEST_ACTION_BUTTON_GRAY,
      pressed: QUEST_ACTION_BUTTON_GRAY_PRESSED,
      label: t('quest.claimed'),
      color: '#555566',
      interactive: false,
    },
  }[state];

  const btn = document.createElement('div');
  btn.style.cssText = `
    position:relative;flex-shrink:0;display:inline-block;
    width:clamp(56px,16vw,72px);min-width:44px;
    cursor:${config.interactive ? 'pointer' : 'default'};
    user-select:none;touch-action:manipulation;
    transition:transform 0.15s;
  `;

  const frame = document.createElement('img');
  frame.src = config.frame;
  frame.alt = '';
  frame.draggable = false;
  frame.style.cssText = 'display:block;width:100%;height:auto;pointer-events:none;vertical-align:top;';

  const labelEl = document.createElement('span');
  labelEl.textContent = config.label;
  labelEl.style.cssText = `
    position:absolute;left:0;top:0;width:100%;height:100%;
    display:flex;align-items:center;justify-content:center;
    color:${config.color};font-size:clamp(10px,2.5vw,12px);font-weight:bold;line-height:1;
    padding:0 clamp(2px,0.6vw,4px);box-sizing:border-box;text-align:center;
    pointer-events:none;
  `;

  btn.appendChild(frame);
  btn.appendChild(labelEl);
  if (state === 'claimable') {
    btn.appendChild(createNotificationDot());
  }

  if (config.interactive && onClick) {
    btn.addEventListener('click', onClick);
    btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.05)'; });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'scale(1)';
      frame.src = config.frame;
    });
    btn.addEventListener('mousedown', () => { frame.src = config.pressed; });
    btn.addEventListener('mouseup', () => { frame.src = config.frame; });
    btn.addEventListener('touchstart', () => { frame.src = config.pressed; }, { passive: true });
    btn.addEventListener('touchend', () => { frame.src = config.frame; });
  }

  return btn;
}

function createQuestRow(
  quest: Quest,
  progress: QuestProgress,
  onRefresh?: () => void,
): HTMLDivElement {
  const rowMinHeight = progress.completed
    ? 'clamp(48px,12vw,58px)'
    : 'clamp(64px,15vw,80px)';

  const row = document.createElement('div');
  row.style.cssText = `
    position:relative;box-sizing:border-box;width:100%;overflow:hidden;
    min-height:${rowMinHeight};
    padding:clamp(6px,1.5vw,8px) clamp(10px,3vw,14px);
    background:url(${QUEST_ITEM_BG}) center center/100% 100% no-repeat;
    display:flex;align-items:center;
    ${progress.claimed ? 'opacity:0.7;' : ''}
  `;

  const contentEl = document.createElement('div');
  contentEl.style.cssText = `
    position:relative;z-index:1;width:100%;
    display:flex;align-items:center;gap:clamp(6px,1.5vw,10px);
  `;

  const infoEl = document.createElement('div');
  infoEl.style.cssText = 'flex:1;min-width:0;';

  const descEl = document.createElement('div');
  descEl.style.cssText = `color:${QUEST_TEXT_COLOR};font-size:clamp(11px,2.8vw,13px);line-height:1.4;`;
  descEl.textContent = t(quest.description);
  infoEl.appendChild(descEl);

  if (!progress.completed) {
    const progressBarContainer = document.createElement('div');
    progressBarContainer.style.cssText = 'height:4px;background:rgba(80,80,100,0.5);border-radius:2px;overflow:hidden;margin-top:4px;';
    const progressBar = document.createElement('div');
    const pct = Math.min(100, (progress.current / quest.target) * 100);
    progressBar.style.cssText = `height:100%;width:${pct}%;background:#44cc44;border-radius:2px;`;
    progressBarContainer.appendChild(progressBar);
    infoEl.appendChild(progressBarContainer);

    const progressText = document.createElement('div');
    progressText.style.cssText = 'color:#888;font-size:clamp(9px,2.2vw,10px);margin-top:2px;';
    progressText.textContent = `${progress.current} / ${quest.target}`;
    infoEl.appendChild(progressText);
  }

  contentEl.appendChild(infoEl);

  const actionArea = document.createElement('div');
  actionArea.style.cssText = `
    display:flex;align-items:center;justify-content:flex-end;
    gap:clamp(4px,1.2vw,8px);flex-shrink:0;
  `;

  const rewardText = document.createElement('span');
  rewardText.style.cssText = `
    color:${QUEST_TEXT_COLOR};font-size:clamp(9px,2.2vw,11px);line-height:1.3;
    text-align:right;max-width:clamp(48px,14vw,72px);
    word-break:break-word;
  `;
  rewardText.textContent = formatQuestReward(quest.reward);
  actionArea.appendChild(rewardText);

  let actionState: QuestActionState;
  if (progress.claimed) {
    actionState = 'claimed';
  } else if (progress.completed) {
    actionState = 'claimable';
  } else {
    actionState = 'incomplete';
  }

  const actionBtn = createQuestActionButton(
    actionState,
    actionState === 'incomplete'
      ? () => {
          hideQuestsOverlay();
          showCharacterSelectScreen();
        }
      : actionState === 'claimable'
        ? () => {
            if (claimQuest(quest.id)) onRefresh?.();
          }
        : undefined,
  );
  actionArea.appendChild(actionBtn);
  contentEl.appendChild(actionArea);

  row.appendChild(contentEl);

  return row;
}

function createQuestCategoryButton(iconSrc: string, label: string, selected: boolean, onClick: () => void): HTMLDivElement {
  const btn = document.createElement('div');
  btn.setAttribute('role', 'button');
  btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
  btn.style.cssText = `
    position:relative;width:100%;min-height:36px;min-width:36px;
    cursor:pointer;user-select:none;touch-action:manipulation;transition:transform 0.15s;
  `;

  const frame = document.createElement('img');
  frame.setAttribute('data-quest-cat-frame', 'true');
  frame.src = selected ? TIER_SELECT_BUTTON_NORMAL : QUEST_CATEGORY_BUTTON_NORMAL;
  frame.alt = '';
  frame.draggable = false;
  frame.style.cssText = 'display:block;width:100%;height:auto;pointer-events:none;';

  const content = document.createElement('div');
  content.style.cssText = `
    position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
    gap:clamp(2px,0.6vw,4px);pointer-events:none;
    padding:0 clamp(3px,0.8vw,6px);box-sizing:border-box;max-width:100%;overflow:hidden;
  `;

  const icon = document.createElement('img');
  icon.src = iconSrc;
  icon.alt = '';
  icon.draggable = false;
  icon.style.cssText = 'width:clamp(14px,4vw,18px);height:clamp(14px,4vw,18px);object-fit:contain;flex-shrink:0;';

  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  labelEl.style.cssText = `
    color:#ffffff;font-size:clamp(9px,2.2vw,11px);font-weight:bold;line-height:1.2;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;
    text-shadow:0 1px 2px rgba(0,0,0,0.35);
  `;

  content.appendChild(icon);
  content.appendChild(labelEl);
  btn.appendChild(frame);
  btn.appendChild(content);
  btn.addEventListener('click', onClick);
  btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.05)'; });
  btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; });
  return btn;
}

function updateQuestCategoryButtonStyle(btn: HTMLDivElement, selected: boolean): void {
  const frame = btn.querySelector('img[data-quest-cat-frame]');
  if (frame instanceof HTMLImageElement) {
    frame.src = selected ? TIER_SELECT_BUTTON_NORMAL : QUEST_CATEGORY_BUTTON_NORMAL;
  }
  btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
}

let questsOverlayEl: HTMLDivElement | null = null;
let questsOverlayResizeHandler: (() => void) | null = null;

function getQuestListPanelImageRect(panel: HTMLElement) {
  const boxW = panel.clientWidth;
  const boxH = panel.clientHeight;
  if (boxW <= 0 || boxH <= 0) return null;

  const scale = Math.min(boxW / QUEST_LIST_PANEL_SIZE.w, boxH / QUEST_LIST_PANEL_SIZE.h);
  const renderedW = QUEST_LIST_PANEL_SIZE.w * scale;
  const renderedH = QUEST_LIST_PANEL_SIZE.h * scale;
  const offsetX = (boxW - renderedW) / 2;
  const offsetY = (boxH - renderedH) / 2;
  return { renderedW, renderedH, offsetX, offsetY };
}

function layoutQuestPanel(
  panel: HTMLDivElement,
  scroll: HTMLDivElement,
  categorySidebar: HTMLDivElement,
): void {
  const rect = getQuestListPanelImageRect(panel);
  if (!rect) return;

  const { renderedW, renderedH, offsetX, offsetY } = rect;
  const { top, right, bottom, left } = QUEST_LIST_SCROLL_INSET;

  categorySidebar.style.marginTop = `${offsetY + renderedH * QUEST_CATEGORY_SIDEBAR_OFFSET_RATIO}px`;
  scroll.style.top = `${offsetY + renderedH * top}px`;
  scroll.style.left = `${offsetX + renderedW * left}px`;
  scroll.style.width = `${renderedW * (1 - left - right)}px`;
  scroll.style.height = `${renderedH * (1 - top - bottom)}px`;
}

function showQuestsOverlay(): void {
  if (questsOverlayEl) return;

  questsOverlayEl = document.createElement('div');
  questsOverlayEl.style.cssText = QUESTS_OVERLAY_STYLE;

  const silverWrap = document.createElement('div');
  silverWrap.dataset.region = 'silver';
  const silverBadge = createSilverBadge(loadSave().silver);
  silverWrap.appendChild(silverBadge);
  questsOverlayEl.appendChild(createPrepScreenHeader(t('menu.quests'), () => {
    hideQuestsOverlay();
    if (mainMenuEl) {
      const silverDisp = mainMenuEl.querySelector('[data-silver-badge]') as HTMLDivElement | null;
      if (silverDisp) {
        setSilverBadgeAmount(silverDisp, loadSave().silver);
      }
      updateMainMenuQuestNotification();
    }
  }, silverWrap));

  const content = document.createElement('div');
  content.style.cssText = `
    flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;
    padding:8px clamp(8px,3vw,14px) max(20px,env(safe-area-inset-bottom,0px));
    box-sizing:border-box;width:min(96vw,840px);margin:0 auto;overflow:hidden;
  `;

  const panelRow = document.createElement('div');
  panelRow.style.cssText = `
    flex:1;min-height:0;width:100%;display:flex;justify-content:center;
    box-sizing:border-box;
  `;

  const panelUnit = document.createElement('div');
  panelUnit.style.cssText = `
    display:flex;align-items:flex-start;gap:clamp(6px,2vw,12px);
    height:100%;max-height:100%;min-height:0;width:100%;max-width:100%;
    box-sizing:border-box;
  `;

  const questListPanel = document.createElement('div');
  questListPanel.style.cssText = `
    position:relative;box-sizing:border-box;overflow:hidden;flex:1;min-width:0;
    height:100%;max-height:100%;
    aspect-ratio:${QUEST_LIST_PANEL_SIZE.w}/${QUEST_LIST_PANEL_SIZE.h};
    background:url(${QUEST_LIST_PANEL_BG}) center center/contain no-repeat;
  `;

  const questListScroll = document.createElement('div');
  questListScroll.style.cssText = `
    position:absolute;overflow-y:auto;overflow-x:hidden;box-sizing:border-box;
    overscroll-behavior:contain;-webkit-overflow-scrolling:touch;
  `;

  const categorySidebar = document.createElement('div');
  categorySidebar.style.cssText = `
    display:flex;flex-direction:column;gap:clamp(4px,1.2vw,6px);flex-shrink:0;
    width:clamp(64px,18vw,92px);align-self:flex-start;
  `;

  const questList = document.createElement('div');
  questList.style.cssText = 'display:flex;flex-direction:column;gap:clamp(6px,1.5vw,8px);width:100%;';

  const categoryButtons = new Map<QuestCategory, HTMLDivElement>();
  let selectedCategory: QuestCategory = 'all';

  const refreshAfterClaim = (): void => {
    renderQuestList(selectedCategory);
    setSilverBadgeAmount(silverBadge, loadSave().silver);
    updateQuestCategoryNotifications(categoryButtons);
  };

  const renderQuestList = (category: QuestCategory): void => {
    questList.replaceChildren();
    const questProgress = getQuestProgress();
    const entries: { quest: Quest; progress: QuestProgress; index: number }[] = [];
    for (let i = 0; i < QUESTS.length; i++) {
      const quest = QUESTS[i];
      if (!questMatchesCategory(quest, category)) continue;
      entries.push({ quest, progress: questProgress[i], index: i });
    }
    entries.sort((a, b) => {
      const rank = (p: QuestProgress) => {
        if (p.completed && !p.claimed) return 0;
        if (!p.completed) return 1;
        return 2;
      };
      const rankDiff = rank(a.progress) - rank(b.progress);
      if (rankDiff !== 0) return rankDiff;
      return a.index - b.index;
    });
    for (const { quest, progress } of entries) {
      questList.appendChild(createQuestRow(quest, progress, refreshAfterClaim));
    }
  };

  const selectCategory = (category: QuestCategory): void => {
    selectedCategory = category;
    for (const [id, btn] of categoryButtons) {
      updateQuestCategoryButtonStyle(btn, id === category);
    }
    renderQuestList(category);
  };

  for (const cat of QUEST_CATEGORIES) {
    const btn = createQuestCategoryButton(
      QUEST_CATEGORY_ICONS[cat.id],
      t(cat.labelKey),
      cat.id === selectedCategory,
      () => selectCategory(cat.id),
    );
    categoryButtons.set(cat.id, btn);
    categorySidebar.appendChild(btn);
  }
  updateQuestCategoryNotifications(categoryButtons);

  questListScroll.appendChild(questList);
  questListPanel.appendChild(questListScroll);
  panelUnit.appendChild(categorySidebar);
  panelUnit.appendChild(questListPanel);
  panelRow.appendChild(panelUnit);
  content.appendChild(panelRow);
  questsOverlayEl.appendChild(content);

  renderQuestList(selectedCategory);
  document.body.appendChild(questsOverlayEl);

  const syncQuestPanelLayout = () => layoutQuestPanel(questListPanel, questListScroll, categorySidebar);
  requestAnimationFrame(syncQuestPanelLayout);
  questsOverlayResizeHandler = syncQuestPanelLayout;
  window.addEventListener('resize', questsOverlayResizeHandler);
}

function hideQuestsOverlay(): void {
  if (questsOverlayResizeHandler) {
    window.removeEventListener('resize', questsOverlayResizeHandler);
    questsOverlayResizeHandler = null;
  }
  questsOverlayEl?.remove();
  questsOverlayEl = null;
}

function formatQuestReward(reward: { type: string; value: string | number }): string {
  switch (reward.type) {
    case 'silver':
      return t('quest.reward_silver', { count: String(reward.value) });
    case 'weapon_unlock':
      return t(`upgrade.weapon.${String(reward.value)}`);
    case 'character_unlock':
      return t(`character.${String(reward.value)}`);
    case 'weapon_slot':
      return t('quest.reward_weapon_slot');
    default:
      return String(reward.value);
  }
}

// =============================================================================
// Start Game
// =============================================================================

let activeScene: GameScene | null = null;

function startGame(character: CharacterType = 'megachad'): void {
  if (activeScene) {
    activeScene.destroy();
    activeScene = null;
  }

  const config: GameConfig = {
    ...DEFAULT_GAME_CONFIG,
    character,
    tier: selectedTier,
    level: loadedLevel?.data,
  };

  const session = new LocalGameSession(config);
  const scene = new GameScene(session);
  activeScene = scene;
  setGMSession(session);
  scene.start();
  session.start();

  // Set tier badge text after start
  scene.setTierBadge(selectedTier);
}

// =============================================================================
// Bootstrap
// =============================================================================

async function main(): Promise<void> {
  const i18nMode = (import.meta.env.VITE_I18N_MODE as I18nMode | undefined) ?? 'locked';
  const i18nLocale = import.meta.env.VITE_I18N_LOCALE as string | undefined;

  initI18n({
    locales: { zh: zhLocale, en: enLocale },
    defaultLocale: 'en',
    fallbackLocale: 'en',
    mode: i18nMode,
    locale: i18nLocale,
  });

  await loadModels();
  // 白盒 GLB 现在是正式关卡 —— 默认加载（不再需要 ?level）。
  //   - `?level=foo` 加载 level_foo.glb（会同时探测 level_foo_col.glb 碰撞低模，见 tryLoadLevel）。
  //   - `?arena`   调试逃生口：跳过 GLB，强制回退到程序化竞技场 buildArena。
  // 注：tryLoadLevel 失败（文件缺失/解析错）时 loadedLevel=null → setupGround 自动回退竞技场。
  const params = new URLSearchParams(location.search);
  if (!params.has('arena')) {
    const name = params.get('level') || DEFAULT_LEVEL_NAME;
    await tryLoadLevel(name);
  }

  showMainMenu();
}

export function bootGameClient(): void {
  void main().catch((error) => {
    console.error('[MegaBonk] Boot failed:', error);
  });
}

// =============================================================================
// GM Tool (Debug Panel) — press ` (backtick) to toggle
// =============================================================================

let gmPanel: HTMLDivElement | null = null;
let gmSession: LocalGameSession | null = null;

function setupGMTool(): void {
  window.addEventListener('keydown', (e) => {
    if (e.key === '`' || e.key === '~') {
      toggleGMPanel();
    }
  });

  // Expose to console
  (window as any).__gm = {
    get state() { return gmSession?.getRenderState(); },
    levelUp() { gmLevelUp(); },
    addXp(amount: number = 999) { gmAddXp(amount); },
    heal() { gmHeal(); },
    kill() { gmKillAllEnemies(); },
    silver(amount: number = 1000) { gmAddSilver(amount); },
    spawnBoss() { gmSpawnBoss(); },
    godMode() { gmGodMode(); },
    skipTo(minutes: number) { gmSkipTime(minutes); },
    giveWeapon(type: string, level: number = 1) { gmGiveWeapon(type, level); },
    giveAllWeapons() { gmGiveAllWeapons(); },
    testLightning() { gmTestLightning(); },
    showCollision() { gmToggleCollisionViz(); },
    help() {
      console.log(`
GM Commands (window.__gm):
  .state              — 当前游戏状态
  .levelUp()          — 直接升级
  .addXp(999)         — 加经验
  .heal()             — 满血
  .kill()             — 杀死所有敌人
  .silver(1000)       — 加银币
  .spawnBoss()        — 召唤Boss
  .godMode()          — 无敌模式
  .skipTo(5)          — 跳到第5分钟
  .giveWeapon(type, level=1)
                      — 加指定武器（type: sword/bone_bouncer/axe/bow/
                        lightning_staff/flame_ring/shotgun）
  .giveAllWeapons()   — 一键塞满全部武器
  .testLightning()    — 在玩家头顶劈一道电（VFX 测试）
  .showCollision()    — 切换碰撞盒可视化（绿 col_ / 红 wall_ /
                        蓝 climb_ / 黄 ramp_ / 品红 spawn_*）
                        ⚠️ 默认 Neon Crucible 没有 LevelData，需要 ?level
                        加载关卡才能看到
      `);
    },
  };
}

function setGMSession(session: LocalGameSession): void {
  gmSession = session;
}

function gmLevelUp(): void {
  if (!gmSession) return;
  const state = gmSession.getRenderState();
  state.player.xp = state.player.xpToNext;
}

function gmAddXp(amount: number): void {
  if (!gmSession) return;
  const state = gmSession.getRenderState();
  state.player.xp += amount;
}

function gmHeal(): void {
  if (!gmSession) return;
  const state = gmSession.getRenderState();
  state.player.hp = state.player.maxHp;
}

function gmKillAllEnemies(): void {
  if (!gmSession) return;
  const state = gmSession.getRenderState();
  for (const enemy of state.enemies) {
    enemy.hp = 0;
  }
}

function gmAddSilver(amount: number): void {
  if (!gmSession) return;
  const state = gmSession.getRenderState();
  state.stats.silverEarned += amount;
}

function gmSpawnBoss(): void {
  if (!gmSession) return;
  const state = gmSession.getRenderState();
  (state as any).gameTime = 540; // Force boss spawn time
}

function gmGodMode(): void {
  if (!gmSession) return;
  const state = gmSession.getRenderState();
  state.player.maxHp = 99999;
  state.player.hp = 99999;
  state.player.invincibleTimer = 99999;
}

function gmSkipTime(minutes: number): void {
  if (!gmSession) return;
  const state = gmSession.getRenderState();
  (state as any).gameTime = minutes * 60;
}

const ALL_WEAPON_TYPES = [
  'sword',
  'bone_bouncer',
  'axe',
  'bow',
  'lightning_staff',
  'flame_ring',
  'shotgun',
] as const;

function gmGiveWeapon(type: string, level: number = 1): void {
  if (!gmSession) return;
  if (!ALL_WEAPON_TYPES.includes(type as typeof ALL_WEAPON_TYPES[number])) {
    console.warn(`[GM] Unknown weapon type: ${type}. Valid: ${ALL_WEAPON_TYPES.join(', ')}`);
    return;
  }
  const state = gmSession.getRenderState();
  const player = state.player;
  const existing = player.weapons.find((w) => w.type === type);
  if (existing) {
    existing.level = Math.max(existing.level, level);
    console.log(`[GM] ${type} → level ${existing.level}`);
    return;
  }
  if (player.weapons.length >= player.maxWeaponSlots) {
    console.warn(`[GM] Weapon slots full (${player.weapons.length}/${player.maxWeaponSlots})`);
    return;
  }
  player.weapons.push({
    type: type as typeof ALL_WEAPON_TYPES[number],
    level,
    cooldownTimer: 0,
    evolved: false,
  });
  console.log(`[GM] +${type} (level ${level})`);
}

function gmGiveAllWeapons(): void {
  if (!gmSession) return;
  const state = gmSession.getRenderState();
  const player = state.player;
  // Bump slot cap so all 7 fit
  if (player.maxWeaponSlots < ALL_WEAPON_TYPES.length) {
    player.maxWeaponSlots = ALL_WEAPON_TYPES.length;
  }
  for (const type of ALL_WEAPON_TYPES) {
    const existing = player.weapons.find((w) => w.type === type);
    if (!existing) {
      player.weapons.push({ type, level: 1, cooldownTimer: 0, evolved: false });
    }
  }
  console.log(`[GM] All weapons granted (${player.weapons.length}/${player.maxWeaponSlots})`);
}

function gmTestLightning(): void {
  if (!gmSession || !activeScene) {
    console.warn('[GM] No active scene');
    return;
  }
  const state = gmSession.getRenderState();
  const p = state.player;
  // 在玩家头顶劈一道（不依赖敌人，纯视觉测试）
  activeScene.debugSpawnLightning(p.x, 0, p.z);
  console.log(`[GM] 强制劈电 @ (${p.x.toFixed(1)}, 0, ${p.z.toFixed(1)})`);
}

function gmToggleCollisionViz(): void {
  if (!activeScene) {
    console.warn('[GM] No active scene');
    return;
  }
  const visible = activeScene.debugToggleCollisionViz();
  console.log(`[GM] Collision viz: ${visible ? 'ON' : 'OFF'}`);
}

function toggleGMPanel(): void {
  if (gmPanel) {
    gmPanel.remove();
    gmPanel = null;
    return;
  }

  gmPanel = document.createElement('div');
  gmPanel.dataset.cameraBlock = 'true';
  gmPanel.style.cssText = 'position:fixed;top:60px;left:10px;background:rgba(0,0,0,0.85);color:#0f0;font-family:monospace;font-size:12px;padding:10px;border-radius:8px;z-index:9999;display:flex;flex-direction:column;gap:6px;max-width:160px;border:1px solid #0f0;';

  const title = document.createElement('div');
  title.style.cssText = 'color:#ff0;font-weight:bold;font-size:13px;margin-bottom:4px;';
  title.textContent = 'GM TOOL (`)';
  gmPanel.appendChild(title);

  const buttons: [string, () => void][] = [
    ['升级 +1', gmLevelUp],
    ['加 XP ×999', () => gmAddXp(999)],
    ['满血', gmHeal],
    ['杀全部敌人', gmKillAllEnemies],
    ['加 1000 银币', () => gmAddSilver(1000)],
    ['召唤 Boss', gmSpawnBoss],
    ['无敌模式', gmGodMode],
    ['跳到 5 分钟', () => gmSkipTime(5)],
    ['跳到 8 分钟', () => gmSkipTime(8)],
    ['+闪电法杖 (Lv5)', () => gmGiveWeapon('lightning_staff', 5)],
    ['+剑 (Lv5)', () => gmGiveWeapon('sword', 5)],
    ['+火焰环 (Lv5)', () => gmGiveWeapon('flame_ring', 5)],
    ['给我所有武器', gmGiveAllWeapons],
    ['⚡测试闪电特效⚡', gmTestLightning],
    ['🟩 切换碰撞盒可视化', gmToggleCollisionViz],
  ];

  for (const [label, fn] of buttons) {
    const btn = document.createElement('button');
    btn.style.cssText = 'background:#222;color:#0f0;border:1px solid #0f0;padding:4px 8px;border-radius:4px;cursor:pointer;font-family:monospace;font-size:11px;text-align:left;';
    btn.textContent = label;
    btn.addEventListener('click', fn);
    btn.addEventListener('mouseenter', () => { btn.style.background = '#0f0'; btn.style.color = '#000'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = '#222'; btn.style.color = '#0f0'; });
    gmPanel.appendChild(btn);
  }

  document.body.appendChild(gmPanel);
}

setupGMTool();
