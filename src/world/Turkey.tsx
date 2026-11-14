/**
 * The turkey: Kenney's roast turkey (CC0). Held, it rides in front of whoever has it; thrown, it
 * flies on the host's physics, which this phone runs forward between snapshots so the arc is
 * smooth. A ring on the floor under it shows where it is from across the room, and where it will
 * come down.
 */
import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { game } from '../game/store';
import { T } from '../game/tuning';
import { AIR, DOG_ID, F_DIP, HELD } from '../game/types';
import { toonGradient } from './toon';

const SCALE = 1.35;

export function Turkey() {
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const [model, setModel] = useState<THREE.Object3D | null>(null);
  const shown = useRef(new THREE.Vector3());
  const spin = useRef(0);

  useEffect(() => {
    let alive = true;
    new GLTFLoader().load('/models/turkey.glb', (gltf) => {
      if (!alive) return;
      const root = gltf.scene;
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          const old = m.material as THREE.MeshStandardMaterial;
          m.material = new THREE.MeshToonMaterial({ map: old.map, color: old.color, gradientMap: toonGradient() });
          m.castShadow = true;
        }
      });
      root.scale.setScalar(SCALE);
      setModel(root);
      game.ready = true;
    });
    return () => {
      alive = false;
    };
  }, []);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const g = group.current;
    const snap = game.snap;
    if (!g) return;
    g.visible = !!snap;
    if (!snap) return;
    const tk = snap.turkey;
    const goal = new THREE.Vector3(...tk.p);
    let ease = 18;
    const m = game.me;
    if (snap.holder === m.id && m.id) {
      // mine: drawn from my own position, with no lag
      goal.set(m.pos.x + Math.sin(m.facing) * 0.38, m.flags & F_DIP ? 0.62 : 1.0, m.pos.z + Math.cos(m.facing) * 0.38);
      ease = 40;
    } else if (snap.holder && snap.holder !== DOG_ID) {
      const r = game.remotes.get(snap.holder);
      if (r) goal.set(r.shown.x + Math.sin(r.facing) * 0.38, r.pose.m & F_DIP ? 0.62 : 1.0, r.shown.z + Math.cos(r.facing) * 0.38);
      ease = 30;
    } else if (tk.s === AIR) {
      // run the flight forward from the snapshot
      const age = Math.min(0.25, (performance.now() - game.snapAt) / 1000);
      goal.x += tk.v[0] * age;
      goal.z += tk.v[2] * age;
      goal.y = Math.max(0, goal.y + tk.v[1] * age - 0.5 * T.gravity * age * age);
      ease = 30;
    }
    const s = shown.current;
    if (s.distanceTo(goal) > 6) s.copy(goal);
    else s.lerp(goal, 1 - Math.exp(-dt * ease));
    g.position.copy(s);
    // tumbling through the air; level when held or resting
    if (tk.s === AIR && !snap.holder) spin.current += dt * 9;
    else spin.current *= Math.exp(-dt * 10);
    g.rotation.set(spin.current, snap.holder === m.id ? m.facing : g.rotation.y, spin.current * 0.4);
    if (ring.current) {
      ring.current.position.set(s.x, 0.012, s.z);
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 5) * 0.08;
      const lift = Math.min(1, s.y / 3);
      ring.current.scale.setScalar((tk.s === HELD ? 0.9 : 1.15 + lift * 0.8) * pulse);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = tk.s === HELD ? 0.45 : 0.8;
    }
  });

  return (
    <>
      <group ref={group}>{model && <primitive object={model} />}</group>
      <mesh ref={ring} rotation-x={-Math.PI / 2} renderOrder={2}>
        <ringGeometry args={[0.42, 0.55, 40]} />
        <meshBasicMaterial color="#c2410c" transparent opacity={0.8} depthWrite={false} fog={false} />
      </mesh>
    </>
  );
}
