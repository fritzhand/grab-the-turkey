/**
 * How the messages travel. The game sees one small interface (MiniRoom); three things provide it.
 *
 * 1. Peer to peer (the default). Phones find each other through public Nostr relays (Trystero) and
 *    then talk directly over WebRTC. No server and no keys, so a fork deploys as static files. On
 *    home Wi-Fi it connects almost every time. On guest and office Wi-Fi it often does not: those
 *    networks wall each device off from the others ("client isolation"), and two phones on some
 *    cellular networks cannot reach each other either. A TURN relay (api/ice.ts) fixes the second
 *    case, not always the first.
 *
 * 2. A websocket relay: Supabase Realtime, broadcast and presence only (no database tables). Set
 *    VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY and every room goes through it. Everyone talks to
 *    one server over an ordinary web connection, so it works on any network that loads web pages:
 *    the lesson of running a game live on a venue's guest Wi-Fi. Poses go out less often through
 *    the relay (it counts every message), and players who stand still go quiet.
 *
 * 3. ?transport=local: tabs on one device play each other over a BroadcastChannel, no network.
 *
 * ?transport=p2p or ?transport=relay picks one by hand when both are available.
 */
import { joinRoom } from 'trystero';
import { POSE_HZ, RELAY_POSE_HZ, RELAY_SNAP_HZ, SNAP_HZ } from './tuning';

export interface MiniRoom {
  makeAction<T>(name: string): { send(data: T): Promise<void>; onMessage(f: (data: T, ctx: { userId: string }) => void): void };
  getSelf(): Promise<{ userId: string }>;
  onPeerJoin(f: (ctx: { userId: string }) => void): void;
  onUserLeave(f: (ctx: { userId: string }) => void): void;
  /** A note for the lobby when something about the connection is wrong. */
  onError(f: (note: string) => void): void;
  leave(): Promise<void>;
  /** How often this transport wants poses and snapshots sent (per second). */
  rates: { pose: number; snap: number };
  kind: 'p2p' | 'relay' | 'local';
}

const APP_ID = import.meta.env.VITE_APP_ID || 'github.com/fritzhand/grab-the-turkey';
const RELAY_URL: string = import.meta.env.VITE_SUPABASE_URL ?? '';
const RELAY_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export function transportKind(): MiniRoom['kind'] {
  const asked = new URLSearchParams(location.search).get('transport');
  if (asked === 'local') return 'local';
  if (asked === 'p2p') return 'p2p';
  if (RELAY_URL && RELAY_KEY) return 'relay';
  return 'p2p';
}

export async function openRoom(code: string): Promise<MiniRoom> {
  const kind = transportKind();
  if (kind === 'local') return localRoom(code);
  if (kind === 'relay') return relayRoom(code);
  return p2pRoom(code);
}

// ---------------------------------------------------------------------------------------- p2p

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

async function p2pRoom(code: string): Promise<MiniRoom> {
  const params = new URLSearchParams(location.search);
  const testing = import.meta.env.DEV || params.has('fresh') || params.has('tv');
  const r = joinRoom(
    {
      appId: APP_ID,
      // the same phone keeps the same id across reloads, so a refresh keeps your score
      identity: testing ? 'none' : 'local',
      turnConfig: await turnConfig(),
    },
    `room-${code}`,
  );
  return {
    kind: 'p2p',
    rates: { pose: POSE_HZ, snap: SNAP_HZ },
    makeAction<T>(name: string) {
      // Trystero's own types are stricter about payloads than the game needs; everything sent is JSON
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const a = (r.makeAction as any)(name);
      return { send: (d: T) => a.send(d), onMessage: (f: (d: T, c: { userId: string }) => void) => void a.onMessage(f) };
    },
    getSelf: () => r.getSelf(),
    onPeerJoin: (f) => void r.onPeerJoin(f),
    onUserLeave: (f) => void r.onUserLeave(f),
    onError: (f) =>
      void r.onError((e: { code: string; turnConfigured?: boolean }) => {
        console.warn('[grab-the-turkey] room error', e);
        if (e.code !== 'peer-connect-failed') return;
        f(
          e.turnConfigured
            ? 'Could not reach a player, even through the relay. Try the same Wi-Fi.'
            : 'Could not reach a player directly. Put everyone on the same Wi-Fi, or set up the relay (see the README).',
        );
      }),
    leave: () => r.leave(),
  } as MiniRoom;
}

// -------------------------------------------------------------------------------------- relay

async function relayRoom(code: string): Promise<MiniRoom> {
  const { RealtimeClient } = await import('@supabase/realtime-js');
  const me = `r-${Math.random().toString(36).slice(2, 10)}`;
  const client = new RealtimeClient(`${RELAY_URL.replace(/\/$/, '')}/realtime/v1`, { params: { apikey: RELAY_KEY, eventsPerSecond: 60 } });
  const ch = client.channel(`grab-the-turkey:${code}`, { config: { presence: { key: me }, broadcast: { self: false, ack: false } } });
  const handlers = new Map<string, ((d: unknown, c: { userId: string }) => void)[]>();
  const joins: ((c: { userId: string }) => void)[] = [];
  const leaves: ((c: { userId: string }) => void)[] = [];
  const errors: ((note: string) => void)[] = [];
  const present = new Set<string>();

  ch.on('broadcast', { event: 'm' }, ({ payload }) => {
    const { f, n, d } = payload as { f: string; n: string; d: unknown };
    handlers.get(n)?.forEach((h) => h(d, { userId: f }));
  });
  ch.on('presence', { event: 'sync' }, () => {
    const now = new Set(Object.keys(ch.presenceState()).filter((id) => id !== me));
    for (const id of now) if (!present.has(id)) joins.forEach((h) => h({ userId: id }));
    for (const id of present) if (!now.has(id)) leaves.forEach((h) => h({ userId: id }));
    present.clear();
    now.forEach((id) => present.add(id));
  });

  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => !done && ((done = true), resolve());
    setTimeout(finish, 6000);
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void ch.track({ at: Date.now() });
        finish();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        errors.forEach((h) => h('Could not reach the game relay. Check the connection and reload.'));
        finish();
      }
    });
  });

  // a locked phone drops out of presence, so it never holds up the game
  const vis = () => (document.hidden ? void ch.untrack() : void ch.track({ at: Date.now() }));
  document.addEventListener('visibilitychange', vis);

  return {
    kind: 'relay',
    rates: { pose: RELAY_POSE_HZ, snap: RELAY_SNAP_HZ },
    makeAction<T>(name: string) {
      return {
        send: async (d: T) => void ch.send({ type: 'broadcast', event: 'm', payload: { f: me, n: name, d } }),
        onMessage: (f: (d: T, c: { userId: string }) => void) => void handlers.set(name, [...(handlers.get(name) ?? []), f as (d: unknown, c: { userId: string }) => void]),
      };
    },
    getSelf: async () => ({ userId: me }),
    onPeerJoin: (f) => void joins.push(f),
    onUserLeave: (f) => void leaves.push(f),
    onError: (f) => void errors.push(f),
    leave: async () => {
      document.removeEventListener('visibilitychange', vis);
      await ch.unsubscribe();
      client.disconnect();
    },
  };
}

// -------------------------------------------------------------------------------------- local

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
    kind: 'local',
    rates: { pose: POSE_HZ, snap: SNAP_HZ },
    makeAction<T>(name: string) {
      return {
        send: async (data: T) => ch.postMessage({ from: me, name, data }),
        onMessage: (f: (d: T, c: { userId: string }) => void) => void handlers.set(name, [...(handlers.get(name) ?? []), f as (d: unknown, c: { userId: string }) => void]),
      };
    },
    getSelf: async () => ({ userId: me }),
    onPeerJoin: (f) => void joins.push(f),
    onUserLeave: () => {},
    onError: () => {},
    leave: async () => ch.close(),
  };
}
