# MegaBonk Game Architecture Diagram

## System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                      MEGABONK GAME INSTANCE                      │
│                     (GameInstance.ts)                            │
└──────────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┼─────────────┐
                │             │             │
         ┌──────▼──────┐  ┌──▼──────┐  ┌──▼──────┐
         │  MOVEMENT   │  │ WEAPONS │  │COLLISION│
         │   SYSTEM    │  │ SYSTEM  │  │ SYSTEM  │
         └─────────────┘  └─────────┘  └─────────┘
```

---

## Movement System Architecture

```
┌──────────────────────────────────────────────────────────┐
│              PLAYER MOVEMENT CONTROLLER                  │
├──────────────────────────────────────────────────────────┤
│  Input: moveX, moveZ, jump, slide, dash                  │
│  Output: player.x, player.z, player.y, rotation          │
└──────────────────────────────────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
   ┌────▼────┐  ┌──▼───┐  ┌───▼─────┐
   │HORIZONTAL│  │JUMP/  │  │ DASH    │
   │MOVEMENT  │  │GRAVITY│  │ MOTION  │
   │(XZ plane)│  │(Y axis)│  │(30u/s)  │
   └──────────┘  └────────┘  └─────────┘
        │           │           │
        └───────────┼───────────┘
                    │
            ┌───────▼────────┐
            │APPLY MOVEMENT  │
            │ 3D (physics.ts)│
            │ + Clamping     │
            └────────────────┘
```

---

## Collision Detection System

```
┌──────────────────────────────────────────────────────────┐
│           SPATIAL HASH COLLISION SYSTEM                  │
│                (spatial-hash.ts)                          │
├──────────────────────────────────────────────────────────┤
│  Cell Size: 4 units                                       │
│  Hash: (cx * 73856093) ^ (cz * 19349663)                 │
│  Query: Circle vs Circle distance check                   │
└──────────────────────────────────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
   ┌────▼────┐  ┌──▼───┐  ┌───▼──────┐
   │ENEMIES  │  │BOSS   │  │PROJECTILES
   │(r=0.5)  │  │(r=1.5)│  │(r=0.2-0.4)
   └─────────┘  └───────┘  └───────────┘
```

---

## Terrain/Collision Height System

```
                    PLATFORM HEIGHTS
                    
        Level 5-6                ┌───────┐
        (High edges)     ┌──────┐│ y = 6 │
                        │y = 5 │└──┬────┘
        Level 3                  │
        (Corners)      ┌─────────┼──────────┐
                      │y = 3    │          │
        Level 2                 │   ┌──────▼──────┐
        (Mid-level)    ┌────┐   │   │ y = 2       │
                      │y=2 │   │   └──────────────┘
                      └────┘   │
        Level 0            ┌────▼─────────────────┐
        (Ground)    ┌─────┐│ y = 0 (central)      │
                   │wings ││ 40x40 center         │
                   └─────┘└──────────────────────┘
                   
        getTerrainHeight(x, z) → max_height_at(x, z)
        + Smooth 3-unit ramps at platform edges
```

---

## Entity Collision System

```
┌─────────────────────────────────────────────────┐
│         ENTITY COLLISION CHECKS                 │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ PLAYER vs ENEMY (Melee)                 │   │
│  │ if dist < 1.2: damage + knockback       │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ PLAYER PROJECTILE vs ENEMY              │   │
│  │ Spatial hash query → circle distance    │   │
│  │ → pierce/bounce logic                   │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ ENEMY PROJECTILE vs PLAYER              │   │
│  │ if dist < proj.radius + 0.5: damage     │   │
│  │ if yDist < 1.5: (vertical check)        │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ PLAYER vs GROUND (Vertical)             │   │
│  │ if player.y <= getTerrainHeight():      │   │
│  │   → isGrounded = true                   │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Movement Input → Output Flow

```
INPUT                PROCESSING               OUTPUT
─────────────────────────────────────────────────────────────

moveX, moveZ  ───┐
jump          ───┤
slide         ───┼──> [processPlayerMovement]
dash          ───┤       │
                 ├──> [Horizontal Acceleration/Deceleration]
                 │
                 ├──> [Jump + Gravity Physics]
                 │       - bunnyHopTimer check (1.3x bonus)
                 │       - velocityY -= GRAVITY*dt
                 │       - Landing detection
                 │
                 ├──> [Slide Speed Multiplier]
                 │       - speedMultiplier = 1.8x or 1.0x
                 │
                 ├──> [applyMovement3D()]
                 │       - Normalize direction
                 │       - Clamp to ±halfMap
                 │
                 └──> [Boundary Check + Update Position]
                      
                      ┌──────────────────────┐
                      │ player.x, player.z   │
                      │ player.y, velocityY  │
                      │ player.rotation      │
                      │ isGrounded, isJumping│
                      └──────────────────────┘
```

---

## Movement Mode State Machine

```
                   ┌──────────────┐
                   │  ON GROUND   │
                   │ isGrounded=T │
                   └──────┬───────┘
                          │
              ┌───────────┼───────────┐
              │           │           │
         JUMP INPUT   SLIDE INPUT   DASH INPUT
              │           │           │
         ┌────▼─┐      ┌──▼──┐   ┌───▼────┐
         │IN AIR│      │SLIDE│   │DASHING │
         │JUMP  │      │     │   │        │
         │=1    │      └──┬──┘   └───┬────┘
         └────┬─┘         │          │
              │      ┌────▼────┐     │
              └─────>│ON GROUND│<────┘
                     │ LANDING │
                     └────┬────┘
                          │
                    ┌─────▼──────┐
                    │bunnyHop    │
                    │Timer=0.15s │
                    └────────────┘
```

---

## Coordinate System

```
          +Z (forward)
           │
           │   PLAYER
           │   (0,Y,0)
           │
    ───────┼─────── +X (right)
          /
         /
       +Y (up)

Arena: X: [-60, 60]
       Z: [-60, 60]
       Y: [0, 6]
```

---

## Config Constants (config.ts)

```
MOVEMENT
├─ PLAYER_BASE_SPEED = 5.0 u/s
├─ DASH_DISTANCE = 6 units
├─ DASH_DURATION = 0.2 seconds
├─ DASH_COOLDOWN = 5 seconds
├─ JUMP_FORCE = 8.0 units/s
├─ GRAVITY = 20.0 units/s²
├─ SLIDE_DURATION = 0.6 s
├─ SLIDE_SPEED_MULTIPLIER = 1.8x
├─ BUNNY_HOP_WINDOW = 0.15 s
└─ BUNNY_HOP_BONUS = 1.3x

WORLD
├─ MAP_SIZE = 120 units
├─ TICK_INTERVAL_MS = 1000/60 ≈ 16.67ms
└─ PLAYER_PICKUP_RADIUS = 2.0

PLATFORMS (32 total)
├─ Level 0: 1×20×20 center + 12 wings
├─ Level 2: 8×5×5 mid-level platforms
├─ Level 3: 1 raised corner platform
└─ Level 5-6: 4 high edge platforms
```

---

## Key Insights

### ✅ What's Implemented
- **Height-based collision** (implicit from terrain function)
- **Circle-based distance checks** (spatial hash)
- **Boundary clamping** (hard arena limits)
- **Smooth acceleration/deceleration** (feel-based movement)
- **Jump + gravity physics** (with bunny hop mechanic)
- **Dash mechanic** (invincibility, cooldown)
- **Slide speed boost** (80% faster movement)
- **Knockback system** (distance-based)

### ❌ What's NOT Implemented
- No AABB collision
- No raycasting
- No swept collision detection
- No friction or air resistance
- No ceiling collision
- No platform edge collision (implicit only)
- No complex pathfinding
- No soft-body physics

### 🎯 Design Philosophy
**Simplicity + Performance** over physics realism
- Perfect for fast-paced roguelike action
- Implicit geometry reduces memory overhead
- Spatial hash enables many entities without slowdown
- Direct position updates (no prediction needed)

