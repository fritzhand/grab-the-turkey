/**
 * The storybook look, for the places and the people in them.
 *
 * A surface is painted in three flat washes: a cool shade, its own color, a warm light. Where one wash
 * meets the next the edge wanders, as if made by a flat brush; across a whole surface the pigment pools
 * a little lighter and darker; foliage and grass get dabs. Big shapes are drawn around in brown ink, a
 * hair thick, which thins out with distance and fades into the paper in the fog.
 */
import * as THREE from 'three';

/** The key light's direction (toward the light). The room's lamp shines from here too. */
export const KEY_DIR = new THREE.Vector3(-0.45, 0.82, 0.55).normalize();

/** The ink the outlines are drawn in: a warm brown, never black. */
export const INK = '#4b3b2e';

const vertex = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  varying vec3 vN;
  varying vec3 vWorld;
  varying vec3 vColor;
  void main() {
    #include <beginnormal_vertex>
    #include <begin_vertex>
    #include <project_vertex>
    #include <fog_vertex>
    vN = normalize(mat3(modelMatrix) * objectNormal);
    vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
    #if defined( USE_COLOR_ALPHA )
      vColor = color.rgb;
    #elif defined( USE_COLOR )
      vColor = color;
    #else
      vColor = vec3(1.0);
    #endif
  }
`;

const fragment = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform vec3 uBase;
  uniform vec3 uKeyDir;
  uniform float uDabs;
  uniform float uGlass;
  uniform float uSeed;
  varying vec3 vN;
  varying vec3 vWorld;
  varying vec3 vColor;

  float h21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vn(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float vn3(vec3 p) {
    return 0.5 * (vn(p.xy + p.z * 1.7) + vn(p.yz * 1.3 + p.x * 2.1 + 7.3));
  }

  void main() {
    vec3 N = normalize(vN);
    if (!gl_FrontFacing) N = -N;
    float ndl = dot(N, normalize(uKeyDir));
    // the brush: band edges wander
    float wob = (vn3(vWorld * 1.6) - 0.5) * 0.15 + (vn3(vWorld * 5.5) - 0.5) * 0.05;
    float x = ndl * 0.5 + 0.5 + wob;

    vec3 base = uBase * vColor;
    vec3 shade = base * vec3(0.70, 0.73, 0.92);                          // cooler and darker
    vec3 light = mix(base, vec3(1.0, 0.95, 0.78), 0.20) * 1.03;          // warmer
    float aa = fwidth(x) * 0.75 + 0.003;
    float b1 = smoothstep(0.43 - aa, 0.43 + aa, x);
    float b2 = smoothstep(0.74 - aa, 0.74 + aa, x);
    vec3 col = mix(mix(shade, base, b1), light, b2);

    // pigment pooling: a slow wash of lighter and darker across a surface
    col *= 1.0 + (vn3(vWorld * 0.55 + uSeed) - 0.5) * 0.10;

    // dabs of the brush on foliage and grass
    if (uDabs > 0.5) {
      float d = vn3(vWorld * 4.2);
      col = mix(col, light * 1.06, smoothstep(0.64, 0.70, d) * 0.55);
      col = mix(col, shade, smoothstep(0.33, 0.27, d) * 0.35);
    }
    // a painted glint across glass
    if (uGlass > 0.5) {
      float s = fract((vWorld.x + vWorld.z) * 0.75 + vWorld.y * 1.15);
      col = mix(col, vec3(0.93, 0.97, 0.98), step(0.80, s) * step(s, 0.90) * 0.55);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
    #include <colorspace_fragment>
  }
`;

export interface PaintOptions {
  /** The surface's color (linear, as three keeps it), before any vertex color. */
  color: THREE.Color;
  vertexColors?: boolean;
  /** Foliage, grass: little lighter and darker dabs. */
  dabs?: boolean;
  /** Glass: a painted glint. */
  glass?: boolean;
}

const cache = new Map<string, THREE.ShaderMaterial>();

export function paintMaterial(o: PaintOptions): THREE.ShaderMaterial {
  const key = `${o.color.getHexString()}|${o.vertexColors ? 'v' : ''}|${o.dabs ? 'd' : ''}|${o.glass ? 'g' : ''}`;
  let m = cache.get(key);
  if (m) return m;
  m = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    fog: true,
    vertexColors: !!o.vertexColors,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uBase: { value: o.color.clone() },
        uKeyDir: { value: KEY_DIR },
        uDabs: { value: o.dabs ? 1 : 0 },
        uGlass: { value: o.glass ? 1 : 0 },
        // a seed from the color, so two surfaces of one color still pool differently
        uSeed: { value: (o.color.r * 7.3 + o.color.g * 3.1 + o.color.b * 5.7) * 10 },
      },
    ]),
  });
  cache.set(key, m);
  return m;
}

// --- the ink -------------------------------------------------------------------------------------

const inkVertex = /* glsl */ `
  #include <common>
  #include <skinning_pars_vertex>
  #include <fog_pars_vertex>
  attribute vec3 smoothN;
  uniform vec2 uRes;
  uniform float uWidth;
  void main() {
    // the outline's direction is the smoothed normal, carried along by the skeleton like any other normal
    vec3 objectNormal = smoothN;
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>
    #include <project_vertex>
    #include <fog_vertex>
    vec3 vn = normalize(normalMatrix * objectNormal);
    vec2 dir = normalize((projectionMatrix * vec4(vn, 0.0)).xy + vec2(1e-5));
    // thinner at a distance, so far trees don't turn to scribble
    float k = clamp(34.0 / max(-mvPosition.z, 1.0), 0.45, 1.0);
    gl_Position.xy += dir * (uWidth * k * 2.0 / uRes) * gl_Position.w;
  }
`;

const inkFragment = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform vec3 uInk;
  void main() {
    gl_FragColor = vec4(uInk, 1.0);
    #include <fog_fragment>
    #include <colorspace_fragment>
  }
`;

/** The outline's material: one shared by everything inked. Set `uRes` to the drawing buffer's size. */
export const inkMaterial = new THREE.ShaderMaterial({
  vertexShader: inkVertex,
  fragmentShader: inkFragment,
  fog: true,
  side: THREE.BackSide,
  uniforms: THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uInk: { value: new THREE.Color(INK) },
      uRes: { value: new THREE.Vector2(1280, 720) },
      uWidth: { value: 1.7 },
    },
  ]),
});

/**
 * Gives a geometry the normals its outline is pushed out along: every copy of a corner (a cube has three,
 * one per face) shares one averaged direction, so the outline closes instead of tearing open at the edges.
 */
export function addSmoothNormals(geo: THREE.BufferGeometry): void {
  if (geo.getAttribute('smoothN')) return;
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  if (!pos || !nor) return;
  const sums = new Map<string, [number, number, number]>();
  const key = (i: number) => `${Math.round(pos.getX(i) * 400)},${Math.round(pos.getY(i) * 400)},${Math.round(pos.getZ(i) * 400)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    let s = sums.get(k);
    if (!s) sums.set(k, (s = [0, 0, 0]));
    s[0] += nor.getX(i);
    s[1] += nor.getY(i);
    s[2] += nor.getZ(i);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const s = sums.get(key(i))!;
    const l = Math.hypot(s[0], s[1], s[2]) || 1;
    out[i * 3] = s[0] / l;
    out[i * 3 + 1] = s[1] / l;
    out[i * 3 + 2] = s[2] / l;
  }
  geo.setAttribute('smoothN', new THREE.BufferAttribute(out, 3));
}
