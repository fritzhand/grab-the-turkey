/**
 * The big screen, split: one pane per player, each with its own camera following that player from
 * above and behind (the same "up" as the controllers' sticks). For places too big, or with too many
 * levels, to show everyone on one overhead shot: when some players are upstairs and some are out in the
 * yard, one camera cannot frame them all, so each player gets a window onto where they are.
 *
 * Turned on by the place (env.screen = 'split') or by ?split on the TV's address. It takes over the
 * render loop (useFrame priority 1), so the scene's post effects are left out in split mode.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { fresh, game } from '../game/store';
import { getScale } from '../game/tuning';

/** The players shown, in a stable order: everyone fresh, sorted by id. */
export function splitPlayers(now = performance.now()): string[] {
  return [...game.remotes.entries()]
    .filter(([, r]) => fresh(r, now))
    .map(([id]) => id)
    .sort()
    .slice(0, 9);
}

/** The grid for n panes: columns and rows, filled left to right, top to bottom. */
export function splitGrid(n: number): { cols: number; rows: number } {
  if (n <= 1) return { cols: 1, rows: 1 };
  if (n === 2) return { cols: 2, rows: 1 };
  if (n <= 4) return { cols: 2, rows: 2 };
  if (n <= 6) return { cols: 3, rows: 2 };
  return { cols: 3, rows: 3 };
}

/** Pane i of n, as fractions of the screen from the top left: x, y, width, height. */
export function splitCell(i: number, n: number): { x: number; y: number; w: number; h: number } {
  const { cols, rows } = splitGrid(n);
  return { x: (i % cols) / cols, y: Math.floor(i / cols) / rows, w: 1 / cols, h: 1 / rows };
}

/** Steep, so a low wall between the camera and its player hides little. */
const PITCH = 1.22;

export function SplitRig() {
  const { gl, scene, camera, size } = useThree();
  const cams = useMemo(() => new Map<string, { cam: THREE.PerspectiveCamera; look: THREE.Vector3 }>(), []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const ids = splitPlayers();
    const w = size.width;
    const h = size.height;
    gl.setScissorTest(true);
    gl.autoClear = false;
    gl.setViewport(0, 0, w, h);
    gl.setScissor(0, 0, w, h);
    gl.clear();

    if (!ids.length) {
      // nobody yet: the whole place from the shared camera (TvRig keeps it framed)
      gl.setScissorTest(false);
      gl.render(scene, camera);
      gl.autoClear = true;
      return;
    }

    const k = getScale();
    const dist = 8 * k;
    for (let i = 0; i < ids.length; i++) {
      const r = game.remotes.get(ids[i])!;
      let c = cams.get(ids[i]);
      if (!c) {
        c = { cam: new THREE.PerspectiveCamera(46, 1, 0.1, 220), look: r.shown.clone() };
        cams.set(ids[i], c);
      }
      const cell = splitCell(i, ids.length);
      const px = Math.round(cell.x * w);
      const pw = Math.round(cell.w * w);
      const ph = Math.round(cell.h * h);
      const py = Math.round(h - (cell.y * h + ph)); // WebGL counts from the bottom
      c.look.lerp(r.shown, 1 - Math.exp(-dt * 6));
      c.look.y = 0.6 * k;
      c.cam.aspect = pw / Math.max(1, ph);
      c.cam.updateProjectionMatrix();
      c.cam.position.set(c.look.x, c.look.y + Math.sin(PITCH) * dist, c.look.z + Math.cos(PITCH) * dist);
      c.cam.lookAt(c.look);
      // the contact shadows follow "me": in a pane, that is this player
      game.me.pos.set(r.shown.x, 0, r.shown.z);
      gl.setViewport(px + 1, py + 1, pw - 2, ph - 2);
      gl.setScissor(px + 1, py + 1, pw - 2, ph - 2);
      gl.render(scene, c.cam);
    }
    for (const id of cams.keys()) if (!ids.includes(id)) cams.delete(id);
    gl.setScissorTest(false);
    gl.setViewport(0, 0, w, h);
    gl.autoClear = true;
  }, 1);

  return null;
}
