/**
 * A player: a pup in a jumper. The model is rigid parts on pivots (see blender/pup.py), so everything here
 * is code: the legs and arms swing as it runs, the ears fly back, the tail wags faster when it is happy,
 * it crouches for a dip, tucks for a dodge, and holds the turkey out in front in both arms.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { F_DIP, F_DODGE, F_LUNGE, F_WINDUP } from '../game/types';
import { NameTag } from './NameTag';
import { applyPaint } from './paintScene';
import { PLAYER_COLORS } from './palette';
import { coatFor, PUP_SCALE, TAG_Y } from './pups';

export interface FigureState {
  x: number;
  z: number;
  facing: number;
  speed: number;
  flags: number;
  visible: boolean;
  /** Has the turkey. */
  holding: boolean;
}

let source: Promise<THREE.Group> | null = null;
const loadPup = () => (source ??= new GLTFLoader().loadAsync('/models/pup.glb').then((g) => g.scene));

const NODES = ['Hips', 'Head', 'EarL', 'EarR', 'ArmL', 'ArmR', 'LegL', 'LegR', 'Tail1', 'Tail2', 'Tail3'] as const;
interface Rig {
  root: THREE.Group;
  n: Record<(typeof NODES)[number], THREE.Object3D>;
  hipsY: number;
}

function build(src: THREE.Group, color: number): Rig {
  const root = src.clone(true) as THREE.Group;
  const coat = coatFor(color);
  const paint: Record<string, string> = {
    coat: coat.coat,
    point: coat.point,
    muzzle: coat.muzzle,
    ear: coat.ear,
    foot: coat.foot,
    tail_tip: coat.tail_tip,
    jumper: PLAYER_COLORS[color % PLAYER_COLORS.length],
  };
  applyPaint(root, { recolor: (m) => paint[m] });
  root.scale.setScalar(PUP_SCALE);
  const n = {} as Rig['n'];
  for (const k of NODES) n[k] = root.getObjectByName(k)!;
  return { root, n, hipsY: n.Hips.position.y };
}

const ease = (cur: number, goal: number, k: number) => cur + (goal - cur) * k;

export function Pup({ color, name, read, me = false }: { color: number; name: string; read: (out: FigureState) => void; me?: boolean }) {
  const holder = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const [rig, setRig] = useState<Rig | null>(null);
  const st = useRef<FigureState>({ x: 0, z: 0, facing: 0, speed: 0, flags: 0, visible: true, holding: false });
  const w = useRef({ hold: 0, dip: 0, air: 0, wind: 0, lunge: 0 });
  const phase = useRef(0);
  const seed = useMemo(() => Math.random() * 20, []);
  const jumper = PLAYER_COLORS[color % PLAYER_COLORS.length];

  useEffect(() => {
    let alive = true;
    loadPup().then((src) => alive && setRig(build(src, color)));
    return () => {
      alive = false;
    };
  }, [color]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const g = holder.current;
    if (!g) return;
    const s = st.current;
    read(s);
    g.visible = s.visible;
    g.position.set(s.x, 0, s.z);
    g.rotation.y = s.facing;
    if (!rig || !body.current) return;
    const { n, hipsY } = rig;
    const t = state.clock.elapsedTime + seed;

    // poses ease in and out
    const k = 1 - Math.exp(-dt * 14);
    const p = w.current;
    p.hold = ease(p.hold, s.holding ? 1 : 0, k);
    p.dip = ease(p.dip, s.flags & F_DIP ? 1 : 0, k * 1.5);
    p.air = ease(p.air, s.flags & F_DODGE ? 1 : 0, k * 1.6);
    p.wind = ease(p.wind, s.flags & F_WINDUP ? 1 : 0, k);
    p.lunge = ease(p.lunge, s.flags & F_LUNGE ? 1 : 0, k * 1.6);

    const run = Math.min(1.25, s.speed / 6);
    const idle = 1 - Math.min(1, s.speed / 1.0);
    phase.current += s.speed * dt * 2.3;
    const sw = Math.sin(phase.current);

    // legs: a stride, tucked in the air
    const stride = 0.95 * run * (1 - 0.5 * p.air);
    n.LegL.rotation.x = sw * stride + p.air * 0.9;
    n.LegR.rotation.x = -sw * stride - p.air * 0.5;

    // arms: swing opposite the legs; out in front around the turkey; back to wind up; reaching to lunge
    const swing = -sw * 0.95 * run * (1 - p.hold) * (1 - p.lunge);
    const reach = -1.2 * p.hold - 1.5 * p.lunge + 0.95 * p.wind - 0.5 * p.dip;
    n.ArmL.rotation.x = swing + reach;
    n.ArmR.rotation.x = -swing + reach;
    const out = 0.1 + 1.25 * p.air - 0.42 * p.hold;
    n.ArmL.rotation.z = out;
    n.ArmR.rotation.z = -out;

    // the body: bobs as it runs, leans into it, crouches, leaps
    n.Hips.position.y = hipsY + Math.abs(sw) * 0.05 * run - 0.09 * p.dip + Math.sin(t * 2.2) * 0.006 * idle;
    const lean = Math.min(0.2, s.speed * 0.03) + 0.3 * p.dip + 0.4 * p.lunge - 0.22 * p.wind + 0.45 * p.air;
    body.current.rotation.x = ease(body.current.rotation.x, lean, k);
    body.current.scale.set(1 + 0.13 * p.dip, 1 - 0.36 * p.dip, 1 + 0.1 * p.dip);

    // the head looks about when it is still
    n.Head.rotation.y = Math.sin(t * 0.7) * 0.35 * idle;
    n.Head.rotation.x = -0.08 * run + Math.sin(t * 1.1) * 0.03 * idle - 0.15 * p.wind;

    // the ears fly back as it runs
    const flap = Math.sin(phase.current * 2) * 0.12 * run;
    n.EarL.rotation.x = -0.5 * run + flap + Math.sin(t * 1.3) * 0.04;
    n.EarR.rotation.x = -0.5 * run - flap + Math.sin(t * 1.3 + 1) * 0.04;
    n.EarL.rotation.z = -0.06 - 0.12 * run;
    n.EarR.rotation.z = 0.06 + 0.12 * run;

    // the tail: a wag that gets quicker the faster it goes, streaming up behind it when it runs, down when ducking
    const f = 5.5 + run * 6 + p.hold * 3;
    n.Tail1.rotation.y = Math.sin(t * f) * 0.4;
    n.Tail2.rotation.y = Math.sin(t * f - 0.9) * 0.5;
    n.Tail3.rotation.y = Math.sin(t * f - 1.8) * 0.6;
    n.Tail1.rotation.x = 0.3 * run - 0.45 * p.dip;
  });

  return (
    <group ref={holder}>
      <group ref={body}>{rig && <primitive object={rig.root} />}</group>
      {!me && <NameTag text={name} color={jumper} y={TAG_Y} />}
    </group>
  );
}
