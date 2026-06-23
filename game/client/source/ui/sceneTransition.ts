/**
 * 场景过渡（dissolve transition）
 *
 * 灵感来源：Godot canvas_item shader（gradient 纹理 + tiled shape 纹理 + factor）。
 * 原 shader 关键逻辑：
 *   progress = mix(-width, 1.0, factor)
 *   value    = clamp((gradient(uv) - progress) / width, 0, 1)
 *   shape    = 1 - texture(shape_texture, rotated_tiled_uv).r
 *   alpha    = smoothstep(value - feather, value + feather, threshold - shape)
 *
 * 这里我们用程序化纹理代替资源贴图：
 *   - gradient → 对角线扫描（uv.x + uv.y）
 *   - shape    → 平铺的 voronoi cell（生成有机斑块感，与原 shader 常用的 noise/blob shape 接近）
 *
 * 对外只暴露一个 `playTransition`，把"切场景"这个动作包成"先盖屏 → 切 → 揭开"。
 */

interface TransitionOptions {
  /** 覆盖屏幕用的颜色，默认深紫黑 */
  baseColor?: [number, number, number];
  /** 单方向时长（毫秒），实际总时长 ≈ duration * 2 */
  duration?: number;
  /** shape 平铺密度，越大格子越细 */
  shapeTiling?: number;
  /** shape 旋转角度（度） */
  shapeRotation?: number;
  /** shape 滚动速度 (uv/s) */
  shapeScroll?: [number, number];
  /** 边缘羽化 0-1 */
  feathering?: number;
  /** 过渡条带宽度，越小越锋利 */
  width?: number;
}

const DEFAULTS: Required<TransitionOptions> = {
  baseColor: [0.04, 0.03, 0.09],
  duration: 480,
  shapeTiling: 14,
  shapeRotation: 18,
  shapeScroll: [0.04, 0.02],
  feathering: 0.18,
  width: 0.45,
};

const VERT_SRC = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG_SRC = `
precision highp float;
varying vec2 v_uv;

uniform vec2  u_resolution;
uniform vec3  u_baseColor;
uniform float u_factor;
uniform float u_width;
uniform float u_shapeTiling;
uniform float u_shapeRotation;
uniform vec2  u_shapeScroll;
uniform float u_feathering;
uniform float u_threshold;
uniform float u_time;

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

// voronoi-cell 距离 → 用作 shape mask（越靠近 cell 中心值越大）
float shapeMask(vec2 uv) {
  vec2 i = floor(uv);
  vec2 f = fract(uv);
  float minDist = 1.5;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = hash2(i + g);
      vec2 r = g + o - f;
      minDist = min(minDist, dot(r, r));
    }
  }
  return 1.0 - clamp(sqrt(minDist), 0.0, 1.0);
}

// 对角线扫描 gradient（左下 → 右上覆盖）
float gradientFn(vec2 uv) {
  return clamp((uv.x + uv.y) * 0.5, 0.0, 1.0);
}

vec2 rotateUv(vec2 uv, vec2 pivot, float angle) {
  float s = sin(angle);
  float c = cos(angle);
  mat2 R = mat2(s, -c, c, s);
  return (uv - pivot) * R + pivot;
}

void main() {
  vec2 uv = v_uv;
  float aspect = u_resolution.y / max(u_resolution.x, 1.0);
  vec2 aspectUv = ((uv - vec2(0.0, 0.5)) * vec2(1.0, aspect)) + vec2(0.0, 0.5);

  float progress = mix(-u_width, 1.0, u_factor);
  float value = clamp((gradientFn(uv) - progress) / max(u_width, 0.0001), 0.0, 1.0);

  vec2 tiled = mod((aspectUv + u_time * u_shapeScroll) * u_shapeTiling, 1.0);
  tiled = rotateUv(tiled, vec2(0.5), radians(u_shapeRotation));

  float shape = 1.0 - shapeMask(tiled * 1.6);
  shape = mix(u_feathering * 0.5, 1.0 - u_feathering * 0.5, shape);

  float alpha = smoothstep(
    value - u_feathering * 0.5,
    value + u_feathering * 0.5,
    u_threshold - shape
  );

  gl_FragColor = vec4(u_baseColor, alpha);
}
`;

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('createShader failed');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? 'unknown';
    gl.deleteShader(sh);
    throw new Error(`shader compile failed: ${log}`);
  }
  return sh;
}

function linkProgram(gl: WebGLRenderingContext): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  const program = gl.createProgram();
  if (!program) throw new Error('createProgram failed');
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'unknown';
    gl.deleteProgram(program);
    throw new Error(`program link failed: ${log}`);
  }
  return program;
}

let activeTransition = false;

/**
 * 播放一次"盖屏 → 切换 → 揭屏"过渡。
 * @param onCovered 屏幕被完全覆盖那一刻触发的回调（一般在这里销毁旧 UI、创建新 UI）
 * @param options   可选样式参数
 *
 * 失败回退：如果 WebGL 不可用，会立即触发 onCovered 并直接返回（不破坏功能流）。
 */
export function playTransition(onCovered: () => void, options: TransitionOptions = {}): void {
  if (activeTransition) {
    onCovered();
    return;
  }
  const opts: Required<TransitionOptions> = { ...DEFAULTS, ...options };

  const canvas = document.createElement('canvas');
  canvas.style.cssText = `
    position:fixed;inset:0;width:100%;height:100%;
    z-index:2147483646;pointer-events:auto;display:block;
    background:transparent;
  `;
  document.body.appendChild(canvas);

  const gl =
    (canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false }) as WebGLRenderingContext | null) ??
    (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
  if (!gl) {
    canvas.remove();
    onCovered();
    return;
  }

  let program: WebGLProgram;
  try {
    program = linkProgram(gl);
  } catch (err) {
    console.warn('[sceneTransition] shader 编译失败，跳过过渡', err);
    canvas.remove();
    onCovered();
    return;
  }

  activeTransition = true;

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  const aPos = gl.getAttribLocation(program, 'a_pos');
  const uResolution = gl.getUniformLocation(program, 'u_resolution');
  const uBaseColor = gl.getUniformLocation(program, 'u_baseColor');
  const uFactor = gl.getUniformLocation(program, 'u_factor');
  const uWidth = gl.getUniformLocation(program, 'u_width');
  const uShapeTiling = gl.getUniformLocation(program, 'u_shapeTiling');
  const uShapeRotation = gl.getUniformLocation(program, 'u_shapeRotation');
  const uShapeScroll = gl.getUniformLocation(program, 'u_shapeScroll');
  const uFeathering = gl.getUniformLocation(program, 'u_feathering');
  const uThreshold = gl.getUniformLocation(program, 'u_threshold');
  const uTime = gl.getUniformLocation(program, 'u_time');

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const resize = (): void => {
    const w = Math.max(1, Math.floor(window.innerWidth * dpr));
    const h = Math.max(1, Math.floor(window.innerHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  resize();
  window.addEventListener('resize', resize);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const startedAt = performance.now();
  const dur = opts.duration;
  let calledOnCovered = false;
  let rafId = 0;
  let safetyTimeout = 0;

  // easeInOutCubic：让 factor 起伏更自然
  const ease = (t: number): number =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  const cleanup = (): void => {
    window.removeEventListener('resize', resize);
    if (safetyTimeout) window.clearTimeout(safetyTimeout);
    gl.deleteBuffer(buf);
    gl.deleteProgram(program);
    canvas.remove();
    activeTransition = false;
  };

  const render = (now: number): void => {
    const elapsed = now - startedAt;
    let factor: number;
    if (elapsed < dur) {
      // 阶段 1：覆盖（0 → 1）
      factor = ease(Math.min(1, elapsed / dur));
    } else if (elapsed < dur * 2) {
      // 阶段 2：揭开（1 → 0）
      if (!calledOnCovered) {
        calledOnCovered = true;
        try {
          onCovered();
        } catch (err) {
          console.error('[sceneTransition] onCovered 抛错', err);
        }
      }
      factor = 1 - ease(Math.min(1, (elapsed - dur) / dur));
    } else {
      if (!calledOnCovered) {
        calledOnCovered = true;
        try {
          onCovered();
        } catch (err) {
          console.error('[sceneTransition] onCovered 抛错', err);
        }
      }
      cleanup();
      return;
    }

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    gl.uniform2f(uResolution, canvas.width, canvas.height);
    gl.uniform3f(uBaseColor, opts.baseColor[0], opts.baseColor[1], opts.baseColor[2]);
    gl.uniform1f(uFactor, factor);
    gl.uniform1f(uWidth, opts.width);
    gl.uniform1f(uShapeTiling, opts.shapeTiling);
    gl.uniform1f(uShapeRotation, opts.shapeRotation);
    gl.uniform2f(uShapeScroll, opts.shapeScroll[0], opts.shapeScroll[1]);
    gl.uniform1f(uFeathering, opts.feathering);
    gl.uniform1f(uThreshold, 1.0);
    gl.uniform1f(uTime, elapsed * 0.001);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    rafId = requestAnimationFrame(render);
  };

  rafId = requestAnimationFrame(render);

  // 兜底：万一 raf 卡住（页面切到后台等），强制收尾
  safetyTimeout = window.setTimeout(() => {
    cancelAnimationFrame(rafId);
    if (!calledOnCovered) {
      calledOnCovered = true;
      try {
        onCovered();
      } catch (err) {
        console.error('[sceneTransition] onCovered 抛错', err);
      }
    }
    cleanup();
  }, Math.max(2000, dur * 2 + 500));
}
