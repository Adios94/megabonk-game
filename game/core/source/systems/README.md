# `systems/` — 每帧 tick 的纯函数

ECS 的"S"。每个 system 是一个函数：`(world, dt) => void`，对匹配某查询的实体批量更新。

## 命名

- 动词或动名词：`movementSystem`、`collisionSystem`、`weaponFiringSystem`、`xpPickupSystem`、`renderSyncSystem`
- 一个文件一个 system

## 形态

```ts
// systems/movement.ts
import type { World } from 'miniplex'

export function movementSystem(world: World, dt: number) {
  for (const e of world.with('position', 'velocity')) {
    e.position.x += e.velocity.x * dt
    e.position.y += e.velocity.y * dt
  }
}
```

## 顺序

System 调用顺序定义在 `GameInstance.tick()` 里，固定如下（建议）：

```
input → ai → movement → collision → weaponFiring → projectileLife → pickup → xp → cleanup → renderSync
```

## 规则

- **纯函数** —— 同样的 world 状态 + 同样的 dt = 同样的输出
- **不创建实体内部的私有状态** —— 状态都在组件里
- **不写 try/catch** —— 错误就让它崩，方便定位
