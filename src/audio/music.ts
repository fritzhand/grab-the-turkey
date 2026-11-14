/**
 * The music: a little harvest-folk loop, written as code. Four bars in G (G, Em, C, D), with a
 * plucked guitar, a walking bass, a stomp and a whistled tune. It has three gears:
 *   0  between rounds: slow, just the guitar and the bass
 *   1  in a round: faster, the stomp and the tune come in
 *   2  the last minute: faster again, the hats double up and the tune goes up an octave
 * A look-ahead scheduler places the notes a little ahead of time so they never stutter.
 */
import { audio, buses, noteHz } from './sound';

const CHORDS = [
  { root: 43, tones: [55, 59, 62] }, // G
  { root: 40, tones: [52, 55, 59] }, // Em
  { root: 36, tones: [48, 52, 55] }, // C
  { root: 38, tones: [50, 54, 57] }, // D
];
/** The tune, two bars of eighths repeated with a variation (0 is a rest). */
const TUNE = [
  [74, 0, 71, 74, 76, 74, 71, 0],
  [69, 0, 67, 69, 71, 0, 74, 0],
  [72, 0, 76, 72, 71, 69, 67, 0],
  [69, 71, 74, 0, 71, 69, 66, 0],
];
const TEMPO = [96, 128, 144];

let gear = -1;
let step = 0;
let next = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function pluck(midi: number, t: number, vol: number, dur = 0.35) {
  const a = audio();
  if (!a) return;
  const o = a.ctx.createOscillator();
  const f = a.ctx.createBiquadFilter();
  const g = a.ctx.createGain();
  o.type = 'sawtooth';
  o.frequency.value = noteHz(midi);
  f.type = 'lowpass';
  f.frequency.setValueAtTime(2600, t);
  f.frequency.exponentialRampToValueAtTime(500, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f).connect(g).connect(a.music);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function at(t: number) {
  const a = audio();
  return a ? t - a.ctx.currentTime : 0;
}

function play(s: number, t: number) {
  const a = audio();
  if (!a) return;
  const bar = Math.floor(s / 16) % 4;
  const sixteenth = s % 16;
  const chord = CHORDS[bar];
  const delay = Math.max(0, at(t));
  const m = a.music;

  // bass: root on 1, fifth on 3, a walk on the last eighth
  if (sixteenth === 0) buses.tone(noteHz(chord.root), noteHz(chord.root), 0.42, 0.5, 'triangle', delay, m);
  if (sixteenth === 8) buses.tone(noteHz(chord.root + 7), noteHz(chord.root + 7), 0.36, 0.42, 'triangle', delay, m);
  if (sixteenth === 14 && gear > 0) buses.tone(noteHz(chord.root + 5), noteHz(chord.root + 5), 0.16, 0.32, 'triangle', delay, m);

  // guitar: a strum on 1 and on the off-beats
  if (sixteenth === 0 || sixteenth === 6 || sixteenth === 10 || (gear > 0 && sixteenth === 12)) {
    chord.tones.forEach((n, i) => pluck(n, t + i * 0.012, 0.11, sixteenth === 0 ? 0.6 : 0.3));
  }

  if (gear >= 1) {
    // a stomp on the beats, a clap on 2 and 4
    if (sixteenth % 4 === 0) buses.tone(140, 45, 0.18, 0.75, 'sine', delay, m);
    if (sixteenth === 4 || sixteenth === 12) buses.hiss(1800, 900, 0.12, 0.35, 0.8, delay, 'bandpass', m);
    // hats: eighths, then sixteenths in the last minute
    if (gear === 2 ? true : sixteenth % 2 === 0) buses.hiss(9000, 7000, 0.03, sixteenth % 4 === 2 ? 0.22 : 0.12, 1, delay, 'highpass', m);
    // the whistled tune
    if (sixteenth % 2 === 0) {
      const n = TUNE[bar][sixteenth / 2];
      if (n) {
        const up = gear === 2 ? 12 : 0;
        buses.tone(noteHz(n + up), noteHz(n + up), 0.2, 0.14, 'sine', delay, m);
        buses.tone(noteHz(n + up) * 2, noteHz(n + up) * 2, 0.12, 0.03, 'sine', delay, m);
      }
    }
  }
}

function pump() {
  const a = audio();
  if (!a || gear < 0) return;
  const sixteenthSec = 60 / TEMPO[gear] / 4;
  if (next < a.ctx.currentTime) next = a.ctx.currentTime + 0.05;
  while (next < a.ctx.currentTime + 0.12) {
    play(step, next);
    step++;
    next += sixteenthSec;
  }
}

/** Sets the music's gear (0, 1 or 2), starting it if it is not playing. */
export function music(g: 0 | 1 | 2): void {
  if (!audio()) return;
  if (g !== gear) {
    // change gear at the top of the next bar, so the groove never trips
    if (gear >= 0) step = Math.ceil(step / 16) * 16;
    gear = g;
  }
  timer ??= setInterval(pump, 25);
}
