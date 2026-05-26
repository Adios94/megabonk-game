# MegaBonk Game - Complete Physics & Collision System Analysis

## Overview
MegaBonk is a 3D roguelike survivor game with a **Cyberpunk arena** featuring **multi-level platforms**. The physics system operates on the **XZ plane** (Y is vertical), with collision detection using **spatial hashing** for efficiency.

---

## 1. PHYSICS & COLLISION SYSTEM

### 1.1 Core Physics (`physics.ts`)
The physics system is **very simple** — focused on XZ plane movement with boundary clamping:

```typescript
export function applyMovement3D(
  x: number, z: number,
  moveX: number, moveZ: number,
  speed: number, dt: number,
  mapSize: number
): { x: number; z: number } | null
```

**Key Points:**
- **No true 3D physics** — all collision/movement is 2D on XZ plane
- **Input normalization** — movement direction is normalized to prevent diagonal speed boost
- **Boundary clamping** — hard limits at `±mapSize/2`
- **Deterministic** — no physics engine, just direct position updates
- **Utility functions:**
  - `distanceBetween()` — Euclidean distance on XZ plane
  - `normalizeDirection()` — Vector normalization with zero-vector handling

---

## 2. WORLD GEOMETRY & LEVEL DESIGN

### 2.1 Terrain Heights: Dynamic Platform System (`GameInstance.ts:512-569`)

The game uses a **function-based terrain system** with **NO collision volumes**. Terrain height is computed per-position:

```typescript
private getTerrainHeight(x: number, z: number): number {
  const platforms: [cx, cz, halfWidth, halfDepth, height][] = [
    // Central ground floor (20x20 units, height 0)
    [0, 0, 20, 20, 0],
    
    // Extended floor wings (height 0)
    [-24, 0, 8, 8, 0],
    [24, 0, 8, 8, 0],
    // ... more ground level platforms
    
    // Elevated corner platforms (height 3)
    [-30, -30, 8, 8, 3],
    [30, -30, 8, 8, 3],
    // ... more elevated platforms
    
    // Mid-level platforms (height 2)
    [-18, -15, 5, 5, 2],
    // ... more platforms
    
    // High platforms (height 5-6)
    [-40, 0, 4, 4, 6],
  ];
  
  let height = 0;
  for (const [cx, cz, hw, hd, h] of platforms) {
    const dx = Math.abs(x - cx);
    const dz = Math.abs(z - cz);
    
    if (dx <= hw && dz <= hd) {
      height = Math.max(height, h);  // Inside platform
    } else if (dx <= hw + 3 && dz <= hd + 3) {
      // Ramp edges (smooth transition over 3 units)
      const edgeDist = Math.max(dx - hw, dz - hd, 0);
      if (edgeDist <= 3) {
        const rampHeight = h * (1 - edgeDist / 3);
        height = Math.max(height, rampHeight);
      }
    }
  }
  return height;
}
```

**Key Features:**
- **32 total platforms** arranged hierarchically:
  - **Level 0 (ground)**: 1 central 20×20 platform + 12 wing extensions
  - **Level 2 (mid)**: 8 elevated 5×5 platforms at corners/edges
  - **Level 3**: 1 raised corner platform
  - **Level 5-6 (high)**: 4 high platforms at arena edges

- **No collision volumes** — collision is implicit from height values
- **Smooth ramps** — 3-unit feathered edges allow walking up/down slopes
- **Stacking logic** — `height = max(height, h)` means overlapping platforms use highest value

### 2.2 Arena Bounds
- **MAP_SIZE = 120** units (derived from `config.ts`)
- **Arena bounds**: `±60` units in X and Z
- **Hard boundary clamping** in movement: `Math.max(-halfMap, Math.min(halfMap, newPos))`
- **No wrapping** — players cannot exit bounds

---

## 3. COLLISION DETECTION SYSTEM

### 3.1 Spatial Hash Grid (`spatial-hash.ts`)

**Purpose**: Fast broad-phase collision detection using grid hashing

**Grid parameters:**
- **Cell size**: 4 units (default)
- **Hash function**: Prime number hashing for good distribution
  ```typescript
  private hashCell(cx: number, cz: number): number {
    return ((cx * 73856093) ^ (cz * 19349663)) | 0;
  }
  ```

**Algorithm:**
1. **Insert**: Entities occupy multiple grid cells based on their bounding circle radius
2. **Query**: Return list of entity IDs in overlapping cells within distance
3. **Distance check**: Circle-to-circle collision (not AABB)

```typescript
const combinedRadius = queryRadius + entryRadius;
if (distSq <= combinedRadius * combinedRadius) {
  // Collision detected
}
```

### 3.2 Entity Collision Radii

Different entity types have different collision sizes:

```typescript
// In processCollisions():
for (const enemy of enemies) {
  if (enemy.hp <= 0) continue;
  this.spatialHash.insert(enemy.id, enemy.x, enemy.z, 0.5);  // Enemy radius
}

if (this.state.boss && this.state.boss.hp > 0) {
  this.spatialHash.insert(-1, this.state.boss.x, this.state.boss.z, 1.5);  // Boss radius
}

// Projectile collision check (from playerProjectiles):
const nearbyIds = this.spatialHash.query(proj.x, proj.z, proj.radius);
```

**Collision radii:**
- **Enemies**: 0.5 units
- **Boss**: 1.5 units
- **Projectiles**: varies (typically 0.2-0.4 units)
- **Player**: ~0.5 units (implicit in melee distance checks)

### 3.3 Collision Types

#### A. Player Melee (vs Enemies)
```typescript
if (dist < 1.2) {  // Melee range
  // Apply damage, knockback
}
```

#### B. Projectile-Enemy
```typescript
// Player projectiles vs spatial hash query
const nearbyIds = this.spatialHash.query(proj.x, proj.z, proj.radius);
for (const id of nearbyIds) {
  if (proj.hitEnemyIds.includes(id)) continue;  // Already hit
  enemy.hp -= proj.damage;
  proj.hitEnemyIds.push(id);  // Mark as hit
  
  // Pierce/bounce/lifetime logic
  if (proj.pierceLeft > 0) {
    proj.pierceLeft--;
    continue;  // Don't consume projectile
  }
  consumed = true;  // Projectile consumed
}
```

#### C. Enemy Projectile-Player
```typescript
const dist = distanceBetween(proj.x, proj.z, player.x, player.z);
const yDist = Math.abs(proj.y - 0.5);
if (dist < proj.radius + 0.5 && yDist < 1.5) {
  player.hp -= damage;  // Hit detected
}
```

#### D. Player-Ground (Vertical Collision)
```typescript
const groundHeight = this.getTerrainHeight(player.x, player.z);
if (player.y <= groundHeight) {
  player.y = groundHeight;
  player.velocityY = 0;
  player.isGrounded = true;
}
```

---

## 4. GAMEINSTANCE MOVEMENT LOGIC

### 4.1 Player Movement (`processPlayerMovement`, lines 408-510)

**Three movement modes:**

#### A. **Horizontal Movement** (XZ plane, continuous)
- **Input**: `moveX`, `moveZ` (normalized -1 to 1)
- **Acceleration**: Smooth lerp toward target speed
  ```typescript
  const accelRate = 8.0;
  player.currentSpeed += (targetSpeed - player.currentSpeed) * Math.min(1, accelRate * dt);
  ```
- **Deceleration**: Faster deceleration than acceleration
  ```typescript
  const decelRate = 12.0;
  player.currentSpeed += (0 - player.currentSpeed) * Math.min(1, decelRate * dt);
  ```
- **Movement applied via**: `applyMovement3D()` with boundary clamping

#### B. **Jumping** (Vertical movement with gravity)
- **Trigger**: Jump button pressed + on ground + not sliding
- **Jump force**: `JUMP_FORCE = 8.0` units/s
- **Bunny hop**: 30% bonus height within `BUNNY_HOP_WINDOW = 0.15s` of landing
  ```typescript
  const isBunnyHop = player.bunnyHopTimer > 0;
  const jumpMultiplier = isBunnyHop ? 1.3 : 1.0;
  player.velocityY = JUMP_FORCE * jumpMultiplier;
  ```
- **Gravity**: `-20.0` units/s² applied continuously while airborne
  ```typescript
  if (!player.isGrounded) {
    player.velocityY -= GRAVITY * dt;
    player.y += player.velocityY * dt;
  }
  ```

#### C. **Sliding** (Speed boost mechanic)
- **Trigger**: Slide input + grounded + not jumping + not already sliding
- **Duration**: `SLIDE_DURATION = 0.6s`
- **Speed multiplier**: `SLIDE_SPEED_MULTIPLIER = 1.8x` (80% faster)
- **Landing → auto-slide**: If slide input held when landing, automatically slide
  ```typescript
  if (this.currentInput.slide && !player.isSliding) {
    player.isSliding = true;
    player.slideTimer = SLIDE_DURATION;
    player.slideSpeedBoost = SLIDE_SPEED_MULTIPLIER;
  }
  ```

### 4.2 Jump & Gravity Physics

**State variables:**
```typescript
player.velocityY: number;        // Current vertical velocity
player.isGrounded: boolean;       // True if on terrain
player.isJumping: boolean;        // True if in air from jump
player.bunnyHopTimer: number;     // Time remaining for bunny hop bonus
```

**Landing detection:**
```typescript
const groundHeight = this.getTerrainHeight(player.x, player.z);
if (player.y <= groundHeight) {
  player.y = groundHeight;
  player.velocityY = 0;
  player.isGrounded = true;
  player.isJumping = false;
  player.bunnyHopTimer = BUNNY_HOP_WINDOW;  // 0.15s window
}
```

**Bunny hop mechanics:**
- Player must jump **within 0.15s of landing** to get bonus
- Bonus is **30% extra height** (multiplier 1.3)
- Enables skilled player movement tech

### 4.3 Dash Mechanic (`processDash`, lines 571-601)

**Dash parameters:**
- **Distance**: `DASH_DISTANCE = 6` units total
- **Duration**: `DASH_DURATION = 0.2s`
- **Cooldown**: `DASH_COOLDOWN = 5s`
- **Invincibility**: Full duration (0.2s) during dash
- **Speed**: Computed as `DASH_DISTANCE / DASH_DURATION = 30 units/s`

**Dash system:**
```typescript
// Edge detection: trigger only on button press, not hold
const dashPressed = this.currentInput.dash && !this.lastDashInput;

if (dashPressed && player.dashCooldown <= 0 && player.dashTimer <= 0) {
  player.dashTimer = DASH_DURATION;
  player.dashCooldown = DASH_COOLDOWN;
  player.invincibleTimer = DASH_DURATION;  // Invincible during dash
}

// During dash: move in facing direction at high speed
if (player.dashTimer > 0) {
  player.dashTimer -= dt;
  const dashSpeed = DASH_DISTANCE / DASH_DURATION;  // 30 units/s
  // Apply movement in facing direction
}
```

### 4.4 Facing Direction & Rotation

**Rotation tracking:**
```typescript
if (moveX !== 0 || moveZ !== 0) {
  this.facingX = moveX;
  this.facingZ = moveZ;
  player.rotation = Math.atan2(moveX, moveZ);
}
```

**Used for:**
- Projectile aiming (weapons fire toward facing direction)
- Dash direction
- Animation orientation

---

## 5. PLATFORM COLLISION & VERTICAL MOVEMENT

### 5.1 Platform Collision Model

**There are NO explicit collision shapes.** Collision is implicit from `getTerrainHeight()`:

1. **Player Y position** is clamped to terrain height
2. **Gravity pulls down** until landing on platform
3. **Ramps are smoothly traversable** (no steps/ledges)

**Example platform layout:**
```
          HEIGHT 6
           ╱─╲
          ╱   ╲
        ╱       ╲  HEIGHT 5
    ╱──────────────╲
   ╱  HEIGHT 2     ╲
  ╱                 ╲
╱───────────────────────────╲
      HEIGHT 0 (GROUND)
```

### 5.2 Height Query for Position

When moving, terrain height is determined by:
1. Find all platforms player is above
2. Return maximum height (handles platform stacking)
3. Apply smooth ramp interpolation at edges

**Key consequence**: No "ceiling collision" — player can jump through overhangs.

---

## 6. WALLS & BOUNDARIES

### 6.1 Arena Bounds (Hard Limits)

**No explicit walls.** Boundaries enforced by clamping:

```typescript
const halfMap = this.config.mapSize * 0.5;  // 60 units
const newX = Math.max(-halfMap, Math.min(halfMap, x + nx * speed * dt));
const newZ = Math.max(-halfMap, Math.min(halfMap, z + nz * speed * dt));
```

**Behavior**: 
- Player cannot move beyond `±60` in X or Z
- Enemies clamped similarly
- Projectiles removed if out of bounds
- Smooth stopping at boundaries (no bouncing)

### 6.2 Gaps Between Platforms

**No collision detection between platforms.** Players can:
- Fall off platform edges
- Slide into gaps
- Get stuck in low areas if health drops to 0

---

## 7. GROUND, PLATFORMS, WALLS SUMMARY

| Feature | Type | Implementation |
|---------|------|---|
| **Ground** | Implicit | Lowest platform (height 0) across center |
| **Platforms** | Implicit function-based | 32 platforms at heights 0, 2, 3, 5-6 |
| **Ramps/Steps** | Smooth interpolation | 3-unit feathered edges |
| **Walls** | None | Only hard boundary clamping |
| **Ceiling** | None | No collision when jumping up |
| **Collision shapes** | None | Circle radii for enemies/projectiles only |

---

## 8. SPECIAL COLLISION CASES

### 8.1 Gargoyle Landing AOE
```typescript
private gargoyleLandingAOE(enemy: EnemyState): void {
  const aoRadius = 3;
  if (dist <= aoRadius) {
    // Damage player or other enemies
  }
}
```

### 8.2 Gravitational Projectiles (Black Hole)
```typescript
proj.gravitational: true;
proj.gravityStrength: 8.0;

// Applied in updateProjectiles():
applyGravitationalPull(proj, this.state.enemies, dt);
```

### 8.3 Projectile Pierce & Bounce
```typescript
// Bone bouncer bounces between enemies
if (proj.pierceLeft > 0) {
  proj.pierceLeft--;
  continue;  // Don't consume projectile
}
```

---

## 9. COORDINATES & COORDINATE SYSTEM

**Coordinate system**: **Right-handed XZ-Y**
- **X-axis**: Left-right (width)
- **Z-axis**: Forward-backward (depth)  
- **Y-axis**: Up-down (height)

**Arena center**: `(0, 0, 0)`
**Bounds**: `x: [-60, 60], z: [-60, 60], y: [0, 6]`

---

## 10. COLLISION DEBUGGING INFO

### Active Components:
1. **Spatial hash** (4-unit cells)
2. **Terrain height function** (32 platforms)
3. **Distance checks** (circle radii)
4. **Boundary clamping** (hard limits)

### Missing Components:
- No AABB collision
- No raycasting
- No swept collision detection
- No physics forces (except gravity on Y)
- No friction/air resistance

---

## CONCLUSION

**MegaBonk's collision system is MINIMAL and IMPLICIT:**
- Terrain is a **height function**, not volumetric
- Enemies/projectiles use **circle distance checks**
- Boundaries are **hard-clamped**
- Movement is **direct position updates** with no prediction
- No explicit collision shapes defined anywhere

This design prioritizes **simplicity and performance** over physics accuracy, which is ideal for a fast-paced roguelike survivor game.
