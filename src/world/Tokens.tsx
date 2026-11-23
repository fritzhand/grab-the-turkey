/**
 * Turkey tokens: gold coins with a turkey on them, lying about the place (a point each, five at all times). They
 * hover and turn, with a ring on the floor under them, so they can be seen from overhead on the TV. Each part of the
 * coin (the dark rim, the gold, the face, the ring) is one instanced mesh, so they cost four draws however many.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { game } from '../game/store';
import { getScale } from '../game/tuning';
import { INK } from './paint';

const CAP = 32;

/** The turkey on the coin: a fan of tail feathers, a body, a head. */
function emblem(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f2c14e';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#b8862b';
  g.lineWidth = 7;
  g.beginPath();
  g.arc(64, 64, 55, 0, Math.PI * 2);
  g.stroke();
  // the tail
  ['#7a2e12', '#c2410c', '#e8892b', '#c2410c', '#7a2e12'].forEach((col, i) => {
    const a = -Math.PI / 2 + (i - 2) * 0.46;
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(64, 76);
    g.arc(64, 76, 46, a - 0.26, a + 0.26);
    g.closePath();
    g.fill();
  });
  // body, head, beak, wattle
  g.fillStyle = '#6b3f22';
  g.beginPath();
  g.ellipse(64, 80, 21, 19, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(78, 58, 9, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#e8b53c';
  g.beginPath();
  g.moveTo(85, 57);
  g.lineTo(94, 60);
  g.lineTo(85, 63);
  g.fill();
  g.fillStyle = '#d63c2f';
  g.beginPath();
  g.arc(84, 66, 3.5, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const dummy = new THREE.Object3D();

export function Tokens() {
  const rig = useMemo(() => {
    const rimGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 24).scale(1.16, 1.5, 1.16);
    const bodyGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 24);
    const faceGeo = new THREE.CircleGeometry(0.185, 24).rotateX(-Math.PI / 2).translate(0, 0.0265, 0);
    const ringGeo = new THREE.RingGeometry(0.3, 0.37, 32).rotateX(-Math.PI / 2);
    const rimMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
    const bodyMat = new THREE.MeshBasicMaterial({ color: '#d9a233' });
    const faceMat = new THREE.MeshBasicMaterial({ map: emblem() });
    const ringMat = new THREE.MeshBasicMaterial({ color: '#e8b53c', transparent: true, opacity: 0.8, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const make = (geo: THREE.BufferGeometry, mat: THREE.Material, order = 0) => {
      const m = new THREE.InstancedMesh(geo, mat, CAP);
      m.frustumCulled = false;
      m.renderOrder = order;
      m.count = 0;
      return m;
    };
    const rim = make(rimGeo, rimMat, 3);
    const body = make(bodyGeo, bodyMat, 3);
    const face = make(faceGeo, faceMat, 3);
    const ring = make(ringGeo, ringMat, 2);
    const group = new THREE.Group();
    group.add(rim, body, face, ring);
    return { group, rim, body, face, ring, geos: [rimGeo, bodyGeo, faceGeo, ringGeo], mats: [rimMat, bodyMat, faceMat, ringMat] };
  }, []);

  /** Places every token, hovering and turning, sized to the cast. */
  const layout = useMemo(
    () => (t: number) => {
      const tokens = game.snap?.phase === 'play' ? game.snap.tokens ?? [] : [];
      const n = Math.min(tokens.length, CAP);
      const k = getScale() / 0.74;
      for (let i = 0; i < n; i++) {
        const tk = tokens[i];
        dummy.position.set(tk.p[0], (0.5 + Math.sin(t * 2.4 + tk.id) * 0.05) * k, tk.p[1]);
        dummy.rotation.set(0, t * 1.6 + tk.id, 0);
        dummy.scale.setScalar(k);
        dummy.updateMatrix();
        rig.rim.setMatrixAt(i, dummy.matrix);
        rig.body.setMatrixAt(i, dummy.matrix);
        rig.face.setMatrixAt(i, dummy.matrix);
        dummy.position.set(tk.p[0], 0.03, tk.p[1]);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(k * (1 + Math.sin(t * 4 + tk.id) * 0.1));
        dummy.updateMatrix();
        rig.ring.setMatrixAt(i, dummy.matrix);
      }
      for (const m of [rig.rim, rig.body, rig.face, rig.ring]) {
        m.count = n;
        m.instanceMatrix.needsUpdate = true;
      }
    },
    [rig],
  );

  useEffect(
    () => () => {
      rig.geos.forEach((g) => g.dispose());
      rig.mats.forEach((m) => m.dispose());
    },
    [rig],
  );

  useFrame((state) => layout(state.clock.elapsedTime));

  return <primitive object={rig.group} />;
}
