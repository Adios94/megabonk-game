/**
 * @deprecated 本文件已拆分：
 *   - 祭坛 / 传送门状态机 → `systems/altars.ts`
 *   - 宝箱 → `systems/chests.ts`
 *
 * 本 shim 仅为减少一次性破坏，re-export 新位置的同名 API。
 * 新代码请直接 import 新文件。
 */
export { tickChests, generateChests } from './chests.ts';
export {
  tickAltars as tickTeleporters,
  generateAltars as generateTeleporters,
  onBossDefeated,
  hasReadyBossTrigger,
  consumePortalUsed,
} from './altars.ts';
