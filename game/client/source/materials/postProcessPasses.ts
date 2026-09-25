/**
 * EffectComposer post-processing passes 集合。
 *
 * - {@link SceneOutlinePass}：场景渲染 + 屏幕空间深度描边（首道 pass，输出 readBuffer）
 * - {@link ColorGradePass}：饱和/对比/亮度调色（OutputPass 之后）
 * - {@link DarkComicPass}：末端「暗黑漫画」去饱和 + 噪点（finalSwarm 阶段渐入）
 *
 * 与 weather / sceneryMode 解耦：本模块不依赖 GameScene 全局变量，构造时一次性传所有参数。
 */

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * 描边模式：
 *  - screenSpace：基于深度的屏幕空间描边，固定一道全屏 pass，开销与怪数无关。保留卡通黑轮廓。
 *    （替代旧的逐网格 OutlineEffect——后者放大翻面把不透明场景再画一遍，draw call 翻倍、
 *    开销随怪数线性增长，是手机掉帧元凶。已于本次性能优化移除。）
 *  - none：不描边（仅平涂着色，cel 来自材质本身，与描边无关）。
 */
export type OutlineMode = 'screenSpace' | 'none';

const OUTLINE_EDGE_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// 深度边缘检测：线性化深度(viewZ)后做 Roberts-cross 4-tap，差超阈值即描黑。
// 阈值随距离放宽(近处细线/远处粗或无)；天空背景(viewZ≈-far)处抑制，避免天边整圈黑。
const OUTLINE_EDGE_FRAG = /* glsl */`
  precision highp float;
  uniform sampler2D tColor;
  uniform highp sampler2D tDepth;   // 必须 highp，否则移动端 mediump 截断 → 满屏黑边/噪点
  uniform vec2 uResolution;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform float uThickness;
  uniform float uOutlineAlpha;
  varying vec2 vUv;

  // perspectiveDepthToViewZ：NDC 深度[0,1] → 视空间 z（负值，-near..-far）
  float toViewZ(float d) {
    return (uCameraNear * uCameraFar) / ((uCameraFar - uCameraNear) * d - uCameraFar);
  }
  float sampleZ(vec2 uv) { return toViewZ(texture2D(tDepth, uv).r); }

  void main() {
    vec4 color = texture2D(tColor, vUv);
    vec2 texel = uThickness / uResolution;
    float c = sampleZ(vUv);
    float n = sampleZ(vUv + vec2(0.0,  texel.y));
    float s = sampleZ(vUv + vec2(0.0, -texel.y));
    float e = sampleZ(vUv + vec2( texel.x, 0.0));
    float w = sampleZ(vUv + vec2(-texel.x, 0.0));
    float hor = abs(e - w);
    float ver = abs(n - s);
    float delta = sqrt(hor * hor + ver * ver);
    float threshold = abs(c) * 0.02 + 0.05;          // 距离自适应阈值（k、floor 可调）
    float edge = smoothstep(threshold, threshold * 2.0, delta);
    float depthMask = 1.0 - step(uCameraFar * 0.9, -c); // 极远(天空/far 区)不描边
    edge *= depthMask;
    gl_FragColor = vec4(mix(color.rgb, vec3(0.0), edge * uOutlineAlpha), color.a);
  }
`;

/**
 * EffectComposer 首道 pass：把场景渲进 composer 缓冲，并按 mode 叠加描边。
 * 渲到 RT 时引擎自动禁 in-material tonemap → 缓冲为线性 HDR，描边在线性空间 mix 向黑，
 * tonemap 交末端 OutputPass(Neutral + sRGB)。needsSwap=false，合成结果写 readBuffer。
 */
export class SceneOutlinePass extends Pass {
  mode: OutlineMode = 'screenSpace';

  private readonly sceneRT: THREE.WebGLRenderTarget;
  private readonly fsqMaterial: THREE.ShaderMaterial;
  private readonly fsq: FullScreenQuad;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    w: number, // 有效像素（CSS × dpr）
    h: number,
  ) {
    super();
    this.needsSwap = false;
    this.clear = true;

    // 深度纹理用默认 DepthFormat + UnsignedIntType（→ GL DEPTH_COMPONENT24），不要 HalfFloat / stencil。
    const depthTexture = new THREE.DepthTexture(w, h);
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,   // 颜色：线性 HDR，匹配 composer 缓冲
      depthTexture,
      depthBuffer: true,
      stencilBuffer: false,
    });

    this.fsqMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.sceneRT.texture },
        tDepth: { value: this.sceneRT.depthTexture },
        uResolution: { value: new THREE.Vector2(w, h) },
        uCameraNear: { value: camera.near },
        uCameraFar: { value: camera.far },
        uThickness: { value: 1.5 },
        uOutlineAlpha: { value: 0.85 },
      },
      vertexShader: OUTLINE_EDGE_VERT,
      fragmentShader: OUTLINE_EDGE_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.fsq = new FullScreenQuad(this.fsqMaterial);
  }

  override setSize(width: number, height: number): void {
    // width/height 由 EffectComposer 传入，已是 CSS×dpr 像素。深度纹理随 setSize 自动重建。
    this.sceneRT.setSize(width, height);
    this.fsqMaterial.uniforms.uResolution.value.set(width, height);
  }

  override render(renderer: THREE.WebGLRenderer, _writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.fsqMaterial.uniforms.uCameraNear.value = this.camera.near;
    this.fsqMaterial.uniforms.uCameraFar.value = this.camera.far;

    // 先把场景渲到带深度的 sceneRT
    renderer.setRenderTarget(this.sceneRT);
    renderer.clear();
    renderer.render(this.scene, this.camera);

    // 合成到 pass 输出（readBuffer，交 OutputPass tonemap）
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    if (this.clear) renderer.clear();
    if (this.mode === 'none') {
      const prev = this.fsqMaterial.uniforms.uOutlineAlpha.value;
      this.fsqMaterial.uniforms.uOutlineAlpha.value = 0.0; // 只 blit 颜色，不叠边
      this.fsq.render(renderer);
      this.fsqMaterial.uniforms.uOutlineAlpha.value = prev;
    } else {
      this.fsq.render(renderer);
    }
  }

  override dispose(): void {
    this.sceneRT.dispose(); // 链式释放 depthTexture
    this.fsqMaterial.dispose();
    this.fsq.dispose(); // 仅释放几何，材质已单独 dispose
  }
}

/** ColorGradePass 默认参数（美漫风格强化）。 */
export const GRADE_SATURATION = 1.28; // 饱和度（>1 更艳）
export const GRADE_CONTRAST = 1.14;   // 对比度（绕中灰 0.5 拉伸）
export const GRADE_BRIGHTNESS = 1.05; // 整体亮度微提

/**
 * 末端调色 pass（美漫风格强化）：在 OutputPass 之后对最终显示色做
 * 饱和度 / 对比度 / 亮度提升，让整体更鲜亮、色块更"跳"、明暗更分明。
 * 全屏单 draw call，开销极低；参数集中在 GRADE_* 常量便于调。
 */
export class ColorGradePass extends Pass {
  private readonly material: THREE.ShaderMaterial;
  private readonly fsQuad: FullScreenQuad;

  constructor(saturation: number, contrast: number, brightness: number) {
    super();
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uSaturation: { value: saturation },
        uContrast: { value: contrast },
        uBrightness: { value: brightness },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform float uSaturation;
        uniform float uContrast;
        uniform float uBrightness;
        void main() {
          vec4 tex = texture2D(tDiffuse, vUv);
          vec3 c = tex.rgb * uBrightness;
          c = (c - 0.5) * uContrast + 0.5;            // 对比度：绕中灰拉伸
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); // 感知亮度
          c = mix(vec3(l), c, uSaturation);            // 饱和度：朝灰度反向外推
          gl_FragColor = vec4(clamp(c, 0.0, 1.0), tex.a);
        }`,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }

  get saturation(): number { return this.material.uniforms.uSaturation.value; }
  set saturation(v: number) { this.material.uniforms.uSaturation.value = v; }

  get contrast(): number { return this.material.uniforms.uContrast.value; }
  set contrast(v: number) { this.material.uniforms.uContrast.value = v; }

  get brightness(): number { return this.material.uniforms.uBrightness.value; }
  set brightness(v: number) { this.material.uniforms.uBrightness.value = v; }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }
    this.fsQuad.render(renderer);
  }

  override dispose(): void {
    this.material.dispose();
    this.fsQuad.dispose?.();
  }
}

/**
 * 末端"暗黑漫画"风格 post-fx pass（精简版）。
 * 灵感来自 Andicraft 的 Dark Comic Master URP shader（那是个 8000+ 行 PBR surface shader，
 * 无法 1:1 移到 three.js），实际只保留两个对画面观感最关键的因素：
 *   1) Desaturate 去饱和 —— 朝灰阶推，"暗黑"基调
 *   2) Noise 印刷噪点 —— 颗粒做旧感
 *
 * 数值由外部 `ramp01` (0..1) 驱动：进入"最终狂潮"时由 GameScene 每帧渐进式拉到 1，
 * 退出时快速回落到 0。`desaturateMax / noiseMax` 是 ramp=1 时的目标上限。
 * 放在 ColorGradePass 之后，全部在 LDR sRGB 空间做。单 FSQ，开销 ~ 1 个全屏 draw。
 */
export class DarkComicPass extends Pass {
  private readonly material: THREE.ShaderMaterial;
  private readonly fsQuad: FullScreenQuad;

  /** 主开关；关闭时 ramp 视为 0（画面不变） */
  enabled = true;
  /** 渐进进度 [0,1]，由 GameScene.updateDarkComic 驱动 */
  ramp01 = 0;
  /** ramp=1 时去饱和的目标值（0..1） */
  desaturateMax = 0.85;
  /** ramp=1 时噪点的目标值（0..0.3 常用） */
  noiseMax = 0.18;
  /** 从 0 → 1 渐进满所需秒数（finalSwarm 进入时） */
  rampDurationSeconds = 45;

  constructor() {
    super();
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uDesaturate: { value: 0 }, // 实际值每帧由 ramp01 × desaturateMax 写入
        uNoise: { value: 0 },      // 同上
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform vec2 uResolution;
        uniform float uTime;
        uniform float uDesaturate;
        uniform float uNoise;

        const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

        // hash-based 低成本伪噪点（每帧时间扰动 → 颗粒感而非贴图感）
        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        void main() {
          vec4 src = texture2D(tDiffuse, vUv);
          vec3 c = src.rgb;

          float l = dot(c, LUMA);
          c = mix(c, vec3(l), uDesaturate);

          vec2 fragPx = vUv * uResolution;
          float n = hash21(fragPx + vec2(uTime * 60.0, uTime * 37.0)) - 0.5;
          c += n * uNoise;

          gl_FragColor = vec4(clamp(c, 0.0, 1.0), src.a);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }

  override setSize(width: number, height: number): void {
    this.material.uniforms.uResolution.value.set(width, height);
  }

  /** 当前实际生效的去饱和强度（含开关与 ramp） */
  get currentDesaturate(): number {
    return this.enabled ? this.desaturateMax * this.ramp01 : 0;
  }
  /** 当前实际生效的噪点强度（含开关与 ramp） */
  get currentNoise(): number {
    return this.enabled ? this.noiseMax * this.ramp01 : 0;
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const u = this.material.uniforms;
    u.uDesaturate.value = this.currentDesaturate;
    u.uNoise.value = this.currentNoise;
    u.tDiffuse.value = readBuffer.texture;
    u.uTime.value = performance.now() * 0.001;
    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }
    this.fsQuad.render(renderer);
  }

  override dispose(): void {
    this.material.dispose();
    this.fsQuad.dispose?.();
  }
}

// ===========================================================================
// FinalCompositePass：4 → 1 后处理合并（2026-06-21）
// ===========================================================================
// 把原本独立的 OutlinePass(合成段) / OutputPass(tonemap+sRGB) / ColorGradePass /
// DarkComicPass 四个全屏 blit 合并到单个 fragment shader：
//
//   场景 sceneRT (color + depth, by SceneRenderPass)
//     ↓
//   FinalCompositePass：
//     1) Outline (linear HDR space, depth 4-tap → edge → mix to black)
//     2) Neutral tone mapping (Khronos PBR Neutral, HDR → LDR)
//     3) Linear → sRGB encode
//     4) Color grade (brightness × contrast × saturation)
//     5) Dark comic (desaturate + noise，按 ramp 渐入)
//     ↓ 写屏幕
//
// 数学等价性：每一步与原 4 个 pass 完全相同公式，仅合并到单 shader 减少中间 RT 与
// 全屏 blit 次数。详见 docs/performance.md §4.5。
//
// 跨平台预算（由 setupComposer 在构造时按 isMobile 注入）：
//   桌面：sceneRT=HalfFloat，uOutlineTapScale=1.0
//   移动：sceneRT=UnsignedByte（带宽 ½），uOutlineTapScale=2.0（描边采样 ¼，等效半分核）

/**
 * 只负责把场景渲到内部 sceneRT（含 DepthTexture），不做任何合成。
 * FinalCompositePass 通过引用读 sceneRT.texture / sceneRT.depthTexture。
 *
 * needsSwap=false：完全不动 EffectComposer 的 read/write buffer，下游 pass 看到的
 * readBuffer 仍是上一帧最终输出（无副作用）。
 */
export class SceneRenderPass extends Pass {
  public readonly sceneRT: THREE.WebGLRenderTarget;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    w: number,
    h: number,
    opts: { sceneRtType: THREE.TextureDataType },
  ) {
    super();
    this.needsSwap = false;
    this.clear = true;
    const depthTexture = new THREE.DepthTexture(w, h);
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, {
      type: opts.sceneRtType,
      depthTexture,
      depthBuffer: true,
      stencilBuffer: false,
    });
  }

  override setSize(width: number, height: number): void {
    this.sceneRT.setSize(width, height);
  }

  override render(renderer: THREE.WebGLRenderer): void {
    renderer.setRenderTarget(this.sceneRT);
    renderer.clear();
    renderer.render(this.scene, this.camera);
  }

  override dispose(): void {
    this.sceneRT.dispose();
  }
}

const FINAL_COMPOSITE_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// 单 fragment 完成原 4 pass 工作。每一段写明对应原 pass 中的代码出处，便于回滚比对。
const FINAL_COMPOSITE_FRAG = /* glsl */`
  precision highp float;
  uniform sampler2D tColor;
  uniform highp sampler2D tDepth;
  uniform vec2 uResolution;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform float uThickness;
  uniform float uOutlineAlpha;
  uniform float uOutlineTapScale;
  uniform float uExposure;
  uniform float uSaturation;
  uniform float uContrast;
  uniform float uBrightness;
  uniform float uDesaturate;
  uniform float uNoise;
  uniform float uTime;
  varying vec2 vUv;

  const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

  // —— Outline 工具：来自原 SceneOutlinePass / OUTLINE_EDGE_FRAG
  float toViewZ(float d) {
    return (uCameraNear * uCameraFar) / ((uCameraFar - uCameraNear) * d - uCameraFar);
  }
  float sampleZ(vec2 uv) { return toViewZ(texture2D(tDepth, uv).r); }

  // —— Khronos PBR Neutral tone mapping：与 three.js renderer 的 NeutralToneMapping 完全一致
  // (来自 three.js src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js)
  vec3 neutralToneMapping(vec3 color) {
    const float StartCompression = 0.8 - 0.04;
    const float Desaturation = 0.15;
    color *= uExposure;
    float x = min(color.r, min(color.g, color.b));
    float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
    color -= offset;
    float peak = max(color.r, max(color.g, color.b));
    if (peak < StartCompression) return color;
    float d = 1.0 - StartCompression;
    float newPeak = 1.0 - d * d / (peak + d - StartCompression);
    color *= newPeak / peak;
    float g = 1.0 - 1.0 / (Desaturation * (peak - newPeak) + 1.0);
    return mix(color, newPeak * vec3(1.0), g);
  }

  // —— Linear → sRGB encode：与 renderer.outputColorSpace = SRGBColorSpace 等价
  vec3 linearToSRGB(vec3 c) {
    bvec3 cutoff = lessThan(c, vec3(0.0031308));
    vec3 higher = vec3(1.055) * pow(max(c, vec3(0.0)), vec3(1.0/2.4)) - vec3(0.055);
    vec3 lower = c * 12.92;
    return mix(higher, lower, vec3(cutoff));
  }

  // —— DarkComic 噪点 hash（来自原 DarkComicPass.fragmentShader）
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main() {
    vec4 src = texture2D(tColor, vUv);
    vec3 color = src.rgb;

    // [1] Outline（线性 HDR 空间，与原 SceneOutlinePass mix to black 完全等价）
    vec2 texel = (uThickness * uOutlineTapScale) / uResolution;
    float c = sampleZ(vUv);
    float n = sampleZ(vUv + vec2(0.0,  texel.y));
    float s = sampleZ(vUv + vec2(0.0, -texel.y));
    float e = sampleZ(vUv + vec2( texel.x, 0.0));
    float w = sampleZ(vUv + vec2(-texel.x, 0.0));
    float hor = abs(e - w);
    float ver = abs(n - s);
    float delta = sqrt(hor * hor + ver * ver);
    float threshold = abs(c) * 0.02 + 0.05;
    float edge = smoothstep(threshold, threshold * 2.0, delta);
    float depthMask = 1.0 - step(uCameraFar * 0.9, -c);
    edge *= depthMask;
    color = mix(color, vec3(0.0), edge * uOutlineAlpha);

    // [2] Tone mapping（HDR → LDR linear）
    color = neutralToneMapping(color);

    // [3] Linear → sRGB encode
    color = linearToSRGB(color);

    // [4] Color grade（在 sRGB LDR，与原 ColorGradePass 公式完全一致）
    color *= uBrightness;
    color = (color - 0.5) * uContrast + 0.5;
    float l = dot(color, LUMA);
    color = mix(vec3(l), color, uSaturation);
    color = clamp(color, 0.0, 1.0);

    // [5] DarkComic：desaturate + noise（与原 DarkComicPass 完全一致）
    float l2 = dot(color, LUMA);
    color = mix(color, vec3(l2), uDesaturate);
    vec2 fragPx = vUv * uResolution;
    float nse = hash21(fragPx + vec2(uTime * 60.0, uTime * 37.0)) - 0.5;
    color += nse * uNoise;
    color = clamp(color, 0.0, 1.0);

    gl_FragColor = vec4(color, src.a);
  }
`;

/**
 * 把 SceneRenderPass 的 sceneRT 合成到屏幕：outline + tonemap + sRGB + grade + darkcomic。
 *
 * 外部代码（weather lerp / updateDarkComic / dev panel）仍调 ColorGradePass / DarkComicPass
 * 实例的 setter；本 pass 每帧 render() 时从这两个实例读取当前参数同步到自身 uniform，
 * 让原来的接口完全不变。这两个 pass 不再 addPass 到 composer，仅作参数容器存在。
 */
export class FinalCompositePass extends Pass {
  mode: OutlineMode = 'screenSpace';

  private readonly material: THREE.ShaderMaterial;
  private readonly fsq: FullScreenQuad;

  constructor(
    sceneSource: SceneRenderPass,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly grade: ColorGradePass,
    private readonly darkComic: DarkComicPass,
    private readonly renderer: THREE.WebGLRenderer,
    w: number,
    h: number,
    opts: { outlineThickness: number; outlineTapScale: number },
  ) {
    super();
    this.needsSwap = false;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: sceneSource.sceneRT.texture },
        tDepth: { value: sceneSource.sceneRT.depthTexture },
        uResolution: { value: new THREE.Vector2(w, h) },
        uCameraNear: { value: camera.near },
        uCameraFar: { value: camera.far },
        uThickness: { value: opts.outlineThickness },
        uOutlineAlpha: { value: 0.85 },
        uOutlineTapScale: { value: opts.outlineTapScale },
        uExposure: { value: renderer.toneMappingExposure },
        uSaturation: { value: grade.saturation },
        uContrast: { value: grade.contrast },
        uBrightness: { value: grade.brightness },
        uDesaturate: { value: 0 },
        uNoise: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: FINAL_COMPOSITE_VERT,
      fragmentShader: FINAL_COMPOSITE_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.fsq = new FullScreenQuad(this.material);
  }

  override setSize(width: number, height: number): void {
    this.material.uniforms.uResolution.value.set(width, height);
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget): void {
    const u = this.material.uniforms;
    // 同步外部参数（来自 ColorGradePass setter / DarkComicPass ramp / renderer.toneMappingExposure）
    u.uCameraNear.value = this.camera.near;
    u.uCameraFar.value = this.camera.far;
    u.uExposure.value = this.renderer.toneMappingExposure;
    u.uSaturation.value = this.grade.saturation;
    u.uContrast.value = this.grade.contrast;
    u.uBrightness.value = this.grade.brightness;
    u.uDesaturate.value = this.darkComic.currentDesaturate;
    u.uNoise.value = this.darkComic.currentNoise;
    u.uTime.value = performance.now() * 0.001;
    // mode='none' → 关描边但其它合成不变（与原 SceneOutlinePass.mode='none' 等价）
    u.uOutlineAlpha.value = this.mode === 'none' ? 0.0 : 0.85;

    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.fsq.render(renderer);
  }

  override dispose(): void {
    this.material.dispose();
    this.fsq.dispose();
  }
}
