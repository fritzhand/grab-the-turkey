/**
 * The page: first the door (your name, your color, the room), then the game. A room is a four
 * letter code in the link, ?room=ABCD, so sending the link is the invitation.
 *
 * Three other ways in:
 * - ?tv=ABCD (or ?tv for a new room): the big screen. The whole place from above, the room code and
 *   a QR code to join, the leaderboard. It hosts the game and is not a player.
 * - On a phone, once a big screen is in the room, the phone becomes a controller (PadView) unless
 *   you ask for the room on the phone too; ?pad forces it.
 * - ?demo: a game played by itself, from above (game/demo.ts).
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { unlock } from './audio/sound';
import { ENVIRONMENTS, getEnvironment } from './env';
import { spawn } from './game/Controller';
import { startDemo } from './game/demo';
import { connect } from './game/net';
import { game, getVersion, notify, screenHere, subscribe } from './game/store';
import { T } from './game/tuning';
import { Controls } from './ui/Controls';
import { Hud } from './ui/Hud';
import { PadView, setPad } from './ui/PadView';
import { TvHud } from './ui/TvHud';
import { PLAYER_COLORS } from './world/palette';
import { Scene } from './world/Scene';

const PARAMS = new URLSearchParams(location.search);
const TV = PARAMS.has('tv');
const DEMO = PARAMS.has('demo');

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const newCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
const clean = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

function load(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

function Door({ onJoin, onDemo }: { onJoin: (name: string, color: number, room: string, env: string) => void; onDemo: () => void }) {
  const params = new URLSearchParams(location.search);
  const invited = clean(params.get('room') ?? '');
  const [name, setName] = useState(() => load('gt-name', ''));
  const [color, setColor] = useState(() => Number(load('gt-color', String(Math.floor(Math.random() * PLAYER_COLORS.length)))) % PLAYER_COLORS.length);
  const [code, setCode] = useState(invited);
  const [env, setEnv] = useState(() => getEnvironment(params.get('env')).id);
  const [mode, setMode] = useState<'new' | 'join'>(invited ? 'join' : 'new');
  const ok = name.trim().length > 0 && (mode === 'new' || code.length === 4);

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    const n = name.trim().slice(0, 16);
    save('gt-name', n);
    save('gt-color', String(color));
    onJoin(n, color, mode === 'new' ? newCode() : code, env);
  };

  return (
    <div className="gt-door">
      <form className="gt-door-card" onSubmit={go}>
        <p className="gt-eyebrow">A Thanksgiving game</p>
        <h1>
          Grab the <em>Turkey</em>
        </h1>
        <p className="gt-lede">
          Grab the turkey and hold on. Every second you hold it is a point. Your family wants it, and so does {T.dogName} the dog. Rounds last five minutes.
        </p>

        <label className="gt-field">
          <span>Your name</span>
          <input
            autoFocus={!name}
            value={name}
            maxLength={16}
            placeholder="Aunt Linda"
            autoComplete="nickname"
            enterKeyHint="go"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <div className="gt-field">
          <span>Your shirt</span>
          <div className="gt-swatches" role="radiogroup" aria-label="Shirt color">
            {PLAYER_COLORS.map((c, i) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={i === color}
                aria-label={`Color ${i + 1}`}
                className={i === color ? 'is-on' : ''}
                style={{ background: c }}
                onClick={() => setColor(i)}
              />
            ))}
          </div>
        </div>

        <div className="gt-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'new'} onClick={() => setMode('new')}>
            New game
          </button>
          <button type="button" role="tab" aria-selected={mode === 'join'} onClick={() => setMode('join')}>
            Join a room
          </button>
        </div>

        {mode === 'join' ? (
          <label className="gt-field">
            <span>Room code</span>
            <input
              className="gt-code"
              value={code}
              placeholder="ABCD"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              onChange={(e) => setCode(clean(e.target.value))}
            />
          </label>
        ) : (
          <label className="gt-field">
            <span>Where you are playing</span>
            <select value={env} onChange={(e) => setEnv(e.target.value)}>
              {ENVIRONMENTS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}: {e.blurb}
                </option>
              ))}
            </select>
          </label>
        )}

        <button type="submit" className="gt-btn gt-btn-primary gt-btn-wide" disabled={!ok}>
          {mode === 'new' ? 'Start a room' : invited && code === invited ? `Join room ${code}` : 'Join'}
        </button>

        <div className="gt-door-row">
          <a className="gt-btn gt-btn-ghost" href={`/?tv${mode === 'join' && code.length === 4 ? `=${code}` : ''}&env=${env}`} title="Open this on the TV: everyone plays on their phone and watches the TV">
            📺 Put it on the TV
          </a>
          <button type="button" className="gt-btn gt-btn-ghost" onClick={onDemo}>
            ▶ Watch a demo
          </button>
        </div>

        <details className="gt-how">
          <summary>How to play</summary>
          <ul>
            <li><b>Run</b> with the stick (W A S D on a keyboard). Drag the room to look around.</li>
            <li><b>Grab</b> by running into whoever has the turkey, or press Grab to lunge for it (Space).</li>
            <li>The turkey is heavy. Holding it, you run slower and tire the longer you hold on.</li>
            <li><b>Dodge</b> bursts you sideways (Shift). <b>Dip</b> ducks under a grab, but you crawl (C).</li>
            <li><b>Throw</b>: hold the button to wind up, let go to throw. Whoever catches it keeps it.</li>
            <li>{T.dogName} the dog wants the turkey too. Take it back from the dog.</li>
          </ul>
        </details>
      </form>
      <p className="gt-foot">
        Open source.{' '}
        <a href="https://github.com/fritzhand/grab-the-turkey" target="_blank" rel="noreferrer">
          Fork it and build your own home
        </a>
        .
      </p>
    </div>
  );
}

/** A new place: this phone's player back to a starting spot. */
function useSpawnOnEnv() {
  useSyncExternalStore(subscribe, getVersion);
  const envId = game.env.id;
  const placed = useRef('');
  useEffect(() => {
    if (!game.me.id || game.tv || placed.current === envId) return;
    placed.current = envId;
    spawn();
  }, [envId, game.me.id]);
}

/**
 * Whether this phone shows the controller: forced by ?pad, else once a screen is in the room, unless
 * this phone chose the 3D view (remembered).
 */
function usePad(): [boolean, (on: boolean) => void] {
  useSyncExternalStore(subscribe, getVersion);
  const [chosen, setChosen] = useState<boolean | null>(() => {
    if (PARAMS.has('pad')) return true;
    try {
      const v = localStorage.getItem('gt-pad');
      return v === null ? null : v === '1';
    } catch {
      return null;
    }
  });
  const on = chosen ?? screenHere();
  if (on !== game.pad) setPad(on);
  return [on, (v) => (setPad(v), setChosen(v))];
}

function Screen() {
  useSyncExternalStore(subscribe, getVersion);
  return (
    <div className="gt gt-is-tv">
      <Scene />
      <TvHud />
    </div>
  );
}

function Player() {
  useSpawnOnEnv();
  const [pad, choosePad] = usePad();
  if (pad) return <PadView onShowRoom={() => choosePad(false)} />;
  return (
    <div className="gt">
      <Scene />
      <Hud onPad={screenHere() ? () => choosePad(true) : undefined} />
      <Controls />
    </div>
  );
}

let started = false;
/** The big screen: its own room code (from ?tv=ABCD, or a new one), connected as a spectator host. */
function startTv() {
  if (started) return;
  started = true;
  game.tv = true;
  game.me.name = 'TV';
  const code = clean(PARAMS.get('tv') ?? '') || clean(PARAMS.get('room') ?? '');
  const room = code.length === 4 ? code : newCode();
  const url = new URL(location.href);
  url.searchParams.set('tv', room);
  url.searchParams.delete('room');
  history.replaceState(null, '', url);
  void connect(room, getEnvironment(PARAMS.get('env')).id);
}

export default function App() {
  const [joined, setJoined] = useState(false);
  const [demo, setDemo] = useState(DEMO);

  useEffect(() => {
    // no pinch-zooming the page itself on a phone; the room has its own zoom
    const stop = (e: Event) => e.preventDefault();
    document.addEventListener('gesturestart', stop);
    return () => document.removeEventListener('gesturestart', stop);
  }, []);

  const join = (name: string, color: number, room: string, env: string) => {
    unlock(); // sound needs a tap to start, and this is one
    game.me.name = name;
    game.me.color = color;
    const url = new URL(location.href);
    url.searchParams.set('room', room);
    url.searchParams.delete('env');
    history.replaceState(null, '', url);
    setJoined(true);
    notify();
    void connect(room, env);
  };

  if (demo) {
    startDemo(PARAMS.get('env'));
    return <Screen />;
  }
  if (TV) {
    startTv();
    return <Screen />;
  }
  if (!joined)
    return (
      <Door
        onJoin={join}
        onDemo={() => {
          unlock();
          history.replaceState(null, '', '/?demo');
          setDemo(true);
        }}
      />
    );
  return <Player />;
}
