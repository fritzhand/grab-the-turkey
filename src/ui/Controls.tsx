/**
 * The controls on screen. Bottom left, the stick: push it and you run the way it points (up is away
 * from the camera). Bottom right, the buttons: the big one grabs, or, when you hold the turkey,
 * winds up while held and throws on release; Dodge bursts sideways; Dip ducks under a grab. Each
 * reads its own finger only, so you can steer and press at once, and a third finger can still drag
 * the room to look around.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { primaryDown, primaryUp } from '../game/Controller';
import { game, getVersion, iHold, subscribe } from '../game/store';
import { T } from '../game/tuning';

const REACH = 46;
const DEAD = 0.12;

function Stick() {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = base.current;
    const k = knob.current;
    if (!el || !k) return;
    let finger: number | null = null;
    let cx = 0;
    let cy = 0;
    const follow = (e: PointerEvent) => {
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > REACH) {
        dx *= REACH / d;
        dy *= REACH / d;
      }
      k.style.transform = `translate(${dx}px, ${dy}px)`;
      const push = Math.min(d, REACH) / REACH;
      game.input.stick.x = push < DEAD ? 0 : dx / REACH;
      game.input.stick.y = push < DEAD ? 0 : dy / REACH;
    };
    const down = (e: PointerEvent) => {
      if (finger !== null) return;
      e.preventDefault();
      finger = e.pointerId;
      el.setPointerCapture(finger);
      const r = el.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      el.classList.add('is-held');
      follow(e);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId === finger) follow(e);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== finger) return;
      finger = null;
      game.input.stick.x = 0;
      game.input.stick.y = 0;
      k.style.transform = '';
      el.classList.remove('is-held');
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('lostpointercapture', up);
    };
  }, []);

  return (
    <div className="gt-stick" ref={base} aria-hidden="true">
      <span className="gt-stick-knob" ref={knob} />
    </div>
  );
}

/** A button that fires on press (not on release), for one finger, without stealing the others. */
function Pad({ className, label, keyHint, onDown, onUp, padRef }: {
  className: string;
  label: string;
  keyHint: string;
  onDown: () => void;
  onUp?: () => void;
  padRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={padRef}
      type="button"
      className={`gt-pad ${className}`}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        onDown();
      }}
      onPointerUp={() => onUp?.()}
      onPointerCancel={() => onUp?.()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="gt-pad-label">{label}</span>
      <kbd>{keyHint}</kbd>
    </button>
  );
}

export function Controls() {
  useSyncExternalStore(subscribe, getVersion);
  const holding = iHold();
  const primary = useRef<HTMLButtonElement>(null);
  const dodge = useRef<HTMLButtonElement>(null);
  const dip = useRef<HTMLButtonElement>(null);

  // cooldowns and the wind-up, drawn as a fill on each button
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const m = game.me;
      const held = iHold();
      dodge.current?.style.setProperty('--cd', String(m.dodgeCd / (held ? T.holdDodgeCooldown : T.dodgeCooldown)));
      dip.current?.style.setProperty('--cd', String(m.dipCd / T.dipCooldown));
      const p = primary.current;
      if (p) {
        p.style.setProperty('--cd', held ? '0' : String(m.lungeCd / T.lungeCooldown));
        p.style.setProperty('--wind', m.windup >= 0 ? String(Math.min(1, m.windup / T.windupSeconds)) : '0');
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="gt-controls">
      <Stick />
      <div className="gt-pads">
        <Pad padRef={dip} className="gt-pad-dip" label="Dip" keyHint="C" onDown={() => (game.input.dip = true)} />
        <Pad padRef={dodge} className="gt-pad-dodge" label="Dodge" keyHint="Shift" onDown={() => (game.input.dodge = true)} />
        <Pad
          padRef={primary}
          className={`gt-pad-main ${holding ? 'is-throw' : ''}`}
          label={holding ? 'Throw' : 'Grab'}
          keyHint="Space"
          onDown={primaryDown}
          onUp={primaryUp}
        />
      </div>
    </div>
  );
}
