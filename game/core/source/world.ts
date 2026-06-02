/**
 * miniplex world wrapper —— Phase 2 引入。
 *
 * Phase 2: world 实例只是建立钩子，没有 entity 实际驻留（sword 是 instant hit）。
 * Phase 3: 投射型武器（axe / bow / shotgun / bone_bouncer）会 add Projectile entity。
 * Phase 4: 敌人 + boss 迁移到 world，加 enemy / health / brain 等组件。
 */
import { World } from 'miniplex';

/**
 * ECS entity 形状。所有字段可选 —— 一个 entity = 一组组件的组合。
 *
 * Phase 2 仅有一个 marker（player）；后续阶段会扩展：
 *   - position / velocity / health
 *   - projectile (Phase 3)
 *   - enemy / brain (Phase 4)
 */
export interface GameEntity {
  /** 玩家 marker（Phase 2: 仅用于"world 已挂载"自检；不读不写） */
  isPlayer?: true;
}

export type GameWorld = World<GameEntity>;

export function createWorld(): GameWorld {
  return new World<GameEntity>();
}
