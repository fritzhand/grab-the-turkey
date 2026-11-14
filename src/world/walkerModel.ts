/**
 * The walker: the painterly figure, its skeleton and its clips (idle, run, air, bored).
 *
 * The figure and its clips come from portfolio-map-3d (MIT License, Copyright (c) 2026 the
 * portfolio-map-3d contributors; see public/walker/LICENSE), as is the .bin format read here:
 *   [0..9] the JSON header's length (ASCII), [10..10+n] the JSON header, then a Draco payload.
 * Type 0 is a mesh; type 1 is data (bones, animation frames).
 */
import * as THREE from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
// the decoder three ships, imported by URL so the build copies it (and the dev server serves it)
import DRACO_JS from "three/examples/jsm/libs/draco/draco_wasm_wrapper.js?url";
import DRACO_WASM from "three/examples/jsm/libs/draco/draco_decoder.wasm?url";

const BASE = "/walker/";
const TYPED = ["Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array", "Uint16Array", "Int32Array", "Uint32Array", "Float32Array", "Float64Array"];

let draco: DRACOLoader | null = null;
function decoder(): DRACOLoader {
  if (!draco) draco = new DRACOLoader().setDecoderPath({ js: DRACO_JS, wasm: DRACO_WASM }).preload();
  return draco;
}

async function loadBin(file: string): Promise<THREE.BufferGeometry> {
  const res = await fetch(BASE + file);
  if (!res.ok) throw new Error(`${file}: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const td = new TextDecoder();
  const n = parseInt(td.decode(bytes.slice(0, 10)), 10);
  const header = JSON.parse(td.decode(bytes.slice(10, 10 + n))) as { attributes: [string, number][]; userData?: Record<string, unknown> };
  const payload = bytes.slice(10 + n).buffer;
  const attributeIDs: Record<string, number> = {};
  const attributeTypes: Record<string, string> = {};
  header.attributes.forEach(([name, type], i) => {
    attributeIDs[name] = i;
    attributeTypes[name] = TYPED[type];
  });
  // decodeGeometry is DRACOLoader's own worker entry (not in its typings)
  const geo = (await (decoder() as unknown as { decodeGeometry: (b: ArrayBuffer, o: object) => Promise<THREE.BufferGeometry> }).decodeGeometry(payload, {
    attributeIDs,
    attributeTypes,
    useUniqueIDs: true,
  })) as THREE.BufferGeometry;
  if (header.userData) geo.userData = header.userData;
  return geo;
}

function skin(mesh: THREE.BufferGeometry, bones: THREE.BufferGeometry, material: THREE.Material): THREE.SkinnedMesh {
  const list: THREE.Bone[] = [];
  const pos = bones.attributes.position.array as Float32Array;
  const quat = bones.attributes.quaternion.array as Float32Array;
  const scl = bones.attributes.scale.array as Float32Array;
  for (let i = 0; i < bones.attributes.position.count; i++) {
    const b = new THREE.Bone();
    b.name = `bone_${i}`;
    b.position.fromArray(pos, i * 3);
    b.quaternion.fromArray(quat, i * 4).normalize();
    b.scale.fromArray(scl, i * 3);
    list.push(b);
  }
  const roots: number[] = [];
  // Each bone's parent (+1; 0 for a root). The values are 32-bit, so a 16-bit read holds each one
  // as a pair (value, 0): take every other one when the array is twice the bone count.
  const raw = bones.attributes.hierarchy.array as Uint16Array;
  const step = raw.length === list.length * 2 ? 2 : 1;
  const hierarchy = Array.from({ length: list.length }, (_, i) => raw[i * step]);
  for (let i = 0; i < hierarchy.length; i++) {
    const parent = hierarchy[i] - 1;
    if (parent === -1) roots.push(i);
    else list[parent].add(list[i]);
  }
  const skeleton = new THREE.Skeleton(list);
  const skinned = new THREE.SkinnedMesh(mesh, material);
  for (const r of roots) skinned.add(list[r]);
  skinned.bind(skeleton);
  skinned.normalizeSkinWeights();
  return skinned;
}

function clip(name: string, data: THREE.BufferGeometry): THREE.AnimationClip {
  const { frames, fps } = data.userData as { frames: number; fps: number };
  const bones = data.attributes.position.count / frames;
  const duration = frames / fps;
  const step = duration / (frames - 1);
  const times = Array.from({ length: frames }, (_, i) => i * step);
  const tracks: THREE.KeyframeTrack[] = [];
  for (const attr of ["scale", "quaternion", "position"] as const) {
    const a = data.attributes[attr];
    const size = a.itemSize;
    for (let b = 0; b < bones; b++) {
      const values: number[] = [];
      for (let f = 0; f < frames; f++) for (let c = 0; c < size; c++) values.push(a.array[f * bones * size + b * size + c] as number);
      const T = size === 4 ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
      tracks.push(new T(`bone_${b}.${attr}`, times, values, THREE.InterpolateLinear));
    }
  }
  return new THREE.AnimationClip(name, duration, tracks);
}

export type WalkerClips = { idle: THREE.AnimationClip; run: THREE.AnimationClip; air: THREE.AnimationClip; bored: THREE.AnimationClip };

type WalkerData = { mesh: THREE.BufferGeometry; bones: THREE.BufferGeometry; clips: WalkerClips };
let data: Promise<WalkerData> | null = null;

/** Fetches and decodes the figure once; every player's figure is built from the same data. */
function walkerData(): Promise<WalkerData> {
  data ??= Promise.all(
    ["walker.bin", "walker-bones.bin", "walker-idle.bin", "walker-run.bin", "walker-air.bin", "walker-bored.bin"].map(loadBin),
  ).then(([mesh, bones, idle, run, air, bored]) => ({
    mesh,
    bones,
    clips: { idle: clip("idle", idle), run: clip("run", run), air: clip("air", air), bored: clip("bored", bored) },
  }));
  return data;
}

/** A new figure with its own skeleton, sharing the geometry and the clips. */
export async function loadWalker(material: THREE.Material): Promise<{ mesh: THREE.SkinnedMesh; clips: WalkerClips }> {
  const d = await walkerData();
  const skinned = skin(d.mesh, d.bones, material);
  skinned.frustumCulled = false; // its bounds are the bind pose's; the clips move it
  return { mesh: skinned, clips: d.clips };
}
