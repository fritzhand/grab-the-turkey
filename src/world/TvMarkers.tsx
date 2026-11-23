/**
 * On the big screen, a ring at every player's feet in their color (gold for whoever has the turkey),
 * drawn over the room: it shows through the low walls, the couch and the table, so a pup standing
 * behind one is never lost. With the name tags (which also draw over the room), everyone can be found
 * at a glance.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { fresh, game } from '../game/store';
import { getScale } from '../game/tuning';
import { PLAYER_COLORS } from './palette';

const CAP = 24;
const GOLD = new THREE.Color('#f2b632');
const dummy = new THREE.Object3D();
const color = new THREE.Color();

export function TvMarkers() {
  const rig = useMemo(() => {
    const geo = new THREE.RingGeometry(0.42, 0.56, 40).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
    const mesh = new THREE.InstancedMesh(geo, mat, CAP);
    mesh.frustumCulled = false;
    mesh.renderOrder = 9;
    mesh.count = 0;
    return { mesh, geo, mat };
  }, []);
  useEffect(
    () => () => {
      rig.geo.dispose();
      rig.mat.dispose();
    },
    [rig],
  );

  useFrame((state) => {
    const now = performance.now();
    const k = getScale();
    const holder = game.snap?.holder;
    let n = 0;
    for (const [id, r] of game.remotes) {
      if (n >= CAP || !fresh(r, now)) continue;
      const mine = holder === id;
      dummy.position.set(r.shown.x, 0.03, r.shown.z);
      dummy.scale.setScalar(k * (mine ? 1.25 + Math.sin(state.clock.elapsedTime * 6) * 0.08 : 1));
      dummy.updateMatrix();
      rig.mesh.setMatrixAt(n, dummy.matrix);
      rig.mesh.setColorAt(n, mine ? GOLD : color.set(PLAYER_COLORS[r.pose.c % PLAYER_COLORS.length]));
      n++;
    }
    rig.mesh.count = n;
    rig.mesh.instanceMatrix.needsUpdate = true;
    if (rig.mesh.instanceColor) rig.mesh.instanceColor.needsUpdate = true;
  });

  return <primitive object={rig.mesh} />;
}
