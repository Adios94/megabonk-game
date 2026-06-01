# `components/` — ECS 数据组件

miniplex world 上的纯数据组件。**只放数据，不放方法**。

## 命名

- 名词形式：`Position`、`Velocity`、`Health`、`Projectile`、`Pierce`、`Homing`
- 一个文件一个组件，导出 `type` 或 `interface`

## 形态

```ts
// components/Health.ts
export interface Health {
  current: number
  max: number
}

// components/Projectile.ts
export interface Projectile {
  damage: number
  pierce: number
  ownerId: number
}
```

## 规则

- **不写方法** —— 行为放在 `systems/`
- **不导入 Three.js** —— 渲染相关的 `Mesh` 组件可以引 Three 类型，但本目录大部分组件应是纯数学/逻辑数据
- 实体 = 一组组件的组合，**不是**一个类
