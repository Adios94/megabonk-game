import * as THREE from 'three';

/**
 * GPU Curved World (Rolling Horizon) 系统。
 *
 * 在所有材质的 vertex shader 中注入「以 uWarpCenter 为中心，半径 1/uWarpStrength
 * 的球面卷曲」变换。视觉上让远处场景顺着地平线弯下去，营造「滚动地平线」效果。
 *
 * 通过全局 patch THREE.Material.prototype.onBeforeCompile 实现，对所有支持的材质
 * 类型（Basic / Toon / Standard / Physical / Sprite / Phong / Lambert）自动生效。
 *
 * 调用方在每帧 updateCamera 中更新 `curvedWorldUniforms.uWarpCenter` 跟随玩家。
 */
export const curvedWorldUniforms = {
  uWarpCenter: { value: new THREE.Vector3(0, 0, 0) },
  uWarpStrength: { value: 0.015 } // adjustable! Default to 1/66.6 radius
};

let installed = false;

/** Install global onBeforeCompile patch. Idempotent (safe to call multiple times). */
export function installCurvedWorldShaderPatch(): void {
  if (installed) return;
  installed = true;

  const originalOnBeforeCompile = THREE.Material.prototype.onBeforeCompile;
  THREE.Material.prototype.onBeforeCompile = function (shader, renderer) {
    if (originalOnBeforeCompile) {
      originalOnBeforeCompile.call(this, shader, renderer);
    }

    const allowedTypes = [
      'MeshBasicMaterial',
      'MeshToonMaterial',
      'MeshStandardMaterial',
      'MeshPhysicalMaterial',
      'SpriteMaterial',
      'MeshPhongMaterial',
      'MeshLambertMaterial'
    ];

    if (this.isMaterial && (allowedTypes.includes(this.type) || (this as any).isMeshStandardMaterial || (this as any).isMeshBasicMaterial || (this as any).isSpriteMaterial || (this as any).isMeshToonMaterial)) {
      if (!this.userData) this.userData = {};
      if (!this.userData.uIsBackground) {
        this.userData.uIsBackground = { value: this.userData.isBackground ? 1.0 : 0.0 };
      }

      shader.uniforms['uWarpCenter'] = curvedWorldUniforms.uWarpCenter;
      shader.uniforms['uWarpStrength'] = curvedWorldUniforms.uWarpStrength;
      shader.uniforms['uIsBackground'] = this.userData.uIsBackground;

      shader.vertexShader = shader.vertexShader
        .replace(
          'void main() {',
          `uniform vec3 uWarpCenter;\nuniform float uWarpStrength;\nuniform float uIsBackground;\nvoid main() {`
        );

      if (this.type === 'SpriteMaterial') {
        shader.vertexShader = shader.vertexShader.replace(
          '#include <project_vertex>',
          `
          vec4 mvPosition = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
          #ifdef USE_INSTANCING
            mvPosition = instanceMatrix * mvPosition;
          #endif

          vec4 gpWorldPos = modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
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
              mvPosition = viewMatrix * gpWorldPos;
          }

          vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
          #ifndef USE_SIZEATTENUATION
            bool isPerspective = isPerspectiveMatrix( projectionMatrix );
            if ( isPerspective ) scale *= - mvPosition.z;
          #endif

          mvPosition.xy += position.xy * scale;
          gl_Position = projectionMatrix * mvPosition;
          `
        );
      } else {
        shader.vertexShader = shader.vertexShader.replace(
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
          `
        );

        // Normal rotation for non-basic lighted materials to align with spherical curvature
        shader.vertexShader = shader.vertexShader.replace(
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
      }
    }
  };
}

// Auto-install when module is imported.
installCurvedWorldShaderPatch();
