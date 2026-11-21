/**
 * The camera follows this phone's player from behind and above, high enough to see the chase.
 * Drag the room to turn around and tilt, the wheel or a pinch to come closer, Q and E to turn. It
 * never passes through walls: when one stands between it and the player, it comes in front of it.
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { blocked } from '../env';
import { game } from '../game/store';
import { T } from '../game/tuning';

const PITCH: [number, number] = [0.12, 1.3];
const ZOOM: [number, number] = [3, 22];
const HELD = ['KeyQ', 'KeyE', 'Equal', 'Minus'];

function zoomBy(k: number) {
  game.cam.dist = THREE.MathUtils.clamp(game.cam.dist * k, ZOOM[0], ZOOM[1]);
}

const look = new THREE.Vector3();
const goal = new THREE.Vector3();
const probe = new THREE.Vector3();

export function CameraRig() {
  const { camera, gl, size } = useThree();
  const held = useRef(new Set<string>());
  const cur = useRef({ look: new THREE.Vector3(0, 1, 0), dist: game.cam.dist, first: true });

  useEffect(() => {
    const el = gl.domElement;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    const down = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const move = (e: PointerEvent) => {
      const d = pointers.get(e.pointerId);
      if (!d) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      d.x = e.clientX;
      d.y = e.clientY;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const now = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0 && now > 0) zoomBy(pinch / now);
        pinch = now;
        return;
      }
      game.cam.yaw -= dx * 0.0048;
      game.cam.pitch = THREE.MathUtils.clamp(game.cam.pitch + dy * 0.0032, PITCH[0], PITCH[1]);
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = 0;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomBy(Math.exp(dy * (e.ctrlKey ? 0.01 : 0.0015)));
    };
    const kd = (e: KeyboardEvent) => {
      if (!HELD.includes(e.code) || (e.target as HTMLElement)?.closest?.('input, textarea, select')) return;
      e.preventDefault();
      held.current.add(e.code);
    };
    const ku = (e: KeyboardEvent) => held.current.delete(e.code);
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, [gl]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const h = held.current;
    if (h.has('KeyQ')) game.cam.yaw += 1.6 * dt;
    if (h.has('KeyE')) game.cam.yaw -= 1.6 * dt;
    if (h.has('Equal')) zoomBy(Math.exp(-1.2 * dt));
    if (h.has('Minus')) zoomBy(Math.exp(1.2 * dt));

    // a tall screen gets a wider lens, so a phone held upright still sees the room around you
    const cam = camera as THREE.PerspectiveCamera;
    const fov = THREE.MathUtils.clamp(42 / Math.sqrt(Math.min(1, size.width / size.height)), 42, 64);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }

    const c = cur.current;
    const { yaw, pitch } = game.cam;
    look.copy(game.me.pos).setY(T.camLookY);
    c.look.lerp(look, c.first ? 1 : 1 - Math.exp(-dt * 8));

    const dir = probe.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    let dist = game.cam.dist;
    for (let d = 0.6; d <= game.cam.dist; d += 0.25) {
      goal.copy(c.look).addScaledVector(dir, d);
      if (blocked(game.env, goal, 0.25)) {
        dist = Math.max(0.6, d - 0.3);
        break;
      }
    }
    c.dist = c.first ? dist : dist < c.dist ? dist : THREE.MathUtils.lerp(c.dist, dist, 1 - Math.exp(-dt * 4));
    goal.copy(c.look).addScaledVector(dir, c.dist);
    goal.y = Math.max(goal.y, 0.3);
    camera.position.copy(goal);
    camera.lookAt(c.look);
    c.first = false;
  });
  return null;
}
