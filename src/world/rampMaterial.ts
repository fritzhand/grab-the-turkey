/**
 * The figure's painterly material: a surface's color is a row of the ramp texture read at
 * x = half-lambert(N.L) x shadow. No environment light, no specular, no normal maps. Each vertex
 * carries colorInfo: x its row, y a flag (0 fixed color, 1 skin, 3 glow). The figure is skinned.
 */
import * as THREE from "three";
import { RAMP_ROWS, rampTexture, SKIN_ROW } from './palette';

const vertex = /* glsl */ `
  #include <common>
  #include <skinning_pars_vertex>
  #include <shadowmap_pars_vertex>
  #include <fog_pars_vertex>
  #ifdef COLOR_INFO
    attribute vec2 colorInfo;
    varying vec2 vColorInfo;
  #endif
  varying vec3 vNormalW;
  varying vec3 vWorld;
  void main() {
    #include <beginnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <defaultnormal_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>
    #include <project_vertex>
    #include <worldpos_vertex>
    #include <shadowmap_vertex>
    #include <fog_vertex>
    vec3 n = objectNormal;
    vec4 w = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      n = mat3(instanceMatrix) * n;
      w = instanceMatrix * w;
    #endif
    vNormalW = normalize(mat3(modelMatrix) * n);
    vWorld = (modelMatrix * w).xyz;
    #ifdef COLOR_INFO
      vColorInfo = colorInfo;
    #endif
  }
`;

const fragment = /* glsl */ `
  #include <common>
  #include <packing>
  #include <lights_pars_begin>
  #include <shadowmap_pars_fragment>
  #include <shadowmask_pars_fragment>
  #include <fog_pars_fragment>
  uniform sampler2D tRamp;
  uniform float uRow;
  uniform float uSkin;
  uniform float uGlow;
  uniform vec3 uTint;
  uniform vec3 uKeyDir;
  #ifdef COLOR_INFO
    varying vec2 vColorInfo;
  #endif
  varying vec3 vNormalW;
  varying vec3 vWorld;

  float rampV(float row) { return (floor(row + 0.5) + 0.5) / ${RAMP_ROWS.toFixed(1)}; }

  void main() {
    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    float ndl = dot(N, normalize(uKeyDir));
    float shadow = getShadowMask();
    float lit = smoothstep(0.12, 0.38, ndl);
    float x = (ndl * 0.5 + 0.5) * mix(1.0, shadow, lit);
    float row = uRow;
    float glow = uGlow;
    #ifdef COLOR_INFO
      row = vColorInfo.x;
      if (vColorInfo.y > 2.5) glow = 1.0;
      else if (vColorInfo.y > 0.5 && vColorInfo.y < 1.5) row = ${SKIN_ROW.toFixed(1)} + uSkin;
    #endif
    // the ramp's bands, sharp; across a shadow's edge within a pixel the two sides are averaged
    float w = 0.25 * fwidth(x);
    vec3 col = texture2D(tRamp, vec2(x, rampV(row))).rgb;
    if (w > 0.0015) col = 0.5 * (texture2D(tRamp, vec2(x - w, rampV(row))).rgb + texture2D(tRamp, vec2(x + w, rampV(row))).rgb);
    if (glow > 0.5) col = texture2D(tRamp, vec2(0.5, rampV(row))).rgb * (1.0 + glow * 1.5);
    col *= uTint;
    // nothing is a black hole: a little bounce in the darkest recesses
    col = max(col, vec3(0.018, 0.017, 0.024));
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
    #include <colorspace_fragment>
  }
`;

export interface RampOptions {
  /** One row for the whole mesh. */
  row?: number;
  /** Each vertex names its row (the walker). */
  colorInfo?: boolean;
  /** The walker's skin row (0 to 3). */
  skin?: number;
  /** Draw unlit and bright (LED strips, lamps). */
  glow?: number;
  tint?: THREE.ColorRepresentation;
  /** The shirt color, which picks the player's own ramp texture. */
  color?: string;
}

/** The key light's direction (toward the light); the room's lamp shines from here too. */
export const KEY_DIR = new THREE.Vector3(-0.45, 0.82, 0.55).normalize();

export function rampMaterial(o: RampOptions = {}): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    lights: true,
    fog: true,
    defines: o.colorInfo ? { COLOR_INFO: "" } : {},
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.lights,
      THREE.UniformsLib.fog,
      {
        tRamp: { value: null },
        uRow: { value: o.row ?? 300 },
        uSkin: { value: o.skin ?? 1 },
        uGlow: { value: o.glow ?? 0 },
        uTint: { value: new THREE.Color(o.tint ?? "#ffffff") },
        uKeyDir: { value: KEY_DIR },
      },
    ]),
  });
  m.uniforms.tRamp.value = rampTexture(o.color ?? '#1c2229'); // set after merge(), which clones textures
  return m;
}
