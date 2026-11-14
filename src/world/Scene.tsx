/** The 3D scene: the room, the players, the dog, the turkey, the camera and the controls. */
import { Canvas } from '@react-three/fiber';
import { Controller } from '../game/Controller';
import { CameraRig } from './CameraRig';
import { Dog } from './Dog';
import { Players } from './Players';
import { Effects, Room } from './Room';
import { Turkey } from './Turkey';

export function Scene() {
  return (
    <Canvas
      className="gt-canvas"
      flat
      dpr={[1, 1.75]}
      camera={{ fov: 42, near: 0.1, far: 220, position: [0, 6, 10] }}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
    >
      <Room />
      <Players />
      <Dog />
      <Turkey />
      <Controller />
      <CameraRig />
      <Effects />
    </Canvas>
  );
}
