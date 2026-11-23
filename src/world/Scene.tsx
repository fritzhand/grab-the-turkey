/**
 * The 3D scene: the room, the players, the dog, the turkey, the tokens and the leprechaun, the camera and the controls. On the big
 * screen the camera is the overhead TvRig (or SplitRig, a pane per player) and nobody is "me".
 */
import { Canvas } from '@react-three/fiber';
import { game } from '../game/store';
import { TvRig } from './TvRig';
import { SplitRig } from './SplitRig';
import { splitOf } from '../env';
import { useSyncExternalStore } from 'react';
import { getVersion, subscribe } from '../game/store';
import { Controller } from '../game/Controller';
import { CameraRig } from './CameraRig';
import { Dog } from './Dog';
import { Leprechaun } from './Leprechaun';
import { Players } from './Players';
import { Effects, Room } from './Room';
import { Tokens } from './Tokens';
import { Turkey } from './Turkey';

/** The cameras and the post effects: one behind you, the TV's overhead shot, or the TV split per player. */
function Cameras() {
  useSyncExternalStore(subscribe, getVersion);
  const split = game.tv && splitOf(game.env);
  return (
    <>
      {game.tv ? <TvRig /> : <CameraRig />}
      {split && <SplitRig />}
      {!split && <Effects />}
    </>
  );
}

export function Scene() {
  return (
    <Canvas
      className="gt-canvas"
      flat
      dpr={game.tv ? [1, 1.5] : [1, 1.75]}
      camera={{ fov: 42, near: 0.1, far: 220, position: [0, 6, 10] }}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
    >
      <Room />
      <Players />
      <Dog />
      <Turkey />
      <Tokens />
      <Leprechaun />
      <Controller />
      <Cameras />
    </Canvas>
  );
}
