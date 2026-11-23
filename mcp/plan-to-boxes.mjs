// A home plan (homes/<id>/plan.json) as plain boxes, for the White Room look: no Blender, no model, just the walls
// (low, with gaps for the doors) and the furniture as boxes on the endless white floor. The same plan builds the
// painted look with blender/home.py, so someone can switch looks without measuring twice.

const r3 = (v) => Math.round(v * 1000) / 1000;
/** White Room walls stay low, so the camera sees over them. */
const WALL_H = 1.1;

/**
 * @param {any} plan a plan that passes checkPlan
 * @param {Record<string, string>} [palette] color names to hex (blender/lib.py)
 */
export function planToBoxes(plan, palette = {}) {
  const th = plan.wall?.thickness ?? 0.2;
  const tint = (c) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : palette[c]);
  const pieces = [];

  for (const w of plan.walls) {
    const [x1, z1] = w.from;
    const [x2, z2] = w.to;
    const alongX = Math.abs(x2 - x1) >= Math.abs(z2 - z1);
    const length = alongX ? Math.abs(x2 - x1) : Math.abs(z2 - z1);
    const sign = (alongX ? x2 - x1 : z2 - z1) >= 0 ? 1 : -1;
    const h = Math.min(w.height ?? WALL_H, WALL_H);
    // the solid stretches between the doors (windows are only drawn in the painted look)
    const holes = (w.doors ?? []).map((d) => [Math.max(0, d.at - (d.width ?? 0.95) / 2), Math.min(length, d.at + (d.width ?? 0.95) / 2)]).sort((a, b) => a[0] - b[0]);
    let at = 0;
    const spans = [];
    for (const [a, b] of holes) {
      if (a > at) spans.push([at, a]);
      at = Math.max(at, b);
    }
    if (at < length) spans.push([at, length]);
    for (const [a, b] of spans) {
      // the ends overlap half a thickness at the wall's own ends, so corners close
      const a0 = a - (a <= 0 ? th / 2 : 0);
      const b0 = b + (b >= length ? th / 2 : 0);
      const mid = (a0 + b0) / 2;
      const len = b0 - a0;
      pieces.push({
        kind: 'wall',
        name: w.name ?? 'Wall',
        x: r3(alongX ? x1 + sign * mid : x1),
        z: r3(alongX ? z1 : z1 + sign * mid),
        w: r3(alongX ? len : th),
        d: r3(alongX ? th : len),
        h,
      });
    }
  }

  for (const f of plan.furniture ?? []) {
    if (f.kind === 'rug') continue; // a rug is only drawn, and the White Room look draws no floor
    const p = { kind: f.kind, name: f.name ?? f.kind, x: f.x, z: f.z, w: f.w, d: f.d, h: f.h ?? 0.8 };
    if (f.rot) p.rot = f.rot;
    const c = tint(f.color);
    if (c) p.color = c;
    pieces.push(p);
  }

  const h = plan.house;
  return {
    bounds: { kind: 'rect', hx: r3((h.x1 - h.x0) / 2 - th / 2), hz: r3((h.z1 - h.z0) / 2 - th / 2) },
    pieces,
    spawns: plan.spawns,
    dogStart: plan.dogStart,
    turkeyStart: plan.turkeyStart,
  };
}
