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
import { getTerrainHeightAt } from './collision.ts';
import type { Engine } from './types.ts';

void TICK_INTERVAL_MS; // 占位（避免 import 被裁掉）

export function tickProjectiles(engine: Engine, dt: number): void {
  const projectiles = engine.state.projectiles;
  const player = engine.state.player;

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const proj = projectiles[i];

    if (proj.orbiting) {
      updateOrbitingProjectile(proj, player.x, player.z, dt, player.y);
    } else {
      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;
      proj.z += proj.vz * dt;
    }

    // 常驻/持续投射物的「火焰圈」式持续伤害：每隔 rehitInterval 清空命中表，
    // 让 orbiting / gravitational 这类持续体可以反复打到同一个敌人。
    if (proj.rehitInterval && proj.rehitInterval > 0) {
      proj.rehitTimer = (proj.rehitTimer ?? proj.rehitInterval) - dt;
      while (proj.rehitTimer <= 0) {
        proj.hitEnemyIds.length = 0;
        proj.rehitTimer += proj.rehitInterval;
      }
    }

    // 地形 clamp 仅用于防止「飞行/直线」投射物穿地。orbiting 投射物（axe 常驻刀环）的高度
    // 已锚定在玩家身上（updateOrbitingProjectile 设 proj.y = playerY + offset），不能再按
    // 脚下地形抬升——否则斧头绕到玩家头顶的高台下方时会被顶到高台上去。
    if (!proj.orbiting) {
      const terrainY = getTerrainHeightAt(engine.geo, proj.x, proj.z);
      if (proj.y < terrainY + 0.1) {
        proj.y = terrainY + 0.1;
      }
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
