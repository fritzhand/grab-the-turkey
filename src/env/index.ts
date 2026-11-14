/**
 * The environments this build offers. To add yours: copy example-home.ts, describe your home, and
 * add it to this list. The first one is the default.
 */
import type { Bounds, Environment, Piece } from './types';
import { exampleHome } from './example-home';
import { whiteRoom } from './white-room';

export const ENVIRONMENTS: Environment[] = [whiteRoom, exampleHome];

export function getEnvironment(id: string | null | undefined): Environment {
  return ENVIRONMENTS.find((e) => e.id === id) ?? ENVIRONMENTS[0];
}

/** A piece as a collision box: center, half sizes, height, and turn in radians. */
export interface Block {
  x: number;
  z: number;
  hx: number;
  hz: number;
  h: number;
  rot: number;
}

const blockCache = new WeakMap<Environment, Block[]>();
export function blocksOf(env: Environment): Block[] {
  let b = blockCache.get(env);
  if (!b) {
    b = env.pieces.map((p: Piece) => ({ x: p.x, z: p.z, hx: p.w / 2, hz: p.d / 2, h: p.h, rot: ((p.rot ?? 0) * Math.PI) / 180 }));
    blockCache.set(env, b);
  }
  return b;
}

type XZ = { x: number; z: number };

/**
 * Pushes a point on the floor out of every block, grown by r. Returns the push's direction when it
 * moved the point (the normal of the face it was pushed out of), so a bounce can reflect off it.
 * Blocks whose top is at or below `over` are passed over (a turkey flying above a table).
 */
export function keepOut(env: Environment, p: XZ, r: number, over = -Infinity): XZ | null {
  let hit: XZ | null = null;
  for (const b of blocksOf(env)) {
    if (b.h <= over) continue;
    const c = Math.cos(b.rot);
    const s = Math.sin(b.rot);
    const dx = p.x - b.x;
    const dz = p.z - b.z;
    const lx = c * dx - s * dz;
    const lz = s * dx + c * dz;
    const ex = b.hx + r;
    const ez = b.hz + r;
    if (Math.abs(lx) >= ex || Math.abs(lz) >= ez) continue;
    let nx = lx;
    let nz = lz;
    let ux = 0;
    let uz = 0;
    if (ex - Math.abs(lx) < ez - Math.abs(lz)) {
      nx = Math.sign(lx || 1) * ex;
      ux = Math.sign(lx || 1);
    } else {
      nz = Math.sign(lz || 1) * ez;
      uz = Math.sign(lz || 1);
    }
    p.x = b.x + nx * c + nz * s;
    p.z = b.z - nx * s + nz * c;
    hit = { x: ux * c + uz * s, z: -ux * s + uz * c };
  }
  return hit;
}

/** Whether a point in space is inside a block, grown by r. */
export function blocked(env: Environment, p: { x: number; y: number; z: number }, r: number): boolean {
  for (const b of blocksOf(env)) {
    if (p.y > b.h + r) continue;
    const c = Math.cos(b.rot);
    const s = Math.sin(b.rot);
    const dx = p.x - b.x;
    const dz = p.z - b.z;
    if (Math.abs(c * dx - s * dz) < b.hx + r && Math.abs(s * dx + c * dz) < b.hz + r) return true;
  }
  return false;
}

/** The height of the top of whatever stands under a point (0 for the floor). */
export function groundAt(env: Environment, x: number, z: number, below = Infinity): number {
  let top = 0;
  for (const b of blocksOf(env)) {
    if (b.h > below) continue;
    const c = Math.cos(b.rot);
    const s = Math.sin(b.rot);
    const dx = x - b.x;
    const dz = z - b.z;
    if (Math.abs(c * dx - s * dz) < b.hx && Math.abs(s * dx + c * dz) < b.hz) top = Math.max(top, b.h);
  }
  return top;
}

/** Keeps a point inside the bounds, less r. Returns the inward normal when it had to. */
export function keepIn(bounds: Bounds, p: XZ, r: number): XZ | null {
  if (bounds.kind === 'circle') {
    const d = Math.hypot(p.x, p.z);
    const max = bounds.r - r;
    if (d <= max) return null;
    p.x *= max / d;
    p.z *= max / d;
    return { x: -p.x / max, z: -p.z / max };
  }
  let hit: XZ | null = null;
  const mx = bounds.hx - r;
  const mz = bounds.hz - r;
  if (p.x > mx) (p.x = mx), (hit = { x: -1, z: 0 });
  if (p.x < -mx) (p.x = -mx), (hit = { x: 1, z: 0 });
  if (p.z > mz) (p.z = mz), (hit = { x: 0, z: -1 });
  if (p.z < -mz) (p.z = -mz), (hit = { x: 0, z: 1 });
  return hit;
}

export type { Environment, Piece, Bounds };
