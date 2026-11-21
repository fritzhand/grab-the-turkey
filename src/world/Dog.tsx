/**
 * The dog. Not a player: the host runs it (game/authority.ts) and every phone draws it from the
 * snapshot. The model is Quaternius's low-poly dog (CC0), painted in Blender; see CREDITS.md.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { game } from '../game/store';
import { getScale, T } from '../game/tuning';
import { DOG_CARRY, DOG_REST } from '../game/types';
import { NameTag } from './NameTag';
import { toonGradient } from './toon';

const LENGTH = 1.25; // nose to tail, meters

export function Dog() {
  const group = useRef<THREE.Group>(null);
  const [rig, setRig] = useState<{ root: THREE.Object3D; mixer: THREE.AnimationMixer; idle: THREE.AnimationAction; walk: THREE.AnimationAction } | null>(null);
  const shown = useRef({ x: 0, z: 0, f: 0, init: false });
  const gait = useRef<'idle' | 'walk'>('idle');

  useEffect(() => {
    let alive = true;
    new GLTFLoader().load('/models/dog.glb', (gltf) => {
      if (!alive) return;
      const root = gltf.scene;
      const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
      root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          const m = o as THREE.SkinnedMesh;
          m.material = material;
          m.frustumCulled = false;
        }
      });
      // its head points along +x; turn it to face +z, and size it
      root.rotation.y = -Math.PI / 2;
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const len = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
      root.scale.setScalar(LENGTH / len);
      root.updateMatrixWorld(true);
      const box2 = new THREE.Box3().setFromObject(root);
      root.position.y = -box2.min.y;
      const mixer = new THREE.AnimationMixer(root);
      const clip = (n: string) => gltf.animations.find((a) => a.name.toLowerCase().includes(n)) ?? gltf.animations[0];
      const idle = mixer.clipAction(clip('idle'));
      const walk = mixer.clipAction(clip('walk'));
      idle.play();
      setRig({ root, mixer, idle, walk });
    });
    return () => {
      alive = false;
    };
  }, []);

  const tagColor = useMemo(() => '#c98a4a', []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    group.current?.scale.setScalar(getScale());
    const g = group.current;
    const snap = game.snap;
    if (!g) return;
    g.visible = !!snap;
    if (!snap) return;
    const d = snap.dog;
    const age = Math.min(0.15, (performance.now() - game.snapAt) / 1000);
    const tx = d.p[0] + d.v[0] * age;
    const tz = d.p[1] + d.v[1] * age;
    const s = shown.current;
    if (!s.init || Math.hypot(tx - s.x, tz - s.z) > 4) Object.assign(s, { x: tx, z: tz, f: d.f, init: true });
    const k = 1 - Math.exp(-dt * 12);
    s.x += (tx - s.x) * k;
    s.z += (tz - s.z) * k;
    let df = d.f - s.f;
    while (df > Math.PI) df -= Math.PI * 2;
    while (df < -Math.PI) df += Math.PI * 2;
    s.f += df * k;
    g.position.set(s.x, 0, s.z);
    g.rotation.y = s.f;
    if (!rig) return;
    const speed = Math.hypot(d.v[0], d.v[1]);
    const want = speed > 0.5 ? 'walk' : 'idle';
    if (want !== gait.current) {
      rig[want].reset().fadeIn(0.2).play();
      rig[gait.current].fadeOut(0.2);
      gait.current = want;
    }
    // the walk clip, sped up, is a gallop
    rig.walk.timeScale = Math.max(0.8, speed * 0.75);
    // resting, it sits low; carrying, it holds its head up proud
    rig.root.rotation.z = d.mode === DOG_REST ? 0.12 : d.mode === DOG_CARRY ? -0.08 : 0;
    rig.mixer.update(dt);
  });

  return (
    <group ref={group}>
      {rig && <primitive object={rig.root} />}
      <NameTag text={T.dogName} color={tagColor} y={1.25} />
    </group>
  );
}
