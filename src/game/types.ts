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

/** A turkey token: a gold coin lying about. Touch it for a point. */
export interface Token {
  id: number;
  p: [number, number];
}

/**
 * The leprechaun: small, quick, and it slips away. It shows up once a minute somewhere in the place.
 * Catch it by hand for 25 points, or pick up the trap and put it on the leprechaun for 50.
 */
export interface Leprechaun {
  p: [number, number];
  v: [number, number];
  f: number;
  /** Milliseconds before it slips away; once caught, before it (or the trap) is gone. */
  t: number;
  /** Who caught it, once it is caught, and how. */
  by: string | null;
  how?: 'trap' | 'hands';
  /** Milliseconds before it can hop away again. */
  hop: number;
}

/** The trap: lying somewhere (a different place each time), or carried by `by`. */
export interface Trap {
  p: [number, number];
  by: string | null;
}

export interface GameEvent {
  /**
   * steal: b took it from a; dog: the dog took it from a; catch: b caught a's throw; pickup: b; drop: the dog dropped it;
   * token: b found a token; lep: a leprechaun showed up; trap: b picked up the trap; caught: b caught the leprechaun
   * (a: 'trap' or 'hands'); gone: the leprechaun slipped away.
   */
  k: 'steal' | 'dog' | 'catch' | 'pickup' | 'drop' | 'throw' | 'token' | 'lep' | 'trap' | 'caught' | 'gone';
  a?: string;
  b?: string;
  /** For token and caught: the points it was worth (doubled when they held the turkey). */
  n?: number;
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
  /**
   * Each player's (and the dog's) points this round, in thousandths: a second holding the turkey is 1000, a token
   * 1000, a trapped leprechaun 50000.
   */
  scores: Record<string, number>;
  /** Names of everyone who has scored, so the board keeps people who drop out. */
  names: Record<string, string>;
  colors: Record<string, number>;
  /** Milliseconds of steal immunity left, per player. */
  immune: Record<string, number>;
  /** The last few things that happened, for the toasts. */
  events: GameEvent[];
  /** Turkey tokens lying about, and the leprechaun and its trap when there is one. */
  tokens?: Token[];
  lep?: Leprechaun | null;
  trap?: Trap | null;
  /** The last round's result, kept for the results screen. */
  last?: { round: number; scores: [string, string, number][] };
}

export type Intent =
  | { k: 'lunge' }
  | { k: 'throw'; v: [number, number, number] }
  | { k: 'start' }
  | { k: 'env'; id: string };

export const DOG_ID = 'dog';
