/**
 * The room: the white room's floor, fog and light, the edge of play, and whatever the environment
 * stands in it. In the white room the floor, the fog and the sky are one color, so the floor runs
 * to a white horizon with no seam. Soft contact shadows ground everything; a vignette and a film
 * grain finish the frame.
 */
import { Suspense, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useLoader } from '@react-three/fiber';
import { EffectComposer, Noise, Vignette } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Environment } from '../env';
import { game, getVersion, subscribe } from '../game/store';
import { Pieces } from './Pieces';
import { KEY_DIR } from './rampMaterial';
import { Shadow } from './Shadows';

function useEnv(): Environment {
  useSyncExternalStore(subscribe, getVersion);
  return game.env;
}

function Edge({ env }: { env: Environment }) {
  const geo = useMemo(() => {
    const b = env.bounds;
    const pts: THREE.Vector3[] = [];
    if (b.kind === 'circle') {
      for (let i = 0; i <= 128; i++) {
        const a = (i / 128) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.sin(a) * b.r, 0.01, Math.cos(a) * b.r));
      }
    } else {
      for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]) pts.push(new THREE.Vector3(x * b.hx, 0.01, z * b.hz));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [env]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <lineLoop geometry={geo}>
      <lineBasicMaterial color="#9aa0a4" transparent opacity={0.55} />
    </lineLoop>
  );
}

function FloorImage({ env }: { env: Environment }) {
  const f = env.floorImage!;
  const tex = useLoader(THREE.TextureLoader, f.url);
  tex.colorSpace = THREE.SRGBColorSpace;
  return (
    <mesh rotation-x={-Math.PI / 2} position={[f.x ?? 0, 0.003, f.z ?? 0]}>
      <planeGeometry args={[f.width, f.depth]} />
      <meshBasicMaterial map={tex} transparent opacity={f.opacity ?? 1} depthWrite={false} />
    </mesh>
  );
}

function Model({ env }: { env: Environment }) {
  const m = env.model!;
  const [scene, setScene] = useState<THREE.Object3D | null>(null);
  useEffect(() => {
    let alive = true;
    new GLTFLoader().load(m.url, (g) => alive && setScene(g.scene), undefined, (e) => console.warn('Environment model failed to load', e));
    return () => {
      alive = false;
    };
  }, [m.url]);
  if (!scene) return null;
  return <primitive object={scene} position={m.position ?? [0, 0, 0]} rotation-y={m.rotationY ?? 0} scale={m.scale ?? 1} />;
}

export function Room() {
  const env = useEnv();
  const c = env.colors;
  return (
    <>
      <color attach="background" args={[c.sky]} />
      <fog attach="fog" args={[c.sky, c.fog[0], c.fog[1]]} />
      <hemisphereLight args={['#ffffff', '#d9dad6', 1.6]} />
      <directionalLight position={KEY_DIR.clone().multiplyScalar(30)} intensity={2.1} />
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[400, 400]} />
        <meshBasicMaterial color={c.floor} />
      </mesh>
      <Edge env={env} />
      {env.floorImage && (
        <Suspense fallback={null}>
          <FloorImage env={env} />
        </Suspense>
      )}
      {env.model && <Model env={env} />}
      <Pieces env={env} />
      {/* a wide, soft one for the furniture, and a close one at the player's feet */}
      <Shadow size={40} resolution={512} far={3} blur={1.5} opacity={0.5} color="#4a4e52" />
      <Shadow size={6} resolution={256} far={1.8} blur={1.4} opacity={0.6} color="#30353a" lift={0.004} />
    </>
  );
}

export function Effects() {
  return (
    <EffectComposer multisampling={2}>
      <Vignette offset={0.32} darkness={0.42} />
      <Noise premultiply={false} blendFunction={BlendFunction.MULTIPLY} opacity={0.07} />
    </EffectComposer>
  );
}
