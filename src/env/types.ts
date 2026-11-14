/**
 * An environment is the place the game is played: its floor, its edges, the things standing in it
 * that players run around, and where everyone starts. It is plain data, so a fork can describe its
 * own home in one file. See docs/BUILD-YOUR-HOME.md.
 *
 * Units are meters. The floor is the x–z plane, y is up. +z points toward the camera at the start,
 * so on a floor plan drawn with north up, -z is north and +x is east.
 */

/** Something standing on the floor that players, the dog and the turkey collide with. */
export interface Piece {
  /** What it is. It changes only how it is drawn; every piece collides as a box. */
  kind: 'box' | 'wall' | 'table' | 'counter' | 'couch' | 'bed' | 'chair' | 'plant';
  /** Its center on the floor. */
  x: number;
  z: number;
  /** Its width (along x before turning), depth (along z) and height. */
  w: number;
  d: number;
  h: number;
  /** Its turn about the vertical, in degrees (counterclockwise seen from above). */
  rot?: number;
  color?: string;
  /** A label for whoever reads the file (and for the debug view). */
  name?: string;
}

export type Bounds = { kind: 'circle'; r: number } | { kind: 'rect'; hx: number; hz: number };

export interface Environment {
  /** Lowercase, dashes; it goes in the share link (?env=). */
  id: string;
  name: string;
  /** One line for the lobby. */
  blurb: string;
  /** The edge of play. Players, the dog and the turkey stay inside it. */
  bounds: Bounds;
  /** The floor, the sky and the fog are one color in the white room; a home can set its own. */
  colors: { floor: string; sky: string; fog: [near: number, far: number]; pieces: string; walls: string };
  pieces: Piece[];
  /**
   * A picture laid on the floor: a floor plan, a satellite tile, a photo of the rug. It is drawn
   * stretched over `width` x `depth` meters, centered on `x`, `z`.
   */
  floorImage?: { url: string; width: number; depth: number; x?: number; z?: number; opacity?: number };
  /**
   * A 3D model of the place (a phone scan, a Blender model) drawn as scenery. It does not collide:
   * add pieces where its walls and furniture are.
   */
  model?: { url: string; position?: [number, number, number]; rotationY?: number; scale?: number };
  /** Where players appear, in turn. */
  spawns: [number, number][];
  dogStart: [number, number];
  /** Where the turkey sits before a round (on the table, ideally). */
  turkeyStart: [number, number, number];
}
