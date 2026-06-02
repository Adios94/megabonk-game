# `stats/` — 四层 stat 管线

借鉴 Path of Exile 的修饰符栈，让 "+10% 增加伤害"、"+15% 更多伤害"、"+1 投射物"、"火焰穿透 3 次" 这类升级能按规则叠加。

## 四层模型

```ts
type Stat = {
  base: number       // 基础值（武器配置）
  added: number      // 平加（"+5 伤害"）
  increased: number  // 增加 %（"+10% 伤害"，多个值相加后 ×1）
  more: number[]    // 更多 %（"+15% 更多"，每个独立相乘）
}

const finalize = (s: Stat) =>
  (s.base + s.added) * (1 + s.increased) * s.more.reduce((a, b) => a * b, 1)
```

## 标签 (tags)

修饰符可以带 tag：`{ stat: 'damage', op: 'increased', value: 0.10, tag: 'fire' }`，只影响带 `fire` tag 的攻击。

## 与 `data/upgrades.ts` 的关系

升级表里每条 `UpgradeDef` 的效果会被拆解成一组 modifier，push 进对应 Stat 的相应层。`stats/finalize.ts` 负责合算最终值。

## 规则

- **不在 hot path 重新计算** —— 缓存最终值，仅当 modifier 列表变化时刷新（脏标记）
- 标签传播：复合 tag（"fire spell"）按集合处理
- **不依赖** ECS world，stats 是纯计算模块
