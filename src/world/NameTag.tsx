/** A name over someone's head: a small sprite, always facing the camera, never hidden by the room. */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

export function NameTag({ text, color, y }: { text: string; color: string; y: number }) {
  const { tex, aspect } = useMemo(() => {
    const scale = 2;
    const font = `600 ${26 * scale}px Inter, system-ui, sans-serif`;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d')!;
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + 44 * scale;
    const h = 46 * scale;
    c.width = w;
    c.height = h;
    ctx.font = font;
    ctx.fillStyle = 'rgba(22,25,27,0.82)';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(h / 2, h / 2, 7 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f6f3ec';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, h / 2 + 14 * scale, h / 2 + 1);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return { tex: t, aspect: w / h };
  }, [text, color]);
  useEffect(() => () => tex.dispose(), [tex]);
  const h = 0.3;
  return (
    <sprite position={[0, y, 0]} scale={[h * aspect, h, 1]} renderOrder={10}>
      <spriteMaterial map={tex} depthTest={false} transparent fog={false} />
    </sprite>
  );
}
