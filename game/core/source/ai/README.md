# `ai/` — 敌人 / Boss 行为

Survivors 类敌人 AI 不复杂，用 **`Brain` 组件 + tagged-union state** 即可。BOSS 用 **phase script**（一个数组描述阶段切换）。

## Brain 组件

```ts
// ai/Brain.ts
export type BrainState =
  | { kind: 'chase' }
  | { kind: 'charge'; windup: number; target: Vec3 }
  | { kind: 'orbit'; radius: number; angle: number }
  | { kind: 'leashSpit'; cooldown: number }

export interface Brain {
  state: BrainState
}
```

## aiSystem

```ts
// systems/ai.ts
export function aiSystem(world: World, dt: number) {
  for (const e of world.with('brain', 'position')) {
    switch (e.brain.state.kind) {
      case 'chase':       chase(e, dt); break
      case 'charge':      updateCharge(e, dt); break
      case 'orbit':       updateOrbit(e, dt); break
      case 'leashSpit':   updateLeashSpit(e, dt); break
    }
  }
}
```

## Boss phase script

```ts
// ai/bosses/skeletonKing.ts
export const SKELETON_KING_PHASES: Phase[] = [
  { hpRatio: 1.00, action: 'summonAdds', repeat: 'every 5s' },
  { hpRatio: 0.66, action: 'enrage', once: true },
  { hpRatio: 0.33, action: 'splitProjectile', repeat: 'every 2s' },
]
```

## 规则

- Brain.state 的 `kind` 字段是 string ID，对应实现在 `aiSystem` 里 switch
- BOSS 行为不要写新的"BossSystem"，复用 aiSystem + 一个 `bossPhase` 组件
- 行为树（behavior tree）**不引入** —— survivors 类敌人用不到，引入只会让代码变重
