/**
 * The environment's furniture and walls, drawn in the white room's toon style: three hard bands of
 * light, like the figures. Each piece collides as its box; `kind` only changes how it is drawn.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import type { Environment, Piece } from '../env';
import { toonGradient } from './toon';

const materials = new Map<string, THREE.MeshToonMaterial>();
function mat(color: string): THREE.MeshToonMaterial {
  let m = materials.get(color);
  if (!m) materials.set(color, (m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() })));
  return m;
}

function Box({ w, h, d, x = 0, y = 0, z = 0, color }: { w: number; h: number; d: number; x?: number; y?: number; z?: number; color: string }) {
  return (
    <mesh position={[x, y + h / 2, z]} material={mat(color)}>
      <boxGeometry args={[w, h, d]} />
    </mesh>
  );
}

function Shape({ p, env }: { p: Piece; env: Environment }) {
  const color = p.color ?? (p.kind === 'wall' ? env.colors.walls : env.colors.pieces);
  const { w, d, h } = p;
  switch (p.kind) {
    case 'table': {
      const leg = 0.07;
      const ix = w / 2 - 0.12;
      const iz = d / 2 - 0.12;
      return (
        <>
          <Box w={w} d={d} h={0.06} y={h - 0.06} color={color} />
          {[[-ix, -iz], [ix, -iz], [-ix, iz], [ix, iz]].map(([x, z], i) => (
            <Box key={i} w={leg} d={leg} h={h - 0.06} x={x} z={z} color={color} />
          ))}
        </>
      );
    }
    case 'couch':
      return (
        <>
          <Box w={w} d={d} h={h * 0.55} color={color} />
          <Box w={w} d={0.22} h={h} z={-d / 2 + 0.11} color={color} />
        </>
      );
    case 'bed':
      return (
        <>
          <Box w={w} d={d} h={h} color={color} />
          <Box w={w * 0.8} d={0.35} h={0.12} y={h} z={-d / 2 + 0.3} color="#fbfbf9" />
        </>
      );
    case 'plant':
      return (
        <>
          <mesh position={[0, 0.2, 0]} material={mat('#b8a99a')}>
            <cylinderGeometry args={[w * 0.4, w * 0.32, 0.4, 12]} />
          </mesh>
          <mesh position={[0, h - w * 0.55, 0]} material={mat(color)}>
            <icosahedronGeometry args={[w * 0.7, 0]} />
          </mesh>
        </>
      );
    default:
      return <Box w={w} d={d} h={h} color={color} />;
  }
}

export function Pieces({ env }: { env: Environment }) {
  const pieces = useMemo(() => env.pieces.filter((p) => !p.hidden), [env]);
  return (
    <>
      {pieces.map((p, i) => (
        <group key={`${env.id}:${i}`} position={[p.x, 0, p.z]} rotation-y={((p.rot ?? 0) * Math.PI) / 180}>
          <Shape p={p} env={env} />
        </group>
      ))}
    </>
  );
}
