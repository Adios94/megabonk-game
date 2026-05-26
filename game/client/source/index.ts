/// <reference types="vite/client" />
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  GameInstance,
  TICK_INTERVAL_MS,
  MAX_ENEMIES,
  MAX_PROJECTILES,
  MAX_PICKUPS,
  DEFAULT_GAME_CONFIG,
  CHARACTER_CONFIGS,
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
  ghost: 0xaaddff,
  bat: 0x553366,
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

const CAMERA_HEIGHT = 4;
const CAMERA_Z_OFFSET = -8;
const CAMERA_LERP = 0.1;
const GROUND_SIZE = 120;
const DAMAGE_NUM_POOL_SIZE = 30;

// =============================================================================
// Asset Loader — loads GLB models
// =============================================================================

interface LoadedModels {
  player: THREE.Group | null;
  skeleton: THREE.Group | null;
  zombie: THREE.Group | null;
  ghost: THREE.Group | null;
  boss: THREE.Group | null;
  tombstone: THREE.Group | null;
  tree: THREE.Group | null;
}

const gltfLoader = new GLTFLoader();
const loadedModels: LoadedModels = {
  player: null,
  skeleton: null,
  zombie: null,
  ghost: null,
  boss: null,
  tombstone: null,
  tree: null,
};

async function loadModels(): Promise<void> {
  const modelPaths: [keyof LoadedModels, string][] = [
    ['player', '/models/player.glb'],
    ['skeleton', '/models/skeleton.glb'],
    ['zombie', '/models/zombie.glb'],
    ['ghost', '/models/ghost.glb'],
    ['boss', '/models/boss.glb'],
    ['tombstone', '/models/tombstone.glb'],
    ['tree', '/models/tree.glb'],
  ];

  const promises = modelPaths.map(async ([key, path]) => {
    try {
      const gltf = await gltfLoader.loadAsync(path);
      const model = gltf.scene;
      model.name = `Model_${key}`;
      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          const oldMat = mesh.material as THREE.MeshStandardMaterial;
          if (oldMat.map) {
            mesh.material = new THREE.MeshLambertMaterial({ map: oldMat.map });
          } else {
            mesh.material = new THREE.MeshLambertMaterial({ color: oldMat.color ?? 0xcccccc });
          }
        }
      });
      loadedModels[key] = model;
    } catch {
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
  private groundMesh!: THREE.Mesh;
  private gridLines!: THREE.LineSegments;
  private bossMesh: THREE.Mesh | null = null;

  // Teleporter meshes
  private teleporterMeshes: THREE.Mesh[] = [];
  private teleporterGlowMeshes: THREE.Mesh[] = [];

  // InstancedMeshes
  private enemyMeshes: Map<string, THREE.InstancedMesh> = new Map();
  private projectileMesh!: THREE.InstancedMesh;
  private pickupMesh!: THREE.InstancedMesh;

  // Particles
  private particles!: THREE.Points;
  private particlePositions!: Float32Array;
  private particleVelocities: { x: number; y: number; z: number; life: number }[] = [];

  // DOM overlays
  private hudContainer!: HTMLDivElement;
  private hpBar!: HTMLDivElement;
  private hpBarInner!: HTMLDivElement;
  private xpBar!: HTMLDivElement;
  private xpBarInner!: HTMLDivElement;
  private levelLabel!: HTMLDivElement;
  private timerLabel!: HTMLDivElement;
  private killLabel!: HTMLDivElement;
  private weaponSlotsLabel!: HTMLDivElement;
  private pauseBtn!: HTMLDivElement;
  private upgradePanel: HTMLDivElement | null = null;
  private gameOverPanel: HTMLDivElement | null = null;
  private damageNums: HTMLDivElement[] = [];
  private damageNumIndex = 0;

  // State
  private isPaused = false;
  private cameraAngle = 0;
  private jumpKeyDown = false;
  private slideKeyDown = false;

  // Screen shake
  private shakeIntensity = 0;
  private shakeDecay = 8.0;
  private lastTime = 0;

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
    this.renderer.domElement.style.display = 'block';
    this.container.appendChild(this.renderer.domElement);

    // Scene
    this.scene = new THREE.Scene();
    this.scene.name = 'MainScene';
    this.scene.background = new THREE.Color(0x6eaadc);
    this.scene.fog = new THREE.Fog(0x6eaadc, 50, 100);

    // Camera
    this.camera = new THREE.PerspectiveCamera(65, 1, 0.1, 300);
    this.camera.name = 'MainCamera';
    this.camera.position.set(0, CAMERA_HEIGHT, CAMERA_Z_OFFSET);
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
    this.setupEnemyMeshes();
    this.setupProjectileMesh();
    this.setupPickupMesh();
    this.setupParticles();
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
    for (const el of this.damageNums) el.remove();
  }

  // ===========================================================================
  // Setup
  // ===========================================================================

  private setupLighting(): void {
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    ambient.name = 'AmbientLight';
    this.scene.add(ambient);

    const dir = new THREE.DirectionalLight(0xfff4e0, 0.9);
    dir.name = 'DirectionalLight';
    dir.position.set(8, 15, 5);
    this.scene.add(dir);

    const fill = new THREE.HemisphereLight(0x88ccff, 0x44aa44, 0.3);
    fill.name = 'HemisphereLight';
    this.scene.add(fill);
  }

  private setupGround(): void {
    const baseGeo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
    baseGeo.rotateX(-Math.PI / 2);
    const baseMat = new THREE.MeshLambertMaterial({ color: 0x4d8c3a });
    this.groundMesh = new THREE.Mesh(baseGeo, baseMat);
    this.groundMesh.name = 'Ground_Base';
    this.scene.add(this.groundMesh);

    const platforms: [number, number, number, number, number][] = [
      [-35, -30, 24, 20, 3],
      [35, -30, 24, 20, 3],
      [-35, 30, 24, 20, 3],
      [35, 30, 24, 20, 3],
      [0, -40, 20, 16, 5],
      [0, 40, 20, 16, 5],
      [-25, 0, 16, 24, 2],
      [25, 0, 16, 24, 2],
      [-15, -20, 10, 10, 1.5],
      [15, -20, 10, 10, 1.5],
      [-15, 20, 10, 10, 1.5],
      [15, 20, 10, 10, 1.5],
      [-40, 0, 12, 12, 4],
      [40, 0, 12, 12, 4],
      [0, 0, 10, 10, 2.5],
      [-20, -15, 6, 16, 1],
      [20, -15, 6, 16, 1],
      [-20, 15, 6, 16, 1],
      [20, 15, 6, 16, 1],
    ];

    const heightColors = [0x5dba4c, 0x6bc45a, 0x7acc68, 0x88d478, 0x99dd88];

    for (const [cx, cz, w, d, h] of platforms) {
      const topGeo = new THREE.BoxGeometry(w, h, d);
      const colorIdx = Math.min(Math.floor(h / 1.5), heightColors.length - 1);
      const topMat = new THREE.MeshLambertMaterial({ color: heightColors[colorIdx] });
      const platform = new THREE.Mesh(topGeo, topMat);
      platform.name = `Platform_${cx}_${cz}`;
      platform.position.set(cx, h / 2, cz);
      this.scene.add(platform);
    }

    // Ramp connectors
    const ramps: { x: number; z: number; rotY: number; length: number; height: number }[] = [
      { x: -25, z: -20, rotY: 0, length: 6, height: 3 },
      { x: 25, z: -20, rotY: 0, length: 6, height: 3 },
      { x: -25, z: 20, rotY: Math.PI, length: 6, height: 3 },
      { x: 25, z: 20, rotY: Math.PI, length: 6, height: 3 },
      { x: 0, z: -25, rotY: 0, length: 5, height: 5 },
      { x: 0, z: 25, rotY: Math.PI, length: 5, height: 5 },
    ];

    for (const ramp of ramps) {
      const rampGeo = new THREE.BoxGeometry(4, 0.3, ramp.length);
      const rampMat = new THREE.MeshLambertMaterial({ color: 0x8b7355 });
      const rampMesh = new THREE.Mesh(rampGeo, rampMat);
      rampMesh.name = 'Ramp';
      rampMesh.position.set(ramp.x, ramp.height / 2, ramp.z);
      rampMesh.rotation.x = Math.atan2(ramp.height, ramp.length);
      rampMesh.rotation.y = ramp.rotY;
      this.scene.add(rampMesh);
    }

    // Hidden grid lines (required by type)
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    const gridMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0 });
    this.gridLines = new THREE.LineSegments(gridGeo, gridMat);
    this.gridLines.name = 'GridLines';
    this.gridLines.visible = false;
    this.scene.add(this.gridLines);

    // Arena boundary walls
    const half = GROUND_SIZE / 2;
    const boundaryGeo = new THREE.BoxGeometry(GROUND_SIZE + 2, 2, 1);
    const boundaryMat = new THREE.MeshLambertMaterial({ color: 0x8b6914 });
    const walls = [
      { pos: [0, 1, -half - 0.5], rot: 0 },
      { pos: [0, 1, half + 0.5], rot: 0 },
      { pos: [-half - 0.5, 1, 0], rot: Math.PI / 2 },
      { pos: [half + 0.5, 1, 0], rot: Math.PI / 2 },
    ];
    for (const w of walls) {
      const wall = new THREE.Mesh(boundaryGeo, boundaryMat);
      wall.name = 'Boundary_Wall';
      wall.position.set(w.pos[0] as number, w.pos[1] as number, w.pos[2] as number);
      wall.rotation.y = w.rot;
      this.scene.add(wall);
    }

    this.addEnvironmentProps();
  }

  private addEnvironmentProps(): void {
    const propPositions: { x: number; z: number; type: 'tombstone' | 'tree' }[] = [];
    for (let i = 0; i < 20; i++) {
      let x: number, z: number;
      do {
        x = (Math.random() - 0.5) * (GROUND_SIZE - 10);
        z = (Math.random() - 0.5) * (GROUND_SIZE - 10);
      } while (Math.abs(x) < 8 && Math.abs(z) < 8);
      propPositions.push({ x, z, type: Math.random() > 0.5 ? 'tombstone' : 'tree' });
    }

    for (const prop of propPositions) {
      const model = prop.type === 'tombstone' ? loadedModels.tombstone : loadedModels.tree;
      if (model) {
        const clone = model.clone();
        clone.name = `Prop_${prop.type}`;
        clone.position.set(prop.x, 0, prop.z);
        clone.rotation.y = Math.random() * Math.PI * 2;
        const s = 0.8 + Math.random() * 0.4;
        clone.scale.set(s, s, s);
        this.scene.add(clone);
      } else {
        if (prop.type === 'tree') {
          const trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, 2, 5);
          const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b3a1f });
          const trunk = new THREE.Mesh(trunkGeo, trunkMat);
          trunk.name = 'Prop_tree_fallback';
          trunk.position.set(prop.x, 1, prop.z);
          this.scene.add(trunk);
          const foliageGeo = new THREE.ConeGeometry(1.2, 2.5, 5);
          const foliageMat = new THREE.MeshLambertMaterial({ color: 0x2d8b3d });
          const foliage = new THREE.Mesh(foliageGeo, foliageMat);
          foliage.position.set(prop.x, 3, prop.z);
          foliage.name = 'Prop_tree_foliage';
          this.scene.add(foliage);
        } else {
          const stoneGeo = new THREE.BoxGeometry(0.6, 1.0, 0.2);
          const stoneMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
          const stone = new THREE.Mesh(stoneGeo, stoneMat);
          stone.name = 'Prop_tombstone_fallback';
          stone.position.set(prop.x, 0.5, prop.z);
          this.scene.add(stone);
        }
      }
    }
  }

  private setupPlayer(): void {
    const state = this.session.getRenderState();
    const charColor = CHARACTER_COLORS[state.character] ?? 0xf5d680;

    if (loadedModels.player) {
      this.playerMesh = loadedModels.player.clone() as unknown as THREE.Mesh;
      this.playerMesh.name = 'Player';
      this.playerMesh.scale.set(1.2, 1.2, 1.2);
      this.playerMesh.position.y = 0;
      this.scene.add(this.playerMesh);
    } else {
      const bodyGeo = new THREE.CapsuleGeometry(0.5, 1.0, 4, 8);
      const bodyMat = new THREE.MeshLambertMaterial({ color: charColor });
      this.playerMesh = new THREE.Mesh(bodyGeo, bodyMat);
      this.playerMesh.name = 'Player';
      this.playerMesh.position.y = 1.0;
      this.scene.add(this.playerMesh);
    }

    // Ground circle indicator
    const ringGeo = new THREE.RingGeometry(0.6, 0.75, 16);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
    this.playerRing = new THREE.Mesh(ringGeo, ringMat);
    this.playerRing.name = 'PlayerRing';
    this.playerRing.rotation.x = -Math.PI / 2;
    this.playerRing.position.y = 0.02;
    this.scene.add(this.playerRing);
  }

  private setupEnemyMeshes(): void {
    const enemyTypes: string[] = [
      'skeleton_soldier', 'ghost', 'bat', 'zombie', 'skeleton_archer',
      'skeleton_knight', 'necromancer', 'gargoyle',
    ];

    const boxGeo = new THREE.BoxGeometry(0.9, 1.2, 0.9);

    for (const type of enemyTypes) {
      const color = ENEMY_COLORS[type] ?? 0x888888;
      const mat = new THREE.MeshLambertMaterial({ color });
      if (type === 'ghost') {
        mat.transparent = true;
        mat.opacity = 0.65;
      }
      const mesh = new THREE.InstancedMesh(boxGeo, mat, MAX_ENEMIES);
      mesh.name = `Enemy_${type}`;
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.enemyMeshes.set(type, mesh);
      this.scene.add(mesh);
    }
  }

  private setupProjectileMesh(): void {
    const geo = new THREE.SphereGeometry(0.25, 6, 4);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffee44, emissive: 0xffaa00, emissiveIntensity: 0.8 });
    this.projectileMesh = new THREE.InstancedMesh(geo, mat, MAX_PROJECTILES);
    this.projectileMesh.name = 'Projectiles';
    this.projectileMesh.count = 0;
    this.projectileMesh.frustumCulled = false;
    this.scene.add(this.projectileMesh);
  }

  private setupPickupMesh(): void {
    const geo = new THREE.OctahedronGeometry(0.35, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0x00ff66, emissive: 0x008833, emissiveIntensity: 0.8 });
    this.pickupMesh = new THREE.InstancedMesh(geo, mat, MAX_PICKUPS);
    this.pickupMesh.name = 'Pickups';
    this.pickupMesh.count = 0;
    this.pickupMesh.frustumCulled = false;
    this.scene.add(this.pickupMesh);
  }

  private setupParticles(): void {
    const maxParticles = 400;
    this.particlePositions = new Float32Array(maxParticles * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffaa44, size: 0.25, transparent: true, opacity: 0.9 });
    this.particles = new THREE.Points(geo, mat);
    this.particles.name = 'Particles';
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
  }

  // ===========================================================================
  // HUD
  // ===========================================================================

  private setupHUD(): void {
    this.hudContainer = document.createElement('div');
    this.hudContainer.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:100;font-family:Arial,sans-serif;';
    document.body.appendChild(this.hudContainer);

    // HP bar
    const hpContainer = document.createElement('div');
    hpContainer.style.cssText = 'position:absolute;top:12px;left:50%;transform:translateX(-50%);width:200px;height:16px;background:rgba(40,40,40,0.8);border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,0.2);';
    this.hpBarInner = document.createElement('div');
    this.hpBarInner.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#cc2222,#ff4444);transition:width 0.15s;border-radius:8px;';
    hpContainer.appendChild(this.hpBarInner);
    this.hpBar = hpContainer;
    this.hudContainer.appendChild(hpContainer);

    // XP bar
    const xpContainer = document.createElement('div');
    xpContainer.style.cssText = 'position:absolute;bottom:16px;left:50%;transform:translateX(-50%);width:240px;height:10px;background:rgba(40,40,40,0.8);border-radius:5px;overflow:hidden;border:1px solid rgba(255,255,255,0.15);';
    this.xpBarInner = document.createElement('div');
    this.xpBarInner.style.cssText = 'width:0%;height:100%;background:linear-gradient(90deg,#cc9900,#ffcc00);transition:width 0.15s;border-radius:5px;';
    xpContainer.appendChild(this.xpBarInner);
    this.xpBar = xpContainer;
    this.hudContainer.appendChild(xpContainer);

    // Level label
    this.levelLabel = document.createElement('div');
    this.levelLabel.style.cssText = 'position:absolute;bottom:30px;left:50%;transform:translateX(-50%);color:#ffcc00;font-size:14px;font-weight:bold;text-shadow:0 1px 3px rgba(0,0,0,0.8);';
    this.hudContainer.appendChild(this.levelLabel);

    // Timer
    this.timerLabel = document.createElement('div');
    this.timerLabel.style.cssText = 'position:absolute;top:12px;right:16px;color:#ffffff;font-size:16px;font-weight:bold;text-shadow:0 1px 3px rgba(0,0,0,0.8);';
    this.hudContainer.appendChild(this.timerLabel);

    // Kill count
    this.killLabel = document.createElement('div');
    this.killLabel.style.cssText = 'position:absolute;top:36px;right:16px;color:#cccccc;font-size:13px;text-shadow:0 1px 3px rgba(0,0,0,0.8);';
    this.hudContainer.appendChild(this.killLabel);

    // Weapon slots info
    this.weaponSlotsLabel = document.createElement('div');
    this.weaponSlotsLabel.style.cssText = 'position:absolute;top:12px;left:16px;color:#cccccc;font-size:12px;text-shadow:0 1px 3px rgba(0,0,0,0.8);';
    this.hudContainer.appendChild(this.weaponSlotsLabel);

    // Pause button
    this.pauseBtn = document.createElement('div');
    this.pauseBtn.style.cssText = 'position:absolute;top:60px;right:16px;color:#ffffff;font-size:13px;background:rgba(80,80,120,0.6);padding:4px 12px;border-radius:4px;cursor:pointer;pointer-events:auto;user-select:none;';
    this.pauseBtn.textContent = t('hud.pause');
    this.pauseBtn.addEventListener('click', () => this.togglePause());
    this.hudContainer.appendChild(this.pauseBtn);
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
  // Screen Shake
  // ===========================================================================

  private triggerShake(intensity: number): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  // ===========================================================================
  // Animate Loop
  // ===========================================================================

  private animate(): void {
    this.animationId = requestAnimationFrame(() => this.animate());

    const now = performance.now();
    const dt = this.lastTime > 0 ? Math.min((now - this.lastTime) / 1000, 0.05) : 1 / 60;
    this.lastTime = now;

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
    this.updateParticles(state.damageEvents, state.enemies);
    this.updateCamera(state);

    // Apply screen shake after camera update
    if (this.shakeIntensity > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity * 0.5;
      this.shakeIntensity -= this.shakeDecay * dt;
      if (this.shakeIntensity < 0.01) this.shakeIntensity = 0;
    }

    // Trigger shake from damage events
    for (const evt of state.damageEvents) {
      if (evt.isPlayerDamage) {
        this.triggerShake(0.4);
      } else if (evt.isCrit) {
        this.triggerShake(0.15);
      }
    }

    // Boss attack shake
    if (state.boss && state.boss.currentAttack !== 'idle' && state.boss.attackTimer > 0 && state.boss.attackTimer < 0.05) {
      this.triggerShake(0.6);
    }

    this.updateHUD(state);

    this.renderer.render(this.scene, this.camera);
  }

  // ===========================================================================
  // Input
  // ===========================================================================

  private handleInput(): void {
    const raw = this.platformInput.getInput();
    const input: InputState = {
      moveX: raw.moveX ?? 0,
      moveY: raw.moveY ?? 0,
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
    if (loadedModels.player) {
      this.playerMesh.position.set(p.x, p.y, p.z);
    } else {
      this.playerMesh.position.set(p.x, p.y + 1.0, p.z);
    }
    this.playerMesh.rotation.y = p.rotation;
    this.playerMesh.visible = p.alive;

    if (p.invincibleTimer > 0) {
      this.playerMesh.visible = Math.sin(performance.now() * 0.02) > 0;
    }

    // Squash when sliding
    if (p.isSliding) {
      this.playerMesh.scale.set(1.3, 0.7, 1.3);
    } else {
      this.playerMesh.scale.set(1.0, 1.0, 1.0);
    }

    this.playerRing.position.set(p.x, p.y + 0.02, p.z);
    this.playerRing.visible = p.alive;
  }

  private renderEnemies(enemies: EnemyState[]): void {
    const groups: Map<string, EnemyState[]> = new Map();
    for (const enemy of enemies) {
      const list = groups.get(enemy.type) ?? [];
      list.push(enemy);
      groups.set(enemy.type, list);
    }

    for (const [type, mesh] of this.enemyMeshes) {
      const list = groups.get(type);
      if (!list || list.length === 0) {
        mesh.count = 0;
        mesh.instanceMatrix.needsUpdate = true;
        continue;
      }

      let count = 0;
      for (const enemy of list) {
        const scale = enemy.isElite ? 1.3 : 1.0;
        this._dummy.position.set(enemy.x, 0.5 * scale, enemy.z);
        this._dummy.scale.set(scale, scale, scale);
        this._dummy.rotation.set(0, 0, 0);
        this._dummy.updateMatrix();
        mesh.setMatrixAt(count, this._dummy.matrix);

        if (enemy.hitFlashTimer > 0) {
          this._tempColor.setHex(0xff4444);
        } else if (enemy.isElite) {
          this._tempColor.setHex(0xff2222);
        } else {
          this._tempColor.setHex(ENEMY_COLORS[type] ?? 0x888888);
        }
        mesh.setColorAt(count, this._tempColor);

        count++;
      }
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  private renderProjectiles(projectiles: ProjectileState[]): void {
    let count = 0;
    const time = performance.now() * 0.005;
    for (const proj of projectiles) {
      this._dummy.position.set(proj.x, proj.y, proj.z);

      // Projectile visual variety: scale by weapon type
      let scale = proj.fromPlayer ? 1.0 : 1.5;
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
        default: scale = proj.fromPlayer ? 1.0 : 1.5;
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
        this._tempColor.setHex(0xff4444);
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
      return;
    }

    if (!this.bossMesh) {
      const geo = new THREE.BoxGeometry(2.4, 3.0, 2.4);
      const mat = new THREE.MeshLambertMaterial({ color: 0x9933cc, emissive: 0x440066, emissiveIntensity: 0.4 });
      this.bossMesh = new THREE.Mesh(geo, mat);
      this.bossMesh.name = 'Boss';
      this.scene.add(this.bossMesh);
    }

    this.bossMesh.visible = true;
    this.bossMesh.position.set(boss.x, 1.5, boss.z);

    const mat = this.bossMesh.material as THREE.MeshLambertMaterial;
    if (boss.hitFlashTimer > 0) {
      mat.color.setHex(0xffffff);
    } else if (boss.enraged) {
      mat.color.setHex(0xff3333);
    } else {
      mat.color.setHex(0x9933cc);
    }

    const scale = boss.enraged ? 3.0 + Math.sin(performance.now() * 0.01) * 0.15 : 3.0;
    this.bossMesh.scale.set(scale / 2.4, scale / 3.0, scale / 2.4);
  }

  private renderTeleporters(teleporters: TeleporterState[]): void {
    const time = performance.now() * 0.003;

    // Create or update teleporter meshes
    while (this.teleporterMeshes.length < teleporters.length) {
      // Base ring (portal on ground)
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

  private updateParticles(damageEvents: DamageEvent[], enemies: EnemyState[]): void {
    for (const event of damageEvents) {
      if (event.isPlayerDamage) continue;

      // Death detection: check if this is a kill (damage > 0 and no enemy at that position alive)
      // We use high particle count for crits and estimate deaths by damage
      const isDeath = event.damage > 10 && !enemies.some(e =>
        e.hp > 0 && Math.abs(e.x - event.x) < 0.5 && Math.abs(e.z - event.z) < 0.5
      );

      // Improved death particles: 8-12 particles, higher velocity, bigger initial spread
      const count = isDeath ? (8 + Math.floor(Math.random() * 5)) : (event.isCrit ? 8 : 4);
      const spread = isDeath ? 1.5 : 0.5;
      const lifetime = isDeath ? 0.4 : (0.6 + Math.random() * 0.4);

      for (let i = 0; i < count; i++) {
        this.particleVelocities.push({
          x: event.x + (Math.random() - 0.5) * spread,
          y: event.y + Math.random() * spread,
          z: event.z + (Math.random() - 0.5) * spread,
          life: lifetime,
        });
      }
    }

    const dt = 1 / 60;
    for (let i = this.particleVelocities.length - 1; i >= 0; i--) {
      const p = this.particleVelocities[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particleVelocities.splice(i, 1);
        continue;
      }
      p.y += 3.0 * dt; // Higher upward velocity
      p.x += (Math.random() - 0.5) * 1.5 * dt;
      p.z += (Math.random() - 0.5) * 1.5 * dt;
    }

    const maxP = this.particlePositions.length / 3;
    for (let i = 0; i < maxP; i++) {
      if (i < this.particleVelocities.length) {
        const p = this.particleVelocities[i];
        this.particlePositions[i * 3] = p.x;
        this.particlePositions[i * 3 + 1] = p.y;
        this.particlePositions[i * 3 + 2] = p.z;
      } else {
        this.particlePositions[i * 3] = 0;
        this.particlePositions[i * 3 + 1] = -100;
        this.particlePositions[i * 3 + 2] = 0;
      }
    }

    if (this.particleVelocities.length > maxP) {
      this.particleVelocities.length = maxP;
    }

    const attr = this.particles.geometry.getAttribute('position') as THREE.BufferAttribute;
    attr.needsUpdate = true;
  }

  private updateCamera(state: GameState): void {
    const p = state.player;

    let angleDiff = p.rotation - this.cameraAngle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    this.cameraAngle += angleDiff * 0.02;

    const behindDist = 11;
    const camHeight = 5.5;

    const targetX = p.x - Math.sin(this.cameraAngle) * behindDist;
    const targetZ = p.z - Math.cos(this.cameraAngle) * behindDist;
    const targetY = p.y + camHeight;

    this.camera.position.x += (targetX - this.camera.position.x) * 0.06;
    this.camera.position.y += (targetY - this.camera.position.y) * 0.06;
    this.camera.position.z += (targetZ - this.camera.position.z) * 0.06;

    this.camera.lookAt(p.x, p.y + 1.5, p.z);
  }

  // ===========================================================================
  // HUD Update
  // ===========================================================================

  private updateHUD(state: GameState): void {
    const p = state.player;

    const hpPercent = Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100));
    this.hpBarInner.style.width = `${hpPercent}%`;

    const xpPercent = p.xpToNext > 0 ? Math.max(0, Math.min(100, (p.xp / p.xpToNext) * 100)) : 0;
    this.xpBarInner.style.width = `${xpPercent}%`;

    this.levelLabel.textContent = t('hud.level', { level: String(p.level) });

    const totalSec = Math.floor(state.gameTime);
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    this.timerLabel.textContent = t('hud.time', { time: timeStr });

    this.killLabel.textContent = t('hud.kills', { count: String(state.stats.killCount) });

    // Weapon slots display
    this.weaponSlotsLabel.textContent = t('hud.weaponSlots', {
      current: String(p.weapons.length),
      max: String(p.maxWeaponSlots),
    });

    // Damage numbers
    for (const evt of state.damageEvents) {
      this.spawnDamageNumber(evt);
    }
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
      this.triggerShake(0.2); // Level up shake
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
    cardRow.style.cssText = 'display:flex;gap:16px;flex-wrap:wrap;justify-content:center;padding:0 16px;';

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

    for (const line of lines) {
      const el = document.createElement('div');
      el.style.cssText = 'color:#cccccc;font-size:14px;';
      el.textContent = line;
      statsContainer.appendChild(el);
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
}

// =============================================================================
// Character Selection
// =============================================================================

let selectedCharacter: CharacterType = 'megachad';

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
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 30, 60);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.name = 'MenuCamera';
  camera.position.set(0, 10, 18);
  camera.lookAt(0, 0, 0);

  const groundGeo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x5dba4c });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.name = 'MenuGround';
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  ambient.name = 'MenuAmbient';
  scene.add(ambient);
  const dir = new THREE.DirectionalLight(0xfff4e0, 0.8);
  dir.name = 'MenuDirLight';
  dir.position.set(8, 15, 5);
  scene.add(dir);

  // Decorative elements
  for (let i = 0; i < 20; i++) {
    const boxGeo = new THREE.BoxGeometry(0.9, 1.2, 0.9);
    const color = [0xd4a574, 0xaaddff, 0x44cc55, 0x553366, 0xc87533][i % 5];
    const boxMat = new THREE.MeshLambertMaterial({ color });
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

  // Start button
  const startBtn = document.createElement('div');
  startBtn.style.cssText = 'padding:14px 40px;background:linear-gradient(135deg,#ff6600,#ffaa00);color:#ffffff;font-size:20px;font-weight:bold;border-radius:12px;cursor:pointer;user-select:none;box-shadow:0 4px 16px rgba(255,100,0,0.4);transition:transform 0.15s;text-shadow:0 2px 4px rgba(0,0,0,0.3);margin-top:16px;';
  startBtn.textContent = t('menu.start');
  startBtn.addEventListener('mouseenter', () => { startBtn.style.transform = 'scale(1.05)'; });
  startBtn.addEventListener('mouseleave', () => { startBtn.style.transform = 'scale(1)'; });
  startBtn.addEventListener('click', () => {
    destroyMainMenu();
    startGame(selectedCharacter);
  });
  mainMenuEl.appendChild(startBtn);

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
  };

  const session = new LocalGameSession(config);
  const scene = new GameScene(session);
  activeScene = scene;
  scene.start();
  session.start();
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
