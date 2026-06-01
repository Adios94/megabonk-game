# `behaviors/` — 行为 ID 注册表

`data/weapons.ts` 等数据文件里只能用 string ID 引用行为。这里是 ID → 实现函数的映射。

## 形态

```ts
// behaviors/index.ts
export const BEHAVIORS = {
  fireProjectile,
  homing,
  pierce,
  bounce,
  explodeOnImpact,
  sweepArc,
  summon,
  // ... 加一个新行为只需要在这里注册
} as const

export type BehaviorId = keyof typeof BEHAVIORS

// behaviors/fireProjectile.ts
export function fireProjectile(world: World, weapon: WeaponState, dt: number) {
  // ... 创建一个 Projectile 实体，带上从 weapon 算出的伤害、速度等
}
```

## 与 `systems/` 的区别

| 维度 | systems/ | behaviors/ |
|---|---|---|
| 触发 | 每帧固定调用 | 由数据驱动（武器配置里指定哪些 behavior） |
| 操作对象 | 全部匹配实体 | 单个武器 / 单个升级触发的行为 |
| 状态 | 跨帧 | 当帧产生新实体或修改特定实体 |

## 规则

- 一个文件一个 behavior（除非紧密相关）
- **string ID 命名** 必须与数据文件里使用的 ID 完全一致
- 加新行为 = 新 .ts 文件 + 在 `index.ts` 注册
