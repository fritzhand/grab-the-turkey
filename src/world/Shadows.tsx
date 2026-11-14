/**
 * Contact shadows that follow the figure across the endless floor. Each frame a camera on the floor
 * looks straight up and draws what stands over it as depth, nearer darker; the picture is blurred
 * and laid on the floor under everything. (The same method as drei's ContactShadows, which blurs
 * its picture with a plane fixed at the world's origin, so its shadows vanish once they move away.)
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js';
import { game } from '../game/store';

/** Every shadow's own floor plane: hidden while any of them draws, so none shadows another. */
const planes = new Set<THREE.Object3D>();

interface Props {
  /** The side of the square it covers, in meters. */
  size: number;
  resolution: number;
  /** How high above the floor things still cast a shadow. */
  far: number;
  blur: number;
  opacity: number;
  color: string;
  /** Its height over the floor (the second one sits a hair above the first). */
  lift?: number;
}

export function Shadow({ size, resolution, far, blur, opacity, color, lift = 0.002 }: Props) {
  const { gl, scene } = useThree();
  const plane = useRef<THREE.Mesh>(null);

  const r = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(resolution, resolution);
    const spare = new THREE.WebGLRenderTarget(resolution, resolution);
    target.texture.generateMipmaps = spare.texture.generateMipmaps = false;
    // it stands just above the floor, looking up, with the world's +x to its right and +z its up
    const cam = new THREE.OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 0, far);
    cam.up.set(0, 0, 1);
    const depth = new THREE.MeshDepthMaterial();
    depth.depthTest = depth.depthWrite = false;
    depth.onBeforeCompile = (shader) => {
      shader.uniforms.ucolor = { value: new THREE.Color(color) };
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'uniform vec3 ucolor;\nvoid main() {')
        .replace('vec4( vec3( 1.0 - fragCoordZ ), opacity );', 'vec4( ucolor * fragCoordZ * 2.0, 1.0 - fragCoordZ );');
    };
    const h = new THREE.ShaderMaterial(HorizontalBlurShader);
    const v = new THREE.ShaderMaterial(VerticalBlurShader);
    h.depthTest = v.depthTest = false;
    return { target, spare, cam, depth, h, v, quad: new FullScreenQuad(h) };
  }, [size, resolution, far, color]);

  useEffect(() => {
    const p = plane.current;
    if (p) planes.add(p);
    return () => {
      if (p) planes.delete(p);
      r.target.dispose();
      r.spare.dispose();
      r.depth.dispose();
      r.h.dispose();
      r.v.dispose();
      r.quad.dispose();
    };
  }, [r]);

  const blurOnce = (amount: number) => {
    r.quad.material = r.h;
    r.h.uniforms.tDiffuse.value = r.target.texture;
    r.h.uniforms.h.value = amount / 256;
    gl.setRenderTarget(r.spare);
    r.quad.render(gl);
    r.quad.material = r.v;
    r.v.uniforms.tDiffuse.value = r.spare.texture;
    r.v.uniforms.v.value = amount / 256;
    gl.setRenderTarget(r.target);
    r.quad.render(gl);
  };

  useFrame(() => {
    const p = game.me.pos;
    r.cam.position.set(p.x, 0.003, p.z);
    r.cam.lookAt(p.x, 1, p.z);
    r.cam.updateMatrixWorld();
    plane.current?.position.set(p.x, lift, p.z);

    const background = scene.background;
    const override = scene.overrideMaterial;
    const autoClear = gl.autoClear;
    planes.forEach((o) => (o.visible = false));
    scene.background = null;
    scene.overrideMaterial = r.depth;
    gl.autoClear = true; // the composer turns it off; these passes clear to transparent
    gl.setRenderTarget(r.target);
    gl.render(scene, r.cam);
    scene.overrideMaterial = override;
    scene.background = background;
    blurOnce(blur);
    blurOnce(blur * 0.4);
    gl.setRenderTarget(null);
    gl.autoClear = autoClear;
    planes.forEach((o) => (o.visible = true));
  });

  return (
    <mesh ref={plane} rotation-x={Math.PI / 2} renderOrder={-1}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial map={r.target.texture} transparent opacity={opacity} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}
