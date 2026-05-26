/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * NEON CRUCIBLE — Implementation Code
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * This file contains the two replacement functions for the Neon Crucible arena.
 * Copy each section into its respective file.
 * 
 * FILE 1: game/core/source/GameInstance.ts → replace getTerrainHeight()
 * FILE 2: game/client/source/index.ts → replace buildArena()
 */

// ═══════════════════════════════════════════════════════════════════════════════
// FILE 1: GameInstance.ts — Replace getTerrainHeight() method
// ═══════════════════════════════════════════════════════════════════════════════

/*
  /** Get terrain height at position — Neon Crucible arena layout */
  private getTerrainHeight(x: number, z: number): number {
    const platforms: [number, number, number, number, number][] = [
      // ═══════════════════════════════════════════════════════════════
      // GROUND FLOOR (y=0) — The Pit + Corridors
      // ═══════════════════════════════════════════════════════════════
      
      // Central Arena — 30×30 open square
      [0, 0, 15, 15, 0],
      
      // North Corridor (extends to z = -55)
      [0, -30, 6, 15, 0],
      // South Corridor (extends to z = +55)
      [0, 30, 6, 15, 0],
      // East Corridor (extends to x = +55)
      [30, 0, 15, 6, 0],
      // West Corridor (extends to x = -55)
      [-30, 0, 15, 6, 0],
      
      // Diagonal fill patches (smooth corners between arms)
      [15, -15, 5, 5, 0],
      [-15, -15, 5, 5, 0],
      [15, 15, 5, 5, 0],
      [-15, 15, 5, 5, 0],
      
      // Corridor end pads (wider landing zones at edges)
      [0, -50, 8, 5, 0],
      [0, 50, 8, 5, 0],
      [50, 0, 5, 8, 0],
      [-50, 0, 5, 8, 0],
      
      // ═══════════════════════════════════════════════════════════════
      // MID-LEVEL RING (y=2) — The Catwalk
      // ═══════════════════════════════════════════════════════════════
      
      // Cardinal stations
      [0, -25, 5, 4, 2],     // N station
      [0, 25, 5, 4, 2],      // S station
      [25, 0, 4, 5, 2],      // E station
      [-25, 0, 4, 5, 2],     // W station
      
      // Diagonal junctions
      [20, -20, 5, 5, 2],    // NE junction
      [-20, -20, 5, 5, 2],   // NW junction
      [20, 20, 5, 5, 2],     // SE junction
      [-20, 20, 5, 5, 2],    // SW junction
      
      // ═══════════════════════════════════════════════════════════════
      // WATCHTOWERS (y=4) — Cardinal Overlooks
      // ═══════════════════════════════════════════════════════════════
      
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
*/


// ═══════════════════════════════════════════════════════════════════════════════
// FILE 2: index.ts — Replace buildArena() method
// ═══════════════════════════════════════════════════════════════════════════════

/*
  private buildArena(): void {
    const HALF = GROUND_SIZE / 2; // 60

    // ═══════════════════════════════════════════════════════════════════
    // A. GROUND FLOOR — Central Arena (The Pit)
    // platform_4x4 at scale 2.0 = ~8×8 visual per tile
    // Need to cover 30×30 (±15) = 4×4 grid
    // ═══════════════════════════════════════════════════════════════════
    
    const floorScale = 2.0;
    const tileSize = 8;
    
    // Central 4×4 grid
    for (let gx = -2; gx <= 1; gx++) {
      for (let gz = -2; gz <= 1; gz++) {
        this.placeModel('platform_4x4', gx * tileSize + 4, 0, gz * tileSize + 4, 0, floorScale);
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // B. CORRIDORS — Four arms extending from center
    // platform_4x2 (8×4 at scale 2.0) tiled along each arm
    // ═══════════════════════════════════════════════════════════════════
    
    // North corridor (z = -20 to -52, two columns side by side)
    for (let nz = -20; nz >= -52; nz -= 8) {
      this.placeModel('platform_4x2', -4, 0, nz, 0, floorScale);
      this.placeModel('platform_4x2', 4, 0, nz, 0, floorScale);
    }
    
    // South corridor (z = +20 to +52)
    for (let sz = 20; sz <= 52; sz += 8) {
      this.placeModel('platform_4x2', -4, 0, sz, 0, floorScale);
      this.placeModel('platform_4x2', 4, 0, sz, 0, floorScale);
    }
    
    // East corridor (x = +20 to +52, rotated 90°)
    for (let ex = 20; ex <= 52; ex += 8) {
      this.placeModel('platform_4x2', ex, 0, -4, Math.PI / 2, floorScale);
      this.placeModel('platform_4x2', ex, 0, 4, Math.PI / 2, floorScale);
    }
    
    // West corridor (x = -20 to -52)
    for (let wx = -20; wx >= -52; wx -= 8) {
      this.placeModel('platform_4x2', wx, 0, -4, Math.PI / 2, floorScale);
      this.placeModel('platform_4x2', wx, 0, 4, Math.PI / 2, floorScale);
    }
    
    // Diagonal fill patches (smooth out the cross intersections)
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
    
    // Diagonal junctions (NE, NW, SE, SW)
    const junctions: [number, number, number][] = [
      [20, -20, Math.PI / 4],
      [-20, -20, -Math.PI / 4],
      [20, 20, -Math.PI / 4],
      [-20, 20, Math.PI / 4],
    ];
    for (const [jx, jz, jr] of junctions) {
      this.placeModel('platform_2x2', jx, 2, jz, jr, 2.5);
      this.placeModel('support', jx, 0, jz, 0, 1.8);
      // Outer rail guard
      const outerX = jx + Math.sign(jx) * 5;
      const outerZ = jz + Math.sign(jz) * 5;
      this.placeModel('rail_long', outerX, 2.1, jz, Math.abs(jx) > Math.abs(jz) ? 0 : Math.PI / 2, 1.8);
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
      // Main platform
      this.placeModel('platform_4x4', tx, 4, tz, tr, 2.5);
      // Four tall supports
      this.placeModel('support_long', tx - 4, 0, tz - 4, 0, 2.2);
      this.placeModel('support_long', tx + 4, 0, tz - 4, 0, 2.2);
      this.placeModel('support_long', tx - 4, 0, tz + 4, 0, 2.2);
      this.placeModel('support_long', tx + 4, 0, tz + 4, 0, 2.2);
      // Rails on all 4 sides
      this.placeModel('rail_long', tx, 4.1, tz - 5, 0, 2.2);
      this.placeModel('rail_long', tx, 4.1, tz + 5, Math.PI, 2.2);
      this.placeModel('rail_long', tx - 5, 4.1, tz, Math.PI / 2, 2.2);
      this.placeModel('rail_long', tx + 5, 4.1, tz, -Math.PI / 2, 2.2);
      // Door on inward-facing side
      const doorOffsetZ = tz < 0 ? 5 : (tz > 0 ? -5 : 0);
      const doorOffsetX = tx < 0 ? 5 : (tx > 0 ? -5 : 0);
      if (tz !== 0) {
        this.placeModel('door', tx, 4, tz + doorOffsetZ, tz < 0 ? 0 : Math.PI, 1.8);
      } else {
        this.placeModel('door', tx + doorOffsetX, 4, tz, tx < 0 ? -Math.PI / 2 : Math.PI / 2, 1.8);
      }
      // Decorative sign
      this.placeModel('sign_1', tx + 3, 5.5, tz + 3, tr, 1.5);
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
    // Corner pillars
    this.placeModel('support_long', -HALF, 0, -HALF, 0, 3.5);
    this.placeModel('support_long', HALF, 0, -HALF, 0, 3.5);
    this.placeModel('support_long', -HALF, 0, HALF, 0, 3.5);
    this.placeModel('support_long', HALF, 0, HALF, 0, 3.5);
    
    // ═══════════════════════════════════════════════════════════════════
    // G. STREET LIGHTS — Along corridors and arena perimeter
    // ═══════════════════════════════════════════════════════════════════
    
    const streetLights: [number, number, number, number][] = [
      // Arena perimeter corners
      [-12, 0, -12, Math.PI / 4],
      [12, 0, -12, -Math.PI / 4],
      [-12, 0, 12, -Math.PI / 4],
      [12, 0, 12, Math.PI / 4],
      // North corridor (both sides)
      [-7, 0, -22, 0], [7, 0, -22, Math.PI],
      [-7, 0, -36, 0], [7, 0, -36, Math.PI],
      [-7, 0, -50, 0], [7, 0, -50, Math.PI],
      // South corridor
      [-7, 0, 22, Math.PI], [7, 0, 22, 0],
      [-7, 0, 36, Math.PI], [7, 0, 36, 0],
      [-7, 0, 50, Math.PI], [7, 0, 50, 0],
      // East corridor
      [22, 0, -7, -Math.PI / 2], [22, 0, 7, Math.PI / 2],
      [36, 0, -7, -Math.PI / 2], [36, 0, 7, Math.PI / 2],
      [50, 0, -7, -Math.PI / 2], [50, 0, 7, Math.PI / 2],
      // West corridor
      [-22, 0, -7, Math.PI / 2], [-22, 0, 7, -Math.PI / 2],
      [-36, 0, -7, Math.PI / 2], [-36, 0, 7, -Math.PI / 2],
      [-50, 0, -7, Math.PI / 2], [-50, 0, 7, -Math.PI / 2],
    ];
    for (const [lx, ly, lz, lr] of streetLights) {
      this.placeModel('light_street', lx, ly, lz, lr, 1.8);
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // H. NEON SIGNS — At corridor entrances and on towers
    // ═══════════════════════════════════════════════════════════════════
    
    const signPlacements: [keyof LoadedModels, number, number, number, number, number][] = [
      // Corridor entrance archway signs
      ['sign_2', -8, 3, -16, 0, 2.0],
      ['sign_2', 8, 3, -16, Math.PI, 2.0],
      ['sign_1', -8, 3, 16, Math.PI, 2.0],
      ['sign_1', 8, 3, 16, 0, 2.0],
      ['sign_2', -16, 3, -8, Math.PI / 2, 2.0],
      ['sign_1', -16, 3, 8, Math.PI / 2, 2.0],
      ['sign_2', 16, 3, -8, -Math.PI / 2, 2.0],
      ['sign_1', 16, 3, 8, -Math.PI / 2, 2.0],
      // Nest pinnacle signs
      ['sign_1', 40, 7.5, -38, Math.PI / 4, 1.2],
      ['sign_2', -40, 7.5, -38, -Math.PI / 4, 1.2],
      ['sign_1', 40, 7.5, 38, -Math.PI / 4, 1.2],
      ['sign_2', -40, 7.5, 38, Math.PI / 4, 1.2],
    ];
    for (const [sk, sx, sy, sz, sr, ss] of signPlacements) {
      this.placeModel(sk, sx, sy, sz, sr, ss);
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // I. AC UNITS — Arena cover + environmental detail
    // ═══════════════════════════════════════════════════════════════════
    
    // Central arena soft cover (players weave around these)
    const acCover: [number, number, number, number][] = [
      [6, 0, -6, 0],
      [-6, 0, -6, Math.PI / 2],
      [6, 0, 6, Math.PI],
      [-6, 0, 6, -Math.PI / 2],
      [0, 0, -10, 0],
      [0, 0, 10, Math.PI],
      [10, 0, 0, -Math.PI / 2],
      [-10, 0, 0, Math.PI / 2],
    ];
    for (const [ax, ay, az, ar] of acCover) {
      this.placeModel('ac_unit', ax, ay, az, ar, 1.8);
    }
    
    // AC units on tower supports
    for (const [tx, tz] of [[0, -40], [0, 40], [40, 0], [-40, 0]] as [number, number][]) {
      this.placeModel('ac_unit', tx + 5, 2, tz, Math.PI / 2, 1.5);
      this.placeModel('ac_unit', tx - 5, 2, tz, -Math.PI / 2, 1.5);
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // J. PIPES — Along corridor walls for industrial feel
    // ═══════════════════════════════════════════════════════════════════
    
    const pipes: [number, number, number, number][] = [
      // N corridor walls
      [-7, 0.5, -28, 0], [7, 0.5, -28, Math.PI],
      [-7, 0.5, -42, 0], [7, 0.5, -42, Math.PI],
      // S corridor walls
      [-7, 0.5, 28, Math.PI], [7, 0.5, 28, 0],
      [-7, 0.5, 42, Math.PI], [7, 0.5, 42, 0],
      // E corridor walls
      [28, 0.5, -7, -Math.PI / 2], [28, 0.5, 7, Math.PI / 2],
      [42, 0.5, -7, -Math.PI / 2], [42, 0.5, 7, Math.PI / 2],
      // W corridor walls
      [-28, 0.5, -7, Math.PI / 2], [-28, 0.5, 7, -Math.PI / 2],
      [-42, 0.5, -7, Math.PI / 2], [-42, 0.5, 7, -Math.PI / 2],
    ];
    for (const [px, py, pz, pr] of pipes) {
      this.placeModel('pipe_1', px, py, pz, pr, 1.8);
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // K. RAIL GUARDS — On mid-ring outer edges
    // ═══════════════════════════════════════════════════════════════════
    
    // Cardinal station outer rails
    this.placeModel('rail_long', 0, 2.1, -29, 0, 2.0);
    this.placeModel('rail_long', 0, 2.1, 29, Math.PI, 2.0);
    this.placeModel('rail_long', 29, 2.1, 0, -Math.PI / 2, 2.0);
    this.placeModel('rail_long', -29, 2.1, 0, Math.PI / 2, 2.0);
    
    // ═══════════════════════════════════════════════════════════════════
    // L. NEON FLOOR GLOWS — Atmospheric lighting markers
    // ═══════════════════════════════════════════════════════════════════
    
    const glowSpots: [number, number, number][] = [
      // Center cross
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
    for (let gi = 0; gi < glowSpots.length; gi++) {
      const [gx, gz, gColor] = glowSpots[gi];
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
*/
