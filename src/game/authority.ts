/**
 * The host's half of the game: the turkey, the dog, the scores and the clock. Exactly one phone
 * runs this at a time (the host); every other phone draws what it sends. It reads each player's
 * position from the poses they send, and decides who has the turkey.
 */
import { getEnvironment, groundAt, keepIn, keepOut, type Environment } from '../env';
import { getScale, T } from './tuning';
import {
  AIR, DOG_CARRY, DOG_CHASE, DOG_ID, DOG_REST, F_DIP, HELD, REST,
  type GameEvent, type Intent, type Snapshot,
} from './types';

/** A player as the host sees them this tick (extrapolated from their last pose). */
export interface Body {
  id: string;
  name: string;
  color: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  f: number;
  m: number;
}

export function freshSnapshot(host: string, envId: string): Snapshot {
  const env = getEnvironment(envId);
  return {
    host,
    seq: 0,
    env: env.id,
    phase: 'lobby',
    left: 0,
    round: 0,
    holder: null,
    turkey: { s: REST, p: [...env.turkeyStart], v: [0, 0, 0], by: null, nc: 0 },
    dog: { p: [...env.dogStart], v: [0, 0], f: 0, mode: DOG_REST, t: 1.5 },
    scores: {},
    names: { [DOG_ID]: T.dogName },
    colors: {},
    immune: {},
    events: [],
  };
}

const MOUTH = 0.58; // how far in front of the dog's center it carries the turkey

export class Authority {
  s: Snapshot;
  private clock = 0;
  private lunges = new Map<string, number>();
  private dogAim = { x: 0, z: 0, t: 0 };
  private slide = { side: 1, t: 0 };
  private eventId = 0;
  /** Rounds run back to back: after the results, the next countdown starts by itself. */
  auto = false;

  constructor(from: Snapshot, host: string) {
    this.s = structuredClone(from);
    this.s.host = host;
    this.eventId = from.events.reduce((n, e) => Math.max(n, e.id), 0);
  }

  get env(): Environment {
    return getEnvironment(this.s.env);
  }

  private event(e: Omit<GameEvent, 'id'>) {
    this.s.events = [...this.s.events.slice(-5), { ...e, id: ++this.eventId }];
  }

  intent(from: string, i: Intent, bodies: Map<string, Body>): void {
    const s = this.s;
    if (i.k === 'lunge') this.lunges.set(from, this.clock + T.lungeSeconds);
    else if (i.k === 'throw') {
      const b = bodies.get(from);
      if (s.holder !== from || !b) return;
      const [vx, vy, vz] = i.v;
      const sp = Math.hypot(vx, vy, vz);
      const k = sp > 18 ? 18 / sp : 1;
      const dir = Math.hypot(vx, vz) || 1;
      s.turkey = {
        s: AIR,
        p: [b.x + (vx / dir) * 0.5 * getScale(), 1.25 * getScale(), b.z + (vz / dir) * 0.5 * getScale()],
        v: [vx * k, vy * k, vz * k],
        by: from,
        nc: T.throwNoCatchSeconds * 1000,
      };
      s.holder = null;
      this.event({ k: 'throw', a: from });
    } else if (i.k === 'start') {
      if (s.phase === 'lobby' || s.phase === 'over') {
        s.phase = 'countdown';
        s.left = T.countdownSeconds * 1000;
      }
    } else if (i.k === 'env') {
      if (s.phase !== 'lobby' && s.phase !== 'over') return;
      s.env = getEnvironment(i.id).id;
      this.resetProps();
    }
  }

  /** The turkey back on the table, nobody holding it, the dog back in its corner. */
  private resetProps() {
    const env = this.env;
    this.s.holder = null;
    this.s.turkey = { s: REST, p: [...env.turkeyStart], v: [0, 0, 0], by: null, nc: 0 };
    this.s.dog = { p: [...env.dogStart], v: [0, 0], f: 0, mode: DOG_REST, t: 2.5 };
    this.s.immune = {};
  }

  step(dt: number, bodies: Map<string, Body>): Snapshot {
    const s = this.s;
    const env = this.env;
    this.clock += dt;
    const ms = dt * 1000;
    s.seq++;

    for (const b of bodies.values()) {
      s.names[b.id] = b.name;
      s.colors[b.id] = b.color;
    }
    for (const id of Object.keys(s.immune)) {
      s.immune[id] -= ms;
      if (s.immune[id] <= 0) delete s.immune[id];
    }

    this.clockStep(ms);

    // whoever held it has gone: it falls where they were
    if (s.holder && s.holder !== DOG_ID && !bodies.has(s.holder)) {
      s.holder = null;
      s.turkey.s = AIR;
      s.turkey.v = [0, 0, 0];
      s.turkey.by = null;
    }

    if (s.holder && s.phase === 'play') s.scores[s.holder] = (s.scores[s.holder] ?? 0) + ms;

    this.turkeyStep(dt, env, bodies);
    this.takeStep(bodies);
    this.dogStep(dt, env, bodies);
    return s;
  }

  private clockStep(ms: number) {
    const s = this.s;
    if (s.phase === 'lobby') return;
    s.left -= ms;
    if (s.left > 0) return;
    if (s.phase === 'countdown') {
      s.phase = 'play';
      s.left = T.roundSeconds * 1000;
      s.round++;
      s.scores = {};
      s.events = [];
      this.resetProps();
    } else if (s.phase === 'play') {
      s.phase = 'over';
      s.left = 0;
      s.last = {
        round: s.round,
        scores: Object.entries(s.scores)
          .sort((a, b) => b[1] - a[1])
          .map(([id, v]) => [id, s.names[id] ?? '?', v]),
      };
      s.holder = null;
      s.turkey.s = AIR;
      s.turkey.v = [0, 0, 0];
      if (this.auto) s.left = T.autoNextSeconds * 1000;
    } else if (this.auto && s.left <= 0 && s.last) {
      // the results have had their time: the next round
      s.phase = 'countdown';
      s.left = T.countdownSeconds * 1000;
    } else {
      s.left = 0;
    }
  }

  private holderSpot(bodies: Map<string, Body>): [number, number, number] | null {
    const s = this.s;
    if (s.holder === DOG_ID) {
      const d = s.dog;
      const k = getScale();
      return [d.p[0] + Math.sin(d.f) * MOUTH * k, 0.42 * k, d.p[1] + Math.cos(d.f) * MOUTH * k];
    }
    const b = s.holder ? bodies.get(s.holder) : null;
    if (!b) return null;
    const dip = b.m & F_DIP;
    const k = getScale();
    return [b.x + Math.sin(b.f) * 0.38 * k, (dip ? 0.62 : 1.0) * k, b.z + Math.cos(b.f) * 0.38 * k];
  }

  private turkeyStep(dt: number, env: Environment, bodies: Map<string, Body>) {
    const tk = this.s.turkey;
    if (tk.nc > 0) tk.nc -= dt * 1000;
    if (this.s.holder) {
      const spot = this.holderSpot(bodies);
      if (spot) tk.p = spot;
      tk.s = HELD;
      tk.v = [0, 0, 0];
      return;
    }
    const p = { x: tk.p[0], z: tk.p[2] };
    let [vx, vy, vz] = tk.v;
    let y = tk.p[1];
    if (tk.s === HELD) tk.s = AIR;
    if (tk.s === AIR) {
      vy -= T.gravity * dt;
      const drag = Math.exp(-T.airDrag * dt);
      vx *= drag;
      vz *= drag;
      y += vy * dt;
    } else {
      // resting: it slides to a stop, and falls off whatever it is on when it slides past the edge
      const sp = Math.hypot(vx, vz);
      const slow = Math.max(0, sp - T.floorFriction * dt);
      vx = sp > 0 ? (vx / sp) * slow : 0;
      vz = sp > 0 ? (vz / sp) * slow : 0;
    }
    p.x += vx * dt;
    p.z += vz * dt;
    const wall = keepOut(env, p, T.turkeyRadius, y);
    if (wall) {
      const dot = vx * wall.x + vz * wall.z;
      if (dot < 0) {
        vx -= 1.5 * dot * wall.x;
        vz -= 1.5 * dot * wall.z;
      }
    }
    const edge = keepIn(env.bounds, p, T.turkeyRadius);
    if (edge) {
      const dot = vx * edge.x + vz * edge.z;
      if (dot < 0) {
        vx -= 1.5 * dot * edge.x;
        vz -= 1.5 * dot * edge.z;
      }
    }
    const ground = groundAt(env, p.x, p.z, y + 0.25);
    if (tk.s === AIR && y <= ground) {
      y = ground;
      if (vy < -1.6) {
        vy = -vy * T.bounce;
        vx *= 0.7;
        vz *= 0.7;
      } else {
        vy = 0;
        tk.s = REST;
      }
    } else if (tk.s === REST && y > ground + 0.02) {
      tk.s = AIR;
    } else if (tk.s === REST) y = ground;
    tk.p = [p.x, y, p.z];
    tk.v = [vx, vy, vz];
  }

  /** Steals, catches and pickups. */
  private takeStep(bodies: Map<string, Body>) {
    const s = this.s;
    const tk = s.turkey;
    const reachOf = (id: string) => ((this.lunges.get(id) ?? 0) > this.clock ? T.lungeReach : T.touchReach);
    const give = (to: string, e: Omit<GameEvent, 'id'>) => {
      s.holder = to;
      tk.s = HELD;
      s.immune[to] = (to === DOG_ID ? T.dogSnatchImmunitySeconds : T.stealImmunitySeconds) * 1000;
      this.lunges.delete(to);
      this.event(e);
    };

    if (s.holder === DOG_ID) {
      // the dog just snatched it: nobody can take it straight back
      if (s.immune[DOG_ID]) return;
      const d = s.dog;
      let best: Body | null = null;
      let bestD = Infinity;
      for (const b of bodies.values()) {
        const dist = Math.hypot(b.x - d.p[0], b.z - d.p[1]);
        if (dist < reachOf(b.id) + 0.15 && dist < bestD) (best = b), (bestD = dist);
      }
      if (best) {
        give(best.id, { k: 'steal', a: DOG_ID, b: best.id });
        s.dog.mode = DOG_REST;
        s.dog.t = T.dogStunSeconds;
      }
      return;
    }

    if (s.holder) {
      const h = bodies.get(s.holder);
      if (!h || s.immune[h.id] || h.m & F_DIP) return;
      let best: Body | null = null;
      let bestD = Infinity;
      for (const b of bodies.values()) {
        if (b.id === h.id) continue;
        const dist = Math.hypot(b.x - h.x, b.z - h.z);
        if (dist < reachOf(b.id) && dist < bestD) (best = b), (bestD = dist);
      }
      if (best) {
        give(best.id, { k: 'steal', a: h.id, b: best.id });
        return;
      }
      const d = s.dog;
      if (d.mode === DOG_CHASE && Math.hypot(d.p[0] - h.x, d.p[1] - h.z) < T.dogReach + T.bodyRadius) {
        give(DOG_ID, { k: 'dog', a: h.id });
        d.mode = DOG_CARRY;
        d.t = T.dogCarryMax;
        // and it bolts, straight away from whoever it took it from
        const ax = d.p[0] - h.x;
        const az = d.p[1] - h.z;
        const al = Math.hypot(ax, az) || 1;
        d.v = [(ax / al) * T.dogCarrySpeed, (az / al) * T.dogCarrySpeed];
      }
      return;
    }

    // nobody holds it: a catch in the air, or a pickup off the floor or the table
    const [tx, ty, tz] = tk.p;
    let best: Body | null = null;
    let bestD = Infinity;
    for (const b of bodies.values()) {
      if (tk.by === b.id && tk.nc > 0) continue;
      const dist = Math.hypot(b.x - tx, b.z - tz);
      const ok = tk.s === AIR ? dist < T.catchReach && ty < T.catchHeightMax : dist < T.pickupReach && ty < T.pickupHeightMax;
      if (ok && dist < bestD) (best = b), (bestD = dist);
    }
    if (best) {
      give(best.id, tk.s === AIR && tk.by ? { k: 'catch', a: tk.by, b: best.id } : { k: 'pickup', b: best.id });
      return;
    }
    const d = s.dog;
    if (d.mode === DOG_CHASE && ty < T.dogHeightMax && Math.hypot(d.p[0] - tx, d.p[1] - tz) < T.dogReach + 0.3) {
      give(DOG_ID, { k: 'dog' });
      d.mode = DOG_CARRY;
      d.t = T.dogCarryMax;
    }
  }

  private dogStep(dt: number, env: Environment, bodies: Map<string, Body>) {
    const s = this.s;
    const d = s.dog;
    let wx = 0;
    let wz = 0;
    let speed = 0;
    d.t -= dt;

    if (d.mode === DOG_REST) {
      if (d.t <= 0) d.mode = DOG_CHASE;
    } else if (d.mode === DOG_CARRY) {
      // keep away from everyone, and away from the edges
      for (const b of bodies.values()) {
        const dx = d.p[0] - b.x;
        const dz = d.p[1] - b.z;
        const k = 1 / Math.max(0.5, dx * dx + dz * dz);
        wx += dx * k;
        wz += dz * k;
      }
      const out = env.bounds.kind === 'circle' ? env.bounds.r : Math.min(env.bounds.hx, env.bounds.hz);
      const r = Math.hypot(d.p[0], d.p[1]);
      const k = Math.max(0, r / out - 0.55) * 0.6;
      wx -= (d.p[0] / (r || 1)) * k;
      wz -= (d.p[1] / (r || 1)) * k;
      wx += Math.sin(this.clock * 1.3) * 0.05;
      wz += Math.cos(this.clock * 1.1) * 0.05;
      speed = T.dogCarrySpeed;
      if (d.t <= 0) {
        // it has had enough: drops it and sits
        s.holder = null;
        s.turkey = { s: AIR, p: [d.p[0] + Math.sin(d.f) * 0.6, 0.35, d.p[1] + Math.cos(d.f) * 0.6], v: [Math.sin(d.f) * 1.5, 1.5, Math.cos(d.f) * 1.5], by: null, nc: 0 };
        d.mode = DOG_REST;
        d.t = T.dogRestSeconds;
        this.event({ k: 'drop' });
      }
    } else {
      // chase: it looks for the turkey now and then and runs at where it last saw it
      this.dogAim.t -= dt;
      if (this.dogAim.t <= 0) {
        const spot = this.holderSpot(bodies) ?? s.turkey.p;
        this.dogAim = { x: spot[0], z: spot[2], t: T.dogLookSeconds };
      }
      wx = this.dogAim.x - d.p[0];
      wz = this.dogAim.z - d.p[1];
      const dist = Math.hypot(wx, wz);
      speed = Math.min(T.dogSpeed, dist * 3);
    }

    const wl = Math.hypot(wx, wz);
    const want = wl > 1e-4 ? [(wx / wl) * speed, (wz / wl) * speed] : [0, 0];
    let ax = want[0] - d.v[0];
    let az = want[1] - d.v[1];
    const al = Math.hypot(ax, az);
    const max = T.dogAccel * dt;
    if (al > max) (ax *= max / al), (az *= max / al);
    d.v[0] += ax;
    d.v[1] += az;
    const p = { x: d.p[0] + d.v[0] * dt, z: d.p[1] + d.v[1] * dt };
    const hit = keepOut(env, p, T.dogRadius);
    this.slide.t -= dt;
    if (hit && wl > 1e-4) {
      // pressed against something: go around it. It picks the way that heads toward where it
      // wants to go, then keeps going that way until it is clear, so it never dithers in front
      // of a table with its target straight across.
      const tx = -hit.z;
      const tz = hit.x;
      if (this.slide.t <= 0) this.slide.side = tx * wx + tz * wz < 0 ? -1 : 1;
      this.slide.t = 0.6;
      d.v[0] = tx * this.slide.side * speed * 0.9;
      d.v[1] = tz * this.slide.side * speed * 0.9;
    }
    keepIn(env.bounds, p, T.dogRadius);
    d.p = [p.x, p.z];
    if (Math.hypot(d.v[0], d.v[1]) > 0.3) d.f = Math.atan2(d.v[0], d.v[1]);
  }
}
