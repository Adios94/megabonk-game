/**
 * 客户端"视图系统"：第三人称环绕镜头 + FPS 风格 pointer lock。
 *
 * 输入：
 *   - PC 桌面：仅在“按住鼠标左键拖动”时旋转视角（无自动 pointer lock）
 *   - 手机：右半屏拖拽（左半屏给虚拟摇杆，避免冲突）
 *
 * UI 隔离（只信任显式标记）：
 *   - 用 elementFromPoint 命中顶层元素，向上遍历祖先；命中 canvas 前若遇到
 *     `dataset.cameraBlock === 'true'` 的元素，则判定指针在 UI 上、阻断镜头输入。
 *   - ⚠️ 约定：任何会盖在画布上、且要接收点击/拖拽的全屏或交互 UI 容器，
 *     创建时必须显式标 `el.dataset.cameraBlock = 'true'`（容器标一次即可，子元素无需逐个标）。
 *     不再有"任何非透明元素都算 UI"的启发式兜底 —— 漏标的浮层会让镜头在其上被拖动。
 *
 * 输出：
 *   - getYaw() —— 给 input system 旋转 WASD 用（只用 yaw，不用 pitch）
 *   - update(camera, playerPos, dt) —— 每帧相机位置 + 平滑 lookAt
 */

import * as THREE from 'three';

interface PlayerPos {
  x: number;
  y: number;
  z: number;
}

const PITCH_LIMIT = (Math.PI / 180) * 75;
const MOUSE_SENS_DRAG = 0.005;
const TOUCH_SENS = 0.005;
const LOOK_AT_HEIGHT = 1.5;
const LOOK_AT_LEAD = 2;
const FOLLOW_RATE = 14;
// 碰撞推镜：墙/平台挡在镜头与角色之间时，沿视线把镜头平滑拉近。
const CAM_COLLISION_BUFFER = 0.35; // 镜头离遮挡物的余量
const CAM_MIN_FRAC = 0.18;         // 最近不小于满臂长的此比例（别钻进角色）
const CAM_SHRINK_RATE = 30;        // 拉近：快（避免穿墙 / 角色被挡）
const CAM_GROW_RATE = 3.5;         // 恢复：慢（去顿挫）
// raycast 节流：每 N 帧执行一次 intersectObjects（O(关卡三角形数)，是 25% CPU 大头）。
// camFrac 本身有指数 lerp 平滑（CAM_SHRINK_RATE / CAM_GROW_RATE），16-32ms 的命中刷新延迟
// 在视觉上完全感知不到。命中结果在帧间用 cachedTargetFrac 复用。
// stride 从 2 → 3：60fps 下 50ms 一次，配合 setOccluders 的 mesh 过滤，把 raycast 占比从
// ~33% CPU 砍到 < 10%（详见 docs/performance.md「镜头避让 raycast」节）。
const CAM_RAYCAST_STRIDE = 3;

export class CameraOrbit {
  public camDistance = 7;
  public camHeightBase = 5;
  private yaw = 0;
  private pitch = 0;
  private ghostX = 0;
  private ghostY = 0;
  private ghostZ = 0;
  private ghostInitialized = false;
  private dragPointerId = -1;
  private dragLastX = 0;
  private dragLastY = 0;
  private enabled = true;
  // 碰撞推镜状态
  private occluders: THREE.Object3D[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private camFrac = 1; // 当前臂长比例（平滑），1=满臂长
  private cachedTargetFrac = 1; // 上次 raycast 命中后计算出的目标臂长比例，节流帧之间复用
  private raycastFrame = 0;     // 节流计数器
  private readonly _pivot = new THREE.Vector3();
  private readonly _fullCam = new THREE.Vector3();
  private readonly _dir = new THREE.Vector3();
  /** 当前指针是否位于可交互 UI 上（HUD 按钮 / 面板 / 菜单等）。 */
  private pointerOverUi = false;
  private cleanups: Array<() => void> = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    // 全局指针跟踪：进入 UI 区域时立刻阻断镜头输入。
    const onGlobalPointerMove = (e: PointerEvent) => {
      this.updatePointerUiState(e.clientX, e.clientY);
    };
    document.addEventListener('pointermove', onGlobalPointerMove);
    this.cleanups.push(() => document.removeEventListener('pointermove', onGlobalPointerMove));

    const onEnter = (e: PointerEvent) => {
      // 桌面端不自动抢 pointer lock；只有按住左键拖动时才旋转镜头。
      this.updatePointerUiState(e.clientX, e.clientY);
    };
    canvas.addEventListener('pointerenter', onEnter);
    this.cleanups.push(
      () => canvas.removeEventListener('pointerenter', onEnter),
    );

    // 桌面端改为“按住左键拖拽”旋转，不再监听 pointer lock mousemove。

    const onPointerDown = (e: PointerEvent) => {
      if (!this.canUseCameraInput(e.clientX, e.clientY)) return;
      if (this.dragPointerId !== -1) return;
      // 桌面端仅左键拖拽可转镜头
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.pointerType === 'touch' && e.clientX < window.innerWidth * 0.5) return;
      this.dragPointerId = e.pointerId;
      this.dragLastX = e.clientX;
      this.dragLastY = e.clientY;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== this.dragPointerId) return;
      if (!this.canUseCameraInput(e.clientX, e.clientY)) {
        this.dragPointerId = -1;
        return;
      }
      const sens = e.pointerType === 'touch' ? TOUCH_SENS : MOUSE_SENS_DRAG;
      this.yaw += (e.clientX - this.dragLastX) * sens;
      this.pitch -= (e.clientY - this.dragLastY) * sens;
      if (this.pitch > PITCH_LIMIT) this.pitch = PITCH_LIMIT;
      else if (this.pitch < -PITCH_LIMIT) this.pitch = -PITCH_LIMIT;
      this.dragLastX = e.clientX;
      this.dragLastY = e.clientY;
    };
    const endDrag = (e: PointerEvent) => {
      if (e.pointerId === this.dragPointerId) this.dragPointerId = -1;
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('pointerleave', endDrag);
    this.cleanups.push(
      () => canvas.removeEventListener('pointerdown', onPointerDown),
      () => canvas.removeEventListener('pointermove', onPointerMove),
      () => canvas.removeEventListener('pointerup', endDrag),
      () => canvas.removeEventListener('pointercancel', endDrag),
      () => canvas.removeEventListener('pointerleave', endDrag),
    );
  }

  getYaw(): number {
    return this.yaw;
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) {
      this.dragPointerId = -1;
    }
  }

  update(camera: THREE.PerspectiveCamera, p: PlayerPos, dt: number): void {
    if (!this.ghostInitialized) {
      this.ghostX = p.x;
      this.ghostY = p.y;
      this.ghostZ = p.z;
      this.ghostInitialized = true;
    }

    const a = 1 - Math.exp(-FOLLOW_RATE * Math.max(dt, 1e-4));
    this.ghostX += (p.x - this.ghostX) * a;
    this.ghostY += (p.y - this.ghostY) * a;
    this.ghostZ += (p.z - this.ghostZ) * a;

    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);

    // 期望（无碰撞）镜头位 + 以角色上身为枢轴
    this._fullCam.set(
      this.ghostX - sy * cp * this.camDistance,
      this.ghostY + this.camHeightBase + sp * this.camDistance,
      this.ghostZ - cy * cp * this.camDistance,
    );
    this._pivot.set(this.ghostX, this.ghostY + LOOK_AT_HEIGHT, this.ghostZ);

    // 碰撞推镜：从枢轴朝镜头射线，命中遮挡物则按命中距离收臂长。
    // 注意：intersectObjects 是 O(关卡三角形数) 的暴力搜索，每帧跑会吃 25% CPU；
    // camFrac 本身平滑，节流到每 CAM_RAYCAST_STRIDE 帧一次完全够用。
    let targetFrac = this.cachedTargetFrac;
    if (this.occluders.length > 0) {
      this.raycastFrame = (this.raycastFrame + 1) % CAM_RAYCAST_STRIDE;
      if (this.raycastFrame === 0) {
        this._dir.copy(this._fullCam).sub(this._pivot);
        const fullLen = this._dir.length();
        if (fullLen > 1e-3) {
          this._dir.multiplyScalar(1 / fullLen);
          this.raycaster.set(this._pivot, this._dir);
          this.raycaster.far = fullLen;
          // occluders 在 setOccluders 时已被扁平化为前景 mesh 列表（剔除背景 / 非 mesh
          // 节点），这里走 recursive=false：避免 raycaster 反复 traverse 整棵关卡子树。
          const hits = this.raycaster.intersectObjects(this.occluders, false);
          targetFrac = hits.length > 0
            ? Math.min(1, Math.max(CAM_MIN_FRAC, (hits[0].distance - CAM_COLLISION_BUFFER) / fullLen))
            : 1;
          this.cachedTargetFrac = targetFrac;
        }
      }
    } else {
      this.cachedTargetFrac = 1;
      targetFrac = 1;
    }
    // 拉近快、恢复慢（去顿挫）
    const rate = targetFrac < this.camFrac ? CAM_SHRINK_RATE : CAM_GROW_RATE;
    this.camFrac += (targetFrac - this.camFrac) * (1 - Math.exp(-rate * Math.max(dt, 1e-4)));

    camera.position.set(
      this._pivot.x + (this._fullCam.x - this._pivot.x) * this.camFrac,
      this._pivot.y + (this._fullCam.y - this._pivot.y) * this.camFrac,
      this._pivot.z + (this._fullCam.z - this._pivot.z) * this.camFrac,
    );

    camera.lookAt(
      this.ghostX + sy * LOOK_AT_LEAD,
      this.ghostY + LOOK_AT_HEIGHT,
      this.ghostZ + cy * LOOK_AT_LEAD,
    );
  }

  /**
   * 设置碰撞推镜的射线目标（关卡静态遮挡物：墙/平台等，不含怪/特效/地面）。
   *
   * 调用方一般传入 `[levelScene]`（整棵关卡根 Group）。这里**一次性扁平化**为前景
   * mesh 列表，运行时 `intersectObjects(occluders, false)` 直接对数组求交：
   *
   *   - 跳过 `userData.isBackground === true` 的 mesh（远景装饰 / 远山等，离玩家几百米外，
   *     不可能挡到镜头臂；却会让 raycaster 多走一遍 boundingBox + 三角形求交）。
   *   - 跳过非 mesh 节点（Group / Bone / Light）。
   *
   * 此前 `intersectObjects([levelScene], true)` 是 raycast 占 ~33% CPU 的元凶（每帧
   * 递归整棵关卡子树）。预扁平化 + 过滤背景，把单次 raycast 命中候选从「整棵树」缩到
   * 「真正会挡相机的几十个前景合批 mesh」。
   */
  setOccluders(objects: THREE.Object3D[]): void {
    if (objects.length === 0) {
      this.occluders = [];
      return;
    }
    const flat: THREE.Object3D[] = [];
    for (const root of objects) {
      root.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (mesh.userData && mesh.userData['isBackground']) return;
        flat.push(mesh);
      });
    }
    this.occluders = flat;
  }

  dispose(): void {
    for (const c of this.cleanups) c();
    this.cleanups = [];
  }

  /** 指针是否落在可交互 UI 上（非画布游戏区域）。 */
  private isPointerOverBlockingUi(clientX: number, clientY: number): boolean {
    // 只信任显式标记：命中 canvas 前遇到 dataset.cameraBlock 的元素即判定在 UI 上。
    // 不再用 getComputedStyle 启发式（会把任何盖在画布上的子元素误判为 UI）。
    let el = document.elementFromPoint(clientX, clientY);
    while (el) {
      if (el === this.canvas) return false;
      if ((el as HTMLElement).dataset.cameraBlock === 'true') return true;
      el = el.parentElement;
    }
    return false;
  }

  private updatePointerUiState(clientX: number, clientY: number): void {
    const overUi = this.isPointerOverBlockingUi(clientX, clientY);
    if (overUi === this.pointerOverUi) return;
    this.pointerOverUi = overUi;
    if (overUi) {
      this.dragPointerId = -1;
    }
  }

  private canUseCameraInput(clientX?: number, clientY?: number): boolean {
    if (!this.enabled) return false;
    if (this.pointerOverUi) return false;
    if (clientX !== undefined && clientY !== undefined) {
      if (this.isPointerOverBlockingUi(clientX, clientY)) return false;
    }
    return true;
  }
}
