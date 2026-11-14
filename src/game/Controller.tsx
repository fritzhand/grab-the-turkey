/**
 * Moves this phone's player, every frame. The stick (or W A S D) runs, relative to the camera.
 *
 * The physics: velocity chases the direction you push, but only as fast as your acceleration lets
 * it, so the turkey's weight shows as wide, slow turns. Dodge is a burst you cannot steer; dip
 * ducks you under a grab but slows you to a crawl; the throw winds up while the button is held and
 * flies on release, carrying some of your own speed.
 *
 * Keys: Space grabs (or, holding the turkey, winds up and throws); Shift dodges; C or Ctrl dips.
 */
import { useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { sfx, windup } from '../audio/sound';
import { keepIn, keepOut } from '../env';
import { intent } from './net';
import { fresh, game, iHold, notify } from './store';
import { T } from './tuning';
import { F_DIP, F_DODGE, F_LUNGE, F_WINDUP } from './types';

const MOVE = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

function dampAngle(a: number, b: number, lambda: number, dt: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-lambda * dt));
}

const want = new THREE.Vector3();
let stride = 0;
const side = new THREE.Vector3();

/** Releases the throw: the wind-up sets how hard and how high. */
function release() {
  const m = game.me;
  const k = Math.min(1, Math.max(0, m.windup) / T.windupSeconds);
  m.windup = -1;
  windup(-1);
  if (!iHold()) return;
  sfx.throw(k);
  const speed = T.throwSpeedMin + (T.throwSpeedMax - T.throwSpeedMin) * k;
  const lift = T.throwLiftMin + (T.throwLiftMax - T.throwLiftMin) * k;
  const fx = Math.sin(m.facing);
  const fz = Math.cos(m.facing);
  intent({ k: 'throw', v: [fx * speed + m.vel.x * T.throwCarry, lift, fz * speed + m.vel.z * T.throwCarry] });
}

/** The main button went down: grab when empty-handed, start winding up when holding. */
export function primaryDown(): void {
  game.input.primary = true;
  if (iHold()) game.me.windup = 0;
  else game.input.lunge = true;
}
export function primaryUp(): void {
  game.input.primary = false;
  if (game.me.windup >= 0) release();
}

export function Controller() {
  useEffect(() => {
    const typing = (e: KeyboardEvent) => (e.target as HTMLElement)?.closest?.('input, textarea, select');
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      if (MOVE.includes(e.code)) {
        e.preventDefault();
        game.input.keys.add(e.code);
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) primaryDown();
      } else if (e.code.startsWith('Shift')) {
        if (!e.repeat) game.input.dodge = true;
      } else if (e.code === 'KeyC' || e.code.startsWith('Control')) {
        if (!e.repeat) game.input.dip = true;
      }
    };
    const up = (e: KeyboardEvent) => {
      game.input.keys.delete(e.code);
      if (e.code === 'Space') primaryUp();
    };
    const blur = () => {
      game.input.keys.clear();
      if (game.input.primary) primaryUp();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const m = game.me;
    const inp = game.input;
    const env = game.env;
    const holding = iHold();

    // --- timers
    m.dip = Math.max(0, m.dip - dt);
    m.dipCd = Math.max(0, m.dipCd - dt);
    m.dodge = Math.max(0, m.dodge - dt);
    m.dodgeCd = Math.max(0, m.dodgeCd - dt);
    m.lunge = Math.max(0, m.lunge - dt);
    m.lungeCd = Math.max(0, m.lungeCd - dt);
    m.holding = holding ? m.holding + dt : 0;
    if (m.windup >= 0) {
      if (!holding) {
        m.windup = -1; // it was taken from you mid wind-up
        windup(-1);
      } else {
        m.windup += dt;
        windup(Math.min(1, m.windup / T.windupSeconds));
      }
    }

    // --- what the controls ask for
    const k = inp.keys;
    let ix = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let iz = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    let push = ix || iz ? 1 : 0;
    if (!push && (inp.stick.x || inp.stick.y)) {
      ix = inp.stick.x;
      iz = inp.stick.y;
      push = Math.min(1, Math.hypot(ix, iz));
    }
    const yaw = game.cam.yaw;
    want.set(Math.cos(yaw) * ix + Math.sin(yaw) * iz, 0, -Math.sin(yaw) * ix + Math.cos(yaw) * iz);
    if (want.lengthSq() > 0) want.normalize();

    // --- the moves
    if (inp.dodge) {
      inp.dodge = false;
      if (m.dodgeCd <= 0 && m.dip <= 0) {
        // the way you are pushing, or else a sidestep to your right
        if (want.lengthSq() > 0) side.copy(want);
        else side.set(-Math.cos(m.facing), 0, Math.sin(m.facing));
        m.vel.copy(side).multiplyScalar(holding ? T.holdDodgeSpeed : T.dodgeSpeed);
        m.dodge = T.dodgeSeconds;
        m.dodgeCd = holding ? T.holdDodgeCooldown : T.dodgeCooldown;
        sfx.dodge();
      }
    }
    if (inp.dip) {
      inp.dip = false;
      if (m.dipCd <= 0) {
        m.dip = T.dipSeconds;
        m.dipCd = T.dipCooldown;
        sfx.dip();
      }
    }
    if (inp.lunge) {
      inp.lunge = false;
      if (!holding && m.lungeCd <= 0) {
        m.lunge = T.lungeSeconds;
        m.lungeCd = T.lungeCooldown;
        const fx = Math.sin(m.facing);
        const fz = Math.cos(m.facing);
        m.vel.x += fx * T.lungeBoost;
        m.vel.z += fz * T.lungeBoost;
        intent({ k: 'lunge' });
        sfx.lunge();
      }
    }

    // --- running: velocity chases what you ask for, as fast as your legs (and the turkey) allow
    const tired = Math.min(1, m.holding / T.holdTireSeconds);
    let top = holding ? T.holdSpeed + (T.holdSpeedTired - T.holdSpeed) * tired : T.runSpeed;
    if (m.dip > 0) top *= T.dipSpeedFactor;
    if (m.windup >= 0) top *= 0.75; // planting your feet to throw
    if (m.dodge <= 0) {
      const accel = (push ? (holding ? T.holdAccel : T.accel) : T.brake) * dt;
      want.multiplyScalar(top * push);
      const dx = want.x - m.vel.x;
      const dz = want.z - m.vel.z;
      const d = Math.hypot(dx, dz);
      const s = d > accel ? accel / d : 1;
      m.vel.x += dx * s;
      m.vel.z += dz * s;
    }

    m.pos.addScaledVector(m.vel, dt);
    // bump into things: lose the speed going into them, keep the speed along them
    const hit = keepOut(env, m.pos, T.bodyRadius) ?? keepIn(env.bounds, m.pos, T.bodyRadius);
    if (hit) {
      const into = m.vel.x * hit.x + m.vel.z * hit.z;
      if (into < 0) {
        m.vel.x -= into * hit.x;
        m.vel.z -= into * hit.z;
      }
    }
    // and into each other: a soft shove apart
    const now = performance.now();
    for (const r of game.remotes.values()) {
      if (!fresh(r, now)) continue;
      const dx = m.pos.x - r.shown.x;
      const dz = m.pos.z - r.shown.z;
      const d = Math.hypot(dx, dz);
      const min = T.bodyRadius * 2;
      if (d > 0.001 && d < min) {
        m.pos.x += (dx / d) * (min - d) * 0.5;
        m.pos.z += (dz / d) * (min - d) * 0.5;
      }
    }
    keepIn(env.bounds, m.pos, T.bodyRadius);

    m.speed = Math.hypot(m.vel.x, m.vel.z);
    // footsteps, one every half stride
    stride += m.speed * dt;
    if (m.speed > 1.2 && m.dodge <= 0 && stride > 1.7) {
      stride = 0;
      sfx.step(holding);
    }
    if (m.speed > 0.3 && m.dodge <= 0) m.facing = dampAngle(m.facing, Math.atan2(m.vel.x, m.vel.z), holding ? 9 : 14, dt);

    const flags = (m.dip > 0 ? F_DIP : 0) | (m.dodge > 0 ? F_DODGE : 0) | (m.lunge > 0 ? F_LUNGE : 0) | (m.windup >= 0 ? F_WINDUP : 0);
    if (flags !== m.flags) {
      m.flags = flags;
      notify();
    }
  });
  return null;
}

/** Puts this phone's player at a spawn point (on joining, and when the place changes). */
export function spawn(): void {
  const env = game.env;
  const n = env.spawns.length;
  const i = Math.abs([...game.me.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 0)) % n;
  const [x, z] = env.spawns[i];
  game.me.pos.set(x, 0, z);
  game.me.vel.set(0, 0, 0);
  game.me.facing = Math.atan2(-x, -z);
  game.cam.yaw = game.me.facing + Math.PI;
}
