/**
 * Toon / Cel-Shading 工具集。
 *
 * 提供：
 *  - 自定义 5 段 gradient ramp（{@link toonGradientMap}），供所有 {@link THREE.MeshToonMaterial} 共享
 *  - 颜色 / 贴图调校：{@link boostMaterialSaturation} / {@link capMaterialLightness} / {@link tuneToonTexture}
 *  - 共享风格化 uniform：{@link stylizedUniforms}（dev 面板 / 各 stylized 材质共用同一引用）
 *  - {@link applyStylizedToonShading}：注入 stepped light + halftone + 染色阴影 + spec
 *  - 批量 toon 化场景对象：{@link convertToToonMaterials} / {@link brightenWeaponMaterials} / {@link applyChestGoldMaterials}
 *
 * 与 {@link curvedWorld} 协作：applyStylizedToonShading 内同时挂上 curved-world 顶点变形，
 * 因此对挂了风格化的材质，curved-world 的 onBeforeCompile 等效已生效。
 */

import * as THREE from 'three';
import { curvedWorldUniforms } from './curvedWorld.ts';

/**
 * Multi-step toon gradient map (UltimateToon「stylized.gdshader」的 stepped-light 移植)。
 *
 * Godot 的 light() 用如下公式把连续 NdotL 量化成 `steps` 段、段间以 `step_smoothness` 做软过渡：
 *     light_mult   = light * steps
 *     step_base    = floor(light_mult)
 *     light_factor = smoothstep(0.5 - s, 0.5 + s, light_mult - step_base)
 *     light        = (step_base + light_factor) / steps
 * 这里把同一公式烘焙进一张高分辨率 ramp（LinearFilter），MeshToonMaterial 会按
 * NdotL∈[-1,1]→[0,1] 采样它的 .r 通道，于是得到「至少四层」的明暗台阶 + Godot 同款软边。
 *
 * steps=4 ⇒ 5 个亮度平台（阴影 / 暗部 / 中间调 / 亮部 / 高光），满足「至少四层」。
 * shadowFloor 抬高最暗台阶，避免背光面发死黑；highlightCap 给高光留头，白模不顶纯白。
 */
export const TOON_STEPS = 5;            // 分层台阶数（5 层，过渡更细）—— 对应 Godot uniform `steps`
export const TOON_STEP_SMOOTHNESS = 0.12; // 层间软过渡半宽 —— 对应 Godot `step_smoothness`
export const TOON_SHADOW_FLOOR = 0.18; // 最暗台阶的亮度地板（背光面不死黑）
export const TOON_HIGHLIGHT_CAP = 0.94; // 高光台阶封顶（受光面留头，浅色模不顶纯白）

export function smoothstep01(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function createToonGradientMap(
  steps = TOON_STEPS,
  smoothness = TOON_STEP_SMOOTHNESS,
  shadowFloor = TOON_SHADOW_FLOOR,
  highlightCap = TOON_HIGHLIGHT_CAP,
): THREE.DataTexture {
  const width = 256; // 高分辨率：软过渡才平滑，台阶内部仍是纯平色块（cel 观感）
  const data = new Uint8Array(width * 4);
  const s = Math.max(0.0001, smoothness);
  for (let i = 0; i < width; i++) {
    const x = i / (width - 1); // 采样坐标 == 量化前的 NdotL（已 remap 到 0..1）
    const lightMult = x * steps;
    const stepBase = Math.floor(lightMult);
    const factor = smoothstep01(0.5 - s, 0.5 + s, lightMult - stepBase);
    let v = (stepBase + factor) / steps; // 0..1 阶梯化亮度
    v = shadowFloor + v * (highlightCap - shadowFloor);
    const c = Math.round(Math.min(1, Math.max(0, v)) * 255);
    const o = i * 4;
    data[o] = c;
    data[o + 1] = c;
    data[o + 2] = c;
    data[o + 3] = 255;
  }
  const gradMap = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
  gradMap.minFilter = THREE.LinearFilter;
  gradMap.magFilter = THREE.LinearFilter;
  gradMap.needsUpdate = true;
  return gradMap;
}

/** 全局共享 gradient ramp：所有 toon 材质指向同一份贴图，省 GPU 内存。 */
export const toonGradientMap = createToonGradientMap();

/** 提升颜色饱和度（HSL 的 s ×factor），用于 toon 的"饱满高饱和纯色块"观感。 */
export function boostMaterialSaturation(color: THREE.Color, factor: number): void {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  color.setHSL(hsl.h, Math.min(1, hsl.s * factor), hsl.l);
}

/**
 * 明度封顶（HSL 的 L ≤ maxL）。浅灰白材质（如关卡白模）反照率接近 1，被照亮后线性亮度冲到 ~1.9，
 * 在色调映射里顶死成纯白、还会触发 bloom 晕开 → 整片"翻白"无细节。把明度压到中间调后，
 * 高光不再溢出，gradientMap 的阶梯断层 + 网点 + 黑描边才显得出来（参考图那种中间调质感）。
 */
export function capMaterialLightness(color: THREE.Color, maxL: number): void {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  if (hsl.l > maxL) color.setHSL(hsl.h, hsl.s, maxL);
}

/** 贴图过滤：各向异性 + mipmap，提升近景 / 斜视下的贴图清晰度（PR #56）。 */
export function tuneToonTexture(tex: THREE.Texture | null | undefined): void {
  if (!tex) return;
  tex.anisotropy = 8;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
}

/**
 * 全局共享的风格化光照参数（uniform 引用）。所有 stylized 材质在 onBeforeCompile 里都指向
 * 同一份对象，因此运行时改任一 `.value`，整场景的卡通表现实时跟着变 —— 这就是游戏内调参面板
 * 的数据源（见 createStylizedDebugPanel）。改这里的初值 = 改默认外观。
 *
 * 注意：uShadowTint / uLightTint / uRimColor 是「线性空间乘子」，分量可 >1（受光台阶要提亮就 >1）。
 * 所以面板用三个独立滑块而非取色器（取色器表达不了 >1）。
 */
export const stylizedUniforms = {
  uSteps: { value: 5.0 },                                   // 分层台阶数（Godot steps）
  uStepSmooth: { value: 0.0 },                              // 台阶软过渡半宽（0=硬切、纯色块；Godot step_smoothness）
  uHalftoneTiling: { value: 11.0 },                         // 网点像素间距（大=点大且疏）
  uHalftoneSmooth: { value: 0.10 },                         // 网点边缘脆度（小=硬）
  uHalftoneDark: { value: 0.6 },                            // 网点压暗强度
  uHalftoneBlend: { value: 0.85 },                          // 网点整体强度（0=关）
  uShadowTint: { value: new THREE.Vector3(0.30, 0.37, 0.66) }, // 冷暗阴影色乘子
  uLightTint: { value: new THREE.Vector3(1.10, 1.02, 0.88) },  // 暖亮受光色乘子
  // 世界空间主光向（俯视/侧视相机的左上前太阳）。每帧 shader 内用 viewMatrix 转到视空间再点法线，
  // 这样镜头平移/旋转时，世界中物体的明暗台阶与网点强度保持稳定 —— 不再"网点跟着镜头漂"。
  // +Y 给到 0.92 让水平面（地面 / 白盒顶）的 ndotl≈0.92 落入顶端台阶（亮度 1.0）→ 网点 gate 直接归零。
  uLightDirWorld: { value: new THREE.Vector3(-0.22, 0.92, 0.32).normalize() },
  // 网点显示阈值：light 高于 uHalftoneCutLow 开始衰减，高于 uHalftoneCutHigh 完全消失。
  // 漫画 halftone 的惯例 —— 网点只在阴影 / 半阴影区，亮面留作纯色块。
  uHalftoneCutLow: { value: 0.55 },
  uHalftoneCutHigh: { value: 0.78 },
};

/** stylized 片元需要的 uniform 声明（注入到 main 前）。 */
const STYLIZED_UNIFORM_DECL = `
uniform float uSpec;
uniform float uHalftone;
uniform float uSteps;
uniform float uStepSmooth;
uniform float uHalftoneTiling;
uniform float uHalftoneSmooth;
uniform float uHalftoneDark;
uniform float uHalftoneBlend;
uniform vec3 uShadowTint;
uniform vec3 uLightTint;
uniform vec3 uLightDirWorld;
uniform float uHalftoneCutLow;
uniform float uHalftoneCutHigh;
`;

/**
 * 风格化光照 GLSL —— UltimateToon「stylized.gdshader」的 light() 完整移植，注入 MeshToon 片元的
 * <opaque_fragment> 前并「完全接管 outgoingLight」。
 *
 * 关键：旧版只在引擎算好的 outgoingLight 上"修补"，场景的环境光/半球光/自发光一抬，分层台阶就被
 * 压到顶端、糊成一片 → 看不出卡通感。新版无视场景灯光，自己用固定视空间光向重新算一遍光照，
 * 因此分层/网点/染色/rim 始终强烈可见，逐字对应 Godot 的 light()：
 *
 *   第 0 层 stepped light：light = (floor(L*steps) + smoothstep(.5±s, frac)) / steps —— ≥4 段台阶
 *   第 1 层 halftone      ：暗台阶网点大、亮台阶网点消失，pattern_blend 混入 light（Godot pattern）
 *   第 2 层 colored shadow：col = mix(albedo×冷暗, albedo×暖亮, light)（Godot shadow_tint）
 *   第 3 层 toon specular ：硬边塑料高光（per-material uSpec，主角/武器>0）
 *   末尾叠回 totalEmissiveRadiance —— 霓虹/发光贴图不丢。
 *   （rim 边缘光已移除：轮廓由屏幕空间深度描边负责，省掉每像素的菲涅尔运算。）
 *
 * 所有调参项都是 uniform（见 stylizedUniforms）：可在游戏内面板实时拖，也可改 stylizedUniforms 初值定基线。
 */
const STYLIZED_TOON_GLSL = `
	{
		vec3 N = normalize( normal );
		vec3 V = normalize( vViewPosition );                       // 片元 -> 相机(视空间)
		// 主光向：世界空间固定 → 用 viewMatrix 转到视空间再做点法线。
		// （旧版直接写死视空间向量，结果光相对相机固定，镜头一转，世界里的明暗面跟着扫，halftone 网点像在物体上爬。）
		vec3 LDIR = normalize( ( viewMatrix * vec4( uLightDirWorld, 0.0 ) ).xyz );
		float ndotl = saturate( dot( N, LDIR ) );

		// —— 第 0 层 stepped light（Godot 量化公式，uSteps 段台阶 + 软过渡） ——
		// uStepSmooth 可为 0（硬切纯色块），用 max(.,1e-4) 兜底避免 smoothstep edge0>=edge1 的 UB。
		float steppedLight;
		{
			float lm = ndotl * uSteps;
			float sb = floor( lm );
			float ss = max( uStepSmooth, 1e-4 );
			float lf = smoothstep( 0.5 - ss, 0.5 + ss, lm - sb );
			steppedLight = ( sb + lf ) / uSteps;
		}
		float light = steppedLight;

		// —— 第 1 层 halftone 网点（对应 Godot pattern）：暗台阶点大、亮台阶点消失 ——
		// 漫画 halftone 惯例：网点只在阴影 / 半阴影区，亮面留作纯色块。
		// brightGate = 1 - smoothstep(low, high, light)，light≥high 时网点完全消失（白盒顶 / 地面纯色）。
		vec2 cell = fract( gl_FragCoord.xy / uHalftoneTiling ) - 0.5;
		float dotDist = length( cell ) * 2.0;                      // 0=点心 ~1=邻边
		float dotRadius = ( 1.0 - light ) * 0.95;                  // 越暗点越大
		float dotInside = 1.0 - smoothstep( dotRadius - uHalftoneSmooth, dotRadius + uHalftoneSmooth, dotDist );
		float brightGate = 1.0 - smoothstep( uHalftoneCutLow, uHalftoneCutHigh, light );
		dotInside *= brightGate;
		float patLight = light * ( 1.0 - dotInside * uHalftoneDark ); // 点内把局部亮度压暗
		light = mix( light, patLight, uHalftoneBlend * uHalftone );

		// —— 第 2 层 colored shadow（Godot shadow_tint）：暗部染冷、亮部染暖，全程乘 albedo ——
		vec3 albedo = diffuseColor.rgb;
		vec3 col = mix( albedo * uShadowTint, albedo * uLightTint, light );

		// —— 第 3 层 toon specular（硬边塑料高光，仅 uSpec>0 的主角/武器） ——
		vec3 H = normalize( LDIR + V );
		float sp = smoothstep( 0.5, 0.53, pow( saturate( dot( N, H ) ), 48.0 ) ) * uSpec * saturate( ndotl );
		col += vec3( sp );

		outgoingLight = col + totalEmissiveRadiance;               // 完全接管光照 + 叠回自发光
	}
`;

/**
 * 给 MeshToonMaterial 挂上风格化光照（接管 outgoingLight：stepped + halftone + 染色 + rim + spec）。
 * specStrength：toon 高光强度（per-material uniform）。怪物/场景传 0（哑光），主角/武器传 >0 留塑料光泽。
 * halftone：是否启用屏幕空间网点（per-material uniform）。
 * 其余风格化参数全部指向共享的 stylizedUniforms（同一引用 → 面板实时改一个值全场景生效）。
 * 幂等（userData 标记）；共享同一编译程序（uniform 值差异不影响 program 缓存）。
 */
export function applyStylizedToonShading(mat: THREE.MeshToonMaterial, specStrength = 0, halftone = true): void {
  if (mat.userData['__stylized']) return;
  mat.userData['__stylized'] = true;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms['uSpec'] = { value: specStrength };          // per-material
    shader.uniforms['uHalftone'] = { value: halftone ? 1.0 : 0.0 }; // per-material
    // 共享引用：改 stylizedUniforms.*.value → 所有材质同步更新
    shader.uniforms['uSteps'] = stylizedUniforms.uSteps;
    shader.uniforms['uStepSmooth'] = stylizedUniforms.uStepSmooth;
    shader.uniforms['uHalftoneTiling'] = stylizedUniforms.uHalftoneTiling;
    shader.uniforms['uHalftoneSmooth'] = stylizedUniforms.uHalftoneSmooth;
    shader.uniforms['uHalftoneDark'] = stylizedUniforms.uHalftoneDark;
    shader.uniforms['uHalftoneBlend'] = stylizedUniforms.uHalftoneBlend;
    shader.uniforms['uShadowTint'] = stylizedUniforms.uShadowTint;
    shader.uniforms['uLightTint'] = stylizedUniforms.uLightTint;
    shader.uniforms['uLightDirWorld'] = stylizedUniforms.uLightDirWorld;
    shader.uniforms['uHalftoneCutLow'] = stylizedUniforms.uHalftoneCutLow;
    shader.uniforms['uHalftoneCutHigh'] = stylizedUniforms.uHalftoneCutHigh;

    if (!mat.userData.uIsBackground) {
      mat.userData.uIsBackground = { value: mat.userData.isBackground ? 1.0 : 0.0 };
    }

    shader.uniforms['uWarpCenter'] = curvedWorldUniforms.uWarpCenter;
    shader.uniforms['uWarpStrength'] = curvedWorldUniforms.uWarpStrength;
    shader.uniforms['uIsBackground'] = mat.userData.uIsBackground;

    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        `uniform vec3 uWarpCenter;\nuniform float uWarpStrength;\nuniform float uIsBackground;\nvoid main() {`
      )
      .replace(
        '#include <project_vertex>',
        `
        vec4 localPos = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          localPos = instanceMatrix * localPos;
        #endif
        vec4 gpWorldPos = modelMatrix * localPos;

        vec3 diff = gpWorldPos.xyz - uWarpCenter;
        float d = length(diff.xz);

        if (d > 1e-5 && uWarpStrength > 0.0 && uIsBackground < 0.5) {
            float theta = d * uWarpStrength;
            float sinTheta = sin(theta);
            float cosTheta = cos(theta);
            vec2 dir = diff.xz / d;

            vec3 normal = vec3(sinTheta * dir.x, cosTheta, sinTheta * dir.y);
            float r = (1.0 / uWarpStrength) + diff.y;
            vec3 warpedPos = r * normal;
            warpedPos.y -= (1.0 / uWarpStrength);

            gpWorldPos.xyz = uWarpCenter + warpedPos;
        }

        vec4 mvPosition = viewMatrix * gpWorldPos;
        gl_Position = projectionMatrix * mvPosition;
        vViewPosition = - mvPosition.xyz;
        #ifdef USE_FOG
          vFogDepth = - mvPosition.z;
        #endif
        `
      )
      .replace(
        '#include <defaultnormal_vertex>',
        `
        #include <defaultnormal_vertex>

        vec3 gpWorldPosForNormal = (modelMatrix * vec4(position, 1.0)).xyz;
        vec3 diffForNormal = gpWorldPosForNormal - uWarpCenter;
        float dForNormal = length(diffForNormal.xz);

        if (dForNormal > 1e-5 && uWarpStrength > 0.0 && uIsBackground < 0.5) {
            float theta = dForNormal * uWarpStrength;
            vec2 dir = diffForNormal.xz / dForNormal;
            vec3 viewAxis = normalize( mat3(viewMatrix) * vec3( -dir.y, 0.0, dir.x ) );
            
            float cosA = cos(theta);
            float sinA = sin(theta);
            transformedNormal = transformedNormal * cosA + cross(viewAxis, transformedNormal) * sinA + viewAxis * dot(viewAxis, transformedNormal) * (1.0 - cosA);
            transformedNormal = normalize(transformedNormal);
        }
        `
      );

    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${STYLIZED_UNIFORM_DECL}\nvoid main() {`)
      .replace(
        '#include <opaque_fragment>',
        `${STYLIZED_TOON_GLSL}\n\t#include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => 'stylized-toon-v10-stepeps';
}

/**
 * 把场景中所有 Mesh 材质转成 MeshToonMaterial（cel-shading），保留 color / map / normalMap / emissive。
 * - 已是 toon：只补挂 stylized shading + lightness cap，不重建材质（保留贴图引用）
 * - 其它类型：构造新的 toon material，统一 boost saturation + cap lightness + apply stylized
 */
export function convertToToonMaterials(root: THREE.Object3D, halftone = true): void {
  root.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const toonMats = materials.map((mat) => {
      if (mat instanceof THREE.MeshToonMaterial) {
        tuneToonTexture(mat.map);
        tuneToonTexture(mat.emissiveMap);
        if (mat.color) capMaterialLightness(mat.color, 0.55); // 已是 toon 也封顶：贴图×color，压暗白模
        
        if (mesh.userData.isBackground) {
          mat.userData.isBackground = true;
        }
        applyStylizedToonShading(mat, 0, halftone); // 已是 toon：补挂风格化叠加
        return mat;
      }
      const oldMat = mat as THREE.MeshStandardMaterial | THREE.MeshPhongMaterial | THREE.MeshLambertMaterial;
      const color = (oldMat.color ?? new THREE.Color(0xffffff)).clone();
      boostMaterialSaturation(color, 1.5); // 敌人/场景/道具统一高饱和（与玩家 ×1.6 对齐）
      capMaterialLightness(color, 0.55);   // 明度封顶：白模白色多来自贴图，用 color 乘子压暗（贴图×color），不再顶白糊成一片
      // 保留 emissive / emissiveMap：霓虹屏幕、发光贴图在 toon 转换后不丢（PR #56）。
      const map = oldMat.map ?? null;
      const emissiveMap = oldMat.emissiveMap ?? null;
      tuneToonTexture(map);
      tuneToonTexture(emissiveMap);
      const toon = new THREE.MeshToonMaterial({
        color,
        map,
        emissive: oldMat.emissive ?? new THREE.Color(0x000000),
        emissiveMap,
        gradientMap: toonGradientMap,
        side: oldMat.side ?? THREE.FrontSide,
        transparent: oldMat.transparent ?? false,
        opacity: oldMat.opacity ?? 1,
        vertexColors: oldMat.vertexColors, // 100% 继承并保留原始网格的顶点颜色（Vertex Colors）支持
      });
      toon.name = oldMat.name || 'ToonMat';
      
      // 传递背景标记到新创建的 Toon 材质
      if (mesh.userData.isBackground || (oldMat.userData && oldMat.userData.isBackground)) {
        toon.userData.isBackground = true;
      }
      
      applyStylizedToonShading(toon, 0, halftone); // rim + toon spec + 染色阴影
      return toon;
    });
    mesh.material = toonMats.length === 1 ? toonMats[0] : toonMats;
  });
}

/**
 * Lift weapon materials so they don't collapse to near-black under our 3-step
 * toon ramp. Applies a gamma curve (darks brighten more than brights) plus a
 * small emissive floor so the shadow side stays readable.
 *
 * IMPORTANT: only call this on weapon meshes. Chests, scenery, and player
 * models intentionally keep their original tones.
 */
export function brightenWeaponMaterials(root: THREE.Object3D): void {
  const gamma = 0.55;
  const emissiveFloor = 0.18;
  root.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const lifted = mats.map((mat) => {
      const m = mat as THREE.MeshToonMaterial;
      const original = (m.color ?? new THREE.Color(0xffffff)).clone();
      const c = new THREE.Color(
        Math.pow(original.r, gamma),
        Math.pow(original.g, gamma),
        Math.pow(original.b, gamma),
      );
      const newMat = new THREE.MeshToonMaterial({
        color: c,
        emissive: c.clone().multiplyScalar(emissiveFloor),
        map: m.map ?? null,
        gradientMap: m.gradientMap ?? toonGradientMap,
        side: m.side ?? THREE.FrontSide,
        transparent: m.transparent ?? false,
        opacity: m.opacity ?? 1,
      });
      newMat.name = m.name || 'WeaponToon';
      applyStylizedToonShading(newMat, 0.35); // 武器留一点高光
      return newMat;
    });
    mesh.material = lifted.length === 1 ? lifted[0] : lifted;
  });
}

/** 宝箱专用金属 / 木材染色：交替 0xffc44d / 0x9a5528，emissive 微抬，无 stylized。 */
export function applyChestGoldMaterials(root: THREE.Object3D): void {
  let meshIndex = 0;
  root.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const lifted = mats.map((mat, matIndex) => {
      const source = mat as THREE.MeshToonMaterial;
      const sourceColor = source.color ?? new THREE.Color(0x8a4a20);
      const isMetal = meshIndex % 3 === 0 || matIndex > 0 || sourceColor.r > sourceColor.g;
      const color = isMetal ? new THREE.Color(0xffc44d) : new THREE.Color(0x9a5528);
      const emissive = isMetal ? new THREE.Color(0x7a4a10) : new THREE.Color(0x261006);
      const chestMat = new THREE.MeshToonMaterial({
        color,
        emissive,
        gradientMap: toonGradientMap,
        side: source.side ?? THREE.FrontSide,
        transparent: source.transparent ?? false,
        opacity: source.opacity ?? 1,
      });
      chestMat.name = `ChestReadable_${meshIndex}_${matIndex}`;
      return chestMat;
    });
    mesh.material = lifted.length === 1 ? lifted[0] : lifted;
    meshIndex++;
  });
}
