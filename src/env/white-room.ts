/**
 * The white room: a white floor that runs to a white horizon, with no seam between floor, fog and
 * sky. The table stands in the middle with the turkey on it; a ring of white plinths gives you
 * something to run around. It is the base every other environment starts from.
 */
import type { Environment } from './types';

const ring = (n: number, r: number, offset = 0): [number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const a = offset + (i / n) * Math.PI * 2;
    return [Math.round(Math.sin(a) * r * 100) / 100, Math.round(Math.cos(a) * r * 100) / 100];
  });

export const whiteRoom: Environment = {
  id: 'white-room',
  name: 'The White Room',
  blurb: 'An endless white room, a long table and a ring of plinths.',
  bounds: { kind: 'circle', r: 15 },
  colors: { floor: '#f3f3f0', sky: '#f3f3f0', fog: [24, 70], pieces: '#fbfbf9', walls: '#e9e9e4' },
  pieces: [
    { kind: 'table', name: 'The table', x: 0, z: 0, w: 4.2, d: 1.3, h: 0.76, color: '#8a6e55' },
    ...ring(6, 7.2, Math.PI / 6).map(([x, z], i) => ({ kind: 'box' as const, name: `Plinth ${i + 1}`, x, z, w: 1.1, d: 1.1, h: 1.05 })),
    { kind: 'box', name: 'Bench north', x: 0, z: -11, w: 3.2, d: 0.6, h: 0.45 },
    { kind: 'box', name: 'Bench south', x: 0, z: 11, w: 3.2, d: 0.6, h: 0.45 },
    { kind: 'box', name: 'Bench east', x: 11, z: 0, w: 0.6, d: 3.2, h: 0.45 },
    { kind: 'box', name: 'Bench west', x: -11, z: 0, w: 0.6, d: 3.2, h: 0.45 },
  ],
  spawns: ring(10, 4.2, Math.PI / 10),
  dogStart: [0, -9],
  turkeyStart: [0, 0.76, 0],
};
