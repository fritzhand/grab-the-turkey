/**
 * The pups: one model (public/models/pup.glb, made in blender/pup.py), many pups. A player's color is their
 * jumper; their coat is one of five heeler-style coats, dealt by the same index.
 */

export interface Coat {
  name: string;
  coat: string;
  /** The tan points: brows, cheeks, paws. */
  point: string;
  muzzle: string;
  ear: string;
  foot: string;
  tail_tip: string;
}

export const COATS: Coat[] = [
  { name: 'Blue', coat: '#7f9bbd', point: '#e0a766', muzzle: '#f2e2c4', ear: '#5f7898', foot: '#e0a766', tail_tip: '#f4ecd8' },
  { name: 'Red', coat: '#d38552', point: '#f0c88e', muzzle: '#f6e8d0', ear: '#a95f38', foot: '#f0c88e', tail_tip: '#f6ecd8' },
  { name: 'Cream', coat: '#f1ddb2', point: '#f7e9c9', muzzle: '#fbf1dc', ear: '#e5c488', foot: '#f7e9c9', tail_tip: '#fffaf0' },
  { name: 'Chocolate', coat: '#7a5a47', point: '#d9a76c', muzzle: '#e9d3b2', ear: '#563d30', foot: '#d9a76c', tail_tip: '#efe2c8' },
  { name: 'Black and tan', coat: '#4a4d57', point: '#d7a366', muzzle: '#e8d5b5', ear: '#33353d', foot: '#d7a366', tail_tip: '#eadcc0' },
];

export const coatFor = (index: number): Coat => COATS[index % COATS.length];

/** The pups are the size of children: the model is built about 1.3 m to the top of the head, and drawn at this scale (so about 0.9 m). */
export const PUP_SCALE = 0.68;

/** Where the turkey rides, relative to a pup: out in front, at the arms. */
export const HOLD = { forward: 0.34 * PUP_SCALE, y: 0.8 * PUP_SCALE, yDip: 0.5 * PUP_SCALE };

/** The pup's name tag, over its ears. */
export const TAG_Y = 1.95 * PUP_SCALE;
