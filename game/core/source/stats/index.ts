// stats/ 模块对外接口（barrel）。
// Phase 1 引入：四层 stat 管线（base/added/increased/more + tag superset-AND）。
// 详见 stats/README.md 与 docs/contract.md。

export type { Stat } from './Stat.ts';
export { finalize } from './Stat.ts';

export type { Modifier, ModifierKind } from './Modifier.ts';

export { StatBlock } from './StatBlock.ts';

export { computeWeaponDamage } from './computeWeaponDamage.ts';
