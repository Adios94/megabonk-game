/// <reference types="vite/client" />
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
// @ts-ignore
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
// @ts-ignore
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
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
  CHEST_INTERACT_MAX_Y_DELTA,
  RELICS,
  BONDS,
  evalBondCounts,
  bondThresholds,
  type BondId,
  type BondTier,
  type ConsumableId,
  getChestGoldCost,
  loadSave,
  saveSave,
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
import { uiPlainText, uiPlainTextBold, uiColoredText, uiColoredTextBold, UI_PLAIN_TEXT_STYLE, UI_TEXT_OUTLINE_SHADOW, UI_BAR_TEXT_LAYER } from './ui/textStyle.ts';
import {
  createUpgradeFrameCard,
  upgradeFrameUrl,
  upgradeStatRow,
  type ItemFrameRarity,
} from './ui/itemFrame.ts';
import { mountSvgBar, mountSvgBarSliced, mountSvgBarTiled, setSvgBarPercent, BAR_ASSETS } from './ui/progressBar.ts';
import {
  createBossSummonIndicator,
  createTempleChargeIndicator,
  SHRINE_INTERACT_RADIUS,
  applyShrineChargeHudLayout,
  type BossSummonIndicator,
  type TempleChargeIndicator,
} from './ui/circularProgress.ts';
import { uiPx } from './ui/scale.ts';
import { applyPlatformJoystickSkin } from './ui/joystickSkin.ts';
import {
  setMobileAltarInteractState,
  setMobileChestInteractState,
  removeMobileActionCluster,
  setInGameTouchControlsEnabled,
  setupMobileActionButtons,
} from './ui/touchActionButtons.ts';
import {
  applyCardRowDirection,
  bindResponsiveLayout,
  createInGameChoiceCardRow,
  createInGameChoiceCenterGroup,
  ensureTransparentScrollbarStyles,
  HUD_TOP_BELOW_CLUSTER,
  INGAME_REWARD_ROW_GAP,
  inGameChoiceOverlayStyle,
  isUiNarrow,
  isUiShort,
  modalOverlayStyle,
  OVERLAY_SAFE_AREA,
  shopGridColumnCount,
  UI_SCROLLBAR_TRANSPARENT_CLASS,
} from './ui/layout.ts';
import { createPauseDataPanel, PAUSE_SIDE_PANEL_WIDTH } from './ui/pauseDataPanel.ts';
import { playTransition } from './ui/sceneTransition.ts';
import type { I18nMode } from '@minigame/i18n';
import { EventEmitter } from './session/EventEmitter.ts';

import zhLocale from '../../../i18n/zh.json';
import enLocale from '../../../i18n/en.json';

// =============================================================================
// Pool Caps & Resource Disposal
// =============================================================================
// 对象池上限：超过这个数量的"空闲"实例不再缓存，直接释放。
// 之所以要设上限：游戏过程中如果某个瞬间有很多敌人/投射物同时存在，池子会被
// 撑大；当后续不再需要那么多时，多余的实例若不释放，会一直占据内存（材质/
// 骨架包装器/动画 mixer 都会留在 GPU/JS 堆里），最终触发 Major GC 大暂停。
const ENEMY_POOL_CAP_PER_TYPE = 24;
const PROJECTILE_POOL_CAP = 16;
const AREA_EFFECT_POOL_CAP_PER_KIND = 8;

// userData 上的标记：true 表示此材质是"为单个对象 clone 出来的私有副本"，
// 当对象被丢弃时可以安全 dispose；不带此标记的材质视为全局共享，禁止 dispose
// （否则会破坏其它仍在使用该材质的 mesh）。
const OWNED_CLONE_KEY = '__ownedClone';

/**
 * 释放一个被丢弃对象（池子超限被踢出）的可释放资源。
 *
 * 原则：
 *  - 只 dispose 带 OWNED_CLONE_KEY 的材质（来自 cloneHitFlashMaterial）。
 *  - 永不 dispose geometry —— SkeletonUtils.clone / Object3D.clone 共享几何体，
 *    随便 dispose 会让其它克隆体的 GPU 资源失效。
 *  - 几何体 GPU 资源由原始模型持有，clone 包装器被 GC 后整体内存会下降。
 */
function disposeOwnedResources(obj: THREE.Object3D): void {
  obj.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (m && m.userData && m.userData[OWNED_CLONE_KEY]) {
        m.dispose();
      }
    }
  });
}

// =============================================================================
// GPU Curved World (Rolling Horizon) System
// =============================================================================

export const curvedWorldUniforms = {
  uWarpCenter: { value: new THREE.Vector3(0, 0, 0) },
  uWarpStrength: { value: 0.015 } // adjustable! Default to 1/66.6 radius
};

// Global patch on THREE.Material to inject GPU curved world warp on all meshes and sprites!
const originalOnBeforeCompile = THREE.Material.prototype.onBeforeCompile;
THREE.Material.prototype.onBeforeCompile = function (shader, renderer) {
  if (originalOnBeforeCompile) {
    originalOnBeforeCompile.call(this, shader, renderer);
  }

  const allowedTypes = [
    'MeshBasicMaterial',
    'MeshToonMaterial',
    'MeshStandardMaterial',
    'MeshPhysicalMaterial',
    'SpriteMaterial',
    'MeshPhongMaterial',
    'MeshLambertMaterial'
  ];

  if (this.isMaterial && (allowedTypes.includes(this.type) || (this as any).isMeshStandardMaterial || (this as any).isMeshBasicMaterial || (this as any).isSpriteMaterial || (this as any).isMeshToonMaterial)) {
    if (!this.userData) this.userData = {};
    if (!this.userData.uIsBackground) {
      this.userData.uIsBackground = { value: this.userData.isBackground ? 1.0 : 0.0 };
    }

    shader.uniforms['uWarpCenter'] = curvedWorldUniforms.uWarpCenter;
    shader.uniforms['uWarpStrength'] = curvedWorldUniforms.uWarpStrength;
    shader.uniforms['uIsBackground'] = this.userData.uIsBackground;

    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        `uniform vec3 uWarpCenter;\nuniform float uWarpStrength;\nuniform float uIsBackground;\nvoid main() {`
      );

    if (this.type === 'SpriteMaterial') {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `
        vec4 mvPosition = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif

        vec4 gpWorldPos = modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
        vec3 diff = gpWorldPos.xyz - uWarpCenter;
        float d = length(diff.xz);

        if (d > 1e-5 && uWarpStrength > 0.0 && uIsBackground < 0.5) {
            float theta = d * uWarpStrength;
            float sinTheta = sin(theta);
            float cosTheta = cos(theta);
            vec2 dir = diff.xz / d;

            vec3 normal = vec3(sinTheta * dir.x, cosTheta, sinTheta * dir.y);
            float r = (1.0 / uWarpStrength) + diff.y;
            vec3 warpedPos = r * normal;
            warpedPos.y -= (1.0 / uWarpStrength);

            gpWorldPos.xyz = uWarpCenter + warpedPos;
            mvPosition = viewMatrix * gpWorldPos;
        }

        vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
        #ifndef USE_SIZEATTENUATION
          bool isPerspective = isPerspectiveMatrix( projectionMatrix );
          if ( isPerspective ) scale *= - mvPosition.z;
        #endif

        mvPosition.xy += position.xy * scale;
        gl_Position = projectionMatrix * mvPosition;
        `
      );
    } else {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `
        vec4 localPos = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          localPos = instanceMatrix * localPos;
        #endif
        vec4 gpWorldPos = modelMatrix * localPos;

        vec3 diff = gpWorldPos.xyz - uWarpCenter;
        float d = length(diff.xz);

        if (d > 1e-5 && uWarpStrength > 0.0 && uIsBackground < 0.5) {
            float theta = d * uWarpStrength;
            float sinTheta = sin(theta);
            float cosTheta = cos(theta);
            vec2 dir = diff.xz / d;

            vec3 normal = vec3(sinTheta * dir.x, cosTheta, sinTheta * dir.y);
            float r = (1.0 / uWarpStrength) + diff.y;
            vec3 warpedPos = r * normal;
            warpedPos.y -= (1.0 / uWarpStrength);

            gpWorldPos.xyz = uWarpCenter + warpedPos;
        }

        vec4 mvPosition = viewMatrix * gpWorldPos;
        gl_Position = projectionMatrix * mvPosition;
        `
      );

      // Normal rotation for non-basic lighted materials to align with spherical curvature
      shader.vertexShader = shader.vertexShader.replace(
        '#include <defaultnormal_vertex>',
        `
        #include <defaultnormal_vertex>

        vec3 gpWorldPosForNormal = (modelMatrix * vec4(position, 1.0)).xyz;
        vec3 diffForNormal = gpWorldPosForNormal - uWarpCenter;
        float dForNormal = length(diffForNormal.xz);

        if (dForNormal > 1e-5 && uWarpStrength > 0.0 && uIsBackground < 0.5) {
            float theta = dForNormal * uWarpStrength;
            vec2 dir = diffForNormal.xz / dForNormal;
            vec3 viewAxis = normalize( mat3(viewMatrix) * vec3( -dir.y, 0.0, dir.x ) );
            
            float cosA = cos(theta);
            float sinA = sin(theta);
            transformedNormal = transformedNormal * cosA + cross(viewAxis, transformedNormal) * sinA + viewAxis * dot(viewAxis, transformedNormal) * (1.0 - cosA);
            transformedNormal = normalize(transformedNormal);
        }
        `
      );
    }
  }
};

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
  | 'muzzle' | 'magic_circle' | 'portal_swirl' | 'scorch' | 'dirt' | 'flame'
  | 'twirl' | 'slash_fill' | 'flame_aura' | 'lightning' | 'flare' | 'void_ripple'
  | 'scorch_boots' | 'enemy_bullet';

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
  twirl: '/textures/particle_twirl.png',
  flare: '/textures/particle_flare.png',
  void_ripple: '/textures/vfx/void_ripple.png',
  // ↓ 以下 5 个 key 的贴图当前与另一 key 字节完全相同（同一占位图被复制了两份）。
  // 去重：删掉重复文件，让这些 key 复用对应的「主」文件，省发布体积。
  // ⚠️ 若将来要给某个特效做专属贴图（让它与主文件分化），请：
  //    1) 在 public/textures/vfx/ 放回独立文件（如 lightning.png）；2) 把这里的路径改回去。
  slash_fill: '/textures/vfx/portal_swirl.png', // 原 slash_fill.png == portal_swirl.png
  flame_aura: '/textures/vfx/light.png',        // 原 flame_aura.png == light.png
  lightning: '/textures/vfx/spark.png',         // 原 lightning.png == spark.png
  scorch_boots: '/textures/vfx/scorch.png',     // 原 scorch_boots.png == scorch.png
  enemy_bullet: '/textures/vfx/muzzle.png',     // 原 enemy_bullet.png == muzzle.png
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

type HitFlashMaterial = THREE.Material & {
  color?: THREE.Color;
  emissive?: THREE.Color;
};

const HIT_FLASH_BASE_COLOR_KEY = '__hitFlashBaseColor';
const HIT_FLASH_BASE_EMISSIVE_KEY = '__hitFlashBaseEmissive';
const HIT_FLASH_TINT_INTENSITY = 0.88;
const HIT_FLASH_EMISSIVE_STRENGTH = 0.2;
const PLAYER_SHIELD_HIT_FLASH_COLOR = 0x9edcff;
const PLAYER_HP_HIT_FLASH_COLOR = 0xff3333;
const PLAYER_HIT_FLASH_DURATION = 0.18;

const START_INTRO_FADE_TO_BLACK_SECONDS = 0.28;
const START_INTRO_WALK_SECONDS = 1.55;
const START_INTRO_IDLE_SECONDS = 0.65;
const START_INTRO_IDLE_SETTLE_SECONDS = 0.25;
const START_INTRO_REVEAL_SECONDS = 0.75;
const START_INTRO_WALK_DISTANCE = 10.5;
const START_INTRO_TOP_CAMERA_HEIGHT = 13;

interface StartIntroState {
  elapsed: number;
  spawnX: number;
  spawnY: number;
  spawnZ: number;
  overlay: HTMLDivElement;
  worldRevealed: boolean;
  revealAlpha: number;
  idleFlavorStarted: boolean;
  idleFlavorDuration: number;
  onComplete: () => void;
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

  start(options: { startTickLoop?: boolean } = {}): void {
    this.game.start();
    this.events.emit('game_init', { state: this.game.getState() });
    if (options.startTickLoop ?? true) {
      this.startTickLoop();
    }
  }

  startTicks(): void {
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

// 视觉离地高度（米）—— 纯渲染偏移，不影响 core 逻辑（碰撞 / preferredRange 走水平 x/z）。
// 用飞行/飘浮模型的地面单位（dragon / ghost）抬离地面更自然。gargoyle 的飞行高度由
// core 的 dive 行为（y=1.8）控制，不在此叠加。
const ENEMY_HOVER_OFFSET: Record<string, number> = {
  // skeleton_archer 现用 KayKit 法师（落地人形），不再悬浮；仅 necromancer(ghost) 飘浮
  necromancer: 1.0,     // 幽灵 — 飘浮（离地 1m）
};

// ── 敌人动画 LOD（同屏大量怪：按到相机距离 + 视锥分档降频 mixer.update）─────────
// 蒙皮动画的骨骼矩阵重算是同屏 100 怪时的主 CPU 开销，且与是否在屏幕内无关。
// 近处满帧、中/远降频、视锥外冻结；降频时累积 dt 一次性补上，保证动画速率不变。
const ENEMY_ANIM_LOD_NEAR = 16;        // 米：此距离内每帧更新
const ENEMY_ANIM_LOD_FAR = 34;         // 米：NEAR..FAR 隔帧，超过则每 4 帧
const ENEMY_ANIM_LOD_NEAR_SQ = ENEMY_ANIM_LOD_NEAR * ENEMY_ANIM_LOD_NEAR;
const ENEMY_ANIM_LOD_FAR_SQ = ENEMY_ANIM_LOD_FAR * ENEMY_ANIM_LOD_FAR;
const ENEMY_ANIM_LOD_MID_STRIDE = 2;   // 中距：每 2 帧更新一次
const ENEMY_ANIM_LOD_FAR_STRIDE = 4;   // 远距：每 4 帧更新一次

// ── 敌人视距剔除（visible=false 直接跳过渲染 + skeleton.update + boneTexture 上传）─────
// Three.js 会在 projectObject 里以 obj.visible 短路整棵子树，连 SkinnedMesh 的骨骼矩阵
// 重算和 texSubImage2D 上传都会跳过。这是真正能砍掉骨骼纹理上传带宽的唯一办法。
// 20m：实测 35m 时几乎没怪被剔（far-culled ≈ 1/66），多数远怪本来也在视锥外。压到
// 20m 后视锥外的远怪也能被 visible=false 短路掉 SkinnedMesh 上传；20m 是玩家典型
// 战斗交战半径（武器射程多在 5–12m），20m 外的怪即使在视锥内屏幕上也只占几像素，
// pop-in 仍可接受。
const ENEMY_VISIBLE_CULL_DIST = 20;
const ENEMY_VISIBLE_CULL_SQ = ENEMY_VISIBLE_CULL_DIST * ENEMY_VISIBLE_CULL_DIST;

const WEAPON_PROJECTILE_COLORS: Record<string, number> = {
  sword: 0xcccccc,
  bone_bouncer: 0xf5f5dc,
  axe: 0x888888,
  pistol: 0xffcc44, // gold/brass bullet
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
const DAMAGE_NUMBER_FONT_FAMILY = "'Lilita One', 'Press Start 2P', monospace";

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

  const drawEmojiFallback = () => {
    ctx.font = '68px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(CONSUMABLE_EMOJI[consumableId] ?? '✨', 64, 66);
  };

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  consumableEmojiTextureCache.set(consumableId, texture);

  // PNG 图标异步加载：加载完绘制到画布中心并刷新纹理；失败则回退 emoji。
  const iconImg = new Image();
  iconImg.onload = () => {
    const box = 88;
    const ar = iconImg.width / iconImg.height || 1;
    let w = box, h = box;
    if (ar > 1) h = box / ar; else w = box * ar;
    ctx.drawImage(iconImg, 64 - w / 2, 64 - h / 2, w, h);
    texture.needsUpdate = true;
  };
  iconImg.onerror = () => {
    drawEmojiFallback();
    texture.needsUpdate = true;
  };
  iconImg.src = consumableIconSrc(consumableId);

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
  megachad: '/ui/characters/megachad_avatar.webp',
  roberto: '/ui/characters/roberto_avatar.webp',
  skateboard_skeleton: '/ui/characters/skateboard_skeleton_avatar.webp',
};

const CHARACTER_AVATAR_FRAME_PATHS: Record<CharacterType, { normal: string; selected: string }> = {
  megachad: {
    normal: '/ui/characters/megachad_avatar_normal.png',
    selected: '/ui/characters/megachad_avatar_selected.png',
  },
  roberto: {
    normal: '/ui/characters/roberto_avatar_normal.png',
    selected: '/ui/characters/roberto_avatar_selected.png',
  },
  skateboard_skeleton: {
    normal: '/ui/characters/skateboard_skeleton_avatar_normal.png',
    selected: '/ui/characters/skateboard_skeleton_avatar_selected.png',
  },
};

const CHARACTER_FULL_PATHS: Record<CharacterType, string> = {
  megachad: '/ui/characters/megachad_full.webp',
  roberto: '/ui/characters/roberto_full.webp',
  skateboard_skeleton: '/ui/characters/skateboard_skeleton_full.webp',
};

const CHARACTER_LOCKED_OVERLAY_PATH = '/ui/characters/locked_character.png';

// 本地 Lilita One（拉丁） + Noto Sans SC（中文/CJK）。
// 不再走 Google Fonts CDN，也不再叠像素字体 fallback。
const UI_FONT_FACE = '"Lilita One","Noto Sans SC",Arial,sans-serif';

const GAME_UI_FONT_FILES = {
  lilitaOneTtf: '/fonts/LilitaOne-Regular.ttf',
  notoSansScVf: '/fonts/NotoSansSC-VF.ttf',
} as const;

function installGameUIFonts(): void {
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

async function ensureGameUIFontsLoaded(): Promise<void> {
  installGameUIFonts();
  await Promise.all([
    document.fonts.load(`16px "Lilita One"`),
    document.fonts.load(`bold 60px "Lilita One"`),
    document.fonts.load(`16px "Noto Sans SC"`),
    document.fonts.load(`bold 16px "Noto Sans SC"`),
  ]);
}

const CHARACTER_SELECT_BACK_ICON = '/ui/button/back.svg';
const LANG_BUTTON_CN = '/ui/button/btn_lang_cn.png';
const LANG_BUTTON_EN = '/ui/button/btn_lang_en.png';
const CHARACTER_DETAIL_PANEL_BG = '/ui/panel/svg/character_detail.svg';
/**
 * character_detail.svg 原图 3465×4897（AR 0.708，竖卡）。
 * 顶部浅蓝色 title bar 占 y 0~625（12.76%），下方深蓝色 body 占 y 625~4817。
 * 注：所有下方布局常量都按新画布的"像素"度量；helper 把它们除以 SIZE 转成 %。
 */
const CHARACTER_DETAIL_PANEL_SIZE = { w: 3465, h: 4897 } as const;
/** 浅色顶栏（角色名）；新 SVG 顶栏到 y=625。 */
const CHARACTER_DETAIL_TITLE_BAR = { top: 0, height: 625 } as const;
/** 深色内容区（描述 / 属性 / 武器 / 确认）从 y=625 开始。 */
const CHARACTER_DETAIL_BODY = { top: 625 } as const;
const CHARACTER_WEAPON_DETAIL_PANEL_BG = '/ui/panel/character_weapon_detail.png';
/** character_weapon_detail.png 原图 1435×621（未变） */
const CHARACTER_WEAPON_DETAIL_PANEL_SIZE = { w: 1435, h: 621 } as const;
/**
 * 内部布局。
 * - `bodyPad` 数值相对 3465×4897 的 character_detail 画布（×10.63/×11.80 由老 326×415 等比放大）。
 * - `weaponPad` 数值相对 1435×621 的 character_weapon_detail.png（**该图未放大**，
 *   所以必须沿用老的小数值；之前误把 weaponPad 当成"也跟着 character_detail 放大 10 倍"，
 *   导致 left+right 吃掉 81% 横向空间、武器文字栏被压成一字宽看似竖排）。
 */
const CHARACTER_DETAIL_LAYOUT = {
  /**
   * 深色内容区内边距（值相对新 3465×4897 设计）。
   * - top/bottom 沿用 SVG 几何（描述/确认按钮跟 SVG 内嵌槽对齐）。
   * - x = 45：对齐 SVG **body 深色面板**的内描边（path d=M30 576... stroke-width 30，
   *   描边内缘在 x=45），= 1.30% inset。内容（描述/属性条/天赋）**紧贴**深色
   *   面板的可视边界，既不溢出 card，也不留多余空白。
   *
   *   武器嵌入槽自带更大的 inset（rect x=108.5，3.13%），所以 stats 行会显得比
   *   武器槽略宽——这是目标视觉。
   *
   * 注意：bodyArea 的 cssText 仍兼容**负值**——负数会切换成 negative left/right
   *   + padding=0 的等价实现，让以后想"贴边外溢"时改这里即可。
   */
  bodyPad: { top: 94, x: 108.5, bottom: 118 },
  sectionGap: 'clamp(6px,1.2vw,10px)',
  /** 武器子面板内边距，值相对 1435×621（未放大的 character_weapon_detail.png） */
  weaponPad: { top: 12, left: 62, right: 48, bottom: 12 },
  /** 武器子面板相对内容区宽度（嵌套在 character_detail 内，不可超出） */
  weaponPanelWidth: '100%',
  /** 武器框与确认按钮之间的间距（武器框相对确认按钮定位） */
  weaponConfirmGap: 'clamp(6px,1.5vw,10px)',
} as const;
/** title bar 左右 padding 值（原 326 设计的 20px，按新画布等比放大）。 */
const CHARACTER_DETAIL_TITLE_BAR_PAD_X = 213;
/**
 * 底图自带的蓝色圆角嵌入槽（rect x=108.5 y=2863.5 w=3248 h=1206 / 画布 3465×4897）。
 * 武器卡直接 absolute 锚到这里，**不走** bodyArea 的 flex 流，所以它能跨过 bodyPad
 * 横向延伸到比内容区更宽（蓝框两侧 inset 只有 3.13%，而 bodyPad.x 是 7.97%）。
 */
const CHARACTER_DETAIL_WEAPON_SLOT = {
  leftPct: (108.5 / 3465) * 100,
  rightPct: (108.5 / 3465) * 100,
  topPct: (2863.5 / 4897) * 100,
  heightPct: (1206 / 4897) * 100,
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
  1: '/ui/panel/svg/difficulty_normal.svg',
  2: '/ui/panel/svg/difficulty_hard.svg',
  3: '/ui/panel/svg/difficulty_nightmare.svg',
};

/** 难度角徽（叠在卡片左上角，与居中的难度名文字共存） */
const TIER_PANEL_ICONS: Record<DifficultyTier, string> = {
  1: '/ui/icon/difficulty_normal.png',
  2: '/ui/icon/difficulty_hard.png',
  3: '/ui/icon/difficulty_nightmare.png',
};

/**
 * 左上角图标位置（相对卡片）—— **按 tier 分别配**。
 *
 * 三张 PNG 都是 500×500，但内容包围盒差异巨大：
 *   - normal     (1)：骷髅集中在画布左下，约 x=100~330 / y=240~475，右上一大片是透明
 *   - hard       (2)：火焰骷髅居中略偏下，约 x=120~400 / y=140~450，四周有中等缓冲
 *   - nightmare  (3)：火焰骷髅几乎填满整张画布，约 x=50~470 / y=30~470，顶/左几乎无缓冲
 *
 * 如果用同一组负偏移，nightmare 因为没有透明缓冲，火焰顶部会真的被推到卡外，
 * 在手机上又被 PREP_STAGE_STYLE 的 overflow:auto 裁掉，表现为"图标缺了一角"。
 * 这里按各自包围盒"吃掉透明空隙"的目标反推 left/top，让三张图的**可视内容**
 * 在卡片左上角呈现接近的"探出"效果。配套要求：卡片 div 必须 `overflow:visible`。
 */
const TIER_PANEL_ICON_LAYOUT: Record<DifficultyTier, { leftPct: number; topPct: number; widthPct: number }> = {
  1: { leftPct: -10, topPct: -14, widthPct: 42 },
  2: { leftPct: -6, topPct: -9, widthPct: 38 },
  3: { leftPct: -2, topPct: -4, widthPct: 32 },
};

/**
 * 难度面板 anatomy（三张 SVG 完全统一）。
 *
 * 新版 difficulty_{normal,hard,nightmare}.svg 都是 2485×2997，主面板矩形 (30,26)→(2455,2936)
 * 几乎占满画布；内部 3 个 stat 行槽位的 y 坐标也完全相同：
 *   stat 行：x=219 y=822/1324/1826 w=2047 h=395（绝对 SVG 像素）
 *   3 个难度图标（leaf/star/coin）分别叠在 3 个 stat 行的左侧
 *   stat 行 3 下方 y=2221~2936 是空白区，用于浮放「选择」按钮
 *
 * 把所有数值换算成百分比，统一作用于所有 tier。
 */
const TIER_PANEL_SIZE = { w: 2485, h: 2997 } as const;

/** 难度名文字浮在 stat 行 1 之上（y=26~822 ≈ 0.87%~27.43% 是空白头部）。 */
const TIER_TITLE_BAR_LAYOUT = { topPct: 3.5, heightPct: 21.5 } as const;

/** 3 个 stat 行：y = 822/1324/1826, h = 395, 画布 h = 2997 */
const TIER_STAT_ROW_LAYOUT = [
  { topPct: 27.428, heightPct: 13.180 },
  { topPct: 44.177, heightPct: 13.180 },
  { topPct: 60.927, heightPct: 13.180 },
] as const;

/** 「选择」按钮锚在 stat 行 3 下方的空白区（bottomPct=4，离底边留点呼吸）。 */
const TIER_SELECT_BUTTON_LAYOUT = { bottomPct: 4, widthPct: 50 } as const;

function tierInsetXPct(valueSvgPx: number): string {
  return `${((valueSvgPx / TIER_PANEL_SIZE.w) * 100).toFixed(3)}%`;
}

const SHOP_ITEM_LIST_PANEL_BG = '/ui/shop/event-bg.svg';
/** event-bg.svg 原图 8342×4700 */
/** 商店商品卡与 event-bg 整体显示倍率（相对基准尺寸） */
const SHOP_DISPLAY_SCALE = 1.3;
/** shop_item_bg 内文字/图标/按钮等内容相对网格字号的缩放 */
const SHOP_CARD_CONTENT_SCALE = 0.95;

/** event-bg 内缘相对商品网格的留白（px，随 uiScale 缩放） */
function shopPanelPadPx(): { x: number; y: number } {
  return { x: uiPx(Math.round(12 * SHOP_DISPLAY_SCALE)), y: uiPx(Math.round(10 * SHOP_DISPLAY_SCALE)) };
}

function shopGridGapPx(): number {
  return isUiNarrow()
    ? Math.round(uiPx(Math.round(4 * SHOP_DISPLAY_SCALE)))
    : Math.round(uiPx(Math.round(6 * SHOP_DISPLAY_SCALE)));
}

function shopCardAspect(): number {
  return SHOP_ITEM_PANEL_SIZE.h / SHOP_ITEM_PANEL_SIZE.w;
}

/** 单卡目标宽度上限（只缩 event-bg，不随视口放大商品卡） */
function shopTargetCardWidthPx(): number {
  const base = isUiNarrow() && isUiShort() ? 92 : isUiNarrow() ? 102 : 114;
  return Math.round(uiPx(base) * SHOP_DISPLAY_SCALE);
}

function computeShopCardWidthPx(stageW: number, stageH: number): number {
  const cols = shopGridColumnCount();
  const rows = Math.ceil(SHOP_UPGRADES.length / cols);
  const gap = shopGridGapPx();
  const pad = shopPanelPadPx();
  const cardAspect = shopCardAspect();
  const target = shopTargetCardWidthPx();

  const maxCardWByW = (stageW - pad.x * 2 - gap * (cols - 1)) / cols;
  const maxCardWByH = (stageH - pad.y * 2 - gap * (rows - 1)) / rows / cardAspect;
  return Math.max(Math.round(58 * SHOP_DISPLAY_SCALE), Math.floor(Math.min(target, maxCardWByW, maxCardWByH)));
}

function syncShopPanelLayout(
  shopStage: HTMLElement,
  itemListPanel: HTMLElement,
  grid: HTMLElement,
): void {
  const cols = shopGridColumnCount();
  const rows = Math.ceil(SHOP_UPGRADES.length / cols);
  const gap = shopGridGapPx();
  const pad = shopPanelPadPx();
  const stageW = Math.max(120, shopStage.clientWidth);
  const stageH = Math.max(120, shopStage.clientHeight);
  const cardW = computeShopCardWidthPx(stageW, stageH);
  const cardH = Math.round(cardW * shopCardAspect());

  grid.style.gridTemplateColumns = `repeat(${cols}, ${cardW}px)`;
  grid.style.gridTemplateRows = `repeat(${rows}, ${cardH}px)`;
  grid.style.gap = `${gap}px`;

  const gridW = cols * cardW + gap * (cols - 1);
  const gridH = rows * cardH + gap * (rows - 1);
  const panelW = gridW + pad.x * 2;
  const panelH = gridH + pad.y * 2;

  itemListPanel.style.width = `${panelW}px`;
  itemListPanel.style.height = `${panelH}px`;
  itemListPanel.style.padding = `${pad.y}px ${pad.x}px`;

  const fromW = cardW / 12;
  const fromH = cardH / 13;
  grid.style.fontSize = `${Math.max(Math.round(10 * SHOP_DISPLAY_SCALE), Math.min(Math.round(14 * SHOP_DISPLAY_SCALE), Math.round(Math.min(fromW, fromH))))}px`;
}

const SHOP_ITEM_PANEL_BG = '/ui/shop/shop_item_bg.svg';
/**
 * shop_item_bg.svg 原图 1896×2054（portrait，aspect ≈ 0.923）。
 *
 * 注意：老版本 PNG 是 452×428 的 landscape，所以这里**必须用新尺寸**，
 * 否则 card div 会按 landscape 撑开，而 background 走 contain 会把 SVG 缩到中间留出
 * 左右黑边，cardInner 用 `inset 5% 4%` 算的内容区就完全落在 SVG 可视卡之外，
 * 出现"标题/图标/按钮全部错位到背景外"的视觉问题。
 *
 * SVG 内部 anatomy（用于参考 cardInner 内边距）：
 * - 外描边圆角矩形：(17.5, 13.5)→1861×1977，约 1.6% 横向 / 1.3% 纵向 inset
 * - 实心填充矩形：  (31, 27)→1834×1950，约 1.6% 横向 / 1.3% 纵向 inset
 * - 底部装饰波浪：  y=1702 起，到 1885，仅装饰；正文区到 ~y=1702 (≈83%) 收尾较安全
 */
const SHOP_ITEM_PANEL_SIZE = { w: 1896, h: 2054 } as const;
const SHOP_BUY_BUTTON_FRAME = '/ui/button/button_green.svg';
const SHOP_BUY_BUTTON_PRESSED_FRAME = '/ui/button/button_green_pressed.svg';

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

/**
 * 商店升级进度条。
 *
 * 段数 = `maxLevel`（3 / 5 / 10），**不再固定 10 段**。每段是一个独立 `<img>`：
 *   - 未点亮 → `stat_track_single.svg`（暗色胶囊）
 *   - 已点亮 → `stat_fill.svg`（亮蓝胶囊）
 *
 * 之所以不复用角色面板的"10 段轨道 + 平铺填充"美术：商店每个升级的真实
 * `maxLevel` 不同，10 段固定轨道在 maxLevel=3/5 上会出现"满级了但还有空段"
 * 的视觉错位（升满 → 100% 也只点亮 5 段、剩下 5 段是空的）。按 maxLevel
 * 实际拼段才能让"满级 = 全部点亮"。
 *
 * 与 `mountSvgBarTiled` 的差别：那个走"满宽填充 + clip-path 裁剪"路线，
 * 段数只在视觉上由填充背景平铺产生；这里要的是"真实 N 段独立元素"。
 */
function createShopLevelSegments(currentLevel: number, maxLevel: number): HTMLDivElement {
  const container = document.createElement('div');
  container.style.cssText = `
    display:flex;align-items:center;gap:clamp(1px,0.15em,3px);
    flex:1 1 0;min-width:0;height:0.8em;align-self:center;
  `;
  const litCount = Math.max(0, Math.min(maxLevel, currentLevel));
  for (let i = 0; i < maxLevel; i++) {
    const seg = document.createElement('img');
    // 商店进度条用橙色填充（和 stat_fill.svg 同结构，仅换色），与角色面板的蓝色 stat 条做视觉区分。
    seg.src = i < litCount ? '/ui/bar/stat_fill_orange.svg' : BAR_ASSETS.stat.trackSingle;
    seg.alt = '';
    seg.draggable = false;
    // 每段宽度均分；`stat_track_single.svg` / `stat_fill.svg` 都带
    // `preserveAspectRatio="none"`，会按容器宽高自由拉伸，所以不会 letterbox。
    seg.style.cssText = 'flex:1 1 0;min-width:0;height:100%;display:block;';
    container.appendChild(seg);
  }
  return container;
}

const STARTING_WEAPON_IMAGE_PATHS: Record<string, string> = {
  sword: '/ui/icon/weapon/sword.png',
  axe: '/ui/icon/weapon/axe.png',
  bone_bouncer: '/ui/icon/weapon/bone_bouncer.png',
};

// ─────────────────────────────────────────────────────────────────────────
// 物品 PNG 图标路径（public/ui/icon/<分类>/<id>.png）。
// 文件名与游戏内 id 一一对应，故按 id 直接拼路径即可。
// 原 emoji 表保留作为图标加载失败时的兜底。
// ─────────────────────────────────────────────────────────────────────────
const weaponIconSrc = (type: string): string => `/ui/icon/weapon/${type}.png`;
const tomeIconSrc = (type: string): string => `/ui/icon/tome/${type}.png`;
const relicIconSrc = (id: string): string => `/ui/icon/artifact/${id}.png`;
const bondIconSrc = (id: string): string => `/ui/icon/bond/${id}.png`;
const consumableIconSrc = (id: string): string => `/ui/icon/consumable_items/${id}.png`;
const shrineRewardIconSrc = (reward: string): string => `/ui/icon/Shrine_Reward/${reward}.png`;

/**
 * 把一个原本以 textContent 显示 emoji 的元素替换为 PNG 图标。
 * 图标尺寸跟随元素自身的 font-size（1.25em），保持与原 emoji 相近的占位。
 * 加载失败时回退到 emoji 文本。
 */
function setIconImage(el: HTMLElement, src: string, fallbackEmoji = ''): void {
  el.textContent = '';
  const img = document.createElement('img');
  img.src = src;
  img.draggable = false;
  img.style.cssText = 'width:1.35em;height:1.35em;object-fit:contain;display:inline-block;vertical-align:middle;';
  if (fallbackEmoji) {
    img.onerror = () => {
      img.remove();
      el.textContent = fallbackEmoji;
    };
  }
  el.appendChild(img);
}

/** 生成可嵌入模板字符串（tooltip/标题）的图标 <img> HTML。 */
function iconImgHtml(src: string, sizePx = 16): string {
  return `<img src="${src}" draggable="false" style="width:${sizePx}px;height:${sizePx}px;object-fit:contain;vertical-align:middle;flex-shrink:0;" />`;
}

/** 选角详情面板：属性条分母（见 docs/index.html#characters） */
const CHARACTER_STAT_BAR_MAX = {
  hp: 200,
  speed: 6,
  damage: 1.5,
  armor: 5,
  crit: 0.15,
} as const;

// 角色选择整页背景：低多边形沙漠场景，覆盖整个 characterSelectEl；
// 中间 stage 走透明，让主角立绘直接站在沙漠地平线上。
// 共用的 PREP_SCREEN_STYLE（其他 prep 页面也吃）保持原样不动，避免影响 tier select / shop。
const CHARACTER_SELECT_PAGE_BG_IMAGE = '/ui/characters/select_bg.webp';
const CHARACTER_PREVIEW_STAGE_BG = 'transparent';

const TITLE_IMAGE_PATH_ZH = '/ui/title/title_cn.webp';
const TITLE_IMAGE_PATH_EN = '/ui/title/title_en.webp';
const OVERTIME_NOTICE_IMAGE_ZH = '/ui/title/overtime_cn.webp';
const OVERTIME_NOTICE_IMAGE_EN = '/ui/title/overtime_en.webp';
const FINAL_SWARM_NOTICE_IMAGE_ZH = '/ui/title/final_swarm_cn.webp';
const FINAL_SWARM_NOTICE_IMAGE_EN = '/ui/title/final_swarm_en.webp';

function titleImagePath(): string {
  return getLocale() === 'zh' ? TITLE_IMAGE_PATH_ZH : TITLE_IMAGE_PATH_EN;
}

function overtimeNoticeImagePath(): string {
  return getLocale() === 'zh' ? OVERTIME_NOTICE_IMAGE_ZH : OVERTIME_NOTICE_IMAGE_EN;
}

function finalSwarmNoticeImagePath(): string {
  return getLocale() === 'zh' ? FINAL_SWARM_NOTICE_IMAGE_ZH : FINAL_SWARM_NOTICE_IMAGE_EN;
}

const TITLE_POPUP_NOTICE_CONTAINER_STYLE = 'position:fixed;left:50%;top:30%;display:none;pointer-events:none;z-index:260;width:min(44vw,220px);';

function titleImageWidthStyle(): string {
  const width = getLocale() === 'zh'
    ? `min(70vw,${uiPx(320)}px)`
    : `min(78vw,${uiPx(400)}px)`;
  return `width:${width};height:auto;object-fit:contain;filter:drop-shadow(0 4px 12px rgba(0,0,0,0.65));user-select:none;`;
}
const LOBBY_BG_PATH = '/ui/common/bg_lobby.webp';
const UI_COMMON_BG_PATH = '/ui/common/bg_ui_common.webp';
const TIER_SELECT_PAGE_BG_IMAGE = '/ui/common/bg_tier_select.webp';
const SHOP_QUEST_PAGE_BG_IMAGE = '/ui/common/bg_city.webp';
/**
 * 任务面板复用商店一套 SVG（与 SHOP_ITEM_LIST_PANEL_BG / SHOP_ITEM_PANEL_BG 同源），
 * 让首页 / 商店 / 任务三处主蓝面板视觉统一。
 *
 * 外框 event-bg.svg viewBox 8342×4700，几何：
 * - 外圈黑描边圆角矩形：(24, 24) 8290×4586, rx=179, stroke-width=48
 * - 内蓝主板：(48, 48) 8242×4538, rx=155 —— 内容必须落在这块板里
 *   · 横向 inset = 48/8342 ≈ 0.58%
 *   · 顶部 inset = 48/4700 ≈ 1.02%
 *   · 底部 inset = (4700-4586)/4700 ≈ 2.43%（底部比顶部厚，给阴影留位）
 *
 * scroll-area 在内蓝板基础上再加 ~3% 呼吸 padding；底部多留 1% 给 row 阴影下溢。
 */
const QUEST_LIST_PANEL_BG = '/ui/shop/event-bg.svg';
const QUEST_LIST_PANEL_SIZE = { w: 8346, h: 4715 } as const;
/**
 * 任务行背景 Quest_item_bg.svg viewBox 10019×1301（landscape AR ≈ 7.70），几何：
 * - 灰阴影底层 `y=87..1301`（向下偏移 +87 制造 drop shadow，约占总高 6.7%）
 * - 蓝色主板    `(32.5,13.5)→9954×1241`, rx=105.5
 * - 内描边      `(61,42)→9897×1184`, rx=77
 * - 底部装饰浪 `y=1070..1241`（占 SVG 高 13.1%）—— row 内容 padding-bottom
 *   至少要 13.1% × rowHeight + 安全余量，否则文字/进度条会压到深蓝浪上。
 *
 * SVG 加 `preserveAspectRatio="none"`，row 容器走 background-size:100% 100%
 * 时内容会真正拉伸贴合 row 形状（默认 meet 会按 7.70:1 AR letterbox，
 * 已领取行 AR≈10:1 时左右会出现 ~12% 透明带）。
 */
const QUEST_ITEM_BG = '/ui/quests/Quest_item_bg.svg';
const QUEST_LIST_SCROLL_INSET = { top: 0.04, right: 0.04, bottom: 0.06, left: 0.04 } as const;
/** 分类列表相对 panel 图片顶部的下移比例（新外框无头部条，对齐 scroll-area 顶端即可） */
const QUEST_CATEGORY_SIDEBAR_OFFSET_RATIO = 0.04;

const MENU_BUTTON_FRAME = '/ui/button/button.svg';
const MENU_START_BUTTON_FRAME = '/ui/button/button_orange.svg';
const MENU_START_BUTTON_PRESSED = '/ui/button/button_orange_pressed.svg';
const CHARACTER_CONFIRM_BUTTON_FRAME = '/ui/button/button_orange.svg';
const TIER_START_BUTTON_FRAME = '/ui/button/button_yellow.svg';
const TIER_START_BUTTON_PRESSED = '/ui/button/button_yellow_pressed.svg';
const TIER_SELECT_BUTTON_NORMAL = '/ui/button/button_orange.svg';
const TIER_SELECT_BUTTON_PRESSED = '/ui/button/button_orange_pressed.svg';
const QUEST_CATEGORY_BUTTON_NORMAL = '/ui/button/button_gray.svg';
const QUEST_ACTION_BUTTON_ORANGE = '/ui/button/button_orange.svg';
const QUEST_ACTION_BUTTON_ORANGE_PRESSED = '/ui/button/button_orange_pressed.svg';
const QUEST_ACTION_BUTTON_GREEN = '/ui/button/button_green.svg';
const QUEST_ACTION_BUTTON_GREEN_PRESSED = '/ui/button/button_green_pressed.svg';
const QUEST_ACTION_BUTTON_GRAY = '/ui/button/button_gray.svg';
const QUEST_ACTION_BUTTON_GRAY_PRESSED = '/ui/button/button_gray_pressed.svg';
const PAUSE_MENU_BUTTON_GREEN = '/ui/button/button_green.svg';
const PAUSE_MENU_BUTTON_GREEN_PRESSED = '/ui/button/button_green_pressed.svg';
const PAUSE_MENU_BUTTON_GRAY = '/ui/button/button_gray.svg';
const PAUSE_MENU_BUTTON_GRAY_PRESSED = '/ui/button/button_gray_pressed.svg';
const PAUSE_MENU_BUTTON_RED = '/ui/button/button_red.svg';
const PAUSE_MENU_BUTTON_RED_PRESSED = '/ui/button/button_red_pressed.svg';
const POPUP_CONFIRM_PANEL_BG = '/ui/panel/popup_confirm.png';
const POPUP_CONFIRM_PANEL_SIZE = { w: 1076, h: 536 } as const;
const BTN_CLOSE_ICON = '/ui/button/btn_close.png';
const HUD_PAUSE_BUTTON_NORMAL = '/ui/button/btn_pause_normal.png';
const HUD_RESUME_BUTTON_NORMAL = '/ui/button/btn_resume_normal.png';

const MENU_BUTTON_ICONS = {
  start: '/ui/icon/icon_play.png',
  shop: '/ui/icon/shop.png',
  quest: '/ui/icon/task.png',
} as const;

const GOLD_COIN_ICON_PATH = '/ui/icon/coin_gold.png';
const SILVER_COIN_ICON_PATH = '/ui/icon/coin_silver.png';
const KILL_COUNT_ICON_PATH = '/ui/icon/icon_killcount.png';
const CHEST_ICON_PATH = '/ui/icon/in_game_HUD/treasure_chest.png';

/** 行内文字用宝箱图标（高度随文字 font-size，垂直居中）。 */
function chestIconHtml(): string {
  return `<img src="${CHEST_ICON_PATH}" draggable="false" style="height:1.25em;width:auto;object-fit:contain;vertical-align:-0.22em;margin-right:2px;" />`;
}
const HUD_TASK_TRACK_BG = '/ui/panel/hud_task_track_bg.svg';
const HUD_TASK_TRACK_SIZE = { w: 1207, h: 337 } as const;
/** 背景图左侧齿轮图标占位（齿轮右边缘约 290/1207 ≈ 24%，给文字留点边距取 26%） */
const HUD_TASK_TRACK_TEXT_INSET_LEFT = 0.26;
/** 任务条整体相对 topLeft 的横向偏移（负值=向左推）。 */
const HUD_TASK_TRACK_OFFSET_LEFT = 'clamp(-10px,-3vw,-10px)';
/** 局内底部经验条宽度。 */
const HUD_XP_BAR_WIDTH = 'min(86vw,560px)';
const HUD_XP_BAR_HEIGHT = 'clamp(8px,2.1vw,11px)';
const HUD_RELIC_BAR_BG = '/ui/panel/svg/hud_relic_bar_bg.svg';
const HUD_RELIC_BAR_VIEWBOX = { w: 404, h: 44 } as const;
const HUD_RELIC_BAR_SLOT_COUNT = 10;
const HUD_RELIC_SLOT_VIEWBOX = { x: 4, y: 4, w: 36, h: 36, pitch: 40 } as const;
const HUD_RELIC_BAR_MIN_HEIGHT = 'clamp(28px,7.5vw,34px)';
const HUD_RELIC_BAR_WIDTH = 'clamp(257px,68.9vw,312px)';
/** 局内武器槽尺寸 */
const HUD_WEAPON_SLOT_SIZE = 'clamp(22px,6.4vw,28px)';
/** 局内典籍槽尺寸，与武器槽保持一致。 */
const HUD_TOME_SLOT_SIZE = HUD_WEAPON_SLOT_SIZE;
const HUD_QUEST_TRACK_WIDTH = 'min(38vw,180px)';
const HUD_QUEST_TRACK_FONT = 'clamp(6px,1.5vw,8px)';
/** 局内连击提示缩放（相对原始字号） */
const HUD_COMBO_SCALE = 2 / 3;
const HUD_COMBO_FONT_BASE = 28;
const HUD_COMBO_FONT_PER_STACK = 1.5;
const HUD_COMBO_FONT_MAX = 56;
const SILVER_BADGE_BG = '#1a3a6e';
const SILVER_BADGE_ICON_SIZE = 'clamp(22px,6vw,28px)';
/** 底框高度（略低于图标） */
const SILVER_BADGE_PILL_HEIGHT = 'clamp(16px,4.2vw,20px)';
/** 底框左缘伸入图标水平中心（约为图标宽度一半） */
const SILVER_BADGE_PILL_OVERLAP = 'clamp(11px,3vw,14px)';

function createSilverBadge(count: number, prefix = ''): HTMLDivElement {
  const badge = document.createElement('div');
  badge.dataset.silverBadge = '1';
  badge.style.cssText = 'display:inline-flex;align-items:center;box-sizing:border-box;';

  const icon = document.createElement('img');
  icon.src = SILVER_COIN_ICON_PATH;
  icon.alt = '';
  icon.draggable = false;
  icon.style.cssText = `
    width:${SILVER_BADGE_ICON_SIZE};height:${SILVER_BADGE_ICON_SIZE};
    object-fit:contain;flex-shrink:0;display:block;position:relative;z-index:1;
  `;

  const pill = document.createElement('div');
  pill.className = 'silver-badge-pill';
  pill.style.cssText = `
    display:flex;align-items:center;
    background:${SILVER_BADGE_BG};
    border-radius:0 9999px 9999px 0;
    margin-left:calc(-1 * ${SILVER_BADGE_PILL_OVERLAP});
    padding:0 ${uiPx(10)}px 0 ${uiPx(10)}px;
    min-height:${SILVER_BADGE_PILL_HEIGHT};
    box-sizing:border-box;
  `;

  const amount = document.createElement('span');
  amount.className = 'silver-badge-amount';
  amount.style.cssText = uiPlainText('font-size:clamp(12px,3.4vw,15px);font-weight:bold;line-height:1;white-space:nowrap;');
  amount.textContent = `${prefix}${count}`;

  pill.appendChild(amount);
  badge.appendChild(icon);
  badge.appendChild(pill);
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
    display:inline-flex;align-items:center;gap:5px;
    background:rgba(84,54,10,0.86);border:1px solid rgba(255,204,51,0.55);
    border-radius:9999px;box-sizing:border-box;padding:0 11px 0 3px;
    color:#ffe28a;font-size:clamp(12px,3.4vw,15px);font-weight:bold;line-height:1;
    text-shadow:0 1px 3px rgba(0,0,0,0.85);
    box-shadow:0 0 12px rgba(255,190,40,0.18);
  `;

  const icon = document.createElement('img');
  icon.src = GOLD_COIN_ICON_PATH;
  icon.alt = '';
  icon.draggable = false;
  icon.style.cssText = 'width:clamp(22px,6vw,28px);height:clamp(22px,6vw,28px);object-fit:contain;flex-shrink:0;display:block;';

  const amount = document.createElement('span');
  amount.className = 'gold-badge-amount';
  amount.style.cssText = uiPlainText('font-size:clamp(12px,3.4vw,15px);font-weight:bold;line-height:1;white-space:nowrap;');
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
  badge.style.textShadow = UI_TEXT_OUTLINE_SHADOW;
  badge.style.alignItems = 'center';
  const pill = badge.querySelector('.silver-badge-pill') as HTMLElement | null;
  if (pill) {
    pill.style.background = 'transparent';
    pill.style.marginLeft = '0';
    pill.style.padding = '0';
    pill.style.minHeight = 'auto';
    pill.style.borderRadius = '0';
  }
  // Normalize an oversized image icon (coin badges are 36px in the pill) to match the row.
  const img = badge.querySelector('img');
  if (img) {
    (img as HTMLImageElement).style.width = '22px';
    (img as HTMLImageElement).style.height = '22px';
    (img as HTMLImageElement).style.zIndex = '';
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
  const langSize = uiPx(52);
  btn.style.cssText = `
    min-width:${langSize}px;min-height:${langSize}px;padding:0;border:none;background:transparent;cursor:pointer;
    touch-action:manipulation;display:flex;align-items:center;justify-content:center;flex-shrink:0;
    transition:transform 0.15s;
  `;

  const img = document.createElement('img');
  img.src = languageButtonIconSrc();
  img.alt = '';
  img.draggable = false;
  img.style.cssText = `width:${langSize}px;height:${langSize}px;object-fit:contain;pointer-events:none;`;
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

const DAMAGE_NUM_POOL_SIZE = 30;

// =============================================================================
// Toon/Cel-Shading Utilities
// =============================================================================

/**
 * Multi-step toon gradient map (UltimateToon「stylized.gdshader」的 stepped-light 移植)。
 *
 * Godot 的 light() 用如下公式把连续 NdotL 量化成 `steps` 段、段间以 `step_smoothness` 做软过渡：
 *     light_mult   = light * steps
 *     step_base    = floor(light_mult)
 *     light_factor = smoothstep(0.5 - s, 0.5 + s, light_mult - step_base)
 *     light        = (step_base + light_factor) / steps
 * 这里把同一公式烘焙进一张高分辨率 ramp（LinearFilter），MeshToonMaterial 会按
 * NdotL∈[-1,1]→[0,1] 采样它的 .r 通道，于是得到「至少四层」的明暗台阶 + Godot 同款软边。
 *
 * steps=4 ⇒ 5 个亮度平台（阴影 / 暗部 / 中间调 / 亮部 / 高光），满足「至少四层」。
 * shadowFloor 抬高最暗台阶，避免背光面发死黑；highlightCap 给高光留头，白模不顶纯白。
 */
const TOON_STEPS = 5;            // 分层台阶数（5 层，过渡更细）—— 对应 Godot uniform `steps`
const TOON_STEP_SMOOTHNESS = 0.12; // 层间软过渡半宽 —— 对应 Godot `step_smoothness`
const TOON_SHADOW_FLOOR = 0.18; // 最暗台阶的亮度地板（背光面不死黑）
const TOON_HIGHLIGHT_CAP = 0.94; // 高光台阶封顶（受光面留头，浅色模不顶纯白）

function smoothstep01(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function createToonGradientMap(
  steps = TOON_STEPS,
  smoothness = TOON_STEP_SMOOTHNESS,
  shadowFloor = TOON_SHADOW_FLOOR,
  highlightCap = TOON_HIGHLIGHT_CAP,
): THREE.DataTexture {
  const width = 256; // 高分辨率：软过渡才平滑，台阶内部仍是纯平色块（cel 观感）
  const data = new Uint8Array(width * 4);
  const s = Math.max(0.0001, smoothness);
  for (let i = 0; i < width; i++) {
    const x = i / (width - 1); // 采样坐标 == 量化前的 NdotL（已 remap 到 0..1）
    const lightMult = x * steps;
    const stepBase = Math.floor(lightMult);
    const factor = smoothstep01(0.5 - s, 0.5 + s, lightMult - stepBase);
    let v = (stepBase + factor) / steps; // 0..1 阶梯化亮度
    // 把 [0,1] 重映射到 [shadowFloor, highlightCap]：暗部不死黑、亮部留头。
    v = shadowFloor + v * (highlightCap - shadowFloor);
    const c = Math.round(Math.min(1, Math.max(0, v)) * 255);
    const o = i * 4;
    data[o] = c;
    data[o + 1] = c;
    data[o + 2] = c;
    data[o + 3] = 255;
  }
  const gradMap = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
  // LinearFilter：让烘焙好的 smoothstep 软过渡平滑呈现（台阶边缘软、台阶内部平）。
  gradMap.minFilter = THREE.LinearFilter;
  gradMap.magFilter = THREE.LinearFilter;
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

/**
 * 明度封顶（HSL 的 L ≤ maxL）。浅灰白材质（如关卡白模）反照率接近 1，被照亮后线性亮度冲到 ~1.9，
 * 在色调映射里顶死成纯白、还会触发 bloom 晕开 → 整片"翻白"无细节。把明度压到中间调后，
 * 高光不再溢出，gradientMap 的阶梯断层 + 网点 + 黑描边才显得出来（参考图那种中间调质感）。
 */
function capMaterialLightness(color: THREE.Color, maxL: number): void {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  if (hsl.l > maxL) color.setHSL(hsl.h, hsl.s, maxL);
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
 * 全局共享的风格化光照参数（uniform 引用）。所有 stylized 材质在 onBeforeCompile 里都指向
 * 同一份对象，因此运行时改任一 `.value`，整场景的卡通表现实时跟着变 —— 这就是游戏内调参面板
 * 的数据源（见 createStylizedDebugPanel）。改这里的初值 = 改默认外观。
 *
 * 注意：uShadowTint / uLightTint / uRimColor 是「线性空间乘子」，分量可 >1（受光台阶要提亮就 >1）。
 * 所以面板用三个独立滑块而非取色器（取色器表达不了 >1）。
 */
const stylizedUniforms = {
  uSteps: { value: 5.0 },                                   // 分层台阶数（Godot steps）
  uStepSmooth: { value: 0.0 },                              // 台阶软过渡半宽（0=硬切、纯色块；Godot step_smoothness）
  uHalftoneTiling: { value: 11.0 },                         // 网点像素间距（大=点大且疏）
  uHalftoneSmooth: { value: 0.10 },                         // 网点边缘脆度（小=硬）
  uHalftoneDark: { value: 0.6 },                            // 网点压暗强度
  uHalftoneBlend: { value: 0.85 },                          // 网点整体强度（0=关）
  uShadowTint: { value: new THREE.Vector3(0.30, 0.37, 0.66) }, // 冷暗阴影色乘子
  uLightTint: { value: new THREE.Vector3(1.10, 1.02, 0.88) },  // 暖亮受光色乘子
  // 世界空间主光向（俯视/侧视相机的左上前太阳）。每帧 shader 内用 viewMatrix 转到视空间再点法线，
  // 这样镜头平移/旋转时，世界中物体的明暗台阶与网点强度保持稳定 —— 不再"网点跟着镜头漂"。
  // +Y 给到 0.92 让水平面（地面 / 白盒顶）的 ndotl≈0.92 落入顶端台阶（亮度 1.0）→ 网点 gate 直接归零。
  uLightDirWorld: { value: new THREE.Vector3(-0.22, 0.92, 0.32).normalize() },
  // 网点显示阈值：light 高于 uHalftoneCutLow 开始衰减，高于 uHalftoneCutHigh 完全消失。
  // 漫画 halftone 的惯例 —— 网点只在阴影 / 半阴影区，亮面留作纯色块。
  uHalftoneCutLow: { value: 0.55 },
  uHalftoneCutHigh: { value: 0.78 },
};

/** stylized 片元需要的 uniform 声明（注入到 main 前）。 */
const STYLIZED_UNIFORM_DECL = `
uniform float uSpec;
uniform float uHalftone;
uniform float uSteps;
uniform float uStepSmooth;
uniform float uHalftoneTiling;
uniform float uHalftoneSmooth;
uniform float uHalftoneDark;
uniform float uHalftoneBlend;
uniform vec3 uShadowTint;
uniform vec3 uLightTint;
uniform vec3 uLightDirWorld;
uniform float uHalftoneCutLow;
uniform float uHalftoneCutHigh;
`;

/**
 * 风格化光照 GLSL —— UltimateToon「stylized.gdshader」的 light() 完整移植，注入 MeshToon 片元的
 * <opaque_fragment> 前并「完全接管 outgoingLight」。
 *
 * 关键：旧版只在引擎算好的 outgoingLight 上"修补"，场景的环境光/半球光/自发光一抬，分层台阶就被
 * 压到顶端、糊成一片 → 看不出卡通感。新版无视场景灯光，自己用固定视空间光向重新算一遍光照，
 * 因此分层/网点/染色/rim 始终强烈可见，逐字对应 Godot 的 light()：
 *
 *   第 0 层 stepped light：light = (floor(L*steps) + smoothstep(.5±s, frac)) / steps —— ≥4 段台阶
 *   第 1 层 halftone      ：暗台阶网点大、亮台阶网点消失，pattern_blend 混入 light（Godot pattern）
 *   第 2 层 colored shadow：col = mix(albedo×冷暗, albedo×暖亮, light)（Godot shadow_tint）
 *   第 3 层 toon specular ：硬边塑料高光（per-material uSpec，主角/武器>0）
 *   末尾叠回 totalEmissiveRadiance —— 霓虹/发光贴图不丢。
 *   （rim 边缘光已移除：轮廓由屏幕空间深度描边负责，省掉每像素的菲涅尔运算。）
 *
 * 所有调参项都是 uniform（见 stylizedUniforms）：可在游戏内面板实时拖，也可改 stylizedUniforms 初值定基线。
 */
const STYLIZED_TOON_GLSL = `
	{
		vec3 N = normalize( normal );
		vec3 V = normalize( vViewPosition );                       // 片元 -> 相机(视空间)
		// 主光向：世界空间固定 → 用 viewMatrix 转到视空间再做点法线。
		// （旧版直接写死视空间向量，结果光相对相机固定，镜头一转，世界里的明暗面跟着扫，halftone 网点像在物体上爬。）
		vec3 LDIR = normalize( ( viewMatrix * vec4( uLightDirWorld, 0.0 ) ).xyz );
		float ndotl = saturate( dot( N, LDIR ) );

		// —— 第 0 层 stepped light（Godot 量化公式，uSteps 段台阶 + 软过渡） ——
		// uStepSmooth 可为 0（硬切纯色块），用 max(.,1e-4) 兜底避免 smoothstep edge0>=edge1 的 UB。
		float steppedLight;
		{
			float lm = ndotl * uSteps;
			float sb = floor( lm );
			float ss = max( uStepSmooth, 1e-4 );
			float lf = smoothstep( 0.5 - ss, 0.5 + ss, lm - sb );
			steppedLight = ( sb + lf ) / uSteps;
		}
		float light = steppedLight;

		// —— 第 1 层 halftone 网点（对应 Godot pattern）：暗台阶点大、亮台阶点消失 ——
		// 漫画 halftone 惯例：网点只在阴影 / 半阴影区，亮面留作纯色块。
		// brightGate = 1 - smoothstep(low, high, light)，light≥high 时网点完全消失（白盒顶 / 地面纯色）。
		vec2 cell = fract( gl_FragCoord.xy / uHalftoneTiling ) - 0.5;
		float dotDist = length( cell ) * 2.0;                      // 0=点心 ~1=邻边
		float dotRadius = ( 1.0 - light ) * 0.95;                  // 越暗点越大
		float dotInside = 1.0 - smoothstep( dotRadius - uHalftoneSmooth, dotRadius + uHalftoneSmooth, dotDist );
		float brightGate = 1.0 - smoothstep( uHalftoneCutLow, uHalftoneCutHigh, light );
		dotInside *= brightGate;
		float patLight = light * ( 1.0 - dotInside * uHalftoneDark ); // 点内把局部亮度压暗
		light = mix( light, patLight, uHalftoneBlend * uHalftone );

		// —— 第 2 层 colored shadow（Godot shadow_tint）：暗部染冷、亮部染暖，全程乘 albedo ——
		vec3 albedo = diffuseColor.rgb;
		vec3 col = mix( albedo * uShadowTint, albedo * uLightTint, light );

		// —— 第 3 层 toon specular（硬边塑料高光，仅 uSpec>0 的主角/武器） ——
		vec3 H = normalize( LDIR + V );
		float sp = smoothstep( 0.5, 0.53, pow( saturate( dot( N, H ) ), 48.0 ) ) * uSpec * saturate( ndotl );
		col += vec3( sp );

		outgoingLight = col + totalEmissiveRadiance;               // 完全接管光照 + 叠回自发光
	}
`;

/**
 * 给 MeshToonMaterial 挂上风格化光照（接管 outgoingLight：stepped + halftone + 染色 + rim + spec）。
 * specStrength：toon 高光强度（per-material uniform）。怪物/场景传 0（哑光），主角/武器传 >0 留塑料光泽。
 * halftone：是否启用屏幕空间网点（per-material uniform）。
 * 其余风格化参数全部指向共享的 stylizedUniforms（同一引用 → 面板实时改一个值全场景生效）。
 * 幂等（userData 标记）；共享同一编译程序（uniform 值差异不影响 program 缓存）。
 */
function applyStylizedToonShading(mat: THREE.MeshToonMaterial, specStrength = 0, halftone = true): void {
  if (mat.userData['__stylized']) return;
  mat.userData['__stylized'] = true;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms['uSpec'] = { value: specStrength };          // per-material
    shader.uniforms['uHalftone'] = { value: halftone ? 1.0 : 0.0 }; // per-material
    // 共享引用：改 stylizedUniforms.*.value → 所有材质同步更新
    shader.uniforms['uSteps'] = stylizedUniforms.uSteps;
    shader.uniforms['uStepSmooth'] = stylizedUniforms.uStepSmooth;
    shader.uniforms['uHalftoneTiling'] = stylizedUniforms.uHalftoneTiling;
    shader.uniforms['uHalftoneSmooth'] = stylizedUniforms.uHalftoneSmooth;
    shader.uniforms['uHalftoneDark'] = stylizedUniforms.uHalftoneDark;
    shader.uniforms['uHalftoneBlend'] = stylizedUniforms.uHalftoneBlend;
    shader.uniforms['uShadowTint'] = stylizedUniforms.uShadowTint;
    shader.uniforms['uLightTint'] = stylizedUniforms.uLightTint;
    shader.uniforms['uLightDirWorld'] = stylizedUniforms.uLightDirWorld;
    shader.uniforms['uHalftoneCutLow'] = stylizedUniforms.uHalftoneCutLow;
    shader.uniforms['uHalftoneCutHigh'] = stylizedUniforms.uHalftoneCutHigh;

    if (!mat.userData.uIsBackground) {
      mat.userData.uIsBackground = { value: mat.userData.isBackground ? 1.0 : 0.0 };
    }

    shader.uniforms['uWarpCenter'] = curvedWorldUniforms.uWarpCenter;
    shader.uniforms['uWarpStrength'] = curvedWorldUniforms.uWarpStrength;
    shader.uniforms['uIsBackground'] = mat.userData.uIsBackground;

    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        `uniform vec3 uWarpCenter;\nuniform float uWarpStrength;\nuniform float uIsBackground;\nvoid main() {`
      )
      .replace(
        '#include <project_vertex>',
        `
        vec4 localPos = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          localPos = instanceMatrix * localPos;
        #endif
        vec4 gpWorldPos = modelMatrix * localPos;

        vec3 diff = gpWorldPos.xyz - uWarpCenter;
        float d = length(diff.xz);

        if (d > 1e-5 && uWarpStrength > 0.0 && uIsBackground < 0.5) {
            float theta = d * uWarpStrength;
            float sinTheta = sin(theta);
            float cosTheta = cos(theta);
            vec2 dir = diff.xz / d;

            vec3 normal = vec3(sinTheta * dir.x, cosTheta, sinTheta * dir.y);
            float r = (1.0 / uWarpStrength) + diff.y;
            vec3 warpedPos = r * normal;
            warpedPos.y -= (1.0 / uWarpStrength);

            gpWorldPos.xyz = uWarpCenter + warpedPos;
        }

        vec4 mvPosition = viewMatrix * gpWorldPos;
        gl_Position = projectionMatrix * mvPosition;
        vViewPosition = - mvPosition.xyz;
        #ifdef USE_FOG
          vFogDepth = - mvPosition.z;
        #endif
        `
      )
      .replace(
        '#include <defaultnormal_vertex>',
        `
        #include <defaultnormal_vertex>

        vec3 gpWorldPosForNormal = (modelMatrix * vec4(position, 1.0)).xyz;
        vec3 diffForNormal = gpWorldPosForNormal - uWarpCenter;
        float dForNormal = length(diffForNormal.xz);

        if (dForNormal > 1e-5 && uWarpStrength > 0.0 && uIsBackground < 0.5) {
            float theta = dForNormal * uWarpStrength;
            vec2 dir = diffForNormal.xz / dForNormal;
            vec3 viewAxis = normalize( mat3(viewMatrix) * vec3( -dir.y, 0.0, dir.x ) );
            
            float cosA = cos(theta);
            float sinA = sin(theta);
            transformedNormal = transformedNormal * cosA + cross(viewAxis, transformedNormal) * sinA + viewAxis * dot(viewAxis, transformedNormal) * (1.0 - cosA);
            transformedNormal = normalize(transformedNormal);
        }
        `
      );

    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${STYLIZED_UNIFORM_DECL}\nvoid main() {`)
      .replace(
        '#include <opaque_fragment>',
        `${STYLIZED_TOON_GLSL}\n\t#include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => 'stylized-toon-v10-stepeps';
}

/**
 * 游戏内风格化调参面板（仅 dev）。把 stylizedUniforms + 雾 + bloom 全部接上滑块，实时拖动即时生效，
 * 不用改代码重编译。按 ` 键（反引号）或点右上角按钮开关。"复制参数"把当前值导成可粘回代码的片段。
 */
function createStylizedDebugPanel(opts: {
  scene: THREE.Scene;
  bloom: UnrealBloomPass | null;
  renderer: THREE.WebGLRenderer;
  colorGrade: ColorGradePass | null;
  darkComic?: DarkComicPass | null;
  cameraOrbit?: CameraOrbit | null;
  onSkyModeChange?: (mode: 'photo' | 'color') => void;
}): void {
  if (document.getElementById('stylized-debug-panel')) return; // 幂等
  const u = stylizedUniforms;
  const fog = opts.scene.fog instanceof THREE.Fog ? opts.scene.fog : null;
  const bloom = opts.bloom;
  const renderer = opts.renderer;
  const colorGrade = opts.colorGrade;
  const darkComic = opts.darkComic ?? null;
  const cameraOrbit = opts.cameraOrbit;

  type Ctl = { label: string; min: number; max: number; step: number; get: () => number; set: (v: number) => void };
  const vec3ctls = (v: THREE.Vector3, min: number, max: number, prefix = ''): Ctl[] => {
    const p = prefix ? `${prefix} ` : '';
    return [
      { label: `${p}R`, min, max, step: 0.01, get: () => v.x, set: (x) => { v.x = x; } },
      { label: `${p}G`, min, max, step: 0.01, get: () => v.y, set: (x) => { v.y = x; } },
      { label: `${p}B`, min, max, step: 0.01, get: () => v.z, set: (x) => { v.z = x; } },
    ];
  };

  const sections: { title: string; ctls: Ctl[] }[] = [
    {
      title: '关卡视觉与阴影 Scenery', ctls: [
        {
          label: 'Scenery 场景材质(0Toon/1PBR)',
          min: 0, max: 1, step: 1,
          get: () => sceneryMode === 'pbr' ? 1 : 0,
          set: (v) => {
            sceneryMode = v === 1 ? 'pbr' : 'toon';
            const levelRoot = opts.scene.getObjectByName('LevelRoot');
            if (levelRoot) {
              applySceneryMode(levelRoot, sceneryMode);
            }
          }
        },
        {
          label: 'Sky 天空背景(0Color/1Photo)',
          min: 0, max: 1, step: 1,
          get: () => skyMode === 'photo' ? 1 : 0,
          set: (v) => {
            skyMode = v === 1 ? 'photo' : 'color';
            if (opts.onSkyModeChange) {
              opts.onSkyModeChange(skyMode);
            }
          }
        },
        {
          label: 'Curved World 空间弯曲弯度',
          min: 0.0, max: 0.04, step: 0.0005,
          get: () => curvedWorldUniforms.uWarpStrength.value,
          set: (v) => {
            curvedWorldUniforms.uWarpStrength.value = v;
          }
        },
        {
          label: 'Shadows 实时阴影(0Off/1On)',
          min: 0, max: 1, step: 1,
          get: () => realTimeShadowsEnabled ? 1 : 0,
          set: (v) => {
            realTimeShadowsEnabled = v === 1;
            const dirLight = opts.scene.getObjectByName('DirectionalLight') as THREE.DirectionalLight;
            if (dirLight) {
              dirLight.castShadow = realTimeShadowsEnabled;
            }
          }
        }
      ]
    },
    {
      title: '整体亮度 Exposure', ctls: [
        { label: 'Brightness', min: 0.3, max: 2.5, step: 0.01, get: () => renderer.toneMappingExposure, set: (v) => { renderer.toneMappingExposure = v; } },
      ],
    },
    {
      title: '分层 Stepped', ctls: [
        { label: 'Steps 台阶数', min: 1, max: 8, step: 1, get: () => u.uSteps.value, set: (v) => { u.uSteps.value = v; } },
        { label: 'Smooth 过渡', min: 0, max: 0.5, step: 0.01, get: () => u.uStepSmooth.value, set: (v) => { u.uStepSmooth.value = v; } },
      ],
    },
    {
      title: '网点 Halftone', ctls: [
        { label: 'Tiling 大小', min: 4, max: 40, step: 0.5, get: () => u.uHalftoneTiling.value, set: (v) => { u.uHalftoneTiling.value = v; } },
        { label: 'Smooth 脆度', min: 0.01, max: 0.4, step: 0.01, get: () => u.uHalftoneSmooth.value, set: (v) => { u.uHalftoneSmooth.value = v; } },
        { label: 'Dark 压暗', min: 0, max: 1, step: 0.01, get: () => u.uHalftoneDark.value, set: (v) => { u.uHalftoneDark.value = v; } },
        { label: 'Blend 强度', min: 0, max: 1, step: 0.01, get: () => u.uHalftoneBlend.value, set: (v) => { u.uHalftoneBlend.value = v; } },
        { label: 'CutLow 起点', min: 0, max: 1, step: 0.01, get: () => u.uHalftoneCutLow.value, set: (v) => { u.uHalftoneCutLow.value = v; } },
        { label: 'CutHigh 终点', min: 0, max: 1, step: 0.01, get: () => u.uHalftoneCutHigh.value, set: (v) => { u.uHalftoneCutHigh.value = v; } },
      ],
    },
    { title: '阴影色 ShadowTint (×albedo)', ctls: vec3ctls(u.uShadowTint.value, 0, 1.5) },
    { title: '受光色 LightTint (×albedo)', ctls: vec3ctls(u.uLightTint.value, 0, 1.5) },
  ];
  if (cameraOrbit) {
    sections.push({
      title: '极度视角 Camera', ctls: [
        { label: 'Cam Dist 镜头距离', min: 1.5, max: 12, step: 0.1, get: () => cameraOrbit.camDistance, set: (v) => { cameraOrbit.camDistance = v; } },
        { label: 'Cam Height 镜头高度', min: 0.5, max: 8, step: 0.1, get: () => cameraOrbit.camHeightBase, set: (v) => { cameraOrbit.camHeightBase = v; } },
      ],
    });
  }
  if (colorGrade) {
    sections.push({
      title: '美漫调色 ColorGrade', ctls: [
        { label: 'Saturation 饱和', min: 0.5, max: 2.5, step: 0.01, get: () => colorGrade.saturation, set: (v) => { colorGrade.saturation = v; } },
        { label: 'Contrast 对比', min: 0.5, max: 2.0, step: 0.01, get: () => colorGrade.contrast, set: (v) => { colorGrade.contrast = v; } },
        { label: 'Brightness 亮度', min: 0.5, max: 2.0, step: 0.01, get: () => colorGrade.brightness, set: (v) => { colorGrade.brightness = v; } },
      ],
    });
  }
  if (darkComic) {
    sections.push({
      title: '暗黑漫画 DarkComic (Final Swarm)', ctls: [
        { label: 'Enabled 开关', min: 0, max: 1, step: 1, get: () => darkComic.enabled ? 1 : 0, set: (v) => { darkComic.enabled = v >= 0.5; } },
        { label: '去饱和最大值', min: 0, max: 1, step: 0.01, get: () => darkComic.desaturateMax, set: (v) => { darkComic.desaturateMax = v; } },
        { label: '噪点最大值', min: 0, max: 0.3, step: 0.005, get: () => darkComic.noiseMax, set: (v) => { darkComic.noiseMax = v; } },
        { label: '渐变时长(s)', min: 1, max: 120, step: 1, get: () => darkComic.rampDurationSeconds, set: (v) => { darkComic.rampDurationSeconds = v; } },
        { label: '当前进度 ramp', min: 0, max: 1, step: 0.01, get: () => darkComic.ramp01, set: (v) => { darkComic.ramp01 = v; } },
      ],
    });
  }
  if (fog) {
    sections.push({
      title: '雾 Fog', ctls: [
        { label: 'Near 起点', min: 0, max: 300, step: 1, get: () => fog.near, set: (v) => { fog.near = v; } },
        { label: 'Far 终点', min: 10, max: 600, step: 1, get: () => fog.far, set: (v) => { fog.far = v; } },
      ],
    });
  }
  if (bloom) {
    sections.push({
      title: '泛光 Bloom', ctls: [
        { label: 'Strength 强度', min: 0, max: 2, step: 0.01, get: () => bloom.strength, set: (v) => { bloom.strength = v; } },
        { label: 'Radius 半径', min: 0, max: 1.5, step: 0.01, get: () => bloom.radius, set: (v) => { bloom.radius = v; } },
        { label: 'Threshold 阈值', min: 0, max: 1.5, step: 0.01, get: () => bloom.threshold, set: (v) => { bloom.threshold = v; } },
      ],
    });
  }

  const panel = document.createElement('div');
  panel.id = 'stylized-debug-panel';
  panel.style.cssText = [
    'position:fixed', 'top:8px', 'right:8px', 'z-index:99999', 'display:none',
    'width:268px', 'max-height:88vh', 'overflow-y:auto', 'box-sizing:border-box',
    'padding:10px 12px', 'background:rgba(12,14,22,0.92)', 'border:1px solid rgba(120,160,255,0.4)',
    'border-radius:10px', 'color:#dfe6ff', 'font:12px/1.4 ui-monospace,Menlo,Consolas,monospace',
    'box-shadow:0 6px 24px rgba(0,0,0,0.5)', 'user-select:none',
  ].join(';');

  const title = document.createElement('div');
  title.textContent = '🎨 风格化调参 (按 ` 开关)';
  title.style.cssText = 'font-weight:700;margin-bottom:8px;color:#9fc0ff;';
  panel.appendChild(title);

  for (const sec of sections) {
    const h = document.createElement('div');
    h.textContent = sec.title;
    h.style.cssText = 'margin:8px 0 4px;color:#ffd479;font-weight:700;border-bottom:1px solid rgba(255,255,255,0.12);padding-bottom:2px;';
    panel.appendChild(h);
    for (const c of sec.ctls) {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:3px 0;';
      const name = document.createElement('span');
      name.textContent = c.label;
      name.style.cssText = 'flex:0 0 96px;color:#cfd8ff;';
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = String(c.min);
      slider.max = String(c.max);
      slider.step = String(c.step);
      slider.value = String(c.get());
      slider.style.cssText = 'flex:1 1 auto;min-width:0;';
      const val = document.createElement('span');
      val.textContent = c.get().toFixed(2);
      val.style.cssText = 'flex:0 0 40px;text-align:right;color:#9fffcf;';
      slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        c.set(v);
        val.textContent = v.toFixed(2);
      });
      row.appendChild(name);
      row.appendChild(slider);
      row.appendChild(val);
      panel.appendChild(row);
    }
  }

  const copyBtn = document.createElement('button');
  copyBtn.textContent = '复制参数到剪贴板';
  copyBtn.style.cssText = 'margin-top:10px;width:100%;padding:6px;background:#3a6;border:none;border-radius:6px;color:#fff;font-weight:700;cursor:pointer;';
  copyBtn.addEventListener('click', () => {
    const v3 = (v: THREE.Vector3) => `new THREE.Vector3(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;
    const snippet = [
      `// sceneryMode = '${sceneryMode}'`,
      `// skyMode = '${skyMode}'`,
      `// realTimeShadowsEnabled = ${realTimeShadowsEnabled}`,
      `// renderer.toneMappingExposure = ${renderer.toneMappingExposure.toFixed(3)}`,
      '// —— stylizedUniforms 初值 ——',
      `uSteps: { value: ${u.uSteps.value} },`,
      `uStepSmooth: { value: ${u.uStepSmooth.value} },`,
      `uHalftoneTiling: { value: ${u.uHalftoneTiling.value} },`,
      `uHalftoneSmooth: { value: ${u.uHalftoneSmooth.value} },`,
      `uHalftoneDark: { value: ${u.uHalftoneDark.value} },`,
      `uHalftoneBlend: { value: ${u.uHalftoneBlend.value} },`,
      `uShadowTint: { value: ${v3(u.uShadowTint.value)} },`,
      `uLightTint: { value: ${v3(u.uLightTint.value)} },`,
      fog ? `// fog: new THREE.Fog('#87CEEB', ${fog.near}, ${fog.far})` : '',
      bloom ? `// bloom: strength=${bloom.strength}, radius=${bloom.radius}, threshold=${bloom.threshold}` : '',
      colorGrade ? `// ColorGrade: saturation=${colorGrade.saturation.toFixed(3)}, contrast=${colorGrade.contrast.toFixed(3)}, brightness=${colorGrade.brightness.toFixed(3)}` : '',
      darkComic ? `// DarkComic: enabled=${darkComic.enabled}, desatMax=${darkComic.desaturateMax.toFixed(2)}, noiseMax=${darkComic.noiseMax.toFixed(3)}, rampDuration=${darkComic.rampDurationSeconds}s, ramp01=${darkComic.ramp01.toFixed(2)}` : '',
    ].filter(Boolean).join('\n');
    navigator.clipboard?.writeText(snippet).catch(() => { /* ignore */ });
    console.log('[stylized] 当前参数：\n' + snippet);
    copyBtn.textContent = '已复制 ✓（也打印在 Console）';
    setTimeout(() => { copyBtn.textContent = '复制参数到剪贴板'; }, 1500);
  });
  panel.appendChild(copyBtn);

  document.body.appendChild(panel);

  const toggleBtn = document.createElement('button');
  toggleBtn.textContent = '🎨';
  toggleBtn.title = '风格化调参（`）';
  toggleBtn.style.cssText = [
    'position:fixed', 'top:8px', 'right:8px', 'z-index:99998', 'width:34px', 'height:34px',
    'border:none', 'border-radius:8px', 'background:rgba(60,90,160,0.85)', 'color:#fff',
    'font-size:16px', 'cursor:pointer', 'box-shadow:0 2px 8px rgba(0,0,0,0.4)',
  ].join(';');
  const toggle = () => {
    const show = panel.style.display === 'none';
    panel.style.display = show ? 'block' : 'none';
    toggleBtn.style.display = show ? 'none' : 'block';
  };
  toggleBtn.addEventListener('click', toggle);
  document.body.appendChild(toggleBtn);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Backquote') { e.preventDefault(); toggle(); }
  });
}

/**
 * 描边模式：
 *  - screenSpace：基于深度的屏幕空间描边，固定一道全屏 pass，开销与怪数无关。保留卡通黑轮廓。
 *    （替代旧的逐网格 OutlineEffect——后者放大翻面把不透明场景再画一遍，draw call 翻倍、
 *    开销随怪数线性增长，是手机掉帧元凶。已于本次性能优化移除。）
 *  - none：不描边（仅平涂着色，cel 来自材质本身，与描边无关）。
 */
type OutlineMode = 'screenSpace' | 'none';

const OUTLINE_EDGE_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// 深度边缘检测：线性化深度(viewZ)后做 Roberts-cross 4-tap，差超阈值即描黑。
// 阈值随距离放宽(近处细线/远处粗或无)；天空背景(viewZ≈-far)处抑制，避免天边整圈黑。
const OUTLINE_EDGE_FRAG = /* glsl */`
  precision highp float;
  uniform sampler2D tColor;
  uniform highp sampler2D tDepth;   // 必须 highp，否则移动端 mediump 截断 → 满屏黑边/噪点
  uniform vec2 uResolution;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform float uThickness;
  uniform float uOutlineAlpha;
  varying vec2 vUv;

  // perspectiveDepthToViewZ：NDC 深度[0,1] → 视空间 z（负值，-near..-far）
  float toViewZ(float d) {
    return (uCameraNear * uCameraFar) / ((uCameraFar - uCameraNear) * d - uCameraFar);
  }
  float sampleZ(vec2 uv) { return toViewZ(texture2D(tDepth, uv).r); }

  void main() {
    vec4 color = texture2D(tColor, vUv);
    vec2 texel = uThickness / uResolution;
    float c = sampleZ(vUv);
    float n = sampleZ(vUv + vec2(0.0,  texel.y));
    float s = sampleZ(vUv + vec2(0.0, -texel.y));
    float e = sampleZ(vUv + vec2( texel.x, 0.0));
    float w = sampleZ(vUv + vec2(-texel.x, 0.0));
    float hor = abs(e - w);
    float ver = abs(n - s);
    float delta = sqrt(hor * hor + ver * ver);
    float threshold = abs(c) * 0.02 + 0.05;          // 距离自适应阈值（k、floor 可调）
    float edge = smoothstep(threshold, threshold * 2.0, delta);
    float depthMask = 1.0 - step(uCameraFar * 0.9, -c); // 极远(天空/far 区)不描边
    edge *= depthMask;
    gl_FragColor = vec4(mix(color.rgb, vec3(0.0), edge * uOutlineAlpha), color.a);
  }
`;

/**
 * EffectComposer 首道 pass：把场景渲进 composer 缓冲，并按 mode 叠加描边。
 * 渲到 RT 时引擎自动禁 in-material tonemap → 缓冲为线性 HDR，描边在线性空间 mix 向黑，
 * tonemap 交末端 OutputPass(Neutral + sRGB)。needsSwap=false，合成结果写 readBuffer。
 */
class SceneOutlinePass extends Pass {
  mode: OutlineMode = 'screenSpace';

  private readonly sceneRT: THREE.WebGLRenderTarget;
  private readonly fsqMaterial: THREE.ShaderMaterial;
  private readonly fsq: FullScreenQuad;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    w: number, // 有效像素（CSS × dpr）
    h: number,
  ) {
    super();
    this.needsSwap = false;
    this.clear = true;

    // 深度纹理用默认 DepthFormat + UnsignedIntType（→ GL DEPTH_COMPONENT24），不要 HalfFloat / stencil。
    const depthTexture = new THREE.DepthTexture(w, h);
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,   // 颜色：线性 HDR，匹配 composer 缓冲
      depthTexture,
      depthBuffer: true,
      stencilBuffer: false,
    });

    this.fsqMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.sceneRT.texture },
        tDepth: { value: this.sceneRT.depthTexture },
        uResolution: { value: new THREE.Vector2(w, h) },
        uCameraNear: { value: camera.near },
        uCameraFar: { value: camera.far },
        uThickness: { value: 1.5 },
        uOutlineAlpha: { value: 0.85 },
      },
      vertexShader: OUTLINE_EDGE_VERT,
      fragmentShader: OUTLINE_EDGE_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.fsq = new FullScreenQuad(this.fsqMaterial);
  }

  override setSize(width: number, height: number): void {
    // width/height 由 EffectComposer 传入，已是 CSS×dpr 像素。深度纹理随 setSize 自动重建。
    this.sceneRT.setSize(width, height);
    this.fsqMaterial.uniforms.uResolution.value.set(width, height);
  }

  override render(renderer: THREE.WebGLRenderer, _writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.fsqMaterial.uniforms.uCameraNear.value = this.camera.near;
    this.fsqMaterial.uniforms.uCameraFar.value = this.camera.far;

    // 先把场景渲到带深度的 sceneRT
    renderer.setRenderTarget(this.sceneRT);
    renderer.clear();
    renderer.render(this.scene, this.camera);

    // 合成到 pass 输出（readBuffer，交 OutputPass tonemap）
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    if (this.clear) renderer.clear();
    if (this.mode === 'none') {
      const prev = this.fsqMaterial.uniforms.uOutlineAlpha.value;
      this.fsqMaterial.uniforms.uOutlineAlpha.value = 0.0; // 只 blit 颜色，不叠边
      this.fsq.render(renderer);
      this.fsqMaterial.uniforms.uOutlineAlpha.value = prev;
    } else {
      this.fsq.render(renderer);
    }
  }

  override dispose(): void {
    this.sceneRT.dispose(); // 链式释放 depthTexture
    this.fsqMaterial.dispose();
    this.fsq.dispose(); // 仅释放几何，材质已单独 dispose
  }
}

/**
 * 末端调色 pass（美漫风格强化）：在 OutputPass 之后对最终显示色做
 * 饱和度 / 对比度 / 亮度提升，让整体更鲜亮、色块更"跳"、明暗更分明。
 * 全屏单 draw call，开销极低；参数集中在 GRADE_* 常量便于调。
 */
const GRADE_SATURATION = 1.28; // 饱和度（>1 更艳）
const GRADE_CONTRAST = 1.14;   // 对比度（绕中灰 0.5 拉伸）
const GRADE_BRIGHTNESS = 1.05; // 整体亮度微提
const WEATHER_DAY_EXPOSURE = 1.85;
const WEATHER_NIGHT_EXPOSURE = 1.35;
const WEATHER_NIGHT_GRADE_SATURATION = 1.04;
const WEATHER_NIGHT_GRADE_CONTRAST = 1.22;
const WEATHER_NIGHT_GRADE_BRIGHTNESS = 0.9;
const WEATHER_DAY_FOG_NEAR = 80;
const WEATHER_DAY_FOG_FAR = 200;
const WEATHER_NIGHT_FOG_NEAR = 18;
const WEATHER_NIGHT_FOG_FAR = 85;
const WEATHER_TRANSITION_SECONDS = 14;
const WEATHER_DAY_FOG_COLOR = new THREE.Color('#87CEEB');
const WEATHER_NIGHT_FOG_COLOR = new THREE.Color('#17243b');
const WEATHER_DAY_DIR_LIGHT_COLOR = new THREE.Color('#FFF5E0');
const WEATHER_NIGHT_DIR_LIGHT_COLOR = new THREE.Color('#8ea2c6');
const WEATHER_DAY_SKY_TOP = new THREE.Color('#8fd0ff');
const WEATHER_DAY_SKY_MID = new THREE.Color('#b7e3ff');
const WEATHER_DAY_SKY_BOTTOM = new THREE.Color('#dceeff');
const WEATHER_NIGHT_SKY_TOP = new THREE.Color('#0f1628');
const WEATHER_NIGHT_SKY_MID = new THREE.Color('#1a2945');
const WEATHER_NIGHT_SKY_BOTTOM = new THREE.Color('#22385a');

class ColorGradePass extends Pass {
  private readonly material: THREE.ShaderMaterial;
  private readonly fsQuad: FullScreenQuad;

  constructor(saturation: number, contrast: number, brightness: number) {
    super();
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uSaturation: { value: saturation },
        uContrast: { value: contrast },
        uBrightness: { value: brightness },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform float uSaturation;
        uniform float uContrast;
        uniform float uBrightness;
        void main() {
          vec4 tex = texture2D(tDiffuse, vUv);
          vec3 c = tex.rgb * uBrightness;
          c = (c - 0.5) * uContrast + 0.5;            // 对比度：绕中灰拉伸
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); // 感知亮度
          c = mix(vec3(l), c, uSaturation);            // 饱和度：朝灰度反向外推
          gl_FragColor = vec4(clamp(c, 0.0, 1.0), tex.a);
        }`,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }

  get saturation(): number { return this.material.uniforms.uSaturation.value; }
  set saturation(v: number) { this.material.uniforms.uSaturation.value = v; }

  get contrast(): number { return this.material.uniforms.uContrast.value; }
  set contrast(v: number) { this.material.uniforms.uContrast.value = v; }

  get brightness(): number { return this.material.uniforms.uBrightness.value; }
  set brightness(v: number) { this.material.uniforms.uBrightness.value = v; }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }
    this.fsQuad.render(renderer);
  }

  override dispose(): void {
    this.material.dispose();
    this.fsQuad.dispose?.();
  }
}

/**
 * 末端"暗黑漫画"风格 post-fx pass（精简版）。
 * 灵感来自 Andicraft 的 Dark Comic Master URP shader（那是个 8000+ 行 PBR surface shader，
 * 无法 1:1 移到 three.js），实际只保留两个对画面观感最关键的因素：
 *   1) Desaturate 去饱和 —— 朝灰阶推，"暗黑"基调
 *   2) Noise 印刷噪点 —— 颗粒做旧感
 *
 * 数值由外部 `ramp01` (0..1) 驱动：进入"最终狂潮"时由 GameScene 每帧渐进式拉到 1，
 * 退出时快速回落到 0。`desaturateMax / noiseMax` 是 ramp=1 时的目标上限。
 * 放在 ColorGradePass 之后，全部在 LDR sRGB 空间做。单 FSQ，开销 ~ 1 个全屏 draw。
 */
class DarkComicPass extends Pass {
  private readonly material: THREE.ShaderMaterial;
  private readonly fsQuad: FullScreenQuad;

  /** 主开关；关闭时 ramp 视为 0（画面不变） */
  enabled = true;
  /** 渐进进度 [0,1]，由 GameScene.updateDarkComic 驱动 */
  ramp01 = 0;
  /** ramp=1 时去饱和的目标值（0..1） */
  desaturateMax = 0.85;
  /** ramp=1 时噪点的目标值（0..0.3 常用） */
  noiseMax = 0.18;
  /** 从 0 → 1 渐进满所需秒数（finalSwarm 进入时） */
  rampDurationSeconds = 45;

  constructor() {
    super();
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uDesaturate: { value: 0 }, // 实际值每帧由 ramp01 × desaturateMax 写入
        uNoise: { value: 0 },      // 同上
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform vec2 uResolution;
        uniform float uTime;
        uniform float uDesaturate;
        uniform float uNoise;

        const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

        // hash-based 低成本伪噪点（每帧时间扰动 → 颗粒感而非贴图感）
        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        void main() {
          vec4 src = texture2D(tDiffuse, vUv);
          vec3 c = src.rgb;

          float l = dot(c, LUMA);
          c = mix(c, vec3(l), uDesaturate);

          vec2 fragPx = vUv * uResolution;
          float n = hash21(fragPx + vec2(uTime * 60.0, uTime * 37.0)) - 0.5;
          c += n * uNoise;

          gl_FragColor = vec4(clamp(c, 0.0, 1.0), src.a);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }

  override setSize(width: number, height: number): void {
    this.material.uniforms.uResolution.value.set(width, height);
  }

  /** 当前实际生效的去饱和强度（含开关与 ramp） */
  get currentDesaturate(): number {
    return this.enabled ? this.desaturateMax * this.ramp01 : 0;
  }
  /** 当前实际生效的噪点强度（含开关与 ramp） */
  get currentNoise(): number {
    return this.enabled ? this.noiseMax * this.ramp01 : 0;
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const u = this.material.uniforms;
    u.uDesaturate.value = this.currentDesaturate;
    u.uNoise.value = this.currentNoise;
    u.tDiffuse.value = readBuffer.texture;
    u.uTime.value = performance.now() * 0.001;
    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }
    this.fsQuad.render(renderer);
  }

  override dispose(): void {
    this.material.dispose();
    this.fsQuad.dispose?.();
  }
}

function convertToToonMaterials(root: THREE.Object3D, halftone = true): void {
  root.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const toonMats = materials.map((mat) => {
      if (mat instanceof THREE.MeshToonMaterial) {
        tuneToonTexture(mat.map);
        tuneToonTexture(mat.emissiveMap);
        if (mat.color) capMaterialLightness(mat.color, 0.55); // 已是 toon 也封顶：贴图×color，压暗白模
        
        if (mesh.userData.isBackground) {
          mat.userData.isBackground = true;
        }
        applyStylizedToonShading(mat, 0, halftone); // 已是 toon：补挂风格化叠加
        return mat;
      }
      const oldMat = mat as THREE.MeshStandardMaterial | THREE.MeshPhongMaterial | THREE.MeshLambertMaterial;
      const color = (oldMat.color ?? new THREE.Color(0xffffff)).clone();
      boostMaterialSaturation(color, 1.5); // 敌人/场景/道具统一高饱和（与玩家 ×1.6 对齐）
      capMaterialLightness(color, 0.55);   // 明度封顶：白模白色多来自贴图，用 color 乘子压暗（贴图×color），不再顶白糊成一片
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
        vertexColors: oldMat.vertexColors, // 100% 继承并保留原始网格的顶点颜色（Vertex Colors）支持
      });
      toon.name = oldMat.name || 'ToonMat';
      
      // 传递背景标记到新创建的 Toon 材质
      if (mesh.userData.isBackground || (oldMat.userData && oldMat.userData.isBackground)) {
        toon.userData.isBackground = true;
      }
      
      applyStylizedToonShading(toon, 0, halftone); // rim + toon spec + 染色阴影
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
  pistol: '🔫',
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
  zombie_basic: THREE.Group | null;
  // Quaternius Animated Monster Pack — 带骨骼动画 GLB（Bat 用作 gargoyle 渲染）
  monster_bat: THREE.Group | null;
  // 通用 ghost 模型，用作 necromancer 渲染（带 32 个小写命名 clip，加载时归一化）
  ghost: THREE.Group | null;
  // --- 皮肤试验：KayKit Skeletons（低多边形奇幻，静态网格，无动画）---
  kk_warrior: THREE.Group | null;
  kk_minion: THREE.Group | null;
  kk_mage: THREE.Group | null;
  // 第一关 boss 模型（双足持枪）
  boss_2legs: THREE.Group | null;
  // 第二关 boss 模型（大型持枪）
  boss: THREE.Group | null;
  teleporter: THREE.Group | null;
}

/**
 * 启动期共享 LoadingManager：所有 boot 阶段的 GLTF/OBJ/MTL/Texture 加载都挂到它上面，
 * 借 onProgress 汇总「已加载 / 总数」驱动启动 loading 进度条（解决「白屏无反馈」）。
 * 运行期（进对局后）GameScene 内部新建的 loader 不挂它，避免进度条已移除后还触发回调。
 */
const bootLoadingManager = new THREE.LoadingManager();
const gltfLoader = new GLTFLoader(bootLoadingManager);
const loadedModels: LoadedModels = {
  zombie_basic: null,
  monster_bat: null,
  ghost: null,
  kk_warrior: null,
  kk_minion: null,
  kk_mage: null,
  boss_2legs: null,
  boss: null,
  teleporter: null,
};

// Animation clips storage per model key
const loadedAnimClips: Map<string, THREE.AnimationClip[]> = new Map();

// =============================================================================
// KayKit 手持武器（挂到角色 handslot 骨）
// =============================================================================
// KayKit 骷髅角色共用 Rig_Medium 骨架，手部有专用挂点骨 handslot.r / handslot.l，
// 武器模型原点即握把，直接 add 到挂点骨（identity 变换）即落位。武器单独导出（gltf+bin
// +共享 skeleton_texture.png），加载后做 toon 转换并缓存，按敌人类型克隆挂载。
const loadedKayKitWeapons: Record<string, THREE.Group> = {};

const KAYKIT_WEAPON_FILES: Record<string, string> = {
  blade: '/models/skins/kaykit/weapons/Skeleton_Blade.gltf',
  axe: '/models/skins/kaykit/weapons/Skeleton_Axe.gltf',
  staff: '/models/skins/kaykit/weapons/Skeleton_Staff.gltf',
  shield: '/models/skins/kaykit/weapons/Skeleton_Shield_Large_A.gltf',
};

// 敌人类型 → 手持武器配置（right=handslot.r，left=handslot.l）。
// 仅当克隆出的模型确实带 handslot 骨（即 KayKit 角色）时才会真正挂上，其它皮肤天然跳过。
const KAYKIT_WEAPON_LOADOUT: Record<string, { right?: string; left?: string }> = {
  skeleton_knight: { right: 'blade', left: 'shield' }, // 战士：剑 + 大盾
  skeleton_archer: { right: 'staff' },                 // 法师：法杖
  skeleton_soldier: { right: 'axe' },                  // 小兵：斧
};

// 把 Rig_Medium 通用动画 clip 名映射到游戏敌人动画状态机要的名字。
// KayKit FREE 包没有近战挥砍，用 Throw（手臂前送）当攻击替身（playEnemyAnim 找 'Punch'）。
const KAYKIT_ANIM_NAME_MAP: Record<string, string> = {
  Idle_A: 'Idle',
  Walking_A: 'Walk',
  Running_A: 'Run',
  Hit_A: 'HitReact',
  Death_A: 'Death',
  Throw: 'Punch',
};

// =============================================================================
// Boss 攻击 tag → 动画 clip 名
// =============================================================================
// 反向设计自两套机甲模型的 clip（Idle/Walk/Run/Jump/Shoot/Attack/Attack.001/Death）。
// renderBoss 在 attackAnimTimer>0 时按此表播放对应攻击动画；找不到 clip 时回落 Idle。
const BOSS_ATTACK_CLIP: Record<string, string> = {
  // gunner_mech（第 1 关）
  aimed_burst: 'Shoot',
  suppress_fire: 'Shoot',
  melee_swipe: 'Attack',
  leap_strike: 'Jump',
  // siege_mech（第 2 关）
  barrage: 'Shoot',
  heavy_slam: 'Attack',
  cleave: 'Attack.001',
  leap_slam: 'Jump',
  charge: 'Run',
  deploy_drones: 'Shoot',
};

// =============================================================================
// 敌人 → 视觉模型映射
// =============================================================================
// 仅决定敌人「视觉模型」，core 逻辑/碰撞/数值不变。三个骷髅类敌人使用 KayKit 骷髅
// （带 Rig_Medium 动画 + 手持武器，见 loadSkinModels），其余沿用内置模型。
const ENEMY_MODEL_MAP: Record<string, keyof LoadedModels> = {
  skeleton_soldier: 'kk_minion',   // 普通骷髅兵 → 小兵（手持斧）
  zombie: 'zombie_basic',
  skeleton_archer: 'kk_mage',      // 远程施法 → 法师（手持法杖）
  skeleton_knight: 'kk_warrior',   // 精英冲锋 → 战士（剑 + 大盾）
  necromancer: 'ghost',
  gargoyle: 'monster_bat',
};

function getEnemyModelMap(): Record<string, keyof LoadedModels> {
  return ENEMY_MODEL_MAP;
}

// 把模型重定位为「脚底贴地(min.y=0) + 水平居中」。渲染路径只克隆+缩放、不再居中，
// 依赖模型原点在脚底中心；KayKit 导出原点不一定如此，这里统一对齐。
function alignModelToFeet(model: THREE.Object3D): THREE.Group {
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const wrapper = new THREE.Group();
  model.position.set(-center.x, -box.min.y, -center.z);
  wrapper.add(model);
  return wrapper;
}

// 加载皮肤模型。KayKit 骷髅会额外加载 Rig_Medium 动画 + 手持武器（见函数末尾）。
// 失败仅告警，对应敌人回退到彩色盒子。
async function loadSkinModels(): Promise<void> {
  const prepare = (root: THREE.Object3D, name: string): THREE.Group => {
    convertToToonMaterials(root, true); // 角色：开启网点
    root.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    const aligned = alignModelToFeet(root);
    aligned.name = `Model_${name}`;
    return aligned;
  };

  // KayKit：glb（自包含贴图）
  const kaykit: [keyof LoadedModels, string][] = [
    ['kk_warrior', '/models/skins/kaykit/Skeleton_Warrior.glb'],
    ['kk_minion', '/models/skins/kaykit/Skeleton_Minion.glb'],
    ['kk_mage', '/models/skins/kaykit/Skeleton_Mage.glb'],
  ];

  // Rig_Medium 通用动画：两个 GLB 共用与角色完全一致的骨架（root/hips/spine/...），
  // clip 的轨道按骨名绑定，可直接在 KayKit 角色上播放。
  const animFiles = [
    '/models/skins/kaykit/anim/Rig_Medium_General.glb',
    '/models/skins/kaykit/anim/Rig_Medium_MovementBasic.glb',
  ];
  const kkClips: THREE.AnimationClip[] = [];

  await Promise.all([
    ...kaykit.map(async ([key, path]) => {
      try {
        const gltf = await gltfLoader.loadAsync(path);
        loadedModels[key] = prepare(gltf.scene, key);
        console.log(`[Skin] Loaded ${key} (${path})`);
      } catch (err) {
        console.warn(`[Skin] Failed ${key} (${path}):`, err);
      }
    }),
    // KayKit 手持武器（gltf + bin + 共享 skeleton_texture.png）
    ...Object.entries(KAYKIT_WEAPON_FILES).map(async ([key, path]) => {
      try {
        const gltf = await gltfLoader.loadAsync(path);
        const g = gltf.scene;
        convertToToonMaterials(g, true);
        g.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });
        loadedKayKitWeapons[key] = g;
        console.log(`[Skin] Loaded weapon ${key} (${path})`);
      } catch (err) {
        console.warn(`[Skin] Failed weapon ${key} (${path}):`, err);
      }
    }),
    // Rig_Medium 动画：抽取需要的 clip，重命名为游戏状态机用的名字
    (async () => {
      const raw: THREE.AnimationClip[] = [];
      for (const path of animFiles) {
        try {
          const gltf = await gltfLoader.loadAsync(path);
          raw.push(...gltf.animations);
        } catch (err) {
          console.warn(`[Skin] Failed anim ${path}:`, err);
        }
      }
      const added = new Set<string>();
      for (const clip of raw) {
        const mapped = KAYKIT_ANIM_NAME_MAP[clip.name];
        if (!mapped || added.has(mapped)) continue;
        const c = clip.clone();
        c.name = mapped;
        // 去掉 root 平移轨：走/跑动画不再整体位移（敌人位置由 obj.position 控制）
        c.tracks = c.tracks.filter((t) => t.name !== 'root.position');
        kkClips.push(c);
        added.add(mapped);
      }
    })(),
  ]);

  // 同一套动画注册给所有 KayKit 角色（每个敌人对象在 updateEnemyObjects 各建独立 mixer 绑定）
  if (kkClips.length > 0) {
    for (const key of ['kk_warrior', 'kk_minion', 'kk_mage'] as (keyof LoadedModels)[]) {
      if (loadedModels[key]) loadedAnimClips.set(key, kkClips);
    }
    console.log(`[Skin] KayKit animations ready: ${kkClips.map((c) => c.name).join(', ')}`);
  }
}

async function loadModels(): Promise<void> {
  const modelPaths: [keyof LoadedModels, string][] = [
    ['zombie_basic', '/models/zombie_basic.glb'],
    ['boss_2legs', '/models/enemy_2legs_gun.glb'],
    ['boss', '/models/enemy_large_gun.glb'],
    ['teleporter', '/models/turret_teleporter.glb'],
    // Quaternius Animated Monster Pack（带骨骼动画 GLB）：Bat 用作 gargoyle 渲染，
    // clip 名带前缀（Bat_Flying 等），加载完后会做归一化（见 normalizeEnemyClips）
    ['monster_bat', '/models/monsters/Bat.glb'],
    // ghost.glb：通用幽灵模型，clip 全小写（idle/walk/sprint/die...），加载时归一化为
    // Idle/Walk/Run/Death；用作 necromancer 渲染
    ['ghost', '/models/ghost.glb'],
  ];

  const promises = modelPaths.map(async ([key, path]) => {
    try {
      const gltf = await gltfLoader.loadAsync(path);
      const model = gltf.scene;
      model.name = `Model_${key}`;
      // Convert all materials to cel-shading toon style
      convertToToonMaterials(model, true); // 怪物角色：开启网点
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
        const clips = normalizeEnemyClips(key, gltf.animations);
        loadedAnimClips.set(key, clips);
        console.log(`[Assets] Loaded: ${key} (${path}) — ${clips.length} animations: ${clips.map(c => c.name).join(', ')}`);
      } else {
        console.log(`[Assets] Loaded: ${key} (${path})`);
      }
    } catch (err) {
      console.warn(`[Assets] Failed to load ${key} (${path}):`, err);
      loadedModels[key] = null;
    }
  });

  await Promise.all(promises);

  // 皮肤试验模型（KayKit）—— 与 OBJ 道具并行加载
  await Promise.all([loadObjItems(), loadSkinModels()]);
}

// =============================================================================
// 敌人动画 clip 名归一化
// =============================================================================
// 第三方 GLB 的 clip 命名风格五花八门，与 enemyAnim 系统里 'Idle' / 'Run' / 'Walk'
// 等严格 name 匹配不兼容。这里在加载完成时给特定模型归一化：
//   - Quaternius Animated Monster Pack（monster_*）: clip 带模型前缀
//     （Skeleton_Idle / Bat_Flying...）→ strip 前缀
//   - ghost.glb: clip 全小写（idle/walk/sprint/die...）→ 首字母大写化
//   - 通用别名表：Running/Sprint → Run，Die → Death，让 enemyAnim 的 fallback 链命中
//   - 若模型没有 Idle 但有 Flying（飞行怪），把 Flying 注册成 Idle 别名，
//     避免在 windup 等"静止"状态下卡 T-pose
// 对其他模型（zombie_*）透传原 clips（zombie 套件本身就用 Idle / Run_Arms / Punch... 等命名）
function normalizeEnemyClips(modelKey: string, clips: THREE.AnimationClip[]): THREE.AnimationClip[] {
  const needsNormalize = modelKey.startsWith('monster_') || modelKey === 'ghost';
  if (!needsNormalize) return clips;

  const out: THREE.AnimationClip[] = [];
  const namesAdded = new Set<string>();

  for (const clip of clips) {
    let n = clip.name;
    n = n.replace(/^[A-Za-z]+_/, '');                    // Skeleton_Idle → Idle
    n = n.charAt(0).toUpperCase() + n.slice(1);          // idle → Idle, walk → Walk, sprint → Sprint
    const renamed = clip.clone();
    renamed.name = n;
    out.push(renamed);
    namesAdded.add(n);
  }

  // 通用同义词别名：源名 → 目标名（仅当目标不存在时复制一份）
  const aliasPairs: Array<[string, string]> = [
    ['Running', 'Run'],   // Quaternius
    ['Sprint', 'Run'],    // ghost-style
    ['Die', 'Death'],     // ghost-style
  ];
  for (const [from, to] of aliasPairs) {
    if (!namesAdded.has(to) && namesAdded.has(from)) {
      const a = out.find((c) => c.name === from)!.clone();
      a.name = to;
      out.push(a);
      namesAdded.add(to);
    }
  }

  // 没有 Idle 时用 Flying / Static / Walk / Run 之一兜底
  if (!namesAdded.has('Idle')) {
    const fallback = out.find((c) => ['Flying', 'Static', 'Walk', 'Run'].includes(c.name));
    if (fallback) {
      const alias = fallback.clone();
      alias.name = 'Idle';
      out.push(alias);
      namesAdded.add('Idle');
    }
  }

  // 飞行怪（Bat / Dragon 这类只有 Flying 没 Walk/Run 的）：把 Flying 同时注册成
  // Walk / Run 别名，让 updateEnemyObjects 移动判定能直接命中而不必走 fallback。
  if (namesAdded.has('Flying')) {
    for (const name of ['Walk', 'Run']) {
      if (!namesAdded.has(name)) {
        const a = out.find((c) => c.name === 'Flying')!.clone();
        a.name = name;
        out.push(a);
        namesAdded.add(name);
      }
    }
  }

  return out;
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
// === 双文件模式（生产唯一模式）===
//   /models/levels/level_${name}.glb         视觉高模（玩家看到的关卡，可缺）
//   /models/levels/level_${name}_col.glb     碰撞低模（必须，只含 col_/wall_/climb_/ramp_/spawn_*）
//
//   - 双文件都存在 → 视觉用 visual 文件，碰撞 100% 来自 col 文件（视觉文件里的 col_*
//     prefix 会被忽略，避免双源冲突）
//   - 只有 col     → 灰盒/纯碰撞测试，col 同时充当视觉
//   - 缺 col       → boot 直接抛错（没有兜底，没有内置 arena）

const DEFAULT_LEVEL_NAME = 'whitebox';
const HARD_TEST_LEVEL_NAME = 'stage2';
const COL_ONLY_LEVEL_NAMES = new Set<string>([HARD_TEST_LEVEL_NAME]);

/** 已加载的关卡（数据 + 用于渲染的场景）。bootGameClient 成功后保证非 null。 */
let loadedLevel: { data: LevelData; scene: THREE.Object3D } | null = null;
let loadedLevelName: string | null = null;
const loadedLevelsByName = new Map<string, { data: LevelData; scene: THREE.Object3D }>();

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

// 场景视觉模式与天空盒模式 (dev 调参面板可调，也作为主视角偏好)
let sceneryMode: 'toon' | 'pbr' = 'toon'; // 默认 Toon 风格化材质，支持开启/关闭 PBR 标准材质
let skyMode: 'photo' | 'color' = 'photo'; // 默认高质量真实天空（带白云）
let realTimeShadowsEnabled = true; // 默认开启高质量实时阴影

// 解决 Object3D.clone()/SkeletonUtils.clone() 丢失类实例（如 Material）的问题。
// 使用在 JSON 序列化中能完美保留的 meshId 字符串在全局 Maps 中寻址。
const levelOriginalMaterials = new Map<string, THREE.Material | THREE.Material[]>();
const levelToonMaterials = new Map<string, THREE.Material | THREE.Material[]>();

/**
 * CPU 端对任意 BufferGeometry 进行自适应三角剖分细分（Tessellation）。
 * 用于给关卡视觉场景中的低模、超大平面进行自适应细分，确保在 GPU 空间弯曲时顶点密度足够，
 * 能够平滑弯曲而不产生边缘撕裂和断裂缝隙。
 */
function tessellateGeometry(geometry: THREE.BufferGeometry, maxEdgeLength = 3.0): THREE.BufferGeometry {
  const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
  const posAttr = nonIndexed.attributes.position;
  if (!posAttr) return geometry;

  const normAttr = nonIndexed.attributes.normal;
  const uvAttr = nonIndexed.attributes.uv;
  const colorAttr = nonIndexed.attributes.color;
  const colorSize = colorAttr ? colorAttr.itemSize : 0;

  const count = posAttr.count;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];

  const pA = new THREE.Vector3();
  const pB = new THREE.Vector3();
  const pC = new THREE.Vector3();
  const nA = new THREE.Vector3();
  const nB = new THREE.Vector3();
  const nC = new THREE.Vector3();
  const uvA = new THREE.Vector2();
  const uvB = new THREE.Vector2();
  const uvC = new THREE.Vector2();
  const colA = new THREE.Vector4();
  const colB = new THREE.Vector4();
  const colC = new THREE.Vector4();

  function pushVertex(p: THREE.Vector3, n?: THREE.Vector3, uv?: THREE.Vector2, col?: THREE.Vector4) {
    positions.push(p.x, p.y, p.z);
    if (normAttr && n) normals.push(n.x, n.y, n.z);
    if (uvAttr && uv) uvs.push(uv.x, uv.y);
    if (colorAttr && col) {
      if (colorSize === 3) {
        colors.push(col.x, col.y, col.z);
      } else if (colorSize === 4) {
        colors.push(col.x, col.y, col.z, col.w);
      }
    }
  }

  function subdivide(
    a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3,
    na: THREE.Vector3, nb: THREE.Vector3, nc: THREE.Vector3,
    uva: THREE.Vector2, uvb: THREE.Vector2, uvc: THREE.Vector2,
    cola: THREE.Vector4, colb: THREE.Vector4, colc: THREE.Vector4
  ) {
    const lenAB = a.distanceTo(b);
    const lenBC = b.distanceTo(c);
    const lenCA = c.distanceTo(a);

    const maxLen = Math.max(lenAB, lenBC, lenCA);

    if (maxLen > maxEdgeLength) {
      if (lenAB === maxLen) {
        const m = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
        const nm = normAttr ? new THREE.Vector3().addVectors(na, nb).normalize() : new THREE.Vector3();
        const uvm = uvAttr ? new THREE.Vector2().addVectors(uva, uvb).multiplyScalar(0.5) : new THREE.Vector2();
        const colm = colorAttr ? new THREE.Vector4().addVectors(cola, colb).multiplyScalar(0.5) : new THREE.Vector4();

        subdivide(a, m, c, na, nm, nc, uva, uvm, uvc, cola, colm, colc);
        subdivide(m, b, c, nm, nb, nc, uvm, uvb, uvc, colm, colb, colc);
      } else if (lenBC === maxLen) {
        const m = new THREE.Vector3().addVectors(b, c).multiplyScalar(0.5);
        const nm = normAttr ? new THREE.Vector3().addVectors(nb, nc).normalize() : new THREE.Vector3();
        const uvm = uvAttr ? new THREE.Vector2().addVectors(uvb, uvc).multiplyScalar(0.5) : new THREE.Vector2();
        const colm = colorAttr ? new THREE.Vector4().addVectors(colb, colc).multiplyScalar(0.5) : new THREE.Vector4();

        subdivide(a, b, m, na, nb, nm, uva, uvb, uvm, cola, colb, colm);
        subdivide(a, m, c, na, nm, nc, uva, uvm, uvc, cola, colm, colc);
      } else {
        const m = new THREE.Vector3().addVectors(c, a).multiplyScalar(0.5);
        const nm = normAttr ? new THREE.Vector3().addVectors(nc, na).normalize() : new THREE.Vector3();
        const uvm = uvAttr ? new THREE.Vector2().addVectors(uvc, uva).multiplyScalar(0.5) : new THREE.Vector2();
        const colm = colorAttr ? new THREE.Vector4().addVectors(colc, cola).multiplyScalar(0.5) : new THREE.Vector4();

        subdivide(a, b, m, na, nb, nm, uva, uvb, uvm, cola, colb, colm);
        subdivide(m, b, c, nm, nb, nc, uvm, uvb, uvc, colm, colb, colc);
      }
    } else {
      pushVertex(a, na, uva, cola);
      pushVertex(b, nb, uvb, colb);
      pushVertex(c, nc, uvc, colc);
    }
  }

  for (let i = 0; i < count; i += 3) {
    pA.fromBufferAttribute(posAttr as any, i);
    pB.fromBufferAttribute(posAttr as any, i + 1);
    pC.fromBufferAttribute(posAttr as any, i + 2);

    if (normAttr) {
      nA.fromBufferAttribute(normAttr as any, i);
      nB.fromBufferAttribute(normAttr as any, i + 1);
      nC.fromBufferAttribute(normAttr as any, i + 2);
    }
    if (uvAttr) {
      uvA.fromBufferAttribute(uvAttr as any, i);
      uvB.fromBufferAttribute(uvAttr as any, i + 1);
      uvC.fromBufferAttribute(uvAttr as any, i + 2);
    }
    if (colorAttr) {
      if (colorSize === 3) {
        colA.set(colorAttr.getX(i), colorAttr.getY(i), colorAttr.getZ(i), 1.0);
        colB.set(colorAttr.getX(i + 1), colorAttr.getY(i + 1), colorAttr.getZ(i + 1), 1.0);
        colC.set(colorAttr.getX(i + 2), colorAttr.getY(i + 2), colorAttr.getZ(i + 2), 1.0);
      } else if (colorSize === 4) {
        colA.set(colorAttr.getX(i), colorAttr.getY(i), colorAttr.getZ(i), colorAttr.getW(i));
        colB.set(colorAttr.getX(i + 1), colorAttr.getY(i + 1), colorAttr.getZ(i + 1), colorAttr.getW(i + 1));
        colC.set(colorAttr.getX(i + 2), colorAttr.getY(i + 2), colorAttr.getZ(i + 2), colorAttr.getW(i + 2));
      }
    }

    subdivide(pA, pB, pC, nA, nB, nC, uvA, uvB, uvC, colA, colB, colC);
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (normAttr) result.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  if (uvAttr) result.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (colorAttr) {
    result.setAttribute('color', new THREE.Float32BufferAttribute(colors, colorSize));
  }

  return result;
}

/**
 * 遍历并将关卡几何体在 PBR 原始材质与 Toon 风格化材质之间进行切换。
 */
function applySceneryMode(root: THREE.Object3D, mode: 'toon' | 'pbr'): void {
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      const meshId = mesh.userData.sceneryMeshId;
      if (meshId) {
        if (mode === 'pbr') {
          const mat = levelOriginalMaterials.get(meshId);
          if (mat) mesh.material = mat;
        } else if (mode === 'toon') {
          const mat = levelToonMaterials.get(meshId);
          if (mat) mesh.material = mat;
        }
      }
    }
  });
}

/**
 * 加载唯一关卡 glb。强制双文件模式：
 *   - level_${name}.glb       视觉高模（缺则用 col 当视觉，纯灰盒）
 *   - level_${name}_col.glb   碰撞低模（必须，关卡逻辑 / spawn_* 只从这里解析）
 *
 * 碰撞文件缺失 = 致命错误，直接抛异常让 boot 挂掉。激进方案下不再有内置 arena 兜底。
 */
async function tryLoadLevel(name: string = DEFAULT_LEVEL_NAME): Promise<void> {
  if (loadedLevel && loadedLevelName === name) return;
  const cached = loadedLevelsByName.get(name);
  if (cached) {
    loadedLevel = cached;
    loadedLevelName = name;
    return;
  }

  const visualPath = `/models/levels/level_${name}.glb`;
  const colPath = `/models/levels/level_${name}_col.glb`;
  const colOnly = COL_ONLY_LEVEL_NAMES.has(name);

  const [visualResult, colResult] = await Promise.allSettled([
    colOnly
      ? Promise.resolve(null)
      : gltfLoader.loadAsync(visualPath),
    gltfLoader.loadAsync(colPath),
  ]);

  const visualScene =
    visualResult.status === 'fulfilled' && visualResult.value
      ? visualResult.value.scene
      : null;
  const colScene = colResult.status === 'fulfilled' ? colResult.value.scene : null;

  if (!colScene) {
    loadedLevel = null;
    loadedLevelName = null;
    throw new Error(
      `[Level] Failed to load collision level ${colPath}. ` +
      `游戏没有内置 arena 兜底，请确认文件存在于 public/models/levels/。`,
    );
  }

  // 决定视觉源 / 碰撞源：
  //   两个都在 → visual 渲染，col 解析（双源分离）
  //   只有 col → 都用 col（纯灰盒）
  const renderScene = visualScene ?? colScene;
  const colSource = colScene;

  renderScene.name = 'LoadedLevel';
  
  // 1. 缓存原始 PBR 材质到全局注册表中（使用 meshId 作为键，避免 clone() 丢失材质引用）
  levelOriginalMaterials.clear();
  levelToonMaterials.clear();
  let idCounter = 0;

  renderScene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;

      // 100% 自动侦测远景/天际背景物体，防止弯曲投影
      const nameLower = mesh.name.toLowerCase();
      const isBg = nameLower.includes('sky') || 
                   nameLower.includes('dome') || 
                   nameLower.includes('planet') || 
                   nameLower.includes('space') || 
                   nameLower.includes('background') || 
                   nameLower.includes('bg') ||
                   nameLower.includes('cloud') ||
                   nameLower.includes('star') ||
                   nameLower.includes('sun') ||
                   nameLower.includes('moon') ||
                   nameLower.includes('galaxy') ||
                   nameLower.includes('nebula');

      if (isBg) {
        mesh.userData.isBackground = true;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        // 背景元素打上 material 标记
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => {
          if (m) m.userData.isBackground = true;
        });
      }

      // 自动对非背景网格几何体进行自适应三角剖分细分，提升顶点密度。
      // 阀值设为 1.8 米：只细分大平板/长斜坡，既保证弯曲边缘完美咬合不撕裂，又把面数增加压到最低！
      if (!isBg && mesh.geometry) {
        mesh.geometry = tessellateGeometry(mesh.geometry, 1.8);
      }

      const meshId = `scenery_mesh_${idCounter++}`;
      mesh.userData.sceneryMeshId = meshId; // 字符串在 clone() 中能被深拷贝完美保留
      levelOriginalMaterials.set(meshId, mesh.material);
    }
  });

  // 2. 生成 Toon 风格材质并缓存到全局注册表
  convertToToonMaterials(renderScene);
  renderScene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      const meshId = mesh.userData.sceneryMeshId;
      if (meshId) {
        levelToonMaterials.set(meshId, mesh.material);
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });

  // 3. 应用当前的关卡视觉材质模式
  applySceneryMode(renderScene, sceneryMode);

  const data = parseLevelGltf(colSource);
  loadedLevel = { data, scene: renderScene };
  loadedLevelName = name;
  loadedLevelsByName.set(name, loadedLevel);

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

  const mode = visualScene ? 'two-file' : 'col-only';
  console.log(
    `[Level] Loaded (${mode}) ${visualScene ? visualPath : ''}${visualScene && colScene ? ' + ' : ''}${colScene ? colPath : ''}: ` +
      `${data.collisionRects.length} col, ${data.walls.length} wall, ` +
      `${data.climbVolumes.length} climb, ${data.ramps.length} ramp, ${data.chestSpawns.length} chest, ` +
      `player=${data.spawnPoints.players?.length ?? 0} altar=${data.spawnPoints.altars?.length ?? 0} logic=collision`,
  );
}

function levelNameForTier(tier: DifficultyTier): string {
  // 临时测试入口：Hard 难度直接绑定第二关白盒（col-only）。
  return tier === 2 ? HARD_TEST_LEVEL_NAME : DEFAULT_LEVEL_NAME;
}

// OBJ geometry cache for pickups/projectiles
let crystalGeometry: THREE.BufferGeometry | null = null;
let crystal2Geometry: THREE.BufferGeometry | null = null;
let crystal3Geometry: THREE.BufferGeometry | null = null;
let crystal4Geometry: THREE.BufferGeometry | null = null;
let heartGeometry: THREE.BufferGeometry | null = null;
let heartHalfGeometry: THREE.BufferGeometry | null = null;
let boneGeometry: THREE.BufferGeometry | null = null;
let silverCoinModel: THREE.Group | null = null;
let axeModel: THREE.Group | null = null; // Full model with materials
let swordModel: THREE.Group | null = null;
let katanaModel: THREE.Group | null = null;
let pistolModel: THREE.Group | null = null;
let bulletModel: THREE.Group | null = null; // pistol 子弹模型（items/bullet.glb）
let daggerModel: THREE.Group | null = null;
let hammerModel: THREE.Group | null = null;
let dartModel: THREE.Group | null = null;
let dartGoldenModel: THREE.Group | null = null; // Used for shotgun pellets
let lightningStaffModel: THREE.Group | null = null; // lightning_staff floater
let flameRingModel: THREE.Group | null = null; // flame_ring floater
let poisonBombModel: THREE.Group | null = null; // poison_bomb floater
let voidRippleModel: THREE.Group | null = null; // void_ripple floater
let rayGunModel: THREE.Group | null = null; // ray_gun floater
let shotgunModel: THREE.Group | null = null; // shotgun floater (pellets still use dartGoldenModel)
let paralysisGunModel: THREE.Group | null = null; // paralysis_gun floater
let scorchBootsModel: THREE.Group | null = null; // scorch_boots floater
let chestClosedObj: THREE.Group | null = null;
let chestOpenObj: THREE.Group | null = null;
// glTF 宝箱自带的动画 clip（Open / Close / Idle_*），开箱时播放 "Open"。
let chestAnimations: THREE.AnimationClip[] = [];

// 贴地朝向：把摆件（宝箱等）的"上"对齐到斜坡法线，避免平底盒子在斜面上一角内嵌。
const GROUND_UP = new THREE.Vector3(0, 1, 0);
const _groundNormalTmp = new THREE.Vector3();
const _groundQuatTmp = new THREE.Quaternion();
const _groundIdentityQuat = new THREE.Quaternion();

/**
 * 求 (x,z) 处地面的朝向四元数：若点落在某条 ramp_ 斜坡的 footprint 内，
 * 返回把世界 +Y 旋到斜面法线的最小旋转；否则返回单位四元数（平地竖直）。
 * 斜面法线 = (-slopeDir * slope, 1, ...)，slope = (highY-lowY)/(2*halfSlope)。
 */
function groundQuaternionAt(x: number, z: number): THREE.Quaternion {
  const ramps = loadedLevel?.data.ramps;
  if (ramps && ramps.length > 0) {
    for (const r of ramps) {
      const dx = x - r.cx;
      const dz = z - r.cz;
      const s = dx * r.slopeDirX + dz * r.slopeDirZ;
      const p = dx * -r.slopeDirZ + dz * r.slopeDirX;
      if (Math.abs(s) > r.halfSlope || Math.abs(p) > r.halfPerp) continue;
      const slope = r.halfSlope > 0 ? (r.highY - r.lowY) / (r.halfSlope * 2) : 0;
      if (slope === 0) break;
      _groundNormalTmp.set(-r.slopeDirX * slope, 1, -r.slopeDirZ * slope).normalize();
      return _groundQuatTmp.setFromUnitVectors(GROUND_UP, _groundNormalTmp);
    }
  }
  return _groundIdentityQuat.identity();
}

async function loadObjItems(): Promise<void> {
  const objLoader = new OBJLoader(bootLoadingManager);

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

  // 同 loadAndNormalize，但从 GLB 取几何体。GLB 的 mesh 常带 node 变换（导出工具的 scale/rotation），
  // 必须先把 matrixWorld 烘焙进 geometry，否则 InstancedMesh 用裸 geometry 会丢变换、错位/错尺寸。
  const loadAndNormalizeGlb = async (path: string, targetSize: number): Promise<THREE.BufferGeometry> => {
    try {
      const gltf = await gltfLoader.loadAsync(path);
      gltf.scene.updateMatrixWorld(true);
      let foundGeo: THREE.BufferGeometry | null = null;
      let foundMatrix: THREE.Matrix4 | null = null;
      gltf.scene.traverse((child: THREE.Object3D) => {
        if (!foundGeo && (child as THREE.Mesh).isMesh) {
          foundGeo = (child as THREE.Mesh).geometry.clone();
          foundMatrix = (child as THREE.Mesh).matrixWorld.clone();
        }
      });
      if (!foundGeo) return new THREE.OctahedronGeometry(targetSize, 0);
      const geo: THREE.BufferGeometry = foundGeo;
      geo.applyMatrix4(foundMatrix!); // 烘焙 node 变换，与 obj（无 node）行为对齐
      geo.computeBoundingBox();
      const size = geo.boundingBox!.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 0.01);
      const scale = targetSize / maxDim;
      geo.scale(scale, scale, scale);
      geo.computeBoundingBox();
      const center = geo.boundingBox!.getCenter(new THREE.Vector3());
      geo.translate(-center.x, -center.y, -center.z);
      console.log(`[GLB] Loaded geometry: ${path} (${(geo.getAttribute('position') as THREE.BufferAttribute).count} verts)`);
      return geo;
    } catch (err) {
      console.warn(`[GLB] Failed geometry: ${path}`, err);
      return new THREE.OctahedronGeometry(targetSize, 0);
    }
  };

  [crystalGeometry, heartGeometry, heartHalfGeometry, boneGeometry, crystal2Geometry, crystal3Geometry, crystal4Geometry] = await Promise.all([
    loadAndNormalizeGlb('/models/items/Crystal1.glb', 0.4),
    loadAndNormalize('/models/items/Heart.obj', 0.5),
    loadAndNormalize('/models/items/Heart_Half.obj', 0.42),
    loadAndNormalizeGlb('/models/items/Bone.glb', 0.5),
    loadAndNormalizeGlb('/models/items/Crystal2.glb', 0.4),
    loadAndNormalizeGlb('/models/items/Crystal3.glb', 0.4),
    loadAndNormalizeGlb('/models/items/Crystal4.glb', 0.4),
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
      const mtlLoader = new MTLLoader(bootLoadingManager);
      const mtl = await mtlLoader.loadAsync(mtlPath);
      mtl.preload();
      const loader = new OBJLoader(bootLoadingManager);
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

  // Helper: load a GLB weapon model that ships with an embedded baseColor
  // texture, keeping the texture at full brightness. Unlike loadGlbWeaponModel
  // (which runs convertToToonMaterials and caps lightness — fine for flat-color
  // models but darkens hand-painted textures), this rebuilds a white-tinted
  // toon material that lets the embedded diffuse map carry the color verbatim.
  const loadTexturedGlbWeaponModel = async (
    name: string,
    glbPath: string,
    targetSize: number,
  ): Promise<THREE.Group | null> => {
    try {
      const gltf = await gltfLoader.loadAsync(glbPath);
      const obj = gltf.scene as THREE.Group;
      obj.name = name;

      obj.traverse((child) => {
        if (!(child as THREE.Mesh).isMesh) return;
        const mesh = child as THREE.Mesh;
        const src = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as
          THREE.MeshStandardMaterial | undefined;
        const map = src?.map ?? null;
        tuneToonTexture(map);
        const toon = new THREE.MeshToonMaterial({
          color: map ? 0xffffff : (src?.color?.clone() ?? new THREE.Color(0xffffff)),
          map,
          gradientMap: toonGradientMap,
          side: THREE.FrontSide,
        });
        toon.name = `${name}Toon`;
        applyStylizedToonShading(toon, 0.35); // match other weapons: rim + slight spec
        mesh.material = toon;
      });

      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 0.01);
      const s = targetSize / maxDim;
      obj.scale.set(s, s, s);
      console.log(`[GLB] Loaded textured ${name} model`);
      return obj;
    } catch (err) {
      console.warn(`[GLB] Failed to load textured ${name}:`, err);
      return null;
    }
  };

  // Helper: load an OBJ weapon model that has UVs but no MTL, painting it with a
  // shared UV-palette texture (low-poly gun packs map UVs onto color regions of a
  // single palette PNG). Keeps the palette at full brightness via white toon mats.
  const loadPaletteObjWeaponModel = async (
    name: string,
    objPath: string,
    texturePath: string,
    targetSize: number,
  ): Promise<THREE.Group | null> => {
    try {
      const obj = await new OBJLoader(bootLoadingManager).loadAsync(objPath) as THREE.Group;
      obj.name = name;

      const tex = await new THREE.TextureLoader(bootLoadingManager).loadAsync(texturePath);
      tex.colorSpace = THREE.SRGBColorSpace;
      // Palette UVs target tiny color cells — nearest filtering avoids bleeding.
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;

      obj.traverse((child) => {
        if (!(child as THREE.Mesh).isMesh) return;
        const mesh = child as THREE.Mesh;
        const toon = new THREE.MeshToonMaterial({
          color: 0xffffff,
          map: tex,
          gradientMap: toonGradientMap,
          side: THREE.FrontSide,
        });
        toon.name = `${name}Toon`;
        applyStylizedToonShading(toon, 0.35);
        mesh.material = toon;
      });

      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 0.01);
      const s = targetSize / maxDim;
      obj.scale.set(s, s, s);
      console.log(`[OBJ] Loaded palette ${name} model`);
      return obj;
    } catch (err) {
      console.warn(`[OBJ] Failed to load palette ${name}:`, err);
      return null;
    }
  };

  // Load all weapon models in parallel — pass brighten=true for weapons only
  const [ax, sw, kat, pistol, dag, ham, dar, darG, bul, lstaff, fring, pbomb, vbook, rgun, sgun, pgun, sboots] = await Promise.all([
    loadGlbWeaponModel('AxeModel', '/models/items/Axe_small.glb', 0.6, true),
    loadFullModel('SwordModel', '/models/items/greatsword.mtl', '/models/items/greatsword.obj', 0.8, true),
    loadFullModel('KatanaModel', '/models/items/Sword_big.mtl', '/models/items/Sword_big.obj', 0.9, true),
    // pistol 武器自身的悬浮模型（自导出 GLB + 贴图）
    loadTexturedGlbWeaponModel('PistolModel', '/models/items/pistol.glb', 0.7),
    loadFullModel('DaggerModel', '/models/items/Dagger.mtl', '/models/items/Dagger.obj', 0.4, true),
    loadFullModel('HammerModel', '/models/items/Hammer_Double.mtl', '/models/items/Hammer_Double.obj', 0.7, true),
    loadFullModel('DartModel', '/models/items/Dart.mtl', '/models/items/Dart.obj', 0.4, true),
    loadGlbWeaponModel('DartGoldenModel', '/models/items/bullet.glb', 0.45, true),
    // pistol 子弹模型（与霰弹弹丸同源 bullet.glb，但独立缩放/朝向）
    loadGlbWeaponModel('BulletModel', '/models/items/bullet.glb', 0.5, true),
    // Magic weapon floater models (previously VFX-only)
    loadTexturedGlbWeaponModel('LightningStaffModel', '/models/items/lightning_staff.glb', 1.0),
    loadGlbWeaponModel('FlameRingModel', '/models/items/Ring3.glb', 0.45, true),
    loadTexturedGlbWeaponModel('PoisonBombModel', '/models/items/poison_bomb.glb', 0.5),
    loadGlbWeaponModel('VoidRippleModel', '/models/items/Book4_Closed.glb', 0.5, true),
    loadGlbWeaponModel('RayGunModel', '/models/items/ray_gun.glb', 0.7, true),
    loadPaletteObjWeaponModel('ShotgunModel', '/models/items/shotgun_2.obj', '/models/items/uv_palette.png', 0.8),
    loadPaletteObjWeaponModel('ParalysisGunModel', '/models/items/pistol_6.obj', '/models/items/uv_palette.png', 0.6),
    loadTexturedGlbWeaponModel('ScorchBootsModel', '/models/items/scorch_boots.glb', 0.6),
  ]);
  axeModel = ax;
  swordModel = sw;
  katanaModel = kat;
  pistolModel = pistol;
  daggerModel = dag;
  hammerModel = ham;
  dartModel = dar;
  dartGoldenModel = darG;
  bulletModel = bul;
  // bullet.glb 的长轴是 +X，而弹丸朝向约定是 +Z（方向渲染只绕 Y 旋转）。
  // 给内部节点烘一个 -90° 偏航，把枪口方向对齐到行进方向，避免子弹横着飞。
  if (dartGoldenModel) {
    for (const child of dartGoldenModel.children) {
      child.rotation.y -= Math.PI / 2;
    }
  }
  if (bulletModel) {
    for (const child of bulletModel.children) {
      child.rotation.y -= Math.PI / 2;
    }
  }
  lightningStaffModel = lstaff;
  flameRingModel = fring;
  poisonBombModel = pbomb;
  voidRippleModel = vbook;
  rayGunModel = rgun;
  shotgunModel = sgun;
  paralysisGunModel = pgun;
  scorchBootsModel = sboots;

  silverCoinModel = await loadTexturedGlbWeaponModel('SilverCoinModel', '/models/items/coin.glb', 0.45);

  // Load chest model — Sci-Fi Essentials Prop_Chest (glTF + textures)
  try {
    const gltf = await gltfLoader.loadAsync('/models/items/Prop_Chest.glb');
    const chest = gltf.scene as unknown as THREE.Group;
    chest.name = 'ChestClosed';
    // glTF rig defaults to closed pose — leave as-is for the world prop.
    // 保留 sci-fi 宝箱自带的 BaseColor 贴图，只做 toon 化；不再刷金色覆盖。
    convertToToonMaterials(chest);
    chestClosedObj = chest;
    chestOpenObj = chest;
    chestAnimations = gltf.animations ?? [];

    console.log('[glTF] Loaded Prop_Chest model');
  } catch (err) {
    console.warn('[glTF] Failed to load chest:', err);
  }
}

// =============================================================================
// GameScene - Three.js Rendering
// =============================================================================

export class GameScene {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private outlinePass: SceneOutlinePass | null = null; // 屏幕空间描边 pass（screenSpace/none，dev 下 O 键切换）
  private bloomPass: UnrealBloomPass | null = null;
  private colorGradePass: ColorGradePass | null = null;
  private darkComicPass: DarkComicPass | null = null; // 末端"暗黑漫画"风格 post-fx；DARK_COMIC_ENABLED 控制
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
  private readonly _hitFlashColor = new THREE.Color();
  // 敌人弹幕火焰 billboard 朝向计算的临时量（避免每帧每弹分配）
  private readonly _camWorldPos = new THREE.Vector3();
  private readonly _vfxNormal = new THREE.Vector3();
  private readonly _vfxUp = new THREE.Vector3();
  private readonly _vfxRight = new THREE.Vector3();
  private readonly _vfxZ = new THREE.Vector3();
  private readonly _vfxMatrix = new THREE.Matrix4();
  private readonly _vfxScale = new THREE.Vector3();

  // Scene objects
  private playerMesh!: THREE.Mesh;
  private playerRing!: THREE.Mesh;
  private groundMesh!: THREE.Mesh;
  private playerHitFlashTimer = 0;
  private playerHitFlashTint: number | null = null;
  private bossMesh: THREE.Mesh | null = null;
  /** bossMesh 当前是用哪一关的模型构建的（关卡切换时需重建）。 */
  private bossMeshStage: 1 | 2 | null = null;
  /** Boss 的 base scale（auto-scaled to TARGET_BOSS_HEIGHT），attack/enrage 脉冲基于此值。 */
  private bossBaseScale = 1.0;
  /** Boss 骨骼动画 mixer（随 bossMesh 重建）。 */
  private bossMixer: THREE.AnimationMixer | null = null;
  /** Boss clip name → action（含 Idle/Walk/Run/Jump/Shoot/Attack/Attack.001/Death）。 */
  private bossAnimActions: Map<string, THREE.AnimationAction> = new Map();
  /** 当前播放的 boss 动画名（去重，避免每帧 reset 卡第 0 帧）。 */
  private bossAnimState: string | null = null;
  /** Boss 上一帧 XZ + 静止时长（移动判定，逻辑同敌人）。 */
  private bossPrevPos: { x: number; z: number; stillTime: number } | null = null;
  private bossHitFlashTint: string | null = null;
  private ambientLight!: THREE.AmbientLight;
  private hemiLight!: THREE.HemisphereLight;
  private playerSpotLight!: THREE.SpotLight;
  private dirLight!: THREE.DirectionalLight;
  private weatherBlend = 0;
  private weatherTarget = 0;
  // 常驻共享闪电闪光灯：永远在场景里、待命强度 0。闪电复用它而非每道新建/移除 PointLight
  // —— 场景光源数恒定，避免每次触发引发全场材质 shader 重编译（掉帧主因）。
  private lightningFlashLight!: THREE.PointLight;

  // Weapon floaters — physical weapons orbit the player as visual indicator
  // Magic weapons (lightning_staff / flame_ring) use VFX only
  private weaponFloaters: Map<string, THREE.Object3D> = new Map();
  // axe 同样保留装饰 floater（贴近玩家内圈旋转，半径 1.134）作为「已装备」指示器，与其它武器一致；
  // 真正的攻击斧头是外圈常驻刀环（renderProjectiles 里的 axeObjects，半径 = range 3.0），两者半径不同可区分。
  private static readonly FLOATER_WEAPON_TYPES: ReadonlyArray<string> = [
    'sword', 'bone_bouncer', 'axe', 'pistol', 'shotgun',
    'lightning_staff', 'flame_ring', 'poison_bomb', 'void_ripple', 'ray_gun', 'paralysis_gun', 'scorch_boots',
  ];

  // Transient mesh-based VFX (sword slash sectors, lightning columns)
  // 剑气实心扇形：与 sweepArc 判定区一一对应（圆心=玩家 / 外缘=range / 108° / 内缘≈0），
  // 叠在 slash.png 月牙之下作为"扫过的填充面积"底光。
  private slashSectors: Array<{ mesh: THREE.Mesh; life: number; maxLife: number; baseOpacity: number }> = [];
  // Textured lightning: glow/core 贴图竖直面片(lightning.png) + impact light + ground ring
  private lightningBolts: Array<{
    core: THREE.Mesh; // 窄白亮芯面片
    glow: THREE.Mesh; // 宽蓝外晕面片
    ring: THREE.Mesh;
    endX: number;
    endY: number;
    endZ: number;
    height: number;
    life: number;
    maxLife: number;
    flickerTimer: number;
  }> = [];
  // Persistent flame_ring decal centered on player while equipped.
  // 两层星形符文（外圈深橙 / 内核亮黄）反向旋转 + 呼吸脉动，尺寸吻合实际 aoeRadius。
  private flameRingDisk: THREE.Group | null = null;
  private flameRingLayers: THREE.Mesh[] = [];
  private flameRingTime = 0;
  // Edge-detect weapon firing for one-shot VFX
  private lastWeaponCooldown: Map<string, number> = new Map();
  private levelScene: THREE.Object3D | null = null;
  private backgroundMeshes: THREE.Object3D[] = [];
  private startIntroWorldMaterials: THREE.Material[] = [];
  private startIntroCameraHandoffTimer = 0;

  // Animation state
  private deathAnimTimer = 0;
  private levelUpAnimTimer = 0;
  private levelCompPulseTimer = 0;
  private wasAlive = true;
  private wasGrounded = true; // Track grounded state for jump animation trigger
  private lastPhase: GamePhase = 'playing';
  private startIntro: StartIntroState | null = null;

  // GSAP animation state
  private lastHpPercent = -1;
  private lastXpPercent = 0;
  private lastBossHpPercent = -1;
  private levelPulseAnimation: any = null;

  // Player skeletal animation
  private playerMixer: THREE.AnimationMixer | null = null;
  private playerAnimations: Map<string, THREE.AnimationAction> = new Map();
  private currentPlayerAnim: string = '';
  // 静止时在 Idle 间隙穿插的"风味"动画（Hello / Dance）
  private idleFlavorCooldown = 6; // 距离下一次插播剩余秒数
  private idleFlavorTimer = 0;    // 当前 flavor 动画剩余秒数（> 0 表示正在播）
  // 受击动画锁定计时器（> 0 时不切换到其他动画）
  private hitReactTimer = 0;
  // 拾取动画锁定计时器（开宝箱时触发 Pickup 动画，> 0 期间锁定）
  private pickupAnimTimer = 0;

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
  private shrineChargeWidget: TempleChargeIndicator | null = null;
  private bossSummonIndicator: HTMLDivElement | null = null;
  private bossSummonWidget: BossSummonIndicator | null = null;
  /** 上一帧 Boss 召唤圆环是否在显示（用于检测召唤完成 → 先补满 100% 再淡出）。 */
  private bossSummonWasShowing = false;

  // Chest rendering
  private chestObjects: Map<number, THREE.Object3D> = new Map();
  // 每个已开启宝箱的开箱动画混合器（id → mixer），动画播完后箱体保留到玩家选完奖励才移除。
  private chestMixers: Map<number, THREE.AnimationMixer> = new Map();
  private chestRewardPanel: HTMLDivElement | null = null;
  private chestRewardPanelKey: string | null = null;
  /** chest_reward 阶段已就绪、待开箱动画播完后再展示的奖励。 */
  private pendingChestRewardReveal: PendingChestReward | null = null;
  /** 已完成 "Open" 动画的宝箱 id（幂等标记，避免重复触发弹窗）。 */
  private chestOpenAnimDone = new Set<number>();

  // InstancedMeshes
  // Enemy rendering — individual cloned models (preserves full materials)
  private enemyObjects: Map<number, THREE.Object3D> = new Map(); // id → cloned model
  private enemyPool: Map<string, THREE.Object3D[]> = new Map(); // type → available pool
  private enemyMixers: Map<number, THREE.AnimationMixer> = new Map(); // id → animation mixer
  // id → 自上次 mixer.update 以来累积的 dt。动画 LOD 降频时不丢时间：轮到更新时一次性补上，
  // 保证降频敌人的动画速率与满帧一致（只是时间分辨率变低）。视锥外冻结的敌人不累积。
  private enemyAnimAccum: Map<number, number> = new Map();
  private enemyAnimStates: Map<number, string> = new Map(); // id → current anim name
  private enemyAnimActions: Map<number, Map<string, THREE.AnimationAction>> = new Map(); // id → actions map
  // id → 上一帧 x/z + 静止累计时长。core(setInterval 60Hz) 与渲染(rAF, 可能 120/144Hz) 不同步，
  // 很多渲染帧位置没变，故用"距上次位移过了多久"做滞后判定，而非单帧瞬时速度。
  private enemyPrevPos: Map<number, { x: number; z: number; stillTime: number }> = new Map();
  // modelKey → 把该模型几何高度归一化到 1 单位高的系数（= 1 / 实际包围盒高度）。
  // 用于让来源尺寸各异的敌人模型统一缩放到目标高度（参考玩家），首次用到时按 loadedModels 实测缓存。
  private enemyModelNormHeight: Map<string, number> = new Map();
  private enemyHitFlashTints: Map<number, string | null> = new Map(); // id → current material tint weapon
  private paralysisTriangleSprites: Map<number, THREE.Sprite[]> = new Map(); // enemy id → paralysis marker sprites
  private neuroMarkerSprites: Map<number, THREE.Sprite> = new Map(); // 毒师神经毒素 墨绿倒三角
  private hunterMarkerSprites: Map<number, THREE.Sprite> = new Map(); // 猎标烙印 红色瞄准圈
  private conductorGlowSprites: Map<number, THREE.Sprite> = new Map(); // 弧光导体 蓝色发光
  private mysteryNumberSprite: THREE.Sprite | null = null; // 奥术奥秘计数（玩家头顶）
  private mysteryNumberValue = -1;
  private mysteryNumberPulse = 0;
  private arcaneBurstOrbs: { sprite: THREE.Sprite; from: THREE.Vector3; to: THREE.Vector3; t: number; life: number }[] = [];
  private projectileMesh!: THREE.InstancedMesh;
  private enemyProjectileMesh!: THREE.InstancedMesh; // 敌人弹幕：朝相机的火焰 billboard
  private axeObjects: Map<number, THREE.Object3D> = new Map(); // axe projectile id → cloned model
  private weaponObjects: Map<number, THREE.Object3D> = new Map(); // other weapon projectiles → cloned model
  private bossProjectileObjects: Map<number, THREE.Object3D> = new Map(); // boss（机器人）弹丸 → bullet.glb 克隆
  // 投射物对象池：投射物消失时回收实例避免每发都 model.clone()。带容量上限，超
  // 限实例直接释放，防止池子被某次峰值无限撑大。
  private axePool: THREE.Object3D[] = [];
  private weaponPool: Map<string, THREE.Object3D[]> = new Map(); // weaponType → 池
  private bossProjPool: THREE.Object3D[] = [];
  private areaEffectObjects: Map<number, THREE.Object3D> = new Map(); // area effect id → mesh (gas/ripple/scorch/beam)
  // 区域特效对象池（按 kind 分池）：消失时回收实例避免反复 createAreaEffectMesh + dispose。
  private areaEffectPool: Map<string, THREE.Object3D[]> = new Map();
  private pickupMeshes: Map<PickupType, THREE.InstancedMesh> = new Map();
  private silverPickupObjects: Map<number, THREE.Object3D> = new Map();
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
  private hpBarInner!: HTMLImageElement;
  private hpText!: HTMLDivElement;
  private shieldBar!: HTMLDivElement;
  private shieldBarInner!: HTMLImageElement;
  private shieldText!: HTMLDivElement;
  private xpBar!: HTMLDivElement;
  private xpBarInner!: HTMLImageElement;
  private xpNumbers!: HTMLDivElement;
  private levelLabel!: HTMLDivElement;
  private timerLabel!: HTMLDivElement;
  private timerTimeEl!: HTMLSpanElement;
  private killLabel!: HTMLDivElement;
  private killCountEl!: HTMLSpanElement;
  private goldLabel!: HTMLDivElement;
  private silverLabel!: HTMLDivElement;
  private gmWeaponDamagePanel: HTMLDivElement | null = null;
  private gmWeaponDamageBody: HTMLDivElement | null = null;
  /** 局内任务条（武器槽下方）。 */
  private questRow!: HTMLDivElement;
  private questLabel!: HTMLDivElement;
  /** 局内主线任务条是否已触发完成消失动画（祭坛 Boss 被击败后）。 */
  private questHudDismissStarted = false;
  /** 经验条上方的 buff 行：左消耗品 / 右羁绊。 */
  private buffRow!: HTMLDivElement;
  private consumableBuffsContainer!: HTMLDivElement;
  /** 羁绊点击展开的详情浮层。 */
  private bondDetailOverlay!: HTMLDivElement;
  private openBondId: BondId | null = null;
  private bondDetailOutsideHandler: ((ev: PointerEvent) => void) | null = null;
  /** timed 消耗品记录到的最大剩余时间，用于阴影下降比例。 */
  private consumableMaxRemaining = 0;
  private weaponSlotsContainer!: HTMLDivElement;
  private tomesSlotsContainer!: HTMLDivElement;
  private relicSlotsContainer!: HTMLDivElement;
  private bondSlotsContainer!: HTMLDivElement;
  private itemTooltip: HTMLDivElement | null = null;
  private itemTooltipContent = new WeakMap<HTMLElement, string>();
  private bossHpContainer!: HTMLDivElement;
  private bossHpBarInner!: HTMLImageElement;
  private bossNameLabel!: HTMLDivElement;
  private bossPhaseMarkers!: HTMLDivElement;
  private tierBadge!: HTMLDivElement;
  private stageBadge!: HTMLDivElement;
  private teleporterIndicator!: HTMLDivElement;
  private interactBtn!: HTMLDivElement;
  private overtimeNoticeEl!: HTMLDivElement;
  private overtimeNoticeImg!: HTMLImageElement;
  private finalSwarmNoticeEl!: HTMLDivElement;
  private finalSwarmNoticeImg!: HTMLImageElement;
  private majorNoticeEl: HTMLDivElement | null = null;
  private majorNoticeTimer: ReturnType<typeof setTimeout> | null = null;
  private lowHealthOverlay: HTMLDivElement | null = null;
  private pauseBtn!: HTMLDivElement;
  private pauseBtnIcon!: HTMLImageElement;
  private upgradePanel: HTMLDivElement | null = null;
  private gameOverPanel: HTMLDivElement | null = null;
  private pausePanel: HTMLDivElement | null = null;
  private questCompleteAtRunStart: Set<string> = new Set();
  private damageNums: HTMLDivElement[] = [];
  private damageNumIndex = 0;
  private finalSwarmBorder: HTMLDivElement | null = null;
  private wasFinalSwarm = false;
  private lastNoticeTier: DifficultyTier | null = null;
  private lastNoticeStage: GameState['stage'] | null = null;
  private wasOvertime = false;
  private xpFlashTimer = 0;
  private seenChestOpenEvents = new Set<string>();
  /** 帧率 / Draw Call 调试 overlay（dev 下按 ` 与风格化调参面板同步开关） */
  private perfStatsEl: HTMLDivElement | null = null;
  private perfStatsVisible = false;
  private perfFpsSampleTime = 0;
  private perfFpsFrameCount = 0;
  private perfFpsDisplay = 0;

  // 渲染帧计数器（动画 LOD 错峰用：不同 id 的敌人在不同帧更新，把降频开销摊开）。
  private frameIndex = 0;
  // 复用的视锥/矩阵，避免每帧分配。renderEnemies 开头由当前相机重建后做点剔除。
  private readonly cullFrustum = new THREE.Frustum();
  private readonly cullMatrix = new THREE.Matrix4();
  private readonly cullPoint = new THREE.Vector3();

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
  /** 全局键盘监听引用（destroy 时移除，防跨局泄漏）。 */
  private onKeyDown?: (e: KeyboardEvent) => void;
  private onKeyUp?: (e: KeyboardEvent) => void;
  /** session 事件退订函数（destroy 时调用）。 */
  private sessionUnsubscribers: Array<() => void> = [];
  /**
   * WebGL context lost / restored 处理（移动端必备）。
   * 手机切后台 / 来电 / 系统内存吃紧时浏览器会回收 GL context：若不处理，画面黑屏且永不恢复。
   * - lost：preventDefault（告诉浏览器尝试恢复）+ 置 contextLost 标志暂停渲染 + 显示提示浮层。
   * - restored：three.js 在下一次 render 自动重传 GPU 资源，这里只需清标志、隐藏浮层、恢复循环。
   */
  private contextLost = false;
  private onContextLost?: (e: Event) => void;
  private onContextRestored?: (e: Event) => void;
  private contextLostOverlay?: HTMLDivElement;
  /**
   * HUD 差分更新签名缓存：武器/法书/遗物/羁绊槽位结构很少变化，但旧实现每帧
   * innerHTML='' 全量重建 DOM（触发 layout/reflow + GC + 每帧重绑事件）。
   * 仅当结构签名变化时才重建，逐帧只更新真正变动的部分（如武器冷却遮罩高度）。
   */
  private weaponSlotsSig = '';
  private weaponCooldownOverlays: Array<HTMLElement | null> = [];
  private gmWeaponDamageSig = '';
  private gmWeaponDamageRows = new Map<string, {
    kills: HTMLSpanElement;
    dps: HTMLSpanElement;
    total: HTMLSpanElement;
  }>();
  private tomesSig = '';
  private relicsSig = '';
  private bondsSig = '';
  /** 羁绊槽点击展开时使用最近一帧 state，避免 DOM 缓存后闭包拿到旧数值。 */
  private latestHudState?: GameState;
  /**
   * 上一次消费 damageEvents / bondVfxEvents 时的 state.gameTime。
   * 渲染走 rAF（高刷屏可 >60Hz），逻辑 tick 固定 60Hz：同一 tick 的事件会被多个 rAF 帧重复读到，
   * 导致打击火花 / 镜头震动 / 羁绊 VFX 翻倍。按 gameTime 去重，确保每个 tick 的事件只消费一次。
   */
  private lastEventGameTime = -1;

  // Dying enemies (death animation tracking)
  private dyingEnemies: Map<number, { obj: THREE.Object3D; timer: number; type: string }> = new Map();

  // Boss attack warning elements
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
    // antialias:false —— 画面全程走离屏 EffectComposer target，最终由 OutputPass 把贴图全屏 blit 到
    // 默认帧缓冲，canvas 级 MSAA 对这条离屏管线基本不生效＝白付开销（尤其移动端填充率敏感）。关掉。
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      alpha: true, // 允许透明背景，便于支持高质量天空盒/CSS天空背景
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // 开启高质量实时阴影
    this.renderer.toneMapping = THREE.NeutralToneMapping; // 更亮、更保饱和（Q 版鲜艳调性，替代偏暗去饱和的 ACES）
    this.renderer.toneMappingExposure = WEATHER_DAY_EXPOSURE; // 曝光：调参面板调定的整体亮度（Q 版鲜亮调性）
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; // 显式 sRGB，保证饱和度正确还原
    this.renderer.domElement.style.display = 'block';
    this.container.appendChild(this.renderer.domElement);

    // WebGL context lost / restored —— 监听挂在 canvas 上，destroy 时移除。
    this.onContextLost = (e: Event) => {
      e.preventDefault(); // 必须：阻止默认后浏览器才会尝试恢复并触发 webglcontextrestored
      this.contextLost = true;
      this.showContextLostOverlay();
    };
    this.onContextRestored = () => {
      // three.js 会在下一帧 render 时自动重新上传几何 / 材质 / 纹理，无需手动重建场景。
      this.contextLost = false;
      this.hideContextLostOverlay();
    };
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost, false);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored, false);

    // Scene
    this.scene = new THREE.Scene();
    this.scene.name = 'MainScene';
    this.scene.background = new THREE.Color('#87CEEB');
    this.applySkyMode(skyMode);
    // 线性雾：战斗范围(~30)内全清晰，远处地面/关卡边缘在 80~200 内柔和融入天色 → 有空气透视纵深，
    // 又不会遮挡可玩区域。雾色与天空背景一致(#87CEEB)，远端无缝过渡。不想要雾可设为 null。
    this.scene.fog = new THREE.Fog('#87CEEB', WEATHER_DAY_FOG_NEAR, WEATHER_DAY_FOG_FAR);

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
      applyPlatformJoystickSkin(mobileInput);
      mobileInput.attachButtons({
        buttons: [
          { label: '', color: 'transparent', size: uiPx(80) },
          // [DISABLED] 局内滑铲按钮
          // { label: '⬇️', color: 'rgba(255,200,50,0.3)', size: 48 },
          // [DISABLED] 局内技能按钮
          // { label: '🔥', color: 'rgba(255,100,50,0.3)', size: 48 },
        ],
      });
      // Jump button skin/layout applied in setupHUD once interactBtn exists.
    }

    // Keyboard bindings —— 保存引用以便 destroy() 移除，避免每开一局泄漏一对全局监听 + 旧 GameScene 闭包。
    this.onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') { this.jumpKeyDown = true; e.preventDefault(); }
      if (e.code === 'KeyE') {
        // 边缘触发：keydown 那一帧标记为 pressed；发送过 input 后会清零（见 handleInput）
        if (!e.repeat) this.interactKeyPressed = true;
      }
    };
    this.onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') { this.jumpKeyDown = false; }
    };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);

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
    this.setupProjectileMesh();
    this.setupPickupMesh();
    this.setupGoldMoteMesh();
    this.setupVFX();
    this.setupHUD();
    this.setupDamageNumbers();
    this.setupPerfStats();

    this.setupComposer();

    // Dev-only 风格化调参面板（按 ` 开关），生产构建不创建。
    if (import.meta.env.DEV) {
      createStylizedDebugPanel({
        scene: this.scene,
        bloom: this.bloomPass,
        renderer: this.renderer,
        colorGrade: this.colorGradePass,
        darkComic: this.darkComicPass,
        cameraOrbit: this.cameraOrbit,
        onSkyModeChange: (mode) => {
          this.applySkyMode(mode);
        },
      });
      this.setupGmWeaponDamagePanel();
    }

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

    this.sessionUnsubscribers.push(
      this.session.on('game_update', ({ state }) => {
        this.handlePhaseChange(state);
      }),
    );

    this.sessionUnsubscribers.push(
      this.session.on('game_over', ({ result }) => {
        this.showGameOver(result);
      }),
    );

    this.animate();
  }

  playStartIntro(onComplete: () => void): void {
    const state = this.session.getRenderState();
    const p = state.player;
    const overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:700',
      'background:#000',
      'opacity:0',
      'pointer-events:none',
      'transition:none',
    ].join(';');
    document.body.appendChild(overlay);

    this.startIntro?.overlay.remove();
    this.startIntro = {
      elapsed: 0,
      spawnX: p.x,
      spawnY: p.y,
      spawnZ: p.z,
      overlay,
      worldRevealed: false,
      revealAlpha: 0,
      idleFlavorStarted: false,
      idleFlavorDuration: START_INTRO_IDLE_SECONDS,
      onComplete,
    };

    this.cameraOrbit.setEnabled(false);
    this.setStartIntroWorldVisible(false);
    this.setStartIntroHudVisible(false);
    this.setStartIntroBlackWorld();
    this.lastEventGameTime = state.gameTime;
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
    // 移除全局键盘监听 + 退订 session 事件，断开旧 GameScene 闭包引用链。
    if (this.onKeyDown) window.removeEventListener('keydown', this.onKeyDown);
    if (this.onKeyUp) window.removeEventListener('keyup', this.onKeyUp);
    this.onKeyDown = undefined;
    this.onKeyUp = undefined;
    for (const unsub of this.sessionUnsubscribers) unsub();
    this.sessionUnsubscribers = [];
    // 移除 canvas 上的 WebGL context lost / restored 监听 + 清理提示浮层。
    if (this.onContextLost) this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    if (this.onContextRestored) this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.onContextLost = undefined;
    this.onContextRestored = undefined;
    this.contextLostOverlay?.remove();
    this.contextLostOverlay = undefined;
    if (this.startIntroWorldMaterials.length > 0) {
      this.setStartIntroWorldAlpha(1);
      this.startIntroWorldMaterials = [];
    }
    this.startIntroCameraHandoffTimer = 0;
    this.startIntro?.overlay.remove();
    this.startIntro = null;
    this.cameraOrbit?.dispose();
    removeMobileActionCluster();
    this.platformInput.dispose();
    // 释放本实例独占的后处理 / Blob 阴影 GPU 资源，再 dispose 渲染器。
    // 注意：不盲目遍历整个场景 dispose materials/textures —— 部分是跨局复用的模块级单例
    // （toon 渐变贴图 / 预加载 VFX 贴图），错误释放会让下一局渲染崩坏。移除全局监听 + 退订
    // session 后，旧 GameScene 整棵场景图与 GL 上下文已无引用，可被 GC 连同 GPU 资源回收。
    this.composer?.dispose();
    this.outlinePass?.dispose(); // EffectComposer.dispose 不级联各 pass，手动释放 sceneRT / 深度纹理 / 描边材质
    this.darkComicPass?.dispose();
    this.blobShadows?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.hudContainer?.remove();
    this.perfStatsEl?.remove();
    this.perfStatsEl = null;
    this.perfStatsVisible = false;
    if (this.perfKeyHandler) {
      window.removeEventListener('keydown', this.perfKeyHandler);
      this.perfKeyHandler = null;
    }
    this.gmWeaponDamagePanel?.remove();
    this.gmWeaponDamagePanel = null;
    this.gmWeaponDamageBody = null;
    this.gmWeaponDamageRows.clear();
    this.gmWeaponDamageSig = '';
    this.upgradePanel?.remove();
    this.gameOverPanel?.remove();
    this.pausePanel?.remove();
    this.pausePanel = null;
    this.shrinePanel?.remove();
    this.chestRewardPanel?.remove();
    this.pendingChestRewardReveal = null;
    this.chestOpenAnimDone.clear();
    this.shrineIndicator?.remove();
    if (this.majorNoticeTimer) {
      clearTimeout(this.majorNoticeTimer);
      this.majorNoticeTimer = null;
    }
    this.majorNoticeEl?.remove();
    this.majorNoticeEl = null;
    this.lowHealthOverlay?.remove();
    this.lowHealthOverlay = null;
    this.finalSwarmBorder?.remove();
    gsapAnimations.cancelOvertimeNotice(this.overtimeNoticeEl);
    this.overtimeNoticeEl?.remove();
    gsapAnimations.cancelFinalSwarmNotice(this.finalSwarmNoticeEl);
    this.finalSwarmNoticeEl?.remove();
    this.itemTooltip?.remove();
    this.itemTooltip = null;
    this.closeBondDetail();
    this.bondDetailOverlay?.remove();
    this.comboLabel?.remove();
    for (const el of this.damageNums) el.remove();
  }

  // ===========================================================================
  // Setup
  // ===========================================================================

  private setupLighting(): void {
    // 压低环境光：均匀光不被 gradientMap 量化，会把暗面也抬亮 → 白模整片翻白没断层。
    // 只留很薄一层兜底色彩（不死黑），让暗面真正暗下去，阶梯才显现。
    const ambient = new THREE.AmbientLight('#eef4ff', 0.18);
    ambient.name = 'AmbientLight';
    this.scene.add(ambient);
    this.ambientLight = ambient;

    // 暖色方向主光（被 gradientMap 阶梯化的那束）——降到不溢出区间：受光面到亮但不顶白，三档断层才看得见。
    const dir = new THREE.DirectionalLight('#FFF5E0', 1.35);
    dir.name = 'DirectionalLight';
    dir.position.set(15, 25, 15);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 2048;
    dir.shadow.mapSize.height = 2048;
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 70;
    const d = 30;
    dir.shadow.camera.left = -d;
    dir.shadow.camera.right = d;
    dir.shadow.camera.top = d;
    dir.shadow.camera.bottom = -d;
    dir.shadow.bias = -0.0006;
    dir.shadow.normalBias = 0.02; // 防止阴影产生锯齿或重叠伪影
    this.scene.add(dir);
    this.dirLight = dir;

    // 半球补光：天蓝/地暖给暗部一点通透的环境色——同样压薄，避免再抬亮面冲淡阶梯。
    const hemi = new THREE.HemisphereLight('#bfe4ff', '#b8a888', 0.14);
    hemi.name = 'HemisphereLight';
    this.scene.add(hemi);
    this.hemiLight = hemi;

    // Player spotlight (softer, warm tint)
    // 暂时关闭（intensity=0）：它跟随玩家形成一个"圈内亮/圈外暗"的径向光锥边界，
    // 是用户看到的"跟着玩家走的白圈"成因。先隔离掉，纯看全局光照下的地板是否均匀。
    this.playerSpotLight = new THREE.SpotLight('#FFF5E0', 0.0, 25, Math.PI / 5, 0.6, 1);
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

  private applySkyMode(mode: 'photo' | 'color'): void {
    if (mode === 'photo') {
      this.scene.background = null;
      if (this.container) {
        // 纯 CSS 渐变天空（无外链依赖）；颜色由天气系统动态插值。
        this.container.style.backgroundImage = this.buildSkyGradient(this.weatherBlend);
        this.container.style.backgroundSize = '100% 100%';
        this.container.style.backgroundPosition = 'center';
        this.container.style.backgroundRepeat = 'no-repeat';
      }
    } else {
      this.scene.background = WEATHER_DAY_FOG_COLOR.clone().lerp(WEATHER_NIGHT_FOG_COLOR, this.weatherBlend);
      if (this.container) {
        this.container.style.backgroundImage = 'none';
        this.container.style.backgroundColor = '#87CEEB';
      }
    }
  }

  private buildSkyGradient(blend: number): string {
    const t = THREE.MathUtils.clamp(blend, 0, 1);
    const top = WEATHER_DAY_SKY_TOP.clone().lerp(WEATHER_NIGHT_SKY_TOP, t).getStyle();
    const mid = WEATHER_DAY_SKY_MID.clone().lerp(WEATHER_NIGHT_SKY_MID, t).getStyle();
    const bottom = WEATHER_DAY_SKY_BOTTOM.clone().lerp(WEATHER_NIGHT_SKY_BOTTOM, t).getStyle();
    return `linear-gradient(180deg, ${top} 0%, ${mid} 44%, ${bottom} 100%)`;
  }

  private setStartIntroWorldVisible(visible: boolean): void {
    if (this.groundMesh) this.groundMesh.visible = visible;
    if (this.levelScene) this.levelScene.visible = visible;
    this.cameraOrbit.setOccluders(visible ? this.cameraOccluders : []);
  }

  private collectStartIntroWorldMaterials(): THREE.Material[] {
    const mats = new Set<THREE.Material>();
    const addObject = (obj: THREE.Object3D | null) => {
      obj?.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh || !mesh.material) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of materials) mats.add(mat);
      });
    };
    addObject(this.groundMesh);
    addObject(this.levelScene);
    return [...mats];
  }

  private setStartIntroWorldAlpha(alpha: number): void {
    const a = THREE.MathUtils.clamp(alpha, 0, 1);
    for (const mat of this.startIntroWorldMaterials) {
      if (mat.userData.startIntroOpacity === undefined) {
        mat.userData.startIntroOpacity = mat.opacity;
        mat.userData.startIntroTransparent = mat.transparent;
        mat.userData.startIntroDepthWrite = mat.depthWrite;
      }
      const baseOpacity = Number(mat.userData.startIntroOpacity ?? 1);
      mat.opacity = baseOpacity * a;
      mat.transparent = a < 0.999 ? true : Boolean(mat.userData.startIntroTransparent);
      mat.depthWrite = a < 0.999 ? false : Boolean(mat.userData.startIntroDepthWrite);
      mat.needsUpdate = true;
    }
  }

  private setStartIntroBackgroundAlpha(alpha: number): void {
    const a = THREE.MathUtils.clamp(alpha, 0, 1);
    const darkness = 1 - a;

    if (skyMode === 'photo') {
      this.scene.background = null;
      this.container.style.backgroundImage =
        `linear-gradient(rgba(0,0,0,${darkness.toFixed(3)}), rgba(0,0,0,${darkness.toFixed(3)})), ${this.buildSkyGradient(this.weatherBlend)}`;
      this.container.style.backgroundSize = '100% 100%';
      this.container.style.backgroundPosition = 'center';
      this.container.style.backgroundRepeat = 'no-repeat';
      this.container.style.backgroundColor = '#000';
      return;
    }

    const target = WEATHER_DAY_FOG_COLOR.clone().lerp(WEATHER_NIGHT_FOG_COLOR, this.weatherBlend);
    const bgColor = new THREE.Color(0x000000).lerp(target, a);
    this.scene.background = bgColor;
    this.container.style.backgroundImage = 'none';
    this.container.style.backgroundColor = bgColor.getStyle();
  }

  private setStartIntroHudVisible(visible: boolean): void {
    if (!this.hudContainer) return;
    this.hudContainer.style.opacity = visible ? '1' : '0';
    this.hudContainer.style.pointerEvents = 'none';
  }

  private setStartIntroBlackWorld(): void {
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = null;
    this.container.style.backgroundImage = 'none';
    this.container.style.backgroundColor = '#000';
  }

  private setStartIntroOverlayOpacity(opacity: number): void {
    const intro = this.startIntro;
    if (!intro) return;
    const alpha = THREE.MathUtils.clamp(opacity, 0, 1);
    intro.overlay.style.display = alpha <= 0.001 ? 'none' : 'block';
    intro.overlay.style.opacity = alpha.toFixed(3);
  }

  private updateStartIntro(dt: number): 'none' | 'introOnly' | 'fullWorld' | 'completeFullWorld' {
    const intro = this.startIntro;
    if (!intro) return 'none';

    intro.elapsed += dt;
    const fadeEnd = START_INTRO_FADE_TO_BLACK_SECONDS;
    const walkEnd = fadeEnd + START_INTRO_WALK_SECONDS;
    const idleEnd = walkEnd + Math.max(START_INTRO_IDLE_SECONDS, intro.idleFlavorDuration) + START_INTRO_IDLE_SETTLE_SECONDS;
    const revealEnd = idleEnd + START_INTRO_REVEAL_SECONDS;

    if (intro.elapsed < fadeEnd) {
      this.setStartIntroBlackWorld();
      this.setStartIntroOverlayOpacity(smoothstep01(0, 1, intro.elapsed / fadeEnd));
      return 'introOnly';
    }

    if (intro.elapsed < walkEnd) {
      this.setStartIntroOverlayOpacity(0);
      this.setStartIntroBlackWorld();
      return 'introOnly';
    }

    if (intro.elapsed < idleEnd) {
      this.setStartIntroOverlayOpacity(0);
      this.setStartIntroBlackWorld();
      return 'introOnly';
    }

    if (!intro.worldRevealed) {
      intro.worldRevealed = true;
      this.setStartIntroWorldVisible(true);
      this.startIntroWorldMaterials = this.collectStartIntroWorldMaterials();
      this.setStartIntroWorldAlpha(0);
      this.scene.fog = new THREE.Fog('#87CEEB', WEATHER_DAY_FOG_NEAR, WEATHER_DAY_FOG_FAR);
      this.applyWeatherVisuals();
      intro.revealAlpha = 0;
      this.setStartIntroBackgroundAlpha(0);
      this.camera.up.set(0, 1, 0);
    }

    if (intro.elapsed < revealEnd) {
      const revealT = (intro.elapsed - idleEnd) / START_INTRO_REVEAL_SECONDS;
      const alpha = smoothstep01(0, 1, revealT);
      intro.revealAlpha = alpha;
      this.setStartIntroOverlayOpacity(0);
      this.setStartIntroWorldAlpha(alpha);
      this.setStartIntroBackgroundAlpha(alpha);
      return 'fullWorld';
    }

    this.setStartIntroOverlayOpacity(0);
    intro.revealAlpha = 1;
    this.setStartIntroWorldAlpha(1);
    this.setStartIntroBackgroundAlpha(1);
    this.startIntroWorldMaterials = [];
    intro.overlay.remove();
    this.startIntro = null;
    this.setStartIntroWorldVisible(true);
    this.cameraOrbit.setOccluders([]);
    this.cameraOrbit.update(this.camera, { x: intro.spawnX, y: intro.spawnY, z: intro.spawnZ }, 1 / 60);
    this.startIntroCameraHandoffTimer = 0.45;
    this.setStartIntroHudVisible(true);
    this.cameraOrbit.setEnabled(true);
    intro.onComplete();
    return 'completeFullWorld';
  }

  private getStartIntroWalkT(): number {
    const intro = this.startIntro;
    if (!intro) return 1;
    const walkElapsed = intro.elapsed - START_INTRO_FADE_TO_BLACK_SECONDS;
    return THREE.MathUtils.clamp(walkElapsed / START_INTRO_WALK_SECONDS, 0, 1);
  }

  private getStartIntroPlayerPosition(target: THREE.Vector3): THREE.Vector3 {
    const intro = this.startIntro;
    const p = this.session.getRenderState().player;
    if (!intro) return target.set(p.x, p.y, p.z);

    const t = smoothstep01(0, 1, this.getStartIntroWalkT());
    target.set(
      intro.spawnX,
      intro.spawnY,
      intro.spawnZ - START_INTRO_WALK_DISTANCE * (1 - t),
    );
    return target;
  }

  private renderStartIntroFrame(state: GameState): void {
    if (!this.blobShadows) this.blobShadows = new BlobShadowPool(this.scene);
    this.blobShadows.begin();
    this.renderStartIntroPlayer(state);
    this.blobShadows.end();
    this.updateStartIntroCamera(state);
  }

  private renderStartIntroPlayer(state: GameState): void {
    const p = state.player;
    const visualPos = this.getStartIntroPlayerPosition(this._tempVec);
    const isGltfModel = this.playerMesh.name === 'Player' && this.playerMesh.children.length > 0;
    const modelY = isGltfModel ? 0 : 1.0;

    if (this.playerMixer) {
      this.playerMixer.update(this.frameDt);
    }

    const walkT = this.getStartIntroWalkT();
    if (walkT < 0.985) {
      this.playPlayerAnim('Walk', 1.05);
    } else {
      const intro = this.startIntro;
      const idleElapsed = intro
        ? intro.elapsed - START_INTRO_FADE_TO_BLACK_SECONDS - START_INTRO_WALK_SECONDS
        : 0;
      if (intro && intro.idleFlavorStarted && idleElapsed >= intro.idleFlavorDuration) {
        this.playPlayerAnim('Idle');
      } else {
        this.playStartIntroIdleFlavor();
      }
    }

    this.playerMesh.position.set(visualPos.x, visualPos.y + modelY, visualPos.z);
    this.playerMesh.rotation.y = 0;
    this.playerMesh.visible = true;
    this.playerFx.update(this.playerMesh, 0, performance.now() * 0.001);

    if (this.playerRing) this.playerRing.visible = false;
    for (const obj of this.weaponFloaters.values()) obj.visible = false;

    this.blobShadows?.place(visualPos.x, p.y, visualPos.z, 0.55);
    this.playerSpotLight.position.set(visualPos.x, p.y + 12, visualPos.z);
    this.playerSpotLight.target.position.set(visualPos.x, p.y, visualPos.z);
    if (this.dirLight) {
      this.dirLight.position.set(visualPos.x + 15, p.y + 25, visualPos.z + 15);
      this.dirLight.target.position.set(visualPos.x, p.y, visualPos.z);
    }
  }

  private playStartIntroIdleFlavor(): void {
    const intro = this.startIntro;
    if (!intro) {
      this.playPlayerAnim('Idle');
      return;
    }

    if (intro.idleFlavorStarted) return;

    const flavor = this.playerAnimations.has('Dance') ? 'Dance'
      : this.playerAnimations.has('Hello') ? 'Hello'
        : null;
    if (!flavor) {
      intro.idleFlavorStarted = true;
      intro.idleFlavorDuration = START_INTRO_IDLE_SECONDS;
      this.playPlayerAnim('Idle');
      return;
    }

    const action = this.playerAnimations.get(flavor);
    const loops = flavor === 'Dance' ? 2 : 1;
    intro.idleFlavorStarted = true;
    intro.idleFlavorDuration = Math.max(
      START_INTRO_IDLE_SECONDS,
      (action?.getClip().duration ?? START_INTRO_IDLE_SECONDS) * loops,
    );
    this.playPlayerAnim(flavor, 1.0, loops);
  }

  private updateStartIntroCamera(state: GameState): void {
    const intro = this.startIntro;
    if (!intro) return;

    const camT = smoothstep01(0, 1, this.getStartIntroWalkT());

    const topCam = new THREE.Vector3(
      intro.spawnX,
      intro.spawnY + START_INTRO_TOP_CAMERA_HEIGHT,
      intro.spawnZ,
    );
    const topTarget = new THREE.Vector3(intro.spawnX, intro.spawnY, intro.spawnZ);
    const defaultCam = new THREE.Vector3(
      intro.spawnX,
      intro.spawnY + 5,
      intro.spawnZ - this.cameraOrbit.camDistance,
    );
    const defaultTarget = new THREE.Vector3(intro.spawnX, intro.spawnY + 1.5, intro.spawnZ + 2);

    this.camera.up.copy(new THREE.Vector3(0, 0, 1).lerp(new THREE.Vector3(0, 1, 0), camT).normalize());
    this.camera.position.copy(topCam.lerp(defaultCam, camT));
    this.camera.lookAt(topTarget.lerp(defaultTarget, camT));
    this.camera.fov = 60;
    this.currentFOV = 60;
    this.targetFOV = 60;
    this.camera.updateProjectionMatrix();
    curvedWorldUniforms.uWarpCenter.value.set(state.player.x, state.player.y, state.player.z);
  }

  private updateWeather(state: GameState, dt: number): void {
    this.weatherTarget = (state.overtimeSeconds > 0 || state.finalSwarm) ? 1 : 0;
    const alpha = 1 - Math.exp(-dt / WEATHER_TRANSITION_SECONDS);
    this.weatherBlend = THREE.MathUtils.clamp(
      this.weatherBlend + (this.weatherTarget - this.weatherBlend) * alpha,
      0,
      1,
    );
    this.applyWeatherVisuals();
    if (this.startIntro?.worldRevealed) {
      this.setStartIntroBackgroundAlpha(this.startIntro.revealAlpha);
    }
  }

  /**
   * 最终狂潮 / 超时 → DarkComic 后期渐进。
   * - `state.finalSwarm` true（gameTime 480-540）：ramp01 在 `rampDurationSeconds` 内线性从 0 → 1
   * - `state.overtimeSeconds > 0`（超时进 overtime）：继续保持 / 继续 ramp 到 1，避免一过 540 立刻被冲掉
   *   ——核心要点：spawning 系统在 gameTime≥540 会把 finalSwarm 重置为 false，所以这里必须额外看 overtime
   * - 其它情况或 defeat/victory：~2s 内快速回落到 0，结算/失败画面立刻清爽
   * 实际去饱和/噪点上限由 darkComicPass.desaturateMax / noiseMax 控制（🎨 调试面板可调）。
   */
  private updateDarkComic(state: GameState, dt: number): void {
    const dc = this.darkComicPass;
    if (!dc) return;
    const interactive = state.phase !== 'defeat' && state.phase !== 'victory';
    const inFinalSwarm = !!state.finalSwarm && interactive;
    const inOvertime = state.overtimeSeconds > 0 && interactive;
    if (inFinalSwarm || inOvertime) {
      const dur = Math.max(0.5, dc.rampDurationSeconds);
      dc.ramp01 = Math.min(1, dc.ramp01 + dt / dur);
    } else {
      // 退出时 2s 内回落，避免胜利/失败屏还带灰阶颗粒
      const fallback = 2.0;
      dc.ramp01 = Math.max(0, dc.ramp01 - dt / fallback);
    }
  }

  private applyWeatherVisuals(): void {
    const t = this.weatherBlend;

    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = THREE.MathUtils.lerp(WEATHER_DAY_FOG_NEAR, WEATHER_NIGHT_FOG_NEAR, t);
      this.scene.fog.far = THREE.MathUtils.lerp(WEATHER_DAY_FOG_FAR, WEATHER_NIGHT_FOG_FAR, t);
      this.scene.fog.color.copy(WEATHER_DAY_FOG_COLOR).lerp(WEATHER_NIGHT_FOG_COLOR, t);
    }

    if (this.dirLight) {
      this.dirLight.intensity = THREE.MathUtils.lerp(1.35, 0.55, t);
      this.dirLight.color.copy(WEATHER_DAY_DIR_LIGHT_COLOR).lerp(WEATHER_NIGHT_DIR_LIGHT_COLOR, t);
    }
    if (this.ambientLight) {
      this.ambientLight.intensity = THREE.MathUtils.lerp(0.18, 0.1, t);
    }
    if (this.hemiLight) {
      this.hemiLight.intensity = THREE.MathUtils.lerp(0.14, 0.07, t);
    }

    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(WEATHER_DAY_EXPOSURE, WEATHER_NIGHT_EXPOSURE, t);
    if (this.colorGradePass) {
      this.colorGradePass.saturation = THREE.MathUtils.lerp(GRADE_SATURATION, WEATHER_NIGHT_GRADE_SATURATION, t);
      this.colorGradePass.contrast = THREE.MathUtils.lerp(GRADE_CONTRAST, WEATHER_NIGHT_GRADE_CONTRAST, t);
      this.colorGradePass.brightness = THREE.MathUtils.lerp(GRADE_BRIGHTNESS, WEATHER_NIGHT_GRADE_BRIGHTNESS, t);
    }

    this.applySkyMode(skyMode);
  }

  /**
   * 后处理：SceneOutlinePass（场景渲染 + 屏幕空间深度描边）→ [可选 bloom] → OutputPass（tonemap）。
   *
   * BLOOM_ENABLED = false（默认关闭，性能优化）：UnrealBloomPass 的半分辨率降采样 +
   * 多次高斯模糊是移动端 / 集显帧率的最大单项开销，关闭后还会释放其 mip render targets 显存。
   * 描边与 tone map（OutputPass）不受影响，画面整体观感基本一致，仅少了发光特效的辉光晕。
   * 想开回：把 BLOOM_ENABLED 改回 true 即可（调试面板的 Bloom 段也会随之出现）。
   */
  private setupComposer(): void {
    const BLOOM_ENABLED = false;
    const composer = new EffectComposer(this.renderer); // 默认 HalfFloat 目标，保 HDR
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const dpr = this.renderer.getPixelRatio();
    composer.setPixelRatio(dpr);
    composer.setSize(w, h);

    const outlinePass = new SceneOutlinePass(
      this.scene, this.camera,
      Math.round(w * dpr), Math.round(h * dpr),
    );
    composer.addPass(outlinePass);
    this.outlinePass = outlinePass;

    if (BLOOM_ENABLED) {
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(Math.max(1, w * dpr * 0.5), Math.max(1, h * dpr * 0.5)), // 半分辨率省手机
        0.3,  // strength：微微
        0.5,  // radius
        1.0,  // threshold：抬高 → 只让真正的发光特效辉光，普通亮面不再被晕白
      );
      composer.addPass(bloom);
      this.bloomPass = bloom;
    }

    composer.addPass(new OutputPass()); // tone map：ACES + sRGB
    // 末端美漫调色：提饱和 / 对比 / 亮度，让画面更鲜亮、色块更跳。
    const colorGrade = new ColorGradePass(GRADE_SATURATION, GRADE_CONTRAST, GRADE_BRIGHTNESS);
    composer.addPass(colorGrade);
    this.colorGradePass = colorGrade;

    // feat/dark-comic-postfx：末端"暗黑漫画"风格 pass。开关常量在这里，关掉就是回到主分支观感。
    // 实际去饱和/噪点强度由 GameScene.updateDarkComic 每帧根据 state.finalSwarm 渐进驱动。
    const DARK_COMIC_ENABLED = true;
    if (DARK_COMIC_ENABLED) {
      const darkComic = new DarkComicPass();
      darkComic.setSize(Math.round(w * dpr), Math.round(h * dpr));
      composer.addPass(darkComic);
      this.darkComicPass = darkComic;
    }

    this.composer = composer;
  }

  private renderFrame(): void {
    // dev 诊断：渲染提交墙钟耗时(EMA)。不被 vsync(60封顶)掩盖，反映 CPU 端 draw 提交负载——
    // 这个 ms 越接近 16.6 越接近掉帧临界点。生产构建里 import.meta.env.DEV 恒为 false，整块计时被 tree-shake。
    const t0 = import.meta.env.DEV ? performance.now() : 0;
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    if (import.meta.env.DEV) {
      this.perfRenderMs = this.perfRenderMs * 0.9 + (performance.now() - t0) * 0.1;
    }
  }
  private perfRenderMs = 0;

  /** GL context 丢失时显示的提示浮层（懒创建，复用同一节点）。 */
  private showContextLostOverlay(): void {
    if (!this.contextLostOverlay) {
      const el = document.createElement('div');
      el.style.cssText =
        'position:absolute;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(0,0,0,0.82);color:#fff;font-size:clamp(14px,4vw,18px);text-align:center;' +
        'padding:24px;pointer-events:none;';
      el.textContent = '⚠️ 渲染上下文丢失，正在尝试恢复…\nGraphics context lost — recovering…';
      el.style.whiteSpace = 'pre-line';
      this.contextLostOverlay = el;
    }
    if (!this.contextLostOverlay.parentElement) {
      this.container.appendChild(this.contextLostOverlay);
    }
  }

  private hideContextLostOverlay(): void {
    this.contextLostOverlay?.remove();
  }

  private setupGround(): void {
    // =========================================================================
    // 1. Dark base ground under everything
    // =========================================================================
    const baseGeo = new THREE.PlaneGeometry(400, 400);
    baseGeo.rotateX(-Math.PI / 2);
    // 关键修复：手动生成的底板也必须进行高密度三角剖分细分，确保它在 GPU 空间弯曲时完美贴合球面，
    // 绝对不会因为低顶点密度而形成平直的大平板穿透并遮挡视野！
    const tessellatedGeo = tessellateGeometry(baseGeo, 1.8);
    const baseMat = new THREE.MeshToonMaterial({ color: '#4A7FB5', gradientMap: toonGradientMap });
    applyStylizedToonShading(baseMat, 0, true); // 地面底板也加风格化 + 网点
    this.groundMesh = new THREE.Mesh(tessellatedGeo, baseMat);
    this.groundMesh.name = 'Ground_Base';
    this.groundMesh.receiveShadow = true;
    this.groundMesh.position.y = -0.5;
    this.scene.add(this.groundMesh);

    // =========================================================================
    // 2. Mount loaded level (whitebox). 缺关卡走不到这里 —— main() 会先抛错。
    // =========================================================================
    if (!loadedLevel) {
      throw new Error('[Scene] loadedLevel is null — level GLB failed to load before scene setup.');
    }
    const levelScene = cloneSkeleton(loadedLevel.scene) as THREE.Object3D;
    levelScene.name = 'LevelRoot';
    applySceneryMode(levelScene, sceneryMode);
    this.scene.add(levelScene);
    this.levelScene = levelScene;
    this.cameraOccluders.push(levelScene);

    // 一次性收集背景 mesh，避免每帧 traverse 整棵关卡场景树
    this.backgroundMeshes = [];
    levelScene.traverse((child) => {
      if (child.userData && child.userData.isBackground) {
        this.backgroundMeshes.push(child);
      }
    });

    // 把收集到的静态遮挡物交给镜头做碰撞推镜
    this.cameraOrbit.setOccluders(this.cameraOccluders);
  }

  private setupPlayer(): void {
    const state = this.session.getRenderState();
    const charColor = CHARACTER_COLORS[state.character] ?? 0xa8e6cf;

    // Character → model mapping
    const CHARACTER_MODELS: Record<string, string> = {
      megachad: '/models/player_george.glb',
      roberto: '/models/player_stan.glb',
      skateboard_skeleton: '/models/player_leela.glb',
    };
    const modelPath = CHARACTER_MODELS[state.character] ?? CHARACTER_MODELS['megachad'];

    // Always start with fallback — will be replaced once model loads
    const bodyGeo = new THREE.CapsuleGeometry(0.5, 1.0, 8, 16);
    const bodyMat = new THREE.MeshToonMaterial({ color: charColor, gradientMap: toonGradientMap });
    applyStylizedToonShading(bodyMat, 0.3, true); // 玩家：开启网点
    this.playerMesh = new THREE.Mesh(bodyGeo, bodyMat);
    this.playerMesh.name = 'Player';
    this.playerMesh.position.y = 1.0;
    this.cacheHitFlashMaterialBases(this.playerMesh);
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
          applyStylizedToonShading(toon, 0.3, true); // 主角留一点塑料玩具光泽 + 网点
          return toon;
        });
        mesh.material = toonMats.length === 1 ? toonMats[0] : toonMats;
      });
      this.cacheHitFlashMaterialBases(model);
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
      const activePlayerTint = this.playerHitFlashTint;
      this.setPlayerHitFlashTint(undefined);
      this.playerMesh = model as unknown as THREE.Mesh;
      if (activePlayerTint !== null) this.setPlayerHitFlashTint(activePlayerTint);
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
  }

  private playPlayerAnim(name: string, timeScale: number = 1.0, loops: number = 1): void {
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
    } else if (name === 'Death') {
      // 死亡动画只播一次，最后一帧定格在"躺地"姿态，避免循环复活的诡异感
      newAction.setLoop(THREE.LoopOnce, 1);
      newAction.clampWhenFinished = true;
    } else if (
      name === 'Hello' ||
      name === 'Dance' ||
      name === 'HitRecieve_1' ||
      name === 'HitRecieve_2' ||
      name === 'Pickup' ||
      name === 'Punch'
    ) {
      // 一次性表演 / 受击 / 拾取 / 出拳：播完允许平滑过渡回 Idle / Walk / Run
      // loops 控制总播放次数（Dance 通常播 2-3 遍才有"表演感"）
      if (loops > 1) {
        newAction.setLoop(THREE.LoopRepeat, loops);
      } else {
        newAction.setLoop(THREE.LoopOnce, 1);
      }
      newAction.clampWhenFinished = false;
    } else {
      newAction.setLoop(THREE.LoopRepeat, Infinity);
      newAction.clampWhenFinished = false;
    }

    this.currentPlayerAnim = name;
  }

  /**
   * 玩家开始移动 / 跳跃 / 滑铲时重置 Idle flavor 冷却。
   * 让玩家停下来后等若干秒才会插播下一段 Hello / Dance，
   * 避免"一停就跳"的违和感。
   */
  private resetIdleFlavorCooldown(): void {
    // 6 - 14 秒随机
    this.idleFlavorCooldown = 6 + Math.random() * 8;
    this.idleFlavorTimer = 0;
  }

  /**
   * 玩家静止时调用：在 Idle 与 Hello / Dance 之间切换。
   * - 默认播 Idle
   * - 冷却到点后随机插一段 Hello 或 Dance（LoopOnce）
   * - flavor 播放结束自动回到 Idle 并重设冷却
   * - 一旦玩家在 flavor 播放途中移动，会被外层的 Walk / Run 分支直接打断
   */
  private updateIdleFlavor(): void {
    const isFlavorPlaying =
      this.currentPlayerAnim === 'Hello' || this.currentPlayerAnim === 'Dance';

    if (isFlavorPlaying) {
      this.idleFlavorTimer -= this.frameDt;
      if (this.idleFlavorTimer <= 0) {
        this.idleFlavorTimer = 0;
        this.idleFlavorCooldown = 6 + Math.random() * 8;
        this.playPlayerAnim('Idle', 1.0);
      }
      return;
    }

    this.playPlayerAnim('Idle', 1.0);

    this.idleFlavorCooldown -= this.frameDt;
    if (this.idleFlavorCooldown <= 0) {
      const flavor = Math.random() < 0.5 ? 'Hello' : 'Dance';
      const action = this.playerAnimations.get(flavor);
      if (action) {
        // Dance 单遍时间太短，循环 2-3 遍才有完整的"表演感"；Hello 1 遍即可
        const loops = flavor === 'Dance' ? 2 + Math.floor(Math.random() * 2) : 1;
        this.idleFlavorTimer = action.getClip().duration * loops;
        this.playPlayerAnim(flavor, 1.0, loops);
      } else {
        // 模型缺这段动画，过 10 秒再试一次
        this.idleFlavorCooldown = 10;
      }
    }
  }

  // KayKit 骷髅：把配置的手持武器克隆并挂到角色的 handslot.r / handslot.l 骨。
  // 武器原点即握把，挂点骨已摆好朝向，identity 变换即落位；武器随角色统一缩放。
  // 模型若没有 handslot 骨（非 KayKit 皮肤）则什么都不做。
  private attachEnemyWeapons(obj: THREE.Object3D, enemyType: string): void {
    const loadout = KAYKIT_WEAPON_LOADOUT[enemyType];
    if (!loadout) return;
    // GLTFLoader 会去掉骨名里的保留字符（handslot.r → handslotr），按归一化后名字匹配，
    // 兼容两种命名。
    const norm = (s: string) => s.replace(/[\s[\].:/]/g, '');
    const findBone = (target: string): THREE.Object3D | undefined => {
      const want = norm(target);
      let found: THREE.Object3D | undefined;
      obj.traverse((c) => { if (!found && norm(c.name) === want) found = c; });
      return found;
    };
    const mount = (slotBone: string, weaponKey?: string): void => {
      if (!weaponKey) return;
      const bone = findBone(slotBone);
      const weapon = loadedKayKitWeapons[weaponKey];
      if (!bone || !weapon) return;
      const inst = weapon.clone(true);
      inst.name = `Weapon_${weaponKey}`;
      bone.add(inst);
    };
    mount('handslot.r', loadout.right);
    mount('handslot.l', loadout.left);
  }

  /**
   * 为一个敌人对象建立或复用 AnimationMixer + AnimationAction 表，并播放 Idle。
   *
   * 优化点：从对象池捞起来的 obj 在死亡时调用了 mixer.stopAllAction()，但 mixer 本
   * 身和它的所有 clipAction（含 LinearInterpolant）都还能复用。原版每次复用都
   * `new AnimationMixer(obj)` + 重建 actionsMap，每个动作动辄 ~45 个 LinearInterpolant，
   * 几百次复用后堆里 LinearInterpolant 上六万。这里把 mixer/actionsMap 挂在 obj.userData
   * 上跨复用周期保留，节省大量分配。
   */
  private setupEnemyAnimationsFor(obj: THREE.Object3D, enemyId: number, enemyType: string): void {
    const cachedMixer = obj.userData['mixer'] as THREE.AnimationMixer | undefined;
    const cachedActions = obj.userData['actionsMap'] as Map<string, THREE.AnimationAction> | undefined;

    let mixer: THREE.AnimationMixer;
    let actionsMap: Map<string, THREE.AnimationAction>;

    if (cachedMixer && cachedActions) {
      mixer = cachedMixer;
      actionsMap = cachedActions;
    } else {
      const modelKey = getEnemyModelMap()[enemyType];
      const clips = modelKey ? loadedAnimClips.get(modelKey) : undefined;
      if (!clips || clips.length === 0) return;

      mixer = new THREE.AnimationMixer(obj);
      actionsMap = new Map<string, THREE.AnimationAction>();
      for (const clip of clips) {
        actionsMap.set(clip.name, mixer.clipAction(clip));
      }
      obj.userData['mixer'] = mixer;
      obj.userData['actionsMap'] = actionsMap;
    }

    this.enemyMixers.set(enemyId, mixer);
    this.enemyAnimActions.set(enemyId, actionsMap);

    // 选 Idle 动画（带退化链：Idle → Walk → Flying → 任意第一个）。
    // .reset() 是关键：池复用时 action 处于 stop 后状态，不 reset 直接 play 会停在 0 帧不动。
    const idleAction = actionsMap.get('Idle')
      ?? actionsMap.get('Walk')
      ?? actionsMap.get('Flying')
      ?? actionsMap.values().next().value;
    if (idleAction) {
      idleAction.reset().play();
      this.enemyAnimStates.set(enemyId, idleAction.getClip().name);
    }
  }

  private playEnemyAnim(enemyId: number, name: string): void {
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
        // 施法 / 召唤（necromancer→ghost 模型无专用 spellcast clip，
        // 用 attack-melee / interact 这类伸手动作替代；其它皮肤回落到 Punch/Idle）
        'Cast': ['Attack-melee-right', 'Attack-melee-left', 'Interact-right', 'Spellcast', 'Punch', 'Idle'],
        'Summon': ['Interact-right', 'Interact-left', 'Attack-melee-right', 'Spellcast', 'Punch', 'Idle'],
      };
      const chain = fallbacks[name];
      if (chain) {
        for (const fb of chain) {
          if (actionsMap.has(fb)) { targetName = fb; break; }
        }
      }
      if (!actionsMap.has(targetName)) targetName = 'Idle';
    }

    // 去重要比对**解析后**的目标名：否则像 'Summon'→'Interact-right' 这种走 fallback 的
    // 调用，每帧 requested name 都 != 已存的 resolved name，会被当成"换动画"反复 reset()，
    // 导致 clip 永远停在第 0 帧（看起来没播）。
    const currentAnim = this.enemyAnimStates.get(enemyId);
    if (currentAnim === targetName) return;

    const prevAction = actionsMap.get(currentAnim ?? '');
    const newAction = actionsMap.get(targetName);
    if (prevAction) prevAction.fadeOut(0.2);
    if (newAction) {
      newAction.reset().fadeIn(0.2).play();
    }
    this.enemyAnimStates.set(enemyId, targetName);
  }

  /**
   * 播放 boss 动画（crossfade + 去重，逻辑同 playEnemyAnim）。
   * 找不到 clip 时按 fallback 链回落，最后兜底 Idle。
   */
  private playBossAnim(name: string): void {
    if (this.bossAnimActions.size === 0) return;

    let target = name;
    if (!this.bossAnimActions.has(target)) {
      const fallbacks: Record<string, string[]> = {
        'Run': ['Walk'],
        'Walk': ['Run'],
        'Attack.001': ['Attack'],
        'Shoot': ['Attack'],
        'Jump': ['Run', 'Attack'],
        'Death': ['Idle'],
      };
      const chain = fallbacks[name];
      if (chain) {
        for (const fb of chain) {
          if (this.bossAnimActions.has(fb)) { target = fb; break; }
        }
      }
      if (!this.bossAnimActions.has(target)) target = 'Idle';
      if (!this.bossAnimActions.has(target)) return;
    }

    if (this.bossAnimState === target) return;
    const prevAction = this.bossAnimActions.get(this.bossAnimState ?? '');
    const newAction = this.bossAnimActions.get(target);
    if (prevAction) prevAction.fadeOut(0.15);
    if (newAction) newAction.reset().fadeIn(0.15).play();
    this.bossAnimState = target;
  }

  private setupProjectileMesh(): void {
    const geo = new THREE.SphereGeometry(0.25, 6, 4);
    const mat = new THREE.MeshToonMaterial({ color: 0xffee44, gradientMap: toonGradientMap });
    this.projectileMesh = new THREE.InstancedMesh(geo, mat, MAX_PROJECTILES);
    this.projectileMesh.name = 'Projectiles';
    this.projectileMesh.count = 0;
    this.projectileMesh.frustumCulled = false;
    this.scene.add(this.projectileMesh);

    // 敌人弹幕：朝相机的火焰 billboard（平面 + 火焰贴图，加法混合发光）。
    // 每帧在 renderProjectiles 里按"朝相机 + 火焰尾沿速度反向拖尾"重建实例矩阵。
    // enemy_bullet.png 与 muzzle.png 字节相同，已去重为后者（见 VFX_TEXTURE_FILES 注释）。
    const flameTex = new THREE.TextureLoader().load('/textures/vfx/muzzle.png');
    flameTex.colorSpace = THREE.SRGBColorSpace;
    const flameGeo = new THREE.PlaneGeometry(1, 1);
    const flameMat = new THREE.MeshBasicMaterial({
      map: flameTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.enemyProjectileMesh = new THREE.InstancedMesh(flameGeo, flameMat, MAX_PROJECTILES);
    this.enemyProjectileMesh.name = 'EnemyProjectiles';
    this.enemyProjectileMesh.count = 0;
    this.enemyProjectileMesh.frustumCulled = false;
    this.enemyProjectileMesh.renderOrder = 4; // 在 outline 之上、HUD billboard 之下
    this.scene.add(this.enemyProjectileMesh);
  }

  private setupPickupMesh(): void {
    // 每种拾取物用各自的 geometry（一个 InstancedMesh / 类型），颜色仍走 instanceColor 染色。
    // xp 四档共用 Crystal1（靠颜色区分阶级）；health/health_small 用专属 OBJ 模型。
    // 银币走 coin.glb 独立克隆渲染（见 renderSilverPickups）。
    const fallback = new THREE.OctahedronGeometry(0.35, 0);
    const xpGeo = crystalGeometry ?? fallback;
    const geomFor: Partial<Record<PickupType, THREE.BufferGeometry>> = {
      xp_green: crystalGeometry ?? fallback,
      xp_blue: crystal2Geometry ?? xpGeo,
      xp_purple: crystal3Geometry ?? xpGeo,
      xp_orange: crystal4Geometry ?? xpGeo,
      health: heartGeometry ?? xpGeo,
      health_small: heartHalfGeometry ?? heartGeometry ?? xpGeo,
    };
    for (const type of Object.keys(geomFor) as PickupType[]) {
      const mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradientMap });
      const mesh = new THREE.InstancedMesh(geomFor[type], mat, MAX_PICKUPS);
      mesh.name = `Pickups_${type}`;
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.pickupMeshes.set(type, mesh);
    }
  }

  private setupGoldMoteMesh(): void {
    const loader = new THREE.TextureLoader();
    this.goldMoteTexture = loader.load(GOLD_COIN_ICON_PATH);
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
        uWarpCenter: curvedWorldUniforms.uWarpCenter,
        uWarpStrength: curvedWorldUniforms.uWarpStrength,
      },
      vertexShader: `
        uniform vec3 uWarpCenter;
        uniform float uWarpStrength;

        attribute float aSize;
        attribute float aLife;
        attribute vec3 aColor;

        varying float vLife;
        varying vec3 vColor;

        void main() {
          vLife = aLife;
          vColor = aColor;

          vec3 worldPos = position;
          vec3 diff = worldPos - uWarpCenter;
          float d = length(diff.xz);
          if (d > 1e-5 && uWarpStrength > 0.0) {
              float theta = d * uWarpStrength;
              float sinTheta = sin(theta);
              float cosTheta = cos(theta);
              vec2 dir = diff.xz / d;

              vec3 normal = vec3(sinTheta * dir.x, cosTheta, sinTheta * dir.y);
              float r = (1.0 / uWarpStrength) + diff.y;
              vec3 warpedPos = r * normal;
              warpedPos.y -= (1.0 / uWarpStrength);

              worldPos = uWarpCenter + warpedPos;
          }

          vec4 mvPosition = viewMatrix * vec4(worldPos, 1.0);
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
    this.hudContainer.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:100;font-family:"Lilita One","Noto Sans SC",Arial,sans-serif;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);box-sizing:border-box;';
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
    hpContainer.style.cssText = 'position:relative;width:clamp(150px,42vw,220px);height:clamp(18px,5vw,22px);overflow:visible;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.5));';
    this.hpBarInner = mountSvgBar(hpContainer, BAR_ASSETS.hp.track, BAR_ASSETS.hp.fill, undefined, 100).fill;
    this.hpText = document.createElement('div');
    this.hpText.style.cssText = uiPlainText(`${UI_BAR_TEXT_LAYER}font-size:clamp(10px,2.6vw,13px);font-weight:bold;white-space:nowrap;`);
    hpContainer.appendChild(this.hpText);
    this.hpBar = hpContainer;
    barsRow.appendChild(hpContainer);

    const shieldContainer = document.createElement('div');
    shieldContainer.style.cssText = 'position:relative;width:clamp(90px,26vw,138px);height:clamp(16px,4.4vw,19px);overflow:visible;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.5));display:none;';
    this.shieldBarInner = mountSvgBar(shieldContainer, BAR_ASSETS.shield.track, BAR_ASSETS.shield.fill).fill;
    this.shieldText = document.createElement('div');
    this.shieldText.style.cssText = `${UI_BAR_TEXT_LAYER}color:#eaf7ff;font-size:clamp(9px,2.3vw,12px);font-weight:bold;text-shadow:0 1px 2px rgba(0,0,0,0.95);white-space:nowrap;`;
    shieldContainer.appendChild(this.shieldText);
    this.shieldBar = shieldContainer;
    barsRow.appendChild(shieldContainer);

    topLeft.appendChild(barsRow);

    // Weapon slots (6 total: 5 base + 1 lockable)
    this.weaponSlotsContainer = document.createElement('div');
    this.weaponSlotsContainer.dataset.cameraBlock = 'true';
    this.weaponSlotsContainer.style.cssText = 'display:flex;gap:3px;flex-wrap:wrap;max-width:min(54vw,300px);pointer-events:auto;';
    topLeft.appendChild(this.weaponSlotsContainer);

    // Quest track (panel bg + text; left icon is baked into the image)
    this.questRow = document.createElement('div');
    this.questRow.style.cssText = `
      position:relative;width:${HUD_QUEST_TRACK_WIDTH};max-width:100%;flex-shrink:0;pointer-events:none;overflow:visible;
      aspect-ratio:${HUD_TASK_TRACK_SIZE.w}/${HUD_TASK_TRACK_SIZE.h};
      background:url(${HUD_TASK_TRACK_BG}) center center/100% 100% no-repeat;
      margin-left:${HUD_TASK_TRACK_OFFSET_LEFT};
    `;
    this.questLabel = document.createElement('div');
    this.questLabel.style.cssText = uiPlainText(`
      position:absolute;inset:0;display:flex;align-items:center;
      padding-left:${(HUD_TASK_TRACK_TEXT_INSET_LEFT * 100).toFixed(1)}%;padding-right:5%;
      box-sizing:border-box;font-size:${HUD_QUEST_TRACK_FONT};line-height:1.15;font-weight:bold;
    `);
    this.questLabel.textContent = t('hud.quest');
    this.questRow.appendChild(this.questLabel);
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
    this.tierBadge.style.cssText = uiPlainText('font-size:clamp(11px,2.8vw,15px);font-weight:bold;white-space:nowrap;');
    rightHudStack.appendChild(this.tierBadge);

    // Stage badge (I / II) between difficulty and timer
    this.stageBadge = document.createElement('div');
    this.stageBadge.style.cssText = 'color:#ffe08a;font-size:clamp(11px,2.8vw,15px);font-weight:900;text-shadow:0 1px 3px rgba(0,0,0,0.9);letter-spacing:1px;white-space:nowrap;';
    rightHudStack.appendChild(this.stageBadge);

    // Timer 改为屏幕顶部居中的独立胶囊（参考 megabonk 风格 UI）
    const timerCenterWrap = document.createElement('div');
    timerCenterWrap.style.cssText = 'position:absolute;top:max(12px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:1;';
    this.timerLabel = document.createElement('div');
    this.timerLabel.style.cssText = 'display:flex;align-items:center;justify-content:center;padding:clamp(2px,0.6vw,5px) clamp(10px,2.6vw,16px);background:rgba(40,30,55,0.82);border-radius:9999px;box-shadow:0 2px 6px rgba(0,0,0,0.38),inset 0 1px 0 rgba(255,255,255,0.04);font-size:clamp(11px,2.8vw,15px);font-weight:bold;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,0.7),0 0 3px rgba(0,0,0,0.55);font-variant-numeric:tabular-nums;letter-spacing:0.5px;line-height:1;white-space:nowrap;';
    this.timerTimeEl = document.createElement('span');
    this.timerTimeEl.textContent = '00:00';
    this.timerLabel.appendChild(this.timerTimeEl);
    timerCenterWrap.appendChild(this.timerLabel);
    this.hudContainer.appendChild(timerCenterWrap);

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
    this.killLabel.style.cssText = uiPlainText('display:flex;align-items:center;gap:5px;font-size:clamp(11px,2.8vw,15px);font-weight:bold;font-variant-numeric:tabular-nums;white-space:nowrap;');
    const killIcon = document.createElement('img');
    killIcon.src = KILL_COUNT_ICON_PATH;
    killIcon.alt = '';
    killIcon.draggable = false;
    killIcon.style.cssText = 'height:clamp(14px,3.2vw,22px);width:auto;aspect-ratio:1/1;object-fit:contain;flex-shrink:0;display:block;';
    this.killCountEl = document.createElement('span');
    this.killCountEl.textContent = '0';
    this.killLabel.appendChild(killIcon);
    this.killLabel.appendChild(this.killCountEl);
    rightHudStack.appendChild(this.killLabel);

    // Pause button (end of row)
    this.pauseBtn = document.createElement('div');
    this.pauseBtn.dataset.cameraBlock = 'true';
    this.pauseBtn.style.cssText = 'flex-shrink:0;min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center;cursor:pointer;pointer-events:auto;user-select:none;touch-action:manipulation;';
    this.pauseBtnIcon = document.createElement('img');
    this.pauseBtnIcon.src = HUD_PAUSE_BUTTON_NORMAL;
    this.pauseBtnIcon.alt = '';
    this.pauseBtnIcon.draggable = false;
    this.pauseBtnIcon.style.cssText = 'height:clamp(28px,6vw,36px);width:auto;display:block;pointer-events:none;object-fit:contain;';
    this.pauseBtn.appendChild(this.pauseBtnIcon);
    this.pauseBtn.addEventListener('click', () => this.togglePause());
    rightHudStack.appendChild(this.pauseBtn);

    topRight.appendChild(rightHudStack);

    // Row 2: tome stack (newest tome appended at the right, older shift left)
    this.tomesSlotsContainer = document.createElement('div');
    this.tomesSlotsContainer.dataset.cameraBlock = 'true';
    this.tomesSlotsContainer.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;max-width:min(60vw,260px);justify-content:flex-end;pointer-events:auto;';
    topRight.appendChild(this.tomesSlotsContainer);

    this.hudContainer.appendChild(topRight);

    // ---------------------------------------------------------------------
    // Bottom cluster: buff row → green XP bar → relic bar (flush to bottom)
    // ---------------------------------------------------------------------
    const bottomGroup = document.createElement('div');
    bottomGroup.style.cssText = `
      position:absolute;left:0;right:0;
      bottom:calc(0px - env(safe-area-inset-bottom,0px));
      display:flex;flex-direction:column;align-items:center;gap:6px;
      pointer-events:none;
    `;

    // Buff row: consumables on the left, bonds on the right
    this.buffRow = document.createElement('div');
    this.buffRow.style.cssText = `width:${HUD_XP_BAR_WIDTH};display:flex;justify-content:space-between;align-items:flex-end;pointer-events:none;`;
    this.consumableBuffsContainer = document.createElement('div');
    this.consumableBuffsContainer.style.cssText = 'display:flex;gap:6px;align-items:flex-end;pointer-events:none;';
    this.buffRow.appendChild(this.consumableBuffsContainer);
    this.bondSlotsContainer = document.createElement('div');
    this.bondSlotsContainer.dataset.cameraBlock = 'true';
    this.bondSlotsContainer.style.cssText = 'display:flex;gap:6px;align-items:flex-end;justify-content:flex-end;flex-wrap:wrap;max-width:60vw;pointer-events:auto;';
    this.buffRow.appendChild(this.bondSlotsContainer);
    bottomGroup.appendChild(this.buffRow);

    // XP bar (green) with level straddling the top edge (half inside / half above)
    const xpWrap = document.createElement('div');
    xpWrap.style.cssText = `position:relative;width:${HUD_XP_BAR_WIDTH};overflow:visible;pointer-events:none;`;

    const xpContainer = document.createElement('div');
    xpContainer.style.cssText = `position:relative;width:100%;height:${HUD_XP_BAR_HEIGHT};overflow:hidden;border:1px solid #4BB73D;border-radius:3px;background:#0C2410;box-shadow:0 1px 3px rgba(0,0,0,0.5);box-sizing:border-box;`;
    this.xpBarInner = mountSvgBar(xpContainer, BAR_ASSETS.xp.track, BAR_ASSETS.xp.fill).fill;

    const levelLabelWrap = document.createElement('div');
    levelLabelWrap.style.cssText = 'position:absolute;left:50%;top:0;z-index:2;transform:translate(-50%,-50%);pointer-events:none;';
    this.levelLabel = document.createElement('div');
    this.levelLabel.style.cssText = uiPlainText('font-size:clamp(10px,2.8vw,15px);font-weight:bold;transition:color 0.3s;white-space:nowrap;');
    levelLabelWrap.appendChild(this.levelLabel);

    xpWrap.appendChild(xpContainer);
    xpWrap.appendChild(levelLabelWrap);
    this.xpBar = xpContainer;
    bottomGroup.appendChild(xpWrap);

    // Relic bar (SVG provides 10 slots; relics are filled left→right)
    this.relicSlotsContainer = document.createElement('div');
    this.relicSlotsContainer.dataset.cameraBlock = 'true';
    this.relicSlotsContainer.style.cssText = `
      position:relative;width:${HUD_RELIC_BAR_WIDTH};height:${HUD_RELIC_BAR_MIN_HEIGHT};min-height:${HUD_RELIC_BAR_MIN_HEIGHT};
      background:url("${HUD_RELIC_BAR_BG}") center/100% 100% no-repeat;
      overflow:visible;box-sizing:border-box;pointer-events:auto;
    `;
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
      ${uiPlainText('font-size:12px;line-height:1.35;')}
    `;
    document.body.appendChild(this.bondDetailOverlay);

    this.itemTooltip = document.createElement('div');
    this.itemTooltip.style.cssText = `
      position:fixed;left:0;top:0;display:none;z-index:650;pointer-events:none;
      max-width:min(320px,calc(100vw - 24px));padding:10px 12px;border-radius:10px;
      background:linear-gradient(180deg,rgba(18,18,32,0.96),rgba(8,8,16,0.96));
      border:1px solid rgba(255,255,255,0.18);box-shadow:0 12px 34px rgba(0,0,0,0.55);
      ${uiPlainText('font-size:12px;line-height:1.35;')}
      backdrop-filter:blur(4px);
    `;
    document.body.appendChild(this.itemTooltip);
    this.installItemTooltipHandlers(this.weaponSlotsContainer);
    this.installItemTooltipHandlers(this.tomesSlotsContainer);
    this.installItemTooltipHandlers(this.relicSlotsContainer);
    this.installItemTooltipHandlers(this.bondSlotsContainer);

    // Boss HP bar (top-center, hidden by default)
    this.bossHpContainer = document.createElement('div');
    this.bossHpContainer.style.cssText = `position:absolute;top:${HUD_TOP_BELOW_CLUSTER};left:50%;transform:translateX(-50%);width:min(60%,92vw);max-width:500px;height:clamp(18px,5vw,22px);overflow:visible;filter:drop-shadow(0 1px 4px rgba(0,0,0,0.55));display:none;`;
    this.bossHpBarInner = mountSvgBar(this.bossHpContainer, BAR_ASSETS.boss.track, BAR_ASSETS.boss.fill, undefined, 100).fill;
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
    this.bossNameLabel.style.cssText = uiPlainText(`${UI_BAR_TEXT_LAYER}font-size:clamp(10px,2.8vw,12px);font-weight:bold;pointer-events:none;`);
    this.bossHpContainer.appendChild(this.bossNameLabel);
    this.hudContainer.appendChild(this.bossHpContainer);

    // Teleporter / 宝箱距离指示器（与充能神殿进度共用位置）
    this.teleporterIndicator = document.createElement('div');
    this.teleporterIndicator.style.cssText = `position:absolute;top:calc(${HUD_TOP_BELOW_CLUSTER} + 36px);left:50%;transform:translateX(-50%);color:#00ccff;font-size:clamp(11px,2.8vw,13px);font-weight:bold;text-shadow:0 0 8px #00ccff,0 1px 3px rgba(0,0,0,0.8);display:none;pointer-events:none;max-width:min(92vw,360px);text-align:center;white-space:nowrap;`;
    this.hudContainer.appendChild(this.teleporterIndicator);

    // 充能神殿圆形进度（与 teleporterIndicator 同位置，充能时优先显示）
    this.shrineChargeWidget = createTempleChargeIndicator();
    this.shrineIndicator = this.shrineChargeWidget.root;
    this.shrineIndicator.style.position = 'absolute';
    this.shrineIndicator.style.top = `calc(${HUD_TOP_BELOW_CLUSTER} + 36px)`;
    this.shrineIndicator.style.left = '50%';
    this.shrineIndicator.style.transform = 'translateX(-50%)';
    applyShrineChargeHudLayout(this.shrineIndicator);
    this.hudContainer.appendChild(this.shrineIndicator);

    // Boss 召唤祭坛圆形进度（与充能神殿进度共用位置）
    this.bossSummonWidget = createBossSummonIndicator();
    this.bossSummonIndicator = this.bossSummonWidget.root;
    this.bossSummonIndicator.style.position = 'absolute';
    this.bossSummonIndicator.style.top = `calc(${HUD_TOP_BELOW_CLUSTER} + 36px)`;
    this.bossSummonIndicator.style.left = '50%';
    this.bossSummonIndicator.style.transform = 'translateX(-50%)';
    applyShrineChargeHudLayout(this.bossSummonIndicator);
    this.hudContainer.appendChild(this.bossSummonIndicator);

    // 移动端交互按钮（宝箱 / 祭坛）；PC 统一 KeyE
    this.interactBtn = document.createElement('div');
    this.interactBtn.dataset.cameraBlock = 'true';
    const onInteractTap = (ev: Event) => { ev.preventDefault(); this.mobileInteractPressed = true; };
    this.interactBtn.addEventListener('touchstart', onInteractTap);
    this.interactBtn.addEventListener('mousedown', onInteractTap);
    const mobileInput = this.platformInput.getMobileInput();
    if (mobileInput) {
      setupMobileActionButtons(mobileInput, this.interactBtn);
    } else {
      this.interactBtn.style.display = 'none';
      this.hudContainer.appendChild(this.interactBtn);
    }

    // Overtime 提示图（进入 overtime 时一次性弹出，非常显）
    this.overtimeNoticeEl = document.createElement('div');
    this.overtimeNoticeEl.style.cssText = TITLE_POPUP_NOTICE_CONTAINER_STYLE;
    this.overtimeNoticeImg = document.createElement('img');
    this.overtimeNoticeImg.src = overtimeNoticeImagePath();
    this.overtimeNoticeImg.alt = '';
    this.overtimeNoticeImg.style.cssText = 'width:100%;height:auto;object-fit:contain;filter:drop-shadow(0 4px 16px rgba(0,0,0,0.55));user-select:none;';
    this.overtimeNoticeEl.appendChild(this.overtimeNoticeImg);
    document.body.appendChild(this.overtimeNoticeEl);

    // Final Swarm 提示图（进入 final swarm 时一次性弹出，非常显）
    this.finalSwarmNoticeEl = document.createElement('div');
    this.finalSwarmNoticeEl.style.cssText = TITLE_POPUP_NOTICE_CONTAINER_STYLE;
    this.finalSwarmNoticeImg = document.createElement('img');
    this.finalSwarmNoticeImg.src = finalSwarmNoticeImagePath();
    this.finalSwarmNoticeImg.alt = '';
    this.finalSwarmNoticeImg.style.cssText = 'width:100%;height:auto;object-fit:contain;filter:drop-shadow(0 4px 16px rgba(0,0,0,0.55));user-select:none;';
    this.finalSwarmNoticeEl.appendChild(this.finalSwarmNoticeImg);
    document.body.appendChild(this.finalSwarmNoticeEl);

    // Combo label (hidden initially)
    this.comboLabel = document.createElement('div');
    this.comboLabel.style.cssText = `position:absolute;top:35%;left:50%;transform:translate(-50%,-50%);color:#ffd700;font-size:${uiPx(Math.round(HUD_COMBO_FONT_BASE * HUD_COMBO_SCALE))}px;font-weight:bold;text-shadow:0 0 ${uiPx(8)}px rgba(255,215,0,0.8),0 ${uiPx(2)}px ${uiPx(3)}px rgba(0,0,0,0.9);pointer-events:none;opacity:0;transition:opacity 0.3s ease-out;white-space:nowrap;`;
    this.hudContainer.appendChild(this.comboLabel);
  }

  private setupDamageNumbers(): void {
    for (let i = 0; i < DAMAGE_NUM_POOL_SIZE; i++) {
      const el = document.createElement('div');
      el.style.cssText = `position:fixed;pointer-events:none;font-size:16px;font-weight:bold;opacity:0;transition:none;z-index:200;text-shadow:${UI_TEXT_OUTLINE_SHADOW};white-space:nowrap;padding-inline:3px;box-sizing:border-box;font-family:${DAMAGE_NUMBER_FONT_FAMILY};`;
      el.dataset.animId = String(i);  // 稳定 id：GSAP 按元素 keying，池复用时 cancel 上一个 tween
      document.body.appendChild(el);
      this.damageNums.push(el);
    }
  }

  /**
   * 左下角 FPS + Draw Call + 分类拆解诊断 overlay（EffectComposer 多 pass 需关闭 autoReset 后手动 reset）。
   * 仅 dev 构建启用（生产 `import.meta.env.DEV === false` 直接 return，不创建 DOM、不改 renderer.info、不挂键盘）。
   * 默认隐藏，按 ` 与右上角风格化调参面板同步开关。保留它是为了后续做敌人模型合批时还能用 enemy draws / sig 验证。
   */
  private setupPerfStats(): void {
    if (!import.meta.env.DEV) return;
    if (this.perfStatsEl) return;
    this.renderer.info.autoReset = false;
    const el = document.createElement('div');
    el.style.cssText = `
      position:fixed;left:max(8px,env(safe-area-inset-left));bottom:max(8px,env(safe-area-inset-bottom));
      z-index:150;display:none;pointer-events:none;padding:4px 8px;border-radius:6px;
      background:rgba(0,0,0,0.55);color:#b8ffb8;font-family:monospace;
      font-size:11px;line-height:1.45;font-variant-numeric:tabular-nums;
      text-shadow:0 1px 2px rgba(0,0,0,0.9);white-space:pre;
    `;
    el.textContent = 'FPS: --\nDraw: --';
    document.body.appendChild(el);
    this.perfStatsEl = el;

    // dev 诊断：按 ` 开关本 overlay。
    this.perfKeyHandler = (e: KeyboardEvent) => {
      if (e.code !== 'Backquote') return;
      this.perfStatsVisible = !this.perfStatsVisible;
      el.style.display = this.perfStatsVisible ? 'block' : 'none';
    };
    window.addEventListener('keydown', this.perfKeyHandler);
  }
  private perfKeyHandler: ((e: KeyboardEvent) => void) | null = null;

  private updatePerfStats(dt: number): void {
    if (!this.perfStatsEl) return;
    if (!this.perfStatsVisible) {
      this.renderer.info.reset();
      return;
    }
    this.perfFpsFrameCount += 1;
    this.perfFpsSampleTime += dt;
    if (this.perfFpsSampleTime >= 0.25) {
      this.perfFpsDisplay = Math.round(this.perfFpsFrameCount / this.perfFpsSampleTime);
      this.perfFpsFrameCount = 0;
      this.perfFpsSampleTime = 0;
    }
    const drawCalls = this.renderer.info.render.calls;
    const tris = this.renderer.info.render.triangles;
    // 临时诊断：统计敌人贡献的可见子网格数（= draw call 数），定位 draw call 来源。
    // 每 0.25s 才重算一次（与 FPS 采样同步），O(敌人数) 遍历，开销可忽略。
    if (this.perfFpsSampleTime === 0) {
      let enemyMeshes = 0;
      let enemyMerged = 0;
      let enemyMergedSig = 0;
      for (const obj of this.enemyObjects.values()) {
        const type = obj.userData['enemyType'] as string | undefined;
        let stat = type ? this.enemyMeshCountByType.get(type) : undefined;
        if (stat === undefined) {
          let meshes = 0;
          const texes = new Set<string>();
          const sigs = new Set<string>();
          obj.traverse((c) => {
            const m = c as THREE.Mesh;
            if (!m.isMesh) return;
            meshes++;
            const mm = m.material;
            const arr = Array.isArray(mm) ? mm : [mm];
            for (const x of arr) {
              const tm = x as THREE.MeshToonMaterial;
              const tex = tm?.map?.uuid ?? `color:${tm?.color?.getHexString?.() ?? 'none'}`;
              texes.add(tex);
              // 完整材质签名：贴图 + 颜色 + 自发光 + 透明/面向。同签名 = 可直接复用一个材质合并。
              const sig = `${tex}|${tm?.color?.getHexString?.() ?? '-'}|${tm?.emissiveMap?.uuid ?? '-'}|${tm?.emissive?.getHexString?.() ?? '-'}|${tm?.transparent ? 't' : 'o'}|${tm?.side ?? 0}`;
              sigs.add(sig);
            }
          });
          stat = { meshes, tex: texes.size, sig: sigs.size };
          if (type) this.enemyMeshCountByType.set(type, stat);
        }
        enemyMeshes += stat.meshes;
        enemyMerged += stat.tex;
        enemyMergedSig += stat.sig;
      }
      this.perfEnemyMeshes = enemyMeshes;
      this.perfEnemyMerged = enemyMerged;
      this.perfEnemyMergedSig = enemyMergedSig;
      this.perfEnemyCount = this.enemyObjects.size;
      this.computeDrawBreakdown();
    }
    const b = this.perfDrawBreakdown;
    const bSum = b.enemy + b.shadow + b.level + b.other;
    // alive 来自 enemyObjects（含 dying 动画前的所有挂载对象），culled = 因 >ENEMY_VISIBLE_CULL_DIST
    // 被强制 visible=false 的；alive - culled 即「画面附近实际尝试渲染的怪」（再被视锥过滤就是 b.enemy）。
    const culled = this.perfEnemyCulledFar;
    this.perfStatsEl.textContent =
      `FPS: ${this.perfFpsDisplay}\nDraw: ${drawCalls}\nTris: ${(tris / 1000).toFixed(0)}k\n` +
      `Enemies: ${this.perfEnemyCount} → ${this.perfEnemyMeshes} draws\n` +
      `  far-culled (>${ENEMY_VISIBLE_CULL_DIST}m): ${culled}\n` +
      `merge tex→ ${this.perfEnemyMerged} / sig→ ${this.perfEnemyMergedSig}\n` +
      `real draws (frustum):\n` +
      `  enemy ${b.enemy}  shadow ${b.shadow}\n` +
      `  level ${b.level}  other ${b.other}\n` +
      `  sum ${bSum} (+post ${Math.max(0, drawCalls - bSum)})\n` +
      `outline: ${this.outlinePass?.mode ?? 'off'}\n` +
      `render: ${this.perfRenderMs.toFixed(1)}ms (submit)`;
    this.renderer.info.reset();
  }

  /**
   * 临时诊断：把场景里**实际会渲染**的 draw 按类别拆开（敌人 / blob 阴影 / 地图 / 其它），
   * 定位 2419 draw 的大头。带视锥剔除 + 祖先 visible 判断 + 多材质 group 计数，
   * 四类之和应 ≈ renderer.calls（差额 = 后处理 pass / shadowmap 等）。每 0.25s 算一次。
   */
  private computeDrawBreakdown(): void {
    this.cullMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.cullFrustum.setFromProjectionMatrix(this.cullMatrix);
    let enemy = 0, shadow = 0, level = 0, other = 0;
    this.scene.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (!m.isMesh || !m.visible) return;
      // 祖先任一不可见 → 不渲染
      for (let p = m.parent; p; p = p.parent) if (!p.visible) return;
      // 视锥剔除（frustumCulled=false 的强制渲染，如 blob 阴影）
      if (m.frustumCulled && !this.cullFrustum.intersectsObject(m)) return;
      // draw 数：多材质按 geometry.groups 拆，否则 1
      const groups = (m.geometry as THREE.BufferGeometry | undefined)?.groups;
      const draws = Array.isArray(m.material) && groups && groups.length > 0 ? groups.length : 1;
      // 归类：沿 parent 链找标记
      let cat = 3; // 0 enemy / 1 shadow / 2 level / 3 other
      for (let p: THREE.Object3D | null = m; p; p = p.parent) {
        if (p.userData && p.userData['enemyType'] !== undefined) { cat = 0; break; }
        if (p.name === 'BlobShadow') { cat = 1; break; }
        if (p.name === 'LevelRoot') { cat = 2; break; }
      }
      if (cat === 0) enemy += draws;
      else if (cat === 1) shadow += draws;
      else if (cat === 2) level += draws;
      else other += draws;
    });
    this.perfDrawBreakdown.enemy = enemy;
    this.perfDrawBreakdown.shadow = shadow;
    this.perfDrawBreakdown.level = level;
    this.perfDrawBreakdown.other = other;
  }
  private enemyMeshCountByType = new Map<string, { meshes: number; tex: number; sig: number }>();
  private perfEnemyMeshes = 0;
  private perfEnemyMerged = 0;
  private perfEnemyMergedSig = 0;
  private perfEnemyCount = 0;
  // 每帧 updateEnemyObjects 累加：被 ENEMY_VISIBLE_CULL_DIST 远距剔除掉的敌人数。
  // 写在 perf 字段里方便 overlay 立刻显示「活着但不可见」的怪有多少 —— 帮玩家分辨
  // 「真的没怪」vs「怪都在 35m 外被剔除」。
  private perfEnemyCulledFar = 0;
  private perfDrawBreakdown = { enemy: 0, shadow: 0, level: 0, other: 0 };

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
   * 走到这里时 loadedLevel 必非 null（boot 失败会先抛错）。
   */
  debugToggleCollisionViz(): boolean {
    if (this.collisionDebugGroup) {
      this.collisionDebugVisible = !this.collisionDebugVisible;
      this.collisionDebugGroup.visible = this.collisionDebugVisible;
      return this.collisionDebugVisible;
    }
    if (!loadedLevel) {
      console.warn('[GM] loadedLevel 为空（理论上不该发生）。');
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

    // GL context 丢失期间停止一切渲染 / 状态读取（GPU 资源已失效），保留 rAF 循环以便恢复后续跑。
    if (this.contextLost) return;

    this.frameIndex++;

    const now = performance.now();
    const dt = this.lastTime > 0 ? Math.min((now - this.lastTime) / 1000, 0.05) : 1 / 60;
    this.lastTime = now;
    this.frameDt = dt;

    // Hit Stop / Freeze Frame (顿帧) — skip rendering updates while timer active
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= dt;
      // Still render the frozen frame
      this.renderFrame();
      this.updatePerfStats(dt);
      return;
    }

    const state = this.session.getRenderState();
    const introRenderMode = this.updateStartIntro(dt);
    if (introRenderMode === 'introOnly') {
      this.renderStartIntroFrame(state);
      this.renderFrame();
      this.updatePerfStats(dt);
      return;
    }
    const introFullWorld = introRenderMode === 'fullWorld';
    const introJustCompleted = introRenderMode === 'completeFullWorld';
    if (this.startIntroCameraHandoffTimer > 0) {
      this.startIntroCameraHandoffTimer = Math.max(0, this.startIntroCameraHandoffTimer - dt);
      if (this.startIntroCameraHandoffTimer <= 0) {
        this.cameraOrbit.setOccluders(this.cameraOccluders);
      }
    }

    // 本帧 damageEvents / bondVfxEvents 是否属于"尚未消费过的新 tick"。
    // 高刷屏下多个 rAF 帧会读到同一 tick 的事件，靠它去重避免 VFX/震动翻倍。
    const eventsFresh = state.gameTime !== this.lastEventGameTime;
    if (eventsFresh) this.lastEventGameTime = state.gameTime;

    // 玩家在 playing / boss_fight / portal_open 阶段都能控制角色：
    // - portal_open 是 Boss 击败后、玩家可选进传送门或留下打 overtime 的中间态
    if (!this.startIntro && (state.phase === 'playing' || state.phase === 'boss_fight' || state.phase === 'portal_open')) {
      this.handleInput();
    }

    // Blob 阴影：每帧前重置，玩家/敌人/boss 在各自 render 里贴脚下圆阴影。
    if (!this.blobShadows) this.blobShadows = new BlobShadowPool(this.scene);
    this.blobShadows.begin();

    if (introFullWorld) {
      this.renderStartIntroPlayer(state);
    } else {
      this.renderPlayer(state);
    }
    this.renderEnemies(state.enemies, state.damageEvents);
    this.renderProjectiles(state.projectiles);
    this.renderPickups(state.pickups);
    this.renderSilverPickups(state.pickups);
    this.renderConsumablePickups(state.consumablePickups ?? []);
    this.renderGoldMotes(state.goldMotes ?? []);
    this.renderBoss(state.boss);

    this.blobShadows.end(); // 回收本帧未用到的贴片
    this.renderTeleporters(state.altars);
    this.renderChests(state);
    this.renderShrines(state.shrines, state.player.x, state.player.z);
    this.updateVFX(state, dt, eventsFresh);
    this.updateBillboardVfx(dt);
    if (introFullWorld) {
      this.updateStartIntroCamera(state);
    } else if (!introJustCompleted) {
      this.updateCamera(state);
    }
    this.updateWeather(state, dt);
    this.updateDarkComic(state, dt);

    // 游戏已结束（失败 / 胜利）后不再触发新的镜头晃动，避免"死后被打仍在晃"的违和感
    const isGameEnded = state.phase === 'defeat' || state.phase === 'victory';

    // Process damage events for camera effects（仅消费未处理过的新 tick，避免高刷屏重复震动）
    if (!isGameEnded && eventsFresh) {
      let playerHitFlashColor: number | undefined;
      for (const evt of state.damageEvents) {
        if (evt.isPlayerDamage) {
          if (evt.damage > 0) {
            if (evt.isShield) {
              playerHitFlashColor ??= PLAYER_SHIELD_HIT_FLASH_COLOR;
            } else {
              playerHitFlashColor = PLAYER_HP_HIT_FLASH_COLOR;
            }
          }
          // Player took damage: only meaningful shake event
          this.triggerCameraShake(0.12, 12, 10);
          // 受击动画：仅在玩家站立/低速且在地面时触发，避免打断 Run/Walk 的连续移动
          const pl = state.player;
          if (
            pl.alive &&
            pl.isGrounded &&
            !pl.isSliding &&
            pl.currentSpeed < 0.3 &&
            this.hitReactTimer <= 0
          ) {
            const hitName = Math.random() < 0.5 ? 'HitRecieve_1' : 'HitRecieve_2';
            const hitAction = this.playerAnimations.get(hitName);
            if (hitAction) {
              this.hitReactTimer = hitAction.getClip().duration;
              this.playPlayerAnim(hitName, 1.0);
            }
          }
        }
        // Crits and normal hits: no shake (too frequent with multiple projectiles)
      }
      if (playerHitFlashColor !== undefined) {
        this.triggerPlayerHitFlash(playerHitFlashColor);
      }

      // Boss attack shake — only on heavy impacts（攻城机甲重砸 / 跳砸）
      if (state.boss && (state.boss.currentAttack === 'heavy_slam' || state.boss.currentAttack === 'leap_slam') && state.boss.attackTimer > 0 && state.boss.attackTimer < 0.05) {
        this.triggerCameraShake(0.15, 10, 8);
      }
    }

    this.updateHUD(state, eventsFresh);

    this.renderFrame();
    this.updatePerfStats(dt);
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
      // [DISABLED] 局内技能按钮（🔥）
      skill1: false, // raw.action3 ?? false,
      skill2: false,
      jump: this.jumpKeyDown || (raw.action1 ?? false),
      // [DISABLED] 局内滑铲按钮（⬇️）
      slide: false, // raw.action2 ?? false,
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

    // Blob 阴影贴在玩家脚下（p.y 即脚位）—— 死亡后保留，让躺地的尸体仍有影子
    this.blobShadows?.place(p.x, p.y, p.z, 0.55);

    // === Rotation: smooth interpolation, only when moving ===
    if (p.alive && p.currentSpeed > 0.3) {
      // Smoothly rotate toward target (prevent sudden spinning)
      let angleDiff = p.rotation - this.playerMesh.rotation.y;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      // Faster rotation at low speed (immediate turn), slower at high speed (smooth arc)
      const rotSpeed = p.currentSpeed > 3.0 ? 0.12 : 0.2;
      this.playerMesh.rotation.y += angleDiff * rotSpeed;
    }
    // 死亡后保持 mesh 可见，让 Death 动画播完并把尸体定格在地上
    this.playerMesh.visible = true;

    if (this.playerHitFlashTimer > 0) {
      this.playerHitFlashTimer = Math.max(0, this.playerHitFlashTimer - this.frameDt);
      if (this.playerHitFlashTimer <= 0) this.setPlayerHitFlashTint(undefined);
    }

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
    }

    if (p.alive) {
      // 受击 / 拾取动画锁定期：保持当前一次性动画播放，不切换到其他动画
      // 但是一旦玩家明显开始移动，立刻打断（手感优先于反馈）
      const movingHard = p.currentSpeed > 0.3 || p.isJumping || !p.isGrounded || p.isSliding;
      const oneShotLocked = this.hitReactTimer > 0 || this.pickupAnimTimer > 0;
      if (oneShotLocked && !movingHard) {
        if (this.hitReactTimer > 0) this.hitReactTimer -= this.frameDt;
        if (this.pickupAnimTimer > 0) this.pickupAnimTimer -= this.frameDt;
      } else {
        if (this.hitReactTimer > 0) this.hitReactTimer = 0;
        if (this.pickupAnimTimer > 0) this.pickupAnimTimer = 0;

        // === Choose skeletal animation based on state ===
        if (p.isSliding) {
          this.resetIdleFlavorCooldown();
          this.playPlayerAnim('Run_Holding', 1.5); // Crouched run = slide visual, sped up
        } else if (p.isJumping || !p.isGrounded) {
          this.resetIdleFlavorCooldown();
          // Only trigger Jump animation once on takeoff — let it play through fully
          if (this.wasGrounded) {
            // Just left the ground: trigger Jump animation
            // timeScale 1.3 = animation(0.87s) matches physics airtime(0.67s)
            this.playPlayerAnim('Jump', 1.3);
          }
          // While in air: don't re-trigger, let animation play
        } else if (p.currentSpeed > 3.0) {
          this.resetIdleFlavorCooldown();
          // Run — scale animation speed with movement speed
          const runScale = Math.min(p.currentSpeed / 4.0, 1.4);
          this.playPlayerAnim('Run', runScale);
        } else if (p.currentSpeed > 0.3) {
          this.resetIdleFlavorCooldown();
          // Walk — scale animation speed with movement speed
          const walkScale = Math.min(p.currentSpeed / 2.0, 1.3);
          this.playPlayerAnim('Walk', walkScale);
        } else {
          // 静止 — 在 Idle 间隙随机穿插 Hello / Dance
          this.updateIdleFlavor();
        }
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

    // === Directional light follows player (tracks shadow camera frustum) ===
    if (this.dirLight) {
      this.dirLight.position.set(p.x + 15, p.y + 25, p.z + 15);
      this.dirLight.target.position.set(p.x, p.y, p.z);
    }

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

    ringMat.color.setHex(0x00ff88);

    // === Floating weapon display (physical weapons hover near player) ===
    this.renderWeaponFloaters(state);
  }

  // Build a base 3D model for the given physical weapon type to float near
  // the player. Always returns base (unevolved) model — upgrades are reflected
  // through stats/effects, not floater geometry.
  private buildFloaterModel(weaponType: string): THREE.Object3D | null {
    switch (weaponType) {
      case 'sword':    return swordModel ? swordModel.clone(true) : null;
      case 'axe':      return axeModel ? axeModel.clone(true) : null;
      case 'pistol':   return pistolModel ? pistolModel.clone(true) : null; // Pistol model
      case 'shotgun':  return shotgunModel ? shotgunModel.clone(true) : (dartGoldenModel ? dartGoldenModel.clone(true) : null);
      case 'bone_bouncer': {
        if (!boneGeometry) return null;
        const mat = new THREE.MeshToonMaterial({ color: 0xf5f5dc, gradientMap: toonGradientMap });
        return new THREE.Mesh(boneGeometry.clone(), mat);
      }
      case 'lightning_staff': return lightningStaffModel ? lightningStaffModel.clone(true) : null;
      case 'flame_ring':      return flameRingModel ? flameRingModel.clone(true) : null;
      case 'poison_bomb':     return poisonBombModel ? poisonBombModel.clone(true) : null;
      case 'void_ripple':     return voidRippleModel ? voidRippleModel.clone(true) : null;
      case 'ray_gun':         return rayGunModel ? rayGunModel.clone(true) : null;
      case 'paralysis_gun':   return paralysisGunModel ? paralysisGunModel.clone(true) : null;
      case 'scorch_boots':    return scorchBootsModel ? scorchBootsModel.clone(true) : null;
      default: return null;
    }
  }

  // Renders physical weapons (sword/axe/bone/pistol/shotgun) as visual
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

    const orbitRadius = 1.134; // 距玩家中心：1.4 → 1.26 → 再收近 10%
    const orbitSpeed = 0.6; // rad/sec
    const slotCount = equipped.length;

    for (let i = 0; i < slotCount; i++) {
      const type = equipped[i];
      let obj = this.weaponFloaters.get(type);
      if (!obj) {
        const built = this.buildFloaterModel(type);
        if (!built) continue;
        obj = built;
        obj.scale.multiplyScalar(0.72); // 整体缩小（在各自 targetSize 基础上，0.8 再 ×0.9）
        obj.name = `Floater_${type}`;
        this.scene.add(obj);
        this.weaponFloaters.set(type, obj);
      }

      // Distribute around player
      const slotAngle = (i / slotCount) * Math.PI * 2;
      const angle = time * orbitSpeed + slotAngle;
      const orbX = player.x + Math.cos(angle) * orbitRadius;
      const orbZ = player.z + Math.sin(angle) * orbitRadius;
      const bobY = player.y + 1.215 + Math.sin(time * 2.0 + i * 1.3) * 0.18; // 高度：1.5 → 1.35 → 再降 10%
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
        case 'pistol':
        case 'shotgun':
          // Dart points along orbit tangent (forward direction of travel)
          obj.rotation.set(Math.sin(time * 2 + i) * 0.15, angle + Math.PI / 2, 0);
          break;
        case 'bone_bouncer':
          // Tumbling bone
          obj.rotation.set(time * 1.6 + i, time * 2.2 + i * 0.7, time * 1.0);
          break;
        case 'lightning_staff':
          // Staff upright, slow yaw spin
          obj.rotation.set(0, time * 1.2, 0);
          break;
        case 'flame_ring':
          // Ring stands upright facing outward, spins around its own axis
          obj.rotation.set(Math.PI / 2, angle + Math.PI / 2, time * 2.0);
          break;
        case 'poison_bomb':
          // Potion bobs upright with a gentle wobble
          obj.rotation.set(Math.sin(time * 2 + i) * 0.2, time * 1.0, 0);
          break;
        case 'void_ripple':
          // Closed book, slow tumbling
          obj.rotation.set(0, time * 1.3, Math.sin(time * 1.5 + i) * 0.25);
          break;
        case 'ray_gun':
        case 'paralysis_gun':
          // Gun points along orbit tangent (muzzle forward), slight bob
          obj.rotation.set(Math.sin(time * 2 + i) * 0.12, angle + Math.PI / 2, 0);
          break;
        case 'scorch_boots':
          // Boots upright, slow yaw spin with a gentle wobble
          obj.rotation.set(Math.sin(time * 1.5 + i) * 0.15, time * 1.1, 0);
          break;
      }
      obj.visible = true;
    }
  }

  // === Magic weapon VFX ===

  // Sword slash filled sector: 与 sweepArc 命中区精确对应的实心扇形底光。
  //   - 圆心 = 玩家 (x,z)；外缘 = range（击杀边界）；内缘 ≈ 0（贴近玩家）
  //   - 扇形角 = Math.PI*0.6 (108°)，对称居中在该刀方向 angle 上
  //   - 横躺地面，叠在 slash.png 月牙之下（更暗、更柔，表达"扫过的面积"）
  private spawnSlashSector(x: number, y: number, z: number, angle: number, range: number): void {
    const thetaLength = Math.PI * 0.944; // 170°，与 sweepArc arcAngle 一致
    // 高分段：thetaSegs 让弧线圆滑、phiSegs 让径向 alpha 渐变平滑。
    const thetaSegs = 48;
    const phiSegs = 8;
    // 内缘留极小值避免退化三角面在玩家脚下糊成一点
    const geo = new THREE.RingGeometry(0.2, range, thetaSegs, phiSegs, -thetaLength / 2, thetaLength);

    // 逐顶点 alpha 羽化：消除扇形的硬边界。
    //   - 角度方向：两条直边 18% 处淡出到 0（凹口两侧不再是硬切线）
    //   - 径向方向：外缘 30% 处淡出到 0（外圈融入地面，不再是硬弧线）
    // RingGeometry 顶点顺序：外层 j(内→外) × 内层 i(沿角度)，索引 = j*(thetaSegs+1)+i。
    const ANG_FEATHER = 0.18; // 角度边羽化带宽（占整段比例）
    const OUT_FEATHER = 0.30; // 外缘羽化带宽（占径向比例）
    const colors = new Float32Array(geo.attributes.position.count * 4);
    let vi = 0;
    for (let j = 0; j <= phiSegs; j++) {
      const v = j / phiSegs;                                   // 0 内缘 → 1 外缘
      const fr = Math.min(1, (1 - v) / OUT_FEATHER);           // 外缘淡出
      for (let i = 0; i <= thetaSegs; i++) {
        const u = i / thetaSegs;                               // 0..1 跨角度
        const fa = Math.min(1, Math.min(u, 1 - u) / ANG_FEATHER); // 两侧淡出
        const a = Math.max(0, fr) * Math.max(0, fa);
        colors[vi * 4 + 0] = 1;
        colors[vi * 4 + 1] = 1;
        colors[vi * 4 + 2] = 1;
        colors[vi * 4 + 3] = a;
        vi++;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    geo.rotateX(-Math.PI / 2); // 躺平到地面（法线朝 +Y）

    // RingGeometry 的 UV 是径向映射（贴图中心↔几何圆心，向外铺到外缘），
    // 所以放射状贴图能贴成"从玩家朝外发散"的扇形切片。想换风格改这一行即可：
    //   'scorch'(放射条纹) / 'magic_circle'(法术) / 也可用 particle_* 系列。
    const SLASH_SECTOR_TEXTURE: VfxTextureKey = 'slash_fill';
    const mat = new THREE.MeshBasicMaterial({
      color: 0x3aa0ff, // 偏蓝
      map: this.vfxTextures[SLASH_SECTOR_TEXTURE] ?? null,
      vertexColors: true, // 顶点 alpha 羽化边界（附加混合用 SrcAlpha，alpha 调制贡献）
      transparent: true,
      opacity: 1.0, // 最亮（附加混合，opacity 直接放大亮度）
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    // 扇形中心射线（local +X）对齐该刀的 swing 方向：rotation.y = angle - π/2
    mesh.rotation.y = angle - Math.PI / 2;
    mesh.renderOrder = 2; // 低于 slash.png 月牙
    this.scene.add(mesh);
    this.slashSectors.push({ mesh, life: 0.18, maxLife: 0.18, baseOpacity: 1.0 });
  }

  // Lightning bolt: textured billboard quad (lightning.png) with double-layer glow, impact light, ground ring
  private spawnLightningBolt(x: number, y: number, z: number): void {
    const height = 8;
    const maxLife = 0.25;       // 适中寿命，不长不短

    // 竖直贴图面片：lightning.png 为白色闪电 + 透明底，加色混合自然发光。
    // 两层叠加：glow=宽蓝外晕、core=窄白亮芯 → "白热芯 + 蓝边"的电弧观感。
    // 面片仅绕 Y 轴朝相机（在 updateTransientEffects 里每帧更新），始终保持竖直。
    const tex = this.vfxTextures.lightning ?? null;
    const makeBolt = (width: number, color: number, opacity: number, name: string): THREE.Mesh => {
      const geo = new THREE.PlaneGeometry(width, height);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y + height / 2, z);
      mesh.name = name;
      // 随机水平镜像，让每道电弧形态不同
      if (Math.random() < 0.5) mesh.scale.x = -1;
      return mesh;
    };

    const glow = makeBolt(3.4, 0x66bbff, 1.0, 'LightningGlow');
    const core = makeBolt(1.7, 0xffffff, 1.0, 'LightningCore');

    // 闪光由常驻共享灯负责（不再每道新建 PointLight）：定位 + 点亮，强度在 update 里衰减。
    this.lightningFlashLight.position.set(x, y + 0.5, z);
    this.lightningFlashLight.intensity = 6;

    // ---- Ground impact ring: expands outward and fades ----
    const ringGeo = new THREE.RingGeometry(0.3, 0.5, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xaaddff,
      transparent: true,
      opacity: 1.0,
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

  // Persistent flame ring disk — created lazily, follows player while equipped
  // 柔光贴图淡出到不可见的归一化半径（相对贴图半宽）。
  // 用它把光晕外缘对齐到实际 aoeRadius：plane 边长 = 2 * radius / 此值。
  private static readonly FLAME_AURA_TIP_NORM = 0.85;

  private ensureFlameRingDisk(): THREE.Group {
    if (this.flameRingDisk) return this.flameRingDisk;
    const group = new THREE.Group();
    group.name = 'FlameRingDisk';
    // 平铺在地面上：组整体绕 X 转 -90°，子 plane 绕 Z 自转。
    group.rotation.x = -Math.PI / 2;

    // 单位尺寸 plane（每帧按 aoeRadius 缩放）；贴图为灰度柔光晕，可染色。
    // 仅作"范围边界"用——半透明叠加发光，不做不透明的实心填充。
    const planeGeo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      map: this.vfxTextures.flame_aura ?? null,
      color: 0xff6a22,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(planeGeo, mat);
    group.add(mesh);

    this.flameRingLayers = [mesh];
    this.scene.add(group);
    this.flameRingDisk = group;
    return group;
  }

  // Drive transient meshes (slash arcs, lightning bolts): fade and dispose
  private updateTransientEffects(dt: number): void {
    // Slash sectors: 固定尺寸（保持与 range 对齐，不放大），仅渐隐后回收。
    for (let i = this.slashSectors.length - 1; i >= 0; i--) {
      const e = this.slashSectors[i];
      e.life -= dt;
      if (e.life <= 0) {
        this.scene.remove(e.mesh);
        e.mesh.geometry.dispose();
        (e.mesh.material as THREE.Material).dispose();
        this.slashSectors.splice(i, 1);
        continue;
      }
      const t = e.life / e.maxLife; // 1 → 0
      (e.mesh.material as THREE.MeshBasicMaterial).opacity = e.baseOpacity * t;
    }

    // Lightning bolts: 贴图面片镜像翻转 + 抖动模拟电弧跳动，面片绕 Y 朝相机。闪光交给常驻共享灯。
    let flashIntensity = 0; // 本帧所有闪电对共享灯的最强贡献
    let flashX = 0, flashY = 0, flashZ = 0;
    const lightningCamPos = new THREE.Vector3();
    this.camera.getWorldPosition(lightningCamPos);
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

      // 1. 面片绕 Y 朝相机（保持竖直，仅水平转向）
      const yaw = Math.atan2(lightningCamPos.x - e.endX, lightningCamPos.z - e.endZ);
      e.core.rotation.y = yaw;
      e.glow.rotation.y = yaw;

      // 2. Flicker: 周期性水平镜像，让电弧形态跳变（贴图廉价，无需重建几何）
      if (e.flickerTimer <= 0) {
        e.flickerTimer = 0.04 + Math.random() * 0.03;
        const flip = Math.random() < 0.5 ? -1 : 1;
        e.core.scale.x = Math.abs(e.core.scale.x) * flip;
        e.glow.scale.x = Math.abs(e.glow.scale.x) * flip;
      }

      // 3. Opacity：在衰减之上叠一层随机闪烁，营造电流频闪
      const flick = 0.6 + Math.random() * 0.4;
      (e.core.material as THREE.MeshBasicMaterial).opacity = fade * flick;
      (e.glow.material as THREE.MeshBasicMaterial).opacity = fade * flick;

      // 4. 收集对共享闪光灯的贡献（取最亮的一道定位）
      const lit = 6 * fade;
      if (lit > flashIntensity) { flashIntensity = lit; flashX = e.endX; flashY = e.endY + 0.5; flashZ = e.endZ; }

      // 5. Ground ring: expand and fade
      const ringScale = 0.3 + inv * 5;
      e.ring.scale.set(ringScale, ringScale, 1);
      (e.ring.material as THREE.MeshBasicMaterial).opacity = fade;
    }
    // 驱动常驻共享灯：有闪电就跟最亮那道，否则归零（光源数始终不变，无重编译）。
    this.lightningFlashLight.intensity = flashIntensity;
    if (flashIntensity > 0) this.lightningFlashLight.position.set(flashX, flashY, flashZ);
  }

  private spawnDeathBurst(x: number, y: number, z: number): void {
    this.emitDeathBurst(x, y, z, 'generic');
  }

  private spawnLevelUpBurst(x: number, y: number, z: number): void {
    // 粒子爆发 + 头顶星光 + 上升光柱：整套仪式特效已由 emitLevelUpBurst →
    // emitCompensationBurst('gold') 提供。早先这里又额外 spawn 了一遍 star+light billboard，
    // 导致每次升级星光/光柱被双绘（参数略不同的叠加），已移除该重复。
    this.emitLevelUpBurst(x, y, z);
  }

  private triggerScreenFlash(color: string, duration: number): void {
    // 使用 GSAP 屏幕闪光动画
    gsapAnimations.screenFlash(color, duration);
  }

  private cloneHitFlashMaterial(mat: THREE.Material): THREE.Material {
    const cloned = mat.clone();
    cloned.userData[OWNED_CLONE_KEY] = true;

    // material.clone() copies userData, but not every custom shader callback reliably.
    // Re-apply the stylized toon patch to cloned enemy materials so per-enemy tinting
    // does not mutate shared source materials.
    if (cloned instanceof THREE.MeshToonMaterial) {
      delete cloned.userData['__stylized'];
      applyStylizedToonShading(cloned, cloned.name.startsWith('Weapon') ? 0.35 : 0, true);
      cloned.needsUpdate = true;
    }

    const tintable = cloned as HitFlashMaterial;
    if (tintable.color) {
      cloned.userData[HIT_FLASH_BASE_COLOR_KEY] = tintable.color.clone();
    }
    if (tintable.emissive) {
      cloned.userData[HIT_FLASH_BASE_EMISSIVE_KEY] = tintable.emissive.clone();
    }
    return cloned;
  }

  private prepareHitFlashMaterials(root: THREE.Object3D): void {
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((mat) => this.cloneHitFlashMaterial(mat));
      } else {
        mesh.material = this.cloneHitFlashMaterial(mesh.material);
      }
    });
  }

  private cacheHitFlashMaterialBases(root: THREE.Object3D): void {
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of materials) {
        const tintable = mat as HitFlashMaterial;
        if (tintable.color && !mat.userData[HIT_FLASH_BASE_COLOR_KEY]) {
          mat.userData[HIT_FLASH_BASE_COLOR_KEY] = tintable.color.clone();
        }
        if (tintable.emissive && !mat.userData[HIT_FLASH_BASE_EMISSIVE_KEY]) {
          mat.userData[HIT_FLASH_BASE_EMISSIVE_KEY] = tintable.emissive.clone();
        }
      }
    });
  }

  private applyObjectHitFlashTint(root: THREE.Object3D, weaponType?: string, hitFlashColor?: number): void {
    const vfxColor = hitFlashColor !== undefined
      ? this._hitFlashColor.setHex(hitFlashColor)
      : weaponType
        ? GameScene.WEAPON_VFX_COLORS[weaponType]
        : undefined;
    if (Array.isArray(vfxColor)) this._hitFlashColor.setRGB(vfxColor[0], vfxColor[1], vfxColor[2]);

    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of materials) {
        const tintable = mat as HitFlashMaterial;
        const baseColor = mat.userData[HIT_FLASH_BASE_COLOR_KEY] as THREE.Color | undefined;
        if (tintable.color && baseColor) {
          if (vfxColor) {
            tintable.color.copy(baseColor).lerp(this._hitFlashColor, HIT_FLASH_TINT_INTENSITY);
          } else {
            tintable.color.copy(baseColor);
          }
        }

        const baseEmissive = mat.userData[HIT_FLASH_BASE_EMISSIVE_KEY] as THREE.Color | undefined;
        if (tintable.emissive && baseEmissive) {
          if (vfxColor) {
            tintable.emissive.copy(this._hitFlashColor).multiplyScalar(HIT_FLASH_EMISSIVE_STRENGTH);
          } else {
            tintable.emissive.copy(baseEmissive);
          }
        }
      }
    });
  }

  private setEnemyHitFlashTint(enemyId: number, obj: THREE.Object3D, weaponType?: string, hitFlashColor?: number): void {
    const next = hitFlashColor !== undefined ? `color:${hitFlashColor}` : (weaponType ?? null);
    if ((this.enemyHitFlashTints.get(enemyId) ?? null) === next) return;
    this.enemyHitFlashTints.set(enemyId, next);
    this.applyObjectHitFlashTint(obj, weaponType, hitFlashColor);
  }

  private setBossHitFlashTint(obj: THREE.Object3D, weaponType?: string, hitFlashColor?: number): void {
    const next = hitFlashColor !== undefined ? `color:${hitFlashColor}` : (weaponType ?? null);
    if (this.bossHitFlashTint === next) return;
    this.bossHitFlashTint = next;
    this.applyObjectHitFlashTint(obj, weaponType, hitFlashColor);
  }

  private triggerPlayerHitFlash(color: number): void {
    this.playerHitFlashTimer = PLAYER_HIT_FLASH_DURATION;
    this.setPlayerHitFlashTint(color);
  }

  private setPlayerHitFlashTint(color?: number): void {
    const next = color ?? null;
    if (this.playerHitFlashTint === next) return;
    this.playerHitFlashTint = next;
    this.applyObjectHitFlashTint(this.playerMesh, undefined, color);
  }

  private findDeathHitFlashTint(obj: THREE.Object3D, damageEvents: readonly DamageEvent[]): { weaponType?: string; hitFlashColor?: number } {
    let bestTint: { weaponType?: string; hitFlashColor?: number } = {};
    let bestDistSq = 2.25; // tolerate a little knockback / render-tick drift

    for (let i = damageEvents.length - 1; i >= 0; i--) {
      const evt = damageEvents[i];
      if (evt.isPlayerDamage || (!evt.weaponType && evt.hitFlashColor === undefined)) continue;
      const dx = evt.x - obj.position.x;
      const dz = evt.z - obj.position.z;
      const distSq = dx * dx + dz * dz;
      if (distSq <= bestDistSq) {
        bestDistSq = distSq;
        bestTint = { weaponType: evt.weaponType, hitFlashColor: evt.hitFlashColor };
      }
    }

    return bestTint;
  }

  private renderEnemies(enemies: EnemyState[], damageEvents: readonly DamageEvent[]): void {
    // 动画 LOD：每帧重建一次视锥（点剔除）+ 缓存相机位置，循环内据此对 mixer 降频。
    this.cullMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.cullFrustum.setFromProjectionMatrix(this.cullMatrix);
    const camX = this.camera.position.x;
    const camY = this.camera.position.y;
    const camZ = this.camera.position.z;

    // 每帧重置远距剔除计数（用于 perf overlay 显示「活着但 >35m 不渲染」的怪数）
    this.perfEnemyCulledFar = 0;

    // 玩家坐标（敌人朝向用）只需每帧读一次，避免在循环内对每个敌人重复 getRenderState。
    const playerPos = this.session.getRenderState().player;

    // Track which enemy IDs are alive this frame
    const aliveIds = new Set<number>();
    for (const enemy of enemies) {
      aliveIds.add(enemy.id);
    }

    // Move newly dead enemies to dying animation state instead of immediately removing
    for (const [id, obj] of this.enemyObjects) {
      if (!aliveIds.has(id) && !this.dyingEnemies.has(id)) {
        // Start death animation
        const deathTint = this.findDeathHitFlashTint(obj, damageEvents);
        this.setEnemyHitFlashTint(id, obj, deathTint.weaponType, deathTint.hitFlashColor);
        this.enemyHitFlashTints.delete(id);
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
        this.enemyAnimAccum.delete(id);
        this.enemyPrevPos.delete(id);
        this.applyObjectHitFlashTint(dying.obj, undefined);
        this.enemyHitFlashTints.delete(id);
        // Return to pool（带容量上限，超限直接释放避免无限累积）
        const pool = this.enemyPool.get(dying.type) ?? [];
        if (pool.length < ENEMY_POOL_CAP_PER_TYPE) {
          pool.push(dying.obj);
          this.enemyPool.set(dying.type, pool);
        } else {
          this.scene.remove(dying.obj);
          disposeOwnedResources(dying.obj);
        }
        this.dyingEnemies.delete(id);
      }
    }

    // Map enemy types to model keys（见 ENEMY_MODEL_MAP）
    const enemyModelMap = getEnemyModelMap();

    // 目标世界高度（米）—— 模型按实际高度归一化后缩放到此值。整体比玩家(1.8)矮一截以凸显角色（约 ×0.8）。
    // 注意：所有敌人共享 core 的 ENEMY_RADIUS=0.4 水平碰撞半径，视觉体型 ≫ 该半径时多只
    // 同类（特别是 charge 行为）会在玩家脚下视觉重叠。各值已按此约束权衡。
    const enemyScales: Record<string, number> = {
      skeleton_soldier: 1.2,   // KayKit 小兵 — 略矮于玩家
      zombie: 1.1,             // 高 HP 僵尸
      skeleton_archer: 1.2,    // KayKit 法师 — 落地人形
      skeleton_knight: 1.6,    // KayKit 战士 — 精英 (再叠 isElite ×1.2 ≈ 1.92m)：明显大于小兵/法师，
                               // 又不至于像之前 2.6 那样把 0.4m 碰撞半径远远撑爆、多只冲锋时严重穿模
      necromancer: 0.7,        // 法师 — 飘浮幽灵（小巧）
      gargoyle: 0.7,           // 蝙蝠 — 小型飞行
    };

    // Update or create objects for each alive enemy
    for (const enemy of enemies) {
      let obj = this.enemyObjects.get(enemy.id);

      if (!obj) {
        // Try get from pool or create new
        const pool = this.enemyPool.get(enemy.type);
        if (pool && pool.length > 0) {
          obj = pool.pop()!;
          this.applyObjectHitFlashTint(obj, undefined);
          // 池复用：mixer/actions 已挂在 obj.userData 上，setup helper 直接复用
          this.setupEnemyAnimationsFor(obj, enemy.id, enemy.type);
        } else {
          // Clone from loaded model
          const modelKey = enemyModelMap[enemy.type];
          const model = modelKey ? loadedModels[modelKey] : null;
          if (model) {
            obj = cloneSkeleton(model) as THREE.Object3D;
            // KayKit 角色：把手持武器挂到 handslot 骨（其它皮肤无此骨，自动跳过）
            this.attachEnemyWeapons(obj, enemy.type);
            this.prepareHitFlashMaterials(obj);
            // 首次创建：在 obj.userData 上建立 mixer/actions 缓存，未来池复用直接重用
            this.setupEnemyAnimationsFor(obj, enemy.id, enemy.type);
          } else {
            // Fallback: colored box
            const geo = new THREE.BoxGeometry(0.9, 1.2, 0.9);
            const mat = new THREE.MeshToonMaterial({ color: ENEMY_COLORS[enemy.type] ?? 0x888888, gradientMap: toonGradientMap });
            obj = new THREE.Mesh(geo, mat);
            this.prepareHitFlashMaterials(obj);
          }
          obj.name = `Enemy_${enemy.type}_${enemy.id}`;
          obj.userData['enemyType'] = enemy.type;
          this.scene.add(obj);
        }
        this.enemyObjects.set(enemy.id, obj);
      }

      // Update transform — 按模型实际包围盒高度归一化到目标高度（与玩家 setupPlayer 同款思路），
      // 让来源尺寸各异的模型（Quaternius / zombie / ghost）大小统一、可控。
      const tfModelKey = enemyModelMap[enemy.type];
      let normFactor = tfModelKey ? this.enemyModelNormHeight.get(tfModelKey) : undefined;
      if (normFactor === undefined) {
        const srcModel = tfModelKey ? loadedModels[tfModelKey] : null;
        if (srcModel) {
          const h = new THREE.Box3().setFromObject(srcModel).getSize(new THREE.Vector3()).y;
          normFactor = 1 / Math.max(h, 0.01);
          if (tfModelKey) this.enemyModelNormHeight.set(tfModelKey, normFactor);
        } else {
          normFactor = 1 / 1.2; // fallback box 高 1.2
        }
      }
      const targetHeight = enemyScales[enemy.type] ?? 1.6; // enemyScales 现在的语义 = 目标世界高度（米）
      const sizeMultiplier = enemy.isMiniBoss ? 1.5 : (enemy.isElite ? 1.2 : 1.0);
      const s = normFactor * targetHeight * sizeMultiplier;
      // 视觉离地高度（米）：仅渲染偏移，不动 core 逻辑（碰撞 / preferredRange 都按水平 x/z）。
      // necromancer(ghost) / skeleton_archer(dragon) 用飞行/飘浮模型，抬离地面更自然。
      const hoverOffset = ENEMY_HOVER_OFFSET[enemy.type] ?? 0;
      obj.position.set(enemy.x, enemy.y + hoverOffset, enemy.z);
      obj.scale.set(s, s, s);

      // ── 视距剔除：超过 ENEMY_VISIBLE_CULL_DIST 直接 visible=false，跳过本帧所有
      //    渲染相关工作（包括 Three.js 内部的 skeleton.update + boneTexture 上传）。
      //    动画 dt 不累积 —— 重新进入可见区时从冻结姿势继续，过渡可接受。
      const cullDx = enemy.x - camX;
      const cullDy = (enemy.y + 1) - camY;
      const cullDz = enemy.z - camZ;
      const cullDistSq = cullDx * cullDx + cullDy * cullDy + cullDz * cullDz;
      if (cullDistSq > ENEMY_VISIBLE_CULL_SQ) {
        if (obj.visible) obj.visible = false;
        this.perfEnemyCulledFar++;
        continue;
      }
      obj.visible = true;

      // Blob 阴影贴脚下（飞行的 gargoyle 不贴 —— 它在空中，脚位非地面）
      // 半径按目标高度估算（s 已不再代表体型倍数）
      if (enemy.type !== 'gargoyle') {
        this.blobShadows?.place(enemy.x, enemy.y, enemy.z, targetHeight * sizeMultiplier * 0.3);
      }

      // Face toward player (or movement direction)
      const dx = playerPos.x - enemy.x;
      const dz = playerPos.z - enemy.z;
      if (dx !== 0 || dz !== 0) {
        obj.rotation.y = Math.atan2(dx, dz);
      }

      // 判断"是否在动"：不能用 enemy.speed（速度**属性**恒>0，会让站定放风筝的远程怪
      // necromancer / skeleton_archer 永远播移动动画），也不能用单帧瞬时位移（core 60Hz 与
      // 渲染刷新率不同步，很多帧位置没变会误判停下而闪 Idle）。改用滞后判定：只要最近 200ms
      // 内有过位移就算移动，真正停超过 200ms 才切 Idle。
      let prevPos = this.enemyPrevPos.get(enemy.id);
      if (!prevPos) {
        prevPos = { x: enemy.x, z: enemy.z, stillTime: 999 };
        this.enemyPrevPos.set(enemy.id, prevPos);
      } else {
        const movedDist = Math.hypot(enemy.x - prevPos.x, enemy.z - prevPos.z);
        prevPos.stillTime = movedDist > 1e-4 ? 0 : prevPos.stillTime + this.frameDt;
        prevPos.x = enemy.x;
        prevPos.z = enemy.z;
      }
      const isMoving = prevPos.stillTime < 0.2;
      const hitFlashWeaponType = enemy.hitFlashTimer > 0 ? enemy.hitFlashWeaponType : undefined;
      const hitFlashColor = enemy.hitFlashTimer > 0 ? enemy.hitFlashColor : undefined;
      this.setEnemyHitFlashTint(enemy.id, obj, hitFlashWeaponType, hitFlashColor);

      // Choose enemy animation based on state
      if (enemy.hitFlashTimer > 0) {
        this.playEnemyAnim(enemy.id, 'HitReact');
        obj.visible = hitFlashWeaponType || hitFlashColor !== undefined ? true : Math.sin(performance.now() * 0.03) > 0;
      } else if (enemy.chargeState === 'charging') {
        this.playEnemyAnim(enemy.id, 'Run_Attack');
        obj.visible = true;
      } else if (enemy.chargeState === 'windup') {
        this.playEnemyAnim(enemy.id, 'Idle');
      } else if (enemy.type === 'necromancer' && enemy.summonCooldown > 7.0) {
        // 刚召唤完小兵（summonCooldown 每 8s 重置为 8）→ 召唤施法姿态（窗口 1s 便于看清）
        this.playEnemyAnim(enemy.id, 'Summon');
      } else if (enemy.attackCooldown > enemy.attackCooldownMax * 0.8) {
        // Just attacked (cooldown just reset) — necromancer 走施法动作，近战怪用 Punch
        this.playEnemyAnim(enemy.id, enemy.type === 'necromancer' ? 'Cast' : 'Punch');
      } else if (isMoving) {
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

      // Update enemy mixer — 动画 LOD：按到相机距离 + 视锥分档降频。
      // 蒙皮骨骼矩阵重算是同屏大量怪的主 CPU 开销；近处满帧，中/远隔帧，视锥外冻结。
      const mixer = this.enemyMixers.get(enemy.id);
      if (mixer) {
        // 视锥点剔除（取胸高一点，减少脚点在画面下沿时的误剔除 / 边缘 pop）。
        this.cullPoint.set(enemy.x, enemy.y + 1, enemy.z);
        if (this.cullFrustum.containsPoint(this.cullPoint)) {
          const ddx = enemy.x - camX;
          const ddy = (enemy.y + 1) - camY;
          const ddz = enemy.z - camZ;
          const distSq = ddx * ddx + ddy * ddy + ddz * ddz;
          const stride = distSq < ENEMY_ANIM_LOD_NEAR_SQ
            ? 1
            : distSq < ENEMY_ANIM_LOD_FAR_SQ
              ? ENEMY_ANIM_LOD_MID_STRIDE
              : ENEMY_ANIM_LOD_FAR_STRIDE;
          const accum = (this.enemyAnimAccum.get(enemy.id) ?? 0) + this.frameDt;
          // 错峰：同 stride 的敌人按 id 散到不同帧更新，避免同一帧集中开销。
          if (stride === 1 || (this.frameIndex + enemy.id) % stride === 0) {
            mixer.update(accum);
            this.enemyAnimAccum.set(enemy.id, 0);
          } else {
            this.enemyAnimAccum.set(enemy.id, accum);
          }
        }
        // 视锥外：不更新（冻结姿势），也不累积——重入视锥后从冻结帧继续，可接受。
      }
    }

    this.updateParalysisTriangleSprites(enemies);
    this.updateBondEnemyMarkers(enemies);
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
    let enemyCount = 0;
    const time = performance.now() * 0.005;
    const activeAxeIds = new Set<number>();
    const activeWeaponIds = new Set<number>();
    const activeBossProjIds = new Set<number>();
    // 敌人弹幕火焰 billboard 需要相机世界坐标做朝向计算
    this.camera.getWorldPosition(this._camWorldPos);

    // Helper: get the model for a weapon type
    const getWeaponModel = (weaponType: string): THREE.Group | null => {
      switch (weaponType) {
        case 'axe': return axeModel;
        case 'sword': return swordModel;
        case 'katana': return katanaModel;
        case 'pistol': return bulletModel; // pistol 子弹模型（items/bullet.glb）
        case 'paralysis_gun': return bulletModel; // 麻痹弹复用 items/bullet.glb
        case 'bone_bouncer': return null; // handled with boneGeometry fallback below
        case 'shotgun': return dartGoldenModel; // golden dart pellets
        case 'hammer': return hammerModel;
        case 'dagger': return daggerModel;
        case 'dart': return dartModel;
        default: return null;
      }
    };

    // Weapon types that use individual model clones (not InstancedMesh)
    // 'pistol' included — its bullets render with the bullet.glb model.
    const modelWeaponTypes = new Set(['axe', 'sword', 'katana', 'hammer', 'dagger', 'dart', 'bone_bouncer', 'shotgun', 'pistol', 'paralysis_gun']);

    for (const proj of projectiles) {
      // Axe projectiles: orbiting, blade faces outward
      if (proj.weaponType === 'axe') {
        activeAxeIds.add(proj.id);
        let axeObj = this.axeObjects.get(proj.id);
        if (!axeObj) {
          // 优先复用池中已有实例（池为空才走克隆，避免每发都 model.clone()）
          axeObj = this.axePool.pop();
          if (!axeObj) {
            const model = getWeaponModel('axe');
            if (model) {
              axeObj = model.clone();
            } else {
              const geo = new THREE.ConeGeometry(0.3, 0.6, 4);
              const mat = new THREE.MeshToonMaterial({ color: 0x666688, gradientMap: toonGradientMap });
              axeObj = new THREE.Mesh(geo, mat);
            }
            axeObj.name = `Axe_${proj.id}`;
            this.scene.add(axeObj);
          }
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
          const hammerPool = this.weaponPool.get('hammer');
          obj = hammerPool ? hammerPool.pop() : undefined;
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
            obj.userData['weaponType'] = 'hammer';
            this.scene.add(obj);
          }
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

      // Sword/Katana/Dagger/Dart/Pistol(bullet): directional, tip faces movement direction
      if (modelWeaponTypes.has(proj.weaponType as string) && proj.fromPlayer && (proj.weaponType as string) !== 'axe' && (proj.weaponType as string) !== 'hammer') {
        activeWeaponIds.add(proj.id);
        let obj = this.weaponObjects.get(proj.id);
        if (!obj) {
          const wt = proj.weaponType as string;
          const wpPool = this.weaponPool.get(wt);
          obj = wpPool ? wpPool.pop() : undefined;
          if (!obj) {
            const model = getWeaponModel(proj.weaponType);
            if (model) {
              obj = model.clone();
            } else if (proj.weaponType === 'bone_bouncer' && boneGeometry) {
              const mat = new THREE.MeshToonMaterial({ color: 0xf5f5dc, gradientMap: toonGradientMap });
              obj = new THREE.Mesh(boneGeometry, mat);
            } else {
              const geo = new THREE.ConeGeometry(0.15, 0.5, 6);
              const mat = new THREE.MeshToonMaterial({ color: 0xcccccc, gradientMap: toonGradientMap });
              obj = new THREE.Mesh(geo, mat);
            }
            obj.name = `Weapon_${proj.weaponType}_${proj.id}`;
            obj.userData['weaponType'] = wt;
            this.scene.add(obj);
          }
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

      // Boss（机器人）弹丸：用 items/bullet.glb 模型，朝飞行方向。
      // 通过 core 的 `fromBoss` 标记识别，而非匹配具体 weaponType——
      // 这样 Boss 改用任意 weaponType 发射时仍走模型渲染分支，
      // 不会掉到下面普通敌人的火焰 billboard 分支。
      if (!proj.fromPlayer && proj.fromBoss) {
        activeBossProjIds.add(proj.id);
        let obj = this.bossProjectileObjects.get(proj.id);
        if (!obj) {
          obj = this.bossProjPool.pop();
          if (!obj) {
            if (bulletModel) {
              obj = bulletModel.clone();
            } else {
              const geo = new THREE.SphereGeometry(0.3, 8, 6);
              const mat = new THREE.MeshToonMaterial({ color: 0xff5522, gradientMap: toonGradientMap });
              obj = new THREE.Mesh(geo, mat);
            }
            obj.name = `BossProj_${proj.id}`;
            this.scene.add(obj);
          }
          this.bossProjectileObjects.set(proj.id, obj);
        }
        obj.position.set(proj.x, proj.y, proj.z);
        // 朝飞行方向（含俯冲炮弹的垂直分量）
        const sp = Math.sqrt(proj.vx * proj.vx + proj.vy * proj.vy + proj.vz * proj.vz);
        if (sp > 0.001) {
          obj.rotation.set(0, 0, 0);
          obj.rotation.order = 'YXZ';
          obj.rotation.y = Math.atan2(proj.vx, proj.vz);
          obj.rotation.x = Math.atan2(-proj.vy, Math.sqrt(proj.vx * proj.vx + proj.vz * proj.vz));
        }
        obj.visible = true;
        continue;
      }

      // Enemy projectiles: 朝相机的火焰 billboard，火焰尾沿飞行方向反向拖尾
      if (!proj.fromPlayer) {
        const px = proj.x, py = proj.y, pz = proj.z;
        // 法线：从弹丸指向相机（point-facing billboard）
        this._vfxNormal.set(this._camWorldPos.x - px, this._camWorldPos.y - py, this._camWorldPos.z - pz);
        if (this._vfxNormal.lengthSq() < 1e-6) this._vfxNormal.set(0, 0, 1);
        this._vfxNormal.normalize();

        // 速度方向投影到 billboard 平面上，作为火焰"朝向"；火焰尖端在贴图 +Y，
        // 让尖端朝运动反方向（拖尾），故取负。
        this._vfxUp.set(proj.vx, proj.vy, proj.vz);
        const speedSq = this._vfxUp.lengthSq();
        if (speedSq > 1e-6) {
          this._vfxUp.normalize();
          const dot = this._vfxUp.dot(this._vfxNormal);
          this._vfxUp.addScaledVector(this._vfxNormal, -dot); // 投影到平面
        }
        if (this._vfxUp.lengthSq() < 1e-6) this._vfxUp.set(0, 1, 0); // 速度≈0 或正对相机时兜底竖直
        this._vfxUp.normalize().negate();

        // right = up × normal，再正交化 z 轴
        this._vfxRight.crossVectors(this._vfxUp, this._vfxNormal);
        if (this._vfxRight.lengthSq() < 1e-6) this._vfxRight.set(1, 0, 0);
        this._vfxRight.normalize();
        this._vfxZ.crossVectors(this._vfxRight, this._vfxUp).normalize();

        // 火焰略竖长：宽 0.9、高 1.5（弹丸基准）
        const fScale = 1.5;
        this._vfxScale.set(fScale * 0.85, fScale, fScale);
        this._vfxMatrix.makeBasis(this._vfxRight, this._vfxUp, this._vfxZ);
        this._vfxMatrix.scale(this._vfxScale);
        this._vfxMatrix.setPosition(px, py, pz);
        this.enemyProjectileMesh.setMatrixAt(enemyCount, this._vfxMatrix);

        // 橙红脉动染色（加法混合 → 发光火球）
        const pulse = 0.75 + Math.sin(time * 3 + proj.id) * 0.25;
        this._tempColor.setRGB(1.0, 0.32 + pulse * 0.22, 0.06);
        this.enemyProjectileMesh.setColorAt(enemyCount, this._tempColor);
        enemyCount++;
        continue;
      }

      // All other projectiles: use InstancedMesh (spheres)
      this._dummy.position.set(proj.x, proj.y, proj.z);

      // Projectile visual variety: scale by weapon type
      let scale = proj.fromPlayer ? 1.0 : 1.8;
      if (proj.fromPlayer) {
        switch (proj.weaponType) {
          case 'sword': scale = 1.2; break;
          case 'pistol': scale = 0.6; break;
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

    this.enemyProjectileMesh.count = enemyCount;
    this.enemyProjectileMesh.instanceMatrix.needsUpdate = true;
    if (this.enemyProjectileMesh.instanceColor) this.enemyProjectileMesh.instanceColor.needsUpdate = true;

    // Recycle axe objects no longer active：进对象池（带上限）；超限直接 dispose
    for (const [id, obj] of this.axeObjects) {
      if (!activeAxeIds.has(id)) {
        if (this.axePool.length < PROJECTILE_POOL_CAP) {
          obj.visible = false;
          this.axePool.push(obj);
        } else {
          this.scene.remove(obj);
          disposeOwnedResources(obj);
        }
        this.axeObjects.delete(id);
      }
    }
    // Recycle weapon objects (按 weaponType 分池)
    for (const [id, obj] of this.weaponObjects) {
      if (!activeWeaponIds.has(id)) {
        const wt = (obj.userData['weaponType'] as string | undefined) ?? '__unknown';
        const pool = this.weaponPool.get(wt) ?? [];
        if (pool.length < PROJECTILE_POOL_CAP) {
          obj.visible = false;
          pool.push(obj);
          this.weaponPool.set(wt, pool);
        } else {
          this.scene.remove(obj);
          disposeOwnedResources(obj);
        }
        this.weaponObjects.delete(id);
      }
    }
    // Recycle boss projectile objects
    for (const [id, obj] of this.bossProjectileObjects) {
      if (!activeBossProjIds.has(id)) {
        if (this.bossProjPool.length < PROJECTILE_POOL_CAP) {
          obj.visible = false;
          this.bossProjPool.push(obj);
        } else {
          this.scene.remove(obj);
          disposeOwnedResources(obj);
        }
        this.bossProjectileObjects.delete(id);
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
    const time = performance.now() * 0.004; // Faster spin

    // 每个类型 mesh 独立计数（同 geometry 的 xp 四档也各自一个 mesh）
    const counts: Map<THREE.InstancedMesh, number> = new Map();
    for (const mesh of this.pickupMeshes.values()) counts.set(mesh, 0);

    for (const pickup of pickups) {
      if (pickup.type === 'silver') continue;
      const mesh = this.pickupMeshes.get(pickup.type);
      if (!mesh) continue;
      let count = counts.get(mesh)!;
      if (count >= MAX_PICKUPS) continue;

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
      mesh.setMatrixAt(count, this._dummy.matrix);

      this._tempColor.setHex(PICKUP_COLORS[pickup.type] ?? 0x44ff44);
      mesh.setColorAt(count, this._tempColor);
      counts.set(mesh, count + 1);
    }

    for (const [mesh, count] of counts) {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  private renderSilverPickups(pickups: PickupState[]): void {
    const time = performance.now() * 0.004;
    const active = new Set<number>();

    for (const pickup of pickups) {
      if (pickup.type !== 'silver') continue;
      if (active.size >= MAX_PICKUPS) break;
      active.add(pickup.id);

      let obj = this.silverPickupObjects.get(pickup.id);
      if (!obj) {
        if (!silverCoinModel) continue;
        obj = silverCoinModel.clone();
        obj.name = `SilverPickup_${pickup.id}`;
        this.scene.add(obj);
        this.silverPickupObjects.set(pickup.id, obj);
      }

      const bob = Math.sin(time * 1.5 + pickup.id) * 0.3;
      obj.position.set(pickup.x, pickup.y + 0.2 + bob, pickup.z);

      const scaleVal = pickup.attracted
        ? 0.7 + Math.sin(time * 6 + pickup.id) * 0.3
        : 1.0;
      const baseScale = silverCoinModel?.scale.x ?? obj.scale.x;
      obj.scale.setScalar(baseScale * scaleVal);
      obj.rotation.set(0, time * 2 + pickup.id, 0);
    }

    for (const [id, obj] of this.silverPickupObjects) {
      if (active.has(id)) continue;
      this.scene.remove(obj);
      this.silverPickupObjects.delete(id);
    }
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
        this.setBossHitFlashTint(this.bossMesh, undefined);
        this.bossMesh.visible = false;
      }
      if (!boss) {
        // Boss 离场：重置动画状态，下一个 boss 干净起播
        this.bossAnimState = null;
        this.bossPrevPos = null;
        this.bossHitFlashTint = null;
      }
      return;
    }

    // 第一关用 enemy_2legs_gun（游侠机甲），第二关用 enemy_large_gun（攻城机甲）；关卡切换时重建网格。
    const stage = (this.session.getRenderState().stage ?? 1) as 1 | 2;
    if (this.bossMesh && this.bossMeshStage !== stage) {
      this.setBossHitFlashTint(this.bossMesh, undefined);
      this.scene.remove(this.bossMesh);
      this.bossMesh = null;
      this.bossMeshStage = null;
      this.bossMixer = null;
      this.bossAnimActions.clear();
      this.bossAnimState = null;
      this.bossPrevPos = null;
      this.bossHitFlashTint = null;
    }

    if (!this.bossMesh) {
      // Use loaded boss model if available
      const bossModel = stage === 2 ? loadedModels.boss : loadedModels.boss_2legs;
      if (bossModel) {
        this.bossMesh = cloneSkeleton(bossModel) as unknown as THREE.Mesh;
        this.bossMesh.name = 'Boss';
        this.prepareHitFlashMaterials(this.bossMesh);
        // 按 bounding box 自动缩放到目标高度（两关 boss 模型尺寸不同，统一到 7m）。
        const box = new THREE.Box3().setFromObject(this.bossMesh);
        const size = box.getSize(new THREE.Vector3());
        const TARGET_BOSS_HEIGHT = 7.0;
        const autoScale = TARGET_BOSS_HEIGHT / Math.max(size.y, 0.01);
        this.bossMesh.scale.set(autoScale, autoScale, autoScale);
        // 把脚踩到地面（同 player 的处理）
        const newBox = new THREE.Box3().setFromObject(this.bossMesh);
        this.bossMesh.position.y = -newBox.min.y;
        // 缓存 base scale，给 attack 脉冲 / enrage 脉冲用
        this.bossBaseScale = autoScale;
        this.bossMeshStage = stage;
        this.scene.add(this.bossMesh);

        // 骨骼动画 mixer：Idle/Walk/Run/Jump/Shoot/Attack/[Attack.001]/Death
        const clips = loadedAnimClips.get(stage === 2 ? 'boss' : 'boss_2legs');
        if (clips && clips.length > 0) {
          this.bossMixer = new THREE.AnimationMixer(this.bossMesh);
          this.bossAnimActions.clear();
          for (const clip of clips) {
            this.bossAnimActions.set(clip.name, this.bossMixer.clipAction(clip));
          }
          this.bossAnimState = null;
          const idle = this.bossAnimActions.get('Idle') ?? this.bossAnimActions.get('Walk');
          if (idle) {
            idle.play();
            this.bossAnimState = idle.getClip().name;
          }
        } else {
          this.bossMixer = null;
          this.bossAnimActions.clear();
        }
      } else {
        // Fallback
        const geo = new THREE.BoxGeometry(2.4, 3.0, 2.4);
        const mat = new THREE.MeshToonMaterial({ color: 0x9933cc, gradientMap: toonGradientMap });
        this.bossMesh = new THREE.Mesh(geo, mat);
        this.bossMesh.name = 'Boss';
        this.prepareHitFlashMaterials(this.bossMesh);
        this.bossBaseScale = 1.0;
        this.bossMeshStage = stage;
        this.bossMixer = null;
        this.bossAnimActions.clear();
        this.scene.add(this.bossMesh);
      }
    }

    this.bossMesh.visible = true;
    this.bossMesh.position.set(boss.x, boss.y || 0, boss.z);
    const bossHitFlashWeaponType = boss.hitFlashTimer > 0 ? boss.hitFlashWeaponType : undefined;
    const bossHitFlashColor = boss.hitFlashTimer > 0 ? boss.hitFlashColor : undefined;
    this.setBossHitFlashTint(this.bossMesh, bossHitFlashWeaponType, bossHitFlashColor);

    // Boss 大号 blob 阴影
    this.blobShadows?.place(boss.x, boss.y || 0, boss.z, 1.8);

    // === Boss 骨骼动画 ===
    if (this.bossMixer) {
      // 面向玩家（同敌人：atan2(dx, dz)）
      const rs = this.session.getRenderState();
      const fdx = rs.player.x - boss.x;
      const fdz = rs.player.z - boss.z;
      if (fdx !== 0 || fdz !== 0) this.bossMesh.rotation.y = Math.atan2(fdx, fdz);

      // 移动判定（滞后 200ms，避免 60Hz/渲染不同步误判，逻辑同敌人）
      let prev = this.bossPrevPos;
      if (!prev) {
        prev = { x: boss.x, z: boss.z, stillTime: 999 };
        this.bossPrevPos = prev;
      } else {
        const movedDist = Math.hypot(boss.x - prev.x, boss.z - prev.z);
        prev.stillTime = movedDist > 1e-4 ? 0 : prev.stillTime + this.frameDt;
        prev.x = boss.x;
        prev.z = boss.z;
      }
      const bossMoving = prev.stillTime < 0.2;

      // 选择动画：攻击 clip（attackAnimTimer 窗口内）> Run/Walk（移动）> Idle
      if (boss.attackAnimTimer > 0 && boss.currentAttack !== 'idle') {
        this.playBossAnim(BOSS_ATTACK_CLIP[boss.currentAttack] ?? 'Attack');
      } else if (bossMoving) {
        this.playBossAnim(boss.enraged ? 'Run' : 'Walk');
      } else {
        this.playBossAnim('Idle');
      }
      this.bossMixer.update(this.frameDt);
    }

    // Hit flash / enrage color (only works on fallback geometry)
    if (!(stage === 2 ? loadedModels.boss : loadedModels.boss_2legs) && !bossHitFlashWeaponType && bossHitFlashColor === undefined) {
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

    // Boss scale pulse when charging (body glow effect)
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

    // 3. Full-screen red flash on big AOE cleave (siege mech 横扫)
    if (boss.currentAttack === 'cleave' && boss.attackTimer > 0 && boss.attackTimer < 0.1) {
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

        // 祭坛贴地：标记常摆在高平台上，y 由 core 的 getTerrainHeightAt 求得（缺省 0）。
        const ay = tp.y ?? 0;

        ring.visible = true;
        ring.position.set(tp.x, ay + 0.1, tp.z);
        ring.rotation.z = time;

        pillar.visible = true;
        pillar.position.set(tp.x, ay + 2, tp.z);

        // 地面 decal 始终可见（除 portal_used 终态）
        decal.visible = tp.phase !== 'portal_used';
        decal.position.set(tp.x, ay + 0.06, tp.z);

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
    sword: [0.56, 0.85, 1.0],
    bone_bouncer: [0.95, 0.9, 0.8],
    axe: [1.0, 0.6, 0.1],
    pistol: [0.8, 1.0, 0.3],
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
      opacity: 1.0,
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
      if (this.chestRewardPanel && this.chestRewardPanelKey === key) return;
      this.pendingChestRewardReveal = reward;
      this.tryRevealChestRewardPanel();
      return;
    }
    this.pendingChestRewardReveal = null;
    if (this.chestRewardPanel) this.hideChestRewardPanel();
  }

  /** 开箱 glTF 动画播完（或无可播动画）后再弹出遗物选择面板。 */
  private tryRevealChestRewardPanel(): void {
    const reward = this.pendingChestRewardReveal;
    if (!reward) return;

    const chestId = reward.chestId;
    if (!this.chestOpenAnimDone.has(chestId)) {
      const obj = this.chestObjects.get(chestId);
      const openClip = chestAnimations.length > 0
        ? THREE.AnimationClip.findByName(chestAnimations, 'Open')
        : null;
      if (obj && openClip && !this.chestMixers.has(chestId)) return;
      if (obj && openClip) return;
      this.chestOpenAnimDone.add(chestId);
    }

    const key = `${reward.chestId}:${reward.relicId}`;
    if (this.chestRewardPanel && this.chestRewardPanelKey === key) {
      this.pendingChestRewardReveal = null;
      return;
    }
    this.hideChestRewardPanel();
    this.showChestRewardPanel(reward);
    this.pendingChestRewardReveal = null;
  }

  private showChestRewardPanel(reward: PendingChestReward): void {
    const relic = RELICS[reward.relicId];
    if (!relic) return;

    this.cameraOrbit.setEnabled(false);
    const overlay = document.createElement('div');
    this.chestRewardPanel = overlay;
    this.chestRewardPanelKey = `${reward.chestId}:${reward.relicId}`;
    overlay.dataset.cameraBlock = 'true'; // 全屏交互面板：阻断镜头拖拽（见 cameraOrbit 约定）
    overlay.style.cssText = inGameChoiceOverlayStyle(`
      z-index:320;pointer-events:auto;
      background:radial-gradient(circle at 50% 45%, rgba(255,220,120,0.16), rgba(0,0,0,0.78) 62%);
      font-family:"Lilita One","Noto Sans SC",Arial,sans-serif;    `);

    const centerGroup = createInGameChoiceCenterGroup();
    const title = document.createElement('div');
    title.style.cssText = uiColoredTextBold('#ffcc00') + 'font-size:clamp(20px,5.5vw,24px);font-weight:bold;margin-bottom:clamp(12px,3vh,20px);text-align:center;width:100%;';
    title.textContent = t('chest.rewardTitle');
    centerGroup.appendChild(title);

    // 遗物展示框复用升级卡：物品名在顶部 banner，属性在中部深色框，稀有度在底部 tab。
    // 开箱时框图 / 光晕 / 稀有度文案随稀有度闪烁，最终定格在真实遗物。
    const baseGlow = 'drop-shadow(0 4px 10px rgba(0,0,0,0.5))';
    const { card, titleEl, iconSlot, descEl, statsBox, levelEl, rarityEl } = createUpgradeFrameCard({
      rarity: 'common',
      accentColor: RARITY_COLORS.common ?? '#aaaaaa',
      title: '???',
      width: 'min(72vw,240px)',
      interactive: false,
    });
    card.style.transition = 'transform 0.22s cubic-bezier(0.2,1.5,0.4,1), opacity 0.18s ease-out, filter 0.08s';
    card.style.transform = 'scale(0.8) rotate(-2deg)';
    card.style.opacity = '0';

    iconSlot.style.fontSize = 'clamp(38px,11.2vw,54px)';
    iconSlot.style.marginTop = 'clamp(4px,1.4vw,8px)';
    iconSlot.textContent = '?';
    descEl.style.display = 'none';
    levelEl.style.display = 'none';
    rarityEl.textContent = '???';
    rarityEl.style.color = '#ffffff';

    const relicAttribute = document.createElement('div');
    relicAttribute.style.cssText = uiPlainText(
      'font-size:clamp(12px,3.2vw,15px);line-height:1.35;text-align:center;width:100%;',
    );
    relicAttribute.textContent = reward.bossDrop || reward.cost <= 0 ? 'Boss 宝箱 · 免费开启' : `消耗 ${reward.cost} 金币`;
    statsBox.appendChild(relicAttribute);

    const buttonRow = document.createElement('div');
    buttonRow.style.cssText = 'display:none;gap:clamp(10px,3vw,14px);margin-top:clamp(14px,4vw,18px);width:100%;max-width:min(92vw,300px);justify-content:center;align-items:stretch;';

    const discardBtn = createFramedLabelButton(
      t('chest.discard'),
      PAUSE_MENU_BUTTON_RED,
      PAUSE_MENU_BUTTON_RED_PRESSED,
      () => {
        this.session.selectChestReward(false);
        this.hideChestRewardPanel();
      },
      '100%',
      true,
    );
    discardBtn.style.maxWidth = `${uiPx(130)}px`;

    const keepBtn = createFramedLabelButton(
      t('chest.keep'),
      PAUSE_MENU_BUTTON_GREEN,
      PAUSE_MENU_BUTTON_GREEN_PRESSED,
      () => {
        this.session.selectChestReward(true);
        this.hideChestRewardPanel();
      },
      '100%',
      true,
    );
    keepBtn.style.maxWidth = `${uiPx(130)}px`;

    buttonRow.appendChild(discardBtn);
    buttonRow.appendChild(keepBtn);

    centerGroup.appendChild(card);
    centerGroup.appendChild(buttonRow);
    overlay.appendChild(centerGroup);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      card.style.opacity = '1';
      card.style.transform = 'scale(1) rotate(0deg)';
    });

    const rarities: ItemFrameRarity[] = ['common', 'uncommon', 'rare', 'legendary'];
    let flashes = 0;
    const flashTimer = window.setInterval(() => {
      const r = rarities[flashes % rarities.length];
      const color = RARITY_COLORS[r] ?? '#aaaaaa';
      card.style.backgroundImage = `url(${upgradeFrameUrl(r)})`;
      card.style.filter = `${baseGlow} drop-shadow(0 0 14px ${color}aa)`;
      rarityEl.textContent = t(`shrine.rarity.${r}`);
      iconSlot.textContent = '?';
      flashes++;
      if (flashes >= 9) {
        window.clearInterval(flashTimer);
        const finalRarity = reward.rarity as ItemFrameRarity;
        const finalColor = RARITY_COLORS[reward.rarity] ?? '#aaaaaa';
        card.style.backgroundImage = `url(${upgradeFrameUrl(finalRarity)})`;
        card.style.filter = `${baseGlow} drop-shadow(0 0 18px ${finalColor}cc)`;
        titleEl.textContent = relic.name;
        rarityEl.textContent = t(`shrine.rarity.${reward.rarity}`);
        setIconImage(iconSlot, relicIconSrc(reward.relicId), relic.emoji);
        relicAttribute.textContent = relic.description;
        card.style.transform = 'scale(1.12) rotate(0deg)';
        setTimeout(() => { card.style.transform = 'scale(1) rotate(0deg)'; }, 140);
        buttonRow.style.display = 'flex';
      }
    }, 70);
    this.syncInGameTouchControlsEnabled();
  }

  private hideChestRewardPanel(): void {
    this.chestRewardPanel?.remove();
    this.chestRewardPanel = null;
    this.chestRewardPanelKey = null;
    this.cameraOrbit.setEnabled(true);
    this.syncInGameTouchControlsEnabled();
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
      fontSize: uiPx(20),
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
      font-family:"Lilita One","Noto Sans SC",Arial,sans-serif;opacity:0;
    `;

    const title = document.createElement('div');
    // 2px 8 向黑描边 + 原本的彩色 glow + 软投影：描边吃在最前保证字形锐利，glow/投影叠在外圈。
    title.style.cssText = uiColoredTextBold(accent, `0 0 20px ${accent}88,0 2px 8px rgba(0,0,0,0.8)`)
      + 'font-size:clamp(22px,7vw,28px);font-weight:bold;letter-spacing:2px;';
    title.textContent = t('upgrade.compensationTitle');
    toast.appendChild(title);

    const levelLine = document.createElement('div');
    levelLine.style.cssText = uiPlainText('font-size:clamp(13px,4vw,16px);margin-top:4px;');
    levelLine.textContent = t('hud.level', { level: String(evt.level) });
    toast.appendChild(levelLine);

    const rewardLine = document.createElement('div');
    rewardLine.style.cssText = uiColoredTextBold(accent, `0 0 12px ${accent}66`)
      + 'font-size:clamp(18px,5.5vw,22px);font-weight:bold;margin-top:8px;';
    rewardLine.textContent = evt.kind === 'silver'
      ? t('upgrade.compensationSilver', { amount: String(evt.amount) })
      : t('upgrade.compensationGold', { amount: String(evt.amount) });
    toast.appendChild(rewardLine);

    const sub = document.createElement('div');
    sub.style.cssText = uiPlainText('font-size:clamp(11px,3vw,12px);margin-top:6px;');
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

  private renderChests(state: GameState): void {
    const chests = state.chests;
    // 当前正在等待玩家选择奖励的宝箱 id（chest_reward 阶段）。
    const pendingChestId = state.pendingChestReward?.chestId ?? null;
    const visibleChestIds = new Set<number>();
    const time = performance.now() * 0.001;

    for (const chest of chests) {
      let obj = this.chestObjects.get(chest.id);

      if (chest.opened) {
        // 没有对应对象（例如存档载入时就已开启）→ 不显示。
        if (!obj) continue;
        // 触发一次开箱动画（播放 glTF "Open" clip）。
        this.playChestOpenAnimation(chest.id);

        if (pendingChestId === chest.id) {
          // 玩家还没选完奖励：保持宝箱可见（开盖姿态）。
          visibleChestIds.add(chest.id);
        } else {
          // 已选完（pendingChestReward 已清空）：移除并撒金色粒子。
          this.removeChestObject(chest.id);
          this.spawnPickupBurst(chest.x, (chest.y ?? 0) + 0.6, chest.z, 0xffdd00);
          continue;
        }
      } else {
        visibleChestIds.add(chest.id);

        if (!obj) {
          obj = chestClosedObj
            ? (cloneSkeleton(chestClosedObj) as THREE.Object3D)
            : this.createReadableChestObject();
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
      }

      // Gentle hover animation（对可见宝箱统一处理）
      obj.position.set(chest.x, (chest.y ?? 0) + 0.1 + Math.sin(time * 1.5 + chest.id) * 0.05, chest.z);
      // 斜坡上的宝箱：底面跟随斜面倾斜，避免一角嵌进地面。
      obj.quaternion.copy(groundQuaternionAt(chest.x, chest.z));
      if (chest.bossDrop) {
        this.updateBossChestGlow(this.ensureBossChestGlow(obj), time + chest.id);
      } else {
        obj.getObjectByName('BossChestGoldGlow')?.removeFromParent();
      }
    }

    for (const [id] of this.chestObjects) {
      if (visibleChestIds.has(id)) continue;
      this.removeChestObject(id);
    }

    // 推进开箱动画混合器
    if (this.chestMixers.size > 0) {
      for (const mixer of this.chestMixers.values()) mixer.update(this.frameDt);
    }
    this.tryRevealChestRewardPanel();
  }

  /** 对已开启宝箱播放一次 "Open" 动画（幂等：已有 mixer 则跳过）。 */
  private playChestOpenAnimation(chestId: number): void {
    if (this.chestMixers.has(chestId) || this.chestOpenAnimDone.has(chestId)) return;
    const obj = this.chestObjects.get(chestId);
    if (!obj || chestAnimations.length === 0) {
      this.chestOpenAnimDone.add(chestId);
      this.tryRevealChestRewardPanel();
      return;
    }
    const clip = THREE.AnimationClip.findByName(chestAnimations, 'Open');
    if (!clip) {
      this.chestOpenAnimDone.add(chestId);
      this.tryRevealChestRewardPanel();
      return;
    }
    const mixer = new THREE.AnimationMixer(obj);
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true; // 播完停在开盖姿态
    action.play();
    mixer.addEventListener('finished', (event) => {
      if (event.action !== action) return;
      this.chestOpenAnimDone.add(chestId);
      this.tryRevealChestRewardPanel();
    });
    this.chestMixers.set(chestId, mixer);
  }

  /** 从场景移除宝箱对象并清理其动画混合器。 */
  private removeChestObject(chestId: number): void {
    const obj = this.chestObjects.get(chestId);
    if (obj) {
      this.scene.remove(obj);
      this.chestObjects.delete(chestId);
    }
    const mixer = this.chestMixers.get(chestId);
    if (mixer) {
      mixer.stopAllAction();
      this.chestMixers.delete(chestId);
    }
    this.chestOpenAnimDone.delete(chestId);
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

        this.scene.add(group);
        this.shrineMeshes.set(shrine.id, group);
      }
      group.position.set(shrine.x, shrine.y ?? 0, shrine.z);

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
  }

  /**
   * 玩家在充能神殿范围内时，于屏幕中上方（与宝箱距离提示同位置）显示圆形进度条。
   * 离开范围或充能完成（phase→ready）后隐藏；进度随 chargeTimer 增减。
   * @returns 指示器是否正在显示（用于压制同位置的宝箱提示）
   */
  private updateShrineIndicator(shrines: ShrineState[], playerX: number, playerZ: number): boolean {
    const widget = this.shrineChargeWidget;
    const root = this.shrineIndicator;
    if (!widget || !root) return false;

    // 优先显示玩家正站在里面（in range）的圣殿；否则显示仍在回落（chargeTimer>0）的圣殿，
    // 让玩家离开后圆环随 chargeTimer 缓慢减少直到归零再消失。
    let activeShrine: ShrineState | null = null;
    let decayingShrine: ShrineState | null = null;
    for (const s of shrines) {
      if (s.phase !== 'charging') continue;
      const dist = Math.hypot(s.x - playerX, s.z - playerZ);
      if (dist <= SHRINE_INTERACT_RADIUS) {
        activeShrine = s;
        break;
      }
      if (s.chargeTimer > 0 && (!decayingShrine || s.chargeTimer > decayingShrine.chargeTimer)) {
        decayingShrine = s;
      }
    }
    activeShrine ??= decayingShrine;

    if (!activeShrine || activeShrine.chargeTimer <= 0) {
      gsapAnimations.animateShrineIndicator(root, false, 0.2);
      return false;
    }

    const pct = activeShrine.chargeDuration > 0
      ? Math.min(100, (activeShrine.chargeTimer / activeShrine.chargeDuration) * 100)
      : 0;
    widget.setPercent(pct);
    gsapAnimations.animateShrineIndicator(root, true, 0.2);
    return true;
  }

  /**
   * 祭坛 phase==='summoning' 时显示圆形进度条（进度来自 summonTimer / summonDuration，0-100%）。
   * - 召唤成功（summoning → boss_active）时先把圆环补满 100% 再淡出消失。
   * - 玩家离开召唤区域后 core 会让进度缓慢回落，圆环随之逐渐减少，归零（回到 ready）后淡出。
   * - 与充能神殿进度共用 HUD 位置；神殿进度优先（suppress=true 时让位）。
   */
  private updateBossSummonIndicator(altars: AltarState[], suppress: boolean): boolean {
    const widget = this.bossSummonWidget;
    const root = this.bossSummonIndicator;
    if (!widget || !root) return false;

    const activeAltar = suppress ? null : altars.find(a => a.phase === 'summoning') ?? null;
    if (!activeAltar) {
      // 上一帧还在召唤、本帧已有祭坛进入 boss_active → 召唤成功：补满 100% 再淡出。
      if (this.bossSummonWasShowing && altars.some(a => a.phase === 'boss_active')) {
        widget.setPercent(100);
      }
      this.bossSummonWasShowing = false;
      gsapAnimations.animateShrineIndicator(root, false, 0.2, 'bossSummon');
      return false;
    }

    const pct = activeAltar.summonDuration > 0
      ? Math.min(100, (activeAltar.summonTimer / activeAltar.summonDuration) * 100)
      : 0;
    // 重新出现的首帧无过渡地复位，避免从上次的满环回抽。
    widget.setPercent(pct, !this.bossSummonWasShowing);
    gsapAnimations.animateShrineIndicator(root, true, 0.2, 'bossSummon');
    this.bossSummonWasShowing = true;
    return true;
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
    this.shrinePanel.style.cssText = inGameChoiceOverlayStyle(
      'background:radial-gradient(ellipse at center,rgba(40,30,80,0.85),rgba(0,0,0,0.85));z-index:300;font-family:"Lilita One","Noto Sans SC",Arial,sans-serif;',
    );

    const centerGroup = createInGameChoiceCenterGroup('min(96vw,760px)');
    const title = document.createElement('div');
    title.style.cssText = uiColoredTextBold('#ffd966') + 'font-size:clamp(20px,5.5vw,26px);font-weight:bold;margin-bottom:clamp(12px,3vh,20px);letter-spacing:1px;text-align:center;width:100%;';
    title.textContent = t('shrine.title');
    centerGroup.appendChild(title);

    const cardRow = createInGameChoiceCardRow();
    const shrineCardGap = 'clamp(10px,3vw,14px)';
    cardRow.style.gap = shrineCardGap;
    const cardCount = Math.max(1, options.length);
    const shrineCardWidth = cardCount > 1
      ? `min(180px,calc((100% - ${shrineCardGap} * ${cardCount - 1}) / ${cardCount}))`
      : 'min(180px,90vw)';

    for (const option of options) {
      const card = this.createShrineRewardCard(option, shrineCardWidth);
      cardRow.appendChild(card);
    }

    centerGroup.appendChild(cardRow);
    this.shrinePanel.appendChild(centerGroup);
    document.body.appendChild(this.shrinePanel);
    this.syncInGameTouchControlsEnabled();
  }

  private createShrineRewardCard(option: ShrineRewardOption, width = 'min(180px,90vw)'): HTMLDivElement {
    const accentColor = RARITY_COLORS[option.rarity] ?? '#aaaaaa';
    const percent = Math.round(option.value * 1000) / 10; // %.1
    const title = t(`shrine.reward.${option.reward}_name`, {
      value: String(option.value),
      percent: String(percent),
    });
    const desc = t(`shrine.reward.${option.reward}_desc`, {
      value: String(option.value),
      percent: String(percent),
    });

    // 神殿奖励卡与升级卡保持同一布局：顶部名称、上方图标、中部深色数值框、底部稀有度。
    const { card, iconSlot, descEl, statsBox, levelEl, rarityEl } = createUpgradeFrameCard({
      rarity: option.rarity as ItemFrameRarity,
      accentColor,
      title,
      width,
      interactive: true,
    });

    // Icon
    setIconImage(iconSlot, shrineRewardIconSrc(option.reward), SHRINE_REWARD_ICONS[option.reward] ?? '⚡');

    // 中部深色框显示具体奖励属性；上半区只保留图标，避免和升级槽位错位。
    descEl.style.display = 'none';
    const rewardAttribute = document.createElement('div');
    rewardAttribute.style.cssText = uiPlainText(
      'font-size:clamp(7.3px,2vw,9.3px);line-height:1.35;text-align:center;width:100%;',
    );
    rewardAttribute.textContent = desc;
    statsBox.appendChild(rewardAttribute);

    // 神殿奖励没有等级行，隐藏但保留升级卡其余槽位。
    levelEl.style.display = 'none';

    // 底部 tab：稀有度文案（白字）
    rarityEl.textContent = t(`shrine.rarity.${option.rarity}`);
    rarityEl.style.color = '#ffffff';

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
    this.syncInGameTouchControlsEnabled();
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
        // 优先复用同 kind 池中实例
        const kindPool = this.areaEffectPool.get(ae.kind);
        obj = kindPool ? kindPool.pop() : undefined;
        if (!obj) {
          obj = this.createAreaEffectMesh(ae);
          obj.userData['aeKind'] = ae.kind;
          this.scene.add(obj);
        }
        obj.visible = true;
        this.areaEffectObjects.set(ae.id, obj);
      }

      switch (ae.kind) {
        case 'ray_beam': {
          // 交叉光柱 + 核心：从玩家沿 dir 延伸 length，宽度 = width*2
          const dx = ae.dirX ?? 0, dz = ae.dirZ ?? 1;
          const len = ae.length ?? 40;
          obj.position.set(ae.x + dx * len * 0.5, ae.y + 1.0, ae.z + dz * len * 0.5);
          obj.rotation.set(0, Math.atan2(dx, dz), 0);
          const w = (ae.width ?? 0.5) * 0.625;
          obj.scale.set(w, w, len);
          // 能量抖动：每帧轻微闪烁，核心更亮、辉光更柔
          const flicker = 0.82 + Math.random() * 0.18;
          for (const child of (obj as THREE.Group).children) {
            const cm = (child as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
            if (!cm) continue;
            const base = 1.0;
            cm.opacity = base * ratio * flicker;
          }
          break;
        }
        case 'gas_cloud': {
          obj.position.set(ae.x, ae.y + 0.08, ae.z);
          obj.scale.setScalar(ae.radius);
          const group = obj as THREE.Group;
          const fill = group.children[0] as THREE.Mesh;
          const ring = group.children[1] as THREE.Mesh;
          if (fill && ring) {
            const fillMat = fill.material as THREE.MeshBasicMaterial;
            const ringMat = ring.material as THREE.MeshBasicMaterial;
            // 缓慢呼吸，营造翻腾的浓淡变化（不旋转）
            const pulse = 0.85 + Math.sin(state.tick * 0.12) * 0.15;
            fillMat.opacity = ratio * pulse;
            ringMat.opacity = ratio;
          }
          // 上升的毒气团：稀疏的大号 smoke billboard 自地面缓缓升腾、外扩、渐隐
          if (state.tick % 6 === 0) {
            const a = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random()) * ae.radius;
            this.spawnBillboard({
              texture: 'smoke',
              x: ae.x + Math.cos(a) * r, y: ae.y + 0.4, z: ae.z + Math.sin(a) * r,
              scale: ae.radius * 0.55, endScale: ae.radius * 0.95,
              lifetime: 1.4, opacity: ratio, opacityCurve: 'fadeOut',
              color: 0x5fbf32, rotation: Math.random() * Math.PI * 2,
              rotationSpeed: (Math.random() - 0.5) * 0.6, blending: 'normal',
            });
          }
          // 细碎上浮的毒粒，点缀云体内部
          if (state.tick % 3 === 0) {
            const a = Math.random() * Math.PI * 2;
            const r = Math.random() * ae.radius;
            this.spawnParticle(
              ae.x + Math.cos(a) * r, ae.y + 0.3 + Math.random() * 0.8, ae.z + Math.sin(a) * r,
              0, 0.3 + Math.random() * 0.4, 0,
              0.5, 0.5, 0.25, 0.7, 0.12,
            );
          }
          break;
        }
        case 'void_ripple': {
          obj.position.set(ae.x, ae.y + 0.08, ae.z);
          obj.scale.setScalar(Math.max(0.01, ae.radius));
        const m = (obj as THREE.Mesh).material as THREE.MeshBasicMaterial;
        m.color.setHex(0x00ffff);
        m.opacity = ratio;
          break;
        }
        case 'scorch_trail': {
          obj.position.set(ae.x, ae.y + 0.06, ae.z);
          obj.scale.setScalar(Math.max(0.01, ae.radius));
          // 焦土底层随时间淡出；发光放射层在中后段更快收敛，呈现"先亮后焦"的余烬感
          const burn = obj.getObjectByName('scorch_burn') as THREE.Mesh | null;
          const glow = obj.getObjectByName('scorch_glow') as THREE.Mesh | null;
          if (burn) (burn.material as THREE.MeshBasicMaterial).opacity = ratio * 0.85;
          if (glow) {
            (glow.material as THREE.MeshBasicMaterial).opacity = ratio * ratio * 0.9;
          }
          break;
        }
      }
    }

    // 清除已消失的区域特效 mesh：进对象池（按 kind 分池），超限再 dispose
    for (const [id, obj] of this.areaEffectObjects) {
      if (!live.has(id)) {
        const kind = obj.userData['aeKind'] as string | undefined;
        const pool = kind ? (this.areaEffectPool.get(kind) ?? []) : null;
        if (pool && kind && pool.length < AREA_EFFECT_POOL_CAP_PER_KIND) {
          obj.visible = false;
          pool.push(obj);
          this.areaEffectPool.set(kind, pool);
        } else {
          this.scene.remove(obj);
          // 遍历销毁（gas_cloud 等是 Group，需逐子网格 dispose；贴图共享，不在此释放）
          obj.traverse((node) => {
            const mesh = node as THREE.Mesh;
            if (mesh.geometry) mesh.geometry.dispose?.();
            const mat = mesh.material;
            if (Array.isArray(mat)) mat.forEach((m) => m.dispose?.());
            else mat?.dispose?.();
          });
        }
        this.areaEffectObjects.delete(id);
      }
    }
  }

  private createAreaEffectMesh(ae: GameState['areaEffects'][number]): THREE.Object3D {
    switch (ae.kind) {
      case 'ray_beam': {
        // 激光线：交叉两片"光柱辉光"(light 贴图) + 一条灼热高亮核心盒。
        // 单位尺寸沿 z 长 1，靠 update 里的 scale(w,w,len) 拉伸。
        const group = new THREE.Group();

        // 把 plane 的"长度轴" UV 钉在贴图水平中线(0.5)，这样 light 的径向亮带沿光束
        // 全长均匀发亮，只在宽度方向衰减 → 读起来是一根均匀发光的光柱。
        const makeGlowGeo = (lengthAxis: 'x' | 'y'): THREE.PlaneGeometry => {
          const g = new THREE.PlaneGeometry(1, 1);
          const uv = g.attributes.uv as THREE.BufferAttribute;
          for (let i = 0; i < uv.count; i++) {
            if (lengthAxis === 'y') uv.setY(i, 0.5);
            else uv.setX(i, 0.5);
          }
          uv.needsUpdate = true;
          return g;
        };
        const makeGlow = (lengthAxis: 'x' | 'y'): THREE.Mesh => {
          const mat = new THREE.MeshBasicMaterial({
            map: this.vfxTextures.light, color: 0xff264d,
            transparent: true, opacity: 1.0,
            side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
          });
          const mesh = new THREE.Mesh(makeGlowGeo(lengthAxis), mat);
          mesh.name = 'beam_glow';
          return mesh;
        };
        // glowH 躺平(法线 +Y)：长度走局部 y；glowV 立起(法线 +X)：长度走局部 x
        const glowH = makeGlow('y'); glowH.rotation.x = Math.PI / 2;
        const glowV = makeGlow('x'); glowV.rotation.y = Math.PI / 2;
        group.add(glowH, glowV);

        // 灼热核心：细长高亮盒，近白粉，加色 → 一条刺眼实线
        const core = new THREE.Mesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshBasicMaterial({
            color: 0xffc2d2, transparent: true, opacity: 1.0,
            blending: THREE.AdditiveBlending, depthWrite: false,
          }),
        );
        core.scale.set(0.28, 0.28, 1); // 比辉光更细
        core.name = 'beam_core';
        group.add(core);

        // 一次性：起点光斑（每次开火放一发）
        const mdx = ae.dirX ?? 0, mdz = ae.dirZ ?? 1;
        this.spawnBillboard({
          texture: 'flare',
          x: ae.x + mdx * 0.4, y: ae.y + 1.0, z: ae.z + mdz * 0.4,
          scale: 1.6, endScale: 2.4, lifetime: 0.16, opacity: 1.0,
          opacityCurve: 'fadeOut', color: 0xff3366, blending: 'additive',
        });

        return group;
      }
      case 'gas_cloud': {
        // 分层毒气云：地面毒液斑（smoke 贴图）+ 毒绿边界环（magic_circle）。
        // Group 整体按 ae.radius 缩放，单位尺寸 = 直径 2 → 半径 1，缩放后正好覆盖 AoE。
        const group = new THREE.Group();

        // 1) 地面毒液斑：柔和的 smoke 贴图平铺贴地，毒绿染色，标示效果范围内的污染地面
        const fillGeo = new THREE.PlaneGeometry(2, 2);
        const fillMat = new THREE.MeshBasicMaterial({
          map: this.vfxTextures.smoke,
          color: 0x4faa2e, transparent: true, opacity: 1.0,
          side: THREE.DoubleSide, depthWrite: false,
        });
        const fill = new THREE.Mesh(fillGeo, fillMat);
        fill.rotation.x = -Math.PI / 2;
        fill.renderOrder = 3;
        fill.name = 'gas_fill';
        group.add(fill);

        // 2) 边界毒环：scorch 放射贴图染毒绿、加色发光，清晰勾出 AoE 半径
        const ringGeo = new THREE.PlaneGeometry(2, 2);
        const ringMat = new THREE.MeshBasicMaterial({
          map: this.vfxTextures.scorch,
          color: 0x7bff3a, transparent: true, opacity: 1.0,
          side: THREE.DoubleSide, depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.renderOrder = 4;
        ring.name = 'gas_ring';
        group.add(ring);

        return group;
      }
      case 'void_ripple': {
        // 同心波纹贴图（白环+透明底，alpha≈亮度），染青色加色发光；
        // 单位 plane 直径 2（半径 1），靠 scale(radius) 放大覆盖 AoE。
        const geo = new THREE.PlaneGeometry(2, 2);
        const mat = new THREE.MeshBasicMaterial({
          map: this.vfxTextures.void_ripple,
          color: 0x00ffff, transparent: true, opacity: 1.0,
          side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        return mesh;
      }
      case 'scorch_trail': {
        // 灼地痕迹：贴地的双层贴花。
        // 底层 = 暗橙焦土圆盘（普通混合），上层 = scorch_boots 放射状灼烧贴图（加色发光）。
        // 单位尺寸半径 1，由 update 按 ae.radius 缩放，正好覆盖 AoE。
        const group = new THREE.Group();

        const scorchGeo = new THREE.CircleGeometry(1, 24);
        const scorchMat = new THREE.MeshBasicMaterial({
          map: this.vfxTextures.scorch_boots ?? null,
          color: 0x5a1f06, transparent: true, opacity: 1.0,
          side: THREE.DoubleSide, depthWrite: false,
        });
        const scorch = new THREE.Mesh(scorchGeo, scorchMat);
        scorch.rotation.x = -Math.PI / 2;
        scorch.renderOrder = 3;
        scorch.name = 'scorch_burn';
        group.add(scorch);

        const glowGeo = new THREE.PlaneGeometry(2, 2);
        const glowMat = new THREE.MeshBasicMaterial({
          map: this.vfxTextures.scorch_boots ?? null,
          color: 0xff7a1a, transparent: true, opacity: 1.0,
          side: THREE.DoubleSide, depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.rotation.x = -Math.PI / 2;
        glow.rotation.z = Math.random() * Math.PI * 2; // 随机初始朝向，避免每个痕迹放射纹理朝向一致
        glow.renderOrder = 4;
        glow.name = 'scorch_glow';
        group.add(glow);

        return group;
      }
      default: {
        const geo = new THREE.CircleGeometry(1, 20);
        const mat = new THREE.MeshBasicMaterial({
          color: 0xff6a1a, transparent: true, opacity: 1.0,
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
    ctx.font = `bold 60px ${UI_FONT_FACE}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const grad = ctx.createLinearGradient(0, 18, 0, 78);
    grad.addColorStop(0, '#f0d8ff');
    grad.addColorStop(0.45, '#b06bff');
    grad.addColorStop(1, '#4d8dff');
    ctx.shadowColor = 'rgba(122,88,255,0.8)';
    ctx.shadowBlur = 14;
    ctx.lineWidth = 8;
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
      if (this.mysteryNumberValue >= 0 && value > this.mysteryNumberValue) {
        this.mysteryNumberPulse = 0.18;
      }
      this.mysteryNumberValue = value;
      const oldMap = sprite.material.map;
      sprite.material.map = this.makeMysteryNumberTexture(value);
      sprite.material.needsUpdate = true;
      oldMap?.dispose();
    }
    this.mysteryNumberPulse = Math.max(0, this.mysteryNumberPulse - this.frameDt);
    const pulse = this.mysteryNumberPulse > 0
      ? 1 + Math.sin((this.mysteryNumberPulse / 0.18) * Math.PI) * 0.22
      : 1;
    const arcaneParams = BONDS.arcane.params;
    const threshold = arcaneTier >= 3 ? arcaneParams.thresholdT3 : arcaneParams.threshold;
    const mysteryScale = 0.5 + Math.min(1, value / threshold) * 0.5;
    const visualScale = Math.min(1, mysteryScale * pulse);
    sprite.visible = true;
    sprite.position.set(player.x, player.y + 2.5, player.z);
    sprite.scale.set(1.15 * visualScale, 0.86 * visualScale, 1);
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
        this.spawnBillboard({
          texture: 'light', x: from.x, y: from.y, z: from.z,
          scale: 1.2, endScale: 2.2, lifetime: 0.28, opacityCurve: 'fadeOut',
          opacity: 0.75, color: 0x6f7cff, rotation: Math.random() * Math.PI * 2,
          blending: 'additive',
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
      this.spawnBillboard({
        texture: 'light', x: pos.x, y: pos.y, z: pos.z,
        scale: 0.85, endScale: 0.25, lifetime: 0.18, opacityCurve: 'fadeOut',
        opacity: 0.55, color: 0x5f7cff, blending: 'additive',
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
    this.spawnBillboard({
      texture: 'light', x, y, z, scale: 2.8, endScale: 5.0, lifetime: 0.28,
      opacityCurve: 'flash', opacity: 0.9, color: 0x8b7cff,
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
    this.spawnBillboard({
      texture: 'magic_circle', x, y: y - 1.0 + 0.08, z, scale: 1.2, endScale: 3.4, lifetime: 0.5,
      opacityCurve: 'fadeOut', opacity: 0.5, color: 0xb16dff,
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

  private updateVFX(state: GameState, dt: number, eventsFresh = true): void {
    const enemies = state.enemies;
    const player = state.player;

    this.updateAreaEffects(state, dt);
    this.updateEnemyStatusVfx(state);
    this.updateMysteryNumber(state);
    // 事件驱动的羁绊 VFX 只在新 tick 消费一次（高刷屏去重）。
    if (eventsFresh) this.processBondVfxEvents(state);
    this.updateArcaneBurstOrbs(dt);

    // --- Emit particles based on game events ---

    // Hit sparks from damage events（事件驱动，仅新 tick 消费）
    if (eventsFresh) {
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
    }

    // Continuous weapon effects
    // 火环半径取实际 aoeRadius（按武器等级查 WEAPON_STATS），让特效与判定范围一致。
    let hasFlameRing = false;
    let flameRingRadius = 0;
    for (const weapon of player.weapons) {
      if (weapon.type === 'flame_ring' && player.alive) {
        const table = WEAPON_STATS.flame_ring;
        const idx = Math.max(0, Math.min(weapon.level - 1, table.length - 1));
        flameRingRadius = table[idx]?.aoeRadius ?? 3.5;
        // 火焰粒子沿真实判定边界喷出，而非固定 2.5。
        this.emitFlameRingParticles(player.x, player.y, player.z, flameRingRadius);
        hasFlameRing = true;
      }
    }

    // Flame ring persistent decal (lazy-create + follow player)
    if (hasFlameRing && player.alive) {
      const disk = this.ensureFlameRingDisk();
      disk.visible = true;
      disk.position.set(player.x, player.y + 0.05, player.z);
      this.flameRingTime += dt;
      // 光晕外缘对齐到实际 aoeRadius 边界：plane 边长 = 2 * radius / tipNorm。
      const breathe = 1 + Math.sin(this.flameRingTime * 4) * 0.04;
      const size = (flameRingRadius * 2 / GameScene.FLAME_AURA_TIP_NORM) * breathe;
      // 满不透明发光、缓慢自转，作为范围边界提示。
      const star = this.flameRingLayers[0];
      if (star) {
        star.scale.set(size, size, 1);
        star.rotation.z = this.flameRingTime * 0.6;
        (star.material as THREE.MeshBasicMaterial).opacity = 1;
      }
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

    // Sword slash arc + pistol/shotgun muzzle flash —— 边缘触发，每次开火一次
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

        // 剑气：程序化实心扇形，几何钉在 sweepArc 真实判定上
        // （圆心=玩家 / 外缘=range / 扇形 Math.PI*0.944 ≈ 170° / 朝最近敌人）。
        // 多刀（projectileCount>1）按 sweepArc 同样的 baseAngle 偏移逐刀绘制。
        const swordStats = this.getEffectiveWeaponStats(weapon);
        const swordRange = swordStats.range;
        const swipeCount = Math.max(1, Math.round(swordStats.projectileCount));
        for (let s = 0; s < swipeCount; s++) {
          const sweepAngle = slashAngle + (s - (swipeCount - 1) / 2) * 0.3;
          this.spawnSlashSector(player.x, player.y + 0.05, player.z, sweepAngle, swordRange);
        }

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

    // Update GPU Curved World center uniform
    curvedWorldUniforms.uWarpCenter.value.set(p.x, p.y, p.z);

    // 让背景/天空网格完美跟随机载玩家，避免镜头拉远/跑远时产生严重的相机剪裁与贴图拉伸变形
    // 使用 backgroundMeshes 缓存数组而非每帧 traverse 整棵关卡，关卡里背景 mesh 数量远小于总 mesh 数。
    if (this.backgroundMeshes.length > 0) {
      const offset = this._tempVec.set(p.x, p.y, p.z);
      for (const bg of this.backgroundMeshes) {
        if (bg.userData.originalLocalPos === undefined) {
          bg.userData.originalLocalPos = bg.position.clone();
        }
        bg.position.copy(bg.userData.originalLocalPos).add(offset);
      }
    }

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
    // 失败 / 胜利后立刻冻结镜头：清零未衰减完的余量，本帧不再施加偏移
    if (state.phase === 'defeat' || state.phase === 'victory') {
      this.shakeIntensity = 0;
    } else if (this.shakeIntensity > 0.001) {
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

  private updateHUD(state: GameState, eventsFresh = true): void {
    const p = state.player;
    const time = performance.now();
    this.latestHudState = state;

    // HP bar with GSAP animation + numeric label (current / max)
    const hpPercent = Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100));
    if (hpPercent !== this.lastHpPercent) {
      setSvgBarPercent(this.hpBarInner, hpPercent);
      this.lastHpPercent = hpPercent;
    }
    this.hpText.textContent = `${Math.max(0, Math.ceil(p.hp))} / ${Math.ceil(p.maxHp)}`;
    this.updateLowHealthFx(p);

    // Shield bar (only shown when player has shield capacity)
    const maxShield = p.maxShield ?? 0;
    const shield = p.shield ?? 0;
    if (maxShield > 0) {
      this.shieldBar.style.display = 'block';
      const shieldPercent = Math.max(0, Math.min(100, (shield / maxShield) * 100));
      setSvgBarPercent(this.shieldBarInner, shieldPercent);
      this.shieldText.textContent = `${Math.max(0, Math.ceil(shield))} / ${Math.ceil(maxShield)}`;
    } else {
      this.shieldBar.style.display = 'none';
    }

    // XP bar with GSAP animation
    const xpPercent = p.xpToNext > 0 ? Math.max(0, Math.min(100, (p.xp / p.xpToNext) * 100)) : 0;
    if (xpPercent !== this.lastXpPercent) {
      setSvgBarPercent(this.xpBarInner, xpPercent);
      this.lastXpPercent = xpPercent;
    }

    // Level label straddles XP bar top edge with GSAP pulse animation
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
      this.levelLabel.style.textShadow = UI_TEXT_OUTLINE_SHADOW;
    }

    // Difficulty / timer / silver / kills
    const totalSec = Math.floor(state.gameTime);
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    this.setTierBadge(state.tier);
    this.setStageBadge(state.stage);
    this.timerTimeEl.textContent = timeStr;
    this.killCountEl.textContent = String(state.stats.killCount);
    setSilverBadgeAmount(this.silverLabel, state.stats.silverEarned);
    setGoldBadgeAmount(this.goldLabel, p.gold);

    // --- Quest track: dismiss once altar boss is defeated (portal_ready / portal_used) ---
    this.updateQuestHudTrack(state);

    // --- Consumable buff icons (left of buff row) with timed countdown shadow ---
    this.renderConsumableBuffs(p);

    // --- Weapon slots (top-left): fixed grid of maxWeaponSlots + a locked 6th slot ---
    this.renderWeaponSlots(p);
    this.renderGmWeaponDamagePanel(state);

    // --- Tome stack (top-right second column): newest on the right ---
    // 仅在法书集合 / 等级变化时重建（旧实现每帧全量重建 DOM）。
    let tomesSig = '';
    for (const tome of p.tomes) tomesSig += `${tome.type}:${tome.level}|`;
    if (tomesSig !== this.tomesSig) {
      this.tomesSig = tomesSig;
      this.tomesSlotsContainer.innerHTML = '';
      for (const tome of p.tomes) {
        const slot = document.createElement('div');
        const bgColor = TOME_COLORS[tome.type] ?? '#444';
        slot.style.cssText = `width:${HUD_TOME_SLOT_SIZE};height:${HUD_TOME_SLOT_SIZE};background:${bgColor}33;position:relative;display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:help;`;
        this.setItemTooltip(slot, this.createTomeTooltipHtml(tome));
        const icon = document.createElement('span');
        icon.style.cssText = 'font-size:clamp(10px,2.8vw,12px);';
        setIconImage(icon, tomeIconSrc(tome.type), TOME_ICONS[tome.type] ?? '📖');
        slot.appendChild(icon);
        // Level number (Lv.N) bottom-center
        const lvl = document.createElement('span');
        lvl.style.cssText = uiPlainText('position:absolute;bottom:-0.5em;left:0;right:0;text-align:center;font-size:8px;line-height:1;font-weight:bold;pointer-events:none;');
        lvl.textContent = `Lv.${tome.level}`;
        slot.appendChild(lvl);
        this.tomesSlotsContainer.appendChild(slot);
      }
    }
    // DOM 不重建时仍刷新 tooltip，避免 growth / 文案里的动态数值停留在旧快照。
    for (let i = 0; i < p.tomes.length; i++) {
      const slot = this.tomesSlotsContainer.children[i] as HTMLElement | undefined;
      if (slot) this.setItemTooltip(slot, this.createTomeTooltipHtml(p.tomes[i]));
    }

    // --- Relic bar (bottom): SVG has 10 fixed slots, filled left → right ---
    const acquiredRelics = (Object.entries(p.relicStacks ?? {}) as Array<[RelicId, number]>)
      .filter(([id, count]) => count > 0 && RELICS[id]);
    const visibleRelics = acquiredRelics.slice(0, HUD_RELIC_BAR_SLOT_COUNT);
    // 仅在可见的前 10 个遗物集合 / 数量变化时重建；超出 10 个不渲染。
    let relicsSig = '';
    for (const [id, count] of visibleRelics) relicsSig += `|${id}:${count}`;
    if (relicsSig !== this.relicsSig) {
      this.relicsSig = relicsSig;
      this.relicSlotsContainer.innerHTML = '';
      for (let i = 0; i < visibleRelics.length; i++) {
        const entry = visibleRelics[i];
        const slot = document.createElement('div');
        const [id, count] = entry;
        const relic = RELICS[id];
        const borderColor = RARITY_COLORS[relic.rarity] ?? '#aaaaaa';
        this.setItemTooltip(slot, this.createRelicTooltipHtml(id, count, state));
        const slotCenterX = HUD_RELIC_SLOT_VIEWBOX.x + HUD_RELIC_SLOT_VIEWBOX.w / 2 + i * HUD_RELIC_SLOT_VIEWBOX.pitch;
        slot.style.cssText = `
          position:absolute;
          left:${(slotCenterX / HUD_RELIC_BAR_VIEWBOX.w) * 100}%;top:50%;
          width:${(HUD_RELIC_SLOT_VIEWBOX.w / HUD_RELIC_BAR_VIEWBOX.w) * 100}%;
          height:${(HUD_RELIC_SLOT_VIEWBOX.h / HUD_RELIC_BAR_VIEWBOX.h) * 100}%;
          transform:translate(-50%,-50%);
          display:flex;align-items:center;justify-content:center;
          border-radius:7px;box-sizing:border-box;cursor:help;
          filter:drop-shadow(0 0 5px ${borderColor}80);
        `;
        const icon = document.createElement('span');
        icon.style.cssText = 'font-size:clamp(13px,3.4vw,16px);';
        setIconImage(icon, relicIconSrc(id), relic.emoji);
        slot.appendChild(icon);
        const stack = document.createElement('span');
        stack.style.cssText = 'position:absolute;left:50%;bottom:-7px;transform:translateX(-50%);height:14px;color:#fff;font-size:8px;font-weight:bold;display:flex;align-items:center;justify-content:center;text-shadow:0 1px 2px #000;white-space:nowrap;';
        stack.textContent = `x${count}`;
        slot.appendChild(stack);
        this.relicSlotsContainer.appendChild(slot);
      }
    }
    // 部分遗物 tooltip 依赖当前武器等级 / overtime 秒数，结构不变时也需要刷新。
    for (let i = 0; i < visibleRelics.length; i++) {
      const slot = this.relicSlotsContainer.children[i] as HTMLElement | undefined;
      const [id, count] = visibleRelics[i];
      if (slot) this.setItemTooltip(slot, this.createRelicTooltipHtml(id, count, state));
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
        setSvgBarPercent(this.bossHpBarInner, bossHpPercent);
        this.lastBossHpPercent = bossHpPercent;
      }

      const bossNameKey = state.boss.bossType === 'siege_mech' ? 'boss.siege_mech' : 'boss.gunner_mech';
      this.bossNameLabel.textContent = `${t(bossNameKey)} - Phase ${state.boss.phase}`;

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
    // 充能神殿进度指示器占用同位置时，压制宝箱 / 祭坛文字提示。
    const shrineIndicatorVisible = this.updateShrineIndicator(
      state.shrines,
      p.x,
      p.z,
    );
    const bossSummonIndicatorVisible = this.updateBossSummonIndicator(
      state.altars,
      shrineIndicatorVisible,
    );
    const chargeIndicatorVisible = shrineIndicatorVisible || bossSummonIndicatorVisible;
    const nearestChest = state.chests
      .filter(c => !c.opened)
      .map(c => ({ chest: c, dist: Math.hypot(c.x - p.x, c.z - p.z) }))
      .sort((a, b) => a.dist - b.dist)[0] ?? null;
    const openedChestCount = state.chests.filter(c => c.opened && !c.bossDrop).length;
    const chestCost = nearestChest?.chest.bossDrop ? 0 : getChestGoldCost(p.level, openedChestCount);
    const chestInRange = nearestChest != null
      && nearestChest.dist <= CHEST_INTERACT_RADIUS
      && Math.abs((p.y ?? 0) - (nearestChest.chest.y ?? 0)) <= CHEST_INTERACT_MAX_Y_DELTA;
    // 简易移动端判定：能 hover 的设备视作 PC，不显示按钮（避免 PC 用户看到双重 UI）
    const isMobile = !window.matchMedia('(hover: hover)').matches;
    if (chargeIndicatorVisible) {
      gsapAnimations.animateTeleporterIndicator(this.teleporterIndicator, false, 0.2);
    // [DISABLED] 局内祭坛位置显示
    // const visibleAltar = state.altars.find(a => a.phase !== 'boss_active' && a.phase !== 'portal_used');
    } else if (chestInRange && nearestChest && !isMobile) {
      // 使用 GSAP 动画显示传送门指示器
      gsapAnimations.animateTeleporterIndicator(this.teleporterIndicator, true, 0.2);
      const isBossChest = nearestChest.chest.bossDrop === true;
      const canAfford = isBossChest || p.gold >= chestCost;
      this.teleporterIndicator.style.color = canAfford ? '#ffdd66' : '#999999';
      this.teleporterIndicator.style.textShadow = canAfford
        ? '0 0 8px #ffcc33,0 1px 3px rgba(0,0,0,0.8)'
        : '0 1px 3px rgba(0,0,0,0.8)';
      this.teleporterIndicator.innerHTML = isBossChest
        ? `${chestIconHtml()}<span>${escapeTooltipText('[E] 开启 Boss 宝箱')}</span>`
        : canAfford
        ? `${chestIconHtml()}<span>${escapeTooltipText(`[E] 开启宝箱 - ${chestCost} 金币`)}</span>`
        : `${chestIconHtml()}<span>${escapeTooltipText(`金币不足 ${p.gold}/${chestCost}`)}</span>`;
    } else if (chestInRange && isMobile) {
      // 触屏靠近宝箱：顶部不显示 [E] 提示，由底部 interactBtn 承担
      gsapAnimations.animateTeleporterIndicator(this.teleporterIndicator, false, 0.2);
    /*
    // [DISABLED] 局内祭坛位置显示
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
    */
    } else if (nearestChest) {
      // 使用 GSAP 动画显示传送门指示器
      gsapAnimations.animateTeleporterIndicator(this.teleporterIndicator, true, 0.2);
      this.teleporterIndicator.style.color = '#ffdd66';
      this.teleporterIndicator.style.textShadow = '0 0 8px #ffcc33,0 1px 3px rgba(0,0,0,0.8)';
      this.teleporterIndicator.innerHTML = `${chestIconHtml()}<span>${escapeTooltipText(`${Math.round(nearestChest.dist)}m`)}</span>`;
    } else {
      // 使用 GSAP 动画隐藏传送门指示器
      gsapAnimations.animateTeleporterIndicator(this.teleporterIndicator, false, 0.2);
    }

    // --- 移动端交互按钮：仅在玩家位于传送门 / 宝箱交互半径内时显示 ---
    // 召唤 Boss 的祭坛（ready）现在进入范围即自动充能，无需按键，故不再显示提示。
    const portalInRange = state.altars.find(a =>
      a.phase === 'portal_ready'
      && Math.hypot(a.x - p.x, a.z - p.z) <= 2.0
    );
    if ((portalInRange || chestInRange) && isMobile) {
      gsapAnimations.animateInteractButton(this.interactBtn, true, 0.3);
      if (chestInRange) {
        const isBossChest = nearestChest?.chest.bossDrop === true;
        const canAfford = isBossChest || p.gold >= chestCost;
        setMobileChestInteractState(this.interactBtn, canAfford);
        if (!canAfford) this.interactBtn.title = `金币不足 ${p.gold}/${chestCost}`;
        else this.interactBtn.title = isBossChest ? '开启 Boss 宝箱' : `开启宝箱 ${chestCost}`;
      } else if (portalInRange) {
        setMobileAltarInteractState(this.interactBtn, t('altar.prompt.enterPortal'));
      }
    } else {
      gsapAnimations.animateInteractButton(this.interactBtn, false, 0.3);
    }

    // --- Final Swarm visual effects ---
    if (state.finalSwarm) {
      if (!this.wasFinalSwarm) {
        this.finalSwarmNoticeImg.src = finalSwarmNoticeImagePath();
        gsapAnimations.playFinalSwarmNotice(this.finalSwarmNoticeEl);
        this.wasFinalSwarm = true;
      }

      // Show pulsing red border
      if (!this.finalSwarmBorder) {
        this.finalSwarmBorder = document.createElement('div');
        this.finalSwarmBorder.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:90;border:4px solid rgba(255,50,50,0.6);box-sizing:border-box;';
        document.body.appendChild(this.finalSwarmBorder);
        gsapAnimations.animateFinalSwarmBorder(this.finalSwarmBorder, 0.5);
      }

      // Red-tint HUD elements during final swarm
      this.timerLabel.style.color = '#ff8888';
      this.killLabel.style.color = '#ff8888';
    } else {
      this.wasFinalSwarm = false;
      if (this.finalSwarmBorder) {
        gsapAnimations.stopFinalSwarmAnimations();
        this.finalSwarmBorder.remove();
        this.finalSwarmBorder = null;
      }
      this.timerLabel.style.color = '#ffffff';
      this.killLabel.style.color = '#ffffff';
    }

    // Damage numbers
    if (eventsFresh) {
      for (const evt of state.damageEvents) {
        this.spawnDamageNumber(evt);
      }
    }

    // 空池升级补偿特效（银币/金币）
    if (eventsFresh) {
      for (const evt of state.levelUpCompensationEvents) {
        this.playCompensationLevelUpFx(evt);
      }
    }

    // 宝箱开启揭示特效（事件在下一次 core tick 会清空，render loop 内用 key 防重复）
    for (const evt of state.chestOpenEvents ?? []) {
      const key = `${state.tick}:${evt.chestId}:${evt.relicId}`;
      if (this.seenChestOpenEvents.has(key)) continue;
      this.seenChestOpenEvents.add(key);
      if (this.seenChestOpenEvents.size > 80) this.seenChestOpenEvents.clear();
      this.playChestOpenFx(evt);

      // 玩家开箱动画：用 Punch 表达"敲开"的动作（仅当玩家存活；移动中也会被立刻打断，符合手感）
      if (state.player.alive && this.pickupAnimTimer <= 0) {
        const chestAnimName = 'Punch';
        const chestAction = this.playerAnimations.get(chestAnimName);
        if (chestAction) {
          this.pickupAnimTimer = chestAction.getClip().duration;
          this.playPlayerAnim(chestAnimName, 1.0);
        }
      }
    }

    // === Combo HUD (#6) ===
    if (this.comboLabel) {
      const combo = state.player.comboCount;
      if (combo > 3) {
        // 使用 GSAP 动画显示组合标签
        gsapAnimations.animateComboLabel(this.comboLabel, true, 0.3);
        this.comboLabel.textContent = t('hud.combo', { count: String(combo) });
        // Scale up with combo count（再按视口短边缩放，避免小屏过大）
        const fontSize = uiPx(Math.round(
          Math.min(HUD_COMBO_FONT_BASE + combo * HUD_COMBO_FONT_PER_STACK, HUD_COMBO_FONT_MAX) * HUD_COMBO_SCALE,
        ));
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

  private updateLowHealthFx(p: GameState['player']): void {
    const hpRatio = p.maxHp > 0 ? p.hp / p.maxHp : 1;
    if (hpRatio >= 0.15 || !p.alive) {
      if (this.lowHealthOverlay) {
        this.lowHealthOverlay.remove();
        this.lowHealthOverlay = null;
      }
      return;
    }

    if (!this.lowHealthOverlay) {
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position:fixed;inset:0;pointer-events:none;z-index:88;opacity:0;
        background:rgba(0,0,0,0.18);
        box-shadow:inset 0 0 72px rgba(255,0,0,0.62),inset 0 0 22px rgba(255,40,40,0.44);
        transition:opacity 160ms ease;
      `;
      document.body.appendChild(overlay);
      this.lowHealthOverlay = overlay;
    }

    const severity = Math.max(0, Math.min(1, (0.15 - hpRatio) / 0.15));
    this.lowHealthOverlay.style.opacity = String(0.42 + severity * 0.28);
  }

  private getWeaponCooldownInfo(weapon: { type: string; cooldownTimer: number; level: number }): { cooldownPercent: number } {
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

    // 结构签名：仅武器种类 / 等级 / 解锁数变化时才重建 DOM。
    let sig = `${unlocked}`;
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      const w = p.weapons[i];
      sig += w ? `|${w.type}:${w.level}` : '|_';
    }
    if (sig !== this.weaponSlotsSig) {
      this.weaponSlotsSig = sig;
      this.rebuildWeaponSlots(p, unlocked, TOTAL_SLOTS);
    }

    // 每帧只更新冷却遮罩高度（结构不变，避免重建整排 DOM）。
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      const weapon = p.weapons[i];
      const overlay = this.weaponCooldownOverlays[i];
      if (!weapon || !overlay) continue;
      const pct = this.getWeaponCooldownInfo(weapon).cooldownPercent;
      overlay.style.height = `${pct}%`;
      const slot = overlay.parentElement;
      if (slot instanceof HTMLElement) {
        this.setItemTooltip(slot, this.createWeaponTooltipHtml(weapon));
      }
    }
  }

  private rebuildWeaponSlots(p: GameState['player'], unlocked: number, TOTAL_SLOTS: number): void {
    this.weaponSlotsContainer.innerHTML = '';
    this.weaponCooldownOverlays = new Array(TOTAL_SLOTS).fill(null);
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      const weapon = p.weapons[i];
      const isLocked = i >= unlocked;
      const slot = document.createElement('div');
      slot.style.cssText = `width:${HUD_WEAPON_SLOT_SIZE};height:${HUD_WEAPON_SLOT_SIZE};background:${isLocked ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.6)'};position:relative;display:flex;align-items:center;justify-content:center;flex-shrink:0;${isLocked ? '' : 'cursor:help;'}`;

      if (isLocked) {
        const lock = document.createElement('span');
        lock.style.cssText = 'font-size:clamp(9px,2.6vw,11px);opacity:0.7;';
        lock.textContent = '🔒';
        slot.appendChild(lock);
        this.setItemTooltip(slot, `<div style="max-width:200px;">${escapeTooltipText(t('hud.weaponSlotLocked'))}</div>`);
        this.weaponSlotsContainer.appendChild(slot);
        continue;
      }

      if (weapon) {
        this.setItemTooltip(slot, this.createWeaponTooltipHtml(weapon));
        const icon = document.createElement('span');
        icon.style.cssText = 'font-size:clamp(10px,2.8vw,12px);';
        setIconImage(icon, weaponIconSrc(weapon.type), WEAPON_ICONS[weapon.type] ?? '?');
        slot.appendChild(icon);
        // 始终创建冷却遮罩（初始高度 0），逐帧只改 height —— 不再每帧增删 DOM。
        const overlay = document.createElement('div');
        overlay.style.cssText = `position:absolute;bottom:0;left:0;right:0;height:0%;background:rgba(0,0,0,0.7);pointer-events:none;`;
        slot.appendChild(overlay);
        this.weaponCooldownOverlays[i] = overlay;
        const lvl = document.createElement('span');
        lvl.style.cssText = uiPlainText('position:absolute;bottom:-0.5em;left:0;right:0;text-align:center;font-size:7px;line-height:1;font-weight:bold;pointer-events:none;');
        lvl.textContent = `Lv.${weapon.level}`;
        slot.appendChild(lvl);
      }
      this.weaponSlotsContainer.appendChild(slot);
    }
  }

  private setupGmWeaponDamagePanel(): void {
    const debugPanel = document.getElementById('stylized-debug-panel');
    if (!debugPanel) return;

    this.gmWeaponDamagePanel?.remove();
    this.gmWeaponDamageRows.clear();
    this.gmWeaponDamageSig = '';

    this.gmWeaponDamagePanel = document.createElement('div');
    this.gmWeaponDamagePanel.style.cssText = `
      margin:10px 0 8px;padding:8px 0 0;border-top:1px solid rgba(255,255,255,0.14);
      color:#eaf3ff;font-variant-numeric:tabular-nums;
    `;

    const gmTitle = document.createElement('div');
    gmTitle.style.cssText = 'margin:0 0 6px;color:#9fd0ff;font-weight:800;';
    gmTitle.textContent = 'GM Tools - Weapon Damage';

    this.gmWeaponDamageBody = document.createElement('div');
    this.gmWeaponDamageBody.style.cssText = 'display:flex;flex-direction:column;gap:3px;';

    this.gmWeaponDamagePanel.appendChild(gmTitle);
    this.gmWeaponDamagePanel.appendChild(this.gmWeaponDamageBody);
    debugPanel.appendChild(this.gmWeaponDamagePanel);
  }

  private renderGmWeaponDamagePanel(state: GameState): void {
    if (!this.gmWeaponDamageBody) return;

    const statsByWeapon = new Map((state.weaponDamageStats ?? []).map(s => [s.weaponType, s]));
    const weaponRows = state.player.weapons.map((weapon) => {
      const stat = statsByWeapon.get(weapon.type) ?? {
        weaponType: weapon.type,
        killCount: 0,
        totalDamage: 0,
        dps: 0,
      };
      return {
        id: `weapon:${weapon.type}`,
        label: `${WEAPON_ICONS[weapon.type] ?? '?'} ${t(`upgrade.weapon.${weapon.type}`)}`,
        killCount: stat.killCount,
        totalDamage: stat.totalDamage,
        dps: stat.dps,
        isBond: false,
      };
    });
    const bondRows = (state.bondDamageStats ?? [])
      .filter(stat => stat.totalDamage > 0 || stat.killCount > 0)
      .map(stat => {
        const bond = BONDS[stat.bondId];
        return {
          id: `bond:${stat.bondId}`,
          label: `${bond?.icon ?? '🔗'} ${bond ? t(bond.nameKey) : stat.bondId}`,
          killCount: stat.killCount,
          totalDamage: stat.totalDamage,
          dps: stat.dps,
          isBond: true,
        };
      });
    const orderedStats = [...weaponRows, ...bondRows];

    const sig = orderedStats.map(s => s.id).join('|');
    if (sig !== this.gmWeaponDamageSig) {
      this.gmWeaponDamageSig = sig;
      this.gmWeaponDamageRows.clear();
      this.gmWeaponDamageBody.innerHTML = '';

      const header = document.createElement('div');
      header.style.cssText = 'display:grid;grid-template-columns:minmax(92px,1fr) 38px 54px 58px;gap:6px;align-items:center;color:rgba(215,232,255,0.68);font-size:9px;text-transform:uppercase;';
      for (const label of ['Weapon', 'Kills', 'DPS', 'Total']) {
        const cell = document.createElement('span');
        cell.textContent = label;
        cell.style.textAlign = label === 'Weapon' ? 'left' : 'right';
        header.appendChild(cell);
      }
      this.gmWeaponDamageBody.appendChild(header);

      for (const stat of orderedStats) {
        this.createGmWeaponDamageRow(stat.id, stat.label, stat.isBond);
      }
    }

    for (const stat of orderedStats) {
      const row = this.gmWeaponDamageRows.get(stat.id);
      if (!row) continue;
      row.kills.textContent = String(stat.killCount);
      row.dps.textContent = this.formatGmDamageNumber(stat.dps, 1);
      row.total.textContent = this.formatGmDamageNumber(stat.totalDamage, 0);
    }
  }

  private createGmWeaponDamageRow(rowId: string, label: string, isBond: boolean): void {
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:minmax(92px,1fr) 38px 54px 58px;gap:6px;align-items:center;min-height:18px;border-top:1px solid rgba(255,255,255,0.06);padding-top:3px;';

    const name = document.createElement('span');
    name.style.cssText = `overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${isBond ? '#ffd966' : '#ffffff'};font-weight:700;`;
    name.textContent = label;
    row.appendChild(name);

    const kills = this.createGmWeaponDamageValue();
    const dps = this.createGmWeaponDamageValue();
    const total = this.createGmWeaponDamageValue();
    row.appendChild(kills);
    row.appendChild(dps);
    row.appendChild(total);

    this.gmWeaponDamageBody?.appendChild(row);
    this.gmWeaponDamageRows.set(rowId, { kills, dps, total });
  }

  private createGmWeaponDamageValue(): HTMLSpanElement {
    const value = document.createElement('span');
    value.style.cssText = 'text-align:right;color:#bfe5ff;';
    return value;
  }

  private formatGmDamageNumber(value: number, decimals: number): string {
    if (!Number.isFinite(value)) return '0';
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (abs >= 10_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toFixed(decimals);
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
    slot.style.cssText = 'min-width:clamp(92px,22vw,126px);height:clamp(38px,10vw,44px);background:rgba(20,12,34,0.86);border:1px solid rgba(180,120,255,0.5);border-radius:8px;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:flex-start;gap:6px;padding:3px 7px;box-sizing:border-box;flex-shrink:0;box-shadow:0 0 10px rgba(160,90,255,0.25);';
    this.setItemTooltip(slot, this.createConsumableTooltipHtml(active.id, active.remaining));

    const icon = document.createElement('span');
    icon.style.cssText = 'font-size:clamp(18px,5vw,22px);line-height:1;position:relative;z-index:1;flex:0 0 auto;';
    setIconImage(icon, consumableIconSrc(active.id), CONSUMABLE_EMOJI[active.id] ?? '✨');
    slot.appendChild(icon);

    const textCol = document.createElement('div');
    textCol.style.cssText = 'position:relative;z-index:1;min-width:0;display:flex;flex-direction:column;gap:1px;line-height:1.05;';
    const effect = document.createElement('div');
    effect.style.cssText = uiPlainText('font-size:clamp(8px,2.1vw,10px);font-weight:bold;color:#f3e9ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;');
    effect.textContent = t(`consumable.${active.id}_short`);
    textCol.appendChild(effect);
    const timerLine = document.createElement('div');
    timerLine.style.cssText = uiPlainText('font-size:clamp(7px,1.8vw,9px);font-weight:bold;color:#cdb7ff;white-space:nowrap;');
    timerLine.textContent = active.remaining < 0
      ? t('consumable.pending')
      : t('consumable.timer', { seconds: String(Math.ceil(active.remaining)) });
    textCol.appendChild(timerLine);
    slot.appendChild(textCol);

    // 限时 buff：顶部向下降的阴影（剩余越少阴影越高）
    if (active.remaining > 0 && this.consumableMaxRemaining > 0) {
      const ratio = Math.max(0, Math.min(1, active.remaining / this.consumableMaxRemaining));
      const shade = document.createElement('div');
      shade.style.cssText = `position:absolute;top:0;left:0;right:0;height:${Math.round((1 - ratio) * 100)}%;background:rgba(0,0,0,0.62);pointer-events:none;border-radius:8px 8px 0 0;overflow:hidden;`;
      slot.appendChild(shade);
      const secs = document.createElement('span');
      secs.style.cssText = uiPlainText('position:absolute;right:4px;bottom:1px;text-align:right;font-size:8px;font-weight:bold;z-index:2;');
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
        ${iconImgHtml(consumableIconSrc(id), 18)}
        <span>${escapeTooltipText(name)}</span>
        <span style="opacity:0.8;font-size:11px;">${escapeTooltipText(timerText)}</span>
      </div>
      <div style="margin-top:4px;${UI_PLAIN_TEXT_STYLE};font-size:11px;line-height:1.35;">${escapeTooltipText(desc)}</div>
    `;
  }

  /**
   * 羁绊槽（buff 行右侧）。每个槽内部下方显示档位（T1/T2/T3）；
   * 点击展开 / 收起上方的羁绊详情浮层。
   */
  private renderBondSlots(state: GameState): void {
    const bonds = state.player.bonds ?? [];
    // 当前展开的羁绊若已不存在则关闭浮层
    if (this.openBondId && !bonds.some(b => b.bondId === this.openBondId)) {
      this.closeBondDetail();
    }

    // 仅在羁绊集合 / 档位变化时重建槽位（旧实现每帧重建 + 每帧重绑 pointerdown 监听）。
    let bondsSig = '';
    for (const prog of bonds) bondsSig += `${prog.bondId}:${prog.tier}|`;
    if (bondsSig !== this.bondsSig) {
      this.bondsSig = bondsSig;
      this.bondSlotsContainer.innerHTML = '';
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
        setIconImage(icon, bondIconSrc(prog.bondId), def.icon);
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
            this.openBondDetail(bondId, tier, this.latestHudState ?? state, slot);
          }
        });
        this.bondSlotsContainer.appendChild(slot);
      }
    }
    // 羁绊 tooltip 展示已持有武器等级等动态内容，槽位未重建时也刷新。
    for (let i = 0; i < bonds.length; i++) {
      const prog = bonds[i];
      const slot = this.bondSlotsContainer.children[i] as HTMLElement | undefined;
      if (slot) this.setItemTooltip(slot, this.createBondTooltipHtml(prog.bondId, prog.tier, state));
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
    iconSrc?: string;
    subtitle?: string;
    description?: string;
    rows: Array<[string, string]>;
    accent: string;
  }): string {
    const rows = args.rows.map(([label, value]) => `
      <div style="display:flex;justify-content:space-between;gap:18px;margin-top:3px;">
        <span style="${UI_PLAIN_TEXT_STYLE}">${escapeTooltipText(label)}</span>
        <span style="${UI_PLAIN_TEXT_STYLE};font-weight:700;text-align:right;">${escapeTooltipText(value)}</span>
      </div>
    `).join('');

    return `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
        <div style="width:7px;height:24px;border-radius:999px;background:${args.accent};box-shadow:0 0 12px ${args.accent}aa;"></div>
        <div>
          <div style="font-size:14px;font-weight:800;display:flex;align-items:center;gap:6px;${UI_PLAIN_TEXT_STYLE}">${args.iconSrc ? iconImgHtml(args.iconSrc, 18) : ''}<span>${escapeTooltipText(args.title)}</span></div>
          ${args.subtitle ? `<div style="font-size:10px;color:${args.accent};font-weight:700;letter-spacing:0.4px;">${escapeTooltipText(args.subtitle)}</div>` : ''}
        </div>
      </div>
      ${args.description ? `<div style="${UI_PLAIN_TEXT_STYLE};margin:6px 0 8px;">${escapeTooltipText(args.description)}</div>` : ''}
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
      title: t(`upgrade.weapon.${weapon.type}`),
      iconSrc: weaponIconSrc(weapon.type),
      subtitle: `Lv.${weapon.level}`,
      description: t(`upgrade.weapon.${weapon.type}_desc`),
      rows,
      accent: '#7aa7ff',
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
      title: t(`upgrade.tome.${tome.type}`),
      iconSrc: tomeIconSrc(tome.type),
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
      title: relic.name,
      iconSrc: relicIconSrc(id),
      subtitle: `${t(`shrine.rarity.${relic.rarity}`)} · x${stacks}`,
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
          <div style="font-size:14px;font-weight:800;display:flex;align-items:center;gap:6px;${UI_PLAIN_TEXT_STYLE}">${iconImgHtml(bondIconSrc(bondId), 18)}<span>${escapeTooltipText(name)}</span></div>
          <div style="font-size:10px;color:${tierColor};font-weight:700;letter-spacing:0.4px;">${escapeTooltipText(tierName)} · T${tier}</div>
        </div>
      </div>
      <div style="${UI_PLAIN_TEXT_STYLE};font-size:10px;text-transform:uppercase;letter-spacing:0.5px;margin:6px 0 2px;">${escapeTooltipText(t('bond.weaponsLabel'))}</div>
      ${weaponRows}
      <div style="${UI_PLAIN_TEXT_STYLE};font-size:10px;text-transform:uppercase;letter-spacing:0.5px;margin:8px 0 0;">${escapeTooltipText(t('bond.effectsLabel'))}</div>
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
    const rows = lines.map(l => `<div style="${UI_PLAIN_TEXT_STYLE}">${escapeTooltipText(l)}</div>`).join('');
    return `<div style="${UI_PLAIN_TEXT_STYLE};font-weight:700;margin-bottom:2px;">${escapeTooltipText(header)}</div>${rows}`;
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

    // 按视口短边缩放，避免小屏伤害数字过大遮挡画面
    fontSize = uiPx(fontSize);

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

    if (this.lastNoticeStage === null) {
      this.lastNoticeStage = state.stage;
    } else if (state.stage !== this.lastNoticeStage) {
      this.lastNoticeStage = state.stage;
      if (state.stage === 2) {
        this.showMajorNotice(
          t('stage.notice.secondTitle'),
          t('stage.notice.secondBody'),
          '#ffcc00',
        );
      }
    }

    const isOvertime = state.overtimeSeconds > 0;
    if (isOvertime && !this.wasOvertime) {
      this.overtimeNoticeImg.src = overtimeNoticeImagePath();
      gsapAnimations.playOvertimeNotice(this.overtimeNoticeEl);
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
      font-family:"Lilita One","Noto Sans SC",Arial,sans-serif;box-sizing:border-box;
    `;

    const title = document.createElement('div');
    // boss banner：保留 accent glow + 黑色硬投影，再叠 2px 黑描边让 28–54px 大字在彩色背景里仍清晰。
    title.style.cssText = uiColoredTextBold(accentColor, `0 0 18px ${accentColor},0 3px 8px #000`)
      + 'font-size:clamp(28px,8vw,54px);font-weight:900;letter-spacing:2px;';
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
    this.upgradePanel.style.cssText = inGameChoiceOverlayStyle(
      'background:rgba(0,0,0,0.7);z-index:300;font-family:"Lilita One","Noto Sans SC",Arial,sans-serif;',
    );

    const centerGroup = createInGameChoiceCenterGroup();
    const title = document.createElement('div');
    title.style.cssText = uiColoredTextBold('#ffcc00') + 'font-size:clamp(20px,5.5vw,24px);font-weight:bold;margin-bottom:clamp(12px,3vh,20px);text-align:center;width:100%;';
    title.textContent = t('upgrade.title');
    centerGroup.appendChild(title);

    const cardRow = createInGameChoiceCardRow();
    const cardCount = Math.max(1, options.length);
    const upgradeCardWidth = cardCount > 1
      ? `min(180px,calc((100% - ${INGAME_REWARD_ROW_GAP} * ${cardCount - 1}) / ${cardCount}))`
      : 'min(180px,90vw)';

    for (const option of options) {
      const card = this.createUpgradeCard(option, player, upgradeCardWidth);
      cardRow.appendChild(card);
    }

    centerGroup.appendChild(cardRow);
    this.upgradePanel.appendChild(centerGroup);
    document.body.appendChild(this.upgradePanel);
    this.syncInGameTouchControlsEnabled();
  }

  private createUpgradeCard(option: UpgradeOption, player: GameState['player'], width = 'min(180px,90vw)'): HTMLDivElement {
    const isBond = option.kind === 'bond_activate' || option.kind === 'bond_upgrade';
    // 羁绊卡片用金色羁绊框，其余按稀有度取框
    const accentColor = isBond ? '#ffd633' : (RARITY_COLORS[option.rarity] ?? '#aaaaaa');
    const statValueColor = option.rarity === 'common' ? '#ffffff' : accentColor;
    const frameRarity: ItemFrameRarity = isBond ? 'bond' : (option.rarity as ItemFrameRarity);

    // 升级卡：banner（物品名）+ icon + 描述 + 内嵌数值面板 + 等级行 + 底部 tab（稀有度）
    const { card, iconSlot, descEl, statsBox, levelEl, rarityEl } = createUpgradeFrameCard({
      rarity: frameRarity,
      accentColor,
      title: this.getUpgradeName(option),
      width,
      interactive: true,
    });

    // Icon
    if (option.kind === 'new_weapon' || option.kind === 'weapon_upgrade') {
      const generic = option.kind === 'new_weapon' ? '⚔️' : '⬆️';
      const wt = option.weaponType;
      if (wt) setIconImage(iconSlot, weaponIconSrc(wt), WEAPON_ICONS[wt] ?? generic);
      else iconSlot.textContent = generic;
    } else if (option.kind === 'bond_activate' || option.kind === 'bond_upgrade') {
      if (option.bondId) setIconImage(iconSlot, bondIconSrc(option.bondId), BONDS[option.bondId].icon);
      else iconSlot.textContent = '🔗';
    } else {
      const tomeType = option.tomeType ?? option.passiveType;
      if (tomeType) setIconImage(iconSlot, tomeIconSrc(tomeType), TOME_ICONS[tomeType] ?? '📖');
      else iconSlot.textContent = '📖';
    }

    // Description
    descEl.textContent = this.getUpgradeDesc(option);
    const upgradeSteps = option.newLevel - option.currentLevel;
    if (!isBond && upgradeSteps > 1) {
      descEl.textContent = `${descEl.textContent} · ${t('upgrade.doubleLevel', { count: String(upgradeSteps) })}`;
    }

    // 数值预览（基础步进 × 稀有度 / 典籍每级增益）
    const previewLines = getUpgradePreviewLines(option, player);
    if (previewLines.length > 0) {
      for (const line of previewLines) {
        const key = line.labelKey.replace('upgrade.stat.', '');
        statsBox.appendChild(upgradeStatRow(t(`upgrade.stat.${key}`), line.value, statValueColor));
      }
    } else {
      // 无数值时给个占位，避免数值面板坍成空盒
      statsBox.style.display = 'none';
    }

    // 等级行（"等级 1 → 2"）位于数值面板与稀有度 tab 之间
    levelEl.textContent = t('upgrade.levelUp', { from: String(option.currentLevel), to: String(option.newLevel) });

    // 底部 tab：稀有度文案
    rarityEl.textContent = t(`shrine.rarity.${option.rarity}`);
    rarityEl.style.color = '#ffffff';

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
    this.syncInGameTouchControlsEnabled();
  }

  // ===========================================================================
  // Game Over
  // ===========================================================================

  private showGameOver(result: GameResult): void {
    if (this.gameOverPanel) return;
    this.cameraOrbit.setEnabled(false);

    const state = this.session.getRenderState();

    // Detect quests that newly reached completion this run (rewards must be claimed manually)
    const newQuests = checkQuestCompletion(this.questCompleteAtRunStart);

    // 布局参考暂停界面：左右侧栏 + 中间标题/数据/按钮。
    const sideW = PAUSE_SIDE_PANEL_WIDTH;
    const sideInset = uiPx(8);
    const centerHalf = uiPx(96);
    const sideGap = uiPx(14);
    const sideOffset = centerHalf + sideGap + sideW;

    const overlay = document.createElement('div');
    overlay.dataset.cameraBlock = 'true';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.84);display:flex;flex-direction:column;align-items:stretch;z-index:400;font-family:"Lilita One","Noto Sans SC",Arial,sans-serif;padding:max(8px,env(safe-area-inset-top)) max(8px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left));box-sizing:border-box;overflow:hidden;';
    this.installItemTooltipHandlers(overlay);

    const sideMaxH = `calc(100% - ${sideInset * 2}px)`;
    // 侧栏锚定屏幕上方：标题常驻顶部，内容从上往下排，不做垂直居中。
    const sidePos = `position:absolute;top:${sideInset}px;width:${sideW}px;max-width:calc(50% - ${centerHalf + sideGap}px - 4px);max-height:${sideMaxH};overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;`;

    // 左侧栏：背包（小框，样式与局内一致）。
    const leftWrap = document.createElement('div');
    leftWrap.className = UI_SCROLLBAR_TRANSPARENT_CLASS;
    leftWrap.style.cssText = `${sidePos}left:calc(50% - ${sideOffset}px);`;
    leftWrap.appendChild(this.buildPauseInventory(state, true));

    // 右侧栏：本局武器伤害排名。
    const rightWrap = document.createElement('div');
    rightWrap.className = UI_SCROLLBAR_TRANSPARENT_CLASS;
    rightWrap.style.cssText = `${sidePos}left:calc(50% + ${centerHalf + sideGap}px);`;
    rightWrap.appendChild(this.buildGameOverWeaponStats(state, result));

    // 中间：标题 + 数据 + 确定按钮。
    const centerGroup = document.createElement('div');
    centerGroup.className = UI_SCROLLBAR_TRANSPARENT_CLASS;
    centerGroup.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:clamp(6px,1.6vh,10px);z-index:1;pointer-events:auto;width:${uiPx(180)}px;max-width:min(48vw,${uiPx(220)}px);max-height:${sideMaxH};overflow-y:auto;overflow-x:hidden;`;

    const title = document.createElement('div');
    title.style.cssText = uiPlainText(`flex:0 0 auto;width:100%;text-align:center;font-size:clamp(${uiPx(26)}px,7vmin,${uiPx(40)}px);font-weight:bold;line-height:1.05;color:${result.victory ? '#ffcc00' : '#ff5555'};`);
    title.textContent = t('result.gameOverTitle');
    centerGroup.appendChild(title);

    const statsCol = document.createElement('div');
    statsCol.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:clamp(3px,0.9vh,6px);width:100%;';

    const totalSec = Math.floor(result.survivalTime);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    const timeStr = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;

    const lines = [
      t('result.time', { time: timeStr }),
      t('result.kills', { count: String(result.killCount) }),
      t('result.level', { level: String(result.level) }),
    ];
    for (const line of lines) {
      const el = document.createElement('div');
      el.style.cssText = uiPlainText(`font-size:clamp(${uiPx(11)}px,3vmin,${uiPx(14)}px);text-align:center;`);
      el.textContent = line;
      statsCol.appendChild(el);
    }

    // 银币：银币图标 +N 银币！
    const silverRow = document.createElement('div');
    silverRow.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:5px;margin-top:2px;flex-wrap:wrap;';
    silverRow.appendChild(createSilverBadge(result.silverEarned, '+'));
    const silverSuffix = document.createElement('span');
    silverSuffix.style.cssText = uiPlainText(`font-size:clamp(${uiPx(11)}px,3vmin,${uiPx(14)}px);font-weight:bold;`);
    silverSuffix.textContent = t('result.silverSuffix');
    silverRow.appendChild(silverSuffix);
    statsCol.appendChild(silverRow);

    centerGroup.appendChild(statsCol);

    // 本局新完成的任务（奖励需手动领取）保留提示。
    if (newQuests.length > 0) {
      const questHeader = document.createElement('div');
      questHeader.style.cssText = uiPlainText(`color:#ffcc00;font-size:clamp(${uiPx(10)}px,2.6vmin,${uiPx(12)}px);font-weight:bold;text-align:center;margin-top:4px;`);
      questHeader.textContent = t('quest.ready_to_claim');
      centerGroup.appendChild(questHeader);

      for (const qId of newQuests) {
        const quest = QUESTS.find(q => q.id === qId);
        if (!quest) continue;
        const el = document.createElement('div');
        el.style.cssText = uiPlainText(`color:#88ff88;font-size:clamp(${uiPx(9)}px,2.4vmin,${uiPx(11)}px);text-align:center;`);
        el.textContent = t(quest.description);
        centerGroup.appendChild(el);
      }
    }

    const confirmBtn = createPauseMenuButton(
      t('result.confirm'),
      PAUSE_MENU_BUTTON_GREEN,
      PAUSE_MENU_BUTTON_GREEN_PRESSED,
      () => {
        this.hideGameOver();
        this.destroy();
        showMainMenu();
      },
    );
    confirmBtn.style.marginTop = `${uiPx(6)}px`;
    centerGroup.appendChild(confirmBtn);

    overlay.appendChild(leftWrap);
    overlay.appendChild(rightWrap);
    overlay.appendChild(centerGroup);

    this.gameOverPanel = overlay;
    document.body.appendChild(overlay);
    this.syncInGameTouchControlsEnabled();
  }

  /** 游戏结束右侧栏：本局武器伤害排名（按伤害降序，第一名标 MVP）。 */
  private buildGameOverWeaponStats(state: GameState, result: GameResult): HTMLDivElement {
    const { panel, content } = createPauseDataPanel(t('result.damageTitle'), '#ff9a6a');

    const stats = [...(result.weaponDamageStats ?? [])]
      .sort((a, b) => (b.totalDamage - a.totalDamage) || (b.killCount - a.killCount));

    const levelByType = new Map<WeaponState['type'], number>();
    for (const w of state.player.weapons) levelByType.set(w.type, w.level);

    const cellFont = `clamp(${uiPx(8)}px,2.2vmin,${uiPx(10)}px)`;

    if (stats.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = uiPlainText(`font-size:clamp(${uiPx(9)}px,2.4vmin,${uiPx(11)}px);opacity:0.7;text-align:center;padding:6px 0;`);
      empty.textContent = t('pause.empty');
      content.appendChild(empty);
      return panel;
    }

    // 单一 grid 承载表头 + 所有数据行，保证各列轨道一致 —— 数值左端与表头左端严格对齐。
    const table = document.createElement('div');
    table.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;column-gap:clamp(6px,1.8vmin,10px);row-gap:0;align-items:center;width:100%;';

    // 表头四列（统一左对齐）。
    const headerTexts = [t('result.colSource'), t('result.colLevel'), t('result.colDamage'), t('result.colKills')];
    headerTexts.forEach((text) => {
      const c = document.createElement('span');
      c.style.cssText = uiPlainText(`font-size:${cellFont};font-weight:bold;opacity:0.85;text-align:left;white-space:nowrap;padding:1px 0 3px;border-bottom:1px solid rgba(255,255,255,0.18);`);
      c.textContent = text;
      table.appendChild(c);
    });

    const cellPad = 'padding:3px 0;';
    stats.forEach((stat, idx) => {
      const isMvp = idx === 0;
      const rowBg = isMvp ? 'background:rgba(255,200,40,0.13);' : '';

      // 来源列：图标 + 名称（+ MVP）。
      const source = document.createElement('div');
      source.style.cssText = `display:flex;align-items:center;gap:4px;min-width:0;${cellPad}${rowBg}`;
      const icon = document.createElement('span');
      icon.style.cssText = `width:clamp(${uiPx(14)}px,3.6vmin,${uiPx(18)}px);height:clamp(${uiPx(14)}px,3.6vmin,${uiPx(18)}px);flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;line-height:1;`;
      setIconImage(icon, weaponIconSrc(stat.weaponType), WEAPON_ICONS[stat.weaponType] ?? '?');
      source.appendChild(icon);
      const name = document.createElement('span');
      name.style.cssText = uiPlainText(`min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:${cellFont};font-weight:bold;color:${isMvp ? '#ffd700' : '#f3f3ff'};`);
      name.textContent = t(`upgrade.weapon.${stat.weaponType}`);
      source.appendChild(name);
      if (isMvp) {
        const mvp = document.createElement('span');
        mvp.style.cssText = uiPlainText(`flex-shrink:0;font-size:clamp(${uiPx(7)}px,2vmin,${uiPx(9)}px);font-weight:bold;color:#ffd700;`);
        mvp.textContent = t('result.mvp');
        source.appendChild(mvp);
      }
      table.appendChild(source);

      const lv = levelByType.get(stat.weaponType);
      const level = document.createElement('span');
      level.style.cssText = uiPlainText(`text-align:left;font-size:${cellFont};font-variant-numeric:tabular-nums;white-space:nowrap;${cellPad}${rowBg}`);
      level.textContent = lv != null ? `Lv.${lv}` : '-';
      table.appendChild(level);

      const dmg = document.createElement('span');
      dmg.style.cssText = uiPlainText(`text-align:left;font-size:${cellFont};font-variant-numeric:tabular-nums;white-space:nowrap;color:${isMvp ? '#ffd700' : '#f3f3ff'};${cellPad}${rowBg}`);
      dmg.textContent = this.formatGmDamageNumber(stat.totalDamage, 0);
      table.appendChild(dmg);

      const kills = document.createElement('span');
      kills.style.cssText = uiPlainText(`text-align:left;font-size:${cellFont};font-variant-numeric:tabular-nums;white-space:nowrap;${cellPad}${rowBg}`);
      kills.textContent = String(stat.killCount);
      table.appendChild(kills);
    });

    content.appendChild(table);

    return panel;
  }

  private hideGameOver(): void {
    this.gameOverPanel?.remove();
    this.gameOverPanel = null;
    this.cameraOrbit.setEnabled(true);
    this.syncInGameTouchControlsEnabled();
  }

  /** 全屏模态打开时禁用摇杆与跳跃/开宝箱按钮。 */
  private syncInGameTouchControlsEnabled(): void {
    const modalOpen = Boolean(
      this.upgradePanel ||
      this.shrinePanel ||
      this.chestRewardPanel ||
      this.gameOverPanel ||
      this.pausePanel,
    );
    setInGameTouchControlsEnabled(!modalOpen, this.platformInput.getMobileInput());
  }

  // ===========================================================================
  // Pause
  // ===========================================================================

  /**
   * 局内主线任务条显隐判定：
   * - 完成条件：任意祭坛 phase 为 `portal_ready`（Boss 已死、传送门可用）或 `portal_used`（玩家已进入传送门）。
   * - 满足后播放「右弹 → 左滑出屏」动画，动画结束后隐藏任务条。
   * - 若祭坛被重置（如进入下一难度 tier 后 altars 回到 ready），任务条重新显示。
   */
  private updateQuestHudTrack(state: GameState): void {
    const bossDefeated = state.altars.some(
      a => a.phase === 'portal_ready' || a.phase === 'portal_used',
    );

    if (!bossDefeated) {
      if (this.questHudDismissStarted) {
        gsapAnimations.resetQuestTrackHud(this.questRow);
        this.questHudDismissStarted = false;
        this.questRow.style.visibility = 'visible';
      }
      return;
    }

    if (this.questHudDismissStarted) return;

    this.questHudDismissStarted = true;
    gsapAnimations.animateQuestTrackDismiss(this.questRow, () => {
      this.questRow.style.visibility = 'hidden';
    });
  }

  private resetQuestHudTrack(): void {
    gsapAnimations.resetQuestTrackHud(this.questRow);
    this.questHudDismissStarted = false;
    this.questRow.style.visibility = 'visible';
  }

  private setHudPauseButtonVisual(paused: boolean): void {
    this.pauseBtnIcon.src = paused ? HUD_RESUME_BUTTON_NORMAL : HUD_PAUSE_BUTTON_NORMAL;
  }

  private togglePause(): void {
    if (this.isPaused) {
      this.resumeGame();
    } else {
      this.session.pause();
      this.isPaused = true;
      this.setHudPauseButtonVisual(true);
      this.cameraOrbit.setEnabled(false);
      this.showPauseMenu();
    }
  }

  /** 关闭暂停菜单并继续游戏。 */
  private resumeGame(): void {
    this.hidePauseMenu();
    this.session.resume();
    this.isPaused = false;
    this.setHudPauseButtonVisual(false);
    this.cameraOrbit.setEnabled(true);
    this.syncInGameTouchControlsEnabled();
  }

  private hidePauseMenu(): void {
    this.pausePanel?.remove();
    this.pausePanel = null;
    this.hideItemTooltip();
    this.syncInGameTouchControlsEnabled();
  }

  /**
   * 暂停弹窗：左侧背包（武器 / 典籍 / 遗物），右侧人物属性，中间操作按钮。
   * 左右侧栏靠中间对称排列，内容不足时垂直居中，溢出后可滚动。
   */
  private showPauseMenu(): void {
    if (this.pausePanel) return;

    const state = this.session.getRenderState();
    const sideW = PAUSE_SIDE_PANEL_WIDTH;
    const sideInset = uiPx(8);
    const centerHalf = uiPx(72);
    const sideGap = uiPx(14);
    const sideOffset = centerHalf + sideGap + sideW;

    const overlay = document.createElement('div');
    overlay.dataset.cameraBlock = 'true';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.84);display:flex;flex-direction:column;align-items:stretch;z-index:420;font-family:"Lilita One","Noto Sans SC",Arial,sans-serif;padding:max(8px,env(safe-area-inset-top)) max(8px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left));box-sizing:border-box;overflow:hidden;';
    this.installItemTooltipHandlers(overlay);

    const sideMaxH = `calc(100% - ${sideInset * 2}px)`;
    const sidePos = `position:absolute;top:50%;transform:translateY(-50%);width:${sideW}px;max-width:calc(50% - ${centerHalf + sideGap}px - 4px);max-height:${sideMaxH};overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;align-items:stretch;`;

    const leftWrap = document.createElement('div');
    leftWrap.className = UI_SCROLLBAR_TRANSPARENT_CLASS;
    leftWrap.style.cssText = `${sidePos}left:calc(50% - ${sideOffset}px);`;
    leftWrap.appendChild(this.buildPauseInventory(state));

    const rightWrap = document.createElement('div');
    rightWrap.className = UI_SCROLLBAR_TRANSPARENT_CLASS;
    rightWrap.style.cssText = `${sidePos}left:calc(50% + ${centerHalf + sideGap}px);`;
    rightWrap.appendChild(this.buildPauseStats(state));

    const centerGroup = document.createElement('div');
    centerGroup.dataset.pauseCenter = 'true';
    centerGroup.style.cssText = `position:absolute;left:50%;top:calc(50% - ${uiPx(14)}px);transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:clamp(4px,1vh,8px);z-index:1;pointer-events:auto;width:${uiPx(120)}px;max-width:min(36vw,${uiPx(140)}px);`;

    const title = document.createElement('div');
    title.style.cssText = uiPlainText(`flex:0 0 auto;width:100%;text-align:center;font-size:clamp(${uiPx(32)}px,8vmin,${uiPx(46)}px);font-weight:bold;line-height:1.05;padding:0;transform:translateY(-${uiPx(6)}px);`);
    title.textContent = t('pause.title');
    centerGroup.appendChild(title);

    const buttonStack = document.createElement('div');
    buttonStack.style.cssText = 'display:flex;flex-direction:column;align-items:center;width:100%;gap:clamp(4px,1vh,6px);';
    buttonStack.appendChild(createPauseMenuButton(t('pause.resume'), PAUSE_MENU_BUTTON_GREEN, PAUSE_MENU_BUTTON_GREEN_PRESSED, () => this.resumeGame()));
    buttonStack.appendChild(createPauseMenuButton(t('pause.restart'), PAUSE_MENU_BUTTON_GRAY, PAUSE_MENU_BUTTON_GRAY_PRESSED, () => this.showRestartConfirm(overlay)));
    buttonStack.appendChild(createPauseMenuButton(t('pause.exit'), PAUSE_MENU_BUTTON_RED, PAUSE_MENU_BUTTON_RED_PRESSED, () => this.showExitConfirm(overlay)));
    centerGroup.appendChild(buttonStack);

    overlay.appendChild(leftWrap);
    overlay.appendChild(rightWrap);
    overlay.appendChild(centerGroup);

    this.pausePanel = overlay;
    document.body.appendChild(overlay);
    this.syncInGameTouchControlsEnabled();
  }

  /** 暂停面板左侧：背包（武器 / 典籍 / 遗物，均为本局获得）。compact=true 时使用与局内一致的小槽位。 */
  private buildPauseInventory(state: GameState, compact = false): HTMLDivElement {
    const p = state.player;
    const { panel, content } = createPauseDataPanel(t('pause.inventory'), '#ffd97a');

    content.appendChild(this.buildPauseItemSection(
      t('pause.weapons'),
      p.weapons.map(w => ({
        icon: WEAPON_ICONS[w.type] ?? '?',
        iconSrc: weaponIconSrc(w.type),
        name: t(`upgrade.weapon.${w.type}`),
        inner: `Lv.${w.level}`,
        accent: '#7aa7ff',
        tooltipHtml: this.createWeaponTooltipHtml(w),
      })),
      Math.max(1, p.activeWeaponSlots ?? 2),
      compact,
    ));

    content.appendChild(this.buildPauseItemSection(
      t('pause.tomes'),
      p.tomes.map(tm => ({
        icon: TOME_ICONS[tm.type] ?? '📖',
        iconSrc: tomeIconSrc(tm.type),
        name: t(`upgrade.tome.${tm.type}`),
        inner: `Lv.${tm.level}`,
        accent: TOME_COLORS[tm.type] ?? '#aa88ff',
        tooltipHtml: this.createTomeTooltipHtml(tm),
      })),
      1,
      compact,
    ));

    const relics = (Object.entries(p.relicStacks ?? {}) as Array<[RelicId, number]>)
      .filter(([id, count]) => count > 0 && RELICS[id]);
    content.appendChild(this.buildPauseItemSection(
      t('pause.relics'),
      relics.map(([id, count]) => ({
        icon: RELICS[id].emoji,
        iconSrc: relicIconSrc(id),
        name: RELICS[id].name,
        inner: `x${count}`,
        accent: RARITY_COLORS[RELICS[id].rarity] ?? '#aaaaaa',
        tooltipHtml: this.createRelicTooltipHtml(id, count, state),
      })),
      1,
      compact,
    ));

    content.appendChild(this.buildPauseItemSection(
      t('pause.bonds'),
      (p.bonds ?? []).map(bond => ({
        icon: BONDS[bond.bondId]?.icon ?? '✦',
        iconSrc: bondIconSrc(bond.bondId),
        name: t(`bond.${bond.bondId}.name`),
        inner: `T${bond.tier}`,
        accent: BOND_TIER_COLORS[bond.tier] ?? BOND_TIER_COLORS[1],
        tooltipHtml: this.createBondTooltipHtml(bond.bondId, bond.tier, state),
      })),
      1,
      compact,
    ));

    return panel;
  }

  /**
   * 背包内一个分组（武器 / 典籍 / 遗物）：标题 + 槽位流式排列。
   * 每个槽位与局内一致：单独图标，图标内部下方显示等级（Lv.N）/层数（xN），图标下方再显示名字。
   * 该分组暂无物品时显示空占位格，不显示「暂无」文案。
   */
  private buildPauseEmptySlotCell(compact = false): HTMLDivElement {
    const cellW = compact ? `clamp(${uiPx(44)}px,12vmin,${uiPx(58)}px)` : `clamp(${uiPx(34)}px,9vmin,${uiPx(40)}px)`;
    const boxSize = compact ? HUD_WEAPON_SLOT_SIZE : `clamp(${uiPx(32)}px,8.5vmin,${uiPx(38)}px)`;

    const cell = document.createElement('div');
    cell.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:2px;width:${cellW};`;

    const box = document.createElement('div');
    box.style.cssText = compact
      ? `width:${boxSize};height:${boxSize};background:rgba(0,0,0,0.4);flex-shrink:0;box-sizing:border-box;`
      : `width:${boxSize};height:${boxSize};background:rgba(0,0,0,0.32);border:1px dashed rgba(255,255,255,0.16);border-radius:6px;flex-shrink:0;box-sizing:border-box;`;
    cell.appendChild(box);

    const nameSpacer = document.createElement('span');
    nameSpacer.style.cssText = `width:100%;height:clamp(${uiPx(9)}px,2.5vmin,${uiPx(11)}px);flex-shrink:0;`;
    cell.appendChild(nameSpacer);

    return cell;
  }

  private buildPauseItemSection(
    titleText: string,
    items: Array<{ icon: string; iconSrc?: string; name: string; inner: string; accent: string; tooltipHtml?: string }>,
    emptySlotCount = 1,
    compact = false,
  ): HTMLDivElement {
    // compact：框保持局内大小，但列加宽给单行名称留出空间。
    const cellW = compact ? `clamp(${uiPx(44)}px,12vmin,${uiPx(58)}px)` : `clamp(${uiPx(34)}px,9vmin,${uiPx(40)}px)`;
    const boxSize = compact ? HUD_WEAPON_SLOT_SIZE : `clamp(${uiPx(32)}px,8.5vmin,${uiPx(38)}px)`;
    const iconFont = compact ? 'clamp(10px,2.8vw,12px)' : `clamp(${uiPx(13)}px,3.6vmin,${uiPx(17)}px)`;

    const section = document.createElement('div');
    section.style.cssText = 'display:flex;flex-direction:column;gap:4px;';

    const label = document.createElement('div');
    label.style.cssText = uiPlainText(`font-size:clamp(${uiPx(9)}px,2.4vmin,${uiPx(11)}px);font-weight:bold;opacity:0.85;`);
    label.textContent = titleText;
    section.appendChild(label);

    const row = document.createElement('div');
    row.style.cssText = `display:flex;flex-wrap:wrap;gap:clamp(4px,1.2vmin,${compact ? 6 : 8}px);`;

    if (items.length === 0) {
      const slots = Math.max(1, emptySlotCount);
      for (let i = 0; i < slots; i++) {
        row.appendChild(this.buildPauseEmptySlotCell(compact));
      }
    } else {
      for (const it of items) {
        const cell = document.createElement('div');
        cell.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:2px;width:${cellW};cursor:help;touch-action:manipulation;`;
        if (it.tooltipHtml) {
          this.setItemTooltip(cell, it.tooltipHtml);
        }

        const box = document.createElement('div');
        box.style.cssText = compact
          ? `position:relative;width:${boxSize};height:${boxSize};background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;flex-shrink:0;box-sizing:border-box;`
          : `position:relative;width:${boxSize};height:${boxSize};background:rgba(0,0,0,0.55);border:1.5px solid ${it.accent};border-radius:6px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 6px ${it.accent}40;box-sizing:border-box;`;
        const icon = document.createElement('span');
        icon.style.cssText = `font-size:${iconFont};line-height:1;`;
        if (it.iconSrc) setIconImage(icon, it.iconSrc, it.icon);
        else icon.textContent = it.icon;
        box.appendChild(icon);
        const inner = document.createElement('span');
        inner.style.cssText = uiPlainText(
          compact
            ? 'position:absolute;bottom:1px;left:0;right:0;text-align:center;font-size:7px;line-height:1;font-weight:bold;pointer-events:none;'
            : `position:absolute;bottom:-1px;left:0;right:0;text-align:center;font-size:${uiPx(7)}px;font-weight:bold;`,
        );
        inner.textContent = it.inner;
        box.appendChild(inner);
        cell.appendChild(box);

        const name = document.createElement('span');
        name.style.cssText = uiPlainText(
          compact
            ? `width:auto;max-width:none;text-align:center;font-size:clamp(${uiPx(6)}px,1.6vmin,${uiPx(8)}px);line-height:1.1;white-space:nowrap;overflow:visible;margin-top:3px;`
            : `width:100%;text-align:center;font-size:clamp(${uiPx(7)}px,2vmin,${uiPx(9)}px);line-height:1.15;word-break:break-word;`,
        );
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
    const { panel, content } = createPauseDataPanel(t('pause.attributes'), '#7affc0');

    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const num1 = (v: number) => formatTooltipNumber(v, 1);
    // 与局内一致：典籍强度按 growth（缺省退回升级次数 level）。
    const tomePower = (type: string): number => {
      const tm = p.tomes.find(t => t.type === type);
      if (!tm) return 0;
      return tm.growth ?? tm.level;
    };

    const xpMult = (1 + tomePower('xp_gain_tome') * 0.15) * (1 + (p.characterTraitXpBonus ?? 0));
    const luckLevel = Math.round(tomePower('luck_tome')) + Math.floor((p.luckBonus ?? 0) * 100);
    const thorns = Math.round(tomePower('thorns_tome') * 3);

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
      [t('pause.attr.xpGain'), `${xpMult.toFixed(2)}x`],
      [t('pause.attr.luck'), String(luckLevel)],
      [t('pause.attr.difficulty'), `${Math.round((p.difficultyMult ?? 1) * 100)}%`],
      [t('pause.attr.lifesteal'), `${Math.round((p.lifestealPct ?? 0) * 100)}%`],
      [t('pause.attr.thorns'), String(thorns)],
      [t('pause.attr.jumpHeight'), (p.jumpHeightMult ?? 1).toFixed(1)],
    ];

    for (const [labelText, valueText] of rows) {
      const r = document.createElement('div');
      r.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:4px;padding:1px 2px;border-bottom:1px solid rgba(255,255,255,0.1);';
      const l = document.createElement('span');
      l.style.cssText = uiPlainText(`font-size:clamp(${uiPx(9)}px,2.4vmin,${uiPx(11)}px);`);
      l.textContent = labelText;
      const v = document.createElement('span');
      v.style.cssText = uiPlainText(`font-size:clamp(${uiPx(9)}px,2.4vmin,${uiPx(12)}px);font-weight:bold;font-variant-numeric:tabular-nums;white-space:nowrap;`);
      v.textContent = valueText;
      r.appendChild(l);
      r.appendChild(v);
      content.appendChild(r);
    }

    return panel;
  }

  /** 重新开始：清空所有游戏状态，重开本局。 */
  private restartGame(): void {
    this.hidePauseMenu();
    this.isPaused = false;
    this.setHudPauseButtonVisual(false);
    this.resetQuestHudTrack();
    this.cameraOrbit.setEnabled(true);
    this.lastNoticeTier = null;
    this.lastNoticeStage = null;
    this.wasOvertime = false;
    this.wasFinalSwarm = false;
    this.lowHealthOverlay?.remove();
    this.lowHealthOverlay = null;
    gsapAnimations.cancelOvertimeNotice(this.overtimeNoticeEl);
    gsapAnimations.cancelFinalSwarmNotice(this.finalSwarmNoticeEl);
    this.session.restart();
  }

  /** 重新开始二级确认弹窗：取消 / 确定。 */
  private showRestartConfirm(parent: HTMLElement): void {
    const restore = this.hidePauseCenterGroup(parent);
    createPauseConfirmDialog(
      parent,
      t('pause.confirmRestartMessage'),
      t('pause.confirm'),
      () => this.restartGame(),
      restore,
    );
  }

  /** 退出二级确认弹窗：取消 / 退出（不结算奖励，回主菜单）。 */
  private showExitConfirm(parent: HTMLElement): void {
    const restore = this.hidePauseCenterGroup(parent);
    createPauseConfirmDialog(
      parent,
      t('pause.confirmExitMessage'),
      t('pause.exit'),
      () => {
        this.hidePauseMenu();
        this.destroy();
        showMainMenu();
      },
      restore,
    );
  }

  /** 隐藏暂停界面中间标题/按钮，返回恢复函数。 */
  private hidePauseCenterGroup(parent: HTMLElement): () => void {
    const center = parent.querySelector<HTMLElement>('[data-pause-center]');
    if (center) center.style.visibility = 'hidden';
    return () => {
      if (center) center.style.visibility = '';
    };
  }

  setTierBadge(tier: DifficultyTier): void {
    const color = TIER_COLORS[tier] ?? '#aaa';
    this.tierBadge.textContent = t(`tier.${tier}`);
    this.tierBadge.style.borderColor = color;
    this.tierBadge.style.color = color;
    this.tierBadge.style.textShadow = UI_TEXT_OUTLINE_SHADOW;
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

function getUnlockedCharacters(): Set<CharacterType> {
  return new Set(loadSave().charactersUnlocked as CharacterType[]);
}

function isCharacterUnlocked(char: CharacterType): boolean {
  return getUnlockedCharacters().has(char);
}

function ensureSelectableCharacter(): void {
  if (!isCharacterUnlocked(selectedCharacter)) {
    selectedCharacter = 'megachad';
  }
}

const PREP_SCREEN_STYLE = `
  position:fixed;top:0;left:0;width:100%;height:100%;box-sizing:border-box;
  z-index:550;font-family:"Lilita One","Noto Sans SC",Arial,sans-serif;  background:#0a0a1a url(${UI_COMMON_BG_PATH}) center center/cover no-repeat;
  padding-top:env(safe-area-inset-top,0px);
  padding-bottom:env(safe-area-inset-bottom,0px);
  padding-left:env(safe-area-inset-left,0px);
  padding-right:env(safe-area-inset-right,0px);
`;

const PREP_SCREEN_HEADER_STYLE = `
  display:flex;align-items:center;justify-content:space-between;width:100%;flex-shrink:0;
  padding:0 12px 4px 0;box-sizing:border-box;z-index:2;
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
  // 红丝带形 SVG 的画布是 837×188，但实际可见图形（红丝带 + 黑色阴影）只覆盖 viewBox 左侧的
  // x∈[0, ~637]，右侧 ~24% 是透明空白（Figma 切图遗留）。如果让按钮按 SVG 自然宽渲染，
  // 标题会被这片透明空白往右顶 ~47px，看起来"和红丝带隔得很远"。
  // 这里把按钮盒子宽高比锁到"可见部分"的 637:188，再用 overflow:hidden 把 img 自然宽溢出
  // 的透明右段裁掉，从而让标题（leftGroup 里 6px gap 之后的 span）紧贴红丝带末端。
  // - margin/padding 全部清零 + header `padding-left:0` → 红丝带最左像素贴屏幕左边缘
  // - transform-origin:left center → hover 缩放时丝带头部不会从屏幕边缘拉开
  backBtn.style.cssText = `
    height:44px;aspect-ratio:637/188;padding:0;margin:0;border:none;background:transparent;cursor:pointer;
    touch-action:manipulation;display:flex;align-items:center;justify-content:flex-start;flex-shrink:0;
    overflow:hidden;transform-origin:left center;transition:transform 0.15s;
  `;
  const backImg = document.createElement('img');
  backImg.src = CHARACTER_SELECT_BACK_ICON;
  backImg.alt = '';
  backImg.draggable = false;
  // 图片按 SVG 自然 837:188 比例渲染（≈ 196px 宽 @44px 高），右侧透明 ~47px 由按钮盒
  // overflow:hidden 裁掉。不能给 img 设 width:100%，那会把 SVG 横向压扁。
  backImg.style.cssText = 'height:100%;width:auto;display:block;pointer-events:none;flex-shrink:0;';
  backBtn.appendChild(backImg);
  backBtn.addEventListener('mouseenter', () => { backBtn.style.transform = 'scale(1.05)'; });
  backBtn.addEventListener('mouseleave', () => { backBtn.style.transform = 'scale(1)'; });
  backBtn.addEventListener('click', onClick);
  return backBtn;
}

function createPrepScreenHeader(
  title: string,
  onBack: () => void,
  rightContent: HTMLElement,
): HTMLElement {
  const header = document.createElement('header');
  header.style.cssText = PREP_SCREEN_HEADER_STYLE;

  // 标题直接叠在红丝带的宽阔上半段（"丝带 logo"风），不再做 flex 行内排版。
  // - 标题 append 到 backBtn 内部（而不是 leftGroup 同级），这样 backBtn 在 hover 时的
  //   `transform:scale(1.05)` 会带着标题一起缩放，丝带和文字同步放大。
  // - backBtn 需要 position:relative 给 absolute 子元素提供坐标系（默认 button 是 static）。
  // - 定位按红丝带的几何：箭头末端 ~28px，丝带顶部 y≈5 处最宽；2 字标题 14px ≈ 28px 宽，
  //   起点 34 + 文字 28 = 62px，远小于丝带顶端可容纳的 ~135px。
  // - pointer-events:none → 文字不挡住 back 的 click / hover 检测，整条丝带都能点。
  // - 白字 + 黑色描边阴影，保证盖在红底（#CD4040）上仍清晰。
  const backBtn = createPrepBackButton(onBack);
  backBtn.style.position = 'relative';

  const titleEl = document.createElement('span');
  // 描边走 textStyle.uiPlainTextBold（2px 8 向 + 底投影），项目里大字号标题统一用这套。
  titleEl.style.cssText = uiPlainTextBold(
    'position:absolute;left:50px;top:7px;pointer-events:none;'
    + 'font-weight:bold;font-size:24px;line-height:1;letter-spacing:0.04em;white-space:nowrap;',
  );
  titleEl.textContent = title;
  backBtn.appendChild(titleEl);
  header.appendChild(backBtn);

  header.appendChild(rightContent);
  return header;
}

const SHOP_OVERLAY_STYLE = `
  position:fixed;top:0;left:0;width:100%;height:100%;box-sizing:border-box;
  background:#1a2332 url(${SHOP_QUEST_PAGE_BG_IMAGE}) center center/cover no-repeat;
  display:flex;flex-direction:column;
  z-index:600;font-family:"Lilita One","Noto Sans SC",Arial,sans-serif;  padding-top:env(safe-area-inset-top,0px);
  padding-bottom:env(safe-area-inset-bottom,0px);
  padding-left:env(safe-area-inset-left,0px);
  padding-right:env(safe-area-inset-right,0px);
`;

const QUESTS_OVERLAY_STYLE = `
  position:fixed;top:0;left:0;width:100%;height:100%;box-sizing:border-box;
  background:#1a2332 url(${SHOP_QUEST_PAGE_BG_IMAGE}) center center/cover no-repeat;
  display:flex;flex-direction:column;
  z-index:600;font-family:"Lilita One","Noto Sans SC",Arial,sans-serif;  padding-top:env(safe-area-inset-top,0px);
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
  const bodyArea = card?.querySelector('[data-region="detail-body"]') as HTMLElement | null;
  const scaleOuter = card?.querySelector('[data-region="detail-scale"]') as HTMLElement | null;
  const contentWrap = card?.querySelector('[data-region="detail-content"]') as HTMLElement | null;
  const confirmSection = card?.querySelector('[data-region="detail-confirm"]') as HTMLElement | null;
  if (!stage || !host || !card || !bodyArea || !scaleOuter || !contentWrap || !confirmSection) return;

  const stageHeight = stage.getBoundingClientRect().height;
  if (stageHeight <= 0) return;

  // **布局策略**（按 target 视觉调）：
  // - card 始终撑满 host 宽度（filling），高度按 SVG AR 反推，使 card 在 detail
  //   面板里"顶天立地"；不再被 preview 立绘的高度卡住。
  // - 若反推高度 > stage 视觉高度，**让 detail 面板自己长高**（host.height 跟着
  //   card.height 走），stage 的 overflow-y:auto 会处理滚动兜底。
  //
  // 之前的 contain 逻辑（card 高度 = stageHeight，宽度 = stageHeight × AR）会在
  // 横屏窄高比设备上把 card 缩成 ~280×400，detail 容器明明有 400px 宽却空出两侧。
  const hostWidth = host.clientWidth;
  if (hostWidth <= 0) return;
  const cardAR = CHARACTER_DETAIL_PANEL_SIZE.w / CHARACTER_DETAIL_PANEL_SIZE.h;

  // card 高度 = host 宽 / AR；但不能高到完全脱出视口，cap 在 viewport - header 余量内，
  // 否则横屏窄高比设备上"确认"按钮要滚很远才能看到。被 cap 后宽度按 AR 反向缩。
  const maxCardH = Math.max(stageHeight, window.innerHeight - 80);
  let cardW = hostWidth;
  let cardH = hostWidth / cardAR;
  if (cardH > maxCardH) {
    cardH = maxCardH;
    cardW = maxCardH * cardAR;
  }

  host.style.height = `${Math.round(Math.max(cardH, stageHeight))}px`;
  host.style.overflow = 'hidden';
  host.style.alignItems = 'center';
  host.style.justifyContent = 'flex-start';

  card.style.width = `${Math.round(cardW)}px`;
  card.style.height = `${Math.round(cardH)}px`;
  card.style.maxWidth = '100%';
  card.style.maxHeight = 'none';
  card.style.flex = '0 0 auto';

  contentWrap.style.transform = 'none';
  contentWrap.style.width = '100%';
  contentWrap.style.maxWidth = '100%';

  // 新布局下 scaleOuter 是 bodyArea 里固定百分比的"顶段"，必须按它的真实高度
  // 来算溢出缩放——不能再用 (bodyArea − confirmSection) 当 available（那会把
  // weaponSpacer 的空间也算进去，导致内容溢出到武器槽上）。
  const available = scaleOuter.clientHeight;
  const contentHeight = contentWrap.scrollHeight;

  if (available > 0 && contentHeight > available + 0.5) {
    const scale = available / contentHeight;
    contentWrap.style.transformOrigin = 'top center';
    contentWrap.style.transform = `scale(${scale})`;
    contentWrap.style.width = `${(100 / scale).toFixed(4)}%`;
    contentWrap.style.maxWidth = `${(100 / scale).toFixed(4)}%`;
  }
}

function syncCharacterSelectBodyLayout(): void {
  const body = characterSelectBodyEl;
  if (!body) return;

  // 仅竖屏窄屏（宽 < 480）纵向堆叠；其余（含横屏手机）一律横向排版，并把整块限制在
  // 视口高度内（min(设计高,100%)），让立绘 + 详情面板一屏放下、不被推到下方、确认按钮不溢出。
  const narrow = isUiNarrow();
  const useRow = !narrow;
  body.style.flexDirection = useRow ? 'row' : 'column';
  body.style.alignItems = 'stretch';
  body.style.gap = useRow ? '8px' : '12px';
  if (useRow) {
    // body 横向放开（不再被 860 上限卡住），detail 才能拿到更大的 flex 份额；
    // 高度仍按 PREP_STAGE_HEIGHT 限定，让 preview 立绘的 height:100% 有具体值。
    // detail 通过 align-self:flex-start + 自身 content 高度突破 body 高度限制
    // （card 高度 = host 宽 / SVG AR，可显著大于 body 高），stage 的 overflow-y:auto
    // 兜底滚动。
    body.style.width = '100%';
    body.style.height = `min(${PREP_STAGE_HEIGHT}px,100%)`;
    body.style.maxHeight = '100%';
  } else {
    body.style.width = '100%';
    body.style.height = 'auto';
    body.style.maxHeight = 'none';
  }

  const rail = body.querySelector('[data-region="rail"]') as HTMLElement | null;
  if (rail) {
    rail.style.flexDirection = useRow ? 'column' : 'row';
    rail.style.width = useRow ? '' : '100%';
    rail.style.justifyContent = useRow ? '' : 'center';
    rail.style.alignSelf = useRow ? 'flex-start' : 'center';
  }

  const center = body.querySelector('[data-region="center"]') as HTMLElement | null;
  if (center) {
    center.style.flex = useRow ? '1 1 52%' : '1 1 auto';
    center.style.minHeight = useRow ? '0' : 'clamp(160px,38vw,220px)';
    center.style.width = useRow ? '' : '100%';
  }

  const detail = body.querySelector('[data-region="detail"]') as HTMLElement | null;
  if (detail) {
    detail.style.minWidth = useRow ? '240px' : '0';
    detail.style.maxWidth = useRow ? '460px' : '100%';
    detail.style.flex = useRow ? '1 1 44%' : '1 1 auto';
    detail.style.width = useRow ? 'auto' : '100%';
    // 关键：横屏排版下 detail **不**被 body 的 align-items:stretch 拉成 body 高度。
    // 让 detail 自然取 detailInner 的内容高（card 按 host 宽度 / SVG AR 算出来的高
    // 可能超过 stage），这样 card 才能撑满 detail 宽度而不是被高度反向卡瘦。
    detail.style.alignSelf = useRow ? 'flex-start' : 'stretch';
  }

  const stage = characterSelectEl?.querySelector('[data-region="stage"]') as HTMLElement | null;
  if (stage) {
    // 横屏：内容一屏内放下，顶部对齐避免大片顶部留白；竖屏堆叠时允许纵向滚动以触达确认按钮。
    stage.style.alignItems = 'flex-start';
    stage.style.justifyContent = 'center';
    stage.style.paddingTop = useRow ? 'clamp(4px,1vh,12px)' : 'clamp(6px,1.5vh,16px)';
    stage.style.overflowX = 'hidden';
    // detail 现在可能超过 body 高（让 card 撑满 detail 宽），所以横屏也要允许纵向滚动兜底。
    stage.style.overflowY = 'auto';
  }
}

function scheduleCharacterSelectDetailLayout(): void {
  requestAnimationFrame(() => {
    syncCharacterSelectBodyLayout();
    syncCharacterSelectDetailLayout();
  });
}

function mountCharacterSelectSlots(host: HTMLElement): void {
  host.replaceChildren();
  const unlocked = getUnlockedCharacters();

  for (const char of CHARACTER_ORDER) {
    const isUnlocked = unlocked.has(char);
    const isSelected = char === selectedCharacter;
    const frames = CHARACTER_AVATAR_FRAME_PATHS[char];

    const slot = document.createElement('div');
    slot.style.cssText = `
      position:relative;width:clamp(46px,12vw,56px);min-width:44px;min-height:44px;
      cursor:${isUnlocked ? 'pointer' : 'not-allowed'};flex-shrink:0;transition:transform 0.15s;
      touch-action:manipulation;user-select:none;
    `;

    const frameImg = document.createElement('img');
    frameImg.src = isSelected ? frames.selected : frames.normal;
    frameImg.alt = t(`character.${char}`);
    frameImg.draggable = false;
    frameImg.style.cssText = 'width:100%;height:auto;display:block;pointer-events:none;';

    slot.appendChild(frameImg);

    if (!isUnlocked) {
      const lockOverlay = document.createElement('img');
      lockOverlay.src = CHARACTER_LOCKED_OVERLAY_PATH;
      lockOverlay.alt = '';
      lockOverlay.draggable = false;
      lockOverlay.style.cssText = `
        position:absolute;inset:0;width:100%;height:100%;display:block;
        pointer-events:none;object-fit:contain;
      `;
      slot.appendChild(lockOverlay);
      slot.title = t('characterSelect.locked');
    }

    slot.addEventListener('click', () => {
      if (!isUnlocked) return;
      selectedCharacter = char;
      mountCharacterSelectSlots(host);
      refreshCharacterSelectUI();
    });
    slot.addEventListener('mouseenter', () => { if (isUnlocked) slot.style.transform = 'scale(1.05)'; });
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
  coin.style.cssText = 'height:72%;width:auto;aspect-ratio:1/1;object-fit:contain;flex-shrink:0;';

  const amount = document.createElement('span');
  amount.style.cssText = uiPlainText('font-size:0.92em;font-weight:bold;line-height:1;white-space:nowrap;');
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
  label.style.cssText = uiPlainText(`
    position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
    font-size:0.92em;font-weight:bold;line-height:1;
    white-space:nowrap;pointer-events:none;
  `);
  label.textContent = t('shop.maxed');

  btn.appendChild(frame);
  btn.appendChild(label);
  return btn;
}

function createFramedLabelButton(
  label: string,
  frame: string,
  pressed: string,
  onClick: () => void,
  width = '100%',
  flexInRow = false,
): HTMLDivElement {
  const btn = document.createElement('div');
  btn.dataset.cameraBlock = 'true';
  btn.style.cssText = `
    position:relative;display:block;width:${width};min-width:${uiPx(40)}px;min-height:${uiPx(40)}px;flex-shrink:0;
    cursor:pointer;user-select:none;touch-action:manipulation;
    transition:transform 0.15s;${flexInRow ? `flex:1 1 ${uiPx(80)}px;` : 'flex:0 0 auto;'}
  `;

  const frameImg = document.createElement('img');
  frameImg.src = frame;
  frameImg.alt = '';
  frameImg.draggable = false;
  frameImg.style.cssText = 'display:block;width:100%;height:auto;pointer-events:none;vertical-align:top;';

  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  labelEl.style.cssText = uiPlainText(`
    position:absolute;left:0;top:0;width:100%;height:100%;
    display:flex;align-items:center;justify-content:center;
    font-size:clamp(${uiPx(9)}px,2.6vmin,${uiPx(12)}px);font-weight:bold;line-height:1.2;
    padding:0 clamp(4px,1.2vmin,8px);box-sizing:border-box;text-align:center;
    pointer-events:none;
  `);

  btn.appendChild(frameImg);
  btn.appendChild(labelEl);
  btn.addEventListener('click', (ev) => { ev.stopPropagation(); onClick(); });
  btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.05)'; });
  btn.addEventListener('mouseleave', () => {
    btn.style.transform = 'scale(1)';
    frameImg.src = frame;
  });
  btn.addEventListener('mousedown', () => { frameImg.src = pressed; });
  btn.addEventListener('mouseup', () => { frameImg.src = frame; });
  btn.addEventListener('touchstart', () => { frameImg.src = pressed; }, { passive: true });
  btn.addEventListener('touchend', () => { frameImg.src = frame; });

  return btn;
}

function createPauseMenuButton(
  label: string,
  frame: string,
  pressed: string,
  onClick: () => void,
): HTMLDivElement {
  const btn = createFramedLabelButton(label, frame, pressed, onClick, '100%');
  btn.style.maxWidth = `${uiPx(120)}px`;
  return btn;
}

function createPauseConfirmDialog(
  parent: HTMLElement,
  message: string,
  confirmLabel: string,
  onConfirm: () => void,
  onDismiss?: () => void,
): void {
  const confirm = document.createElement('div');
  confirm.dataset.pauseConfirm = 'true';
  confirm.dataset.cameraBlock = 'true';
  confirm.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:10;background:rgba(0,0,0,0.6);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);box-sizing:border-box;';

  const box = document.createElement('div');
  box.style.cssText = `
    position:relative;width:min(86vw,${uiPx(340)}px);max-width:100%;
    aspect-ratio:${POPUP_CONFIRM_PANEL_SIZE.w}/${POPUP_CONFIRM_PANEL_SIZE.h};
    background:url(${POPUP_CONFIRM_PANEL_BG}) center center/100% 100% no-repeat;
    box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;
    padding:clamp(${uiPx(24)}px,10%,${uiPx(40)}px) clamp(${uiPx(14)}px,5%,${uiPx(24)}px) clamp(${uiPx(16)}px,6%,${uiPx(28)}px);
    gap:clamp(8px,2vh,14px);
  `;

  const dismiss = (): void => {
    confirm.remove();
    onDismiss?.();
  };

  const closeBtn = document.createElement('div');
  closeBtn.dataset.cameraBlock = 'true';
  closeBtn.style.cssText = `position:absolute;top:clamp(2px,1%,8px);right:clamp(2px,1%,8px);width:clamp(${uiPx(26)}px,7vmin,${uiPx(34)}px);min-width:${uiPx(36)}px;min-height:${uiPx(36)}px;cursor:pointer;user-select:none;touch-action:manipulation;display:flex;align-items:center;justify-content:center;`;
  const closeImg = document.createElement('img');
  closeImg.src = BTN_CLOSE_ICON;
  closeImg.alt = '';
  closeImg.draggable = false;
  closeImg.style.cssText = 'display:block;width:100%;height:auto;pointer-events:none;';
  closeBtn.appendChild(closeImg);
  closeBtn.addEventListener('click', (ev) => { ev.stopPropagation(); dismiss(); });
  box.appendChild(closeBtn);

  const msg = document.createElement('div');
  msg.style.cssText = uiPlainText(`width:100%;font-size:clamp(${uiPx(10)}px,2.8vmin,${uiPx(13)}px);font-weight:600;line-height:1.45;text-align:center;padding:0 clamp(6px,1.6vmin,12px);box-sizing:border-box;`);
  msg.textContent = message;
  box.appendChild(msg);

  const row = document.createElement('div');
  row.style.cssText = `display:flex;gap:clamp(6px,1.8vmin,10px);width:100%;max-width:min(88%,${uiPx(260)}px);justify-content:center;flex-wrap:wrap;`;

  row.appendChild(createFramedLabelButton(
    t('pause.cancel'),
    PAUSE_MENU_BUTTON_GRAY,
    PAUSE_MENU_BUTTON_GRAY_PRESSED,
    dismiss,
    '100%',
    true,
  ));
  row.appendChild(createFramedLabelButton(
    confirmLabel,
    PAUSE_MENU_BUTTON_RED,
    PAUSE_MENU_BUTTON_RED_PRESSED,
    () => { confirm.remove(); onConfirm(); },
    '100%',
    true,
  ));

  box.appendChild(row);
  confirm.appendChild(box);
  parent.appendChild(confirm);
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
  labelEl.style.cssText = uiPlainText(`
    position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
    font-size:clamp(12px,2.8vw,13px);font-weight:bold;line-height:1.2;
    pointer-events:none;
  `);

  btn.appendChild(frame);
  btn.appendChild(labelEl);
  btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.05)'; });
  btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; });
  btn.addEventListener('click', onClick);
  return btn;
}

/**
 * 角色面板 5 个属性行前置的小方形徽章 icon。
 *
 * 项目里没有这套"小徽章 + 白图形"的现成资源（`public/ui/icon/Shrine_Reward/*.png`
 * 都是大尺寸插画），所以这里用**内联 SVG** 拼出来：圆角方形背景上叠一个白色 path，
 * 颜色按目标视觉（参考 Brawl Stars 风格）选定，整体只占一行字高度。
 *
 * 未来若有正式 icon 资源，把这里换成 `<img src=...>` 即可。
 */
type CharacterStatKey = 'hp' | 'speed' | 'damage' | 'armor' | 'crit';

const STAT_ICON_BG: Record<CharacterStatKey, string> = {
  hp: '#3FA34D',      // 绿
  speed: '#D9534F',   // 红
  damage: '#3F9DA8',  // 青
  armor: '#4A89D8',   // 蓝
  crit: '#1F2C4E',    // 深蓝
};

const STAT_ICON_GLYPH: Record<CharacterStatKey, string> = {
  hp: '<path d="M12 19c-3-1.8-7-4.6-7-9 0-2 1.6-3.6 3.6-3.6 1.4 0 2.6.8 3.4 2 .8-1.2 2-2 3.4-2 2 0 3.6 1.6 3.6 3.6 0 4.4-4 7.2-7 9z" fill="white"/>',
  speed: '<path d="M13 4 L7 13 H10 L8.5 20 L17 11 H14 L15.5 4 Z" fill="white"/>',
  damage:
    '<circle cx="12" cy="12" r="5.5" fill="none" stroke="white" stroke-width="1.6"/>'
    + '<circle cx="12" cy="12" r="2.4" fill="white"/>'
    + '<line x1="12" y1="3.5" x2="12" y2="6.5" stroke="white" stroke-width="1.6" stroke-linecap="round"/>'
    + '<line x1="12" y1="17.5" x2="12" y2="20.5" stroke="white" stroke-width="1.6" stroke-linecap="round"/>'
    + '<line x1="3.5" y1="12" x2="6.5" y2="12" stroke="white" stroke-width="1.6" stroke-linecap="round"/>'
    + '<line x1="17.5" y1="12" x2="20.5" y2="12" stroke="white" stroke-width="1.6" stroke-linecap="round"/>',
  armor:
    '<path d="M12 4 L18 6.2 V12 C18 16 15.2 19 12 20.2 C8.8 19 6 16 6 12 V6.2 Z" fill="white"/>'
    + '<path d="M12 8.2 V16.2" stroke="' + '#4A89D8' + '" stroke-width="1.2" stroke-linecap="round"/>'
    + '<path d="M9 11 H15" stroke="' + '#4A89D8' + '" stroke-width="1.2" stroke-linecap="round"/>',
  crit:
    '<path d="M12 5C8.7 5 6 7.7 6 11 c0 1.7 0.7 3 1.6 4 v2.4 c0 0.5 0.4 0.9 0.9 0.9 h1 v1 c0 0.4 0.3 0.7 0.7 0.7 h3.6 c0.4 0 0.7-0.3 0.7-0.7 v-1 h1 c0.5 0 0.9-0.4 0.9-0.9 V15 c0.9-1 1.6-2.3 1.6-4 0-3.3-2.7-6-6-6Z" fill="white"/>'
    + '<circle cx="10" cy="11.5" r="1.2" fill="' + '#1F2C4E' + '"/>'
    + '<circle cx="14" cy="11.5" r="1.2" fill="' + '#1F2C4E' + '"/>'
    + '<path d="M10.5 16 L11 17 M12 16 L12 17 M13.5 16 L13 17" stroke="' + '#1F2C4E' + '" stroke-width="0.9" stroke-linecap="round"/>',
};

function createStatIcon(key: CharacterStatKey): HTMLElement {
  const wrap = document.createElement('span');
  wrap.style.cssText = `
    flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;
    width:clamp(16px,3.4vw,20px);height:clamp(16px,3.4vw,20px);
  `;
  // 背景从 r=11 的圆改成 22×22 的圆角方形（rx=3），让 5 个属性图标统一变方。
  // 内嵌的 glyph path 都画在 24×24 viewBox 中心 ±10 范围内，圆变方后图形位置无需调整。
  wrap.innerHTML =
    `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" `
    + `style="width:100%;height:100%;display:block;">`
    + `<rect x="1" y="1" width="22" height="22" rx="3" ry="3" `
    + `fill="${STAT_ICON_BG[key]}" stroke="rgba(0,0,0,0.45)" stroke-width="1.4"/>`
    + STAT_ICON_GLYPH[key]
    + `</svg>`;
  return wrap;
}

function createCharacterStatBar(
  statKey: CharacterStatKey,
  label: string,
  valueText: string,
  ratio: number,
  fillSrc: string = BAR_ASSETS.stat.fill,
): HTMLElement {
  const pct = Math.min(100, Math.max(0, ratio * 100));

  const row = document.createElement('div');
  row.style.cssText = `
    display:flex;align-items:center;gap:8px;
    font-size:clamp(10px,2.2vw,12px);margin:3px 0;width:100%;
  `;

  row.appendChild(createStatIcon(statKey));

  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  labelEl.style.cssText = uiPlainText('flex:0 0 60px;font-weight:600;flex-shrink:0;padding-inline:2px;');

  const track = document.createElement('div');
  track.style.cssText = `
    flex:1;position:relative;height:clamp(9px,2.4vw,12px);min-width:0;overflow:visible;
  `;
  mountSvgBarTiled(track, BAR_ASSETS.stat.track, fillSrc, BAR_ASSETS.stat.tiles).set(pct);

  const valEl = document.createElement('span');
  valEl.textContent = valueText;
  valEl.style.cssText = uiPlainText(
    'flex:0 0 52px;text-align:right;font-weight:600;font-variant-numeric:tabular-nums;flex-shrink:0;',
  );

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
  ensureSelectableCharacter();

  const id = selectedCharacter;
  const unlocked = isCharacterUnlocked(id);
  const cfg = CHARACTER_CONFIGS[id];
  const weapon = cfg.startingWeapon;
  const detailFont = (size: string, extra = '') =>
    uiPlainText(`margin:0;font-size:${size};line-height:1.45;${extra}`);

  const { bodyPad, sectionGap, weaponPanelWidth } = CHARACTER_DETAIL_LAYOUT;

  const card = document.createElement('div');
  card.dataset.region = 'detail-card';
  // **必须**保持 SVG 原始竖卡比例（3465×4897 ≈ 0.708）。否则手机窄屏 / 横屏短屏下
  // detailInner 容器形状千差万别，底图被 `100% 100% no-repeat` 拉成怪形状，所有
  // absolute 定位的 title / 武器槽都跟着歪、立绘也变形。
  //
  // 用 `width:100% + height:auto + aspect-ratio` 让 card 高度由宽度按 AR 反推；
  // `max-height:100%` 兜底——若反推高度超过 detailInner（横屏宽容器场景），
  // 浏览器会按 aspect-ratio 反向把宽度也缩回去，等价于 object-fit:contain。
  card.style.cssText = `
    position:relative;box-sizing:border-box;
    width:100%;height:auto;
    max-width:100%;max-height:100%;
    aspect-ratio:${CHARACTER_DETAIL_PANEL_SIZE.w}/${CHARACTER_DETAIL_PANEL_SIZE.h};
    margin:auto;align-self:center;
    overflow:hidden;
    background:url(${CHARACTER_DETAIL_PANEL_BG}) center center/100% 100% no-repeat;
    filter:drop-shadow(0 4px 16px rgba(0,40,80,0.15));
  `;

  const titleBar = document.createElement('div');
  titleBar.dataset.region = 'detail-title';
  titleBar.style.cssText = `
    position:absolute;left:0;right:0;box-sizing:border-box;
    top:${characterDetailInsetYPct(CHARACTER_DETAIL_TITLE_BAR.top)};
    height:${characterDetailInsetYPct(CHARACTER_DETAIL_TITLE_BAR.height)};
    display:flex;align-items:center;justify-content:center;
    padding:0 ${characterDetailInsetXPct(CHARACTER_DETAIL_TITLE_BAR_PAD_X)};
  `;
  const nameEl = document.createElement('h2');
  // 与"商店"红丝带标题、商店卡片标题统一描边强度（uiPlainTextBold：2px 8 向 + 底投影），
  // 让所有"卡通丝带 logo"风的大字号标题保持一致；这里 16~22px 字号正好在 bold 描边的安全区间。
  nameEl.style.cssText = uiPlainTextBold(
    'margin:0;line-height:1.45;font-size:clamp(16px,4.2vw,22px);font-weight:bold;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;',
  );
  nameEl.textContent = t(`character.${id}`);
  titleBar.appendChild(nameEl);
  card.appendChild(titleBar);

  const bodyArea = document.createElement('div');
  bodyArea.dataset.region = 'detail-body';
  // CSS 不接受 `padding:负值`，所以当 `bodyPad.x` 为负数时，等价改写为：
  //   bodyArea 的 left/right **negative inset**（让 bodyArea 比 card 还宽），
  //   horizontal padding = 0。这样视觉上等同于"负的水平 padding"——子元素
  //   能扩展到 card 边缘以外，但被 card 自身的 overflow:hidden 裁掉，
  //   净效果是子元素恰好占满 card 的可视水平空间（甚至跨过描边内侧）。
  const bodyPadXPctNum = (bodyPad.x / CHARACTER_DETAIL_PANEL_SIZE.w) * 100;
  const bodyAreaSideOffset = bodyPadXPctNum < 0 ? `${bodyPadXPctNum.toFixed(3)}%` : '0';
  const bodyHorizontalPadding = bodyPadXPctNum < 0 ? '0' : characterDetailInsetXPct(bodyPad.x);
  bodyArea.style.cssText = `
    position:absolute;left:${bodyAreaSideOffset};right:${bodyAreaSideOffset};bottom:0;box-sizing:border-box;
    top:${characterDetailInsetYPct(CHARACTER_DETAIL_BODY.top)};
    display:flex;flex-direction:column;align-items:stretch;overflow:hidden;
    padding:${characterDetailInsetYPct(bodyPad.top)} ${bodyHorizontalPadding}
      ${characterDetailInsetYPct(bodyPad.bottom)} ${bodyHorizontalPadding};
  `;

  // ------------------------------------------------------------------
  // bodyArea 的 3 段高度必须**严格匹配** SVG 的 3 段几何：
  //   [scaleOuter]     描述 / 属性 / 天赋  → SVG 顶（带 padding）~ 武器槽顶
  //   [weaponSpacer]   武器槽（实际武器卡走 absolute，spacer 只占位）
  //   [confirmSection] 武器槽底 ~ SVG 底（含 bodyPad.bottom）
  //
  // 旧实现 scaleOuter 用 `flex:1 1 auto` 贪婪填充，会把天赋段下沉到 weapon
  // 槽位上方甚至重叠，导致大剑 icon / "近战横扫…" 字段盖到 trait 上。
  // 现在 3 段全用显式百分比，按 bodyArea **内容区**（去掉 padding）算。
  const cardH = CHARACTER_DETAIL_PANEL_SIZE.h;
  const bodyContentTopInCardPct =
    (CHARACTER_DETAIL_BODY.top + bodyPad.top) / cardH * 100;
  const bodyContentBottomInCardPct =
    100 - (bodyPad.bottom / cardH) * 100;
  const bodyContentHeightInCardPct =
    bodyContentBottomInCardPct - bodyContentTopInCardPct;
  const weaponTopInCardPct = CHARACTER_DETAIL_WEAPON_SLOT.topPct;
  const weaponBotInCardPct =
    CHARACTER_DETAIL_WEAPON_SLOT.topPct + CHARACTER_DETAIL_WEAPON_SLOT.heightPct;
  const scaleOuterFlexPct =
    ((weaponTopInCardPct - bodyContentTopInCardPct) / bodyContentHeightInCardPct) * 100;
  const weaponSpacerFlexPct =
    (CHARACTER_DETAIL_WEAPON_SLOT.heightPct / bodyContentHeightInCardPct) * 100;
  const confirmFlexPct =
    ((bodyContentBottomInCardPct - weaponBotInCardPct) / bodyContentHeightInCardPct) * 100;

  const scaleOuter = document.createElement('div');
  scaleOuter.dataset.region = 'detail-scale';
  scaleOuter.style.cssText = `
    width:100%;flex:0 0 ${scaleOuterFlexPct.toFixed(3)}%;min-height:0;box-sizing:border-box;
    display:flex;justify-content:center;align-items:flex-start;overflow:hidden;
  `;

  const contentWrap = document.createElement('div');
  contentWrap.dataset.region = 'detail-content';
  // `flex-shrink:0` 防止 scaleOuter 把 contentWrap 强行压回 100% ——
  // syncCharacterSelectDetailLayout 在内容超高时会把 contentWrap 设成
  // `width:131%` + `transform:scale(0.76)`，等价于"缩放但保持视觉宽 100%"；
  // 没有 `flex-shrink:0` 的话 flex 容器会把 width 131% 直接 shrink 回 100%，
  // 导致 scale 后视觉只剩 76%，两边各空 12%（≈ 屏蔽截图里的左右白边）。
  contentWrap.style.cssText = `
    display:flex;flex-direction:column;align-items:stretch;
    gap:${sectionGap};width:100%;max-width:100%;flex-shrink:0;box-sizing:border-box;
  `;

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
    const fillSrc = stat.key === 'hp' ? BAR_ASSETS.stat.fillGreen : BAR_ASSETS.stat.fill;
    statsEl.appendChild(createCharacterStatBar(
      stat.key,
      t(`characterSelect.statLabel.${stat.key}`),
      stat.text,
      stat.value / CHARACTER_STAT_BAR_MAX[stat.key],
      fillSrc,
    ));
  }
  contentWrap.appendChild(statsEl);

  const traitEl = document.createElement('p');
  // 不覆盖 uiPlainText 默认的 8 向黑描边阴影——之前给了 `text-shadow:0 1px 2px ...`
  // 把描边阴影替换成一层柔阴影，肉眼看不见描边。这里只调字重 / 颜色，保留描边默认。
  traitEl.style.cssText = detailFont(
    'clamp(10px,2.2vw,12px)',
    'font-weight:bold;flex:0 0 auto;color:#FFFFFF;',
  );
  traitEl.textContent = `${t('characterSelect.traitTitle')}：${t(`character.${id}_trait`)}`;
  contentWrap.appendChild(traitEl);

  const weaponSection = document.createElement('div');
  weaponSection.dataset.region = 'detail-weapon';
  weaponSection.style.cssText = `
    position:absolute;box-sizing:border-box;
    left:${CHARACTER_DETAIL_WEAPON_SLOT.leftPct.toFixed(3)}%;
    right:${CHARACTER_DETAIL_WEAPON_SLOT.rightPct.toFixed(3)}%;
    top:${CHARACTER_DETAIL_WEAPON_SLOT.topPct.toFixed(3)}%;
    height:${CHARACTER_DETAIL_WEAPON_SLOT.heightPct.toFixed(3)}%;
    display:flex;align-items:center;justify-content:center;overflow:hidden;
  `;

  const weaponPanel = document.createElement('div');
  weaponPanel.style.cssText = `
    box-sizing:border-box;width:${weaponPanelWidth};max-width:100%;height:100%;
    display:flex;align-items:center;
    padding:clamp(6px,1.5vw,12px) clamp(10px,2.4vw,20px);
  `;

  const weaponRow = document.createElement('div');
  weaponRow.style.cssText = `
    display:flex;align-items:center;gap:clamp(4px,1vw,7px);width:100%;box-sizing:border-box;
  `;

  const weaponBoxSize = 'clamp(56px,14vw,84px)';
  const weaponImgWrap = document.createElement('div');
  weaponImgWrap.style.cssText = `
    flex-shrink:0;display:flex;align-items:center;justify-content:center;
    width:${weaponBoxSize};height:${weaponBoxSize};aspect-ratio:1/1;
    box-sizing:border-box;padding:4px;
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
      fallback.style.cssText = uiPlainText('font-size:clamp(20px,5vw,28px);line-height:1;');
      fallback.textContent = '⚔️';
      weaponImgWrap.appendChild(fallback);
    };
    weaponImgWrap.appendChild(weaponImg);
  } else {
    const fallback = document.createElement('div');
    fallback.style.cssText = uiPlainText('font-size:clamp(20px,5vw,28px);line-height:1;');
    fallback.textContent = '⚔️';
    weaponImgWrap.appendChild(fallback);
  }
  weaponRow.appendChild(weaponImgWrap);

  const weaponTextCol = document.createElement('div');
  const weaponTextMarginTop = weapon === 'axe' ? '-6px' : '0';
  weaponTextCol.style.cssText = `
    flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;margin-top:${weaponTextMarginTop};
  `;

  const weaponNameEl = document.createElement('div');
  weaponNameEl.style.cssText = detailFont('clamp(9px,2.2vw,12px)', 'font-weight:bold;');
  weaponNameEl.textContent = t(`upgrade.weapon.${weapon}`);
  weaponTextCol.appendChild(weaponNameEl);

  const weaponDescEl = document.createElement('p');
  weaponDescEl.style.cssText = detailFont('clamp(8px,1.9vw,10px)', 'font-weight:bold;margin-top:1px;margin-bottom:0;');
  weaponDescEl.textContent = t(`upgrade.weapon.${weapon}_desc`);
  weaponTextCol.appendChild(weaponDescEl);

  const weaponStatsEl = document.createElement('div');
  weaponStatsEl.style.cssText = detailFont('clamp(7px,1.7vw,9px)', 'display:flex;flex-direction:column;gap:0;');
  for (const line of formatWeaponStatLines(weapon)) {
    const row = document.createElement('div');
    row.textContent = line;
    weaponStatsEl.appendChild(row);
  }
  weaponTextCol.appendChild(weaponStatsEl);

  weaponRow.appendChild(weaponTextCol);
  weaponPanel.appendChild(weaponRow);
  weaponSection.appendChild(weaponPanel);

  scaleOuter.appendChild(contentWrap);
  bodyArea.appendChild(scaleOuter);

  // weaponSection 直接锚在 card 的蓝色嵌入槽上，不走 bodyArea 的 flex 流；
  // weaponSpacer 与之同高，作为 flex 占位，把 confirmSection 推到 weapon 槽下方。
  const weaponSpacer = document.createElement('div');
  weaponSpacer.dataset.region = 'detail-weapon-spacer';
  weaponSpacer.style.cssText = `flex:0 0 ${weaponSpacerFlexPct.toFixed(3)}%;min-height:0;`;
  bodyArea.appendChild(weaponSpacer);

  const confirmSection = document.createElement('div');
  confirmSection.dataset.region = 'detail-confirm';
  // 高度也走 SVG 几何（weapon 槽底 ~ bodyPad.bottom）。按钮 align-items:center
  // 让它在这块区域内垂直居中；不再加 margin-top（间距已经由 weaponSpacer 提供）。
  confirmSection.style.cssText = `
    flex:0 0 ${confirmFlexPct.toFixed(3)}%;width:100%;
    display:flex;align-items:center;justify-content:center;
    box-sizing:border-box;min-height:0;
  `;
  const confirmBtn = createCharacterConfirmButton(unlocked ? t('characterSelect.confirm') : t('characterSelect.locked'), () => {
    if (!isCharacterUnlocked(selectedCharacter)) return;
    destroyCharacterSelectScreen();
    showTierSelectScreen();
  });
  if (!unlocked) {
    confirmBtn.style.filter = 'grayscale(1)';
    confirmBtn.style.opacity = '0.55';
    confirmBtn.style.cursor = 'not-allowed';
  }
  confirmSection.appendChild(confirmBtn);
  bodyArea.appendChild(confirmSection);
  card.appendChild(bodyArea);
  // 武器卡（absolute）必须**后于** bodyArea 加到 card，才能盖在嵌入槽上面；
  // 同时由于它是 absolute / position 是相对 card 的，所以挂在 card 而不是 bodyArea。
  card.appendChild(weaponSection);

  characterSelectDetailHost.replaceChildren(card);
  scheduleCharacterSelectDetailLayout();
}

function refreshCharacterSelectPreview(): void {
  if (!characterSelectPreviewHost) return;

  const id = selectedCharacter;
  const stage = document.createElement('div');
  // stage 占满整个 center 区，背景透明 → 主角立绘直接站在整页沙漠背景的地平线上。
  // align-items:flex-end + 立绘 height:100% → 顶天立地，体量直接撑满；
  // overflow:visible 让 drop-shadow 不被切边。
  stage.style.cssText = `
    width:100%;max-width:100%;height:100%;margin:0;box-sizing:border-box;
    display:flex;align-items:flex-end;justify-content:center;
    background:${CHARACTER_PREVIEW_STAGE_BG};border:none;border-radius:0;
    padding:0;overflow:visible;position:relative;
  `;

  const preview = document.createElement('img');
  preview.src = CHARACTER_FULL_PATHS[id];
  preview.alt = t(`character.${id}`);
  preview.draggable = false;
  // 立绘高度撑满 stage、宽度按比例自适应、底部对齐 —— 既不裁脸也不留大片空白；
  // 单层柔和 drop-shadow，让主角和大厅背景拉开层次但不抢戏。
  preview.style.cssText = `
    width:auto;height:100%;max-width:100%;max-height:100%;
    object-fit:contain;object-position:center bottom;
    filter:drop-shadow(0 8px 18px rgba(0,0,0,0.28));
    pointer-events:none;user-select:none;position:relative;z-index:1;
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
  ensureSelectableCharacter();

  characterSelectEl = document.createElement('div');
  characterSelectEl.id = 'character-select-root';
  // 共用 PREP_SCREEN_STYLE 的布局/层级，但角色选择页单独换背景：
  // 把 PREP_SCREEN_STYLE 里的 background 覆盖为沙漠场景，其他 prep 页面（tier / shop）不受影响。
  characterSelectEl.style.cssText = `
    ${PREP_SCREEN_STYLE}
    display:flex;flex-direction:column;
    background:#1a2332 url(${CHARACTER_SELECT_PAGE_BG_IMAGE}) center bottom / cover no-repeat;
  `;

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
  syncCharacterSelectBodyLayout();

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

  const tierStartIconTopOffset = (tier: DifficultyTier): number => {
    if (tier === 1) return -uiPx(24);
    if (tier === 2) return -uiPx(20);
    return -uiPx(16);
  };

  tierSelectEl = document.createElement('div');
  // 共用 PREP_SCREEN_STYLE 的布局/层级，但难度选择页单独换背景：
  // 把 PREP_SCREEN_STYLE 里的 background 覆盖为沙漠场景，其他 prep 页面不受影响。
  tierSelectEl.style.cssText = `
    ${PREP_SCREEN_STYLE}
    display:flex;flex-direction:column;
    background:#1a2332 url(${TIER_SELECT_PAGE_BG_IMAGE}) center bottom / cover no-repeat;
  `;

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
    width:min(720px,100%);max-width:100%;display:flex;flex-direction:column;
    align-items:center;justify-content:${isUiShort() ? 'flex-start' : 'center'};
    gap:clamp(12px,3vh,20px);box-sizing:border-box;padding:8px 0;
  `;

  let tierStartIconEl: HTMLImageElement | null = null;
  const tierPanel = showTierSelect((tier) => {
    if (!tierStartIconEl) return;
    tierStartIconEl.src = TIER_PANEL_ICONS[tier];
    tierStartIconEl.style.top = `${tierStartIconTopOffset(tier)}px`;
  });
  body.appendChild(tierPanel);

  const startWrap = document.createElement('div');
  startWrap.style.cssText = 'margin-top:16px;width:100%;display:flex;justify-content:center;box-sizing:border-box;';
  const startButton = createMainMenuButton(
    TIER_PANEL_ICONS[selectedTier],
    t('menu.start'),
    () => {
      if (!isCharacterUnlocked(selectedCharacter)) {
        destroyTierSelectScreen();
        showCharacterSelectScreen();
        return;
      }
      const character = selectedCharacter;
      playTransition(
        () => {
          destroyTierSelectScreen();
          startGame(character);
        },
        { duration: 800 },
      );
    },
    TIER_START_BUTTON_FRAME,
    TIER_START_BUTTON_PRESSED,
  );
  startButton.querySelector('[data-main-menu-button-icon="true"]')?.remove();
  tierStartIconEl = document.createElement('img');
  tierStartIconEl.src = TIER_PANEL_ICONS[selectedTier];
  tierStartIconEl.alt = '';
  tierStartIconEl.draggable = false;
  tierStartIconEl.style.cssText = `
    position:absolute;left:${-uiPx(14)}px;top:${tierStartIconTopOffset(selectedTier)}px;
    width:${uiPx(46)}px;height:${uiPx(46)}px;object-fit:contain;
    pointer-events:none;z-index:2;
  `;
  startButton.appendChild(tierStartIconEl);
  const tierStartLabelEl = startButton.querySelector<HTMLElement>('[data-main-menu-button-label="true"]');
  tierStartLabelEl?.style.setProperty('left', '0');
  tierStartLabelEl?.style.setProperty('right', '0');
  startWrap.appendChild(startButton);
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

function appendTierPanelIcon(card: HTMLElement, tier: DifficultyTier): void {
  const layout = TIER_PANEL_ICON_LAYOUT[tier];
  const icon = document.createElement('img');
  icon.src = TIER_PANEL_ICONS[tier];
  icon.alt = '';
  icon.draggable = false;
  icon.style.cssText = `
    position:absolute;pointer-events:none;user-select:none;
    left:${layout.leftPct}%;top:${layout.topPct}%;
    width:${layout.widthPct}%;height:auto;
    display:block;
  `;
  card.appendChild(icon);
}

function appendTierPanelTitle(card: HTMLElement, tier: DifficultyTier): void {
  const titleEl = document.createElement('div');
  titleEl.textContent = t(`tier.${tier}`);
  titleEl.style.cssText = uiPlainTextBold(`
    position:absolute;box-sizing:border-box;
    left:${tierInsetXPct(200)};right:${tierInsetXPct(200)};
    top:${TIER_TITLE_BAR_LAYOUT.topPct}%;height:${TIER_TITLE_BAR_LAYOUT.heightPct}%;
    display:flex;align-items:center;justify-content:center;
    font-size:clamp(22px,6.4vw,30px);font-weight:bold;line-height:1.1;
    text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  `);
  card.appendChild(titleEl);
}

function appendTierPanelStatRows(card: HTMLElement, cfg: (typeof TIER_CONFIGS)[DifficultyTier]): void {
  const tierStatRows = [
    t('tier.stat.enemyHp', { value: String(cfg.enemyHpMultiplier) }),
    t('tier.stat.enemyDamage', { value: String(cfg.enemyDamageMultiplier) }),
    t('tier.stat.silver', { value: String(cfg.silverMultiplier) }),
  ];
  tierStatRows.forEach((statText, index) => {
    const row = TIER_STAT_ROW_LAYOUT[index];
    const statEl = document.createElement('div');
    statEl.textContent = statText;
    statEl.style.cssText = uiPlainText(`
      position:absolute;box-sizing:border-box;
      left:30%;right:${tierInsetXPct(300)};
      top:${row.topPct.toFixed(3)}%;height:${row.heightPct.toFixed(3)}%;
      display:flex;align-items:center;justify-content:flex-start;
      font-size:clamp(9px,2.4vw,11px);line-height:1.2;font-weight:600;
      padding-left:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
    `);
    card.appendChild(statEl);
  });
}

function createTierPanelSelectButton(isSelected: boolean): HTMLDivElement {
  const btn = document.createElement('div');
  btn.style.cssText = `
    position:relative;width:100%;min-width:44px;max-width:100%;
    user-select:none;pointer-events:none;
  `;

  const frame = document.createElement('img');
  frame.src = isSelected ? TIER_SELECT_BUTTON_PRESSED : TIER_SELECT_BUTTON_NORMAL;
  frame.alt = '';
  frame.draggable = false;
  frame.style.cssText = 'display:block;width:100%;height:auto;pointer-events:none;';

  const labelEl = document.createElement('span');
  labelEl.textContent = t(isSelected ? 'tier.chosen' : 'tier.choose');
  labelEl.style.cssText = uiPlainText(`
    position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
    font-size:11px;font-weight:bold;line-height:1.2;pointer-events:none;
  `);

  btn.appendChild(frame);
  btn.appendChild(labelEl);
  return btn;
}

function appendTierPanelSelectButton(
  card: HTMLElement,
  isSelected: boolean,
): void {
  const wrap = document.createElement('div');
  wrap.style.cssText = `
    position:absolute;left:50%;bottom:${TIER_SELECT_BUTTON_LAYOUT.bottomPct}%;
    transform:translateX(-50%);
    width:${TIER_SELECT_BUTTON_LAYOUT.widthPct}%;
    min-width:44px;max-width:60%;box-sizing:border-box;
    pointer-events:none;
  `;
  wrap.appendChild(createTierPanelSelectButton(isSelected));
  card.appendChild(wrap);
}

function showTierSelect(onSelect: (tier: DifficultyTier) => void): HTMLDivElement {
  const panel = document.createElement('div');
  const narrow = isUiNarrow();
  panel.style.cssText = `
    display:flex;gap:clamp(10px,2.5vw,14px);
    flex-wrap:${narrow ? 'wrap' : 'nowrap'};
    flex-direction:${narrow ? 'column' : 'row'};
    align-items:center;justify-content:center;
    width:100%;max-width:100%;box-sizing:border-box;
  `;

  const tiers: DifficultyTier[] = [1, 2, 3];

  for (const tier of tiers) {
    const cfg = TIER_CONFIGS[tier];
    const isSelected = tier === selectedTier;

    const col = document.createElement('div');
    col.style.cssText = `
      width:${narrow ? 'min(220px,88vw)' : 'min(200px,30vw)'};max-width:100%;box-sizing:border-box;
    `;

    const card = document.createElement('div');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    card.setAttribute('aria-label', t(`tier.${tier}`));
    const selectedScale = 1.07;
    card.style.cssText = `
      position:relative;width:100%;max-width:100%;
      aspect-ratio:${TIER_PANEL_SIZE.w}/${TIER_PANEL_SIZE.h};height:auto;
      box-sizing:border-box;
      background:url(${TIER_PANEL_BGS[tier]}) center center/contain no-repeat;
      border:none;overflow:visible;
      cursor:${isSelected ? 'default' : 'pointer'};
      user-select:none;touch-action:manipulation;
      transition:transform 0.18s ease-out, filter 0.18s ease-out;
      transform:${isSelected ? `scale(${selectedScale})` : 'scale(1)'};
      transform-origin:center center;
      z-index:${isSelected ? 2 : 1};
      filter:${isSelected ? 'drop-shadow(0 6px 14px rgba(0,0,0,0.45))' : 'none'};
    `;
    appendTierPanelIcon(card, tier);
    appendTierPanelTitle(card, tier);
    appendTierPanelStatRows(card, cfg);
    appendTierPanelSelectButton(card, isSelected);
    if (!isSelected) {
      card.addEventListener('mouseenter', () => { card.style.transform = 'scale(1.05)'; });
      card.addEventListener('mouseleave', () => { card.style.transform = 'scale(1)'; });
      card.addEventListener('click', () => {
        if (selectedTier === tier) return;
        selectedTier = tier;
        onSelect(tier);
        const newPanel = showTierSelect(onSelect);
        panel.replaceWith(newPanel);
      });
    }
    col.appendChild(card);

    panel.appendChild(col);
  }

  return panel;
}

// =============================================================================
// Main Menu
// =============================================================================

let mainMenuEl: HTMLDivElement | null = null;

function createMainMenuButton(
  iconSrc: string,
  label: string,
  onClick: () => void,
  frameSrc = MENU_BUTTON_FRAME,
  pressedFrame?: string,
): HTMLDivElement {
  const btn = document.createElement('div');
  btn.style.cssText = `
    position:relative;width:min(${uiPx(140)}px,58vw);max-width:100%;min-height:44px;cursor:pointer;user-select:none;
    touch-action:manipulation;transition:transform 0.15s;
  `;

  const frame = document.createElement('img');
  frame.src = frameSrc;
  frame.alt = '';
  frame.draggable = false;
  frame.style.cssText = 'display:block;width:100%;height:auto;pointer-events:none;';

  const content = document.createElement('div');
  // 参考 Brawl Stars 风格：icon 与 label 改为各自绝对定位，互不影响：
  // - icon 锚定在按钮左侧固定 x → 三个按钮 icon 纵向严格成一列
  // - label 占 "icon 右侧到按钮右沿" 的矩形区，并在其中 text-align:center
  //   → 文字看上去对按钮整体居中（视觉重心因 icon 占位左移而自动平衡）
  content.style.cssText = `
    position:absolute;inset:0;pointer-events:none;
  `;

  const icon = document.createElement('img');
  icon.dataset.mainMenuButtonIcon = 'true';
  icon.src = iconSrc;
  icon.alt = '';
  icon.draggable = false;
  // translateY(-55%) 让 icon 比几何中心略向上偏 5%——按钮 SVG 顶面视觉中心
  // 高于几何中心，icon 上移 5% 补偿 → 与按钮顶面真正居中对齐。
  icon.style.cssText = `
    position:absolute;left:${uiPx(10)}px;top:50%;transform:translateY(-55%);
    width:${uiPx(32)}px;height:${uiPx(32)}px;object-fit:contain;
  `;

  const labelEl = document.createElement('span');
  labelEl.dataset.mainMenuButtonLabel = 'true';
  labelEl.textContent = label;
  // label 区域 = [icon 右沿 + gap, 按钮右沿 - 内 padding]
  // left = icon.left(10) + icon.width(27) + gap(8) = 45；右侧留 12 与 icon 视觉对称。
  // text-align:center → 短标签（"商店"/"任务"）也在右侧矩形里居中，不会贴 icon 也不会贴右边框。
  // 与"商店"红丝带标题、商店卡片标题、角色名统一描边强度（uiPlainTextBold：2px 8 向 + 底投影），
  // 让首页"开始游戏 / 商店 / 任务"按钮文字也吃同一档"卡通丝带 logo"风的厚描边。
  labelEl.style.cssText = uiPlainTextBold(`
    position:absolute;left:${uiPx(45)}px;right:${uiPx(12)}px;top:50%;transform:translateY(-50%);
    font-size:${uiPx(15)}px;font-weight:bold;line-height:1.2;white-space:nowrap;
    text-align:center;text-overflow:ellipsis;overflow:hidden;
  `);

  content.appendChild(icon);
  content.appendChild(labelEl);
  btn.appendChild(frame);
  btn.appendChild(content);
  btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.05)'; });
  btn.addEventListener('mouseleave', () => {
    btn.style.transform = 'scale(1)';
    if (pressedFrame) frame.src = frameSrc;
  });
  if (pressedFrame) {
    btn.addEventListener('mousedown', () => { frame.src = pressedFrame; });
    btn.addEventListener('mouseup', () => { frame.src = frameSrc; });
    btn.addEventListener('touchstart', () => { frame.src = pressedFrame; }, { passive: true });
    btn.addEventListener('touchend', () => { frame.src = frameSrc; });
  }
  btn.addEventListener('click', onClick);
  return btn;
}

function showMainMenu(): void {
  mainMenuEl = document.createElement('div');
  mainMenuEl.style.cssText = `
    position:fixed;top:0;left:0;width:100%;height:100%;
    display:flex;flex-direction:column;align-items:stretch;
    z-index:500;font-family:"Lilita One","Noto Sans SC",Arial,sans-serif;    overflow:hidden;
    background:#0a0a1a url(${LOBBY_BG_PATH}) center center/cover no-repeat;
    ${OVERLAY_SAFE_AREA}
    padding-top:max(16px,env(safe-area-inset-top,0px));
    padding-bottom:max(24px,env(safe-area-inset-bottom,0px));
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

  const centerGroup = document.createElement('div');
  centerGroup.style.cssText = `
    flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
    gap:clamp(10px,2.5vh,14px);width:100%;min-height:0;
    overflow-y:${isUiShort() ? 'auto' : 'visible'};
    box-sizing:border-box;padding:clamp(${uiPx(24)}px,5vh,${uiPx(40)}px) 16px 0;
  `;

  const title = document.createElement('img');
  title.src = titleImagePath();
  title.alt = t('game.title');
  title.draggable = false;
  title.style.cssText = titleImageWidthStyle();
  centerGroup.appendChild(title);

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;flex-direction:column;gap:6px;align-items:center;box-sizing:border-box;';

  btnRow.appendChild(createMainMenuButton(
    MENU_BUTTON_ICONS.start,
    t('menu.start'),
    () => {
      destroyMainMenu();
      showCharacterSelectScreen();
    },
    MENU_START_BUTTON_FRAME,
    MENU_START_BUTTON_PRESSED,
  ));
  btnRow.appendChild(createMainMenuButton(MENU_BUTTON_ICONS.shop, t('menu.shop'), () => {
    showShopOverlay();
  }));
  const questBtn = createMainMenuButton(MENU_BUTTON_ICONS.quest, t('menu.quests'), () => {
    showQuestsOverlay();
  });
  questBtn.dataset.menuQuestBtn = 'true';
  setNotificationDotVisible(questBtn, hasClaimableQuests(), 'menuQuest');
  btnRow.appendChild(questBtn);

  centerGroup.appendChild(btnRow);
  mainMenuEl.appendChild(centerGroup);
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
let shopGridResizeHandler: (() => void) | null = null;

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
  shopOverlayEl.appendChild(header);

  const shopStage = document.createElement('div');
  shopStage.style.cssText = `
    flex:1;min-height:0;width:100%;display:flex;align-items:center;justify-content:center;
    box-sizing:border-box;pointer-events:none;overflow:hidden;
    padding:clamp(4px,1vw,8px) clamp(6px,2vw,12px) clamp(8px,2vw,14px);
  `;

  const itemListPanel = document.createElement('div');
  itemListPanel.style.cssText = `
    position:relative;box-sizing:border-box;flex-shrink:0;
    margin:0 auto;overflow:hidden;pointer-events:auto;
    display:flex;align-items:center;justify-content:center;
    background:url(${SHOP_ITEM_LIST_PANEL_BG}) center center/contain no-repeat;
  `;

  const shopCompact = isUiNarrow();

  const grid = document.createElement('div');
  grid.style.cssText = `
    display:grid;box-sizing:border-box;flex-shrink:0;
    align-content:center;align-items:center;justify-content:center;
  `;

  const shopText = (sizeEm: number, extra = '') =>
    uiPlainText(`margin:0;font-size:${sizeEm}em;line-height:1.2;${extra}`);

  for (const upgrade of SHOP_UPGRADES) {
    const currentLevel = save.shopLevels[upgrade.id] ?? 0;
    const isMaxed = currentLevel >= upgrade.maxLevel;
    const cost = isMaxed ? null : upgrade.costPerLevel[currentLevel];
    const affordable = cost !== null && save.silver >= cost;

    const card = document.createElement('div');
    card.style.cssText = `
      position:relative;box-sizing:border-box;min-width:0;
      width:100%;height:100%;align-self:center;
      aspect-ratio:${SHOP_ITEM_PANEL_SIZE.w}/${SHOP_ITEM_PANEL_SIZE.h};
      background:url(${SHOP_ITEM_PANEL_BG}) center center/contain no-repeat;
      ${isMaxed ? 'opacity:0.65;' : ''}
    `;

    const cardInner = document.createElement('div');
    cardInner.style.cssText = `
      position:absolute;inset:${shopCompact ? '5% 5% 6% 5%' : '5% 4% 6% 4%'};
      display:flex;flex-direction:column;align-items:center;justify-content:flex-start;
      box-sizing:border-box;font-size:${SHOP_CARD_CONTENT_SCALE}em;
      padding-top:1em;gap:0.18em;
    `;

    const nameEl = document.createElement('div');
    // 与商店红丝带标题（uiPlainTextBold，2px 8 向描边 + 底投影）统一描边强度，
    // 让卡片标题在浅蓝面板上的"卡通丝带 logo"质感一致；不再用 1px 细描边的 uiPlainText。
    nameEl.style.cssText = uiPlainTextBold(
      'margin:0;font-size:1.2em;line-height:1.2;font-weight:bold;text-overflow:ellipsis;white-space:nowrap;max-width:100%;flex-shrink:0;',
    );
    nameEl.textContent = t(upgrade.nameKey);
    cardInner.appendChild(nameEl);

    const iconSrc = SHOP_ITEM_ICONS[upgrade.id];
    if (iconSrc) {
      const iconEl = document.createElement('img');
      iconEl.src = iconSrc;
      iconEl.alt = '';
      iconEl.draggable = false;
      iconEl.style.cssText = 'width:4.5em;height:4.5em;object-fit:contain;flex-shrink:0;';
      cardInner.appendChild(iconEl);
    }

    const descEl = document.createElement('div');
    descEl.style.cssText = shopText(
      0.78,
      'max-width:96%;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;text-align:center;flex-shrink:0;box-sizing:border-box;padding-block:2px;line-height:1.4;',
    );
    descEl.textContent = t(upgrade.descKey);
    cardInner.appendChild(descEl);

    const cardSpacer = document.createElement('div');
    cardSpacer.style.cssText = 'flex:1 1 auto;min-height:0;width:100%;';
    cardInner.appendChild(cardSpacer);

    const progressRow = document.createElement('div');
    progressRow.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:0.2em;width:100%;flex-shrink:0;';

    const levelEl = document.createElement('div');
    levelEl.style.cssText = shopText(0.82, 'font-weight:bold;flex-shrink:0;white-space:nowrap;');
    levelEl.textContent = t('shop.level', { current: String(currentLevel), max: String(upgrade.maxLevel) });
    progressRow.appendChild(levelEl);
    progressRow.appendChild(createShopLevelSegments(currentLevel, upgrade.maxLevel));
    cardInner.appendChild(progressRow);

    const buyRow = document.createElement('div');
    buyRow.style.cssText = 'display:flex;justify-content:center;align-items:center;width:46%;flex-shrink:0;';

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

    cardInner.appendChild(buyRow);
    card.appendChild(cardInner);
    grid.appendChild(card);
  }

  itemListPanel.appendChild(grid);
  shopStage.appendChild(itemListPanel);
  shopOverlayEl.appendChild(shopStage);

  document.body.appendChild(shopOverlayEl);

  const syncShopOverlayLayout = () => {
    syncShopPanelLayout(shopStage, itemListPanel, grid);
  };

  requestAnimationFrame(() => {
    syncShopOverlayLayout();
    requestAnimationFrame(syncShopOverlayLayout);
  });

  // 旋转 / 改窗时重排列数与面板宽度（窄屏 2 列 ↔ 宽屏 4 列）。
  shopGridResizeHandler = syncShopOverlayLayout;
  window.addEventListener('resize', shopGridResizeHandler);
}

function hideShopOverlay(): void {
  if (shopGridResizeHandler) {
    window.removeEventListener('resize', shopGridResizeHandler);
    shopGridResizeHandler = null;
  }
  shopOverlayEl?.remove();
  shopOverlayEl = null;
}

// =============================================================================
// Quests Overlay
// =============================================================================

type QuestCategory = 'all' | 'challenge' | 'growth' | 'wealth' | 'weapons';

/**
 * 任务分类标签图标。新美术统一为单一变体（黑色描边），不再区分 normal/selected。
 * 按钮的选中态由外框（橙 vs 灰）单独承担。
 */
const QUEST_CATEGORY_ICONS: Record<QuestCategory, string> = {
  all: '/ui/quests/tab_task_all.png',
  challenge: '/ui/quests/tab_task_challenge_normal.png',
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
  const labelLayout = `
    position:absolute;left:0;top:0;width:100%;height:100%;
    display:flex;align-items:center;justify-content:center;
    font-size:clamp(10px,2.5vw,12px);font-weight:bold;line-height:1;
    padding:0 clamp(2px,0.6vw,4px);box-sizing:border-box;text-align:center;
    pointer-events:none;
  `;
  labelEl.style.cssText = state === 'claimed'
    ? `${labelLayout}color:${config.color};`
    : uiPlainText(labelLayout.replace(/\s+/g, ' ').trim());

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
  // Quest_item_bg.svg 底部装饰浪占 SVG 高 13.1% + 灰阴影底 6.7%。
  // padding-bottom 留 13% × rowHeight + 几像素呼吸，避免文字/进度条压在浪和阴影上。
  // 所有状态用同一行高：SVG 用 9-slice 风格的整图拉伸（preserveAspectRatio=none），
  // 不同高度会让 9954×1241 主板被纵向压扁，已领取行视觉上就会"背景缩水"。
  const rowMinHeight = 'clamp(68px,15.5vw,84px)';

  const row = document.createElement('div');
  row.style.cssText = `
    position:relative;box-sizing:border-box;width:100%;overflow:visible;
    min-height:${rowMinHeight};
    padding:clamp(7px,1.8vw,10px) clamp(10px,3vw,14px) clamp(10px,3vw,14px) clamp(12px,3.2vw,16px);
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
  descEl.style.cssText = uiPlainText('font-size:clamp(11px,2.8vw,13px);line-height:1.4;');
  descEl.textContent = t(quest.description);
  infoEl.appendChild(descEl);

  if (!progress.completed) {
    const progressBarContainer = document.createElement('div');
    // 占满 infoEl（右侧奖励列已固定宽度 → 各行 infoEl 宽度一致），进度条统一且尽量靠右。
    progressBarContainer.style.cssText = 'position:relative;width:100%;max-width:100%;height:clamp(14px,3.6vw,18px);margin-top:4px;overflow:visible;';
    const pct = Math.min(100, (progress.current / quest.target) * 100);
    // 9-slice：端帽固定、中段拉伸，进度条可加长且圆角不畸变。
    mountSvgBarSliced(progressBarContainer, BAR_ASSETS.quest.track, BAR_ASSETS.quest.fill, { slice: '0 6 fill', capPx: 7 }).set(pct);
    // 小旗子单独叠在左侧，保持原始宽高比（不随进度条横向拉伸）。
    const questFlag = document.createElement('img');
    questFlag.src = BAR_ASSETS.quest.flag;
    questFlag.alt = '';
    questFlag.draggable = false;
    // 旗子相对进度条中心略向上偏 2px，避免视觉上压在进度条下沿。
    questFlag.style.cssText = 'position:absolute;left:-1px;top:50%;transform:translate(0,calc(-50% - 4px));height:150%;width:auto;pointer-events:none;user-select:none;display:block;';
    progressBarContainer.appendChild(questFlag);
    infoEl.appendChild(progressBarContainer);

    const progressText = document.createElement('div');
    progressText.style.cssText = uiPlainText('font-size:clamp(9px,2.2vw,10px);margin-top:2px;');
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
  rewardText.style.cssText = uiPlainText(`
    font-size:clamp(9px,2.2vw,11px);line-height:1.3;
    text-align:right;width:clamp(56px,15vw,76px);flex-shrink:0;
    word-break:break-word;
  `);
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

function createQuestCategoryButton(
  iconSrc: string,
  label: string,
  selected: boolean,
  onClick: () => void,
): HTMLDivElement {
  const btn = document.createElement('div');
  btn.setAttribute('role', 'button');
  btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
  btn.style.cssText = `
    position:relative;width:100%;min-height:36px;min-width:36px;
    display:flex;align-items:center;justify-content:center;
    cursor:pointer;user-select:none;touch-action:manipulation;transition:transform 0.15s;
  `;

  const visual = document.createElement('div');
  visual.style.cssText = 'position:relative;width:100%;flex-shrink:0;';

  const frame = document.createElement('img');
  frame.setAttribute('data-quest-cat-frame', 'true');
  frame.src = selected ? TIER_SELECT_BUTTON_NORMAL : QUEST_CATEGORY_BUTTON_NORMAL;
  frame.alt = '';
  frame.draggable = false;
  frame.style.cssText = 'display:block;width:100%;height:auto;pointer-events:none;';

  // button_*.svg 顶面在 viewBox 内 y=66..570（占 9.8%..84.6%），视觉中心 ≈ 47%。
  // 用 top:14%; bottom:20% 让 content 几何中心 = (14% + 80%) / 2 = 47%，
  // 图标 + 文字才会和按钮顶面真正居中（老的 20%/8% 中心在 56%，偏下贴阴影）。
  const content = document.createElement('div');
  content.style.cssText = `
    position:absolute;left:0;right:0;top:14%;bottom:20%;
    display:flex;align-items:center;justify-content:center;
    gap:clamp(2px,0.6vw,4px);pointer-events:none;
    padding:0 clamp(3px,0.8vw,6px);box-sizing:border-box;max-width:100%;
  `;

  const icon = document.createElement('img');
  icon.src = iconSrc;
  icon.alt = '';
  icon.draggable = false;
  icon.style.cssText = 'display:block;width:clamp(14px,4vw,18px);height:clamp(14px,4vw,18px);object-fit:contain;flex-shrink:0;';

  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  labelEl.style.cssText = uiPlainText(`
    font-size:clamp(9px,2.2vw,11px);font-weight:bold;line-height:1.25;
    white-space:nowrap;overflow:visible;text-overflow:ellipsis;min-width:0;
  `);

  content.appendChild(icon);
  content.appendChild(labelEl);
  visual.appendChild(frame);
  visual.appendChild(content);
  btn.appendChild(visual);
  btn.addEventListener('click', onClick);
  btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.05)'; });
  btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; });
  return btn;
}

function updateQuestCategoryButtonStyle(
  btn: HTMLDivElement,
  selected: boolean,
): void {
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

  ensureTransparentScrollbarStyles();

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
    box-sizing:border-box;width:min(96vw,840px);margin:0 auto;overflow:hidden;  `;

  const panelRow = document.createElement('div');
  panelRow.style.cssText = `
    flex:1;min-height:0;width:100%;display:flex;justify-content:center;
    box-sizing:border-box;
  `;

  const panelUnit = document.createElement('div');
  panelUnit.style.cssText = `
    display:flex;align-items:flex-start;justify-content:center;
    height:100%;max-height:100%;min-height:0;width:100%;max-width:100%;
    box-sizing:border-box;
  `;

  const panelCluster = document.createElement('div');
  panelCluster.style.cssText = `
    display:flex;align-items:flex-start;gap:clamp(4px,1vw,6px);
    height:100%;max-height:100%;max-width:100%;min-width:0;
    box-sizing:border-box;
  `;

  const questListPanel = document.createElement('div');
  questListPanel.style.cssText = `
    position:relative;box-sizing:border-box;overflow:hidden;flex-shrink:1;
    height:100%;max-height:100%;min-width:0;
    aspect-ratio:${QUEST_LIST_PANEL_SIZE.w}/${QUEST_LIST_PANEL_SIZE.h};
    background:url(${QUEST_LIST_PANEL_BG}) center center/contain no-repeat;
  `;

  const questListScroll = document.createElement('div');
  questListScroll.className = UI_SCROLLBAR_TRANSPARENT_CLASS;
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
  panelCluster.appendChild(categorySidebar);
  panelCluster.appendChild(questListPanel);
  panelUnit.appendChild(panelCluster);
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

  const levelName = levelNameForTier(selectedTier);
  const tierLevel = loadedLevelsByName.get(levelName);
  const fallbackLevel = loadedLevelsByName.get(DEFAULT_LEVEL_NAME);
  if (tierLevel) {
    loadedLevel = tierLevel;
    loadedLevelName = levelName;
  } else if (fallbackLevel) {
    loadedLevel = fallbackLevel;
    loadedLevelName = DEFAULT_LEVEL_NAME;
    console.warn(`[Level] Missing ${levelName}, fallback to ${DEFAULT_LEVEL_NAME}.`);
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
  session.start({ startTickLoop: false });
  scene.playStartIntro(() => session.startTicks());

  // Set tier badge text after start
  scene.setTierBadge(selectedTier);
}

// =============================================================================
// Bootstrap
// =============================================================================

// =============================================================================
// 启动 loading 进度条
// =============================================================================
// 旧行为：boot 期间（加载所有模型 + 关卡）整屏停在 index.html 的纯蓝背景，无任何反馈，
// 手机慢网下几十秒白屏，用户易以为卡死退出。这里加一个进度浮层，由 bootLoadingManager
// 的 onProgress 汇总「已加载/总数」驱动，进度只增不减（新 load 入队会抬高 total，避免回跳）。
let bootLoadingOverlay: HTMLDivElement | null = null;
let bootLoadingBar: HTMLDivElement | null = null;
let bootLoadingPct = 0;

function showBootLoadingOverlay(): void {
  const overlay = document.createElement('div');
  overlay.id = 'boot-loading';
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:5000;display:flex;flex-direction:column;align-items:center;' +
    'justify-content:center;gap:18px;background:#87ceeb;color:#fff;' +
    `font-family:${UI_FONT_FACE};`;

  const title = document.createElement('div');
  title.textContent = t('game.title');
  // 主菜单游戏标题（loading 屏 / 大 logo 字）：32–64px 用 2px 8 向描边统一卡通厚度感。
  title.style.cssText = uiPlainTextBold('font-size:clamp(32px,10vw,64px);font-weight:700;letter-spacing:2px;');

  const track = document.createElement('div');
  track.style.cssText =
    'width:min(70vw,420px);height:14px;border:3px solid rgba(0,0,0,0.5);border-radius:8px;' +
    'background:rgba(0,0,0,0.2);overflow:hidden;';
  const bar = document.createElement('div');
  bar.style.cssText = 'width:0%;height:100%;background:#ffd93b;transition:width 0.2s ease-out;';
  track.appendChild(bar);

  const hint = document.createElement('div');
  hint.textContent = 'Loading…';
  hint.style.cssText = 'font-size:clamp(8px,2.5vw,11px);opacity:0.85;';

  overlay.appendChild(title);
  overlay.appendChild(track);
  overlay.appendChild(hint);
  document.body.appendChild(overlay);

  bootLoadingOverlay = overlay;
  bootLoadingBar = bar;
  bootLoadingPct = 0;
}

function setBootLoadingProgress(pct: number): void {
  // 单调不减：load 队列 total 会随阶段增长导致比例回跳，这里取历史最大值平滑显示。
  const clamped = Math.max(bootLoadingPct, Math.min(100, Math.round(pct)));
  bootLoadingPct = clamped;
  if (bootLoadingBar) bootLoadingBar.style.width = `${clamped}%`;
}

function hideBootLoadingOverlay(): void {
  setBootLoadingProgress(100);
  const overlay = bootLoadingOverlay;
  if (!overlay) return;
  bootLoadingOverlay = null;
  bootLoadingBar = null;
  overlay.style.transition = 'opacity 0.35s ease-out';
  overlay.style.opacity = '0';
  window.setTimeout(() => overlay.remove(), 400);
}

async function main(): Promise<void> {
  const i18nMode = (import.meta.env.VITE_I18N_MODE as I18nMode | undefined) ?? 'locked';
  const i18nLocale = import.meta.env.VITE_I18N_LOCALE as string | undefined;

  await ensureGameUIFontsLoaded();

  initI18n({
    locales: { zh: zhLocale, en: enLocale },
    defaultLocale: 'en',
    fallbackLocale: 'en',
    mode: i18nMode,
    locale: i18nLocale,
  });

  showBootLoadingOverlay();
  // 进度封顶 95%，留最后 5% 给关卡解析 / 主菜单构建，hide 时补满到 100%。
  bootLoadingManager.onProgress = (_url, loaded, total) => {
    if (total > 0) setBootLoadingProgress((loaded / total) * 95);
  };
  bootLoadingManager.onError = (url) => console.warn('[Boot] asset failed:', url);

  try {
    await loadModels();
    // 默认关卡（whitebox）必须加载成功。
    await tryLoadLevel(DEFAULT_LEVEL_NAME);
    // Hard 测试关（stage2）尽力预加载；缺失时不阻塞启动。
    try {
      await tryLoadLevel(HARD_TEST_LEVEL_NAME);
    } catch (error) {
      console.warn(`[Level] Optional hard test level "${HARD_TEST_LEVEL_NAME}" preload failed:`, error);
    }
    // 菜单默认回到第一关关卡上下文。
    await tryLoadLevel(DEFAULT_LEVEL_NAME);
  } finally {
    hideBootLoadingOverlay();
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
    unlockAllCharacters() { gmUnlockAllCharacters(); },
    listWeapons() { console.log('[GM] 可选武器:\n' + ALL_WEAPON_TYPES.map((t) => `  ${t.padEnd(16)} ${GM_WEAPON_LABELS[t]}`).join('\n')); },
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
                      — 加指定武器（type 见 .listWeapons()，槽位不足自动扩容）
  .listWeapons()      — 列出全部 12 把可选武器（id + 中文名）
  .giveAllWeapons()   — 一键塞满全部武器
  .unlockAllCharacters()
                    — 解锁全部角色
  .testLightning()    — 在玩家头顶劈一道电（VFX 测试）
  .showCollision()    — 切换碰撞盒可视化（绿 col_ / 红 wall_ /
                        蓝 climb_ / 黄 ramp_ / 品红 spawn_*）
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
  'pistol',
  'lightning_staff',
  'flame_ring',
  'shotgun',
  'ray_gun',
  'poison_bomb',
  'paralysis_gun',
  'void_ripple',
  'scorch_boots',
] as const;

const GM_WEAPON_LABELS: Record<(typeof ALL_WEAPON_TYPES)[number], string> = {
  sword: '大剑',
  bone_bouncer: '弹射骨头',
  axe: '旋转飞斧',
  pistol: '手枪',
  lightning_staff: '闪电法杖',
  flame_ring: '烈焰环',
  shotgun: '霰弹枪',
  ray_gun: '射线枪',
  poison_bomb: '毒气弹',
  paralysis_gun: '麻痹枪',
  void_ripple: '虚空涟漪',
  scorch_boots: '灼地靴',
};

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
  // GM 工具：槽位不足时自动扩容，保证选中的武器一定能加上
  if (player.weapons.length >= player.maxWeaponSlots) {
    player.maxWeaponSlots = player.weapons.length + 1;
  }
  player.weapons.push({
    type: type as typeof ALL_WEAPON_TYPES[number],
    level,
    cooldownTimer: 0,
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
      player.weapons.push({ type, level: 1, cooldownTimer: 0 });
    }
  }
  console.log(`[GM] All weapons granted (${player.weapons.length}/${player.maxWeaponSlots})`);
}

function gmUnlockAllCharacters(): void {
  const save = loadSave();
  save.charactersUnlocked = [...CHARACTER_ORDER];
  saveSave(save);
  if (characterSelectSlotsHost) mountCharacterSelectSlots(characterSelectSlotsHost);
  refreshCharacterSelectUI();
  console.log('[GM] All characters unlocked');
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
    ['解锁全部角色', gmUnlockAllCharacters],
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

  // ── 自选武器（任意武器 + 任意等级）──
  const picker = document.createElement('div');
  picker.style.cssText = 'margin-top:6px;padding-top:6px;border-top:1px dashed #0f0;display:flex;flex-direction:column;gap:4px;';

  const pickerTitle = document.createElement('div');
  pickerTitle.style.cssText = 'color:#ff0;font-size:11px;';
  pickerTitle.textContent = '自选武器';
  picker.appendChild(pickerTitle);

  const weaponSelect = document.createElement('select');
  weaponSelect.style.cssText = 'background:#222;color:#0f0;border:1px solid #0f0;border-radius:4px;font-family:monospace;font-size:11px;padding:3px;';
  for (const type of ALL_WEAPON_TYPES) {
    const opt = document.createElement('option');
    opt.value = type;
    opt.textContent = `${GM_WEAPON_LABELS[type]} (${type})`;
    weaponSelect.appendChild(opt);
  }
  picker.appendChild(weaponSelect);

  const levelRow = document.createElement('div');
  levelRow.style.cssText = 'display:flex;align-items:center;gap:4px;';
  const levelLabel = document.createElement('span');
  levelLabel.style.cssText = 'font-size:11px;';
  levelLabel.textContent = '等级';
  const levelInput = document.createElement('input');
  levelInput.type = 'number';
  levelInput.min = '1';
  levelInput.value = '5';
  levelInput.style.cssText = 'width:48px;background:#222;color:#0f0;border:1px solid #0f0;border-radius:4px;font-family:monospace;font-size:11px;padding:3px;';
  levelRow.appendChild(levelLabel);
  levelRow.appendChild(levelInput);
  picker.appendChild(levelRow);

  const addBtn = document.createElement('button');
  addBtn.style.cssText = 'background:#222;color:#0f0;border:1px solid #0f0;padding:4px 8px;border-radius:4px;cursor:pointer;font-family:monospace;font-size:11px;text-align:center;font-weight:bold;';
  addBtn.textContent = '＋ 添加该武器';
  addBtn.addEventListener('click', () => {
    const level = Math.max(1, Math.floor(Number(levelInput.value) || 1));
    gmGiveWeapon(weaponSelect.value, level);
  });
  addBtn.addEventListener('mouseenter', () => { addBtn.style.background = '#0f0'; addBtn.style.color = '#000'; });
  addBtn.addEventListener('mouseleave', () => { addBtn.style.background = '#222'; addBtn.style.color = '#0f0'; });
  picker.appendChild(addBtn);

  gmPanel.appendChild(picker);

  document.body.appendChild(gmPanel);
}

setupGMTool();
