/**
 * 投射物系统 —— 移动、寿命衰减、地形碰撞、出界销毁。
 *
 * 顺序：
 *   1. orbiting 投射物 (axe) → 走 weapons.updateOrbitingProjectile
 *   2. 普通投射物 → x/y/z += v*dt
 *   3. 地形高度 clamp y >= terrainY + 0.1 (避免穿地)
 *   4. lifetime ≤ 0 → splice
 *   5. 出界 (mapSize+20)/2 半径 → splice
 *
 * 不处理碰撞 —— 那是 collisions.ts 的事。
 */
import { TICK_INTERVAL_MS } from '../config.ts';
import { updateOrbitingProjectile } from '../weapons.ts';
import { getTerrainHeight } from './terrain.ts';
import type { Engine } from './types.ts';

void TICK_INTERVAL_MS; // 占位（避免 import 被裁掉）

export function tickProjectiles(engine: Engine, dt: number): void {
  const projectiles = engine.state.projectiles;
  const player = engine.state.player;

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const proj = projectiles[i];

    if (proj.orbiting) {
      updateOrbitingProjectile(proj, player.x, player.z, dt);
    } else {
      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;
      proj.z += proj.vz * dt;
    }

    const terrainY = getTerrainHeight(proj.x, proj.z);
    if (proj.y < terrainY + 0.1) {
      proj.y = terrainY + 0.1;
    }

    proj.lifetime -= dt;
    if (proj.lifetime <= 0) {
      projectiles.splice(i, 1);
      continue;
    }

    const halfMap = (engine.config.mapSize + 20) * 0.5;
    if (Math.abs(proj.x) > halfMap || Math.abs(proj.z) > halfMap) {
      projectiles.splice(i, 1);
    }
  }
}
