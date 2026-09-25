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
  /** 可选：将关卡 + 模型的 shader/贴图预先推送到 GPU，避免首局进入时 lazy 编译造成"场景没加载出来"。 */
  warmUpGpuAssets?: () => Promise<void>;
  /**
   * 可选：批量预拉所有 UI 图片（主菜单 / 角色选择 / 商店 / 任务 / HUD ...）。
   * 进度回调用于推进 loading 条。
   */
  preloadUiAssets?: (onProgress: (loaded: number, total: number) => void) => Promise<void>;
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
  // 进度段位（hide 时再补满到 100%）：
  //   0-60%   3D 资源（GLTF：关卡 + 模型 + 道具）
  //   60-92%  UI 图片（主菜单 / 角色选择 / 商店 / 任务 / HUD）
  //   92-97%  GPU 预热（shader 编译 + 纹理上传）
  //   留 3% 给 hide 之后的主菜单构建落屏
  const GLTF_PROGRESS_MAX = 60;
  const UI_PROGRESS_MIN = 60;
  const UI_PROGRESS_MAX = 92;
  bootLoadingManager.onProgress = (_url, loaded, total) => {
    if (total > 0) setBootLoadingProgress((loaded / total) * GLTF_PROGRESS_MAX);
  };
  bootLoadingManager.onError = (url) => console.warn('[Boot] asset failed:', url);

  try {
    await preloadBootAssets(deps);
    setBootLoadingProgress(GLTF_PROGRESS_MAX);

    // UI 图片全量预热（boot 阶段就把主菜单 / 角色选择 / HUD 用到的图全 fetch + decode 完）
    if (deps.preloadUiAssets) {
      try {
        await deps.preloadUiAssets((loaded, total) => {
          if (total <= 0) return;
          const ratio = loaded / total;
          setBootLoadingProgress(UI_PROGRESS_MIN + ratio * (UI_PROGRESS_MAX - UI_PROGRESS_MIN));
        });
      } catch (err) {
        console.warn('[Boot] UI asset preload failed (non-fatal):', err);
      }
      setBootLoadingProgress(UI_PROGRESS_MAX);
    }

    // 资源解析完成后立刻做 GPU 预热（在 loading overlay 关闭前进行，
    // 把开销吸收进加载条而不是用户点击"开始"之后）。
    if (deps.warmUpGpuAssets) {
      try {
        await deps.warmUpGpuAssets();
      } catch (err) {
        console.warn('[Boot] GPU warmup failed (non-fatal):', err);
      }
      setBootLoadingProgress(97);
    }
  } finally {
    hideBootLoadingOverlay();
  }

  deps.showMainMenu();
  notifyKubeeGameLoaded();
}
