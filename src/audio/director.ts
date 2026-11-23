/**
 * Turns what happens in the game into sound and achievements. It watches each new snapshot: the
 * round's turns (countdown, go, one minute left, the last ten seconds, the end), who took the
 * turkey from whom, the turkey's bounces and the dog's barks, and this player's achievements.
 */
import { game } from '../game/store';
import { AIR, DOG_CHASE, DOG_ID, REST, type Snapshot } from '../game/types';
import { music } from './music';
import { sfx } from './sound';

export interface Achievement {
  title: string;
  detail: string;
}

const listeners = new Set<(a: Achievement) => void>();
export function onAchievement(f: (a: Achievement) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

let prev: Snapshot | null = null;
let lastEvent = 0;
let earned = new Set<string>();
let holdStart = 0;
let lastBark = 0;

function award(key: string, title: string, detail: string) {
  if (earned.has(key)) return;
  earned.add(key);
  sfx.fanfare();
  listeners.forEach((f) => f({ title, detail }));
}

const HOLDS: [number, string, string][] = [
  [10, 'Drumstick Defender', 'Held the turkey 10 seconds straight'],
  [30, 'Gravy Guardian', 'Held the turkey 30 seconds straight'],
  [60, 'Turkey Tycoon', 'A whole minute without letting go'],
];

export function direct(s: Snapshot | null): void {
  if (!s) return;
  const p = prev;
  prev = s;
  const me = game.me.id;
  const now = performance.now();

  // --- the round's turns
  music(s.phase === 'play' ? (s.left < 60_000 ? 2 : 1) : 0);
  if (p && p.phase !== s.phase) {
    if (s.phase === 'countdown') earned = new Set();
    if (s.phase === 'play') sfx.beep(true);
    if (s.phase === 'over') {
      const top = s.last?.scores[0];
      sfx.roundOver(!!top && top[0] === me);
      if (p.holder === me) award('buzzer', 'Final Buzzer', 'Holding the turkey when time ran out');
    }
  }
  if (p && s.phase === 'countdown' && p.phase === 'countdown' && Math.ceil(s.left / 1000) < Math.ceil(p.left / 1000)) sfx.beep();
  if (p && s.phase === 'play' && p.phase === 'play') {
    const sec = Math.ceil(s.left / 1000);
    const was = Math.ceil(p.left / 1000);
    if (sec !== was) {
      if (sec === 60) listeners.forEach((f) => f({ title: 'One minute left', detail: 'The music picks up. So should you.' }));
      if (sec === 30) sfx.warning();
      if (sec <= 10 && sec > 0) sfx.tick(sec <= 3);
    }
  }
  if (p && s.phase === 'countdown' && p.phase !== 'countdown') sfx.beep();

  // --- what just happened
  for (const e of s.events) {
    if (e.id <= lastEvent) continue;
    lastEvent = e.id;
    if (!p) continue; // joining: do not replay old news
    const mine = e.b === me;
    switch (e.k) {
      case 'steal':
        if (mine) {
          sfx.gotIt();
          if (e.a === DOG_ID) award('dog', 'Dog Whisperer', `Took the turkey back from the dog`);
          else award('first', 'First Grab', 'Your first steal this round');
        } else if (e.a === me) sfx.lostIt();
        else sfx.pop();
        break;
      case 'dog':
        sfx.bark();
        if (e.a === me) sfx.lostIt();
        break;
      case 'catch':
        if (mine) {
          sfx.gotIt();
          if (e.a !== me) award('intercept', 'Interception!', 'Caught somebody else’s throw');
        } else sfx.pop();
        break;
      case 'pickup':
        if (mine) sfx.gotIt();
        break;
      case 'drop':
        sfx.bark();
        break;
      case 'throw':
        if (e.a !== me) sfx.throw(0.3);
        break;
      case 'token':
        if (mine) sfx.token();
        break;
      case 'lep':
        sfx.leprechaun();
        break;
      case 'trap':
        if (mine) sfx.trapUp();
        break;
      case 'caught':
        if (mine) {
          sfx.caught();
          if (e.a === 'trap') award('lep', 'Pot of Gold', 'Trapped a leprechaun for fifty points');
          else award('lephands', 'Quick Hands', 'Caught a leprechaun with your bare hands');
        } else sfx.pop();
        break;
      case 'gone':
        sfx.gone();
        break;
    }
  }

  // --- holding on: the milestones
  if (s.holder === me && me) {
    if (!holdStart) holdStart = now;
    const held = (now - holdStart) / 1000;
    if (s.phase === 'play') for (const [sec, title, detail] of HOLDS) if (held >= sec) award(`hold${sec}`, title, detail);
  } else holdStart = 0;

  // --- the turkey hits the floor; the dog barks when it is close and keen
  if (p && !s.holder && !p.holder) {
    const was = p.turkey;
    const is = s.turkey;
    if ((was.s === AIR && is.s === REST) || (was.s === AIR && was.v[1] < -1.6 && is.v[1] > 0)) sfx.bounce();
  }
  const d = s.dog;
  const near = Math.hypot(d.p[0] - game.me.pos.x, d.p[1] - game.me.pos.z) < 3.5;
  if (d.mode === DOG_CHASE && near && now - lastBark > 4500 && Math.random() < 0.05) {
    lastBark = now;
    sfx.bark();
  }
}
