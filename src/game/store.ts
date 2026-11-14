/**
 * This phone's view of the game: its own player (moved here, every frame), the other players as
 * their last poses, the latest snapshot from the host, the controls' state and the camera. One
 * plain object read every frame by the scene; the HUD subscribes to its changes.
 */
import * as THREE from 'three';
import { getEnvironment, type Environment } from '../env';
import type { Pose, Snapshot } from './types';

export interface Remote {
  pose: Pose;
  /** When the pose arrived (performance.now()). */
  at: number;
  /** Where it is drawn, eased toward the pose. */
  shown: THREE.Vector3;
  facing: number;
}

export const game = {
  me: {
    id: '',
    name: '',
    color: 0,
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    facing: 0,
    speed: 0,
    /** Seconds left in a dip, a dodge, a lunge; and each one's cooldown. */
    dip: 0,
    dipCd: 0,
    dodge: 0,
    dodgeCd: 0,
    lunge: 0,
    lungeCd: 0,
    /** Seconds the throw has been wound up, or -1 when not winding up. */
    windup: -1,
    /** Seconds held this time (the arms tire). */
    holding: 0,
    flags: 0,
  },
  input: {
    keys: new Set<string>(),
    /** The touch stick: x right, y toward the camera, each -1 to 1. */
    stick: { x: 0, y: 0 },
    /** The main button (grab / throw) is held down. */
    primary: false,
    /** One-shot presses, consumed by the controller. */
    dodge: false,
    dip: false,
    lunge: false,
  },
  cam: { yaw: 0, pitch: 0.62, dist: 11 },
  remotes: new Map<string, Remote>(),
  snap: null as Snapshot | null,
  snapAt: 0,
  hostId: '',
  isHost: false,
  room: '',
  status: 'idle' as 'idle' | 'connecting' | 'connected',
  /** A note about the connection, shown while nobody else is here. */
  netNote: '',
  /** How many other players this phone is connected to. */
  peers: 0,
  /** The environment the game is in (the host's choice). */
  env: getEnvironment(null) as Environment,
  /** The model files have loaded. */
  ready: false,
};

let version = 0;
const listeners = new Set<() => void>();
export function subscribe(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}
export function notify(): void {
  version++;
  listeners.forEach((f) => f());
}
export const getVersion = () => version;

/** Whether a remote player's pose is recent enough to count them as here. */
export function fresh(r: Remote, now = performance.now()): boolean {
  return now - r.at < 2500;
}

export function holder(): string | null {
  return game.snap?.holder ?? null;
}

export function iHold(): boolean {
  return !!game.me.id && holder() === game.me.id;
}
