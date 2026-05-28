/// <reference types="vite/client" />
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
// @ts-ignore
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
// @ts-ignore
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import {
  GameInstance,
  TICK_INTERVAL_MS,
  MAX_ENEMIES,
  MAX_PROJECTILES,
  MAX_PICKUPS,
  DEFAULT_GAME_CONFIG,
  CHARACTER_CONFIGS,
  WEAPON_EVOLUTIONS,
  SHOP_UPGRADES,
  QUESTS,
  TIER_CONFIGS,
  loadSave,
  purchaseUpgrade,
  getUpgradeCost,
  canAfford,
  getQuestProgress,
  getCompletedQuestCount,
  checkQuestCompletion,
  type GameConfig,
  type GameState,
  type GameResult,
  type InputState,
  type EnemyState,
  type EnemyType,
  type ProjectileState,
  type PickupState,
  type PickupType,
  type BossState,
  type DamageEvent,
  type UpgradeOption,
  type GamePhase,
  type UpgradeRarity,
  type CharacterType,
  type TeleporterState,
  type DifficultyTier,
} from '@minigame/core';
import { PlatformInput } from '@minigame/platform';
import { installThreeHighDpi } from '@minigame/render-adapter';
import { initI18n, t, mountDevtools } from '@minigame/i18n';
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
  revolver: 0xffdd00,
  bow: 0x8b4513,
  lightning_staff: 0x44aaff,
  fire_staff: 0xff4400,
  flame_ring: 0xff6600,
  tornado: 0x88ccaa,
  shotgun: 0xffee44,
  black_hole: 0x220044,
  katana: 0xeeeeff,
  aura: 0x44ffaa,
};

const PICKUP_COLORS: Record<string, number> = {
  xp_green: 0x00ff66,
  xp_blue: 0x22aaff,
  xp_purple: 0xcc44ff,
  xp_orange: 0xffaa00,
  silver: 0xeeeeee,
};

const RARITY_COLORS: Record<string, string> = {
  common: '#aaaaaa',
  uncommon: '#44cc44',
  rare: '#4488ff',
  legendary: '#ffaa00',
};

const CHARACTER_COLORS: Record<string, number> = {
  megachad: 0xf5d680,
  roberto: 0x8844aa,
  skateboard_skeleton: 0xd4a574,
};

const GROUND_SIZE = 120;
const DAMAGE_NUM_POOL_SIZE = 30;

// =============================================================================
// Toon/Cel-Shading Utilities
// =============================================================================

/** 3-step gradient map for MeshToonMaterial (shadow / mid / highlight) */
function createToonGradientMap(): THREE.DataTexture {
  const colors = new Uint8Array([40, 150, 255]); // 3 discrete light steps
  const gradMap = new THREE.DataTexture(colors, 3, 1, THREE.RedFormat);
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
function convertToToonMaterials(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const toonMats = materials.map((mat) => {
      if (mat instanceof THREE.MeshToonMaterial) return mat; // already toon
      const oldMat = mat as THREE.MeshStandardMaterial | THREE.MeshPhongMaterial | THREE.MeshLambertMaterial;
      const toon = new THREE.MeshToonMaterial({
        color: oldMat.color ?? new THREE.Color(0xffffff),
        map: oldMat.map ?? null,
        gradientMap: toonGradientMap,
        side: oldMat.side ?? THREE.FrontSide,
        transparent: oldMat.transparent ?? false,
        opacity: oldMat.opacity ?? 1,
      });
      toon.name = oldMat.name || 'ToonMat';
      return toon;
    });
    mesh.material = toonMats.length === 1 ? toonMats[0] : toonMats;
  });
}

const WEAPON_ICONS: Record<string, string> = {
  sword: '⚔️',
  bone_bouncer: '🦴',
  axe: '🪓',
  revolver: '🔫',
  bow: '🏹',
  lightning_staff: '⚡',
  fire_staff: '🔥',
  flame_ring: '🔥',
  tornado: '🌪️',
  shotgun: '💥',
  black_hole: '🕳️',
  katana: '⚔️',
  aura: '✨',
};

const TOME_ICONS: Record<string, string> = {
  attack_speed_tome: '⚡',
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
}

// =============================================================================
// GameScene - Three.js Rendering
// =============================================================================

export class GameScene {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly outlineEffect: any; // OutlineEffect
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
  private playerSpotLight!: THREE.SpotLight;

  // Weapon orbs
  private weaponOrbMesh!: THREE.InstancedMesh;
  private readonly MAX_WEAPON_ORBS = 6;

  // Animation state
  private deathAnimTimer = 0;
  private levelUpAnimTimer = 0;
  private wasAlive = true;
  private wasGrounded = true; // Track grounded state for jump animation trigger
  private lastPhase: GamePhase = 'playing';
  private screenFlashEl: HTMLDivElement | null = null;

  // Player skeletal animation
  private playerMixer: THREE.AnimationMixer | null = null;
  private playerAnimations: Map<string, THREE.AnimationAction> = new Map();
  private currentPlayerAnim: string = '';

  // Teleporter meshes
  private teleporterMeshes: THREE.Mesh[] = [];
  private teleporterGlowMeshes: THREE.Mesh[] = [];

  // InstancedMeshes
  // Enemy rendering — individual cloned models (preserves full materials)
  private enemyMeshes: Map<string, THREE.InstancedMesh> = new Map(); // legacy, kept for type compat
  private enemyObjects: Map<number, THREE.Object3D> = new Map(); // id → cloned model
  private enemyPool: Map<string, THREE.Object3D[]> = new Map(); // type → available pool
  private enemyMixers: Map<number, THREE.AnimationMixer> = new Map(); // id → animation mixer
  private enemyAnimStates: Map<number, string> = new Map(); // id → current anim name
  private enemyAnimActions: Map<number, Map<string, THREE.AnimationAction>> = new Map(); // id → actions map
  private projectileMesh!: THREE.InstancedMesh;
  private pickupMesh!: THREE.InstancedMesh;

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

  // DOM overlays
  private hudContainer!: HTMLDivElement;
  private hpBar!: HTMLDivElement;
  private hpBarInner!: HTMLDivElement;
  private xpBar!: HTMLDivElement;
  private xpBarInner!: HTMLDivElement;
  private xpNumbers!: HTMLDivElement;
  private levelLabel!: HTMLDivElement;
  private timerLabel!: HTMLDivElement;
  private killLabel!: HTMLDivElement;
  private silverLabel!: HTMLDivElement;
  private weaponSlotsContainer!: HTMLDivElement;
  private tomesSlotsContainer!: HTMLDivElement;
  private bossHpContainer!: HTMLDivElement;
  private bossHpBarInner!: HTMLDivElement;
  private bossNameLabel!: HTMLDivElement;
  private bossPhaseMarkers!: HTMLDivElement;
  private tierBadge!: HTMLDivElement;
  private teleporterIndicator!: HTMLDivElement;
  private pauseBtn!: HTMLDivElement;
  private upgradePanel: HTMLDivElement | null = null;
  private gameOverPanel: HTMLDivElement | null = null;
  private damageNums: HTMLDivElement[] = [];
  private damageNumIndex = 0;
  private finalSwarmLabel: HTMLDivElement | null = null;
  private finalSwarmBorder: HTMLDivElement | null = null;
  private lastXp = 0;
  private xpFlashTimer = 0;

  // State
  private isPaused = false;
  private jumpKeyDown = false;
  private slideKeyDown = false;
  private lastTime = 0;
  private frameDt = 1 / 60;

  // Dying enemies (death animation tracking)
  private dyingEnemies: Map<number, { obj: THREE.Object3D; timer: number; type: string }> = new Map();

  // Boss attack warning elements
  private bossWarningRing: THREE.Mesh | null = null;
  private bossAoeFlashTimer = 0;

  // Combo HUD elements
  private comboLabel: HTMLDivElement | null = null;
  private comboFadeTimer = 0;
  private lastComboCount = 0;

  // Advanced Camera System
  private cameraAngle = 0;
  private ghostTargetX = 0;
  private ghostTargetZ = 0;
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
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    this.renderer.domElement.style.display = 'block';
    this.container.appendChild(this.renderer.domElement);

    // Outline Effect (cel-shading edge lines)
    this.outlineEffect = new OutlineEffect(this.renderer, {
      defaultThickness: 0.003,
      defaultColor: [0, 0, 0],
      defaultAlpha: 0.9,
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
      if (e.code === 'ShiftLeft' || e.code === 'ControlLeft') { this.slideKeyDown = true; }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') { this.jumpKeyDown = false; }
      if (e.code === 'ShiftLeft' || e.code === 'ControlLeft') { this.slideKeyDown = false; }
    });
  }

  start(): void {
    this.setupLighting();
    this.setupGround();
    this.setupPlayer();
    this.setupWeaponOrbs();
    this.setupEnemyMeshes();
    this.setupProjectileMesh();
    this.setupPickupMesh();
    this.setupVFX();
    this.setupHUD();
    this.setupDamageNumbers();

    this.removeDisplayListener = installThreeHighDpi({
      renderer: this.renderer,
      container: this.container,
      onResize: ({ width, height }) => {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
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
    this.removeDisplayListener?.();
    this.platformInput.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.hudContainer?.remove();
    this.upgradePanel?.remove();
    this.gameOverPanel?.remove();
    this.finalSwarmLabel?.remove();
    this.finalSwarmBorder?.remove();
    this.screenFlashEl?.remove();
    this.comboLabel?.remove();
    for (const el of this.damageNums) el.remove();
  }

  // ===========================================================================
  // Setup
  // ===========================================================================

  private setupLighting(): void {
    // Bright ambient — lifts overall scene brightness
    const ambient = new THREE.AmbientLight('#ffffff', 0.9);
    ambient.name = 'AmbientLight';
    this.scene.add(ambient);

    // Strong warm directional sunlight with shadows
    const dir = new THREE.DirectionalLight('#FFF5E0', 2.0);
    dir.name = 'DirectionalLight';
    dir.position.set(5, 10, 5);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.bias = -0.001;
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 80;
    dir.shadow.camera.left = -60;
    dir.shadow.camera.right = 60;
    dir.shadow.camera.top = 60;
    dir.shadow.camera.bottom = -60;
    this.scene.add(dir);

    // Sky/ground hemisphere bounce light
    const hemi = new THREE.HemisphereLight('#87CEEB', '#8B7355', 1.2);
    hemi.name = 'HemisphereLight';
    this.scene.add(hemi);

    // Secondary hemisphere for extra sky/ground bounce
    const hemi2 = new THREE.HemisphereLight('#87CEEB', '#8B7355', 0.5);
    hemi2.name = 'HemisphereLight_Bounce';
    this.scene.add(hemi2);

    // Player spotlight (softer, warm tint)
    this.playerSpotLight = new THREE.SpotLight('#FFF5E0', 0.3, 25, Math.PI / 5, 0.6, 1);
    this.playerSpotLight.name = 'PlayerSpotLight';
    this.playerSpotLight.position.set(0, 12, 0);
    this.scene.add(this.playerSpotLight);
    this.scene.add(this.playerSpotLight.target);
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
    // 2. Build the cyberpunk arena from loaded models
    // =========================================================================
    this.buildArena();

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
    const charColor = CHARACTER_COLORS[state.character] ?? 0xf5d680;

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
          color.setHSL(hsl.h, Math.min(hsl.s * 1.6, 1.0), hsl.l);
          const toon = new THREE.MeshToonMaterial({
            color,
            map: oldMat.map ?? null,
            gradientMap: toonGradientMap,
            side: oldMat.side ?? THREE.FrontSide,
          });
          toon.name = 'PlayerToon';
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
    const geo = new THREE.OctahedronGeometry(0.35, 0);
    const mat = new THREE.MeshToonMaterial({ color: 0x00ff66, gradientMap: toonGradientMap });
    this.pickupMesh = new THREE.InstancedMesh(geo, mat, MAX_PICKUPS);
    this.pickupMesh.name = 'Pickups';
    this.pickupMesh.count = 0;
    this.pickupMesh.frustumCulled = false;
    this.scene.add(this.pickupMesh);
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

    // Load particle texture
    const textureLoader = new THREE.TextureLoader();
    this.vfxTexture = textureLoader.load('/textures/particle_circle.png');

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
  }

  // ===========================================================================
  // HUD
  // ===========================================================================

  private setupHUD(): void {
    this.hudContainer = document.createElement('div');
    this.hudContainer.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:100;font-family:Arial,sans-serif;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);box-sizing:border-box;';
    document.body.appendChild(this.hudContainer);

    // HP bar (top-center)
    const hpContainer = document.createElement('div');
    hpContainer.style.cssText = 'position:absolute;top:12px;left:50%;transform:translateX(-50%);width:200px;height:16px;background:rgba(40,40,40,0.8);border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,0.2);';
    this.hpBarInner = document.createElement('div');
    this.hpBarInner.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#cc2222,#ff4444);transition:width 0.15s;border-radius:8px;';
    hpContainer.appendChild(this.hpBarInner);
    this.hpBar = hpContainer;
    this.hudContainer.appendChild(hpContainer);

    // XP bar (bottom-center)
    const xpContainer = document.createElement('div');
    xpContainer.style.cssText = 'position:absolute;bottom:16px;left:50%;transform:translateX(-50%);width:260px;height:12px;background:rgba(40,40,40,0.8);border-radius:6px;overflow:hidden;border:1px solid rgba(255,255,255,0.15);';
    this.xpBarInner = document.createElement('div');
    this.xpBarInner.style.cssText = 'width:0%;height:100%;background:linear-gradient(90deg,#cc9900,#ffcc00);transition:width 0.15s;border-radius:6px;';
    xpContainer.appendChild(this.xpBarInner);
    this.xpBar = xpContainer;
    this.hudContainer.appendChild(xpContainer);

    // XP numbers above XP bar
    this.xpNumbers = document.createElement('div');
    this.xpNumbers.style.cssText = 'position:absolute;bottom:30px;left:50%;transform:translateX(-50%);color:#cccccc;font-size:10px;text-shadow:0 1px 3px rgba(0,0,0,0.8);white-space:nowrap;';
    this.hudContainer.appendChild(this.xpNumbers);

    // Level label (prominent, above XP numbers)
    this.levelLabel = document.createElement('div');
    this.levelLabel.style.cssText = 'position:absolute;bottom:42px;left:50%;transform:translateX(-50%);color:#ffcc00;font-size:18px;font-weight:bold;text-shadow:0 0 8px rgba(255,200,0,0.4),0 1px 3px rgba(0,0,0,0.8);transition:color 0.3s;';
    this.hudContainer.appendChild(this.levelLabel);

    // Timer (top-right, pill background)
    this.timerLabel = document.createElement('div');
    this.timerLabel.style.cssText = 'position:absolute;top:12px;right:16px;color:#ffffff;font-size:clamp(10px, 2.5vw, 18px);font-weight:bold;text-shadow:0 1px 3px rgba(0,0,0,0.8);background:rgba(20,20,40,0.7);padding:4px 12px;border-radius:12px;';
    this.hudContainer.appendChild(this.timerLabel);

    // Kill count (below timer)
    this.killLabel = document.createElement('div');
    this.killLabel.style.cssText = 'position:absolute;top:42px;right:16px;color:#cccccc;font-size:clamp(10px, 2.5vw, 14px);text-shadow:0 1px 3px rgba(0,0,0,0.8);';
    this.hudContainer.appendChild(this.killLabel);

    // Silver earned this run (below kills)
    this.silverLabel = document.createElement('div');
    this.silverLabel.style.cssText = 'position:absolute;top:62px;right:16px;color:#eeeeaa;font-size:clamp(10px, 2.5vw, 13px);text-shadow:0 1px 3px rgba(0,0,0,0.8);';
    this.hudContainer.appendChild(this.silverLabel);

    // Tier badge (top-left small)
    this.tierBadge = document.createElement('div');
    this.tierBadge.style.cssText = 'position:absolute;top:12px;left:16px;color:#ffffff;font-size:11px;font-weight:bold;background:rgba(40,40,60,0.8);padding:3px 8px;border-radius:4px;border:1px solid #555;';
    this.hudContainer.appendChild(this.tierBadge);

    // Weapon slots container (bottom-left)
    this.weaponSlotsContainer = document.createElement('div');
    this.weaponSlotsContainer.style.cssText = 'position:absolute;bottom:70px;left:12px;display:flex;gap:4px;flex-wrap:wrap;max-width:240px;';
    this.hudContainer.appendChild(this.weaponSlotsContainer);

    // Tome slots container (bottom-right, above mobile buttons)
    this.tomesSlotsContainer = document.createElement('div');
    this.tomesSlotsContainer.style.cssText = 'position:absolute;bottom:70px;right:12px;display:flex;gap:3px;flex-wrap:wrap;max-width:180px;justify-content:flex-end;';
    this.hudContainer.appendChild(this.tomesSlotsContainer);

    // Boss HP bar (top-center, hidden by default)
    this.bossHpContainer = document.createElement('div');
    this.bossHpContainer.style.cssText = 'position:absolute;top:36px;left:50%;transform:translateX(-50%);width:60%;max-width:500px;height:22px;background:rgba(20,20,20,0.9);border-radius:4px;overflow:hidden;border:1px solid rgba(255,100,0,0.4);display:none;';
    this.bossHpBarInner = document.createElement('div');
    this.bossHpBarInner.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#cc3300,#ff6600);transition:width 0.2s;border-radius:4px;';
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

    // Pause button
    this.pauseBtn = document.createElement('div');
    this.pauseBtn.style.cssText = 'position:absolute;top:86px;right:16px;color:#ffffff;font-size:clamp(10px, 2.5vw, 16px);background:rgba(80,80,120,0.6);padding:8px 16px;border-radius:4px;cursor:pointer;pointer-events:auto;user-select:none;min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center;';
    this.pauseBtn.textContent = t('hud.pause');
    this.pauseBtn.addEventListener('click', () => this.togglePause());
    this.hudContainer.appendChild(this.pauseBtn);

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
      this.outlineEffect.render(this.scene, this.camera);
      return;
    }

    const state = this.session.getRenderState();

    if (state.phase === 'playing' || state.phase === 'boss_fight') {
      this.handleInput();
    }

    this.renderPlayer(state);
    this.renderEnemies(state.enemies);
    this.renderProjectiles(state.projectiles);
    this.renderPickups(state.pickups);
    this.renderBoss(state.boss);
    this.renderTeleporters(state.teleporters);
    this.updateVFX(state, dt);
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

    this.outlineEffect.render(this.scene, this.camera);
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

    // Fixed camera angle: WASD is world-space movement directly.
    // Camera looks from -Z toward +Z, so:
    // W(up on screen/joystick) = +Z (into screen = forward)
    // S(down) = -Z, A(left) = -X, D(right) = +X
    // PlatformInput: moveY negative = up on joystick/W key
    // Need to FLIP moveY so W = +Z (forward into screen)
    const input: InputState = {
      moveX: -mx,
      moveY: -my,
      dash: false,
      skill1: raw.action3 ?? false,
      skill2: false,
      jump: this.jumpKeyDown || (raw.action1 ?? false),
      slide: this.slideKeyDown || (raw.action2 ?? false),
    };
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

      // === Invincibility flash ===
      if (p.invincibleTimer > 0) {
        this.playerMesh.visible = Math.sin(time * 20) > 0;
      }

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

    // === Weapon orbs ===
    this.renderWeaponOrbs(state);
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
  }

  private triggerScreenFlash(color: string, duration: number): void {
    if (this.screenFlashEl) {
      this.screenFlashEl.remove();
    }
    this.screenFlashEl = document.createElement('div');
    this.screenFlashEl.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:150;background:${color};opacity:0.4;transition:opacity ${duration}s ease-out;`;
    document.body.appendChild(this.screenFlashEl);

    // Force reflow then fade out
    void this.screenFlashEl.offsetWidth;
    this.screenFlashEl.style.opacity = '0';

    const el = this.screenFlashEl;
    setTimeout(() => {
      el.remove();
      if (this.screenFlashEl === el) {
        this.screenFlashEl = null;
      }
    }, duration * 1000 + 50);
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

    // Hide InstancedMesh (legacy — keep count at 0)
    for (const [, mesh] of this.enemyMeshes) {
      mesh.count = 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private renderProjectiles(projectiles: ProjectileState[]): void {
    let count = 0;
    const time = performance.now() * 0.005;
    for (const proj of projectiles) {
      this._dummy.position.set(proj.x, proj.y, proj.z);

      // Projectile visual variety: scale by weapon type
      let scale = proj.fromPlayer ? 1.0 : 1.8; // Enemy projectiles are larger
      if (proj.fromPlayer) {
        switch (proj.weaponType) {
          case 'black_hole': scale = 3.0; break;
          case 'tornado': scale = 2.0; break;
          case 'fire_staff': scale = 1.8; break;
          case 'aura': scale = 2.5; break;
          case 'axe': scale = 1.5; break;
          case 'sword': case 'katana': scale = 1.2; break;
          case 'revolver': case 'bow': scale = 0.6; break;
          case 'shotgun': scale = 0.4; break;
          case 'bone_bouncer': scale = 0.8; break;
          default: scale = 1.0;
        }
      }

      // Add spinning for bone_bouncer and tornado
      if (proj.weaponType === 'bone_bouncer' || proj.weaponType === 'tornado' || proj.weaponType === 'axe') {
        this._dummy.rotation.set(0, time * 4 + proj.id, time * 2);
      } else if (proj.weaponType === 'sword' || proj.weaponType === 'katana') {
        // Elongated slash feel (stretch on movement axis)
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

      // Set scale (unless sword/katana which has custom stretch)
      if (proj.weaponType !== 'sword' && proj.weaponType !== 'katana') {
        this._dummy.scale.set(scale, scale, scale);
      }

      this._dummy.updateMatrix();
      this.projectileMesh.setMatrixAt(count, this._dummy.matrix);

      if (proj.fromPlayer) {
        const color = WEAPON_PROJECTILE_COLORS[proj.weaponType] ?? 0xffdd44;
        this._tempColor.setHex(color);
      } else {
        // Enemy projectiles: red-orange pulsing color
        const pulse = 0.7 + Math.sin(time * 3 + proj.id) * 0.3;
        const r = 1.0;
        const g = 0.25 + pulse * 0.2;
        const b = 0.0;
        this._tempColor.setRGB(r, g, b);
      }
      this.projectileMesh.setColorAt(count, this._tempColor);
      count++;
    }
    this.projectileMesh.count = count;
    this.projectileMesh.instanceMatrix.needsUpdate = true;
    if (this.projectileMesh.instanceColor) this.projectileMesh.instanceColor.needsUpdate = true;
  }

  private renderPickups(pickups: PickupState[]): void {
    let count = 0;
    const time = performance.now() * 0.004; // Faster spin
    for (const pickup of pickups) {
      // Larger bobbing amplitude (0.3) for more visual pop
      const bob = Math.sin(time * 1.5 + pickup.id) * 0.3;
      this._dummy.position.set(pickup.x, 0.4 + bob, pickup.z);

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
        // Boss model is ~0.5 units raw, scale to ~5 units tall
        this.bossMesh.scale.set(10, 10, 10);
        this.scene.add(this.bossMesh);
      } else {
        // Fallback
        const geo = new THREE.BoxGeometry(2.4, 3.0, 2.4);
        const mat = new THREE.MeshToonMaterial({ color: 0x9933cc, gradientMap: toonGradientMap });
        this.bossMesh = new THREE.Mesh(geo, mat);
        this.bossMesh.name = 'Boss';
        this.scene.add(this.bossMesh);
      }
    }

    this.bossMesh.visible = true;
    this.bossMesh.position.set(boss.x, boss.y || 0, boss.z);

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
      this.bossWarningRing.position.set(state.player.x, 0.05, state.player.z);
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
    const baseScale = 10;
    if (boss.attackTimer > 0 && boss.currentAttack !== 'idle') {
      const pulse = Math.sin(time * 12) * 0.5;
      const scale = baseScale + pulse;
      this.bossMesh.scale.set(scale, scale, scale);
    } else if (boss.enraged) {
      const scale = baseScale + Math.sin(time) * 0.5;
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

  private renderTeleporters(teleporters: TeleporterState[]): void {
    const time = performance.now() * 0.003;

    // Create or update teleporter meshes
    while (this.teleporterMeshes.length < teleporters.length) {
      // Try using loaded teleporter model
      if (loadedModels.teleporter) {
        const tp = cloneSkeleton(loadedModels.teleporter) as THREE.Object3D;
        tp.name = 'Teleporter_Model';
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
        ring.name = 'Teleporter_Ring';
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
      pillar.name = 'Teleporter_Glow';
      this.scene.add(pillar);
      this.teleporterGlowMeshes.push(pillar);
    }

    for (let i = 0; i < this.teleporterMeshes.length; i++) {
      if (i < teleporters.length) {
        const tp = teleporters[i];
        const ring = this.teleporterMeshes[i];
        const pillar = this.teleporterGlowMeshes[i];

        ring.visible = true;
        ring.position.set(tp.x, 0.1, tp.z);
        ring.rotation.z = time;

        pillar.visible = true;
        pillar.position.set(tp.x, 2, tp.z);

        // Color based on phase
        const ringMat = ring.material as THREE.MeshBasicMaterial;
        const pillarMat = pillar.material as THREE.MeshBasicMaterial;

        if (tp.phase === 'activated') {
          ringMat.color.setHex(0xff4400);
          pillarMat.color.setHex(0xff6600);
          pillarMat.opacity = 0.6;
        } else if (tp.phase === 'activating') {
          const pulse = 0.5 + Math.sin(time * 3) * 0.3;
          ringMat.color.setHex(0xffaa00);
          pillarMat.color.setHex(0xffcc00);
          pillarMat.opacity = pulse;
        } else {
          ringMat.color.setHex(0x00ccff);
          pillarMat.color.setHex(0x00ffff);
          pillarMat.opacity = 0.3 + Math.sin(time) * 0.1;
        }
      } else {
        this.teleporterMeshes[i].visible = false;
        this.teleporterGlowMeshes[i].visible = false;
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
    revolver: [1.0, 0.9, 0.3],
    bow: [0.8, 1.0, 0.3],
    lightning_staff: [0.3, 0.8, 1.0],
    fire_staff: [1.0, 0.4, 0.1],
    flame_ring: [1.0, 0.5, 0.0],
    tornado: [0.4, 1.0, 0.4],
    shotgun: [1.0, 0.8, 0.2],
    black_hole: [0.6, 0.2, 1.0],
    katana: [0.9, 0.9, 1.0],
    aura: [0.5, 0.7, 1.0],
  };

  private static readonly PICKUP_VFX_COLORS: Record<string, [number, number, number]> = {
    xp_green: [0.2, 1.0, 0.4],
    xp_blue: [0.2, 0.7, 1.0],
    xp_purple: [0.8, 0.3, 1.0],
    xp_orange: [1.0, 0.7, 0.0],
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
  }

  private emitDeathBurst(x: number, y: number, z: number, _enemyType: string): void {
    const count = 25 + Math.floor(Math.random() * 10);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const elevation = (Math.random() - 0.3) * Math.PI;
      const speed = 5 + Math.random() * 7;
      const vx = Math.cos(angle) * Math.cos(elevation) * speed;
      const vy = Math.abs(Math.sin(elevation)) * speed + 3;
      const vz = Math.sin(angle) * Math.cos(elevation) * speed;
      const size = 1.5 + Math.random() * 2.0;
      const life = 0.4 + Math.random() * 0.5;
      // Red/orange death particles
      const r = 0.8 + Math.random() * 0.2;
      const g = 0.2 + Math.random() * 0.4;
      const b = Math.random() * 0.15;
      this.spawnParticle(x, y + 0.5, z, vx, vy, vz, size, life, r, g, b);
    }
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
  }

  private emitLevelUpBurst(x: number, y: number, z: number): void {
    const count = 30;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = 3 + Math.random() * 2;
      const vx = Math.cos(angle) * speed;
      const vy = 1.5 + Math.random() * 1.5;
      const vz = Math.sin(angle) * speed;
      const size = 0.6 + Math.random() * 0.5;
      const life = 0.6 + Math.random() * 0.4;
      // Gold particles
      const r = 1.0;
      const g = 0.8 + Math.random() * 0.2;
      const b = 0.1 + Math.random() * 0.2;
      this.spawnParticle(x, y + 0.5, z, vx, vy, vz, size, life, r, g, b);
    }
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

  private updateVFX(state: GameState, dt: number): void {
    const enemies = state.enemies;
    const player = state.player;

    // --- Emit particles based on game events ---

    // Hit sparks from damage events
    for (const event of state.damageEvents) {
      if (event.isPlayerDamage) continue;

      // Death detection
      const isDeath = event.damage > 10 && !enemies.some(e =>
        e.hp > 0 && Math.abs(e.x - event.x) < 0.5 && Math.abs(e.z - event.z) < 0.5
      );

      if (isDeath) {
        this.emitDeathBurst(event.x, event.y, event.z, 'generic');
      } else {
        // Determine weapon type from context (use first weapon as approximation)
        const weaponType = player.weapons.length > 0 ? player.weapons[0].type : 'sword';
        this.emitHitSparks(event.x, event.y + 0.5, event.z, weaponType);
      }
    }

    // Continuous weapon effects
    for (const weapon of player.weapons) {
      if (weapon.type === 'flame_ring' && player.alive) {
        this.emitFlameRingParticles(player.x, player.y, player.z, 2.5);
      }
      if (weapon.type === 'black_hole' && player.alive) {
        this.emitBlackHoleVortex(player.x, player.y, player.z, 3.0);
      }
    }

    // === Weapon Trail VFX (#12) ===
    // Projectile trails for player weapons
    for (const proj of state.projectiles) {
      if (!proj.fromPlayer) continue;
      // Every 2 ticks spawn a trail particle
      if (state.tick % 2 === 0) {
        const color = GameScene.WEAPON_VFX_COLORS[proj.weaponType] ?? [1, 1, 1];
        this.spawnParticle(
          proj.x, proj.y, proj.z,
          0, 0, 0, // trail stays in place
          0.4,     // small size
          0.2,     // short lifetime
          color[0] * 0.7, color[1] * 0.7, color[2] * 0.7, // slightly dimmer
        );
      }
    }

    // Melee weapon slash arc (sword/katana) — emit arc particles toward nearest enemy
    for (const weapon of player.weapons) {
      if ((weapon.type === 'sword' || weapon.type === 'katana') && weapon.cooldownTimer > 0 && weapon.cooldownTimer < 0.1 && player.alive) {
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

        // Spawn 6 particles in an arc toward the target
        const baseAngle = slashAngle;
        for (let i = 0; i < 6; i++) {
          const arcAngle = baseAngle + (i - 2.5) * 0.25;
          const dist = 1.5 + Math.random() * 0.5;
          const px = player.x + Math.sin(arcAngle) * dist;
          const pz = player.z + Math.cos(arcAngle) * dist;
          this.spawnParticle(
            px, player.y + 1.0, pz,
            Math.sin(arcAngle) * 2, 0.5, Math.cos(arcAngle) * 2,
            0.5,
            0.15,
            0.95, 0.95, 1.0,
          );
        }
      }
    }

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

    // =======================================================================
    // MegaBonk camera: FIXED ANGLE third-person.
    // Camera NEVER rotates. Fixed direction. Only follows player position.
    // Player is always in lower-center of screen.
    // =======================================================================

    // Fixed camera offset (never changes direction)
    const camBehind = 7;   // units behind player (toward -Z world direction)
    const camHeight = 5;   // units above player

    // Camera target position (fixed angle, only player position moves it)
    const targetX = p.x;
    const targetY = p.y + camHeight;
    const targetZ = p.z - camBehind;

    // Adaptive follow speed — faster when player is far from camera center
    // This prevents the character from drifting to screen edge during slide/dash
    const dx = targetX - this.camera.position.x;
    const dy = targetY - this.camera.position.y;
    const dz = targetZ - this.camera.position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    // Base 0.08, ramps up to ~0.5 when distance > 3 units
    const followSpeed = Math.min(0.08 + dist * 0.12, 0.6);

    this.camera.position.x += dx * followSpeed;
    this.camera.position.y += dy * followSpeed;
    this.camera.position.z += dz * followSpeed;

    // Look-at: also adaptive speed to stay in sync with camera position
    const lookDx = p.x - this.ghostTargetX;
    const lookDz = p.z - this.ghostTargetZ;
    const lookDist = Math.sqrt(lookDx * lookDx + lookDz * lookDz);
    const lookSpeed = Math.min(0.08 + lookDist * 0.12, 0.6);
    this.ghostTargetX += lookDx * lookSpeed;
    this.ghostTargetZ += lookDz * lookSpeed;
    this.camera.lookAt(this.ghostTargetX, p.y + 1.5, this.ghostTargetZ + 2);

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

    // HP bar
    const hpPercent = Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100));
    this.hpBarInner.style.width = `${hpPercent}%`;

    // XP bar with exact numbers
    const xpPercent = p.xpToNext > 0 ? Math.max(0, Math.min(100, (p.xp / p.xpToNext) * 100)) : 0;
    this.xpBarInner.style.width = `${xpPercent}%`;
    this.xpNumbers.textContent = `${p.xp} / ${p.xpToNext}`;

    // XP flash on gain
    if (p.xp !== this.lastXp) {
      this.xpFlashTimer = 0.4;
      this.lastXp = p.xp;
    }
    if (this.xpFlashTimer > 0) {
      this.xpFlashTimer -= 1 / 60;
      this.xpBarInner.style.background = 'linear-gradient(90deg,#ffdd00,#ffff44)';
    } else {
      this.xpBarInner.style.background = 'linear-gradient(90deg,#cc9900,#ffcc00)';
    }

    // Level label
    this.levelLabel.textContent = t('hud.level', { level: String(p.level) });

    // Timer
    const totalSec = Math.floor(state.gameTime);
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    this.timerLabel.textContent = timeStr;

    // Kill count
    this.killLabel.textContent = `💀 ${state.stats.killCount}`;

    // Silver this run
    this.silverLabel.textContent = `🪙 ${state.stats.silverEarned}`;

    // --- Weapon Icons Bar (bottom-left) ---
    this.weaponSlotsContainer.innerHTML = '';
    for (const weapon of p.weapons) {
      const slot = document.createElement('div');
      const borderColor = weapon.evolved ? '#ffcc00' : '#555';
      const borderWidth = weapon.evolved ? '2px' : '2px';
      slot.style.cssText = `width:44px;height:44px;background:rgba(0,0,0,0.6);border:${borderWidth} solid ${borderColor};border-radius:6px;position:relative;display:flex;align-items:center;justify-content:center;flex-shrink:0;`;
      // Weapon icon
      const icon = document.createElement('span');
      icon.style.cssText = 'font-size:20px;';
      icon.textContent = WEAPON_ICONS[weapon.type] ?? '?';
      slot.appendChild(icon);
      // Cooldown overlay
      const stats = this.getWeaponCooldownInfo(weapon);
      if (stats.cooldownPercent > 0) {
        const overlay = document.createElement('div');
        overlay.style.cssText = `position:absolute;bottom:0;left:0;right:0;height:${stats.cooldownPercent}%;background:rgba(0,0,0,0.7);border-radius:0 0 4px 4px;pointer-events:none;`;
        slot.appendChild(overlay);
      }
      // Level number
      const lvl = document.createElement('span');
      lvl.style.cssText = 'position:absolute;bottom:2px;right:3px;font-size:9px;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.9);';
      lvl.textContent = String(weapon.level);
      slot.appendChild(lvl);
      this.weaponSlotsContainer.appendChild(slot);
    }

    // --- Tome Icons Bar (bottom-right) ---
    this.tomesSlotsContainer.innerHTML = '';
    for (const tome of p.tomes) {
      const slot = document.createElement('div');
      const bgColor = TOME_COLORS[tome.type] ?? '#444';
      slot.style.cssText = `width:36px;height:36px;background:${bgColor}33;border:1px solid ${bgColor};border-radius:5px;position:relative;display:flex;align-items:center;justify-content:center;flex-shrink:0;`;
      const icon = document.createElement('span');
      icon.style.cssText = 'font-size:16px;';
      icon.textContent = TOME_ICONS[tome.type] ?? '📖';
      slot.appendChild(icon);
      // Level number
      const lvl = document.createElement('span');
      lvl.style.cssText = 'position:absolute;bottom:1px;right:2px;font-size:8px;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.9);';
      lvl.textContent = String(tome.level);
      slot.appendChild(lvl);
      this.tomesSlotsContainer.appendChild(slot);
    }

    // --- Boss HP Bar ---
    if (state.boss && state.boss.hp > 0) {
      this.bossHpContainer.style.display = 'block';
      const bossHpPercent = Math.max(0, Math.min(100, (state.boss.hp / state.boss.maxHp) * 100));
      this.bossHpBarInner.style.width = `${bossHpPercent}%`;
      this.bossNameLabel.textContent = `${t('boss.anubis')} - Phase ${state.boss.phase}`;
      // Pulsing glow when enraged
      if (state.boss.enraged) {
        const pulse = 0.6 + Math.sin(time * 0.008) * 0.4;
        this.bossHpContainer.style.boxShadow = `0 0 ${8 + pulse * 8}px rgba(255,50,0,${pulse})`;
      } else {
        this.bossHpContainer.style.boxShadow = 'none';
      }
    } else {
      this.bossHpContainer.style.display = 'none';
    }

    // --- Teleporter Indicator ---
    const availableTeleporter = state.teleporters.find(tp => tp.phase === 'available' || tp.phase === 'activating');
    if (availableTeleporter) {
      this.teleporterIndicator.style.display = 'block';
      const dx = availableTeleporter.x - p.x;
      const dz = availableTeleporter.z - p.z;
      const dist = Math.round(Math.sqrt(dx * dx + dz * dz));
      if (availableTeleporter.phase === 'activating') {
        const pct = Math.min(100, Math.round((availableTeleporter.activationTimer / availableTeleporter.activationDuration) * 100));
        this.teleporterIndicator.textContent = `${t('teleporter.activating')} ${pct}%`;
      } else {
        this.teleporterIndicator.textContent = `🌀 Teleporter: ${dist}m`;
      }
    } else {
      this.teleporterIndicator.style.display = 'none';
    }

    // --- Final Swarm visual effects ---
    if (state.finalSwarm) {
      // Show pulsing red border
      if (!this.finalSwarmBorder) {
        this.finalSwarmBorder = document.createElement('div');
        this.finalSwarmBorder.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:90;border:4px solid rgba(255,50,50,0.6);box-sizing:border-box;';
        document.body.appendChild(this.finalSwarmBorder);
      }
      // Pulse the border opacity
      const pulse = 0.4 + Math.sin(time * 0.005) * 0.3;
      this.finalSwarmBorder.style.borderColor = `rgba(255,50,50,${pulse})`;

      // Show "FINAL SWARM!" text
      if (!this.finalSwarmLabel) {
        this.finalSwarmLabel = document.createElement('div');
        this.finalSwarmLabel.style.cssText = 'position:fixed;top:66px;left:50%;transform:translateX(-50%);color:#ff4444;font-size:20px;font-weight:bold;text-shadow:0 0 10px #ff0000,0 2px 4px rgba(0,0,0,0.8);pointer-events:none;z-index:101;letter-spacing:2px;';
        this.finalSwarmLabel.textContent = `⚠️ ${t('hud.finalSwarm')} ⚠️`;
        document.body.appendChild(this.finalSwarmLabel);
      }
      // Pulse the text
      const textPulse = 0.7 + Math.sin(time * 0.006) * 0.3;
      this.finalSwarmLabel.style.opacity = String(textPulse);

      // Red-tint HUD elements during final swarm
      this.timerLabel.style.color = '#ff8888';
      this.killLabel.style.color = '#ff8888';
    } else {
      // Remove final swarm visuals
      if (this.finalSwarmBorder) {
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

    // === Combo HUD (#6) ===
    if (this.comboLabel) {
      const combo = state.player.comboCount;
      if (combo > 3) {
        this.comboLabel.style.opacity = '1';
        this.comboLabel.textContent = t('hud.combo', { count: String(combo) });
        // Scale up with combo count
        const fontSize = Math.min(28 + combo * 1.5, 56);
        this.comboLabel.style.fontSize = `${fontSize}px`;
        this.comboFadeTimer = 0.5;
        this.lastComboCount = combo;
      } else if (this.lastComboCount > 3 && combo <= 3) {
        // Combo dropped — fade out
        this.comboLabel.style.opacity = '0';
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
    if (evt.isPlayerDamage) color = '#ff4444';
    else if (evt.isCrit) color = '#ffd700'; // gold for crits

    // Damage number scaling by value
    let fontSize = 14;
    if (evt.damage > 50) fontSize = 24;
    else if (evt.damage > 20) fontSize = 18;

    // Crits: 1.5x size + "CRIT!" suffix
    if (evt.isCrit) {
      fontSize = Math.round(fontSize * 1.5);
    }

    const dmgText = String(Math.round(evt.damage));
    el.textContent = evt.isCrit ? `${dmgText} CRIT!` : dmgText;
    el.style.color = color;
    el.style.left = `${screenX}px`;
    el.style.top = `${screenY}px`;
    el.style.fontSize = `${fontSize}px`;
    el.style.opacity = '1';
    el.style.transform = 'translateY(0px) scale(1)';
    el.style.transition = 'none';

    void el.offsetWidth;

    // Faster upward velocity for more satisfying feel
    const flyDistance = evt.isCrit ? -60 : (evt.damage > 20 ? -50 : -40);
    el.style.transition = 'opacity 0.5s ease-out, transform 0.5s ease-out';
    el.style.opacity = '0';
    el.style.transform = `translateY(${flyDistance}px) scale(${evt.isCrit ? 0.6 : 0.8})`;
  }

  // ===========================================================================
  // Upgrade Panel
  // ===========================================================================

  private handlePhaseChange(state: GameState): void {
    if (state.phase === 'level_up' && state.upgradeOptions && !this.upgradePanel) {
      this.showUpgradePanel(state.upgradeOptions);
    } else if (state.phase !== 'level_up' && this.upgradePanel) {
      this.hideUpgradePanel();
    }
  }

  private showUpgradePanel(options: UpgradeOption[]): void {
    this.upgradePanel = document.createElement('div');
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
      const card = this.createUpgradeCard(option);
      cardRow.appendChild(card);
    }

    this.upgradePanel.appendChild(cardRow);
    document.body.appendChild(this.upgradePanel);
  }

  private createUpgradeCard(option: UpgradeOption): HTMLDivElement {
    const card = document.createElement('div');
    const borderColor = RARITY_COLORS[option.rarity] ?? '#aaaaaa';

    card.style.cssText = `
      width:160px;padding:16px;background:rgba(20,20,40,0.95);border:2px solid ${borderColor};
      border-radius:12px;cursor:pointer;text-align:center;transition:transform 0.15s,box-shadow 0.15s;
      box-shadow:0 4px 12px rgba(0,0,0,0.5);
    `;

    card.addEventListener('mouseenter', () => {
      card.style.transform = 'scale(1.05)';
      card.style.boxShadow = `0 6px 20px ${borderColor}44`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'scale(1)';
      card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
    });

    // Icon / Kind indicator
    const iconEl = document.createElement('div');
    iconEl.style.cssText = 'font-size:24px;margin-bottom:6px;';
    if (option.kind === 'new_weapon') iconEl.textContent = '⚔️';
    else if (option.kind === 'weapon_upgrade') iconEl.textContent = '⬆️';
    else iconEl.textContent = '📖';
    card.appendChild(iconEl);

    // Name
    const nameEl = document.createElement('div');
    nameEl.style.cssText = `color:${borderColor};font-size:14px;font-weight:bold;margin-bottom:8px;`;
    nameEl.textContent = this.getUpgradeName(option);
    card.appendChild(nameEl);

    // Description
    const descEl = document.createElement('div');
    descEl.style.cssText = 'color:#cccccc;font-size:11px;margin-bottom:8px;';
    descEl.textContent = this.getUpgradeDesc(option);
    card.appendChild(descEl);

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
    });

    return card;
  }

  private getUpgradeName(option: UpgradeOption): string {
    if (option.kind === 'new_weapon' || option.kind === 'weapon_upgrade') {
      return t(`upgrade.weapon.${option.weaponType}`);
    }
    const tomeType = option.tomeType ?? option.passiveType;
    return t(`upgrade.tome.${tomeType}`);
  }

  private getUpgradeDesc(option: UpgradeOption): string {
    if (option.kind === 'new_weapon' || option.kind === 'weapon_upgrade') {
      return t(`upgrade.weapon.${option.weaponType}_desc`);
    }
    const tomeType = option.tomeType ?? option.passiveType;
    return t(`upgrade.tome.${tomeType}_desc`);
  }

  private hideUpgradePanel(): void {
    this.upgradePanel?.remove();
    this.upgradePanel = null;
  }

  // ===========================================================================
  // Game Over
  // ===========================================================================

  private showGameOver(result: GameResult): void {
    if (this.gameOverPanel) return;

    // Check quest completions after run ends
    const newQuests = checkQuestCompletion();
    const completedCount = getCompletedQuestCount();

    this.gameOverPanel = document.createElement('div');
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
      t('result.silver', { count: String(result.silverEarned) }),
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

    // Show newly completed quest rewards
    if (newQuests.length > 0) {
      const questHeader = document.createElement('div');
      questHeader.style.cssText = 'color:#ffcc00;font-size:13px;font-weight:bold;margin-top:8px;';
      questHeader.textContent = '--- Quest Rewards ---';
      statsContainer.appendChild(questHeader);

      for (const qId of newQuests) {
        const quest = QUESTS.find(q => q.id === qId);
        if (!quest) continue;
        const el = document.createElement('div');
        el.style.cssText = 'color:#88ff88;font-size:12px;';
        el.textContent = `${t(quest.description)} - ${t('quest.completed')}`;
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
  }

  // ===========================================================================
  // Pause
  // ===========================================================================

  private togglePause(): void {
    if (this.isPaused) {
      this.session.resume();
      this.isPaused = false;
      this.pauseBtn.textContent = t('hud.pause');
    } else {
      this.session.pause();
      this.isPaused = true;
      this.pauseBtn.textContent = '▶';
    }
  }

  setTierBadge(tier: DifficultyTier): void {
    const color = TIER_COLORS[tier] ?? '#aaa';
    this.tierBadge.textContent = t(`tier.${tier}`);
    this.tierBadge.style.borderColor = color;
    this.tierBadge.style.color = color;
  }
}

// =============================================================================
// Character Selection
// =============================================================================

let selectedCharacter: CharacterType = 'megachad';
let selectedTier: DifficultyTier = 1;

function showCharacterSelect(onSelect: (character: CharacterType) => void): HTMLDivElement {
  const panel = document.createElement('div');
  panel.style.cssText = 'display:flex;gap:16px;margin-top:16px;flex-wrap:wrap;justify-content:center;';

  const characters: CharacterType[] = ['megachad', 'roberto', 'skateboard_skeleton'];

  for (const char of characters) {
    const card = document.createElement('div');
    const isSelected = char === selectedCharacter;
    const charColor = CHARACTER_COLORS[char] ?? 0xf5d680;
    const hexColor = `#${charColor.toString(16).padStart(6, '0')}`;

    card.style.cssText = `
      width:140px;padding:14px;background:rgba(20,20,40,0.9);
      border:2px solid ${isSelected ? hexColor : '#555555'};
      border-radius:10px;cursor:pointer;text-align:center;transition:all 0.15s;
      ${isSelected ? `box-shadow:0 0 15px ${hexColor}44;` : ''}
    `;

    // Character icon/color swatch
    const iconEl = document.createElement('div');
    iconEl.style.cssText = `width:40px;height:40px;border-radius:50%;margin:0 auto 8px;background:${hexColor};`;
    card.appendChild(iconEl);

    // Name
    const nameEl = document.createElement('div');
    nameEl.style.cssText = `color:${hexColor};font-size:13px;font-weight:bold;margin-bottom:4px;`;
    nameEl.textContent = t(`character.${char}`);
    card.appendChild(nameEl);

    // Description
    const descEl = document.createElement('div');
    descEl.style.cssText = 'color:#999;font-size:10px;line-height:1.3;';
    descEl.textContent = t(`character.${char}_desc`);
    card.appendChild(descEl);

    // Stats preview
    const cfg = CHARACTER_CONFIGS[char];
    const statsEl = document.createElement('div');
    statsEl.style.cssText = 'color:#777;font-size:9px;margin-top:6px;line-height:1.4;';
    statsEl.innerHTML = `HP:${cfg.hp} SPD:${cfg.speed} DMG:${cfg.damage}x`;
    card.appendChild(statsEl);

    card.addEventListener('click', () => {
      selectedCharacter = char;
      onSelect(char);
      // Re-render all cards to show selection
      panel.remove();
      const newPanel = showCharacterSelect(onSelect);
      panel.parentElement?.appendChild(newPanel);
    });

    card.addEventListener('mouseenter', () => {
      card.style.transform = 'scale(1.03)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'scale(1)';
    });

    panel.appendChild(card);
  }

  return panel;
}

// =============================================================================
// Tier Selection
// =============================================================================

function showTierSelect(onSelect: (tier: DifficultyTier) => void): HTMLDivElement {
  const panel = document.createElement('div');
  panel.style.cssText = 'display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;justify-content:center;';

  const tiers: DifficultyTier[] = [1, 2, 3];

  for (const tier of tiers) {
    const cfg = TIER_CONFIGS[tier];
    const isSelected = tier === selectedTier;
    const color = TIER_COLORS[tier];

    const btn = document.createElement('div');
    btn.style.cssText = `
      padding:10px 18px;background:rgba(20,20,40,0.9);
      border:2px solid ${isSelected ? color : '#444'};
      border-radius:8px;cursor:pointer;text-align:center;transition:all 0.15s;min-width:100px;
      ${isSelected ? `box-shadow:0 0 12px ${color}44;` : ''}
    `;

    const nameEl = document.createElement('div');
    nameEl.style.cssText = `color:${color};font-size:13px;font-weight:bold;margin-bottom:4px;`;
    nameEl.textContent = t(`tier.${tier}`);
    btn.appendChild(nameEl);

    const descEl = document.createElement('div');
    descEl.style.cssText = 'color:#888;font-size:9px;line-height:1.3;';
    if (tier === 1) descEl.textContent = 'Boss on timer';
    else if (tier === 2) descEl.textContent = `HP x${cfg.enemyHpMultiplier} | Silver x${cfg.silverMultiplier}`;
    else descEl.textContent = `HP x${cfg.enemyHpMultiplier} | Silver x${cfg.silverMultiplier}`;
    btn.appendChild(descEl);

    btn.addEventListener('click', () => {
      selectedTier = tier;
      onSelect(tier);
      panel.remove();
      const newPanel = showTierSelect(onSelect);
      panel.parentElement?.appendChild(newPanel);
    });

    btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.05)'; });
    btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; });

    panel.appendChild(btn);
  }

  return panel;
}

// =============================================================================
// Main Menu
// =============================================================================

let mainMenuEl: HTMLDivElement | null = null;
let menuScene: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; animId: number | null } | null = null;

function showMainMenu(): void {
  const container = document.getElementById('game-container');
  if (!container) return;

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.name = 'MenuScene';
  scene.background = new THREE.Color(0x0a0a1a);
  scene.fog = new THREE.Fog(0x0a0a1a, 30, 60);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.name = 'MenuCamera';
  camera.position.set(0, 10, 18);
  camera.lookAt(0, 0, 0);

  const groundGeo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
  const groundMat = new THREE.MeshToonMaterial({ color: 0x1a1a2a, gradientMap: toonGradientMap });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.name = 'MenuGround';
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const ambient = new THREE.AmbientLight(0x8888cc, 0.4);
  ambient.name = 'MenuAmbient';
  scene.add(ambient);
  const dir = new THREE.DirectionalLight(0xaaccff, 0.6);
  dir.name = 'MenuDirLight';
  dir.position.set(8, 15, 5);
  scene.add(dir);

  // Decorative elements
  for (let i = 0; i < 20; i++) {
    const boxGeo = new THREE.BoxGeometry(0.9, 1.2, 0.9);
    const color = [0xd4a574, 0xaaddff, 0x44cc55, 0x553366, 0xc87533][i % 5];
    const boxMat = new THREE.MeshToonMaterial({ color, gradientMap: toonGradientMap });
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.name = `MenuDecor_${i}`;
    box.position.set(
      (Math.random() - 0.5) * 30,
      0.5,
      (Math.random() - 0.5) * 30,
    );
    scene.add(box);
  }

  const removeDisplay = installThreeHighDpi({
    renderer,
    container,
    onResize: ({ width, height }) => {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
  });

  let angle = 0;
  let animId: number | null = null;

  function animateMenu(): void {
    animId = requestAnimationFrame(animateMenu);
    angle += 0.003;
    camera.position.x = Math.sin(angle) * 20;
    camera.position.z = Math.cos(angle) * 20;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  }
  animateMenu();

  menuScene = { renderer, scene, camera, animId };

  // Menu overlay
  mainMenuEl = document.createElement('div');
  mainMenuEl.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:500;font-family:Arial,sans-serif;gap:16px;';

  // Silver display at top
  const save = loadSave();
  const silverDisplay = document.createElement('div');
  silverDisplay.style.cssText = 'position:absolute;top:16px;right:16px;color:#eeeeee;font-size:16px;font-weight:bold;text-shadow:0 1px 3px rgba(0,0,0,0.8);background:rgba(20,20,40,0.7);padding:6px 14px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);';
  silverDisplay.textContent = t('shop.silver', { count: String(save.silver) });
  mainMenuEl.appendChild(silverDisplay);

  // Title
  const title = document.createElement('div');
  title.style.cssText = 'font-size:56px;font-weight:bold;color:#ffdd00;text-shadow:0 0 20px #ff8800,0 0 40px #ff4400,0 4px 8px rgba(0,0,0,0.6);letter-spacing:4px;-webkit-text-stroke:2px #cc6600;';
  title.textContent = t('game.title');
  mainMenuEl.appendChild(title);

  // Character select label
  const selectLabel = document.createElement('div');
  selectLabel.style.cssText = 'color:#cccccc;font-size:14px;margin-top:12px;';
  selectLabel.textContent = t('menu.selectCharacter');
  mainMenuEl.appendChild(selectLabel);

  // Character select cards
  const charPanel = showCharacterSelect((_char) => {
    // Character selection updates via the showCharacterSelect function
  });
  mainMenuEl.appendChild(charPanel);

  // Tier select label
  const tierLabel = document.createElement('div');
  tierLabel.style.cssText = 'color:#cccccc;font-size:13px;margin-top:10px;';
  tierLabel.textContent = t('tier.select');
  mainMenuEl.appendChild(tierLabel);

  // Tier select buttons
  const tierPanel = showTierSelect((_tier) => {
    // Tier selection updates via the showTierSelect function
  });
  mainMenuEl.appendChild(tierPanel);

  // Button row (Start + Shop + Quests)
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:12px;margin-top:16px;flex-wrap:wrap;justify-content:center;';

  // Start button
  const startBtn = document.createElement('div');
  startBtn.style.cssText = 'padding:14px 40px;background:linear-gradient(135deg,#ff6600,#ffaa00);color:#ffffff;font-size:20px;font-weight:bold;border-radius:12px;cursor:pointer;user-select:none;box-shadow:0 4px 16px rgba(255,100,0,0.4);transition:transform 0.15s;text-shadow:0 2px 4px rgba(0,0,0,0.3);';
  startBtn.textContent = t('menu.start');
  startBtn.addEventListener('mouseenter', () => { startBtn.style.transform = 'scale(1.05)'; });
  startBtn.addEventListener('mouseleave', () => { startBtn.style.transform = 'scale(1)'; });
  startBtn.addEventListener('click', () => {
    destroyMainMenu();
    startGame(selectedCharacter);
  });
  btnRow.appendChild(startBtn);

  // Shop button
  const shopBtn = document.createElement('div');
  shopBtn.style.cssText = 'padding:14px 28px;background:linear-gradient(135deg,#4488cc,#66aaee);color:#ffffff;font-size:18px;font-weight:bold;border-radius:12px;cursor:pointer;user-select:none;box-shadow:0 4px 12px rgba(50,100,200,0.4);transition:transform 0.15s;text-shadow:0 2px 4px rgba(0,0,0,0.3);';
  shopBtn.textContent = t('menu.shop');
  shopBtn.addEventListener('mouseenter', () => { shopBtn.style.transform = 'scale(1.05)'; });
  shopBtn.addEventListener('mouseleave', () => { shopBtn.style.transform = 'scale(1)'; });
  shopBtn.addEventListener('click', () => {
    showShopOverlay();
  });
  btnRow.appendChild(shopBtn);

  // Quests button
  const questBtn = document.createElement('div');
  questBtn.style.cssText = 'padding:14px 28px;background:linear-gradient(135deg,#aa6633,#cc8844);color:#ffffff;font-size:18px;font-weight:bold;border-radius:12px;cursor:pointer;user-select:none;box-shadow:0 4px 12px rgba(150,80,30,0.4);transition:transform 0.15s;text-shadow:0 2px 4px rgba(0,0,0,0.3);';
  questBtn.textContent = t('menu.quests');
  questBtn.addEventListener('mouseenter', () => { questBtn.style.transform = 'scale(1.05)'; });
  questBtn.addEventListener('mouseleave', () => { questBtn.style.transform = 'scale(1)'; });
  questBtn.addEventListener('click', () => {
    showQuestsOverlay();
  });
  btnRow.appendChild(questBtn);

  mainMenuEl.appendChild(btnRow);
  document.body.appendChild(mainMenuEl);
}

function destroyMainMenu(): void {
  mainMenuEl?.remove();
  mainMenuEl = null;

  if (menuScene) {
    if (menuScene.animId !== null) cancelAnimationFrame(menuScene.animId);
    menuScene.renderer.dispose();
    menuScene.renderer.domElement.remove();
    menuScene = null;
  }
}

// =============================================================================
// Shop Overlay
// =============================================================================

let shopOverlayEl: HTMLDivElement | null = null;

function showShopOverlay(): void {
  if (shopOverlayEl) return;

  shopOverlayEl = document.createElement('div');
  shopOverlayEl.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,20,0.92);display:flex;flex-direction:column;align-items:center;justify-content:flex-start;z-index:600;font-family:Arial,sans-serif;overflow-y:auto;padding:20px 0;';

  // Header with silver display
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;width:90%;max-width:700px;margin-bottom:16px;';

  const titleEl = document.createElement('div');
  titleEl.style.cssText = 'font-size:28px;font-weight:bold;color:#ffcc00;text-shadow:0 2px 4px rgba(0,0,0,0.8);';
  titleEl.textContent = t('shop.title');
  header.appendChild(titleEl);

  const silverEl = document.createElement('div');
  silverEl.style.cssText = 'font-size:18px;color:#eeeeee;font-weight:bold;background:rgba(40,40,60,0.8);padding:6px 14px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);';
  const save = loadSave();
  silverEl.textContent = t('shop.silver', { count: String(save.silver) });
  header.appendChild(silverEl);

  shopOverlayEl.appendChild(header);

  // Upgrade grid
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;width:90%;max-width:700px;';

  for (const upgrade of SHOP_UPGRADES) {
    const currentLevel = save.shopLevels[upgrade.id] ?? 0;
    const isMaxed = currentLevel >= upgrade.maxLevel;
    const cost = isMaxed ? null : upgrade.costPerLevel[currentLevel];
    const affordable = cost !== null && save.silver >= cost;

    const card = document.createElement('div');
    card.style.cssText = `
      background:rgba(30,30,50,0.95);border:1px solid ${isMaxed ? '#ffcc00' : (affordable ? '#44cc44' : '#555555')};
      border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:6px;
      ${isMaxed ? 'opacity:0.7;' : ''}
    `;

    // Name + Level
    const nameRow = document.createElement('div');
    nameRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';

    const nameEl = document.createElement('div');
    nameEl.style.cssText = 'color:#ffffff;font-size:15px;font-weight:bold;';
    nameEl.textContent = t(upgrade.nameKey);
    nameRow.appendChild(nameEl);

    const levelEl = document.createElement('div');
    levelEl.style.cssText = 'color:#888;font-size:12px;';
    levelEl.textContent = t('shop.level', { current: String(currentLevel), max: String(upgrade.maxLevel) });
    nameRow.appendChild(levelEl);

    card.appendChild(nameRow);

    // Description
    const descEl = document.createElement('div');
    descEl.style.cssText = 'color:#999;font-size:12px;';
    descEl.textContent = t(upgrade.descKey);
    card.appendChild(descEl);

    // Level bar
    const barContainer = document.createElement('div');
    barContainer.style.cssText = 'height:6px;background:rgba(80,80,100,0.5);border-radius:3px;overflow:hidden;margin-top:4px;';
    const barFill = document.createElement('div');
    const fillPercent = (currentLevel / upgrade.maxLevel) * 100;
    barFill.style.cssText = `height:100%;width:${fillPercent}%;background:linear-gradient(90deg,#44cc44,#88ff88);border-radius:3px;transition:width 0.3s;`;
    barContainer.appendChild(barFill);
    card.appendChild(barContainer);

    // Buy button
    const buyRow = document.createElement('div');
    buyRow.style.cssText = 'display:flex;justify-content:flex-end;margin-top:6px;';

    if (isMaxed) {
      const maxLabel = document.createElement('div');
      maxLabel.style.cssText = 'color:#ffcc00;font-size:13px;font-weight:bold;';
      maxLabel.textContent = t('shop.maxed');
      buyRow.appendChild(maxLabel);
    } else {
      const buyBtn = document.createElement('div');
      buyBtn.style.cssText = `padding:5px 14px;background:${affordable ? '#44aa44' : '#444455'};color:#ffffff;font-size:13px;font-weight:bold;border-radius:6px;cursor:${affordable ? 'pointer' : 'default'};user-select:none;${affordable ? '' : 'opacity:0.5;'}`;
      buyBtn.textContent = `${t('shop.buy')} (${cost})`;
      if (affordable) {
        buyBtn.addEventListener('click', () => {
          const success = purchaseUpgrade(upgrade.id);
          if (success) {
            // Refresh shop overlay
            hideShopOverlay();
            showShopOverlay();
          }
        });
        buyBtn.addEventListener('mouseenter', () => { buyBtn.style.transform = 'scale(1.05)'; });
        buyBtn.addEventListener('mouseleave', () => { buyBtn.style.transform = 'scale(1)'; });
      }
      buyRow.appendChild(buyBtn);
    }

    card.appendChild(buyRow);
    grid.appendChild(card);
  }

  shopOverlayEl.appendChild(grid);

  // Back button
  const backBtn = document.createElement('div');
  backBtn.style.cssText = 'margin-top:20px;padding:10px 30px;background:#555566;color:#ffffff;font-size:16px;font-weight:bold;border-radius:8px;cursor:pointer;user-select:none;';
  backBtn.textContent = t('shop.back');
  backBtn.addEventListener('click', () => {
    hideShopOverlay();
    // Refresh silver on main menu
    if (mainMenuEl) {
      const silverDisp = mainMenuEl.querySelector('div') as HTMLDivElement | null;
      if (silverDisp) {
        const freshSave = loadSave();
        silverDisp.textContent = t('shop.silver', { count: String(freshSave.silver) });
      }
    }
  });
  shopOverlayEl.appendChild(backBtn);

  document.body.appendChild(shopOverlayEl);
}

function hideShopOverlay(): void {
  shopOverlayEl?.remove();
  shopOverlayEl = null;
}

// =============================================================================
// Quests Overlay
// =============================================================================

let questsOverlayEl: HTMLDivElement | null = null;

function showQuestsOverlay(): void {
  if (questsOverlayEl) return;

  questsOverlayEl = document.createElement('div');
  questsOverlayEl.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,20,0.92);display:flex;flex-direction:column;align-items:center;justify-content:flex-start;z-index:600;font-family:Arial,sans-serif;overflow-y:auto;padding:20px 0;';

  // Header
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;width:90%;max-width:700px;margin-bottom:16px;';

  const titleEl = document.createElement('div');
  titleEl.style.cssText = 'font-size:28px;font-weight:bold;color:#ffcc00;text-shadow:0 2px 4px rgba(0,0,0,0.8);';
  titleEl.textContent = t('quest.title');
  header.appendChild(titleEl);

  const progressEl = document.createElement('div');
  progressEl.style.cssText = 'font-size:14px;color:#cccccc;';
  const completedCount = getCompletedQuestCount();
  progressEl.textContent = t('quest.progress', { current: String(completedCount), total: String(QUESTS.length) });
  header.appendChild(progressEl);

  questsOverlayEl.appendChild(header);

  // Quest list
  const questList = document.createElement('div');
  questList.style.cssText = 'display:flex;flex-direction:column;gap:8px;width:90%;max-width:700px;';

  const questProgress = getQuestProgress();

  for (let i = 0; i < QUESTS.length; i++) {
    const quest = QUESTS[i];
    const progress = questProgress[i];

    const row = document.createElement('div');
    row.style.cssText = `
      background:rgba(30,30,50,0.95);border:1px solid ${progress.completed ? '#44cc44' : '#444455'};
      border-radius:8px;padding:10px 14px;display:flex;align-items:center;gap:12px;
      ${progress.completed ? 'opacity:0.7;' : ''}
    `;

    // Status indicator
    const statusEl = document.createElement('div');
    statusEl.style.cssText = `width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;background:${progress.completed ? '#44cc44' : 'rgba(80,80,100,0.5)'};flex-shrink:0;`;
    statusEl.textContent = progress.completed ? '✓' : '';
    row.appendChild(statusEl);

    // Description and progress
    const infoEl = document.createElement('div');
    infoEl.style.cssText = 'flex:1;';

    const descEl = document.createElement('div');
    descEl.style.cssText = 'color:#ffffff;font-size:13px;';
    descEl.textContent = t(quest.description);
    infoEl.appendChild(descEl);

    if (!progress.completed) {
      const progressBarContainer = document.createElement('div');
      progressBarContainer.style.cssText = 'height:4px;background:rgba(80,80,100,0.5);border-radius:2px;overflow:hidden;margin-top:4px;';
      const progressBar = document.createElement('div');
      const pct = Math.min(100, (progress.current / quest.target) * 100);
      progressBar.style.cssText = `height:100%;width:${pct}%;background:#ffaa00;border-radius:2px;`;
      progressBarContainer.appendChild(progressBar);
      infoEl.appendChild(progressBarContainer);

      const progressText = document.createElement('div');
      progressText.style.cssText = 'color:#888;font-size:10px;margin-top:2px;';
      progressText.textContent = `${progress.current} / ${quest.target}`;
      infoEl.appendChild(progressText);
    }

    row.appendChild(infoEl);

    // Reward
    const rewardEl = document.createElement('div');
    rewardEl.style.cssText = 'color:#ffcc00;font-size:11px;text-align:right;flex-shrink:0;';
    rewardEl.textContent = formatQuestReward(quest.reward);
    row.appendChild(rewardEl);

    questList.appendChild(row);
  }

  questsOverlayEl.appendChild(questList);

  // Back button
  const backBtn = document.createElement('div');
  backBtn.style.cssText = 'margin-top:20px;padding:10px 30px;background:#555566;color:#ffffff;font-size:16px;font-weight:bold;border-radius:8px;cursor:pointer;user-select:none;margin-bottom:20px;';
  backBtn.textContent = t('quest.back');
  backBtn.addEventListener('click', () => {
    hideQuestsOverlay();
  });
  questsOverlayEl.appendChild(backBtn);

  document.body.appendChild(questsOverlayEl);
}

function hideQuestsOverlay(): void {
  questsOverlayEl?.remove();
  questsOverlayEl = null;
}

function formatQuestReward(reward: { type: string; value: string | number }): string {
  switch (reward.type) {
    case 'silver':
      return `+${reward.value} Silver`;
    case 'weapon_unlock':
      return `Unlock: ${String(reward.value)}`;
    case 'character_unlock':
      return `Unlock: ${String(reward.value)}`;
    case 'weapon_slot':
      return '+1 Weapon Slot';
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
  };

  const session = new LocalGameSession(config);
  const scene = new GameScene(session);
  activeScene = scene;
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

  if (import.meta.env.DEV) {
    mountDevtools();
  }

  await loadModels();

  showMainMenu();
}

export function bootGameClient(): void {
  void main().catch((error) => {
    console.error('[MegaBonk] Boot failed:', error);
  });
}
