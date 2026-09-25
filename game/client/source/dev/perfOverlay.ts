/**
 * Dev 性能 overlay：URL 带 ?perf=1 时启用。
 *
 * 显示：FPS / 帧时间（含 1s 均值）、JS 堆内存（仅 Chromium）、当前 LOD 档位、敌人/投射物数、drawcall。
 * 真机调试用：手机插数据线开 Safari/Chrome remote console 嫌麻烦，直接屏幕上看最快。
 *
 * 接入：在 GameScene animate 末尾调 perfOverlay.frame(stats)。模块自检 URL，禁用时所有方法 no-op。
 */

import * as THREE from 'three';

export interface PerfFrameStats {
  /** WebGLRenderer.info.render，用 drawcall = renderer.info.render.calls。*/
  renderer: THREE.WebGLRenderer;
  enemyCount: number;
  projectileCount: number;
  pickupCount: number;
  vfxAreaCount: number;
  /** 当前密度 0..1（来自 computeEnemyLod 返回 ResolvedEnemyLod.density）。 */
  lodDensity: number;
  /** 当前 mesh→impostor 切换距离（米）。 */
  lodImpostorDist: number;
  /** 当前 impostor→cull 距离（米）。 */
  lodCullDist: number;
  /** 当前像素比（含 dynamic DPR 调整）。 */
  pixelRatio: number;
}

class PerfOverlay {
  private el: HTMLDivElement | null = null;
  private enabled = false;

  // 1 秒滑窗
  private frames = 0;
  private windowStart = 0;
  private fps = 0;
  private avgFrameMs = 0;
  private lastFrameStart = 0;
  private worstFrameMs = 0;

  // 卡顿尖刺跟踪（用于诊断 GC pause / 系统中断）
  private spikeCountSession = 0;       // 整局 >50ms 帧累计
  private spikeMaxMs = 0;              // 整局最慢一帧
  private memHighWater = 0;            // 整局 used heap 峰值（MB）
  private memDropEventCount = 0;       // mem 突然下降的次数（≈ Major GC 次数）
  private lastMemMb = 0;
  private sessionStart = 0;

  // JS 工作时间（从 frameStart 到 frame() 调用之间真实消耗，剥离 vsync 等待）
  private frameStartMark = 0;
  private cpuMsAccum = 0;
  private cpuMsFrames = 0;
  private avgCpuMs = 0;

  // 显示节流
  private nextRenderAt = 0;

  init(): void {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('perf') !== '1') return;
    this.enabled = true;
    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:fixed', 'left:8px', 'top:8px', 'z-index:99999',
      'background:rgba(0,0,0,0.72)', 'color:#9eff9e',
      'font:11px/1.45 ui-monospace,Menlo,monospace',
      'padding:6px 8px', 'border-radius:4px',
      'pointer-events:none', 'white-space:pre',
      'text-shadow:0 1px 0 rgba(0,0,0,0.6)',
      'min-width:180px',
    ].join(';');
    this.el.textContent = 'perf overlay…';
    document.body.appendChild(this.el);
    this.windowStart = performance.now();
    this.lastFrameStart = this.windowStart;
    this.sessionStart = this.windowStart;
  }

  /** 帧开始时调一次（animate 入口）。和 frame() 配对，统计 JS 真实工作时间，剥离 vsync 等待。 */
  markFrameStart(): void {
    if (!this.enabled) return;
    this.frameStartMark = performance.now();
  }

  /** 每帧 animate() 末尾调一次。disabled 时直接返回，零开销。 */
  frame(stats: PerfFrameStats): void {
    if (!this.enabled || !this.el) return;
    const now = performance.now();
    const frameMs = now - this.lastFrameStart;
    this.lastFrameStart = now;
    if (frameMs > this.worstFrameMs) this.worstFrameMs = frameMs;
    // CPU 时间 = 从 markFrameStart 到现在（真实 JS 工作；浏览器 vsync 等待不算入）
    if (this.frameStartMark > 0) {
      this.cpuMsAccum += now - this.frameStartMark;
      this.cpuMsFrames++;
    }
    // 整局尖刺跟踪：> 50ms 算一次卡顿（GC pause / 系统中断典型阈值）
    if (frameMs > 50) this.spikeCountSession++;
    if (frameMs > this.spikeMaxMs) this.spikeMaxMs = frameMs;
    this.frames++;
    const elapsed = now - this.windowStart;

    if (elapsed >= 1000) {
      this.fps = (this.frames * 1000) / elapsed;
      this.avgFrameMs = elapsed / this.frames;
      if (this.cpuMsFrames > 0) {
        this.avgCpuMs = this.cpuMsAccum / this.cpuMsFrames;
        this.cpuMsAccum = 0;
        this.cpuMsFrames = 0;
      }
      this.frames = 0;
      this.windowStart = now;
    }

    if (now < this.nextRenderAt) return;
    this.nextRenderAt = now + 250; // 4 Hz 刷新，避免文本节点写入也成瓶颈

    const info = stats.renderer.info;
    const drawcalls = info.render.calls;
    const triangles = info.render.triangles;
    const geometries = info.memory.geometries;
    const textures = info.memory.textures;

    // performance.memory 仅 Chromium / WebView 有
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
    let memLine = 'mem:  n/a (Safari)';
    if (mem) {
      const usedMb = mem.usedJSHeapSize / 1048576;
      const totalMb = mem.totalJSHeapSize / 1048576;
      if (usedMb > this.memHighWater) this.memHighWater = usedMb;
      // 一次性掉 >3 MB 几乎只可能是 Major GC（同一次 4Hz 刷新窗口内）
      if (this.lastMemMb > 0 && this.lastMemMb - usedMb > 3) this.memDropEventCount++;
      this.lastMemMb = usedMb;
      memLine = `mem:  ${usedMb.toFixed(1)} / ${totalMb.toFixed(1)} MB  peak ${this.memHighWater.toFixed(1)}`;
    }

    const sessionSec = Math.max(1, (now - this.sessionStart) / 1000);
    const spikePerMin = (this.spikeCountSession / sessionSec) * 60;
    const gcPerMin = (this.memDropEventCount / sessionSec) * 60;

    const fpsColor = this.fps >= 50 ? '#9eff9e' : this.fps >= 30 ? '#ffd86b' : '#ff7878';
    this.el.style.color = fpsColor;

    // CPU = JS 真实做的活；frame = 含 vsync 等待。两者差距说明是 GPU/vsync 限速还是 CPU 跑不动。
    this.el.textContent = [
      `FPS:  ${this.fps.toFixed(1)}  avg ${this.avgFrameMs.toFixed(1)}ms  worst ${this.worstFrameMs.toFixed(0)}ms`,
      `cpu:  ${this.avgCpuMs.toFixed(1)}ms (JS+render call)`,
      `jank: ${this.spikeCountSession} spikes (${spikePerMin.toFixed(1)}/min) max ${this.spikeMaxMs.toFixed(0)}ms`,
      `DPR:  ${stats.pixelRatio.toFixed(2)}`,
      memLine,
      mem ? `GC?:  ${this.memDropEventCount} drops (${gcPerMin.toFixed(1)}/min)` : '',
      `geo:  ${geometries}   tex: ${textures}`,
      `draw: ${drawcalls}   tris: ${(triangles / 1000).toFixed(1)}k`,
      `enemy: ${stats.enemyCount}   proj: ${stats.projectileCount}`,
      `pickup: ${stats.pickupCount}   ae: ${stats.vfxAreaCount}`,
      `LOD:  density ${stats.lodDensity.toFixed(2)}`,
      `      imp ${stats.lodImpostorDist.toFixed(1)}m cull ${stats.lodCullDist.toFixed(1)}m`,
    ].filter(Boolean).join('\n');

    this.worstFrameMs = 0;
  }

  isEnabled(): boolean { return this.enabled; }
}

export const perfOverlay = new PerfOverlay();

// 模块加载即自检 URL；非 perf 模式 init() 直接 return，零开销。
if (typeof window !== 'undefined') {
  perfOverlay.init();
}
