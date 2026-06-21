import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

/**
 * 启动期共享 LoadingManager：所有 boot 阶段的 GLTF/OBJ/MTL/Texture 加载都挂到它上面，
 * 借 onProgress 汇总「已加载 / 总数」驱动启动 loading 进度条（解决「白屏无反馈」）。
 * 运行期（进对局后）GameScene 内部新建的 loader 不挂它，避免进度条已移除后还触发回调。
 */
export const bootLoadingManager = new THREE.LoadingManager();

/**
 * 共享 DRACOLoader：解码 Draco 压缩的 GLB 几何（解码器文件部署在 /public/draco/）。
 *
 * 关键设置：
 *   - setDecoderPath：本地 self-host 解码器，避免依赖 google CDN。
 *   - setDecoderConfig({ type: 'js' })：默认会优先用 wasm，wasm 解码更快但首帧多一次拉取；
 *     我们保留默认（不强制），让 Three 自动选 wasm。
 *   - preload()：提前拉解码器，避免第一帧加载 glb 时阻塞。
 *
 * dispose 不调（整局都要用）。所有 GLTFLoader 实例共用这一个 DRACOLoader 实例（线程池共享）。
 */
export const sharedDracoLoader = new DRACOLoader();
sharedDracoLoader.setDecoderPath('/draco/');
sharedDracoLoader.preload();

/** 创建一个挂好 DRACOLoader 的 GLTFLoader（避免每次都忘了配 Draco）。 */
export function createGltfLoader(manager?: THREE.LoadingManager): GLTFLoader {
  const loader = manager ? new GLTFLoader(manager) : new GLTFLoader();
  loader.setDRACOLoader(sharedDracoLoader);
  return loader;
}
