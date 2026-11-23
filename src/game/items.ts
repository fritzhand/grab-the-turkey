/**
 * The extras, run by the host along with the turkey and the dog (a place can switch them off: extras: false).
 *
 * Turkey tokens: there are always five lying about, and the moment someone touches one, another turns up
 * somewhere else. A point each, double if you are holding the turkey.
 *
 * The leprechaun: once a minute one shows up somewhere in the place, small and quick, and runs from anyone who
 * comes near (and hops away, out of sight and in again close by, when they get too near). Catch it by hand: 25
 * points. Or pick up the trap, which lies somewhere else in a different place each time, and put it on the
 * leprechaun (touch it, or lunge): 50 points. Double, too, if you are holding the turkey. It slips away after a
 * while if nobody does.
 */
import { keepIn, keepOut, type Environment } from '../env';
import { pickSpot, type Spot } from '../env/spots';
import type { Body } from './authority';
import { T } from './tuning';
import type { GameEvent, Snapshot } from './types';

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export interface ItemHooks {
  event(e: Omit<GameEvent, 'id'>): void;
  /** Whether this player is in the middle of a lunge (which reaches farther). */
  lunging(id: string): boolean;
}

export const extrasOn = (env: Environment) => env.extras !== false;

export class Items {
  private tokenId = 0;
  private lepIn = 0;
  private wander = { t: 0, f: 0 };
  private lastTrap: Spot | null = null;

  /** A new round: five tokens about, and the first leprechaun a minute off. */
  start(s: Snapshot, env: Environment): void {
    this.clear(s);
    this.lepIn = T.lepEverySeconds * 1000;
    if (extrasOn(env)) this.fill(s, env);
  }

  /** The round is over (or the place changed). */
  clear(s: Snapshot): void {
    s.tokens = [];
    s.lep = null;
    s.trap = null;
  }

  /** A new host picks up from a snapshot: carry on counting from where the round is. */
  adopt(s: Snapshot): void {
    this.tokenId = (s.tokens ?? []).reduce((n, t) => Math.max(n, t.id), 0);
    const every = T.lepEverySeconds * 1000;
    this.lepIn = every - ((T.roundSeconds * 1000 - s.left) % every);
  }

  step(s: Snapshot, env: Environment, bodies: Map<string, Body>, dt: number, hooks: ItemHooks): void {
    if (s.phase !== 'play' || !extrasOn(env)) return;
    this.tokens(s, env, bodies, hooks);
    this.leprechaun(s, env, bodies, dt, hooks);
  }

  /** What points are worth to someone: double while they hold the turkey. */
  private worth(s: Snapshot, id: string, points: number): number {
    return s.holder === id ? points * T.holdMultiplier : points;
  }

  // --- tokens -------------------------------------------------------------------------------------

  /** Five tokens, always: wherever there are fewer, one turns up somewhere else. */
  private fill(s: Snapshot, env: Environment) {
    const tokens = (s.tokens ??= []);
    for (let tries = 0; tokens.length < T.tokenCount && tries < T.tokenCount * 4; tries++) {
      const avoid = tokens.map((t) => ({ x: t.p[0], z: t.p[1] }));
      if (s.trap) avoid.push({ x: s.trap.p[0], z: s.trap.p[1] });
      const spot = pickSpot(env, { avoid, gap: 5 });
      if (spot) tokens.push({ id: ++this.tokenId, p: [spot.x, spot.z] });
    }
  }

  private tokens(s: Snapshot, env: Environment, bodies: Map<string, Body>, hooks: ItemHooks) {
    const tokens = (s.tokens ??= []);
    for (const b of bodies.values())
      for (let i = tokens.length - 1; i >= 0; i--) {
        const t = tokens[i];
        if (Math.hypot(b.x - t.p[0], b.z - t.p[1]) > T.tokenReach) continue;
        tokens.splice(i, 1);
        const n = this.worth(s, b.id, T.tokenPoints);
        s.scores[b.id] = (s.scores[b.id] ?? 0) + n * 1000;
        hooks.event({ k: 'token', b: b.id, n });
      }
    this.fill(s, env);
  }

  // --- the leprechaun -----------------------------------------------------------------------------

  private leprechaun(s: Snapshot, env: Environment, bodies: Map<string, Body>, dt: number, hooks: ItemHooks) {
    const ms = dt * 1000;
    this.lepIn -= ms;
    if (!s.lep && this.lepIn <= 0) {
      this.lepIn = T.lepEverySeconds * 1000;
      if (s.left > 15000) this.appear(s, env, hooks);
    }
    const L = s.lep;
    if (!L) return;

    L.t -= ms;
    if (L.by) {
      // caught: it sits under the trap until the trap pops (or, caught by hand, laughs and vanishes)
      L.v = [0, 0];
      if (L.t <= 0) (s.lep = null), (s.trap = null);
      return;
    }
    if (L.t <= 0) {
      hooks.event({ k: 'gone' });
      s.lep = null;
      s.trap = null;
      return;
    }

    // the trap: carried by whoever touched it first, and it follows them
    const trap = s.trap;
    if (trap) {
      if (trap.by) {
        const c = bodies.get(trap.by);
        if (c) trap.p = [c.x, c.z];
        else trap.by = null; // they have gone: it stays where they were
      } else {
        for (const b of bodies.values())
          if (Math.hypot(b.x - trap.p[0], b.z - trap.p[1]) < T.trapReach) {
            trap.by = b.id;
            hooks.event({ k: 'trap', b: b.id });
            break;
          }
      }
    }

    // it runs from whoever is near, and wanders when nobody is
    let fx = 0;
    let fz = 0;
    let near = Infinity;
    for (const b of bodies.values()) {
      const dx = L.p[0] - b.x;
      const dz = L.p[1] - b.z;
      const d = Math.hypot(dx, dz);
      near = Math.min(near, d);
      if (d < T.lepFleeRange) {
        const w = 1 / Math.max(0.4, d);
        fx += (dx / Math.max(d, 0.01)) * w;
        fz += (dz / Math.max(d, 0.01)) * w;
      }
    }
    let wx: number;
    let wz: number;
    let speed: number = T.lepWanderSpeed;
    if (near < T.lepFleeRange) {
      const l = Math.hypot(fx, fz) || 1;
      wx = fx / l;
      wz = fz / l;
      speed = T.lepSpeed;
    } else {
      this.wander.t -= dt;
      if (this.wander.t <= 0) (this.wander.t = rand(0.8, 1.8)), (this.wander.f = Math.random() * Math.PI * 2);
      wx = Math.sin(this.wander.f);
      wz = Math.cos(this.wander.f);
    }
    const ax = wx * speed - L.v[0];
    const az = wz * speed - L.v[1];
    const al = Math.hypot(ax, az);
    const max = 20 * dt;
    const k = al > max ? max / al : 1;
    L.v = [L.v[0] + ax * k, L.v[1] + az * k];
    const p = { x: L.p[0] + L.v[0] * dt, z: L.p[1] + L.v[1] * dt };
    const hit = keepOut(env, p, T.lepRadius) ?? keepIn(env.bounds, p, T.lepRadius);
    if (hit) {
      // along the wall, whichever way it was already leaning
      const tx = -hit.z;
      const tz = hit.x;
      const side = tx * wx + tz * wz < 0 ? -1 : 1;
      L.v = [tx * side * speed, tz * side * speed];
    }
    L.p = [p.x, p.z];
    if (Math.hypot(L.v[0], L.v[1]) > 0.3) L.f = Math.atan2(L.v[0], L.v[1]);

    // too close: it hops away (out of sight and in again, near by), then cannot for a few seconds
    L.hop -= ms;
    if (L.hop <= 0 && near < T.lepHopRange) {
      const spot = pickSpot(env, { near: { x: L.p[0], z: L.p[1], min: 4, max: 9 } });
      if (spot) {
        L.p = [spot.x, spot.z];
        L.v = [0, 0];
      }
      L.hop = rand(T.lepHopMin, T.lepHopMax) * 1000;
    }

    // caught: by touch (or a lunge). With the trap on your back, the trap goes on it: 50. Without, by hand: 25.
    for (const c of bodies.values()) {
      const reach = hooks.lunging(c.id) ? T.lungeReach : T.lepReach;
      if (Math.hypot(c.x - L.p[0], c.z - L.p[1]) >= reach) continue;
      const trapped = trap?.by === c.id;
      const n = this.worth(s, c.id, trapped ? T.lepPoints : T.lepHandsPoints);
      L.by = c.id;
      L.how = trapped ? 'trap' : 'hands';
      L.t = (trapped ? T.lepTrapSeconds : T.lepHandsSeconds) * 1000;
      s.scores[c.id] = (s.scores[c.id] ?? 0) + n * 1000;
      s.trap = trapped ? { p: [L.p[0], L.p[1]], by: null } : null;
      hooks.event({ k: 'caught', b: c.id, a: L.how, n });
      break;
    }
  }

  /** It shows up, with the trap somewhere else. */
  private appear(s: Snapshot, env: Environment, hooks: ItemHooks) {
    const spot = pickSpot(env);
    if (!spot) return;
    const avoid = [spot];
    if (this.lastTrap) avoid.push(this.lastTrap);
    const where = pickSpot(env, { avoid, gap: 6 });
    if (!where) return;
    this.lastTrap = where;
    const f = Math.random() * Math.PI * 2;
    s.lep = { p: [spot.x, spot.z], v: [0, 0], f, t: T.lepStaySeconds * 1000, by: null, hop: rand(4, 6) * 1000 };
    s.trap = { p: [where.x, where.z], by: null };
    this.wander = { t: 0, f };
    hooks.event({ k: 'lep' });
  }
}
