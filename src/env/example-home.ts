/**
 * An example home, built the way we suggest you build yours: a plan in plain data
 * (homes/example-home/plan.json), turned by headless Blender (blender/home.py) into a model drawn in the
 * storybook style (public/models/example-home.glb) and the collision boxes that match it
 * (example-home.layout.json). What you see is what you bump into.
 *
 * A single-story house of 18 x 13 m: an open living room, kitchen and dining room along the front
 * (south, +z), three bedrooms along the back (north, -z) off a hall with three doors. The roof and the
 * walls above 1.1 m lift off when the game starts, like a dollhouse. Pups play here: at child size a
 * house has room to run.
 *
 * To rebuild after changing the plan:
 *   blender -b --factory-startup --python-exit-code 1 --python blender/home.py -- homes/example-home/plan.json
 */
import type { Environment, Piece } from './types';
import layout from './example-home.layout.json';

export const exampleHome: Environment = {
  id: 'example-home',
  name: 'Example Home',
  blurb: 'A one-story house built from a floor plan in Blender: open kitchen and living room, three bedrooms.',
  bounds: layout.bounds as Environment['bounds'],
  // the paper the picture is drawn on: the fog fades the yard into it
  colors: { floor: '#f8f4e8', sky: '#f8f4e8', fog: [40, 110], pieces: '#f3eee0', walls: '#f3eee0' },
  // every box is in the model already; these only collide
  pieces: (layout.pieces as unknown as Piece[]).map((p) => ({ ...p, hidden: true })),
  model: { url: '/models/example-home.glb', painterly: true },
  cast: 'pups',
  spawns: layout.spawns as [number, number][],
  dogStart: layout.dogStart as [number, number],
  turkeyStart: layout.turkeyStart as [number, number, number],
};
