import * as THREE from 'three';

// userData 上的标记：true 表示此材质是"为单个对象 clone 出来的私有副本"，
// 当对象被丢弃时可以安全 dispose；不带此标记的材质视为全局共享，禁止 dispose
// （否则会破坏其它仍在使用该材质的 mesh）。
export const OWNED_CLONE_KEY = '__ownedClone';

/**
 * 释放一个被丢弃对象（池子超限被踢出）的可释放资源。
 *
 * 原则：
 *  - 只 dispose 带 OWNED_CLONE_KEY 的材质（来自 cloneHitFlashMaterial）。
 *  - 永不 dispose geometry —— SkeletonUtils.clone / Object3D.clone 共享几何体，
 *    随便 dispose 会让其它克隆体的 GPU 资源失效。
 *  - 几何体 GPU 资源由原始模型持有，clone 包装器被 GC 后整体内存会下降。
 */
export function disposeOwnedResources(obj: THREE.Object3D): void {
  obj.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (m && m.userData && m.userData[OWNED_CLONE_KEY]) {
        m.dispose();
      }
    }
  });
}
