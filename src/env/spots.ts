/**
 * Spots on the floor where something can turn up (a turkey token, the leprechaun, its trap): open floor that
 * can be walked to. A grid over the place, each cell kept if a body fits there, then only the cells reachable
 * from the spawns, so nothing lands in a closet with no door or outside a fence nobody can cross.
 */
import { blocked, extentOf, keepIn } from './index';
import type { Environment } from './types';

const CELL = 0.25;
/** A body with a little to spare: a spot is never squeezed against a wall. */
const ROOM = 0.42;

export type Spot = { x: number; z: number };

const cache = new WeakMap<Environment, Spot[]>();

export function spotsOf(env: Environment): Spot[] {
  const hit = cache.get(env);
  if (hit) return hit;
  const { hx, hz } = extentOf(env);
  const nx = Math.ceil((hx * 2) / CELL);
  const nz = Math.ceil((hz * 2) / CELL);
  const at = (i: number, j: number) => ({ x: -hx + (i + 0.5) * CELL, z: -hz + (j + 0.5) * CELL });
  const ok = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const p = at(i, j);
      const q = { ...p };
      if (keepIn(env.bounds, q, ROOM)) continue;
      if (blocked(env, { x: p.x, y: 0.05, z: p.z }, ROOM)) continue;
      ok[j * nx + i] = 1;
    }
  // flood out from the spawns
  const seen = new Uint8Array(nx * nz);
  const queue: number[] = [];
  for (const [x, z] of env.spawns) {
    const i = Math.floor((x + hx) / CELL);
    const j = Math.floor((z + hz) / CELL);
    // the spawn itself, or the nearest open cell to it
    let best = -1;
    let bestD = Infinity;
    for (let dj = -4; dj <= 4; dj++)
      for (let di = -4; di <= 4; di++) {
        const a = i + di;
        const b = j + dj;
        if (a < 0 || b < 0 || a >= nx || b >= nz || !ok[b * nx + a]) continue;
        const d = di * di + dj * dj;
        if (d < bestD) (bestD = d), (best = b * nx + a);
      }
    if (best >= 0 && !seen[best]) (seen[best] = 1), queue.push(best);
  }
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q];
    const i = c % nx;
    const j = (c - i) / nx;
    for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
      if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const n = b * nx + a;
      if (ok[n] && !seen[n]) (seen[n] = 1), queue.push(n);
    }
  }
  const spots = queue.map((c) => at(c % nx, Math.floor(c / nx)));
  cache.set(env, spots);
  return spots;
}

/**
 * A spot: at random, at least `gap` from everything in `avoid`; or, with `near`, between min and max from a point.
 * Falls back to any spot when the place is too small to keep the gap (never with `near`).
 */
export function pickSpot(env: Environment, o: { avoid?: Spot[]; gap?: number; near?: Spot & { min: number; max: number } } = {}): Spot | null {
  const list = spotsOf(env);
  if (!list.length) return null;
  let fallback: Spot | null = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    const s = list[Math.floor(Math.random() * list.length)];
    fallback = s;
    if (o.avoid?.some((a) => Math.hypot(a.x - s.x, a.z - s.z) < (o.gap ?? 6))) continue;
    if (o.near) {
      const d = Math.hypot(o.near.x - s.x, o.near.z - s.z);
      if (d < o.near.min || d > o.near.max) continue;
    }
    return s;
  }
  return o.near ? null : fallback;
}
