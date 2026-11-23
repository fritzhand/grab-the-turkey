/**
 * Every sound in the game, made in the browser with the Web Audio API: no audio files, so nothing
 * to license and nothing to download. Sound effects for every move, stingers for achievements and
 * for the round's turns, and a music loop (music.ts) that speeds up when a round is on.
 *
 * Browsers only allow sound after a tap, so unlock() is called from the join button.
 */

export type SoundMode = 'all' | 'sfx' | 'off';

let ctx: AudioContext | null = null;
let master: GainNode;
let sfxBus: GainNode;
let musicBus: GainNode;
let noise: AudioBuffer;
let mode: SoundMode = (() => {
  try {
    return (localStorage.getItem('gt-sound') as SoundMode) || 'all';
  } catch {
    return 'all';
  }
})();

export function audio(): { ctx: AudioContext; music: GainNode } | null {
  return ctx ? { ctx, music: musicBus } : null;
}

export function unlock(): void {
  if (ctx) {
    void ctx.resume();
    return;
  }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  // a gentle limiter, so a pile-up of sounds never clips
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 6;
  master.connect(comp).connect(ctx.destination);
  sfxBus = ctx.createGain();
  musicBus = ctx.createGain();
  sfxBus.connect(master);
  musicBus.connect(master);
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  applyMode();
  // phones suspend audio when the page is hidden; pick it back up
  document.addEventListener('visibilitychange', () => !document.hidden && void ctx?.resume());
}

function applyMode() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(mode === 'off' ? 0 : 0.9, t, 0.05);
  musicBus.gain.setTargetAtTime(mode === 'all' ? 0.22 : 0, t, 0.2);
}

export function getMode(): SoundMode {
  return mode;
}
export function setMode(m: SoundMode): void {
  mode = m;
  try {
    localStorage.setItem('gt-sound', m);
  } catch {
    /* private mode */
  }
  applyMode();
}

// ------------------------------------------------------------------ building blocks

type Wave = OscillatorType;

/** A tone that sweeps from f0 to f1 with a quick attack and an exponential tail. */
function tone(f0: number, f1: number, dur: number, vol: number, wave: Wave = 'sine', at = 0, bus?: AudioNode) {
  if (!ctx) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = wave;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus ?? sfxBus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** A burst of filtered noise; the filter sweeps from f0 to f1 (whooshes, steps, hats). */
function hiss(f0: number, f1: number, dur: number, vol: number, q = 1, at = 0, type: BiquadFilterType = 'bandpass', bus?: AudioNode) {
  if (!ctx) return;
  const t = ctx.currentTime + at;
  const s = ctx.createBufferSource();
  s.buffer = noise;
  s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.03, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(bus ?? sfxBus);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.02);
}

export const noteHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export const buses = {
  tone,
  hiss,
};

// ------------------------------------------------------------------ the moves

export const sfx = {
  /** A footfall; heavier when you carry the turkey. */
  step(heavy: boolean) {
    hiss(heavy ? 500 : 900, heavy ? 160 : 260, heavy ? 0.09 : 0.06, heavy ? 0.16 : 0.09, 2.5);
    if (heavy) tone(110, 70, 0.08, 0.08);
  },
  dodge() {
    hiss(500, 3800, 0.22, 0.32, 1.4);
    tone(300, 520, 0.12, 0.05, 'triangle');
  },
  dip() {
    tone(420, 150, 0.18, 0.2, 'sine');
    hiss(1200, 300, 0.12, 0.08, 1);
  },
  lunge() {
    hiss(1500, 600, 0.14, 0.22, 2);
    tone(220, 330, 0.08, 0.06, 'square');
  },
  throw(power: number) {
    hiss(400, 2600 + power * 2000, 0.35, 0.36, 1.2);
    tone(330, 660 + power * 300, 0.18, 0.1, 'triangle');
  },
  bounce() {
    tone(150, 60, 0.16, 0.3, 'sine');
    hiss(700, 200, 0.08, 0.12, 1.5);
  },
  /** You got it: a bright rising triad. */
  gotIt() {
    [72, 76, 79, 84].forEach((n, i) => tone(noteHz(n), noteHz(n), 0.22, 0.16, 'triangle', i * 0.06));
  },
  /** It was taken from you. */
  lostIt() {
    [67, 63, 60].forEach((n, i) => tone(noteHz(n), noteHz(n) * 0.97, 0.26, 0.15, 'triangle', i * 0.09));
  },
  /** A turkey token: a coin. */
  token() {
    tone(1318, 1318, 0.07, 0.12, 'square');
    tone(1760, 1760, 0.22, 0.12, 'square', 0.07);
  },
  /** A leprechaun shows up: a little jig. */
  leprechaun() {
    [79, 83, 86, 83, 79, 91].forEach((n, i) => tone(noteHz(n), noteHz(n), 0.13, 0.11, 'triangle', i * 0.09));
  },
  /** You have the trap. */
  trapUp() {
    tone(330, 520, 0.1, 0.12, 'square');
    tone(660, 660, 0.12, 0.1, 'triangle', 0.09);
  },
  /** The trap comes down: a clang, and a shower of coins. */
  caught() {
    tone(180, 90, 0.3, 0.3, 'sawtooth');
    hiss(1800, 600, 0.25, 0.3, 2);
    [84, 88, 91, 96, 100].forEach((n, i) => tone(noteHz(n), noteHz(n), 0.18, 0.12, 'square', 0.2 + i * 0.07));
  },
  /** It slipped away. */
  gone() {
    [67, 62].forEach((n, i) => tone(noteHz(n), noteHz(n) * 0.97, 0.22, 0.12, 'triangle', i * 0.12));
  },
  /** Someone else's steal, across the room. */
  pop() {
    tone(660, 990, 0.07, 0.08, 'square');
  },
  bark() {
    for (const at of [0, 0.17]) {
      hiss(900, 500, 0.11, 0.38, 3, at);
      tone(520, 330, 0.1, 0.18, 'sawtooth', at);
    }
  },
  /** One countdown second, and the go. */
  beep(go = false) {
    tone(go ? 1046 : 660, go ? 1046 : 660, go ? 0.5 : 0.14, 0.2, 'square');
  },
  /** The last ten seconds. */
  tick(urgent: boolean) {
    tone(urgent ? 1320 : 990, urgent ? 1320 : 990, 0.05, 0.09, 'square');
  },
  /** An achievement. */
  fanfare() {
    [[72, 0], [76, 0.1], [79, 0.2], [84, 0.32]].forEach(([n, at]) => {
      tone(noteHz(n), noteHz(n), 0.35, 0.14, 'square', at);
      tone(noteHz(n - 12), noteHz(n - 12), 0.35, 0.1, 'triangle', at);
    });
  },
  /** The round is over: a horn, and for the winner, a flourish. */
  roundOver(won: boolean) {
    tone(noteHz(55), noteHz(55), 0.9, 0.18, 'sawtooth');
    tone(noteHz(62), noteHz(62), 0.9, 0.12, 'sawtooth');
    if (won) [67, 71, 74, 79, 83].forEach((n, i) => tone(noteHz(n + 5), noteHz(n + 5), 0.3, 0.13, 'square', 0.5 + i * 0.08));
  },
  /** Thirty seconds left. */
  warning() {
    [0, 0.18].forEach((at) => tone(880, 880, 0.12, 0.14, 'square', at));
  },
};

// ------------------------------------------------------------------ the wind-up

let wind: { o: OscillatorNode; g: GainNode } | null = null;

/** A rising whine while the throw winds up (k from 0 to 1); stops when k < 0. */
export function windup(k: number): void {
  if (!ctx) return;
  if (k < 0) {
    if (wind) {
      wind.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.02);
      wind.o.stop(ctx.currentTime + 0.1);
      wind = null;
    }
    return;
  }
  if (!wind) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(0.07, ctx.currentTime, 0.03);
    o.connect(g).connect(sfxBus);
    o.start();
    wind = { o, g };
  }
  wind.o.frequency.setTargetAtTime(220 + k * 520, ctx.currentTime, 0.03);
}
