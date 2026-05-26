# MegaBonk Game Project - Complete Arena & Asset Exploration

## 1. ARENA BUILDING SYSTEM

### Location
`game/client/source/index.ts` — `buildArena()` method (lines 673-913)

### Build Method Overview
The arena is constructed using pre-loaded 3D models that are **cloned and positioned** via the `placeModel()` helper function (lines 662-671). This allows full reuse of materials and skeletal animations while avoiding memory bloat.

---

## 2. ARENA LAYOUT & STRUCTURE

### A. Ground Floor (Level 0, y=0)
**Layout:** 5×5 grid of large platform tiles forming the main playable area (~40×40 units)

**Models Used:**
- `platform_4x4` — Cyberpunk floor tile (4×4 units, scaled 2× = 8×8 units effective)
  - Primary arena surface with heavy decorative details
  - Tiled: 5×5 arrangement at z=-8 to z=+8, x=-8 to x=+8
  - Scale: 2.0

**Extended Floor Wings (surrounding the core):**
- `platform_4x2` — Rectangular floor extension (4×2 units)
  - North/South edges: x=±24, z=0 and z=±8
  - East/West edges: z=±24, x=0 and x=±8
  - Scale: 2.0

---

### B. Elevated Platforms (Level 1, y=3)
**Purpose:** Mid-level combat zones around the arena perimeter

**Models Used:**
- **Corner Platforms (4 locations):**
  - `platform_4x2` at (-30, 3, -30), (30, 3, -30), (-30, 3, 30), (30, 3, 30)
  - Each rotated 0°, 90°, -90°, 180° respectively
  - Scale: 2.5
  
- **Support Structures underneath each corner:**
  - `support` (1.0 unit base support) — 4 per corner
  - Positioned diagonally around each platform at ±3, ±3 offsets
  - Scale: 2.0
  
- **Rails on platform edges:**
  - `rail_long` — Front and back edges of each elevated platform
  - Scale: 2.0

- **Mid-level platforms (Level 2, y=2) — between corners:**
  - `platform_2x2` at 8 locations (NE, SE, NW, SW, N, S, E, W cardinal points)
  - Scale: 2.0
  - Single `support` underneath each (scale: 1.5)

---

### C. High Platforms (Level 2-3, y=5-6)
**Purpose:** Sniper/XP farming spots, visual height variation

**Models Used:**
- `platform_1x1` — Small high-altitude platform (1×1 unit base)
  - 6 locations: 4 cardinal directions at (±40, 0, ±40) + 2 diagonals
  - Scale: 2.5
  
- `support_long` — Tall structural support
  - One per high platform to create dramatic vertical spans
  - Scale: 2.0
  
- `pipe_1` — Antenna/pipe on top of each high platform
  - Positioned at (x, y+0.5, z)
  - Scale: 1.5

---

### D. Arena Boundary (Perimeter)
**Models Used:**
- `fence_platform` — Cyberpunk fence railings around 120×120 edge
  - North edge: x=-60 to +60 (every 6 units), z=-60
  - South edge: x=-60 to +60 (every 6 units), z=+60
  - East edge: z=-60 to +60 (every 6 units), x=+60
  - West edge: z=-60 to +60 (every 6 units), x=-60
  - Scale: 2.0

- `support_long` — Corner boundary markers (4 corners at ±60, ±60)
  - Scale: 3.0
  - Creates tall pillars at arena edges

---

### E. Lighting & Atmosphere

**Street Lights (20 placements):**
- `light_street` — Ground-level light poles
- Positioned around edges and cardinal lines
- Examples: (-20, 0, -16), (20, 0, 16), (-40, 0, -20), etc.
- Rotations: 0°, 90°, 180°, 270° as needed
- Scale: 1.8

---

### F. Neon Signs & Branding

**Decorative Signage (10 placements):**
- `sign_1` and `sign_2` — Alternating neon sign models
- Positions: On elevated platforms and high platforms
- Examples:
  - Corner placement: (-30, 4, -32), (30, 4, -32), etc.
  - Mid-platform: (-18, 3, -17), (18, 3, -17)
  - High placement: (-42, 7, 0), (42, 7, 0)
- Scale: 1.5 to 2.0

---

### G. Mechanical Props (Pipes & AC Units)

**AC Units (12 placements):**
- `ac_unit` — HVAC equipment on support pillars
- Positioned: (-33, 1.5, -28), (33, 1.5, -28), etc.
- Creates industrial aesthetic around perimeter
- Scale: 1.5

**Pipes (10 placements):**
- `pipe_1` — Cylindrical conduit running along supports
- Located near support structures at y=0.5 to y=2
- Rotations: 0°, 90°, -90° (horizontal and vertical)
- Scale: 1.8

---

### H. Doors (Cosmetic)

**Door Placements (4):**
- `door` model on elevated corner platforms
- (-30, 3, -27), (30, 3, -27), (-30, 3, 27), (30, 3, 27)
- Scale: 1.8

---

### I. Rail Guards (Additional Props)

**Guard Rails (8 placements):**
- `rail_long` on mid-level platforms
- Provide visual protection and detail
- Scale: 1.8

---

### J. Glow Panels (Cyberpunk Aesthetic)

**Emissive Floor Panels (9 placements):**
- **Custom geometry:** PlaneGeometry 2×2 units at y=0.02
- Alternating colors: 0x00ffcc (cyan) and 0xff00ff (magenta)
- Low opacity (0.15) for subtle ambient glow
- Positions: (0,0), (±8,±8), (±16,0), (0,±16), etc.

---

## 3. AVAILABLE 3D MODELS

### Location
`/Users/liusheng/Documents/megabonk-game/dist/models/`

### Complete Model List (57 files)

**Player Models:**
- `player_cyberpunk.gltf` (1.5MB) — Main player character (GLTF with animations)
- `player.glb` (248KB) — Legacy player fallback

**Enemy Models:**
- `enemy_2legs.gltf` (798KB) — Skeleton soldier base model (2-legged creature)
- `enemy_2legs_gun.gltf` (500KB) — Zombie/archer variant (2-legged with weapon)
- `enemy_flying.gltf` (321KB) — Bat/flying enemy base
- `enemy_flying_gun.gltf` (351KB) — Flying enemy with gun
- `enemy_large.gltf` (469KB) — Large skeleton knight
- `enemy_large_gun.gltf` (1.0MB) — Boss/large enemy with weapon

**Special Enemies:**
- `skeleton.glb` (202KB) — Skeletal structure
- `ghost.glb` (114KB) — Ghost enemy
- `zombie.glb` (245KB) — Zombie enemy
- `pumpkin.glb` (46KB) — Seasonal prop (Halloween)
- `boss.glb` (250KB) — Boss character model

**Platform Architecture (Cyberpunk Kit):**
- `platform_4x4_full.gltf` (1.1MB) — Full 4×4 grid floor tile (with details)
- `platform_4x4.gltf` (443KB) — Standard 4×4 platform
- `platform_4x2.gltf` (1.0MB) — Rectangular 4×2 platform
- `platform_2x2.gltf` (1.0MB) — Medium 2×2 platform
- `platform_2x1.gltf` (13KB) — Small 2×1 platform
- `platform_1x1.gltf` (443KB) — Single 1×1 platform
- `platform_4x1.gltf` (668KB) — Long 4×1 platform (walkway)

**Structural Support:**
- `support.gltf` (8.4KB) — Small base support pillar
- `support_long.gltf` (43KB) — Extended tall support

**Railings & Barriers:**
- `rail_long.gltf` (10KB) — Guard rail (standard)
- `rail_long.fbx` (20KB) — Guard rail (FBX format)
- `rail_short.gltf` (10KB) — Short rail segment
- `fence.glb` (10KB) — Fence piece
- `fence_platform.gltf` (18KB) — Platform edge fence
- `fence_cyber.fbx` (24KB) — Cyberpunk fence variant

**Lighting:**
- `light_street_1.gltf` (26KB) — Street light variant 1
- `light_street_2.gltf` (33KB) — Street light variant 2
- `light_street.fbx` (25KB) — Street light (FBX)
- `light_square.gltf` (16KB) — Square light fixture
- `antenna_1.gltf` (8.7KB) — Antenna/radio mast

**Signage & Props:**
- `sign_1.gltf` (439KB) — Neon sign model 1
- `sign_1.fbx` (18KB) — Neon sign model 1 (FBX)
- `sign_2.gltf` (439KB) — Neon sign model 2
- `sign_3.gltf` (438KB) — Neon sign model 3
- `sign_corner_1.gltf` (441KB) — Corner neon sign variant

**Mechanical Equipment:**
- `ac_unit.gltf` (53KB) — Single AC unit (air conditioner)
- `ac_stacked.gltf` (473KB) — Multiple stacked AC units
- `pipe_1.gltf` (8.7KB) — Standard pipe/conduit
- `pipe_2.gltf` (8.6KB) — Alternate pipe design
- `door.gltf` (34KB) — Doorway/entrance
- `computer.gltf` (49KB) — Computer console
- `tv_1.gltf` (466KB) — Television/monitor

**Interactive Objects:**
- `lootbox.gltf` (67KB) — Treasure/loot container
- `collectible_gear.gltf` (21KB) — Pickup item (gear/collectible)
- `pickup_health.gltf` (52KB) — Health pickup item
- `pickup_heart.gltf` (49KB) — Heart/life pickup

**Decorative Props:**
- `tree.glb` (35KB) — Tree decoration
- `tombstone.glb` (15KB) — Tombstone/grave marker
- `turret_cannon.gltf` (101KB) — Cannon turret

**Teleportation:**
- `turret_teleporter.gltf` (87KB) — Teleporter portal model

---

## 4. AVAILABLE TEXTURES

### Location
`/Users/liusheng/Documents/megabonk-game/dist/textures/`

### Complete Texture List (5 files)

**Particle Textures (PNG, 32-bit RGBA):**
- `particle_circle.png` (65KB) — Circular particle sprite
- `particle_flare.png` (42KB) — Flare/lens effect particle
- `particle_star.png` (30KB) — Star-shaped particle
- `particle_twirl.png` (51KB) — Spiral/twirl particle effect

**UI/Prop Textures:**
- `texture_sign.png` (321KB) — Large sign texture atlas (for neon signs)

---

## 5. MODEL LOADING SYSTEM

### LoadedModels Interface (Lines 250-278)

```typescript
interface LoadedModels {
  // Character models
  player: THREE.Group | null;
  skeleton: THREE.Group | null;
  zombie: THREE.Group | null;
  ghost: THREE.Group | null;
  boss: THREE.Group | null;
  tombstone: THREE.Group | null;
  tree: THREE.Group | null;
  
  // Enemy models
  enemy_flying: THREE.Group | null;
  enemy_large: THREE.Group | null;
  
  // Teleporter
  teleporter: THREE.Group | null;
  
  // Platform models (legacy)
  platform: THREE.Group | null;
  
  // Pickups
  pickup: THREE.Group | null;
  
  // Cyberpunk platform kit
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
```

### Currently Loaded Models (loadModels() function, lines 314-373)

**27 Models Loaded:**

| Model Key | File Path | Purpose |
|-----------|-----------|---------|
| player | `/models/player_cyberpunk.gltf` | Main character |
| skeleton | `/models/enemy_2legs.gltf` | Skeleton soldier enemy |
| zombie | `/models/enemy_2legs_gun.gltf` | Zombie/archer enemy |
| ghost | `/models/enemy_flying.gltf` | Flying ghost enemy |
| enemy_flying | `/models/enemy_flying_gun.gltf` | Flying enemy with weapon |
| enemy_large | `/models/enemy_large.gltf` | Large skeleton knight |
| boss | `/models/enemy_large_gun.gltf` | Boss enemy |
| teleporter | `/models/turret_teleporter.gltf` | Teleporter portal |
| platform | `/models/platform_4x1.gltf` | Standard platform |
| pickup | `/models/collectible_gear.gltf` | Pickup item |
| tombstone | `/models/tombstone.glb` | Decorative tombstone |
| tree | `/models/tree.glb` | Decorative tree |
| platform_4x4 | `/models/platform_4x4_full.gltf` | Main arena floor tile |
| platform_4x2 | `/models/platform_4x2.gltf` | Extended floor platform |
| platform_2x2 | `/models/platform_2x2.gltf` | Medium platform |
| platform_1x1 | `/models/platform_1x1.gltf` | Small high platform |
| support | `/models/support.gltf` | Base support pillar |
| support_long | `/models/support_long.gltf` | Tall support |
| rail_long | `/models/rail_long.gltf` | Guard rail |
| fence_platform | `/models/fence_platform.gltf` | Arena boundary fence |
| light_street | `/models/light_street_1.gltf` | Street lamp |
| sign_1 | `/models/sign_1.gltf` | Neon sign 1 |
| sign_2 | `/models/sign_2.gltf` | Neon sign 2 |
| ac_unit | `/models/ac_unit.gltf` | AC unit |
| pipe_1 | `/models/pipe_1.gltf` | Pipe conduit |
| door | `/models/door.gltf` | Door decoration |

### Model Loading Features

1. **Asynchronous Loading:**
   - Uses `GLTFLoader` from Three.js
   - All models loaded in parallel with `Promise.all()`
   - Graceful fallback for missing/failed models

2. **Animation Support:**
   - Animations extracted from GLTF files
   - Stored in `loadedAnimClips` Map keyed by model name
   - Used for skeletal animations on player and enemies

3. **Material Handling:**
   - Original materials preserved (textures/colors maintained)
   - Shadow disabled for performance: `castShadow = false`, `receiveShadow = false`

4. **Cloning Strategy:**
   - Models cloned using `cloneSkeleton()` utility
   - Preserves material properties and animation clips
   - Enables multiple instances without duplication

---

## 6. ASSET MEMORY & PERFORMANCE

### Model Sizes (Total: ~14MB across 57 files)

| Category | Size | Count | Notes |
|----------|------|-------|-------|
| Large enemies | 2.3MB | 6 | Heavy detail, weapon variants |
| Platforms | 5.6MB | 7 | Main arena geometry |
| Props | 1.2MB | 20+ | Decorative, lighting, signs |
| Small models | 0.3MB | 15+ | Antennas, pipes, supports |
| Audio/Textures | 1.0MB | 5 | Particle textures, sign atlas |

### Per-Frame Performance Features

1. **InstancedMesh for Projectiles/Pickups:** ~1000 instanced objects rendered efficiently
2. **Object Pooling for Enemies:** Recycled models prevent GC pressure
3. **Material Sharing:** All clones share base materials
4. **No Shadow Rendering:** Disabled on all arena/prop models

---

## 7. ARENA DIMENSIONS & LAYOUT REFERENCE

```
┌─────────────────────────────────────────────────────────────────┐
│  ARENA BOUNDARIES (120×120 units)                               │
│  (-60,-60) to (+60,+60)                                         │
│                                                                 │
│      ┌─ High Platforms (y=5-6)                                 │
│      │ Located at ±40 on axes + diagonals                      │
│      │                                                          │
│  ┌───┼──────── Elevated Corners (y=3) ────────┐               │
│  │   │         ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓  │               │
│  │ (-30,3)  Mid-level (+30,3)                 │               │
│  │   ┌──────────────────────────────────────┐ │               │
│  │   │  ╔════════════════════════════════╗ │ │               │
│  │   │  ║   GROUND FLOOR (y=0)           ║ │ │               │
│  │   │  ║   5×5 platform_4x4 grid       ║ │ │               │
│  │   │  ║   (-8 to +8, -8 to +8)        ║ │ │               │
│  │   │  ║   [Primary Combat Zone]       ║ │ │               │
│  │   │  ╚════════════════════════════════╝ │ │               │
│  │   │      Extended wings (platform_4x2) │ │               │
│  │   └──────────────────────────────────────┘ │               │
│  │                                             │               │
│  └─ FENCE + SUPPORT PILLARS (boundary) ──────┘               │
│                                                                 │
│  Street lights and decorations throughout                     │
└─────────────────────────────────────────────────────────────────┘

Height Layers:
- y= 0.0  — Ground level (floor tiles, picks, lights)
- y= 0.5  — Low props (pipes)
- y= 1.5  — AC units on supports
- y= 2.0  — Mid-platforms
- y= 3.0  — Elevated platforms (combat)
- y= 5-6  — High sniper platforms
- y= 14   — Player spotlight (overhead)
```

---

## 8. KEY DESIGN PATTERNS

### Arena Building Method (`placeModel`)
```typescript
private placeModel(
  modelKey: keyof LoadedModels,
  x: number,           // World X position
  y: number,           // World Y position (height)
  z: number,           // World Z position
  rotY: number = 0,    // Rotation around Y axis (radians)
  scale: number = 1    // Uniform scale factor
): void {
  const model = loadedModels[modelKey];
  if (!model) return;
  const clone = cloneSkeleton(model) as THREE.Object3D;
  clone.name = `Placed_${modelKey}_${x.toFixed(0)}_${z.toFixed(0)}`;
  clone.position.set(x, y, z);
  clone.rotation.y = rotY;
  clone.scale.set(scale, scale, scale);
  this.scene.add(clone);
}
```

### Material Cloning Strategy
- Original GLTF materials preserved
- Shadows disabled for performance
- Each clone gets independent material instance
- Textures embedded in GLTF files

### Animation Integration
- Skeletal animations loaded from GLTF
- Separate `AnimationMixer` per animated model
- Clips cached in `loadedAnimClips` Map for reuse

---

## 9. SUMMARY

**Arena Composition:**
- **Floor:** 5×5 grid of 4×4 platforms + extended wings
- **Height Variation:** 5 distinct height levels (0, 2, 3, 5, 6)
- **Perimeter:** Fenced boundary with support pillars
- **Decoration:** 40+ prop placements (signs, lights, AC units, pipes)
- **Total Models in Arena:** 120+ individual placed instances
- **Unique Model Types:** 26 distinct models actively used

**Performance Optimized:**
- All models use original GLTF materials
- No shadow rendering enabled
- Enemy cloning uses object pool
- Particle effects use InstancedMesh
- Efficient camera frustum culling

**Expansion Ready:**
- New models can be added to `LoadedModels` interface
- `placeModel()` automatically handles scaling/rotation
- Animation system supports any GLTF with skeletal rigs
- Platform kit designed for modular level design

