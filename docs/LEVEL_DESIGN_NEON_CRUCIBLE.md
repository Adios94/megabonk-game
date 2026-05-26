# 🏟️ NEON CRUCIBLE — Arena Level Design

## Overview

**Theme:** Cyberpunk rooftop arena — an abandoned neon-lit transit hub floating above the city  
**Shape:** Plus-sign ground floor with an elevated ring and four watchtowers  
**Dimensions:** 120×120 (MAP_SIZE), playable area mostly within ±55  

### Design Philosophy

The arena is built around **concentric rings of engagement**:
1. **Inner Ring (0-15 units):** Boss arena — open, dangerous, high reward  
2. **Middle Ring (15-30 units):** Combat corridors — enemy funneling, moderate cover  
3. **Outer Ring (30-50 units):** Tactical perimeter — elevated platforms, escape routes  
4. **Edge Zone (50-60 units):** Boundary — fences, spawn proximity danger  

---

## ASCII Map (Top-Down View)

```
                    N (-Z)
         ┌─────────────────────────┐
         │   [NW-6]         [NE-6] │  ← y=6 Nests
         │     ·               ·   │
         │        ╔═══════╗        │
         │   ┌──┐ ║ N-Twr ║ ┌──┐  │  ← y=4 Towers
         │   │NW│ ║  y=4  ║ │NE│  │  ← y=2 Junctions
         │   └──┘ ╚═══════╝ └──┘  │
         │         │ N-Arm │        │
         │    ┌────┤       ├────┐   │
    W    │    │    ╔═══════╗    │   │    E
  (-X)   │════╡W-T║       ║E-T ╞═══│   (+X)
         │    │    ║ ARENA ║    │   │
         │    └────╢       ╟────┘   │
         │         │ S-Arm │        │
         │   ┌──┐ ╔═══════╗ ┌──┐  │
         │   │SW│ ║ S-Twr ║ │SE│  │
         │   └──┘ ╚═══════╝ └──┘  │
         │        ╔═══════╗        │
         │     ·               ·   │
         │   [SW-6]         [SE-6] │
         └─────────────────────────┘
                    S (+Z)
```

---

## 🎮 Gameplay Zones

### Zone 1: THE PIT (Central Arena)
- **Purpose:** Main combat area, boss fight space  
- **Height:** y=0  
- **Area:** 30×30 units (±15 from center)  
- **Design:** Wide open with 4 small cover pillars at (±6, ±6)  
- **When used:** All waves, boss fight  
- **Cover:** AC units at (±6, ±6) provide soft cover (non-blocking, visual reference)  

### Zone 2: THE CORRIDORS (Four Arms)
- **Purpose:** Enemy funneling lanes, approach routes  
- **Height:** y=0  
- **Width:** 12 units wide, extending 20-55 units from center  
- **Design:** Straight paths with street lights along edges  
- **When used:** Waves 2-5, enemy approach vectors  
- **Tactic:** AOE weapons (tornado, flame_ring) excel in corridors  

### Zone 3: THE RING (Mid-level Platforms)
- **Purpose:** Elevated loop path for repositioning  
- **Height:** y=2  
- **Layout:** 8 platforms forming a broken ring at ~25 units from center  
- **Access:** Walk up via 3-unit ramp slopes from ground  
- **When used:** Waves 3+ (when you need escape routes from archers)  
- **Tactic:** Bunny hop onto platforms for quick escapes; enemies cluster below  

### Zone 4: THE WATCHTOWERS (Cardinal Towers)
- **Purpose:** High-ground tactical positions, XP farming spots  
- **Height:** y=4  
- **Layout:** 4 towers at N/S/E/W, 40 units from center  
- **Access:** Walk up via ramp (smooth transition from adjacent y=2 ring platforms)  
- **When used:** Waves 4-5 (sniping with revolver/bow)  
- **Risk:** Cornered if enemies swarm from all directions  

### Zone 5: THE NESTS (Diagonal Pinnacles)
- **Purpose:** High-risk/high-reward perches, teleporter spawn area  
- **Height:** y=6  
- **Layout:** 4 small platforms at diagonal corners, ~45 units from center  
- **Access:** Walk up steep ramp from ground (6/3 = 2 units rise per step)  
- **When used:** Wave 5 (last-stand positions before boss)  
- **Risk:** Very small area, one wrong step = fall  

---

## 📐 Platform Collision Data

### `getTerrainHeight()` Platform Array

Format: `[centerX, centerZ, halfWidth, halfDepth, height]`

```typescript
private getTerrainHeight(x: number, z: number): number {
  const platforms: [number, number, number, number, number][] = [
    // ═══════════════════════════════════════════════════════════════
    // GROUND FLOOR (y=0) — The Pit + Corridors
    // ═══════════════════════════════════════════════════════════════
    
    // Central Arena — large open square
    [0, 0, 15, 15, 0],
    
    // North Corridor (toward -Z)
    [0, -30, 6, 15, 0],
    // South Corridor (toward +Z)
    [0, 30, 6, 15, 0],
    // East Corridor (toward +X)
    [30, 0, 15, 6, 0],
    // West Corridor (toward -X)
    [-30, 0, 15, 6, 0],
    
    // Diagonal fill patches (smooth the corners between arms)
    [15, -15, 5, 5, 0],
    [-15, -15, 5, 5, 0],
    [15, 15, 5, 5, 0],
    [-15, 15, 5, 5, 0],
    
    // Corridor end pads (wider landing zones near boundary)
    [0, -50, 8, 5, 0],
    [0, 50, 8, 5, 0],
    [50, 0, 5, 8, 0],
    [-50, 0, 5, 8, 0],
    
    // ═══════════════════════════════════════════════════════════════
    // MID-LEVEL RING (y=2) — The Catwalk
    // ═══════════════════════════════════════════════════════════════
    
    // Cardinal stations (on corridor edges)
    [0, -25, 5, 4, 2],     // N station
    [0, 25, 5, 4, 2],      // S station
    [25, 0, 4, 5, 2],      // E station
    [-25, 0, 4, 5, 2],     // W station
    
    // Diagonal junctions (between corridors)
    [20, -20, 5, 5, 2],    // NE junction
    [-20, -20, 5, 5, 2],   // NW junction
    [20, 20, 5, 5, 2],     // SE junction
    [-20, 20, 5, 5, 2],    // SW junction
    
    // ═══════════════════════════════════════════════════════════════
    // WATCHTOWERS (y=4) — Cardinal Overlooks
    // ═══════════════════════════════════════════════════════════════
    
    // Positioned so ramp zone overlaps with mid-ring for smooth ascent
    [0, -40, 5, 5, 4],     // N tower
    [0, 40, 5, 5, 4],      // S tower
    [40, 0, 5, 5, 4],      // E tower
    [-40, 0, 5, 5, 4],     // W tower
    
    // ═══════════════════════════════════════════════════════════════
    // NESTS (y=6) — Diagonal Pinnacles
    // ═══════════════════════════════════════════════════════════════
    
    [38, -38, 3, 3, 6],    // NE nest
    [-38, -38, 3, 3, 6],   // NW nest
    [38, 38, 3, 3, 6],     // SE nest
    [-38, 38, 3, 3, 6],    // SW nest
  ];

  let height = 0;
  for (const [cx, cz, hw, hd, h] of platforms) {
    const dx = Math.abs(x - cx);
    const dz = Math.abs(z - cz);

    if (dx <= hw && dz <= hd) {
      height = Math.max(height, h);
    } else if (dx <= hw + 3 && dz <= hd + 3) {
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

### Platform Count Summary
| Level | Count | Total Area | Purpose |
|-------|-------|-----------|---------|
| y=0   | 9     | ~4400 sq  | Main fighting floor |
| y=2   | 8     | ~780 sq   | Tactical ring |
| y=4   | 4     | ~400 sq   | Overlook towers |
| y=6   | 4     | ~144 sq   | Sniper nests |
| **Total** | **25** | **~5724 sq** | |

---

## 🏗️ Visual Model Placements

### `buildArena()` Complete Implementation

```typescript
private buildArena(): void {
  const HALF = GROUND_SIZE / 2; // 60

  // ═══════════════════════════════════════════════════════════════════
  // A. GROUND FLOOR — Central Arena (The Pit)
  // 4×4 platform tiles, scale 2.0 = 8×8 per tile
  // Need to cover 30×30 area = ~4×4 grid of tiles
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
  
  // Diagonal fill patches (platform_2x2 at scale 2.0 = 4×4 per tile)
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
  
  // Cardinal stations — platform_4x2 at y=2
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
    // Rail guards on outer edge
    this.placeModel('rail_long', jx + Math.sign(jx) * 4, 2.1, jz, jr + Math.PI / 2, 1.8);
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // D. WATCHTOWERS (y=4) — Cardinal Overlooks
  // Large elevated platforms with full support structures
  // ═══════════════════════════════════════════════════════════════════
  
  const towers: [number, number, number][] = [
    [0, -40, 0],               // N tower
    [0, 40, Math.PI],          // S tower
    [40, 0, -Math.PI / 2],    // E tower
    [-40, 0, Math.PI / 2],    // W tower
  ];
  for (const [tx, tz, tr] of towers) {
    // Main platform
    this.placeModel('platform_4x4', tx, 4, tz, tr, 2.5);
    // Four tall supports
    this.placeModel('support_long', tx - 4, 0, tz - 4, 0, 2.2);
    this.placeModel('support_long', tx + 4, 0, tz - 4, 0, 2.2);
    this.placeModel('support_long', tx - 4, 0, tz + 4, 0, 2.2);
    this.placeModel('support_long', tx + 4, 0, tz + 4, 0, 2.2);
    // Rails on all edges
    this.placeModel('rail_long', tx, 4.1, tz - 5, 0, 2.2);
    this.placeModel('rail_long', tx, 4.1, tz + 5, Math.PI, 2.2);
    this.placeModel('rail_long', tx - 5, 4.1, tz, Math.PI / 2, 2.2);
    this.placeModel('rail_long', tx + 5, 4.1, tz, -Math.PI / 2, 2.2);
    // Door (cosmetic entrance)
    this.placeModel('door', tx, 4, tz + (tz < 0 ? 5 : -5), tr, 1.8);
    // Sign on top
    this.placeModel('sign_1', tx + 3, 5.5, tz, tr, 1.5);
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // E. NESTS (y=6) — Diagonal Pinnacles (small, dangerous perches)
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
    // Pipe antenna on top
    this.placeModel('pipe_1', nx, 6.5, nz, 0, 1.5);
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // F. ARENA BOUNDARY — Fences around 120×120 perimeter
  // ═══════════════════════════════════════════════════════════════════
  
  const fenceSpacing = 5;
  // North and South edges
  for (let fx = -HALF; fx <= HALF; fx += fenceSpacing) {
    this.placeModel('fence_platform', fx, 0, -HALF, 0, 2.0);
    this.placeModel('fence_platform', fx, 0, HALF, Math.PI, 2.0);
  }
  // East and West edges
  for (let fz = -HALF; fz <= HALF; fz += fenceSpacing) {
    this.placeModel('fence_platform', -HALF, 0, fz, Math.PI / 2, 2.0);
    this.placeModel('fence_platform', HALF, 0, fz, -Math.PI / 2, 2.0);
  }
  // Corner pillars (tall supports as boundary markers)
  this.placeModel('support_long', -HALF, 0, -HALF, 0, 3.5);
  this.placeModel('support_long', HALF, 0, -HALF, 0, 3.5);
  this.placeModel('support_long', -HALF, 0, HALF, 0, 3.5);
  this.placeModel('support_long', HALF, 0, HALF, 0, 3.5);
  
  // ═══════════════════════════════════════════════════════════════════
  // G. STREET LIGHTING — Along corridors and at key intersections
  // ═══════════════════════════════════════════════════════════════════
  
  const streetLights: [number, number, number, number][] = [
    // Central arena perimeter lights
    [-12, 0, -12, Math.PI / 4],
    [12, 0, -12, -Math.PI / 4],
    [-12, 0, 12, -Math.PI / 4],
    [12, 0, 12, Math.PI / 4],
    
    // North corridor
    [-7, 0, -22, 0],
    [7, 0, -22, Math.PI],
    [-7, 0, -36, 0],
    [7, 0, -36, Math.PI],
    [-7, 0, -50, 0],
    [7, 0, -50, Math.PI],
    
    // South corridor
    [-7, 0, 22, Math.PI],
    [7, 0, 22, 0],
    [-7, 0, 36, Math.PI],
    [7, 0, 36, 0],
    [-7, 0, 50, Math.PI],
    [7, 0, 50, 0],
    
    // East corridor
    [22, 0, -7, -Math.PI / 2],
    [22, 0, 7, Math.PI / 2],
    [36, 0, -7, -Math.PI / 2],
    [36, 0, 7, Math.PI / 2],
    [50, 0, -7, -Math.PI / 2],
    [50, 0, 7, Math.PI / 2],
    
    // West corridor
    [-22, 0, -7, Math.PI / 2],
    [-22, 0, 7, -Math.PI / 2],
    [-36, 0, -7, Math.PI / 2],
    [-36, 0, 7, -Math.PI / 2],
    [-50, 0, -7, Math.PI / 2],
    [-50, 0, 7, -Math.PI / 2],
  ];
  for (const [lx, ly, lz, lr] of streetLights) {
    this.placeModel('light_street', lx, ly, lz, lr, 1.8);
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // H. SIGNS & NEON — On towers and at corridor entrances
  // ═══════════════════════════════════════════════════════════════════
  
  const signs: [keyof LoadedModels, number, number, number, number, number][] = [
    // Corridor entrance signs (welcoming enemies!)
    ['sign_2', -8, 3, -16, 0, 2.0],
    ['sign_2', 8, 3, -16, Math.PI, 2.0],
    ['sign_1', -8, 3, 16, Math.PI, 2.0],
    ['sign_1', 8, 3, 16, 0, 2.0],
    ['sign_2', -16, 3, -8, Math.PI / 2, 2.0],
    ['sign_1', -16, 3, 8, Math.PI / 2, 2.0],
    ['sign_2', 16, 3, -8, -Math.PI / 2, 2.0],
    ['sign_1', 16, 3, 8, -Math.PI / 2, 2.0],
    
    // Tower top signs
    ['sign_1', 2, 6, -42, 0, 1.8],
    ['sign_2', -2, 6, 42, Math.PI, 1.8],
    ['sign_1', 42, 6, 2, -Math.PI / 2, 1.8],
    ['sign_2', -42, 6, -2, Math.PI / 2, 1.8],
    
    // Nest identification signs
    ['sign_1', 40, 7.5, -38, Math.PI / 4, 1.2],
    ['sign_2', -40, 7.5, -38, -Math.PI / 4, 1.2],
    ['sign_1', 40, 7.5, 38, -Math.PI / 4, 1.2],
    ['sign_2', -40, 7.5, 38, Math.PI / 4, 1.2],
  ];
  for (const [sk, sx, sy, sz, sr, ss] of signs) {
    this.placeModel(sk, sx, sy, sz, sr, ss);
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // I. AC UNITS & PIPES — Environmental detail / soft cover
  // ═══════════════════════════════════════════════════════════════════
  
  // Central arena cover positions (small obstacles to weave around)
  const coverPositions: [number, number, number, number][] = [
    [6, 0, -6, 0],
    [-6, 0, -6, Math.PI / 2],
    [6, 0, 6, Math.PI],
    [-6, 0, 6, -Math.PI / 2],
    [0, 0, -10, 0],
    [0, 0, 10, Math.PI],
    [10, 0, 0, -Math.PI / 2],
    [-10, 0, 0, Math.PI / 2],
  ];
  for (const [cx, cy, cz, cr] of coverPositions) {
    this.placeModel('ac_unit', cx, cy, cz, cr, 1.8);
  }
  
  // Pipes along corridor walls
  const pipePositions: [number, number, number, number][] = [
    // North corridor pipes
    [-7, 0.5, -28, 0],
    [7, 0.5, -28, Math.PI],
    [-7, 0.5, -42, 0],
    [7, 0.5, -42, Math.PI],
    // South corridor pipes
    [-7, 0.5, 28, Math.PI],
    [7, 0.5, 28, 0],
    [-7, 0.5, 42, Math.PI],
    [7, 0.5, 42, 0],
    // East corridor pipes
    [28, 0.5, -7, -Math.PI / 2],
    [28, 0.5, 7, Math.PI / 2],
    [42, 0.5, -7, -Math.PI / 2],
    [42, 0.5, 7, Math.PI / 2],
    // West corridor pipes
    [-28, 0.5, -7, Math.PI / 2],
    [-28, 0.5, 7, -Math.PI / 2],
    [-42, 0.5, -7, Math.PI / 2],
    [-42, 0.5, 7, -Math.PI / 2],
  ];
  for (const [px, py, pz, pr] of pipePositions) {
    this.placeModel('pipe_1', px, py, pz, pr, 1.8);
  }
  
  // AC units on watchtower supports (detail)
  for (const [tx, tz] of [[0, -40], [0, 40], [40, 0], [-40, 0]] as [number, number][]) {
    this.placeModel('ac_unit', tx + 5, 2, tz, Math.PI / 2, 1.5);
    this.placeModel('ac_unit', tx - 5, 2, tz, -Math.PI / 2, 1.5);
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // J. DOORS — On watchtowers (cosmetic building entrances)
  // ═══════════════════════════════════════════════════════════════════
  
  this.placeModel('door', 0, 4, -35, 0, 1.8);   // N tower front
  this.placeModel('door', 0, 4, 35, Math.PI, 1.8);   // S tower front
  this.placeModel('door', 35, 4, 0, -Math.PI / 2, 1.8); // E tower front
  this.placeModel('door', -35, 4, 0, Math.PI / 2, 1.8);  // W tower front
  
  // ═══════════════════════════════════════════════════════════════════
  // K. RAIL GUARDS — Safety rails on elevated platforms
  // ═══════════════════════════════════════════════════════════════════
  
  // Mid-ring station rails (outer edges only — inner edges left open for jumping)
  const ringRails: [number, number, number, number][] = [
    // N station outer
    [0, 2.1, -29, 0],
    // S station outer
    [0, 2.1, 29, Math.PI],
    // E station outer
    [29, 2.1, 0, -Math.PI / 2],
    // W station outer
    [-29, 2.1, 0, Math.PI / 2],
  ];
  for (const [rx, ry, rz, rr] of ringRails) {
    this.placeModel('rail_long', rx, ry, rz, rr, 2.0);
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // L. NEON FLOOR PANELS — Emissive quads for cyberpunk atmosphere
  // ═══════════════════════════════════════════════════════════════════
  
  const glowPositions: [number, number, number][] = [
    // Central arena cross pattern
    [0, 0, 0x00ffcc],
    [-8, 0, 0xff00ff],
    [8, 0, 0x00ffcc],
    [0, -8, 0xff00ff],
    [0, 8, 0x00ffcc],
    // Corridor centers
    [0, -30, 0x00ffcc],
    [0, 30, 0xff00ff],
    [30, 0, 0x00ffcc],
    [-30, 0, 0xff00ff],
    // Junction markers
    [20, -20, 0x00ffcc],
    [-20, -20, 0xff00ff],
    [20, 20, 0xff00ff],
    [-20, 20, 0x00ffcc],
  ];
  for (const [gx, gz, gColor] of glowPositions) {
    const glowGeo = new THREE.PlaneGeometry(2.5, 2.5);
    glowGeo.rotateX(-Math.PI / 2);
    const glowMat = new THREE.MeshBasicMaterial({
      color: gColor,
      transparent: true,
      opacity: 0.15,
    });
    const glowMesh = new THREE.Mesh(glowGeo, glowMat);
    glowMesh.name = `FloorGlow_${gx}_${gz}`;
    glowMesh.position.set(gx, 0.02, gz);
    this.scene.add(glowMesh);
  }
}
```

---

## 🗺️ Navigation & Flow

### Ground Level Movement Patterns

```
Player spawns at (0, 0, 0) — center of The Pit

Early game (0-60s): Stay in center, enemies come from all 4 corridors
  → Natural killzone, AOE weapons shine

Mid game (60-180s): Begin using corridors as escape routes
  → Run down a corridor, turn, kite enemies in a line
  → Circle pattern: N→E→S→W corridors (clockwise loop)

Late game (180-420s): Use mid-ring for tactical repositioning
  → Jump/walk up to y=2 stations, enemies cluster below
  → Hop between junction platforms for hit-and-run
  
Final wave (420-540s): Use watchtowers for survival
  → Climb to y=4, pick off enemies with ranged weapons
  → When overwhelmed, jump down and slide to another tower
```

### Vertical Navigation Map

```
Height  What's There              How to Reach
──────  ────────────────────────  ──────────────────────────────────
y=6     Nests (3×3 platforms)     Walk up ramp from ground (steep)
y=4     Watchtowers (5×5)         Walk up ramp from y=2 ring or ground
y=2     Ring stations (5×4/5×5)   Walk up ramp / bunny hop from ground
y=0     Ground (corridors + pit)  Default level
```

### Ramp Transitions (Automatic via 3-unit edge zones)

| From → To | Method | Notes |
|-----------|--------|-------|
| y=0 → y=2 | Walk up ramp edge | 3 units of slope (0.67 rise/unit) |
| y=0 → y=4 | Walk up ramp edge | Steeper (1.33 rise/unit) but works |
| y=0 → y=6 | Walk up ramp edge | Very steep (2.0 rise/unit) but walkable |
| y=2 → y=4 | Walk + combined ramps | If platforms are near, ramps overlap |
| y=2 → y=0 | Walk off edge / jump | 3-unit ramp down or jump off |
| y=4 → y=0 | Walk off edge / jump | Fall damage not implemented = safe |

---

## 🎯 Teleporter Spawn Strategy

Teleporters appear at t=300s. Ideal spawn zones:

| Location | Coordinates | Rationale |
|----------|-------------|-----------|
| N Tower Top | (0, -40) | Requires climbing to y=4, risk vs reward |
| S Tower Top | (0, 40) | Opposite side — forces traversal |
| Diagonal | (±35, ∓35) | Near nests, between zones |

The teleporter spawning code uses random angles + distance (25-40 units from player). With this layout, teleporters will naturally land on:
- Ground corridors (most common)
- Near watchtower bases
- In diagonal quadrants near nests

This creates interesting decisions: stay safe in center or venture out to activate teleporters.

---

## 👾 Enemy Flow Analysis

### Spawn Vectors

Enemies spawn at `halfMap + 5 = 65` units from center, distributed across 4 edges:

```
                 Spawn: z = -65
                 ↓↓↓↓↓↓↓↓↓↓↓
    ┌──────────────────────────────────┐
    │                                  │ Spawn: x = +65
    │      Funnel into N corridor      │ →→→
    │      ↓↓↓↓↓                       │ Funnel into E corridor
    │           ╔═══════════╗          │ →→→
    │     ←←←  ║  PLAYER   ║  →→→     │
    │           ╚═══════════╝          │
    │      ↑↑↑↑↑                       │
    │      Funnel into S corridor      │ ←←←
    │                                  │ Spawn: x = -65
    └──────────────────────────────────┘
                 ↑↑↑↑↑↑↑↑↑↑↑
                 Spawn: z = +65
```

### Corridor Funneling Effect

Because the ground has a **plus-sign shape** and enemies use `Math.max(-halfMap, Math.min(halfMap, ...))` clamping, enemies approaching from corners will naturally path along the corridors toward center. This creates:

- **Wave 1-2:** Clean 4-directional enemy streams → easy to manage
- **Wave 3-4:** Corridors become packed → need to use ring for escape
- **Wave 5:** All corridors overflow → climb watchtowers or die

### Enemy Pathfinding Notes

Enemies use simple chase AI (move toward player.x, player.z). They DO NOT check terrain height. This means:
- Enemies pass through/under elevated platforms
- Being on y=2 ring doesn't block melee (XZ distance still checked)
- Ranged enemies will shoot upward at elevated players
- **Tactical advantage is positional awareness, not invulnerability**

---

## 🏆 Boss Fight Arena Design

The boss spawns at `(0, 0, -mapSize * 0.3)` = `(0, 0, -36)`, which lands in the North corridor.

### Boss Fight Space Requirements
- Boss melee sweep: 3.5 unit radius
- Ground slam: 5.0 unit radius  
- AOE explosion: 7.0 unit radius
- Dark rain: 12 unit spread around player

### Why This Layout Works for Boss:

1. **Central pit (30×30)** gives the boss room to chase and player room to dodge
2. **Four corridor exits** let the player kite the boss in a loop pattern
3. **Mid-ring platforms** provide momentary safety from ground_slam
4. **Boss chase speed (3-5 units/s)** vs player speed (5+) allows kiting around ring
5. **Open center** means dark_rain is dodge-able with slide (1.8x speed boost)

### Recommended Boss Strategy by Phase:
- **Phase 1 (100-60% HP):** Kite in central arena, dodge sweeps with slide
- **Phase 2 (60-30% HP):** Use corridors for dark_bolt dodging, towers for breathers
- **Phase 3 (<30% HP, enraged):** Full ring circulation, jump between platforms

---

## 📦 Model Usage Summary

| Model Key | Count | Usage |
|-----------|-------|-------|
| platform_4x4 | 20 | Central arena floor + tower tops |
| platform_4x2 | 44 | Corridors + mid-ring stations |
| platform_2x2 | 16 | Diagonal fills + ring junctions |
| platform_1x1 | 4 | Nest pinnacles |
| support | 20 | Mid-ring platform legs |
| support_long | 28 | Tower legs + nests + boundary corners |
| rail_long | 24 | Tower rails + ring guards |
| fence_platform | ~96 | Boundary fencing (120/5 × 4 sides) |
| light_street | 28 | Corridor + arena lighting |
| sign_1 | 10 | Tower/nest/corridor decoration |
| sign_2 | 10 | Tower/nest/corridor decoration |
| ac_unit | 16 | Arena cover + tower detail |
| pipe_1 | 20 | Corridor walls + nest antennas |
| door | 4 | Tower entrances (cosmetic) |
| **Total** | **~320** | |

---

## ⚡ Performance Considerations

1. **Model count:** ~320 placed models (up from ~260 in current layout). Each is a cloned Object3D. Should remain performant as Three.js handles static meshes well.

2. **Collision check:** 25 platform rectangles (down from 30 in current). The O(n) loop in `getTerrainHeight` is called per-frame for the player only, so 25 iterations is negligible.

3. **Draw calls:** Models share the same loaded GLTF sources, so material batching applies. The plus-sign layout actually has better spatial coherence than the scattered current layout (more frustum culling opportunities).

4. **Spatial hash:** The 120×120 arena with cell size 4 is unchanged. Enemy density is the same.

---

## 🔧 Implementation Checklist

### Step 1: Update `getTerrainHeight()` in `GameInstance.ts`
- Replace the existing `platforms` array with the new one (25 entries)
- The ramp logic (3-unit edge zones) stays identical

### Step 2: Update `buildArena()` in `index.ts`  
- Replace the entire method body with the new implementation
- No new model keys needed — all referenced models are already in `loadedModels`
- Verify the neon floor glow code has access to `THREE` (it does, it's in the class)

### Step 3: Test Navigation
- [ ] Player can reach all y=2 platforms by walking up ramps
- [ ] Player can reach all y=4 platforms by walking up ramps
- [ ] Player can reach all y=6 platforms by walking up ramps (steep)
- [ ] Bunny hop reaches y=2 from y=0 (2.1 > 2.0 ✓)
- [ ] Player spawns at (0,0,0) in the central arena
- [ ] Boss spawns at (0, 0, -36) — in north corridor, walkable

### Step 4: Test Gameplay
- [ ] Wave 1: Enemies funnel through corridors toward center
- [ ] Wave 3: Player can escape to mid-ring when overwhelmed
- [ ] Wave 5: Watchtowers provide viable survival spots
- [ ] Boss: Enough space for all attack dodging
- [ ] Teleporters: Can spawn in accessible areas (ground corridors)
- [ ] Boundary: Enemies stop at ±65, player stops at ±60

---

## 🎨 Visual Mood

The "Neon Crucible" should feel like:
- A cyberpunk rooftop arena suspended above a dark cityscape
- Neon glow strips marking dangerous zones
- Industrial pipes and AC units showing the "working guts" of the building
- Street lights creating pools of warm light against the blue-grey fog
- Signs flickering with unreadable neon characters
- A sense of verticality — looking up at watchtowers, looking down at enemies

The fog color (0x6a7a8a) and ambient lighting from the existing setup will naturally work with this layout. The concentrated vertical structures will catch more light and create better shadows than the flat current layout.

---

## Comparison: Current vs. Neon Crucible

| Aspect | Current Layout | Neon Crucible |
|--------|---------------|---------------|
| Ground shape | Rectangle (40×40 + wings) | Plus-sign with corridors |
| Vertical levels | 3 (y=0, 2-3, 5-6) | 4 (y=0, 2, 4, 6) |
| Flow pattern | Open field | Corridor funneling + ring loop |
| Boss space | Center (open) | Center + corridor kiting |
| Cover options | None | AC units at (±6, ±6) |
| Escape routes | Run to corners | 4 corridors + vertical escape |
| Visual landmarks | Scattered | Symmetrical, easy to orient |
| Platform count | 30 | 25 (simpler collision) |
| Navigation clarity | Low (many small platforms) | High (clear zones with purpose) |
