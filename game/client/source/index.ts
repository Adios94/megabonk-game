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
  skeleton_soldier: 0xd4a574,  // Warm tan/bone
  ghost: 0xaaddff,             // Light blue glow
  bat: 0x553366,               // Dark purple
  zombie: 0x44cc55,            // Bright green
  skeleton_archer: 0xc87533,   // Orange-brown
  skeleton_knight: 0xdd4444,   // Bold red
  necromancer: 0x9944cc,       // Bright purple
  gargoyle: 0x667788,          // Steel blue-gray
};

const PICKUP_COLORS: Record<string, number> = {
  xp_green: 0x00ff66,   // Neon green
  xp_blue: 0x22aaff,    // Bright blue
  xp_purple: 0xcc44ff,  // Vivid purple
  xp_orange: 0xffaa00,  // Bright orange
  silver: 0xeeeeee,     // Shiny white
};

const RARITY_COLORS: Record<string, string> = {
  common: '#aaaaaa',
  uncommon: '#44cc44',
  rare: '#4488ff',
  legendary: '#ffaa00',
};

const CAMERA_HEIGHT = 10;
const CAMERA_Z_OFFSET = 6;
const CAMERA_LERP = 0.1;
const GROUND_SIZE = 80;
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
      // Ensure all meshes use MeshLambertMaterial for PS1 flat look
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
      // Model not found — will use fallback geometry
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

  // Pre-allocated temporaries (no allocations in render loop)
  private readonly _dummy = new THREE.Object3D();
  private readonly _tempVec = new THREE.Vector3();
  private readonly _tempColor = new THREE.Color();

  // Scene objects
  private playerMesh!: THREE.Mesh;
  private playerRing!: THREE.Mesh;
  private groundMesh!: THREE.Mesh;
  private gridLines!: THREE.LineSegments;
  private bossMesh: THREE.Mesh | null = null;

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
  private pauseBtn!: HTMLDivElement;
  private upgradePanel: HTMLDivElement | null = null;
  private gameOverPanel: HTMLDivElement | null = null;
  private damageNums: HTMLDivElement[] = [];
  private damageNumIndex = 0;

  // State
  private isPaused = false;

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

    // Scene — bright, colorful PS1 style (NOT dark)
    this.scene = new THREE.Scene();
    this.scene.name = 'MainScene';
    this.scene.background = new THREE.Color(0x87ceeb); // Sky blue
    this.scene.fog = new THREE.Fog(0x87ceeb, 40, 80);

    // Camera — closer third-person, more intimate like MegaBonk
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
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
          { label: '⚡', color: 'rgba(100,200,255,0.3)', size: 56 },
          { label: '🔥', color: 'rgba(255,100,50,0.3)', size: 48 },
          { label: '🛡️', color: 'rgba(100,255,100,0.3)', size: 48 },
        ],
      });
    }
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
    // Bright ambient — colorful PS1 style
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    ambient.name = 'AmbientLight';
    this.scene.add(ambient);

    // Warm directional — sun-like
    const dir = new THREE.DirectionalLight(0xfff4e0, 0.9);
    dir.name = 'DirectionalLight';
    dir.position.set(8, 15, 5);
    this.scene.add(dir);

    // Subtle fill from below
    const fill = new THREE.HemisphereLight(0x88ccff, 0x44aa44, 0.3);
    fill.name = 'HemisphereLight';
    this.scene.add(fill);
  }

  private setupGround(): void {
    // Ground plane — bright grass green, PS1 flat-shaded look
    const groundGeo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x5dba4c });
    this.groundMesh = new THREE.Mesh(groundGeo, groundMat);
    this.groundMesh.name = 'Ground';
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.position.y = 0;
    this.scene.add(this.groundMesh);

    // Subtle grid lines (lighter, less prominent)
    const gridPoints: number[] = [];
    const half = GROUND_SIZE / 2;
    const step = 5;
    for (let i = -half; i <= half; i += step) {
      gridPoints.push(i, 0.01, -half, i, 0.01, half);
      gridPoints.push(-half, 0.01, i, half, 0.01, i);
    }
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPoints, 3));
    const gridMat = new THREE.LineBasicMaterial({ color: 0x4a9e3d, transparent: true, opacity: 0.3 });
    this.gridLines = new THREE.LineSegments(gridGeo, gridMat);
    this.gridLines.name = 'GridLines';
    this.scene.add(this.gridLines);

    // Arena boundary — visible fence/walls
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

    // Scatter environment props using loaded models
    this.addEnvironmentProps();
  }

  private addEnvironmentProps(): void {
    const propPositions: { x: number; z: number; type: 'tombstone' | 'tree' }[] = [];
    const half = GROUND_SIZE / 2;
    // Generate random prop positions (avoiding center area where player spawns)
    for (let i = 0; i < 15; i++) {
      let x: number, z: number;
      do {
        x = (Math.random() - 0.5) * (GROUND_SIZE - 10);
        z = (Math.random() - 0.5) * (GROUND_SIZE - 10);
      } while (Math.abs(x) < 8 && Math.abs(z) < 8); // Keep center clear
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
        // Fallback: simple colored cylinder for trees, box for tombstones
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
    // Use loaded GLB model if available, fallback to capsule
    if (loadedModels.player) {
      this.playerMesh = loadedModels.player.clone() as unknown as THREE.Mesh;
      this.playerMesh.name = 'Player';
      this.playerMesh.scale.set(1.2, 1.2, 1.2);
      this.playerMesh.position.y = 0;
      this.scene.add(this.playerMesh);
    } else {
      // Fallback — chunky PS1 capsule
      const bodyGeo = new THREE.CapsuleGeometry(0.5, 1.0, 4, 8);
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0xf5d680 });
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

    // Chunky low-poly box — PS1 proportions
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
    const geo = new THREE.SphereGeometry(0.25, 6, 4); // Low-poly sphere
    const mat = new THREE.MeshLambertMaterial({ color: 0xffee44, emissive: 0xffaa00, emissiveIntensity: 0.8 });
    this.projectileMesh = new THREE.InstancedMesh(geo, mat, MAX_PROJECTILES);
    this.projectileMesh.name = 'Projectiles';
    this.projectileMesh.count = 0;
    this.projectileMesh.frustumCulled = false;
    this.scene.add(this.projectileMesh);
  }

  private setupPickupMesh(): void {
    const geo = new THREE.OctahedronGeometry(0.3, 0); // Slightly bigger, low-poly gem
    const mat = new THREE.MeshLambertMaterial({ color: 0x00ff66, emissive: 0x004400, emissiveIntensity: 0.5 });
    this.pickupMesh = new THREE.InstancedMesh(geo, mat, MAX_PICKUPS);
    this.pickupMesh.name = 'Pickups';
    this.pickupMesh.count = 0;
    this.pickupMesh.frustumCulled = false;
    this.scene.add(this.pickupMesh);
  }

  private setupParticles(): void {
    const maxParticles = 200;
    this.particlePositions = new Float32Array(maxParticles * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffaa44, size: 0.15, transparent: true, opacity: 0.8 });
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

    // HP bar (top center)
    const hpContainer = document.createElement('div');
    hpContainer.style.cssText = 'position:absolute;top:12px;left:50%;transform:translateX(-50%);width:200px;height:16px;background:rgba(40,40,40,0.8);border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,0.2);';
    this.hpBarInner = document.createElement('div');
    this.hpBarInner.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#cc2222,#ff4444);transition:width 0.15s;border-radius:8px;';
    hpContainer.appendChild(this.hpBarInner);
    this.hpBar = hpContainer;
    this.hudContainer.appendChild(hpContainer);

    // XP bar (bottom center)
    const xpContainer = document.createElement('div');
    xpContainer.style.cssText = 'position:absolute;bottom:16px;left:50%;transform:translateX(-50%);width:240px;height:10px;background:rgba(40,40,40,0.8);border-radius:5px;overflow:hidden;border:1px solid rgba(255,255,255,0.15);';
    this.xpBarInner = document.createElement('div');
    this.xpBarInner.style.cssText = 'width:0%;height:100%;background:linear-gradient(90deg,#cc9900,#ffcc00);transition:width 0.15s;border-radius:5px;';
    xpContainer.appendChild(this.xpBarInner);
    this.xpBar = xpContainer;
    this.hudContainer.appendChild(xpContainer);

    // Level label (bottom center, above XP)
    this.levelLabel = document.createElement('div');
    this.levelLabel.style.cssText = 'position:absolute;bottom:30px;left:50%;transform:translateX(-50%);color:#ffcc00;font-size:14px;font-weight:bold;text-shadow:0 1px 3px rgba(0,0,0,0.8);';
    this.hudContainer.appendChild(this.levelLabel);

    // Timer (top right)
    this.timerLabel = document.createElement('div');
    this.timerLabel.style.cssText = 'position:absolute;top:12px;right:16px;color:#ffffff;font-size:16px;font-weight:bold;text-shadow:0 1px 3px rgba(0,0,0,0.8);';
    this.hudContainer.appendChild(this.timerLabel);

    // Kill count (below timer)
    this.killLabel = document.createElement('div');
    this.killLabel.style.cssText = 'position:absolute;top:36px;right:16px;color:#cccccc;font-size:13px;text-shadow:0 1px 3px rgba(0,0,0,0.8);';
    this.hudContainer.appendChild(this.killLabel);

    // Pause button (top right, below kills)
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
  // Animate Loop
  // ===========================================================================

  private animate(): void {
    this.animationId = requestAnimationFrame(() => this.animate());

    const state = this.session.getRenderState();

    // Input (only send when playing)
    if (state.phase === 'playing' || state.phase === 'boss_fight') {
      this.handleInput();
    }

    // Render scene
    this.renderPlayer(state);
    this.renderEnemies(state.enemies);
    this.renderProjectiles(state.projectiles);
    this.renderPickups(state.pickups);
    this.renderBoss(state.boss);
    this.updateParticles(state.damageEvents);
    this.updateCamera(state);
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
      dash: raw.action1 ?? false,
      skill1: raw.action2 ?? false,
      skill2: raw.action3 ?? false,
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
      this.playerMesh.position.set(p.x, 0, p.z);
    } else {
      this.playerMesh.position.set(p.x, 1.0, p.z);
    }
    this.playerMesh.rotation.y = p.rotation;
    this.playerMesh.visible = p.alive;

    // Flash when invincible
    if (p.invincibleTimer > 0) {
      this.playerMesh.visible = Math.sin(performance.now() * 0.02) > 0;
    }

    this.playerRing.position.set(p.x, 0.02, p.z);
    this.playerRing.visible = p.alive;
  }

  private renderEnemies(enemies: EnemyState[]): void {
    // Group enemies by type
    const groups: Map<string, EnemyState[]> = new Map();
    for (const enemy of enemies) {
      const list = groups.get(enemy.type) ?? [];
      list.push(enemy);
      groups.set(enemy.type, list);
    }

    // Update each InstancedMesh
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

        // Hit flash via color
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
    for (const proj of projectiles) {
      this._dummy.position.set(proj.x, proj.y, proj.z);
      const s = proj.fromPlayer ? 1.0 : 1.5;
      this._dummy.scale.set(s, s, s);
      this._dummy.updateMatrix();
      this.projectileMesh.setMatrixAt(count, this._dummy.matrix);

      if (proj.fromPlayer) {
        this._tempColor.setHex(0xffdd44);
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
    const time = performance.now() * 0.003;
    for (const pickup of pickups) {
      const bob = Math.sin(time + pickup.id) * 0.15;
      this._dummy.position.set(pickup.x, 0.3 + bob, pickup.z);
      this._dummy.scale.set(1, 1, 1);
      this._dummy.rotation.set(0, time + pickup.id, 0);
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

    // Scale pulse when enraged
    const scale = boss.enraged ? 3.0 + Math.sin(performance.now() * 0.01) * 0.15 : 3.0;
    this.bossMesh.scale.set(scale / 2.4, scale / 3.0, scale / 2.4);
  }

  private updateParticles(damageEvents: DamageEvent[]): void {
    // Spawn new particles from damage events
    for (const event of damageEvents) {
      if (event.isPlayerDamage) continue;
      const count = event.isCrit ? 8 : 4;
      for (let i = 0; i < count; i++) {
        this.particleVelocities.push({
          x: event.x + (Math.random() - 0.5) * 0.5,
          y: event.y + Math.random() * 0.5,
          z: event.z + (Math.random() - 0.5) * 0.5,
          life: 0.6 + Math.random() * 0.4,
        });
      }
    }

    // Update existing particles
    let activeCount = 0;
    const dt = 1 / 60;
    for (let i = this.particleVelocities.length - 1; i >= 0; i--) {
      const p = this.particleVelocities[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particleVelocities.splice(i, 1);
        continue;
      }
      p.y += 2.0 * dt;
      p.x += (Math.random() - 0.5) * 0.5 * dt;
      p.z += (Math.random() - 0.5) * 0.5 * dt;
    }

    // Write to buffer
    const maxP = this.particlePositions.length / 3;
    for (let i = 0; i < maxP; i++) {
      if (i < this.particleVelocities.length) {
        const p = this.particleVelocities[i];
        this.particlePositions[i * 3] = p.x;
        this.particlePositions[i * 3 + 1] = p.y;
        this.particlePositions[i * 3 + 2] = p.z;
        activeCount++;
      } else {
        this.particlePositions[i * 3] = 0;
        this.particlePositions[i * 3 + 1] = -100;
        this.particlePositions[i * 3 + 2] = 0;
      }
    }

    // Trim excess particles
    if (this.particleVelocities.length > maxP) {
      this.particleVelocities.length = maxP;
    }

    const attr = this.particles.geometry.getAttribute('position') as THREE.BufferAttribute;
    attr.needsUpdate = true;
  }

  private updateCamera(state: GameState): void {
    const p = state.player;
    const targetX = p.x;
    const targetY = CAMERA_HEIGHT;
    const targetZ = p.z + CAMERA_Z_OFFSET;

    this.camera.position.x += (targetX - this.camera.position.x) * CAMERA_LERP;
    this.camera.position.y += (targetY - this.camera.position.y) * CAMERA_LERP;
    this.camera.position.z += (targetZ - this.camera.position.z) * CAMERA_LERP;
    this.camera.lookAt(p.x, 0, p.z);
  }

  // ===========================================================================
  // HUD Update
  // ===========================================================================

  private updateHUD(state: GameState): void {
    const p = state.player;

    // HP bar
    const hpPercent = Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100));
    this.hpBarInner.style.width = `${hpPercent}%`;

    // XP bar
    const xpPercent = p.xpToNext > 0 ? Math.max(0, Math.min(100, (p.xp / p.xpToNext) * 100)) : 0;
    this.xpBarInner.style.width = `${xpPercent}%`;

    // Level
    this.levelLabel.textContent = t('hud.level', { level: String(p.level) });

    // Timer (mm:ss)
    const totalSec = Math.floor(state.gameTime);
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    this.timerLabel.textContent = t('hud.time', { time: timeStr });

    // Kills
    this.killLabel.textContent = t('hud.kills', { count: String(state.stats.killCount) });

    // Damage numbers from events
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

    // Project 3D position to screen coords
    this._tempVec.set(evt.x, evt.y, evt.z);
    this._tempVec.project(this.camera);

    const hw = window.innerWidth / 2;
    const hh = window.innerHeight / 2;
    const screenX = this._tempVec.x * hw + hw;
    const screenY = -(this._tempVec.y * hh) + hh;

    // Determine color
    let color = '#ffffff';
    if (evt.isPlayerDamage) color = '#ff4444';
    else if (evt.isCrit) color = '#ffcc00';

    const dmgText = String(Math.round(evt.damage));

    el.textContent = evt.isCrit ? `${dmgText}!` : dmgText;
    el.style.color = color;
    el.style.left = `${screenX}px`;
    el.style.top = `${screenY}px`;
    el.style.fontSize = evt.isCrit ? '20px' : '16px';
    el.style.opacity = '1';
    el.style.transform = 'translateY(0px)';
    el.style.transition = 'none';

    // Force reflow
    void el.offsetWidth;

    el.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
    el.style.opacity = '0';
    el.style.transform = 'translateY(-40px)';
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

    // Name
    const nameEl = document.createElement('div');
    nameEl.style.cssText = `color:${borderColor};font-size:15px;font-weight:bold;margin-bottom:8px;`;
    nameEl.textContent = this.getUpgradeName(option);
    card.appendChild(nameEl);

    // Description
    const descEl = document.createElement('div');
    descEl.style.cssText = 'color:#cccccc;font-size:12px;margin-bottom:8px;';
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
    return t(`upgrade.passive.${option.passiveType}`);
  }

  private getUpgradeDesc(option: UpgradeOption): string {
    if (option.kind === 'new_weapon' || option.kind === 'weapon_upgrade') {
      return t(`upgrade.weapon.${option.weaponType}_desc`);
    }
    return t(`upgrade.passive.${option.passiveType}_desc`);
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

    // Title
    const title = document.createElement('div');
    title.style.cssText = `font-size:40px;font-weight:bold;text-shadow:0 2px 8px rgba(0,0,0,0.9);color:${result.victory ? '#ffcc00' : '#ff4444'};`;
    title.textContent = result.victory ? t('result.victory') : t('result.defeat');
    this.gameOverPanel.appendChild(title);

    // Stats
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

    // Buttons
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
// Main Menu
// =============================================================================

let mainMenuEl: HTMLDivElement | null = null;
let menuScene: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; animId: number | null } | null = null;

function showMainMenu(): void {
  // Background scene
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

  // Ground — green grass
  const groundGeo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x5dba4c });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.name = 'MenuGround';
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Lights — bright
  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  ambient.name = 'MenuAmbient';
  scene.add(ambient);
  const dir = new THREE.DirectionalLight(0xfff4e0, 0.8);
  dir.name = 'MenuDirLight';
  dir.position.set(8, 15, 5);
  scene.add(dir);

  // Decorative enemy boxes — colorful
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
  mainMenuEl.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:500;font-family:Arial,sans-serif;gap:24px;';

  // Title — bold colorful
  const title = document.createElement('div');
  title.style.cssText = 'font-size:56px;font-weight:bold;color:#ffdd00;text-shadow:0 0 20px #ff8800,0 0 40px #ff4400,0 4px 8px rgba(0,0,0,0.6);letter-spacing:4px;-webkit-text-stroke:2px #cc6600;';
  title.textContent = t('game.title');
  mainMenuEl.appendChild(title);

  // Start button — vibrant
  const startBtn = document.createElement('div');
  startBtn.style.cssText = 'padding:14px 40px;background:linear-gradient(135deg,#ff6600,#ffaa00);color:#ffffff;font-size:20px;font-weight:bold;border-radius:12px;cursor:pointer;user-select:none;box-shadow:0 4px 16px rgba(255,100,0,0.4);transition:transform 0.15s;text-shadow:0 2px 4px rgba(0,0,0,0.3);';
  startBtn.textContent = t('menu.start');
  startBtn.addEventListener('mouseenter', () => { startBtn.style.transform = 'scale(1.05)'; });
  startBtn.addEventListener('mouseleave', () => { startBtn.style.transform = 'scale(1)'; });
  startBtn.addEventListener('click', () => {
    destroyMainMenu();
    startGame();
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

function startGame(): void {
  if (activeScene) {
    activeScene.destroy();
    activeScene = null;
  }

  const session = new LocalGameSession();
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

  // Load 3D models before showing menu
  await loadModels();

  showMainMenu();
}

export function bootGameClient(): void {
  void main().catch((error) => {
    console.error('[MegaBonk] Boot failed:', error);
  });
}
