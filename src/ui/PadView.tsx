/**
 * The phone as a controller, for when the game is on the big screen: no 3D (so it stays cool and the
 * battery lasts), just the stick and the buttons, and big plain words about what is happening to
 * you: who has the turkey, your points, your place, the clock. Up on the stick is up on the TV.
 *
 * It buzzes when you get the turkey and when it is taken (where the phone allows it).
 * "Show the room here" switches back to the full 3D view on the phone.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { usePadLoop } from '../game/Controller';
import { intent } from '../game/net';
import { game, getVersion, iHold, subscribe } from '../game/store';
import { T } from '../game/tuning';
import { DOG_ID } from '../game/types';
import { PLAYER_COLORS } from '../world/palette';
import { Controls } from './Controls';
import { clock, held, Hunt, nameOf, Toasts } from './Hud';

function buzz(ms: number | number[]) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not on this phone */
  }
}

export function setPad(on: boolean): void {
  game.pad = on;
  // up on the stick is up on the TV, whose camera looks along -z
  if (on) game.cam.yaw = 0;
  try {
    localStorage.setItem('gt-pad', on ? '1' : '0');
  } catch {
    /* private mode */
  }
}

export function PadView({ onShowRoom }: { onShowRoom: () => void }) {
  useSyncExternalStore(subscribe, getVersion);
  usePadLoop();
  const snap = game.snap;
  const mine = iHold();
  const was = useRef(false);

  useEffect(() => {
    if (mine && !was.current) buzz(60);
    if (!mine && was.current) buzz([30, 40, 30]);
    was.current = mine;
  }, [mine]);

  const color = PLAYER_COLORS[game.me.color % PLAYER_COLORS.length];
  const ranked = snap ? Object.entries(snap.scores).sort((a, b) => b[1] - a[1]) : [];
  const place = ranked.findIndex(([id]) => id === game.me.id);
  const myMs = snap?.scores[game.me.id] ?? 0;

  let headline = 'Look at the big screen';
  let sub = '';
  if (!snap) headline = 'Finding the room…';
  else if (snap.phase === 'countdown') headline = String(Math.max(1, Math.ceil(snap.left / 1000)));
  else if (snap.phase === 'lobby') (headline = 'Warm up'), (sub = 'Run around and find yourself on the TV.');
  else if (snap.phase === 'over') (headline = 'Round over'), (sub = snap.left > 0 ? `Next round in ${Math.ceil(snap.left / 1000)}` : '');
  else if (mine) (headline = 'You have the turkey!'), (sub = 'Run! Dodge, dip, or throw it.');
  else if (snap.holder === DOG_ID) (headline = `${T.dogName} has it`), (sub = 'Get it back from the dog.');
  else if (snap.holder) (headline = `${nameOf(snap, snap.holder)} has it`), (sub = 'Run into them, or Grab to lunge.');
  else (headline = 'Up for grabs'), (sub = 'Get to the turkey first.');

  return (
    <div className={`gt-padview ${mine ? 'is-mine' : ''}`} style={{ ['--me' as string]: color }}>
      <header className="gt-padview-top">
        <span className="gt-padview-me">
          <span className="gt-dot" style={{ background: color }} />
          {game.me.name}
        </span>
        <span className="gt-padview-room">Room {game.room}</span>
        <button type="button" className="gt-padview-switch" onClick={onShowRoom}>
          Show the room here
        </button>
      </header>

      <main className="gt-padview-main">
        <p className="gt-padview-headline">{headline}</p>
        {sub && <p className="gt-padview-sub">{sub}</p>}
        {snap && (snap.phase === 'play' || snap.phase === 'over') && (
          <dl className="gt-padview-stats">
            <div>
              <dt>Your points</dt>
              <dd>{held(myMs)}</dd>
            </div>
            <div>
              <dt>Place</dt>
              <dd>{place >= 0 ? `${place + 1} of ${ranked.length}` : '–'}</dd>
            </div>
            {snap.phase === 'play' && (
              <div>
                <dt>Left</dt>
                <dd>{clock(snap.left)}</dd>
              </div>
            )}
          </dl>
        )}
        {snap && (snap.phase === 'lobby' || (snap.phase === 'over' && snap.left <= 0)) && (
          <button type="button" className="gt-btn gt-btn-primary" onClick={() => intent({ k: 'start' })}>
            Start the round
          </button>
        )}
        {game.netNote && <p className="gt-note">{game.netNote}</p>}
      </main>
      {snap && <Hunt snap={snap} arrow />}
      {snap && <Toasts snap={snap} />}
      <Controls />
    </div>
  );
}
