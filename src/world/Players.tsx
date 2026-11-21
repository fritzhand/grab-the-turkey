/**
 * Everyone's figures: this phone's own player, and every other player at their last pose. The place
 * decides who they are: the white room's walkers, or child-size pups (env.cast).
 */
import { useSyncExternalStore } from 'react';
import { castOf } from '../env';
import { Figure } from './Figure';
import { Pup, type FigureState } from './Pup';
import { fresh, game, getVersion, iHold, subscribe } from '../game/store';

function readMe(out: FigureState) {
  const m = game.me;
  out.x = m.pos.x;
  out.z = m.pos.z;
  out.facing = m.facing;
  out.speed = m.speed;
  out.flags = m.flags;
  out.visible = true;
  out.holding = iHold();
}

function dampAngle(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

/** Reads a remote player: their pose, run forward by its age, eased so it never jumps. */
function reader(id: string) {
  let last = performance.now();
  return (out: FigureState) => {
    const r = game.remotes.get(id);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!r) {
      out.visible = false;
      return;
    }
    const age = Math.min(0.2, (now - r.at) / 1000);
    const { p, v } = r.pose;
    const k = 1 - Math.exp(-dt * 14);
    const tx = p[0] + v[0] * age;
    const tz = p[1] + v[1] * age;
    // far off (a respawn), jump; otherwise ease
    if (Math.hypot(tx - r.shown.x, tz - r.shown.z) > 4) r.shown.set(tx, 0, tz);
    else {
      r.shown.x += (tx - r.shown.x) * k;
      r.shown.z += (tz - r.shown.z) * k;
    }
    r.facing = dampAngle(r.facing, r.pose.f, k);
    out.x = r.shown.x;
    out.z = r.shown.z;
    out.facing = r.facing;
    out.speed = Math.hypot(v[0], v[1]);
    out.flags = r.pose.m;
    out.holding = game.snap?.holder === id;
    out.visible = fresh(r, now);
  };
}

const readers = new Map<string, (out: FigureState) => void>();
function readerFor(id: string) {
  let r = readers.get(id);
  if (!r) readers.set(id, (r = reader(id)));
  return r;
}

export function Players() {
  useSyncExternalStore(subscribe, getVersion);
  const others = [...game.remotes.entries()];
  const Who = castOf(game.env) === 'pups' ? Pup : Figure;
  const cast = castOf(game.env);
  return (
    <>
      {game.me.id && !game.tv && <Who key={`me:${cast}`} me color={game.me.color} name={game.me.name} read={readMe} />}
      {others.map(([id, r]) => (
        <Who key={`${id}:${r.pose.c}:${r.pose.n}:${cast}`} color={r.pose.c} name={r.pose.n} read={readerFor(id)} />
      ))}
    </>
  );
}
