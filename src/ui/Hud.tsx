/**
 * Everything on screen over the room: the clock, the scoreboard, who has the turkey, what just
 * happened, the start button between rounds and the results after one.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { onAchievement } from '../audio/director';
import { getMode, setMode, type SoundMode } from '../audio/sound';
import { ENVIRONMENTS } from '../env';
import { spawn } from '../game/Controller';
import { intent } from '../game/net';
import { fresh, game, getVersion, subscribe } from '../game/store';
import { T } from '../game/tuning';
import { DOG_ID, type GameEvent, type Snapshot } from '../game/types';
import { PLAYER_COLORS } from '../world/palette';

export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Held time, to the tenth below a minute. */
export function held(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function nameOf(snap: Snapshot, id: string | undefined): string {
  if (!id) return 'Someone';
  if (id === DOG_ID) return T.dogName;
  if (id === game.me.id) return 'You';
  return game.remotes.get(id)?.pose.n ?? snap.names[id] ?? 'Someone';
}

function colorOf(snap: Snapshot, id: string): string {
  if (id === DOG_ID) return '#c98a4a';
  const c = id === game.me.id ? game.me.color : game.remotes.get(id)?.pose.c ?? snap.colors[id] ?? 0;
  return PLAYER_COLORS[c % PLAYER_COLORS.length];
}

function say(snap: Snapshot, e: GameEvent): string {
  const a = nameOf(snap, e.a);
  const b = nameOf(snap, e.b);
  switch (e.k) {
    case 'steal':
      return e.a === DOG_ID ? `${b} wrestled the turkey from ${T.dogName}!` : `${b} grabbed the turkey from ${a}!`;
    case 'dog':
      return e.a ? `${T.dogName} snatched the turkey from ${a}!` : `${T.dogName} got the turkey!`;
    case 'catch':
      return `${b} caught ${a === 'You' ? 'your' : `${a}’s`} throw!`;
    case 'pickup':
      return `${b} picked up the turkey`;
    case 'drop':
      return `${T.dogName} dropped the turkey`;
    case 'throw':
      return `${a} threw the turkey!`;
  }
}

function Toasts({ snap }: { snap: Snapshot }) {
  const seen = useRef(0);
  const [items, setItems] = useState<{ id: number; text: string; detail?: string }[]>([]);
  useEffect(
    () =>
      onAchievement((a) => {
        const id = -Math.random();
        setItems((xs) => [...xs, { id, text: a.title, detail: a.detail }].slice(-3));
        setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3600);
      }),
    [],
  );
  useEffect(() => {
    const fresh = snap.events.filter((e) => e.id > seen.current);
    if (!fresh.length) return;
    // a new host may restart the count; never replay old ones
    seen.current = Math.max(...snap.events.map((e) => e.id));
    const add = fresh.slice(-2).map((e) => ({ id: e.id, text: say(snap, e) }));
    setItems((xs) => [...xs, ...add].slice(-3));
    const ids = add.map((a) => a.id);
    setTimeout(() => setItems((xs) => xs.filter((x) => !ids.includes(x.id))), 2600);
  }, [snap]);
  return (
    <div className="gt-toasts" aria-live="polite">
      {items.map((t) =>
        t.detail ? (
          <div key={t.id} className="gt-toast gt-achievement">
            <span className="gt-achievement-kicker">🏆 Achievement</span>
            <strong>{t.text}</strong>
            <span>{t.detail}</span>
          </div>
        ) : (
          <div key={t.id} className="gt-toast">
            {t.text}
          </div>
        ),
      )}
    </div>
  );
}

function Board({ snap }: { snap: Snapshot }) {
  const now = performance.now();
  const ids = new Set<string>([...Object.keys(snap.scores)]);
  if (game.me.id) ids.add(game.me.id);
  for (const [id, r] of game.remotes) if (fresh(r, now)) ids.add(id);
  ids.add(DOG_ID);
  const rows = [...ids]
    .map((id) => ({ id, ms: snap.scores[id] ?? 0 }))
    .sort((a, b) => b.ms - a.ms || (a.id === DOG_ID ? 1 : b.id === DOG_ID ? -1 : 0));
  return (
    <ol className="gt-board">
      {rows.slice(0, 8).map((r) => (
        <li key={r.id} className={`${r.id === game.me.id ? 'is-me' : ''} ${snap.holder === r.id ? 'is-holder' : ''}`}>
          <span className="gt-dot" style={{ background: colorOf(snap, r.id) }} />
          <span className="gt-board-name">{r.id === game.me.id ? game.me.name || 'You' : nameOf(snap, r.id)}</span>
          {snap.holder === r.id && <span className="gt-board-tk">🦃</span>}
          <span className="gt-board-time">{held(r.ms)}</span>
        </li>
      ))}
    </ol>
  );
}

function Share() {
  const [copied, setCopied] = useState(false);
  const url = `${location.origin}/?room=${game.room}`;
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Grab the Turkey', text: `Join my game of Grab the Turkey, room ${game.room}`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }
    } catch {
      /* the share sheet was closed */
    }
  };
  return (
    <button type="button" className="gt-room" onClick={share} title="Share the link to this room">
      <span className="gt-room-label">Room</span>
      <span className="gt-room-code">{game.room}</span>
      <span className="gt-room-share">{copied ? 'Copied' : 'Invite'}</span>
    </button>
  );
}

const NEXT: Record<SoundMode, SoundMode> = { all: 'sfx', sfx: 'off', off: 'all' };
const LABEL: Record<SoundMode, string> = { all: '🔊 Music', sfx: '🔉 Effects', off: '🔇 Off' };

function SoundToggle() {
  const [m, setM] = useState<SoundMode>(getMode);
  return (
    <button
      type="button"
      className="gt-sound"
      title="Sound: music and effects, effects only, or off"
      onClick={() => {
        const n = NEXT[m];
        setMode(n);
        setM(n);
      }}
    >
      {LABEL[m]}
    </button>
  );
}

function Lobby({ snap }: { snap: Snapshot }) {
  const others = [...game.remotes.values()].filter((r) => fresh(r)).length;
  return (
    <div className="gt-panel gt-lobby-panel">
      <p className="gt-eyebrow">{snap.phase === 'over' ? 'Next round' : 'Warm up'}</p>
      <h2>{others ? `${others + 1} players here` : 'Waiting for family'}</h2>
      <p className="gt-muted">
        {others ? 'Anyone can start. The round runs five minutes.' : 'Send the invite link. You can start alone and play against the dog.'}
      </p>
      {!others && game.netNote && <p className="gt-note">{game.netNote}</p>}
      <label className="gt-field gt-field-row">
        <span>Place</span>
        <select value={snap.env} onChange={(e) => intent({ k: 'env', id: e.target.value })}>
          {ENVIRONMENTS.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="gt-btn gt-btn-primary" onClick={() => intent({ k: 'start' })}>
        Start the round
      </button>
    </div>
  );
}

function Results({ snap }: { snap: Snapshot }) {
  const rows = snap.last?.scores ?? [];
  const [first] = rows;
  const winner = first ? (first[0] === game.me.id ? 'You win!' : `${first[0] === DOG_ID ? T.dogName : first[1]} wins!`) : 'Nobody held the turkey';
  return (
    <div className="gt-panel gt-results">
      <p className="gt-eyebrow">Round {snap.last?.round ?? snap.round} is over</p>
      <h2>{winner}</h2>
      <ol className="gt-results-list">
        {rows.map(([id, name, ms], i) => (
          <li key={id} className={id === game.me.id ? 'is-me' : ''}>
            <span className="gt-rank">{i + 1}</span>
            <span className="gt-dot" style={{ background: colorOf(snap, id) }} />
            <span className="gt-board-name">{id === DOG_ID ? `${T.dogName} (the dog)` : name}</span>
            <span className="gt-board-time">{held(ms)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Banner({ snap }: { snap: Snapshot }) {
  if (snap.phase === 'countdown') return <div className="gt-countdown">{Math.max(1, Math.ceil(snap.left / 1000))}</div>;
  const mine = snap.holder && snap.holder === game.me.id;
  if (mine)
    return (
      <div className="gt-banner is-mine">
        You have the turkey! <strong>{held(snap.scores[game.me.id] ?? 0)}</strong>
      </div>
    );
  if (snap.holder === DOG_ID) return <div className="gt-banner is-dog">{T.dogName} has the turkey. Get it back!</div>;
  if (snap.holder) return <div className="gt-banner">{nameOf(snap, snap.holder)} has the turkey</div>;
  return <div className="gt-banner is-free">The turkey is up for grabs</div>;
}

export function Hud() {
  useSyncExternalStore(subscribe, getVersion);
  const snap = game.snap;

  // a new place: everyone back to a starting spot
  const envId = game.env.id;
  const placed = useRef('');
  useEffect(() => {
    if (!game.me.id || placed.current === envId) return;
    placed.current = envId;
    spawn();
  }, [envId, game.me.id]);

  if (!snap) {
    return (
      <div className="gt-hud">
        <div className="gt-connecting">
          <span className="gt-spinner" /> {game.status === 'connected' ? 'Setting the table…' : 'Finding the room…'}
        </div>
      </div>
    );
  }

  const between = snap.phase === 'lobby' || snap.phase === 'over';
  return (
    <div className="gt-hud">
      <div className="gt-top">
        <Board snap={snap} />
        <div className="gt-clock">
          {snap.phase === 'play' ? (
            <>
              <span className="gt-clock-time">{clock(snap.left)}</span>
              <span className="gt-clock-label">Round {snap.round}</span>
            </>
          ) : (
            <span className="gt-clock-label">{snap.phase === 'countdown' ? 'Get ready' : snap.phase === 'over' ? 'Round over' : 'Warm-up'}</span>
          )}
        </div>
        <div className="gt-top-right">
          <Share />
          <SoundToggle />
        </div>
      </div>
      <Banner snap={snap} />
      <Toasts snap={snap} />
      {between && (
        <div className="gt-center">
          {snap.phase === 'over' && <Results snap={snap} />}
          <Lobby snap={snap} />
        </div>
      )}
    </div>
  );
}
