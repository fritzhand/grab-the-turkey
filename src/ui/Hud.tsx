/**
 * Everything on screen over the room: the clock, the scoreboard, who has the turkey, what just
 * happened, the start button between rounds and the results after one.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { onAchievement } from '../audio/director';
import { getMode, setMode, type SoundMode } from '../audio/sound';
import { ENVIRONMENTS } from '../env';
import { intent } from '../game/net';
import { fresh, game, getVersion, screenHere, subscribe } from '../game/store';
import { T } from '../game/tuning';
import { DOG_ID, type GameEvent, type Snapshot } from '../game/types';
import { PLAYER_COLORS } from '../world/palette';

export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * A score, as points: a second holding the turkey is a point, a turkey token a point, the leprechaun 25 by hand
 * and 50 trapped (double for whoever holds the turkey). The game keeps thousandths; the points tick each second.
 */
export function held(ms: number): string {
  return String(Math.floor(ms / 1000));
}

export function nameOf(snap: Snapshot, id: string | undefined): string {
  if (!id) return 'Someone';
  if (id === DOG_ID) return T.dogName;
  if (id === game.me.id) return 'You';
  return game.remotes.get(id)?.pose.n ?? snap.names[id] ?? 'Someone';
}

export function colorOf(snap: Snapshot, id: string): string {
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
    case 'token':
      return `${b} found a turkey token  +${e.n ?? T.tokenPoints}`;
    case 'lep':
      return 'A leprechaun! Grab the trap, then catch it';
    case 'trap':
      return `${b} ${b === 'You' ? 'have' : 'has'} the trap!`;
    case 'caught':
      return e.a === 'trap' ? `${b} trapped the leprechaun!  +${e.n ?? T.lepPoints}` : `${b} caught the leprechaun by hand!  +${e.n ?? T.lepHandsPoints}`;
    case 'gone':
      return 'The leprechaun slipped away';
  }
}

export function Toasts({ snap }: { snap: Snapshot }) {
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

export function Board({ snap, limit = 8 }: { snap: Snapshot; limit?: number }) {
  const now = performance.now();
  const ids = new Set<string>([...Object.keys(snap.scores)]);
  if (game.me.id && !game.tv) ids.add(game.me.id);
  for (const [id, r] of game.remotes) if (fresh(r, now)) ids.add(id);
  ids.add(DOG_ID);
  const rows = [...ids]
    .map((id) => ({ id, ms: snap.scores[id] ?? 0 }))
    .sort((a, b) => b.ms - a.ms || (a.id === DOG_ID ? 1 : b.id === DOG_ID ? -1 : 0));
  return (
    <ol className="gt-board">
      {rows.slice(0, limit).map((r) => (
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

export function SoundToggle() {
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
      {!screenHere() && (
        <p className="gt-muted gt-tv-hint">
          📺 Playing together in one room? Open <b>{location.host}/?tv={game.room}</b> on the TV: everyone watches it and plays on their phone.
        </p>
      )}
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

export function Results({ snap }: { snap: Snapshot }) {
  const rows = snap.last?.scores ?? [];
  const [first] = rows;
  const winner = first ? (first[0] === game.me.id ? 'You win!' : `${first[0] === DOG_ID ? T.dogName : first[1]} wins!`) : 'Nobody scored';
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
            <span className="gt-board-time">{held(ms)} pts</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * The leprechaun hunt, in words, and (with a camera behind you) an arrow to what to go for next: the trap first,
 * then the leprechaun with the trap on your back. Not there when there is no leprechaun.
 */
export function Hunt({ snap, arrow }: { snap: Snapshot; arrow: boolean }) {
  const lep = snap.lep;
  if (!lep || snap.phase !== 'play') return null;
  const trap = snap.trap;
  const by = trap?.by ?? null;
  let text: string;
  let target: [number, number] | null = null;
  if (lep.by) text = lep.how === 'trap' ? `${nameOf(snap, lep.by)} trapped the leprechaun!` : `${nameOf(snap, lep.by)} caught the leprechaun!`;
  else if (by && by === game.me.id) (text = 'You have the trap! Put it on the leprechaun'), (target = lep.p);
  else if (by) (text = `${nameOf(snap, by)} has the trap`), (target = lep.p);
  else if (trap) (text = 'A leprechaun is loose! Find the trap'), (target = trap.p);
  else text = 'A leprechaun is loose!';

  let pointer: React.ReactNode = null;
  if (arrow && target && !game.tv) {
    const dx = target[0] - game.me.pos.x;
    const dz = target[1] - game.me.pos.z;
    const yaw = game.cam.yaw;
    // the screen's up is away from the camera: (-sin yaw, -cos yaw); its right is (cos yaw, -sin yaw)
    const angle = Math.atan2(dx * Math.cos(yaw) - dz * Math.sin(yaw), -dx * Math.sin(yaw) - dz * Math.cos(yaw));
    pointer = (
      <span className="gt-hunt-point">
        <span className="gt-hunt-arrow" style={{ transform: `rotate(${angle}rad)` }}>
          ▲
        </span>
        {Math.round(Math.hypot(dx, dz))} m
      </span>
    );
  }
  return (
    <div className="gt-hunt" role="status">
      <span className="gt-hunt-icon">☘</span>
      <span className="gt-hunt-text">{text}</span>
      {pointer}
    </div>
  );
}

export function Banner({ snap }: { snap: Snapshot }) {
  if (snap.phase === 'countdown') return <div className="gt-countdown">{Math.max(1, Math.ceil(snap.left / 1000))}</div>;
  const mine = snap.holder && snap.holder === game.me.id;
  if (mine)
    return (
      <div className="gt-banner is-mine">
        You have the turkey! <strong>{held(snap.scores[game.me.id] ?? 0)} pts</strong>
      </div>
    );
  if (snap.holder === DOG_ID) return <div className="gt-banner is-dog">{T.dogName} has the turkey. Get it back!</div>;
  if (snap.holder) return <div className="gt-banner">{nameOf(snap, snap.holder)} has the turkey</div>;
  return <div className="gt-banner is-free">The turkey is up for grabs</div>;
}

export function Hud({ onPad }: { onPad?: () => void } = {}) {
  useSyncExternalStore(subscribe, getVersion);
  const snap = game.snap;

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
    <div className={`gt-hud ${snap.lep && snap.phase === 'play' ? 'is-hunt' : ''}`}>
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
          {onPad && (
            <button type="button" className="gt-sound" onClick={onPad} title="Use this phone as a controller and watch the TV">
              📺 Watch the TV
            </button>
          )}
        </div>
      </div>
      <Banner snap={snap} />
      <Hunt snap={snap} arrow />
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
