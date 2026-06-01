# `data/` — 数据驱动配置表

策划 / 设计师工作区。所有"数值类"内容都放这里，**不写逻辑**，只写数据。

## 文件规划

| 文件 | 内容 |
|---|---|
| `weapons.ts` | 武器定义：基础数值、tag、行为 ID 列表、升级表 |
| `enemies.ts` | 敌人定义：HP、速度、AI brain、掉落 |
| `upgrades.ts` | 升级 / Tome 词条：效果类型、数值、tag |
| `waves.ts` | 时间线：何时出什么敌人 |
| `characters.ts` | 角色：初始数值、初始武器 |

## 形态

每个文件导出一个 `Record<id, Def>` 字面量。新增一个内容 = 加一行数据。

```ts
// data/weapons.ts 示例
export const WEAPONS: Record<string, WeaponDef> = {
  sword: {
    base: { damage: 10, cooldown: 0.8 },
    tags: ['melee', 'physical'],
    behaviors: ['sweepArc'],
    levels: [
      { stat: 'damage', op: 'added', value: 5 },
    ],
  },
}
```

## 规则

- **不导入** `behaviors/` `systems/` 里的具体函数 —— 只用 string ID 引用
- **不写逻辑** —— if / for / 计算都不该出现在这里
- 类型定义放在对应数据文件相邻处或共用 `types.ts`
