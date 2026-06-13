/**
 * Boss 脚本注册表 —— bossType → BossScript。
 *
 * `systems/bossAi.ts` 用 `BOSS_SCRIPTS[boss.bossType]` 选脚本。
 * 新增 boss：写一个 `xxxMech.ts` 导出 BossScript，在这里登记即可。
 */
import type { BossType } from '../../types.ts';
import type { BossScript } from './types.ts';
import { GUNNER_MECH } from './gunnerMech.ts';
import { SIEGE_MECH } from './siegeMech.ts';

export const BOSS_SCRIPTS: Record<BossType, BossScript> = {
  gunner_mech: GUNNER_MECH,
  siege_mech: SIEGE_MECH,
};
