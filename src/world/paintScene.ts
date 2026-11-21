/**
 * Paints a loaded model: every mesh gets the storybook material (keeping its color, or the one `recolor`
 * gives it), and everything under a node named `o_...` gets an ink outline.
 */
import * as THREE from 'three';
import { addSmoothNormals, inkMaterial, paintMaterial } from './paint';

export interface PaintOptions {
  /** A new color for a material by name (`undefined` keeps the model's own). */
  recolor?: (material: string, was: THREE.Color) => THREE.Color | string | undefined;
  /** Whether a mesh (by its name and its parents') gets dabs. */
  dabs?: (name: string) => boolean;
  /** Outline everything, not just `o_` nodes. */
  inkAll?: boolean;
}

function within(o: THREE.Object3D, test: (name: string) => boolean): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (test(p.name)) return true;
  return false;
}

export function applyPaint(root: THREE.Object3D, opt: PaintOptions = {}): void {
  const inked: THREE.Mesh[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const was = mesh.material as THREE.MeshStandardMaterial;
    const asked = opt.recolor?.(was.name, was.color);
    const color = asked === undefined ? was.color : new THREE.Color(asked as THREE.ColorRepresentation);
    mesh.material = paintMaterial({
      color,
      vertexColors: !!mesh.geometry.getAttribute('color'),
      dabs: !!opt.dabs && within(mesh, opt.dabs),
      glass: was.name === 'glass',
    });
    if (opt.inkAll || within(mesh, (n) => n.startsWith('o_'))) inked.push(mesh);
  });
  // outlines are added after the walk, so the walk does not meet them
  for (const mesh of inked) {
    addSmoothNormals(mesh.geometry);
    const skinned = mesh as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh) {
      const ink = new THREE.SkinnedMesh(mesh.geometry, inkMaterial);
      ink.bind(skinned.skeleton, skinned.bindMatrix);
      ink.frustumCulled = false;
      mesh.parent?.add(ink);
    } else {
      const ink = new THREE.Mesh(mesh.geometry, inkMaterial);
      ink.frustumCulled = mesh.frustumCulled;
      mesh.add(ink);
    }
  }
}
