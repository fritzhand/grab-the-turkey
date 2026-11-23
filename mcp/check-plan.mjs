// Checks a home plan (homes/<id>/plan.json) before anyone runs Blender on it: the shape of the file, and the
// things that make a home miserable to play in (a door too narrow for a pup, a wall that misses the corner, the
// turkey inside the table, a spawn in the couch). The rules follow blender/home.py, which builds the plan, and the
// game, which plays it. Plain JavaScript with no imports, so the MCP server and anyone else can use it.

const KINDS = ['table', 'counter', 'couch', 'chair', 'bed', 'plant', 'rug', 'box'];
const FLOORS = ['wood', 'tile', 'carpet'];
/** A pup needs about this much to get through a door (its body, and a little to spare). */
const DOOR_MIN = 0.9;
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const pair = (v) => Array.isArray(v) && v.length === 2 && v.every(num);

/** Whether a point is inside a piece of furniture (turned by rot, in degrees), grown by r. */
function inside(f, x, z, r = 0) {
  const a = ((f.rot ?? 0) * Math.PI) / 180;
  const dx = x - f.x;
  const dz = z - f.z;
  const lx = Math.cos(a) * dx - Math.sin(a) * dz;
  const lz = Math.sin(a) * dx + Math.cos(a) * dz;
  return Math.abs(lx) < f.w / 2 + r && Math.abs(lz) < f.d / 2 + r;
}

/**
 * @param {unknown} input the plan, as an object or as JSON text
 * @param {{ palette?: string[] }} [o] the palette's color names (blender/lib.py)
 * @returns {{ ok: boolean, errors: string[], warnings: string[], summary: string }}
 */
export function checkPlan(input, o = {}) {
  const errors = [];
  const warnings = [];
  let plan = input;
  if (typeof input === 'string') {
    try {
      plan = JSON.parse(input);
    } catch (e) {
      return { ok: false, errors: [`This is not JSON: ${e.message}`], warnings, summary: '' };
    }
  }
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return { ok: false, errors: ['A plan is one JSON object.'], warnings, summary: '' };
  const p = /** @type {any} */ (plan);
  const palette = new Set(o.palette ?? []);
  const color = (c, where, floors = false) => {
    if (c === undefined) return;
    if (typeof c !== 'string') return errors.push(`${where}: a color is a palette name or a hex color like "#8a6e55".`);
    if (/^#[0-9a-f]{6}$/i.test(c) || palette.has(c) || (floors && FLOORS.includes(c))) return;
    if (c.startsWith('#')) return errors.push(`${where}: "${c}" is not a six-digit hex color.`);
    if (palette.size) warnings.push(`${where}: "${c}" is not in the palette, so it falls back to the default color. Use a hex color, or one of: ${[...palette].slice(0, 12).join(', ')}…`);
  };

  // --- id and the house
  if (typeof p.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id)) errors.push('id: lowercase letters, numbers and dashes, like "my-home". It names the model, the layout and the ?env= link.');
  const h = p.house;
  const house = h && ['x0', 'x1', 'z0', 'z1'].every((k) => num(h[k])) && h.x1 > h.x0 && h.z1 > h.z0;
  if (!house) errors.push('house: { "x0", "x1", "z0", "z1" } in meters, x0 < x1 and z0 < z1, with (0, 0) at the middle of the house.');
  const wall = { height: 2.6, thickness: 0.2, cut: 1.1, ...(p.wall ?? {}) };
  if (![wall.height, wall.thickness, wall.cut].every(num)) errors.push('wall: height, thickness and cut are numbers in meters.');
  else if (wall.cut >= wall.height) warnings.push('wall.cut is at or above wall.height, so nothing lifts off and the TV cannot see in.');

  const inHouse = (x, z, pad = 0) => house && x >= h.x0 - pad && x <= h.x1 + pad && z >= h.z0 - pad && z <= h.z1 + pad;
  const W = house ? h.x1 - h.x0 : 0;
  const D = house ? h.z1 - h.z0 : 0;
  if (house) {
    if (Math.abs((h.x0 + h.x1) / 2) > 1.5 || Math.abs((h.z0 + h.z1) / 2) > 1.5) warnings.push('house: (0, 0) is meant to be the middle of the house; this one is off to one side. It works, but the TV camera centers on (0, 0).');
    if (W * D > 400) warnings.push(`house: ${W} x ${D} m is a big place for one overhead shot. Consider screen: 'split' for the TV (see get_step "customize").`);
    if (W < 5 || D < 5) warnings.push(`house: ${W} x ${D} m is small; there may not be room to run.`);
  }

  // --- walls
  if (!Array.isArray(p.walls) || !p.walls.length) errors.push('walls: a list of walls, each { "from": [x, z], "to": [x, z] }.');
  let doors = 0;
  for (const [i, w] of (Array.isArray(p.walls) ? p.walls : []).entries()) {
    const name = `walls[${i}]${w?.name ? ` (${w.name})` : ''}`;
    if (!w || !pair(w.from) || !pair(w.to)) {
      errors.push(`${name}: "from" and "to" are [x, z] pairs.`);
      continue;
    }
    const [x1, z1] = w.from;
    const [x2, z2] = w.to;
    const dx = Math.abs(x2 - x1);
    const dz = Math.abs(z2 - z1);
    if (dx > 0.01 && dz > 0.01) errors.push(`${name}: walls run along x or along z. This one goes diagonally; split it, or straighten it.`);
    const length = Math.max(dx, dz);
    if (length < 0.2) errors.push(`${name}: it is ${length.toFixed(2)} m long.`);
    if (house && (!inHouse(x1, z1, 0.3) || !inHouse(x2, z2, 0.3))) warnings.push(`${name}: it reaches outside the house's outline.`);
    if (w.height !== undefined && (!num(w.height) || w.height <= 0)) errors.push(`${name}: height is a number of meters (a half wall is 1.1).`);
    for (const [kind, list, min] of [['doors', w.doors, DOOR_MIN], ['windows', w.windows, 0.3]]) {
      if (list === undefined) continue;
      if (!Array.isArray(list)) {
        errors.push(`${name}: ${kind} is a list of { "at", "width" }.`);
        continue;
      }
      for (const [j, d] of list.entries()) {
        const at = d?.at;
        const width = d?.width ?? (kind === 'doors' ? 0.95 : 1.2);
        if (!num(at) || !num(width)) {
          errors.push(`${name}.${kind}[${j}]: "at" (meters from the wall's "from" end to the middle) and "width" are numbers.`);
          continue;
        }
        if (at - width / 2 < -0.01 || at + width / 2 > length + 0.01) errors.push(`${name}.${kind}[${j}]: at ${at} with width ${width} runs past the end of a wall ${length.toFixed(2)} m long. "at" is measured from "from".`);
        if (kind === 'doors') {
          doors++;
          if (width < min) warnings.push(`${name}.doors[${j}]: ${width} m is tight. A pup needs about ${DOOR_MIN} m; a chase needs more. Widen it in the plan (doors in the game can be wider than real ones).`);
        }
      }
    }
  }
  if (Array.isArray(p.walls) && p.walls.length > 4 && !doors) warnings.push('walls: there are inside walls but no doors, so some rooms may be shut off.');

  // --- rooms
  for (const [i, r] of (Array.isArray(p.rooms) ? p.rooms : []).entries()) {
    const name = `rooms[${i}]${r?.name ? ` (${r.name})` : ''}`;
    if (!r || !['x0', 'x1', 'z0', 'z1'].every((k) => num(r[k])) || r.x1 <= r.x0 || r.z1 <= r.z0) errors.push(`${name}: { "x0", "x1", "z0", "z1" } with x0 < x1 and z0 < z1.`);
    else if (house && (!inHouse(r.x0, r.z0, 0.3) || !inHouse(r.x1, r.z1, 0.3))) warnings.push(`${name}: it reaches outside the house.`);
    if (r) color(r.floor, `${name}.floor`, true);
  }

  // --- furniture
  const solid = [];
  for (const [i, f] of (Array.isArray(p.furniture) ? p.furniture : []).entries()) {
    const name = `furniture[${i}]${f?.name ? ` (${f.name})` : ''}`;
    if (!f || !KINDS.includes(f.kind)) {
      errors.push(`${name}: kind is one of ${KINDS.join(', ')}.`);
      continue;
    }
    if (![f.x, f.z, f.w, f.d].every(num) || f.w <= 0 || f.d <= 0) {
      errors.push(`${name}: x, z (its middle), w (along x) and d (along z) are numbers in meters.`);
      continue;
    }
    if (f.h !== undefined && (!num(f.h) || f.h <= 0)) errors.push(`${name}: h is its height in meters.`);
    if (f.rot !== undefined && !num(f.rot)) errors.push(`${name}: rot is a turn in degrees.`);
    if (house && !inHouse(f.x, f.z)) warnings.push(`${name}: its middle is outside the house, where nobody can play.`);
    if (f.kind !== 'rug' && (f.h ?? 0.8) > 2.2) warnings.push(`${name}: ${f.h} m tall blocks the view from above. The game is seen from overhead; keep furniture under about 2 m.`);
    color(f.color, `${name}.color`);
    if (f.kind !== 'rug') solid.push({ ...f, name });
  }

  // --- where things start
  if (!Array.isArray(p.spawns) || !p.spawns.length || !p.spawns.every(pair)) errors.push('spawns: a list of [x, z] where players appear, in turn. Ten covers a big party.');
  else {
    if (p.spawns.length < 4) warnings.push(`spawns: ${p.spawns.length} is few. Players beyond that appear on top of each other; ten is a good number.`);
    for (const [i, [x, z]] of p.spawns.entries()) {
      if (house && !inHouse(x, z, -0.3)) errors.push(`spawns[${i}]: [${x}, ${z}] is outside the house (or against its wall).`);
      const hit = solid.find((f) => inside(f, x, z, 0.3));
      if (hit) errors.push(`spawns[${i}]: [${x}, ${z}] is inside ${hit.name}.`);
    }
  }
  if (!pair(p.dogStart)) errors.push('dogStart: [x, z] where the dog starts.');
  else {
    if (house && !inHouse(p.dogStart[0], p.dogStart[1], -0.3)) errors.push('dogStart: it is outside the house.');
    const hit = solid.find((f) => inside(f, p.dogStart[0], p.dogStart[1], 0.3));
    if (hit) errors.push(`dogStart: it is inside ${hit.name}.`);
  }
  const t = p.turkeyStart;
  if (!Array.isArray(t) || t.length !== 3 || !t.every(num)) errors.push('turkeyStart: [x, y, z], with y the height it sits at: put it on the dining table, at the table\'s height (about 0.76).');
  else {
    const under = solid.find((f) => inside(f, t[0], t[2]));
    if (house && !inHouse(t[0], t[2])) errors.push('turkeyStart: it is outside the house.');
    if (under && Math.abs((under.h ?? 0.8) - t[1]) > 0.05) errors.push(`turkeyStart: it is over ${under.name} (${under.h ?? 0.8} m tall) but at y = ${t[1]}. Set y to ${under.h ?? 0.8}, or it sits inside the furniture.`);
    if (!under && t[1] > 0.05) warnings.push(`turkeyStart: y is ${t[1]}, but nothing stands under it, so it drops to the floor. Put it over the table.`);
    if (!under) warnings.push('turkeyStart: a turkey on the dining table is the tradition (and makes the first grab a race).');
  }
  if (p.roof !== undefined && (typeof p.roof !== 'object' || (p.roof.pitch !== undefined && !num(p.roof.pitch)))) errors.push('roof: { "pitch", "overhang", "color" }, all optional.');
  if (p.yard !== undefined && typeof p.yard !== 'object') errors.push('yard: { "margin", "trees", "seed", "path" }, all optional.');
  if (p.roof) color(p.roof.color, 'roof.color');

  const summary = house
    ? `${p.id ?? '(no id)'}: ${W} x ${D} m, ${(p.walls ?? []).length} walls with ${doors} doors, ${(p.rooms ?? []).length} rooms, ${(p.furniture ?? []).length} pieces of furniture, ${(p.spawns ?? []).length} spawns.`
    : '';
  return { ok: errors.length === 0, errors, warnings, summary };
}
