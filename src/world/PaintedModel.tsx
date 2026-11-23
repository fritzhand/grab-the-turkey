/**
 * An environment built in Blender, drawn in the storybook style: every surface painted with paint.ts,
 * everything named `o_…` outlined in ink.
 *
 * The model comes in three groups, by name:
 *   GRP_Lower  floor, low walls, furniture, deck: always there (the dollhouse)
 *   GRP_Upper  upper walls, roof, dormers, beams: lifted off when you arrive, so you can see in
 *   GRP_Site   ground, trees, water, stone: scenery, and kept out of the contact shadows
 * Add `?roof` to the address to keep the roof on (for a look at the outside).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Environment } from '../env';
import { inkMaterial } from './paint';
import { applyPaint } from './paintScene';
import { shadowExclude } from './Shadows';

const loads = new Map<string, Promise<THREE.Group>>();
function load(url: string): Promise<THREE.Group> {
  let p = loads.get(url);
  if (!p) loads.set(url, (p = new GLTFLoader().loadAsync(url).then((g) => g.scene)));
  return p;
}

const DABS = /^(o_)?(terrain|trees|pines|shrubs|reeds)$/;

interface Rig {
  root: THREE.Group;
  upper: THREE.Object3D | null;
  site: THREE.Object3D | null;
}

function prepare(source: THREE.Group): Rig {
  const root = source.clone(true);
  let upper: THREE.Object3D | null = null;
  let site: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (o.name === 'GRP_Upper') upper = o;
    if (o.name === 'GRP_Site') site = o;
  });
  applyPaint(root, { dabs: (n) => DABS.test(n) });
  return { root, upper, site };
}

const KEEP_ROOF = new URLSearchParams(location.search).has('roof');

export function PaintedModel({ env, roof = false }: { env: Environment; roof?: boolean }) {
  const m = env.model!;
  const gl = useThree((s) => s.gl);
  const [source, setSource] = useState<THREE.Group | null>(null);
  /** When this model's roof started its lift (performance.now), and which model that was. */
  const lift = useRef<{ for: THREE.Object3D | null; at: number }>({ for: null, at: 0 });
  const res = useMemo(() => new THREE.Vector2(), []);

  useEffect(() => {
    let alive = true;
    load(m.url).then(
      (g) => alive && setSource(g),
      (e) => console.warn('Environment model failed to load', e),
    );
    return () => {
      alive = false;
    };
  }, [m.url]);

  const rig = useMemo(() => (source ? prepare(source) : null), [source]);

  useEffect(() => {
    if (!rig) return;
    const skip = [rig.upper, rig.site].filter(Boolean) as THREE.Object3D[];
    skip.forEach((o) => shadowExclude.add(o));
    return () => skip.forEach((o) => shadowExclude.delete(o));
  }, [rig]);

  useFrame(() => {
    gl.getDrawingBufferSize(res);
    inkMaterial.uniforms.uRes.value.copy(res);
    // the ink is a hair thick whatever the screen: a little thicker on a dense one
    inkMaterial.uniforms.uWidth.value = 1.5 * Math.min(2, gl.getPixelRatio());
    const up = rig?.upper;
    if (!up) return;
    if (KEEP_ROOF || roof) return;
    // By the clock, not by frames: a slow TV browser that draws few frames still loses the roof on time,
    // and a new model (the place changed) gets its own lift instead of keeping its roof on.
    const now = performance.now();
    if (lift.current.for !== up) lift.current = { for: up, at: now + 700 };
    const t = Math.min(1, Math.max(0, (now - lift.current.at) / 1500));
    const e = t * t * (3 - 2 * t);
    up.position.y = e * e * 26; // slow at first, then away
    up.visible = t < 1;
  });

  if (!rig) return null;
  return <primitive object={rig.root} position={m.position ?? [0, 0, 0]} rotation-y={m.rotationY ?? 0} scale={m.scale ?? 1} />;
}
