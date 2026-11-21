/**
 * The big screen's overlay, read from across the room: the room code and a QR code to join in one
 * corner, the leaderboard in the other, the clock up top, and between rounds the lobby (who has
 * joined, and a Start button) or the results with the next round counting in.
 *
 * Keyboard (or a TV remote that sends keys): Enter or Space starts a round from the lobby; F goes
 * full screen; P cycles the place between rounds.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import QRCode from 'qrcode';
import { ENVIRONMENTS, splitOf } from '../env';
import { splitCell, splitPlayers } from '../world/SplitRig';
import { DOG_ID } from '../game/types';
import { intent } from '../game/net';
import { fresh, game, getVersion, subscribe } from '../game/store';
import { T } from '../game/tuning';
import { Banner, Board, clock, colorOf, held, Results, SoundToggle, Toasts } from './Hud';

export function joinUrl(): string {
  return `${location.origin}/?room=${game.room}`;
}

function useQr(text: string): string {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(text, { margin: 1, width: 360, color: { dark: '#1d1a17', light: '#ffffff' } }).then((u) => alive && setSrc(u));
    return () => {
      alive = false;
    };
  }, [text]);
  return src;
}

function Join({ big }: { big: boolean }) {
  const url = joinUrl();
  const qr = useQr(url);
  return (
    <aside className={`gt-tv-join ${big ? 'is-big' : ''}`}>
      {qr && <img src={qr} alt={`QR code to join room ${game.room}`} />}
      <div>
        <p className="gt-tv-join-kicker">Scan to play</p>
        <p className="gt-tv-join-code">{game.room}</p>
        <p className="gt-tv-join-url">
          {location.host}/?room={game.room}
        </p>
      </div>
    </aside>
  );
}

function Joined() {
  const now = performance.now();
  const here = [...game.remotes.entries()].filter(([, r]) => fresh(r, now));
  if (!here.length) return <p className="gt-tv-waiting">Waiting for players. Point your phone camera at the code.</p>;
  return (
    <ul className="gt-tv-joined">
      {here.map(([id, r]) => (
        <li key={id}>
          <span className="gt-dot" style={{ background: colorOf(game.snap!, id) }} />
          {r.pose.n}
        </li>
      ))}
    </ul>
  );
}

/** In split mode: each pane's player, at the bottom of their pane, and who has the turkey. */
function PaneLabels() {
  const snap = game.snap;
  const ids = splitPlayers();
  if (!snap || !ids.length) return null;
  return (
    <div className="gt-split">
      {ids.map((id, i) => {
        const c = splitCell(i, ids.length);
        const r = game.remotes.get(id)!;
        const holds = snap.holder === id;
        return (
          <div
            key={id}
            className={`gt-split-pane ${holds ? 'is-holder' : ''}`}
            style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.w * 100}%`, height: `${c.h * 100}%`, ['--me' as string]: colorOf(snap, id) }}
          >
            <span className="gt-split-name">
              <span className="gt-dot" style={{ background: colorOf(snap, id) }} />
              {r.pose.n}
              {holds && ' 🦃'}
              <span className="gt-split-time">{held(snap.scores[id] ?? 0)}</span>
            </span>
          </div>
        );
      })}
      {snap.holder === DOG_ID && <div className="gt-split-dog">{T.dogName} has the turkey</div>}
    </div>
  );
}

export function TvHud() {
  useSyncExternalStore(subscribe, getVersion);
  const snap = game.snap;

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const s = game.snap;
      if (!s || game.demo) return;
      const between = s.phase === 'lobby' || s.phase === 'over';
      if ((e.code === 'Enter' || e.code === 'Space') && between) {
        e.preventDefault();
        intent({ k: 'start' });
      } else if (e.code === 'KeyF') {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen?.().catch(() => {});
      } else if (e.code === 'KeyP' && between) {
        const i = ENVIRONMENTS.findIndex((x) => x.id === s.env);
        intent({ k: 'env', id: ENVIRONMENTS[(i + 1) % ENVIRONMENTS.length].id });
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  if (!snap) {
    return (
      <div className="gt-hud gt-tv">
        <div className="gt-connecting">
          <span className="gt-spinner" /> {game.status === 'connected' ? 'Setting the table…' : 'Opening the room…'}
        </div>
        {game.room && !game.demo && <Join big />}
      </div>
    );
  }

  const between = snap.phase === 'lobby' || snap.phase === 'over';
  const players = [...game.remotes.values()].filter((r) => fresh(r)).length;
  const split = splitOf(game.env);
  return (
    <div className={`gt-hud gt-tv ${split ? 'is-split' : ''}`}>
      {split && <PaneLabels />}
      <div className="gt-top">
        <Board snap={snap} limit={10} />
        <div className="gt-clock">
          {snap.phase === 'play' ? (
            <>
              <span className="gt-clock-time">{clock(snap.left)}</span>
              <span className="gt-clock-label">Round {snap.round}</span>
            </>
          ) : (
            <span className="gt-clock-label">
              {snap.phase === 'countdown' ? 'Get ready' : snap.phase === 'over' ? (snap.left > 0 ? `Next round in ${Math.ceil(snap.left / 1000)}` : 'Round over') : 'Warm-up'}
            </span>
          )}
        </div>
        <div className="gt-top-right">{!game.demo && <SoundToggle />}</div>
      </div>
      {!between && !split && <Banner snap={snap} />}
      <Toasts snap={snap} />
      {between && !game.demo && (
        <div className="gt-center">
          {snap.phase === 'over' && <Results snap={snap} />}
          {snap.phase === 'lobby' && (
            <div className="gt-panel gt-tv-lobby">
              <p className="gt-eyebrow">{ENVIRONMENTS.find((e) => e.id === snap.env)?.name}</p>
              <h2>{players ? `${players} ${players === 1 ? 'player' : 'players'} here` : 'Grab the Turkey'}</h2>
              <Joined />
              <p className="gt-muted">
                Everyone plays on their phone and watches here. Every second you hold the turkey is a point. {T.dogName} the dog wants it too.
              </p>
              <button type="button" className="gt-btn gt-btn-primary" onClick={() => intent({ k: 'start' })}>
                Start the round
              </button>
              <p className="gt-tv-keys">Enter starts · P changes the place · F full screen</p>
            </div>
          )}
        </div>
      )}
      {!game.demo && <Join big={between && !split} />}
      {game.demo && (
        <div className="gt-tv-demo">
          <span>Demo</span> A game played by itself.{' '}
          <a href="/" onClick={() => (location.href = '/')}>
            Play for real
          </a>
        </div>
      )}
    </div>
  );
}
