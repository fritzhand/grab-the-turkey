/**
 * A player's figure: the white room's painterly walker, in the player's shirt color. It runs when
 * it moves, leaps (the air clip) when it dodges, crouches when it dips, and carries its name over
 * its head.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { F_DIP, F_DODGE, F_WINDUP } from '../game/types';
import { PLAYER_COLORS } from './palette';
import { rampMaterial } from './rampMaterial';
import { NameTag } from './NameTag';
import { loadWalker, type WalkerClips } from './walkerModel';

const HEIGHT = 1.78; // meters
/** The run clip covers about 3.4 m per cycle (the figure's own stride). */
const STRIDE = 3.4;

export interface FigureState {
  x: number;
  z: number;
  facing: number;
  speed: number;
  flags: number;
  visible: boolean;
  holding: boolean;
}

type Anim = {
  mixer: THREE.AnimationMixer;
  idle: THREE.AnimationAction;
  run: THREE.AnimationAction;
  air: THREE.AnimationAction;
  current: 'idle' | 'run' | 'air';
};

export function Figure({ color, name, read, me = false }: { color: number; name: string; read: (out: FigureState) => void; me?: boolean }) {
  const holder = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const [model, setModel] = useState<{ mesh: THREE.SkinnedMesh; clips: WalkerClips } | null>(null);
  const shirt = PLAYER_COLORS[color % PLAYER_COLORS.length];
  const material = useMemo(() => rampMaterial({ colorInfo: true, skin: color % 4, color: shirt }), [shirt, color]);
  const anim = useRef<Anim | null>(null);
  const st = useRef<FigureState>({ x: 0, z: 0, facing: 0, speed: 0, flags: 0, visible: true, holding: false });
  const crouch = useRef(1);

  useEffect(() => {
    let alive = true;
    loadWalker(material).then((m) => {
      if (!alive) return;
      m.mesh.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(m.mesh);
      const h = box.max.y - box.min.y;
      if (h > 0) m.mesh.scale.setScalar(HEIGHT / h);
      const mixer = new THREE.AnimationMixer(m.mesh);
      const idle = mixer.clipAction(m.clips.idle);
      const run = mixer.clipAction(m.clips.run);
      const air = mixer.clipAction(m.clips.air);
      idle.play();
      anim.current = { mixer, idle, run, air, current: 'idle' };
      setModel(m);
    });
    return () => {
      alive = false;
      material.dispose();
    };
  }, [material]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const g = holder.current;
    if (!g) return;
    const s = st.current;
    read(s);
    g.visible = s.visible;
    g.position.set(s.x, 0, s.z);
    g.rotation.y = s.facing;
    // a dip crouches the figure; a wind-up leans it back
    const goal = s.flags & F_DIP ? 0.6 : 1;
    crouch.current += (goal - crouch.current) * (1 - Math.exp(-dt * 22));
    if (body.current) {
      body.current.scale.set(1 + (1 - crouch.current) * 0.35, crouch.current, 1 + (1 - crouch.current) * 0.2);
      const lean = s.flags & F_WINDUP ? -0.22 : s.flags & F_DIP ? 0.3 : Math.min(0.18, s.speed * 0.022);
      body.current.rotation.x += (lean - body.current.rotation.x) * (1 - Math.exp(-dt * 12));
    }
    const an = anim.current;
    if (!an) return;
    const want: Anim['current'] = s.flags & F_DODGE ? 'air' : s.speed > 0.4 ? 'run' : 'idle';
    if (want !== an.current) {
      const next = an[want];
      next.reset().fadeIn(want === 'air' ? 0.06 : 0.18).play();
      an[an.current].fadeOut(want === 'air' ? 0.06 : 0.18);
      an.current = want;
    }
    if (an.current === 'run') an.run.timeScale = Math.max(0.5, s.speed / (STRIDE / an.run.getClip().duration));
    an.mixer.update(dt);
  });

  return (
    <group ref={holder}>
      <group ref={body}>{model && <primitive object={model.mesh} />}</group>
      {!me && <NameTag text={name} color={shirt} y={2.15} />}
    </group>
  );
}
