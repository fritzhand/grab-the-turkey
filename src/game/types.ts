/**
 * What goes over the wire. Each phone owns its own player and sends a Pose many times a second.
 * One phone (the host, chosen automatically) runs the turkey, the dog, the scores and the clock,
 * and sends a Snapshot to everyone. Anyone may become host if the host leaves; the snapshot is all
 * it needs to carry on.
 */

/** Pose flags. */
export const F_DIP = 1;
export const F_DODGE = 2;
export const F_LUNGE = 4;
export const F_WINDUP = 8;

export interface Pose {
  /** Name and shirt color (an index into PLAYER_COLORS). */
  n: string;
  c: number;
  /** Position and velocity on the floor. */
  p: [number, number];
  v: [number, number];
  /** Facing, radians (0 is +z). */
  f: number;
  /** Flags: F_DIP | F_DODGE | F_LUNGE | F_WINDUP. */
  m: number;
}

export type Phase = 'lobby' | 'countdown' | 'play' | 'over';

/** Turkey states. */
export const HELD = 0;
export const AIR = 1;
export const REST = 2;

export interface TurkeyState {
  s: typeof HELD | typeof AIR | typeof REST;
  p: [number, number, number];
  v: [number, number, number];
  /** Who threw it, and for how many more ms they cannot catch it. */
  by: string | null;
  nc: number;
}

/** Dog modes. */
export const DOG_CHASE = 0;
export const DOG_CARRY = 1;
export const DOG_REST = 2;

export interface DogState {
  p: [number, number];
  v: [number, number];
  f: number;
  mode: typeof DOG_CHASE | typeof DOG_CARRY | typeof DOG_REST;
  /** Seconds left in the current mode (carry, rest or stun). */
  t: number;
}

export interface GameEvent {
  /** steal: b took it from a; dog: the dog took it from a; catch: b caught a's throw; pickup: b; drop: the dog dropped it. */
  k: 'steal' | 'dog' | 'catch' | 'pickup' | 'drop' | 'throw';
  a?: string;
  b?: string;
  id: number;
}

export interface Snapshot {
  /** The host's user id, and a counter that only grows. */
  host: string;
  seq: number;
  env: string;
  phase: Phase;
  /** Milliseconds left in the countdown or the round. */
  left: number;
  round: number;
  /** A user id, 'dog', or null when nobody holds it. */
  holder: string | null;
  turkey: TurkeyState;
  dog: DogState;
  /** Milliseconds each player (and the dog) has held the turkey this round. */
  scores: Record<string, number>;
  /** Names of everyone who has scored, so the board keeps people who drop out. */
  names: Record<string, string>;
  colors: Record<string, number>;
  /** Milliseconds of steal immunity left, per player. */
  immune: Record<string, number>;
  /** The last few things that happened, for the toasts. */
  events: GameEvent[];
  /** The last round's result, kept for the results screen. */
  last?: { round: number; scores: [string, string, number][] };
}

export type Intent =
  | { k: 'lunge' }
  | { k: 'throw'; v: [number, number, number] }
  | { k: 'start' }
  | { k: 'env'; id: string };

export const DOG_ID = 'dog';
