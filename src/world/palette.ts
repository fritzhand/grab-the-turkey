/**
 * The figure's palette: one texture, one row per material. A surface's color is its row read at
 * x = half-lambert(N.L) x shadow, so each row's stops are its shade band, its body and its lit
 * highlight, in hard steps: the painterly look.
 *
 * The rows are the walker's own (walker-palette.json, from portfolio-map-3d, MIT License). Each
 * player gets their own copy of the texture with the shirt repainted in their color, so the family
 * can tell each other apart across the room.
 */
import { DataTexture, NearestFilter, RGBAFormat, SRGBColorSpace, UnsignedByteType } from 'three';
import WALKER from './walker-palette.json';

export const RAMP_ROWS = 256;
const WIDTH = 256;
type Stop = [number, string];

/** The shirt colors players are dealt, in order. Readable against the white floor. */
export const PLAYER_COLORS = ['#c2410c', '#1c7270', '#7c3aed', '#b91c1c', '#2563eb', '#a16207', '#be185d', '#15803d', '#0f172a', '#0891b2'];

function hex(h: string): [number, number, number] {
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

function shade(h: string, k: number): string {
  const [r, g, b] = hex(h).map((c) => Math.max(0, Math.min(255, Math.round(k < 1 ? c * k : c + (255 - c) * (k - 1)))));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** The walker's top (graphite) in the player's color; dark trousers (steel) and shoes (white). */
function outfit(color: string): Record<string, Stop[]> {
  return {
    graphite: [[0, shade(color, 0.55)], [0.22, color], [0.86, shade(color, 1.28)]],
    steel: [[0, '#0b0c0d'], [0.22, '#16181a'], [0.86, '#2a2d31']],
    white: [[0, '#0e0f10'], [0.22, '#1b1d1f'], [0.86, '#33373b']],
  };
}

const rows = new Map<string, number>();
WALKER.ramps.forEach((r, i) => rows.set(r.name, WALKER.baseRow + i));

export function row(name: string): number {
  const r = rows.get(name);
  if (r === undefined) throw new Error(`No ramp named "${name}"`);
  return r;
}
/** The first of the walker's four skin rows. */
export const SKIN_ROW = row('skin1');

const cache = new Map<string, DataTexture>();

/** The ramp texture for a player in the given shirt color (cached per color). */
export function rampTexture(color: string): DataTexture {
  const hit = cache.get(color);
  if (hit) return hit;
  const data = new Uint8Array(WIDTH * RAMP_ROWS * 4);
  const paint = (r: number, stops: Stop[]) => {
    for (let x = 0; x < WIDTH; x++) {
      const t = x / (WIDTH - 1);
      let c = stops[0][1];
      for (const [at, col] of stops) if (t >= at) c = col; // hard steps
      const [cr, cg, cb] = hex(c);
      const i = (r * WIDTH + x) * 4;
      data[i] = cr;
      data[i + 1] = cg;
      data[i + 2] = cb;
      data[i + 3] = 255;
    }
  };
  const over = outfit(color);
  WALKER.ramps.forEach((r, i) => paint(WALKER.baseRow + i, (over[r.name] ?? r.stops) as Stop[]));
  const tex = new DataTexture(data, WIDTH, RAMP_ROWS, RGBAFormat, UnsignedByteType);
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  cache.set(color, tex);
  return tex;
}
