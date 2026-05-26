# MegaBonk 3D Roguelike Survivor - Complete Project Exploration

## Executive Summary
**MegaBonk** is a **3D roguelike survivor game** built with:
- **Engine**: Three.js 0.170.0 (3D rendering)
- **Language**: TypeScript
- **Build Tool**: Vite 7.3.1
- **Architecture**: Monorepo (workspace) with separated game logic (core) and rendering (client)
- **Platforms**: Web (desktop + mobile with responsive controls)
- **Gameplay Loop**: Wave-based enemy survival with progression unlocks

---

## 1. PROJECT STRUCTURE - DIRECTORIES & KEY FILES

### Root Level
```
megabonk-game/
├── package.json              # Root workspace config
├── pnpm-workspace.yaml       # Monorepo setup
├── vite.config.ts            # Build & dev server config
├── tsconfig.json             # TypeScript config
├── kubee.json                # AI dev mode indicator
├── KUBEE.md                  # AI development guide
├── CLAUDE.md                 # Brief development notes
├── index.html                # HTML entry point
├── i18n/                     # Translation files
│   ├── en.json               # English localization
│   └── zh.json               # Chinese localization
├── game/                     # Main game packages
│   ├── core/                 # Game logic (no Three.js)
│   │   ├── source/
│   │   │   ├── GameInstance.ts     # Core game loop & state management
│   │   │   ├── config.ts           # Game constants & configurations
│   │   │   ├── types.ts            # All TypeScript interfaces
│   │   │   ├── physics.ts          # Movement & collision logic
│   │   │   ├── weapons.ts          # Weapon fire & projectile logic
│   │   │   ├── upgrades.ts         # Level-up & upgrade system
│   │   │   ├── quests.ts           # Quest definitions & tracking
│   │   │   ├── shop.ts             # Permanent shop upgrades
│   │   │   ├── save.ts             # localStorage persistence
│   │   │   ├── spatial-hash.ts     # Spatial partitioning
│   │   │   └── index.ts            # Public exports
│   │   └── package.json
│   └── client/               # Three.js rendering & UI
│       ├── source/
│       │   ├── index.ts             # GameScene class (all rendering)
│       │   └── session/
│       │       └── EventEmitter.ts  # Event system
│       ├── main.ts                  # Entry point (i18n bootstrap)
│       ├── KubeeClient.d.ts         # Type defs for Kubee CLI
│       └── package.json
├── packages/                 # Shared internal libraries
│   ├── i18n/                 # Translation runtime + Vite plugin
│   │   └── source/
│   │       ├── index.ts      # Main export
│   │       ├── runtime.ts    # Translation lookup
│   │       ├── vite.ts       # Vite plugin integration
│   │       ├── devtools.ts   # Dev-time helpers
│   │       └── types.ts
│   ├── platform/             # Desktop/mobile input abstraction
│   │   └── source/
│   │       ├── PlatformInput.ts     # Main unified input handler
│   │       ├── DesktopInput.ts      # Keyboard input
│   │       ├── MobileInput.ts       # Touch/virtual joystick
│   │       ├── controls/            # Individual control types
│   │       │   ├── VirtualJoystick.ts
│   │       │   ├── DualJoystick.ts
│   │       │   ├── TouchButtons.ts
│   │       │   ├── GestureInput.ts
│   │       │   ├── DragToMove.ts
│   │       │   └── TapInput.ts
│   │       ├── detect.ts     # Mobile/desktop detection
│   │       ├── display.ts    # DPI scaling helpers
│   │       └── index.ts
│   └── render-adapter/       # Three.js display helpers
│       └── source/
│           ├── index.ts      # Main export
│           ├── three.ts      # High-DPI Three.js setup
│           └── pixi.ts       # Placeholder for 2D fallback
├── public/                   # Static 3D assets
│   ├── models/               # 57 3D model files
│   │   ├── player.glb        # Player character
│   │   ├── player_cyberpunk.gltf
│   │   ├── boss.glb          # Boss enemy
│   │   ├── skeleton.glb, zombie.glb, ghost.glb  # Enemies
│   │   ├── platform_*.gltf   # Level platforms (1x1 to 4x4)
│   │   ├── fence_*, rail_*, support_*  # Environment
│   │   ├── sign_*.gltf       # Signage
│   │   ├── light_street_*.gltf  # Street lights
│   │   ├── ac_unit.gltf, computer.gltf, door.gltf  # Props
│   │   ├── collectible_gear.gltf  # Pickup items
│   │   ├── lootbox.gltf      # Loot containers
│   │   ├── pumpkin.glb       # Seasonal
│   │   ├── tree.glb          # Decorations
│   │   ├── turret_cannon.gltf, turret_teleporter.gltf
│   │   ├── enemy_*_gun.gltf  # Armed enemies
│   │   └── ... (see models listing)
│   └── textures/             # 5 PNG texture files
│       ├── particle_circle.png
│       ├── particle_flare.png
│       ├── particle_star.png
│       ├── particle_twirl.png
│       └── texture_sign.png
└── dist/                     # Build output (generated)

```

### Package Structure
- **@minigame/core**: Game logic (GameInstance, types, configs)
- **@minigame/client**: Three.js rendering (GameScene)
- **@minigame/i18n**: Translation system
- **@minigame/platform**: Input handling
- **@minigame/render-adapter**: Display utilities

---

## 2. GAME'S LEVELS/STAGES SYSTEM

### Wave System (5 Waves → Boss)
The game is **time-based with progressive waves**, not traditional "levels". Defined in `config.ts`:

```typescript
WAVE_CONFIGS: [
  Wave 0 (0-60s):   skeleton_soldier, bat         | 30 max | spawn every 2.0s
  Wave 1 (60-180s): skeleton_soldier, ghost, bat, zombie | 50 max | spawn every 1.5s
  Wave 2 (180-300s): soldier, ghost, zombie, archer | 70 max | spawn every 1.2s
  Wave 3 (300-420s): ghost, zombie, archer, bat   | 85 max | spawn every 1.0s
  Wave 4 (420-540s): zombie, archer, bat, ghost   | 100 max | spawn every 0.8s
]
```

### Boss System
- **Boss Spawns at 540 seconds (9 minutes)** 
- Boss fight triggers after teleporter activation
- Difficulty scales by tier (1x-2.5x HP multiplier)

### Teleporter System
- Appears at **300 seconds** (5 minutes)
- 2 teleporters on Nightmare tier, 1 on Hard, 0 on Normal
- Player must approach and activate (~3 seconds duration)
- Summons boss when activated

### Difficulty Tiers (3 Modes)
```typescript
Tier 1 (Normal):   1.0x enemy stats, 1x silver
Tier 2 (Hard):     1.5x HP, 1.3x DMG, 1.1x speed, 1.5x XP, 2x silver, 1 teleporter
Tier 3 (Nightmare): 2.5x HP, 1.8x DMG, 1.2x speed, 2x XP, 3x silver, 2 teleporters
```

### Level Progression (In-Run)
- **Max Level: 40**
- Leveling unlocks **upgrade selection** (choose 3 options from: weapon upgrade, new weapon, tome passive)
- XP scaling: `XP_FOR_NEXT = base + (level * growth_multiplier)`

### Character Progression (Meta)
**3 Playable Characters:**
1. **Megachad** (Balanced) - 100 HP, 5.0 speed, 1.2x dmg, 0.08 crit
2. **Roberto** (Tank) - 150 HP, 4.0 speed, 1.0x dmg, 3 armor, 0.05 crit
3. **Skateboard Skeleton** (Fast) - 70 HP, 6.5 speed, 0.9x dmg, 0.1 crit
   - Skateboard Skeleton unlocks after 8 weapon evolutions

---

## 3. ART STYLE & ASSETS

### Visual Aesthetic
- **Style**: 3D Cyberpunk/Post-Apocalyptic with retro neon touches
- **Color Palette**: Dark backgrounds (0x1a2a3a), neon accents (electric blue, lime green, orange)
- **Font**: "Press Start 2P" monospace (retro arcade feel)

### 3D Models (57 files)
**Characters:**
- player.glb / player_cyberpunk.gltf (2 variants)

**Enemies (8 types):**
- skeleton.glb, zombie.glb, ghost.glb (basic)
- boss.glb (main antagonist)
- enemy_2legs.gltf, enemy_2legs_gun.gltf
- enemy_flying.gltf, enemy_flying_gun.gltf
- enemy_large.gltf, enemy_large_gun.gltf

**Level Platforms (Modular construction):**
- platform_1x1.gltf, platform_2x1.gltf, platform_2x2.gltf
- platform_4x1.gltf, platform_4x2.gltf, platform_4x4.gltf, platform_4x4_full.gltf

**Environment/Cyberpunk Props:**
- fence_platform.gltf, fence_cyber.fbx
- rail_long.gltf, rail_short.gltf, rail_corner.gltf
- support.gltf, support_long.gltf, support_short.gltf
- light_street_1.gltf, light_street_2.gltf, light_street.fbx (street lamps)
- sign_1.gltf, sign_2.gltf, sign_3.gltf, sign_corner_1.gltf
- ac_unit.gltf, computer.gltf, door.gltf, pipe_1.gltf, pipe_2.gltf
- tv_1.gltf

**Interactive Objects:**
- lootbox.gltf (item containers)
- turret_cannon.gltf, turret_teleporter.gltf (hazards/teleporter visual)
- collectible_gear.gltf (pickup items)
- pickup_health.gltf, pickup_heart.gltf (healing items)

**Decorations:**
- tree.glb, tombstone.glb (environment)
- pumpkin.glb (seasonal)

**Model Formats:**
- **GLB**: Binary (better for complex models with embedded textures)
- **GLTF**: Text-based (easier debugging, cleaner JSON structure)
- **FBX**: Legacy format (some models have both .fbx and .gltf versions)

### Textures (5 files)
- **particle_circle.png** - Round particle sprite
- **particle_flare.png** - Lens flare effect
- **particle_star.png** - Star-shaped particle
- **particle_twirl.png** - Swirling particle
- **texture_sign.png** - Sign texture for in-world signs

### Color Scheme (Defined in client/index.ts)
**Enemy Colors:**
```typescript
skeleton_soldier: 0xd4a574   (tan)
ghost: 0xaaddff              (light cyan)
bat: 0x553366                (purple)
zombie: 0x44cc55             (green)
skeleton_archer: 0xc87533    (orange)
skeleton_knight: 0xdd4444    (red)
necromancer: 0x9944cc        (dark purple)
gargoyle: 0x667788           (gray)
```

**Weapon Projectile Colors:**
```typescript
sword: 0xcccccc              (silver)
revolver: 0xffdd00           (gold)
lightning_staff: 0x44aaff    (electric blue)
fire_staff: 0xff4400         (orange)
black_hole: 0x220044         (dark purple)
... (13 weapons total)
```

**UI Rarity Colors:**
```typescript
common: #aaaaaa              (gray)
uncommon: #44cc44            (green)
rare: #4488ff                (blue)
legendary: #ffaa00           (gold)
```

---

## 4. LIGHTING SYSTEM & VISUAL EFFECTS

### Lighting Setup (setupLighting() in client/index.ts)

**Three Light Sources:**
```typescript
1. AmbientLight(0xffffff, 0.8)     // Uniform illumination
2. DirectionalLight(0xffffff, 1.0) // Sun-like shadows
3. HemisphereLight(0xaaccff, 0x334455, 0.5)  // Sky-to-ground gradient
```

**Scene Fog:**
```typescript
fog: THREE.Fog(0x1a2a3a, 60, 120)  // Color, near, far
```

### Material System
**Default Materials:**
- `MeshLambertMaterial` - Main material for all models (uses diffuse + ambient lighting)
- Materials preserve original model textures from GLB/GLTF files
- **No shadow casting** disabled for performance

**Special Materials:**
```typescript
1. Ground Plane: MeshLambertMaterial({ color: 0x1a1a2a })
2. Grid Lines: LineBasicMaterial({ color: 0x000000, opacity: 0 }) (hidden)
3. Floor Glow Panels: MeshBasicMaterial({ color: 0x44ff88 }) (emissive)
4. Player Ring: MeshBasicMaterial({ color: 0x00ff88, transparent, opacity: 0.7 })
5. Aura Ring: MeshBasicMaterial({ side: THREE.DoubleSide, transparent })
6. Pickups: MeshLambertMaterial (dynamic colors per type)
7. Enemy Meshes: MeshLambertMaterial + transparency for elite/damaged
8. Projectiles: MeshBasicMaterial (dynamic colors per weapon type)
```

### Emissive Glow Effects

**Floor Glow Panels** (cyberpunk aesthetic):
- Multiple glowing quad meshes placed around arena
- `MeshBasicMaterial({ color: 0x44ff88 })` - Lime green glow
- Creates visual "neon floor" effect
- Performance: ~8 glow meshes in scene

**Light Street Models:**
- 4 street lamp models positioned at corners
- Models themselves contain emissive materials (from GLB)
- Create ambient "night street" atmosphere

### Camera & View
```typescript
Camera Height: 4 units above ground
Camera Z-Offset: -8 units back (isometric-like view)
Lerp Factor: 0.1 (smooth camera follow)
Near/Far: Standard Three.js defaults
```

### Particle & Effect Rendering
- **Damage Numbers**: DOM-based floating text with CSS animations
- **Flash Effects**: Screen-wide borders/colors on hit/level-up
- **No particle system** (uses models + materials for visual feedback)

### Performance Optimizations
1. **No shadow maps** - CPU/GPU intensive, disabled
2. **Lambert shading** - Faster than Phong
3. **Frustum culling** - Three.js built-in
4. **Fixed light count** - 3 lights (not dynamic)
5. **Reused materials** - Material sharing where possible

---

## 5. GAME MECHANICS SUMMARY

### Player Movement (MegaBonk-style)
- **Basic Move**: WASD or joystick (5.0 base speed)
- **Jump**: Space (~8.0 force, with gravity 20.0)
- **Bunny Hop**: Jump within 0.15s of landing (1.3x jump height bonus)
- **Slide**: Shift (0.6s duration, 1.8x speed multiplier, 0.3s cooldown)
- **Dash**: Double-tap direction (6 unit distance, 0.2s, 5s cooldown)

### Combat System
**13 Weapons with 8 levels each:**
1. Sword - Melee swipe arc
2. Bone Bouncer - Bouncing projectile
3. Axe - Orbiting projectiles
4. Revolver - Auto-aimed bullets
5. Bow - Forward arrows
6. Lightning Staff - Chain lightning
7. Fire Staff - Fireballs with AOE
8. Flame Ring - Continuous damage aura
9. Tornado - Pierce-all spinner
10. Shotgun - Spread shot
11. Black Hole - Gravitational pull
12. Katana - Fast forward slash
13. Aura - Expanding ring

**Weapon Evolution** (8 possible transformations):
- Sword → Dexecutioner (requires Attack Speed Tome Lv5)
- Axe → Berserker Axe (requires Knockback Tome Lv3)
- Bone Bouncer → Bone Storm (requires Luck Tome Lv3)
- Revolver → Deagle (requires Precision Tome Lv3)
- Lightning Staff → Thunder God (requires Curse Tome Lv3)
- Fire Staff → Inferno (requires Thorns Tome Lv3)
- Tornado → Hurricane (requires Speed Tome Lv5)
- Black Hole → Singularity (requires Attraction Tome Lv5)

### Progression Systems

**On-Run (Level-Up Choices):**
- 3 options per level: upgrade weapon, new weapon, or passive item (tome)

**10 Passive Items (Tomes):**
- Attack Speed, Luck, Thorns, Shield, XP Gain, Attraction, Curse, Precision, Knockback, Speed
- Each has 3-5 max levels

**Meta Progression (Shop System):**
- 8 permanent upgrades purchasable with Silver currency
- Unlocks during runs and carried between runs

**30 Quests:**
- Kill X enemies, Survive X time, Reach level X, Evolve weapons, Defeat boss, etc.
- Reward: Silver, weapon unlocks, character unlocks, weapon slots

---

## 6. ENEMY SYSTEM

**8 Enemy Types + Boss:**
```typescript
skeleton_soldier  | 15 HP | 5 dmg | 3.0 speed | Chase       | 1 XP | Appears: 0s
ghost             | 10 HP | 8 dmg | 4.0 speed | Chase       | 2 XP | Appears: 60s
bat               | 5 HP  | 3 dmg | 5.0 speed | Swarm orbit | 1 XP | Appears: 30s
zombie            | 30 HP | 10dmg | 1.5 speed | Chase       | 3 XP | Appears: 90s
skeleton_archer   | 12 HP | 7 dmg | 2.5 speed | Ranged      | 3 XP | Appears: 120s
skeleton_knight   | 120HP | 20dmg | 3.5 speed | Charge      |25 XP | Elite | 180s
necromancer       | 80 HP | 15dmg | 2.0 speed | Ranged      |30 XP | Elite | 240s
gargoyle          | 200HP | 25dmg | 4.0 speed | Dive        |40 XP | Elite | 360s

Boss (Anubis)     | 2000 HP (scalable by tier) | Multi-phase | Various attacks
```

**Elite Enemies:**
- Spawn after wave 3 (180s+)
- 1.5x HP + stats
- Rare drops

---

## 7. CODE ARCHITECTURE

### Core Game Loop (GameInstance.ts)
```typescript
class GameInstance {
  constructor(config: GameConfig)
  start(): void
  tick(): boolean                    // Returns true if game over
  applyAction(input: InputState)
  selectUpgrade(id: string)
  pause() / resume()
  getState(): GameState              // Returns current state for rendering
  getResult(): GameResult
}
```

### Rendering Pipeline (GameScene in client/index.ts)
```typescript
class GameScene {
  constructor(container: HTMLElement, config: GameConfig)
  start(gameSession: LocalGameSession)
  update(gameState: GameState)       // Called every frame
  render()                           // Renders current scene state
}
```

### State Flow
```
Input (keyboard/touch)
  ↓
GameInstance.applyAction()
  ↓
GameInstance.tick() [60 FPS game loop]
  ↓
GameState updated
  ↓
GameScene.update(gameState) [render frame]
  ↓
Three.js renders to canvas
```

### Monorepo Dependencies
```
@minigame/client (entry)
├── depends on @minigame/core      (game logic)
├── depends on @minigame/platform  (input)
├── depends on @minigame/i18n      (translations)
└── depends on @minigame/render-adapter (Three.js helpers)

@minigame/core
├── NO external dependencies (pure game logic)
└── Exports: GameInstance, types, configs

@minigame/platform
└── NO external dependencies

@minigame/i18n
└── NO external dependencies
```

---

## 8. CONFIGURATION & BALANCE

### Game Constants (config.ts)
```typescript
MAP_SIZE: 120                    // Playing area
MAX_ENEMIES: 100
MAX_PROJECTILES: 200
MAX_PICKUPS: 300
TICK_INTERVAL_MS: 1000/60        // ~16.67ms (60 FPS)

PLAYER_BASE_HP: 100
PLAYER_BASE_SPEED: 5.0
DASH_DISTANCE: 6
JUMP_FORCE: 8.0
GRAVITY: 20.0

BOSS_SPAWN_TIME: 540s (9 min)
BOSS_INTRO_DURATION: 2.0s
BOSS_HP: 2000 (base)

TELEPORTER_APPEAR_TIME: 300s (5 min)
TELEPORTER_ACTIVATION_DURATION: 3.0s
TELEPORTER_RADIUS: 2.0
```

### Weapon Balance
- **Range of Cooldowns**: 0.3s (Katana/Aura max) → 4.0s (Black Hole)
- **Damage Spread**: 3-65 per hit (flame to bow, level-dependent)
- **Pierce/Bounce/Chain**: Each weapon has unique projectile behavior
- **AOE Radius**: 1.0 → 8.0 units

---

## 9. KEY FILES FOR DEVELOPMENT

| File | Purpose | Lines |
|------|---------|-------|
| GameInstance.ts | Core loop, state, combat | ~1200 |
| client/index.ts | Three.js rendering | ~2995 |
| config.ts | All game numbers | ~357 |
| types.ts | TypeScript interfaces | ~309 |
| upgrades.ts | Level-up system | TBD |
| weapons.ts | Weapon fire logic | ~500+ |
| quests.ts | Quest definitions | ~150+ |
| shop.ts | Permanent upgrades | ~73 |
| save.ts | localStorage persistence | ~50+ |

---

## 10. INTERNATIONALIZATION

**i18n System** (packages/i18n):
- Runtime key lookup with parameter substitution
- English & Simplified Chinese support
- All UI strings externalized in `i18n/en.json` and `i18n/zh.json`
- Vite plugin for static mode compilation
- Usage: `t('menu.start')` or `t('hud.level', { level: '5' })`

---

## 11. DEPLOYMENT & BUILD

**Build Output:**
- Single-file game: `dist/index.html` + `dist/assets/*.js`
- Three.js served from CDN (external, not bundled)
- Code splitting: platform chunk, game-logic chunk, main chunk
- Source maps: disabled for production

**Development Server:**
```bash
pnpm dev      # Port 15173, i18n in dev mode
pnpm build    # Production build with static i18n
```

---

## SUMMARY TABLE

| Aspect | Details |
|--------|---------|
| **Engine** | Three.js 0.170.0 |
| **Platform** | Web (responsive desktop + mobile) |
| **Game Genre** | Roguelike Survivor (Wave-based) |
| **Duration** | 9 minutes to boss (+ boss fight) |
| **Characters** | 3 playable |
| **Weapons** | 13 (with 8 evolutions possible) |
| **Passives** | 10 tome types (5+ levels each) |
| **Enemies** | 8 types + 1 boss |
| **Difficulty Tiers** | 3 (Normal, Hard, Nightmare) |
| **Visual Style** | 3D Cyberpunk/Retro Neon |
| **3D Assets** | 57 GLB/GLTF models |
| **Textures** | 5 PNG sprite/particle textures |
| **Lighting** | 3 lights (Ambient, Directional, Hemisphere) + fog |
| **Materials** | MeshLambertMaterial (main), MeshBasicMaterial (UI) |
| **Persistence** | localStorage (save data, shop levels, quests) |
| **i18n** | English & Chinese |
| **Monorepo Packages** | 4 (@core, @client, @platform, @i18n) |

