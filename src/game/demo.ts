/**
 * The demo (?demo, or "Watch the demo" on the door): a whole game, from above, played by made-up
 * players, round after round, so it can run on a screen by itself or be screen-recorded for a
 * video. It runs entirely on this page, with its own host, and never joins a room.
 *
 * The players are simple: whoever has the turkey runs from the nearest chaser (and the dog), away
 * from the walls, dodges when someone is close, dips now and then, and throws when cornered or
 * tired; everyone else runs at the holder (aiming a little ahead) and lunges when in reach, or at
 * the turkey when it is loose. Along the way they pick up the turkey tokens near them, and when a leprechaun is
 * loose the one nearest the trap fetches it and goes after the leprechaun (others try by hand). The host's own
 * rules decide every steal, catch and score.
 *
 * ?demo&players=8 sets how many; ?demo&secs=90 how long a round lasts (default 75).
 */
import * as THREE from 'three';
import { direct } from '../audio/director';
import { getEnvironment, keepIn, keepOut } from '../env';
import { Authority, freshSnapshot, type Body } from './authority';
import { game, notify, setEnv } from './store';
import { T } from './tuning';
import { AIR, DOG_ID, F_DIP, F_DODGE, F_LUNGE, F_WINDUP } from './types';

const NAMES = ['Grandma', 'Uncle Ray', 'Priya', 'Sam', 'Aunt Linda', 'Jordan', 'Kai', 'Noah', 'Zoe', 'Luis', 'Aisha', 'Ben'];

interface Runner {
  id: string;
  name: string;
  color: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  f: number;
  /** A little faster or slower than the others, so the chase strings out. */
  pace: number;
  dodge: number;
  dodgeCd: number;
  dip: number;
  dipCd: number;
  lunge: number;
  lungeCd: number;
  windup: number;
  held: number;
  /** Seconds left going round something, and which way. */
  round: number;
  side: number;
  /** How long until it next re-reads the chase (people do not react instantly). */
  think: number;
  aim: { x: number; z: number };
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startDemo(envId: string | null): void {
  if (timer) return;
  const params = new URLSearchParams(location.search);
  const count = Math.max(2, Math.min(NAMES.length, Number(params.get('players')) || 8));
  const secs = Math.max(15, Number(params.get('secs')) || 75);
  (T as { roundSeconds: number }).roundSeconds = secs;

  game.tv = true;
  game.demo = true;
  game.me.id = '0demo';
  game.me.name = 'Demo';
  game.room = 'DEMO';
  game.status = 'connected';
  const env = getEnvironment(envId);
  setEnv(env);
  Object.assign(window, { grabTheTurkey: { game } });

  const auth = new Authority(freshSnapshot(game.me.id, env.id), game.me.id);
  auth.auto = true;
  auth.intent(game.me.id, { k: 'start' }, new Map());

  const runners: Runner[] = NAMES.slice(0, count).map((name, i) => {
    const [x, z] = env.spawns[i % env.spawns.length];
    return {
      id: `demo-${i}`, name, color: i % 10, x: x + (i >= env.spawns.length ? 0.6 : 0), z, vx: 0, vz: 0, f: 0,
      pace: 0.86 + ((i * 7) % 10) / 70, dodge: 0, dodgeCd: 0, dip: 0, dipCd: 0, lunge: 0, lungeCd: 0, windup: -1, held: 0,
      round: 0, side: i % 2 ? 1 : -1, think: Math.random() * 0.3, aim: { x: 0, z: 0 },
    };
  });

  let last = performance.now();
  /** Which token each runner is after, and until when, so they spread out instead of piling onto one. */
  const claims = new Map<string, { id: number; until: number }>();
  timer = setInterval(() => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const s = auth.s;
    const playing = s.phase === 'play';
    const bodies = new Map<string, Body>();
    for (const r of runners) bodies.set(r.id, { id: r.id, name: r.name, color: r.color, x: r.x, z: r.z, vx: r.vx, vz: r.vz, f: r.f, m: flags(r) });

    const holder = s.holder;
    const hb = holder && holder !== DOG_ID ? bodies.get(holder) : null;
    const tk = s.turkey;

    const tokenFor = (r: Runner): { x: number; z: number; d: number } | null => {
      const tokens = s.tokens ?? [];
      const make = (t: (typeof tokens)[number]) => ({ x: t.p[0], z: t.p[1], d: Math.hypot(t.p[0] - r.x, t.p[1] - r.z) });
      const mine = claims.get(r.id);
      if (mine && mine.until > now) {
        const t = tokens.find((x) => x.id === mine.id);
        if (t) return make(t);
      }
      const taken = new Set([...claims].filter(([id, c]) => id !== r.id && c.until > now).map(([, c]) => c.id));
      const list = tokens.map((t) => ({ t, ...make(t) })).sort((a, b) => a.d - b.d);
      const pick = list.find((x) => !taken.has(x.t.id)) ?? list[0];
      if (!pick) return null;
      claims.set(r.id, { id: pick.t.id, until: now + 5000 });
      return pick;
    };
    /** What a runner goes for before the turkey: the trap and the leprechaun, or a token close by. */
    const special = (r: Runner): { x: number; z: number } | null => {
      const L = s.lep;
      if (L && !L.by) {
        const trap = s.trap;
        const lepAt = { x: L.p[0], z: L.p[1] };
        if (trap?.by === r.id) return lepAt;
        if (trap && !trap.by) {
          const d = (o: Runner) => Math.hypot(o.x - trap.p[0], o.z - trap.p[1]);
          const best = runners.filter((o) => o.id !== holder).sort((a, b) => d(a) - d(b))[0];
          if (best === r) return { x: trap.p[0], z: trap.p[1] };
        } else if (Math.random() < 0.3) return lepAt;
      }
      const t = tokenFor(r);
      return t && t.d < 6 && Math.random() < 0.6 ? t : null;
    };

    for (const r of runners) {
      const mine = holder === r.id;
      r.dodge = Math.max(0, r.dodge - dt);
      r.dodgeCd = Math.max(0, r.dodgeCd - dt);
      r.dip = Math.max(0, r.dip - dt);
      r.dipCd = Math.max(0, r.dipCd - dt);
      r.lunge = Math.max(0, r.lunge - dt);
      r.lungeCd = Math.max(0, r.lungeCd - dt);
      r.held = mine ? r.held + dt : 0;
      r.think -= dt;

      // --- where it wants to go
      let sp: { x: number; z: number } | null;
      if (r.think <= 0) {
        r.think = 0.2 + Math.random() * 0.25;
        if (!playing) {
          // between rounds: mill about near the middle
          r.aim = { x: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 4 };
        } else if (!mine && (sp = special(r))) {
          r.aim = sp;
        } else if (mine) {
          // away from the nearest threats, and away from the edge
          let ax = 0;
          let az = 0;
          const threat = (x: number, z: number, w: number) => {
            const dx = r.x - x;
            const dz = r.z - z;
            const d = Math.max(0.5, Math.hypot(dx, dz));
            ax += (dx / d) * (w / d);
            az += (dz / d) * (w / d);
          };
          for (const o of runners) if (o !== r) threat(o.x, o.z, 1);
          threat(s.dog.p[0], s.dog.p[1], 1.4);
          ax -= r.x * 0.05;
          az -= r.z * 0.05;
          r.aim = { x: r.x + ax * 4, z: r.z + az * 4 };
        } else if (holder === DOG_ID) {
          r.aim = { x: s.dog.p[0] + s.dog.v[0] * 0.3, z: s.dog.p[1] + s.dog.v[1] * 0.3 };
        } else if (hb) {
          const lead = Math.min(0.6, Math.hypot(hb.x - r.x, hb.z - r.z) / 10);
          r.aim = { x: hb.x + hb.vx * lead, z: hb.z + hb.vz * lead };
        } else {
          // loose: where it will land, roughly
          const t = tk.s === AIR ? 0.4 : 0;
          r.aim = { x: tk.p[0] + tk.v[0] * t, z: tk.p[2] + tk.v[2] * t };
        }
      }

      let wx = r.aim.x - r.x;
      let wz = r.aim.z - r.z;
      const wl = Math.hypot(wx, wz);
      const push = wl > 0.3 ? 1 : wl / 0.3;
      if (wl > 0.001) (wx /= wl), (wz /= wl);
      if (r.round > 0) {
        // going round something: mostly sideways
        r.round -= dt;
        const tx = -wz * r.side;
        const tz = wx * r.side;
        wx = tx * 0.8 + wx * 0.2;
        wz = tz * 0.8 + wz * 0.2;
      }

      // --- the moves
      if (playing && mine) {
        const near = nearest(runners, r);
        if (near < 1.6 * (T.touchReach / 0.95) && r.dodgeCd <= 0 && Math.random() < 0.5) {
          r.dodge = T.dodgeSeconds;
          r.dodgeCd = T.holdDodgeCooldown;
          const side = Math.random() < 0.5 ? 1 : -1;
          r.vx = -wz * side * T.holdDodgeSpeed;
          r.vz = wx * side * T.holdDodgeSpeed;
        } else if (near < 1.2 * (T.touchReach / 0.95) && r.dipCd <= 0 && Math.random() < 0.25) {
          r.dip = T.dipSeconds;
          r.dipCd = T.dipCooldown;
        }
        // tired or cornered: wind up and throw, toward open floor
        if (r.windup < 0 && (r.held > 12 + r.pace * 10 || (near < 1.4 && r.dodgeCd > 0)) && Math.random() < dt * 1.5) r.windup = 0;
        if (r.windup >= 0) {
          r.windup += dt;
          if (r.windup > 0.35 + Math.random() * 0.4) {
            const k = Math.min(1, r.windup / T.windupSeconds);
            const sp = T.throwSpeedMin + (T.throwSpeedMax - T.throwSpeedMin) * k;
            const lift = T.throwLiftMin + (T.throwLiftMax - T.throwLiftMin) * k;
            const fx = Math.sin(r.f);
            const fz = Math.cos(r.f);
            auth.intent(r.id, { k: 'throw', v: [fx * sp + r.vx * T.throwCarry, lift, fz * sp + r.vz * T.throwCarry] }, bodies);
            r.windup = -1;
          }
        }
      } else {
        r.windup = -1;
        const L = s.lep;
        if (playing && L && !L.by && r.lungeCd <= 0 && Math.hypot(L.p[0] - r.x, L.p[1] - r.z) < T.lungeReach * 0.95) {
          // after the leprechaun: a lunge reaches farther than a touch
          r.lunge = T.lungeSeconds;
          r.lungeCd = T.lungeCooldown;
          r.vx += Math.sin(r.f) * T.lungeBoost;
          r.vz += Math.cos(r.f) * T.lungeBoost;
          auth.intent(r.id, { k: 'lunge' }, bodies);
        }
        if (playing && hb && r.lungeCd <= 0 && Math.hypot(hb.x - r.x, hb.z - r.z) < T.lungeReach * 0.95) {
          r.lunge = T.lungeSeconds;
          r.lungeCd = T.lungeCooldown + Math.random() * 0.6;
          r.vx += Math.sin(r.f) * T.lungeBoost;
          r.vz += Math.cos(r.f) * T.lungeBoost;
          auth.intent(r.id, { k: 'lunge' }, bodies);
        }
      }

      // --- running, with the same limits as a real player
      const tired = Math.min(1, r.held / T.holdTireSeconds);
      let top = (mine ? T.holdSpeed + (T.holdSpeedTired - T.holdSpeed) * tired : T.runSpeed) * r.pace;
      if (!playing) top *= 0.35;
      if (r.dip > 0) top *= T.dipSpeedFactor;
      if (r.windup >= 0) top *= 0.75;
      if (r.dodge <= 0) {
        const accel = (mine ? T.holdAccel : T.accel) * dt;
        const dx = wx * top * push - r.vx;
        const dz = wz * top * push - r.vz;
        const d = Math.hypot(dx, dz);
        const k = d > accel ? accel / d : 1;
        r.vx += dx * k;
        r.vz += dz * k;
      }
      const p = { x: r.x + r.vx * dt, z: r.z + r.vz * dt };
      const hit = keepOut(game.env, p, T.bodyRadius) ?? keepIn(game.env.bounds, p, T.bodyRadius);
      if (hit) {
        const into = r.vx * hit.x + r.vz * hit.z;
        if (into < 0) (r.vx -= into * hit.x), (r.vz -= into * hit.z);
        if (r.round <= 0 && Math.random() < 0.3) (r.round = 0.4 + Math.random() * 0.5), (r.side = Math.random() < 0.5 ? -1 : 1);
      }
      // a soft shove apart
      for (const o of runners) {
        if (o === r) continue;
        const dx = p.x - o.x;
        const dz = p.z - o.z;
        const d = Math.hypot(dx, dz);
        const min = T.bodyRadius * 2;
        if (d > 0.001 && d < min) (p.x += (dx / d) * (min - d) * 0.5), (p.z += (dz / d) * (min - d) * 0.5);
      }
      keepIn(game.env.bounds, p, T.bodyRadius);
      r.x = p.x;
      r.z = p.z;
      if (Math.hypot(r.vx, r.vz) > 0.3 && r.dodge <= 0) r.f = Math.atan2(r.vx, r.vz);

      // drawn as any other player
      const pose = { n: r.name, c: r.color, p: [r.x, r.z] as [number, number], v: [r.vx, r.vz] as [number, number], f: r.f, m: flags(r) };
      const remote = game.remotes.get(r.id);
      if (remote) (remote.pose = pose), (remote.at = now);
      else game.remotes.set(r.id, { pose, at: now, shown: new THREE.Vector3(r.x, 0, r.z), facing: r.f });
    }

    game.snap = auth.step(dt, bodies);
    game.snapAt = now;
    direct(game.snap);
    notify();
  }, 1000 / 30);
}

function flags(r: Runner): number {
  return (r.dip > 0 ? F_DIP : 0) | (r.dodge > 0 ? F_DODGE : 0) | (r.lunge > 0 ? F_LUNGE : 0) | (r.windup >= 0 ? F_WINDUP : 0);
}

function nearest(all: Runner[], r: Runner): number {
  let best = Infinity;
  for (const o of all) if (o !== r) best = Math.min(best, Math.hypot(o.x - r.x, o.z - r.z));
  return best;
}
