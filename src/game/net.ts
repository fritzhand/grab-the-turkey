/**
 * Multiplayer. Every phone sends its own player's pose. The host runs the turkey, the dog, the
 * scores and the clock, and sends a snapshot of them. If the host leaves or locks their phone, the
 * next one picks up from the last snapshot.
 *
 * The host is the big screen whenever one is in the room (?tv=ABCD): it never sleeps and never
 * plays, so the game stays smooth while phones come and go. A screen only takes over once it has
 * the current game (it has heard a snapshot, or nobody has sent one for a few seconds), so turning
 * the TV on mid-round never resets the scores. With no screen, the host is the lowest id among the
 * active players, as before.
 *
 * Three ways to carry the messages (see transport.ts):
 * - peer to peer over WebRTC, found through public Nostr relays (Trystero): no server, no keys;
 * - a websocket relay (Supabase Realtime, when VITE_SUPABASE_URL is set): works on guest and
 *   office Wi-Fi, where phones are often walled off from each other;
 * - ?transport=local: tabs on one device, for trying a change.
 */
import { getEnvironment } from '../env';
import { direct } from '../audio/director';
import { Authority, freshSnapshot, type Body } from './authority';
import { fresh, game, notify, screenHere, setEnv } from './store';
import { openRoom, type MiniRoom } from './transport';
import type { Intent, Pose, Snapshot } from './types';

const SIM_HZ = 30;
/** A screen waits this long for a snapshot before it starts a game of its own. */
const SCREEN_SETTLE_MS = 2500;

let room: MiniRoom | null = null;
let authority: Authority | null = null;
let sendPose: ((p: Pose) => void) | null = null;
let sendSnap: ((s: Snapshot) => void) | null = null;
let sendIntent: ((i: Intent) => void) | null = null;
let sendScreen: ((s: { ready: boolean }) => void) | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
/** The place a new host starts in, when it has never heard from an old one. */
let wantedEnv = '';
let joinedAt = 0;

const round = (v: number) => Math.round(v * 100) / 100;

export function myPose(): Pose {
  const m = game.me;
  return { n: m.name, c: m.color, p: [round(m.pos.x), round(m.pos.z)], v: [round(m.vel.x), round(m.vel.z)], f: round(m.facing), m: m.flags };
}

/** Every player as the host sees them now: me (unless I am a screen), and everyone else extrapolated. */
export function bodies(now: number): Map<string, Body> {
  const out = new Map<string, Body>();
  const m = game.me;
  if (m.id && !game.tv) out.set(m.id, { id: m.id, name: m.name, color: m.color, x: m.pos.x, z: m.pos.z, vx: m.vel.x, vz: m.vel.z, f: m.facing, m: m.flags });
  for (const [id, r] of game.remotes) {
    if (!fresh(r, now)) continue;
    const age = Math.min(0.15, (now - r.at) / 1000);
    const { p, v } = r.pose;
    out.set(id, { id, name: r.pose.n, color: r.pose.c, x: p[0] + v[0] * age, z: p[1] + v[1] * age, vx: v[0], vz: v[1], f: r.pose.f, m: r.pose.m });
  }
  return out;
}

/** Whether this screen has the current game, and so may host. */
function screenReady(now: number): boolean {
  return game.tv && !document.hidden && (game.snap !== null || now - joinedAt > SCREEN_SETTLE_MS);
}

/** The host: a ready screen if there is one (the lowest id), else the lowest active player. */
function electHost(now: number): string {
  let screen = screenReady(now) ? game.me.id : '';
  for (const [id, s] of game.screens) if (now - s.at < 3500 && s.ready && (!screen || id < screen)) screen = id;
  if (screen) return screen;
  let best = document.hidden || game.tv ? '' : game.me.id;
  for (const [id, r] of game.remotes) if (fresh(r, now) && (!best || id < best)) best = id;
  // nobody playing yet: a screen still keeps the clock, so the lobby shows
  return best || game.me.id;
}

export function intent(i: Intent): void {
  if (authority && game.isHost) authority.intent(game.me.id, i, bodies(performance.now()));
  else sendIntent?.(i);
}

let lastSim = 0;
let poseAt = 0;
let lastMoving = false;
let snapAcc = 0;
let screenAcc = 1;

function tick() {
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastSim) / 1000);
  lastSim = now;

  for (const [id, s] of game.screens) if (now - s.at > 6000) game.screens.delete(id);

  const host = electHost(now);
  const was = game.isHost;
  game.hostId = host;
  game.isHost = host === game.me.id;
  if (game.isHost && !was) authority = new Authority(game.snap ?? freshSnapshot(game.me.id, wantedEnv), game.me.id);
  else if (!game.isHost) authority = null;

  if (authority) {
    // with a screen in the room, rounds run back to back (results, a pause, the next countdown)
    authority.auto = screenHere(now);
    game.snap = authority.step(dt, bodies(now));
    game.snapAt = now;
    snapAcc += dt;
    if (snapAcc >= 1 / room!.rates.snap) {
      snapAcc = 0;
      sendSnap?.(game.snap);
    }
  }

  if (game.snap && game.snap.env !== game.env.id) setEnv(getEnvironment(game.snap.env));
  direct(game.snap);

  if (game.tv) {
    screenAcc += dt;
    if (screenAcc >= 1) {
      screenAcc = 0;
      sendScreen?.({ ready: screenReady(now) });
    }
  } else if (!document.hidden) {
    // often while moving; now and then standing still, so a relay is not flooded
    const moving = game.me.speed > 0.15 || game.me.flags !== 0;
    const gap = moving ? 1000 / room!.rates.pose : 1000;
    if (now - poseAt >= gap || (lastMoving && !moving)) {
      poseAt = now;
      sendPose?.(myPose());
    }
    lastMoving = moving;
  }

  game.peers = [...game.remotes.values()].filter((r) => fresh(r, now)).length;
  notify();
}

export async function connect(code: string, envId: string): Promise<void> {
  if (room) return;
  // for the browser console (and tests): window.grabTheTurkey.game is the live state
  Object.assign(window, { grabTheTurkey: { game, intent, room: () => room } });
  game.room = code;
  game.status = 'connecting';
  wantedEnv = envId;
  setEnv(getEnvironment(envId));
  notify();

  room = await openRoom(code);

  const pose = room.makeAction<Pose>('pose');
  const snap = room.makeAction<Snapshot>('snap');
  const want = room.makeAction<Intent>('intent');
  const screen = room.makeAction<{ ready: boolean }>('screen');
  sendPose = (p) => void pose.send(p).catch(() => {});
  sendSnap = (s) => void snap.send(s).catch(() => {});
  sendIntent = (i) => void want.send(i).catch(() => {});
  sendScreen = (s) => void screen.send(s).catch(() => {});

  pose.onMessage((p, { userId }) => {
    if (!p || typeof p.n !== 'string' || !Array.isArray(p.p)) return;
    const r = game.remotes.get(userId);
    if (r) {
      r.pose = p;
      r.at = performance.now();
    } else {
      const shown = game.me.pos.clone().set(p.p[0], 0, p.p[1]);
      game.remotes.set(userId, { pose: p, at: performance.now(), shown, facing: p.f });
    }
  });

  screen.onMessage((s, { userId }) => {
    game.screens.set(userId, { at: performance.now(), ready: !!s?.ready });
  });

  snap.onMessage((s, { userId }) => {
    if (!s || typeof s.seq !== 'number') return;
    if (game.isHost) {
      // a screen hosting hears only other screens; a player hosting hears screens and lower ids
      const fromScreen = game.screens.has(userId);
      if (game.tv && !fromScreen) return;
      if (!fromScreen && userId > game.me.id) return; // they have not seen me yet; they will
    }
    if (game.snap && s.host === game.snap.host && s.seq <= game.snap.seq) return; // out of order
    game.snap = s;
    game.snapAt = performance.now();
  });

  want.onMessage((i, { userId }) => {
    if (authority && game.isHost) authority.intent(userId, i, bodies(performance.now()));
  });

  room.onError((note) => {
    game.netNote = note;
    notify();
  });
  room.onPeerJoin(() => {
    game.netNote = '';
    notify();
  });
  room.onUserLeave(({ userId }) => {
    game.remotes.delete(userId);
    game.screens.delete(userId);
    notify();
  });

  const self = await room.getSelf();
  game.me.id = self.userId;
  game.status = 'connected';
  lastSim = joinedAt = performance.now();
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
  game.screens.clear();
  game.snap = null;
  game.status = 'idle';
  notify();
}
