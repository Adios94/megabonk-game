# `factories/` — 实体生成工厂

读 `data/` 配置 + 返回组装好的实体。是 `data/` 与 ECS world 之间的桥梁。

## 形态

```ts
// factories/spawnEnemy.ts
import { ENEMIES } from '../data/enemies.ts'
import type { World } from 'miniplex'

export function spawnEnemy(world: World, id: keyof typeof ENEMIES, position: Vec3) {
  const def = ENEMIES[id]
  return world.add({
    enemy: { id, kind: def.kind },
    position,
    health: { current: def.hp, max: def.hp },
    velocity: { x: 0, y: 0, z: 0 },
    brain: { kind: def.behavior },
    // ...
  })
}
```

## 规则

- 一个工厂一个 .ts
- **只读 `data/`，不写**
- 返回的是 ECS entity 引用，调用方决定是否保留
