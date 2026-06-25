import { initI18n, type I18nMode } from '@minigame/i18n';
import { ensureGameUIFontsLoaded } from '../ui/fonts.ts';
import { installButtonClickSfx } from '../audio/musicManager.ts';
import { bootLoadingManager } from '../loaders/gltfLoader.ts';
import {
  hideBootLoadingOverlay,
  setBootLoadingProgress,
  showBootLoadingOverlay,
} from './loadingOverlay.ts';
import zhLocale from '../../../../i18n/zh.json';
import enLocale from '../../../../i18n/en.json';

export interface BootFlowDeps {
  loadModels: () => Promise<void>;
  tryLoadLevel: (name: string) => Promise<void>;
  defaultLevelName: string;
  hardTestLevelName: string;
  showMainMenu: () => void;
}

interface KubeeGlobal {
  KubeeClient?: {
    game?: {
      loaded?: () => void;
    };
  };
}

/** 平台生命周期：资源加载完毕、主菜单可交互时通知一次（duko / KubeeClient）。 */
let kubeeGameLoadedSent = false;

function notifyKubeeGameLoaded(): void {
  if (kubeeGameLoadedSent) return;
  const client = (globalThis as typeof globalThis & KubeeGlobal).KubeeClient;
  if (!client?.game?.loaded) return;
  try {
    client.game.loaded();
    kubeeGameLoadedSent = true;
  } catch (err) {
    console.warn('[Boot] KubeeClient.game.loaded() failed:', err);
  }
}

function initGameI18n(): void {
  const i18nMode = (import.meta.env.VITE_I18N_MODE as I18nMode | undefined) ?? 'locked';
  const i18nLocale = import.meta.env.VITE_I18N_LOCALE as string | undefined;

  initI18n({
    locales: { zh: zhLocale, en: enLocale },
    defaultLocale: 'en',
    fallbackLocale: 'en',
    mode: i18nMode,
    locale: i18nLocale,
  });
}

async function preloadBootAssets(deps: BootFlowDeps): Promise<void> {
  await deps.loadModels();
  // 默认关卡（whitebox）必须加载成功。
  await deps.tryLoadLevel(deps.defaultLevelName);
  // Hard 测试关（stage2）尽力预加载；缺失时不阻塞启动。
  try {
    await deps.tryLoadLevel(deps.hardTestLevelName);
  } catch (error) {
    console.warn(`[Level] Optional hard test level "${deps.hardTestLevelName}" preload failed:`, error);
  }
  // 菜单默认回到第一关关卡上下文。
  await deps.tryLoadLevel(deps.defaultLevelName);
}

export async function runBootFlow(deps: BootFlowDeps): Promise<void> {
  await ensureGameUIFontsLoaded();
  initGameI18n();
  installButtonClickSfx();

  showBootLoadingOverlay();
  // 进度封顶 95%，留最后 5% 给关卡解析 / 主菜单构建，hide 时补满到 100%。
  bootLoadingManager.onProgress = (_url, loaded, total) => {
    if (total > 0) setBootLoadingProgress((loaded / total) * 95);
  };
  bootLoadingManager.onError = (url) => console.warn('[Boot] asset failed:', url);

  try {
    await preloadBootAssets(deps);
  } finally {
    hideBootLoadingOverlay();
  }

  deps.showMainMenu();
  notifyKubeeGameLoaded();
}
