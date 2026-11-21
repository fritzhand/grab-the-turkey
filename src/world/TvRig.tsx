/**
 * The big screen's camera: the whole place from above, tilted a little so people read as people,
 * with the top of the screen toward -z (the same "up" the phones' sticks use in the controller).
 *
 * A place small enough to read whole (a room, a house) is shown whole, and the camera stays still.
 * A bigger one is followed: the frame holds everyone in play, the turkey and the dog, with room
 * around them, never closer than a minimum nor wider than the place, and drifts with the chase. Its target is copied to game.me.pos, so the contact shadows
 * (which follow "me") follow the action on a screen that has no player of its own.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { extentOf } from '../env';
import { fresh, game } from '../game/store';
import { getScale } from '../game/tuning';

/** Tilt from straight down, radians: enough to see faces and the sides of furniture. */
const TILT = 0.5;
const look = new THREE.Vector3();

export function TvRig() {
  const { camera, size } = useThree();
  const cur = useRef({ x: 0, z: 0, hx: 0, hz: 0, first: true });

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.25);
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    const env = game.env;
    const ext = extentOf(env);

    // what is worth showing: every fresh player, the turkey, the dog
    const now = performance.now();
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    const add = (x: number, z: number) => {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    };
    for (const r of game.remotes.values()) if (fresh(r, now)) add(r.shown.x, r.shown.z);
    const s = game.snap;
    if (s) {
      add(s.turkey.p[0], s.turkey.p[2]);
      add(s.dog.p[0], s.dog.p[1]);
    }
    if (minX === Infinity) add(0, 0);

    const k = getScale();
    let hx: number;
    let hz: number;
    let cx: number;
    let cz: number;
    if (ext.hx <= 13 * k && ext.hz <= 10 * k) {
      // small enough to read whole: show the whole place, still
      hx = ext.hx + 0.6;
      hz = ext.hz + 0.6;
      cx = 0;
      cz = 0;
    } else {
      // a big place: follow the chase, never wider than the place itself
      const pad = 3.2 * k;
      const minHalf = 6 * k;
      hx = Math.min(Math.max(minHalf, (maxX - minX) / 2 + pad), ext.hx + 1);
      hz = Math.min(Math.max(minHalf * 0.6, (maxZ - minZ) / 2 + pad), ext.hz + 1);
      cx = THREE.MathUtils.clamp((minX + maxX) / 2, -ext.hx + hx - 1, ext.hx - hx + 1);
      cz = THREE.MathUtils.clamp((minZ + maxZ) / 2, -ext.hz + hz - 1, ext.hz - hz + 1);
      if (!isFinite(cx)) cx = 0;
      if (!isFinite(cz)) cz = 0;
    }

    const c = cur.current;
    const e = c.first ? 1 : 1 - Math.exp(-dt * 1.2); // slow and steady: a TV should not swim
    c.x += (cx - c.x) * e;
    c.z += (cz - c.z) * e;
    c.hx += (hx - c.hx) * e;
    c.hz += (hz - c.hz) * e;
    c.first = false;

    // the distance that fits both half-widths in view
    const fov = 38;
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    const tan = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const fitZ = (c.hz * Math.cos(TILT)) / tan + c.hz * Math.sin(TILT);
    const fitX = c.hx / (tan * aspect);
    // a margin all round, so the leaderboard and the join card do not sit on anyone
    const dist = Math.max(fitZ, fitX) * 1.16;

    look.set(c.x, 0, c.z);
    camera.position.set(c.x, Math.cos(TILT) * dist, c.z + Math.sin(TILT) * dist);
    camera.lookAt(look);
    game.me.pos.set(c.x, 0, c.z);
  });
  return null;
}
