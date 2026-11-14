/**
 * Multiplayer, with no server. Phones find each other through public Nostr relays (Trystero) and
 * then talk directly, peer to peer, over WebRTC. That is why the game deploys as a static site:
 * nothing runs on Vercel but the files.
 *
 * Every phone sends its own player's pose. The host (the player with the lowest id among those
 * still active) runs the turkey, the dog, the scores and the clock, and sends a snapshot of them.
 * If the host leaves or locks their phone, the next one picks up from the last snapshot.
 */
import { joinRoom } from 'trystero';
import { getEnvironment } from '../env';
import { direct } from '../audio/director';
import { Authority, freshSnapshot, type Body } from './authority';
import { fresh, game, notify } from './store';
import { POSE_HZ, SNAP_HZ } from './tuning';
import type { Intent, Pose, Snapshot } from './types';

const APP_ID = import.meta.env.VITE_APP_ID || 'github.com/fritzhand/grab-the-turkey';
const SIM_HZ = 30;

type Turn = { urls: string | string[]; username?: string; credential?: string };

/**
 * TURN relays, for phones that cannot reach each other directly: any set at build time
 * (VITE_TURN_*), plus any the deployment's /api/ice hands out (see api/ice.ts). Both are optional.
 */
async function turnConfig(): Promise<Turn[] | undefined> {
  const out: Turn[] = [];
  const urls = (import.meta.env.VITE_TURN_URLS ?? '').split(',').map((u: string) => u.trim()).filter(Boolean);
  if (urls.length) out.push({ urls, username: import.meta.env.VITE_TURN_USERNAME, credential: import.meta.env.VITE_TURN_CREDENTIAL });
  try {
    const res = await fetch('/api/ice', { signal: AbortSignal.timeout(2500) });
    if (res.ok && res.headers.get('content-type')?.includes('json')) {
      const body = (await res.json()) as { iceServers?: Turn[] };
      out.push(...(body.iceServers ?? []));
    }
  } catch {
    /* no relay: peer to peer only */
  }
  return out.length ? out : undefined;
}

/** The part of a Trystero room the game uses (the local transport below fakes the same shape). */
interface MiniRoom {
  makeAction<T>(name: string): { send(data: T): Promise<void>; onMessage(f: (data: T, ctx: { userId: string }) => void): unknown };
  getSelf(): Promise<{ userId: string }>;
  onPeerJoin(f: (ctx: { userId: string }) => void): unknown;
  onUserLeave(f: (ctx: { userId: string }) => void): unknown;
  onError(f: (e: { code: string; turnConfigured?: boolean }) => void): unknown;
  leave(): Promise<void>;
}

/**
 * ?transport=local: tabs on one device play each other over a BroadcastChannel, with no network.
 * For trying a change with two or three tabs side by side.
 */
function localRoom(code: string): MiniRoom {
  const ch = new BroadcastChannel(`grab-the-turkey:${code}`);
  const me = `local-${Math.random().toString(36).slice(2, 10)}`;
  const handlers = new Map<string, ((d: unknown, c: { userId: string }) => void)[]>();
  const joins: ((c: { userId: string }) => void)[] = [];
  const seen = new Set<string>();
  ch.onmessage = (e) => {
    const { from, name, data } = e.data as { from: string; name: string; data: unknown };
    if (!seen.has(from)) {
      seen.add(from);
      joins.forEach((f) => f({ userId: from }));
    }
    handlers.get(name)?.forEach((f) => f(data, { userId: from }));
  };
  return {
    makeAction<T>(name: string) {
      return {
        send: async (data: T) => ch.postMessage({ from: me, name, data }),
        onMessage: (f: (d: T, c: { userId: string }) => void) => handlers.set(name, [...(handlers.get(name) ?? []), f as (d: unknown, c: { userId: string }) => void]),
      };
    },
    getSelf: async () => ({ userId: me }),
    onPeerJoin: (f) => joins.push(f),
    onUserLeave: () => {},
    onError: () => {},
    leave: async () => ch.close(),
  };
}

let room: MiniRoom | null = null;
let authority: Authority | null = null;
let sendPose: ((p: Pose) => void) | null = null;
let sendSnap: ((s: Snapshot) => void) | null = null;
let sendIntent: ((i: Intent) => void) | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
/** The snapshot a new host starts from, when it has never heard from an old one. */
let wantedEnv = '';

export function myPose(): Pose {
  const m = game.me;
  return {
    n: m.name,
    c: m.color,
    p: [round(m.pos.x), round(m.pos.z)],
    v: [round(m.vel.x), round(m.vel.z)],
    f: round(m.facing),
    m: m.flags,
  };
}
const round = (v: number) => Math.round(v * 100) / 100;

/** Every player as the host sees them now: me, and everyone else extrapolated from their pose. */
function bodies(now: number): Map<string, Body> {
  const out = new Map<string, Body>();
  const m = game.me;
  if (m.id) out.set(m.id, { id: m.id, name: m.name, color: m.color, x: m.pos.x, z: m.pos.z, vx: m.vel.x, vz: m.vel.z, f: m.facing, m: m.flags });
  for (const [id, r] of game.remotes) {
    if (!fresh(r, now)) continue;
    const age = Math.min(0.15, (now - r.at) / 1000);
    const { p, v } = r.pose;
    out.set(id, { id, name: r.pose.n, color: r.pose.c, x: p[0] + v[0] * age, z: p[1] + v[1] * age, vx: v[0], vz: v[1], f: r.pose.f, m: r.pose.m });
  }
  return out;
}

/** The host: the lowest id among the players who are here and active (this phone, if visible). */
function electHost(now: number): string {
  let best = document.hidden ? '' : game.me.id;
  for (const [id, r] of game.remotes) if (fresh(r, now) && (!best || id < best)) best = id;
  return best || game.me.id;
}

export function intent(i: Intent): void {
  if (authority && game.isHost) authority.intent(game.me.id, i, bodies(performance.now()));
  else sendIntent?.(i);
}

let lastSim = 0;
let poseAcc = 0;
let snapAcc = 0;

function tick() {
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastSim) / 1000);
  lastSim = now;

  // who is host now?
  const host = electHost(now);
  const was = game.isHost;
  game.hostId = host;
  game.isHost = host === game.me.id;
  if (game.isHost && !was) {
    authority = new Authority(game.snap ?? freshSnapshot(game.me.id, wantedEnv), game.me.id);
  } else if (!game.isHost) authority = null;

  if (authority) {
    game.snap = authority.step(dt, bodies(now));
    game.snapAt = now;
    snapAcc += dt;
    if (snapAcc >= 1 / SNAP_HZ) {
      snapAcc = 0;
      sendSnap?.(game.snap);
    }
  }

  if (game.snap && game.snap.env !== game.env.id) game.env = getEnvironment(game.snap.env);
  direct(game.snap);

  poseAcc += dt;
  if (poseAcc >= 1 / POSE_HZ) {
    poseAcc = 0;
    if (!document.hidden) sendPose?.(myPose());
  }

  const peers = [...game.remotes.values()].filter((r) => fresh(r, now)).length;
  if (peers !== game.peers || was !== game.isHost) {
    game.peers = peers;
  }
  notify();
}

export async function connect(code: string, envId: string): Promise<void> {
  if (room) return;
  // for the browser console (and tests): window.grabTheTurkey.game is the live state
  Object.assign(window, { grabTheTurkey: { game, intent, room: () => room } });
  game.room = code;
  game.status = 'connecting';
  wantedEnv = envId;
  game.env = getEnvironment(envId);
  notify();

  const params = new URLSearchParams(location.search);
  const testing = import.meta.env.DEV || params.has('fresh');
  room = params.get('transport') === 'local' ? localRoom(code) : joinRoom(
    {
      appId: APP_ID,
      // the same phone keeps the same id across reloads, so a refresh keeps your score
      identity: testing ? 'none' : 'local',
      turnConfig: await turnConfig(),
    },
    `room-${code}`,
  );

  const pose = room.makeAction<Pose>('pose');
  const snap = room.makeAction<Snapshot>('snap');
  const want = room.makeAction<Intent>('intent');
  sendPose = (p) => void pose.send(p).catch(() => {});
  sendSnap = (s) => void snap.send(s).catch(() => {});
  sendIntent = (i) => void want.send(i).catch(() => {});

  pose.onMessage((p, { userId }) => {
    const r = game.remotes.get(userId);
    if (r) {
      r.pose = p;
      r.at = performance.now();
    } else {
      const shown = game.me.pos.clone().set(p.p[0], 0, p.p[1]);
      game.remotes.set(userId, { pose: p, at: performance.now(), shown, facing: p.f });
    }
  });

  snap.onMessage((s, { userId }) => {
    if (game.isHost && userId > game.me.id) return; // they have not seen me yet; they will
    if (game.snap && s.host === game.snap.host && s.seq <= game.snap.seq) return; // out of order
    game.snap = s;
    game.snapAt = performance.now();
  });

  want.onMessage((i, { userId }) => {
    if (authority && game.isHost) authority.intent(userId, i, bodies(performance.now()));
  });

  room.onPeerJoin(({ userId }) => console.info('[grab-the-turkey] connected to', userId));
  room.onError((e) => {
    console.warn('[grab-the-turkey] room error', e);
    if (e.code === 'peer-connect-failed') {
      game.netNote = e.turnConfigured
        ? 'Could not reach a player, even through the relay. Try the same Wi-Fi.'
        : 'Could not reach a player directly. Put everyone on the same Wi-Fi, or add a TURN relay (see the README).';
      notify();
    }
  });
  room.onPeerJoin(() => {
    game.netNote = '';
    notify();
  });
  room.onUserLeave(({ userId }) => {
    game.remotes.delete(userId);
    notify();
  });

  const self = await room.getSelf();
  game.me.id = self.userId;
  game.status = 'connected';
  lastSim = performance.now();
  timer = setInterval(tick, 1000 / SIM_HZ);
  // a hidden page's timers are throttled; the moment it is back, it catches up
  document.addEventListener('visibilitychange', tick);
  notify();
}

export async function leave(): Promise<void> {
  if (timer) clearInterval(timer);
  document.removeEventListener('visibilitychange', tick);
  await room?.leave();
  room = null;
  authority = null;
  game.remotes.clear();
  game.snap = null;
  game.status = 'idle';
  notify();
}
