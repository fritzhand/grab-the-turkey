/**
 * The leprechaun and its trap. The leprechaun is small (knee-high to a pup), in a green coat and hat with an
 * orange beard, and runs about the floor. The trap is a little wooden cage: it lies somewhere
 * with a green ring and an arrow bobbing over it, goes along behind whoever picks it up, and comes down over
 * the leprechaun when they catch it.
 */
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { game } from '../game/store';
import { getScale, T } from '../game/tuning';
import { applyPaint } from './paintScene';

const mat = (color: string) => new THREE.MeshStandardMaterial({ color });
function part(geo: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0, name = ''): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(x, y, z);
  if (name) m.name = name;
  return m;
}

interface LepRig {
  root: THREE.Group;
  body: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  bootL: THREE.Mesh;
  bootR: THREE.Mesh;
}

function buildLeprechaun(): LepRig {
  const GREEN = '#2f8f46';
  const root = new THREE.Group();
  root.name = 'o_leprechaun';
  root.scale.setScalar(1.2);
  const body = new THREE.Group();
  root.add(body);
  body.add(part(new THREE.CylinderGeometry(0.075, 0.12, 0.26, 14), GREEN, 0, 0.27, 0)); // the coat
  body.add(part(new THREE.CylinderGeometry(0.123, 0.123, 0.035, 14), '#2a2a2a', 0, 0.19, 0)); // the belt
  body.add(part(new THREE.BoxGeometry(0.06, 0.05, 0.02), '#f2c14e', 0, 0.19, 0.12)); // the buckle
  body.add(part(new THREE.SphereGeometry(0.085, 14, 12), '#f0c9a0', 0, 0.47, 0)); // the head
  const beard = part(new THREE.SphereGeometry(0.075, 12, 10), '#e0762a', 0, 0.42, 0.045);
  beard.scale.set(1.15, 1.0, 0.8);
  body.add(beard);
  body.add(part(new THREE.SphereGeometry(0.013, 8, 6), '#2a2a2a', 0.032, 0.49, 0.078)); // eyes
  body.add(part(new THREE.SphereGeometry(0.013, 8, 6), '#2a2a2a', -0.032, 0.49, 0.078));
  body.add(part(new THREE.CylinderGeometry(0.15, 0.15, 0.018, 18), GREEN, 0, 0.545, 0)); // the hat: brim
  body.add(part(new THREE.CylinderGeometry(0.085, 0.095, 0.14, 16), GREEN, 0, 0.62, 0)); // crown
  body.add(part(new THREE.CylinderGeometry(0.097, 0.097, 0.03, 16), '#2a2a2a', 0, 0.575, 0)); // band
  body.add(part(new THREE.BoxGeometry(0.05, 0.04, 0.02), '#f2c14e', 0, 0.575, 0.095)); // buckle
  const arm = (side: number) => {
    const g = new THREE.Group();
    g.position.set(side * 0.115, 0.34, 0);
    g.add(part(new THREE.CylinderGeometry(0.028, 0.03, 0.15, 8), GREEN, 0, -0.06, 0));
    g.add(part(new THREE.SphereGeometry(0.03, 8, 6), '#f0c9a0', 0, -0.14, 0));
    body.add(g);
    return g;
  };
  const armL = arm(-1);
  const armR = arm(1);
  const bootL = part(new THREE.BoxGeometry(0.08, 0.06, 0.12), '#3a2a1e', -0.05, 0.03, 0.02);
  const bootR = part(new THREE.BoxGeometry(0.08, 0.06, 0.12), '#3a2a1e', 0.05, 0.03, 0.02);
  root.add(bootL, bootR);
  applyPaint(root);
  return { root, body, armL, armR, bootL, bootR };
}

/** A little wooden cage with a gold coin inside, for bait. */
function buildTrap(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'o_trap';
  const wood = '#8a5a34';
  const light = '#b8814c';
  root.add(part(new THREE.BoxGeometry(0.46, 0.05, 0.46), wood, 0, 0.025, 0));
  for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) root.add(part(new THREE.BoxGeometry(0.045, 0.4, 0.045), light, x, 0.22, z));
  root.add(part(new THREE.BoxGeometry(0.46, 0.04, 0.46), wood, 0, 0.42, 0));
  for (const x of [-0.12, 0, 0.12]) root.add(part(new THREE.BoxGeometry(0.035, 0.03, 0.46), light, x, 0.455, 0));
  for (const z of [-0.12, 0, 0.12]) root.add(part(new THREE.BoxGeometry(0.46, 0.03, 0.035), light, 0, 0.46, z));
  root.add(part(new THREE.CylinderGeometry(0.08, 0.08, 0.025, 16), '#f2c14e', 0, 0.065, 0));
  applyPaint(root);
  return root;
}

const ring = (color: string, inner: number, outer: number) => ({
  geo: new THREE.RingGeometry(inner, outer, 36).rotateX(-Math.PI / 2),
  mat: new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
});

export function Leprechaun() {
  const rig = useMemo(() => {
    const lep = buildLeprechaun();
    const trap = buildTrap();
    const lepRing = ring('#e8b53c', 0.3, 0.38);
    const trapRing = ring('#3fa34d', 0.5, 0.6);
    const arrowGeo = new THREE.ConeGeometry(0.16, 0.3, 4).rotateX(Math.PI); // points down
    const arrowMat = new THREE.MeshBasicMaterial({ color: '#3fa34d', fog: false });
    const lepHolder = new THREE.Group();
    lepHolder.add(lep.root);
    const lr = new THREE.Mesh(lepRing.geo, lepRing.mat);
    lr.renderOrder = 2;
    lepHolder.add(lr);
    const trapHolder = new THREE.Group();
    trapHolder.add(trap);
    const tr = new THREE.Mesh(trapRing.geo, trapRing.mat);
    tr.renderOrder = 2;
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.renderOrder = 3;
    trapHolder.add(tr, arrow);
    const group = new THREE.Group();
    group.add(lepHolder, trapHolder);
    lepHolder.visible = trapHolder.visible = false;
    return { group, lep, lepHolder, lr, trap, trapHolder, tr, arrow };
  }, []);

  const shown = useRef({ x: 0, z: 0, f: 0, init: false });
  const phase = useRef(0);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;
    const snap = game.snap;
    const playing = snap?.phase === 'play';
    const L = playing ? snap.lep : null;
    const trap = playing ? snap.trap : null;
    const s = shown.current;
    // everything is sized to the cast (it was made among the pups)
    const size = getScale() / 0.74;
    rig.group.scale.setScalar(size);

    // --- the leprechaun
    if (L) {
      const age = Math.min(0.15, (performance.now() - game.snapAt) / 1000);
      const tx = L.p[0] + L.v[0] * age;
      const tz = L.p[1] + L.v[1] * age;
      // a hop is a long way: no gliding there
      if (!s.init || Math.hypot(tx - s.x, tz - s.z) > 2.5) Object.assign(s, { x: tx, z: tz, f: L.f, init: true });
      const k = 1 - Math.exp(-dt * 14);
      s.x += (tx - s.x) * k;
      s.z += (tz - s.z) * k;
      let df = L.f - s.f;
      while (df > Math.PI) df -= Math.PI * 2;
      while (df < -Math.PI) df += Math.PI * 2;
      s.f += df * k;
      const speed = Math.hypot(L.v[0], L.v[1]);
      phase.current += dt * (4 + speed * 2.2);
      const sw = Math.sin(phase.current);
      const run = Math.min(1, speed / 3);
      rig.lepHolder.position.set(s.x / size, 0, s.z / size);
      rig.lep.root.rotation.y = s.f;
      rig.lep.body.position.y = Math.abs(sw) * 0.045 * run;
      rig.lep.armL.rotation.x = sw * 0.9 * run;
      rig.lep.armR.rotation.x = -sw * 0.9 * run;
      rig.lep.bootL.position.z = 0.02 + sw * 0.05 * run;
      rig.lep.bootR.position.z = 0.02 - sw * 0.05 * run;
      // it laughs when it is trapped, and leaps
      if (L.by && L.how === 'hands') {
        // caught by hand: it laughs, leaps and vanishes in a puff
        const k = Math.max(0, L.t / (T.lepHandsSeconds * 1000));
        rig.lep.root.scale.setScalar(Math.max(0.01, k) * 1.2);
        rig.lep.body.position.y = (1 - k) * 0.5;
        rig.lr.scale.setScalar(1 + (1 - k) * 3);
      } else {
        rig.lep.root.scale.setScalar((L.by ? 1 + Math.sin(t * 22) * 0.04 : 1) * 1.2);
        rig.lr.scale.setScalar(1 + Math.sin(t * 5) * 0.12);
      }
      rig.lepHolder.visible = true;
    } else {
      rig.lepHolder.visible = false;
      s.init = false;
    }

    // --- the trap: lying, carried (behind whoever has it), or down over the leprechaun
    if (trap) {
      const by = trap.by;
      let x = trap.p[0];
      let z = trap.p[1];
      let facing = 0;
      let carried = false;
      if (by) {
        const me = by === game.me.id;
        const r = me ? null : game.remotes.get(by);
        if (me) ({ x, z } = game.me.pos), (facing = game.me.facing);
        else if (r) ({ x, z } = r.shown), (facing = r.facing);
        carried = true;
      }
      if (carried) {
        // on their back, like a pack
        rig.trapHolder.position.set((x - Math.sin(facing) * 0.32 * size) / size, 0.38, (z - Math.cos(facing) * 0.32 * size) / size);
        rig.trap.scale.setScalar(0.62);
        rig.trap.rotation.y = facing;
        rig.tr.visible = false;
        rig.arrow.visible = false;
      } else {
        const over = !!L?.by; // down over the leprechaun
        rig.trapHolder.position.set((over ? s.x : x) / size, 0, (over ? s.z : z) / size);
        rig.trap.scale.setScalar(over ? 1.5 : 1);
        rig.trap.rotation.y = 0;
        rig.tr.visible = !over;
        rig.tr.scale.setScalar(1 + Math.sin(t * 4) * 0.1);
        rig.arrow.visible = !over;
        rig.arrow.position.y = 1.0 + Math.sin(t * 3) * 0.1;
      }
      rig.trapHolder.visible = true;
    } else rig.trapHolder.visible = false;
  });

  return <primitive object={rig.group} />;
}
