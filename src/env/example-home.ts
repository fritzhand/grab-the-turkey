/**
 * An example home, to copy when you build your own. A single-story house of 18 x 13 m: an open
 * living room, kitchen and dining room along the front (south, +z), three bedrooms along the back
 * (north, -z) off a wall with three doors. The walls are cut down to 1.1 m, like a dollhouse, so
 * the camera sees over them.
 *
 * Every number here came from a floor plan: measure a room on the plan, put its walls where they
 * are. docs/BUILD-YOUR-HOME.md walks through it.
 */
import type { Environment, Piece } from './types';

const T = 0.2; // wall thickness
const H = 1.1; // wall height (cut down)

/** A wall from (x1, z1) to (x2, z2); walls run along x or along z. */
function wall(x1: number, z1: number, x2: number, z2: number, name?: string): Piece {
  const alongX = Math.abs(x2 - x1) >= Math.abs(z2 - z1);
  return {
    kind: 'wall',
    name,
    x: (x1 + x2) / 2,
    z: (z1 + z2) / 2,
    w: alongX ? Math.abs(x2 - x1) + T : T,
    d: alongX ? T : Math.abs(z2 - z1) + T,
    h: H,
  };
}

export const exampleHome: Environment = {
  id: 'example-home',
  name: 'Example Home',
  blurb: 'A one-story house: open kitchen and living room, three bedrooms. Copy it for yours.',
  bounds: { kind: 'rect', hx: 8.9, hz: 6.4 },
  colors: { floor: '#efe9df', sky: '#f3f3f0', fog: [30, 80], pieces: '#fbfbf9', walls: '#e4e1da' },
  pieces: [
    // the outside walls
    wall(-9, -6.5, 9, -6.5, 'North wall'),
    wall(-9, 6.5, -2.2, 6.5, 'South wall, west of the front door'),
    wall(-1, 6.5, 9, 6.5, 'South wall, east of the front door'),
    wall(-9, -6.5, -9, 6.5, 'West wall'),
    wall(9, -6.5, 9, 6.5, 'East wall'),
    // the hall wall, with a door into each bedroom
    wall(-9, -1, -6.6, -1),
    wall(-5.4, -1, -0.6, -1),
    wall(0.6, -1, 5.4, -1),
    wall(6.6, -1, 9, -1),
    // between the bedrooms
    wall(-3, -6.5, -3, -1, 'Bedroom wall west'),
    wall(3, -6.5, 3, -1, 'Bedroom wall east'),
    // a half wall between the living room and the kitchen
    wall(0, 3.6, 0, 6.5, 'Half wall'),
    // the kitchen and dining room
    { kind: 'table', name: 'Dining table', x: 4.4, z: 2.0, w: 2.4, d: 1.1, h: 0.76, color: '#8a6e55' },
    { kind: 'counter', name: 'Island', x: 6.4, z: 4.9, w: 2.0, d: 0.9, h: 0.92 },
    { kind: 'counter', name: 'Counter', x: 8.5, z: 2.6, w: 0.6, d: 4.6, h: 0.92 },
    // the living room
    { kind: 'couch', name: 'Couch', x: -5, z: 5.4, w: 2.6, d: 0.9, h: 0.8, rot: 180, color: '#5b6b73' },
    { kind: 'couch', name: 'Armchair', x: -8, z: 2.2, w: 0.9, d: 0.9, h: 0.8, rot: 90, color: '#5b6b73' },
    { kind: 'table', name: 'Coffee table', x: -5, z: 3.6, w: 1.2, d: 0.6, h: 0.42, color: '#8a6e55' },
    { kind: 'plant', name: 'Plant', x: -1.2, z: 0.2, w: 0.5, d: 0.5, h: 1.2, color: '#4f7a4a' },
    // the bedrooms
    { kind: 'bed', name: 'Bed 1', x: -6, z: -4.6, w: 1.6, d: 2.1, h: 0.6, color: '#c9cfd4' },
    { kind: 'bed', name: 'Bed 2', x: 0, z: -4.6, w: 1.6, d: 2.1, h: 0.6, color: '#c9cfd4' },
    { kind: 'bed', name: 'Bed 3', x: 6, z: -4.8, w: 1.4, d: 2.0, h: 0.6, color: '#c9cfd4' },
  ],
  spawns: [
    [-3, 1.5], [-1.5, 2.5], [1.5, 1], [2, 4.5], [-6, 1], [-3, 4], [1, -0.2], [-7, 0], [6.5, 0], [-2, 0],
  ],
  dogStart: [-6.5, -3],
  turkeyStart: [4.4, 0.76, 2.0],
};
