# MegaBonk Physics & Collision - Quick Reference

## File Locations & Key Functions

| File | Location | Purpose |
|------|----------|---------|
| `physics.ts` | `game/core/source/` | Basic 2D movement math |
| `GameInstance.ts` | `game/core/source/` | Main game logic & movement |
| `spatial-hash.ts` | `game/core/source/` | Collision detection via grid |
| `config.ts` | `game/core/source/` | All game constants |
| `types.ts` | `game/core/source/` | TypeScript interfaces |

---

## Core Movement Functions

### `applyMovement3D()` (physics.ts)
```typescript
function applyMovement3D(
  x, z,           // Current position
  moveX, moveZ,   // Input direction (-1 to 1)
  speed,          // Movement speed (units/s)
  dt,             // Delta time (seconds)
  mapSize         // Arena size
): {x, z} | null
```
**What it does:**
1. Normalizes input direction
2. Calculates new position: `newPos = oldPos + direction * speed * dt`
3. Clamps to `±mapSize/2`
4. Returns new position or null if no movement

**Called by:**
- `processPlayerMovement()` - horizontal movement
- `processDash()` - dash movement
- `moveEnemy()` - enemy AI movement

---

### `getTerrainHeight(x, z)` (GameInstance.ts:512-569)
```typescript
getTerrainHeight(x: number, z: number): number
```
**Returns:** The Y height at world position (x, z)

**How it works:**
1. Iterates 32 platforms
2. Checks if position is inside or near platform
3. Returns maximum height of overlapping platforms
4. Interpolates ramp heights (3-unit feathering)

**Used by:**
- Landing detection (jump physics)
- Vertical collision (player clipping)

---

### `processPlayerMovement(dt)` (GameInstance.ts:408-510)
**Handles all player movement modes:**
- Horizontal (XZ acceleration/deceleration)
- Vertical (jump + gravity)
- Sliding (speed boost)
- Bunny hopping (landing timing bonus)

---

## Movement Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `PLAYER_BASE_SPEED` | 5.0 u/s | Max walking speed |
| `SLIDE_SPEED_MULTIPLIER` | 1.8× | Speed multiplier while sliding |
| `JUMP_FORCE` | 8.0 u/s | Initial upward velocity |
| `GRAVITY` | -20.0 u/s² | Downward acceleration |
| `BUNNY_HOP_WINDOW` | 0.15 s | Time to chain jump after landing |
| `BUNNY_HOP_BONUS` | 1.3× | Height multiplier for bunny hop |
| `SLIDE_DURATION` | 0.6 s | How long slide lasts |
| `DASH_DISTANCE` | 6 units | Total dash distance |
| `DASH_DURATION` | 0.2 s | Dash completion time |
| `DASH_COOLDOWN` | 5 s | Time between dashes |

---

## Collision Detection

### Spatial Hash Grid
```typescript
class SpatialHash {
  cellSize: 4 units
  hashCell(cx, cz): (cx * 73856093) ^ (cz * 19349663)
  query(x, z, radius): number[]  // Returns entity IDs
}
```

### Collision Radii
| Entity | Radius | Code |
|--------|--------|------|
| Player | ~0.5 u | (implicit) |
| Enemy | 0.5 u | `insert(id, x, z, 0.5)` |
| Boss | 1.5 u | `insert(-1, x, z, 1.5)` |
| Projectile | 0.2-0.4 u | Varies per weapon |

### Collision Check Pattern
```typescript
// Broad phase: get nearby entities
const nearbyIds = spatialHash.query(x, z, radius);

// Narrow phase: circle-to-circle distance
for (const id of nearbyIds) {
  const entity = findEntity(id);
  const dist = Math.sqrt((entity.x - x)² + (entity.z - z)²);
  if (dist <= radius + entity.radius) {
    // Collision detected
  }
}
```

---

## Arena Geometry

### World Bounds
- **X Range:** -60 to 60 units
- **Z Range:** -60 to 60 units
- **Y Range:** 0 to 6 units
- **Total Area:** 120 × 120 units

### Platform Hierarchy (32 total)
```
Level 0 (Ground):
├─ Central: [0, 0] size 20×20, height 0
├─ North Wing: [0, 24], [0, -24] size 8×8, height 0
├─ East Wing: [24, 0], [-24, 0] size 8×8, height 0
├─ Diagonal: [-24, -8], [24, -8], etc. size 8×4, height 0
└─ Corner wings: [-8, ±24], [8, ±24] size 4×8, height 0

Level 2 (Mid):
├─ Corners: [-18, ±15], [18, ±15] size 5×5, height 2
├─ Edges: [0, ±30], [±30, 0] size 5×5, height 2

Level 3 (Raised):
├─ Corner: [-30, -30], [30, -30], [-30, 30], [30, 30]
│  size 8×8, height 3

Level 5-6 (High):
├─ Horizontal: [-40, 0], [40, 0] size 4×4, height 6
├─ Vertical: [0, -40], [0, 40] size 4×4, height 5
├─ Diagonal: [-38, -38], [38, 38] size 4×4, height 5
```

---

## Jump Physics Breakdown

### Jump Setup (on ground)
```typescript
if (jumpPressed && isGrounded && !isSliding) {
  // Check for bunny hop bonus
  const isBunnyHop = bunnyHopTimer > 0;
  const multiplier = isBunnyHop ? 1.3 : 1.0;
  
  velocityY = JUMP_FORCE * multiplier;  // 8.0 * 1.0 or 1.3
  isGrounded = false;
  isJumping = true;
}
```

### Jump Physics (in air)
```typescript
// Apply gravity each frame
if (!isGrounded) {
  velocityY -= GRAVITY * dt;    // velocityY -= 20 * 0.0167
  y += velocityY * dt;          // y += velocityY * 0.0167
}

// Check landing
const groundHeight = getTerrainHeight(x, z);
if (y <= groundHeight) {
  y = groundHeight;
  velocityY = 0;
  isGrounded = true;
  bunnyHopTimer = BUNNY_HOP_WINDOW;  // 0.15 sec window opens
}
```

### Jump Trajectory
```
Apex height ≈ (JUMP_FORCE²) / (2 * GRAVITY)
            = (8²) / (2 * 20) = 1.6 units

With bunny hop multiplier:
           = (8*1.3)² / (2*20) = 2.7 units (69% higher!)

Airtime ≈ 2 * JUMP_FORCE / GRAVITY = 0.8 seconds
With bonus ≈ 1.04 seconds
```

---

## Dash Mechanic Breakdown

### Dash Trigger
```typescript
// Edge detection: only trigger on button press
const dashPressed = input.dash && !lastDashInput;

if (dashPressed && dashCooldown <= 0) {
  dashTimer = DASH_DURATION;        // 0.2 s
  dashCooldown = DASH_COOLDOWN;     // 5 s
  invincibleTimer = DASH_DURATION;  // 0.2 s
}
```

### Dash Movement
```typescript
if (dashTimer > 0) {
  dashTimer -= dt;
  
  // Speed: 6 units in 0.2 seconds = 30 units/s
  const dashSpeed = DASH_DISTANCE / DASH_DURATION;
  
  // Move in facing direction
  applyMovement3D(
    x, z,
    facingX, facingZ,
    dashSpeed, dt,
    mapSize
  );
}
```

---

## Enemy Collision Examples

### Melee Attack
```typescript
if (dist < 1.2 && player.invincibleTimer <= 0) {
  player.hp -= rawDamage;
  player.invincibleTimer = 0.5;  // Invincible for 0.5s after hit
}
```

### Ranged Attack
```typescript
// Skeleton archer shoots at preferred range
const preferredRange = config.preferredRange;  // 8 units
if (dist <= preferredRange * 1.5 && dist >= preferredRange * 0.5) {
  // Fire projectile toward player
}
```

---

## Projectile Special Cases

### Bone Bouncer (Bounce)
```typescript
if (proj.bouncesLeft > 0) {
  proj.bouncesLeft--;
  // Find next nearest enemy and redirect velocity
  const nextTarget = findNearestEnemyExcluding(x, z, hitEnemyIds);
  const dir = normalizeDirection(target.x - x, target.z - z);
  proj.vx = dir.x * speed;
  proj.vz = dir.z * speed;
  continue;  // Don't consume projectile
}
```

### Black Hole (Gravitational)
```typescript
proj.gravitational = true;
proj.gravityStrength = 8.0;

// Enemies pulled toward projectile center
const dx = proj.x - enemy.x;
const dz = proj.z - enemy.z;
const dist = Math.sqrt(dx² + dz²);
const pull = gravityStrength / (dist + 0.1);
enemy.x += (dx / dist) * pull * dt;
enemy.z += (dz / dist) * pull * dt;
```

---

## State Management

### Player Movement State
```typescript
interface PlayerState {
  x, y, z: number;           // Position
  rotation: number;           // Facing angle
  velocityY: number;          // Vertical velocity
  isGrounded: boolean;        // On terrain?
  isJumping: boolean;         // Currently jumping?
  isSliding: boolean;         // Currently sliding?
  slideTimer: number;         // Slide time remaining
  bunnyHopTimer: number;      // Time left for bunny hop bonus
  dashTimer: number;          // Current dash time
  dashCooldown: number;       // Time until dash available
  invincibleTimer: number;    // Invincibility duration
}
```

---

## Common Tweaks

### Make Jump Higher
```typescript
// In config.ts:
export const JUMP_FORCE = 10.0;  // was 8.0
// → Apex height: (10²) / (2*20) = 2.5 units (was 1.6)
```

### Faster Movement
```typescript
export const PLAYER_BASE_SPEED = 7.0;  // was 5.0
```

### Longer Bunny Hop Window
```typescript
export const BUNNY_HOP_WINDOW = 0.25;  // was 0.15
```

### Stronger Slides
```typescript
export const SLIDE_SPEED_MULTIPLIER = 2.5;  // was 1.8
```

---

## Debugging Tips

### Check if position is on platform
```typescript
const height = getTerrainHeight(player.x, player.z);
console.log(`At (${player.x}, ${player.z}): ground height = ${height}`);
console.log(`Player is ${player.isGrounded ? 'ON' : 'OFF'} ground`);
```

### Check collision radius
```typescript
const dist = distanceBetween(player.x, player.z, enemy.x, enemy.z);
console.log(`Distance to enemy: ${dist}, collision = ${dist < 1.2}`);
```

### Verify bunny hop window
```typescript
if (bunnyHopTimer > 0) {
  console.log(`Bunny hop available! Time left: ${bunnyHopTimer.toFixed(2)}s`);
}
```

