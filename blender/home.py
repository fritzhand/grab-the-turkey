"""
Builds a home from a plan, in Blender, headless, and writes the two things the game needs:

  public/models/<id>.glb          the model, drawn in the game's storybook style (painterly: true)
  src/env/<id>.layout.json        the collision boxes, spawns, dog and turkey starts, and bounds

from one file of plain data, homes/<id>/plan.json, so what you see is what you bump into.

    blender -b --factory-startup --python-exit-code 1 --python blender/home.py -- homes/example-home/plan.json \
        [--glb PATH] [--layout PATH] [--preview DIR]

The plan, in meters, in game coordinates (x east, z south, so north is -z; put (0, 0) at the middle of the
house). See homes/example-home/plan.json for a whole one, and docs/BUILD-YOUR-HOME.md for how to write yours.

    {
      "id": "my-home",
      "house": { "x0": -9, "x1": 9, "z0": -6.5, "z1": 6.5 },     the outside of the house (the floor)
      "wall": { "height": 2.6, "thickness": 0.2, "cut": 1.1 },   cut: below it, the dollhouse walls you
                                                                  play among; above it, lifted off in game
      "walls": [ { "from": [-9, -6.5], "to": [9, -6.5],          each wall runs along x or along z
                   "doors": [ { "at": 3.0, "width": 1.0 } ],     at: meters from "from" to the door's middle
                   "windows": [ { "at": 6, "width": 1.6 } ],
                   "height": 1.1 } ],                            optional: a half wall stops at the cut
      "rooms": [ { "name": "Kitchen", "x0": 0, "x1": 9, "z0": -1, "z1": 6.5, "floor": "tile" } ],
      "furniture": [ { "kind": "table", "x": 4.4, "z": 2, "w": 2.4, "d": 1.1, "h": 0.76, "rot": 0,
                       "color": "#8a6e55", "name": "Dining table" } ],
      "roof": { "pitch": 0.45, "overhang": 0.5, "color": "#5b636b" },
      "yard": { "margin": 7, "trees": 10, "seed": 3 },
      "spawns": [[-3, 1.5]], "dogStart": [-6.5, -3], "turkeyStart": [4.4, 0.76, 2.0]
    }

Furniture kinds: table, counter, couch, chair, bed, plant, rug (drawn, never collides), box.
Room floors: wood, tile, carpet, or a hex color.

Groups, by name, which the game reads (src/world/PaintedModel.tsx):
  GRP_Lower  the floor, the walls up to the cut, the furniture: always there
  GRP_Upper  the walls above the cut and the roof: lifted off when the game starts, so you can see in
  GRP_Site   the yard and the trees: scenery, kept out of the contact shadows
"""
import json
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import lib  # noqa: E402
from lib import MB, B  # noqa: E402

lib.OX = 0.0  # a plan is written around its own middle
ROOT = os.path.dirname(HERE)
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


PLAN_PATH = next((a for a in argv if a.endswith('.json')), None)
if not PLAN_PATH:
    sys.exit('usage: blender -b --python blender/home.py -- homes/<id>/plan.json')
PLAN = json.load(open(PLAN_PATH))
ID = PLAN['id']
GLB = arg('--glb', os.path.join(ROOT, 'public', 'models', f'{ID}.glb'))
LAYOUT = arg('--layout', os.path.join(ROOT, 'src', 'env', f'{ID}.layout.json'))
PREVIEW = arg('--preview')

WALL = {'height': 2.6, 'thickness': 0.2, 'cut': 1.1, **PLAN.get('wall', {})}
H, TH, CUT = WALL['height'], WALL['thickness'], WALL['cut']
HOUSE = PLAN['house']

FLOORS = {'wood': 'floor', 'tile': 'tile', 'carpet': 'rug_c'}


def key(color, fallback):
    """A material key for a palette name or a hex color (added to the palette on the way)."""
    if not color:
        return fallback
    if color in lib.PALETTE:
        return color
    if color.startswith('#'):
        k = 'c_' + color[1:].lower()
        lib.PALETTE.setdefault(k, color)
        return k
    return FLOORS.get(color, fallback)


# ------------------------------------------------------------------------------------------------ walls
def spans(length, holes):
    """The solid stretches of a wall `length` long, around holes given as (middle, width)."""
    cuts = sorted((max(0.0, a - w / 2), min(length, a + w / 2)) for a, w in holes)
    out, at = [], 0.0
    for a, b in cuts:
        if a > at:
            out.append((at, a))
        at = max(at, b)
    if at < length:
        out.append((at, length))
    return out


def walls(lower, upper):
    for wi, w in enumerate(PLAN['walls']):
        (x1, z1), (x2, z2) = w['from'], w['to']
        along_x = abs(x2 - x1) >= abs(z2 - z1)
        length = abs(x2 - x1) if along_x else abs(z2 - z1)
        sign = 1 if (x2 - x1 if along_x else z2 - z1) >= 0 else -1
        doors = [(d['at'], d.get('width', 0.95)) for d in w.get('doors', [])]
        windows = [(d['at'], d.get('width', 1.2)) for d in w.get('windows', [])]

        def box(a, b, y0, y1, mb, k='wall'):
            # a stretch from a to b meters along the wall, between heights y0 and y1; ends overlap a half
            # thickness so corners close
            a0, b0 = a - (TH / 2 if a <= 0 else 0), b + (TH / 2 if b >= length else 0)
            if along_x:
                xa, xb = x1 + sign * a0, x1 + sign * b0
                mb.box(min(xa, xb), max(xa, xb), z1 - TH / 2, z1 + TH / 2, y0, y1, k)
            else:
                za, zb = z1 + sign * a0, z1 + sign * b0
                mb.box(x1 - TH / 2, x1 + TH / 2, min(za, zb), max(za, zb), y0, y1, k)

        # below the cut: solid between the doors; it collides
        for a, b in spans(length, doors):
            box(a, b, 0.0, CUT, lower)
            box(a, b, CUT - 0.04, CUT, lower, 'trim')   # a cap along the cut edge, so it reads as cut
            mid = (a + b) / 2
            if along_x:
                lib.piece('wall', w.get('name', f'wall {wi}'), x1 + sign * mid, z1, (b - a) + TH, TH, CUT)
            else:
                lib.piece('wall', w.get('name', f'wall {wi}'), x1, z1 + sign * mid, TH, (b - a) + TH, CUT)
        # a low wall (a half wall, a counter wall) stops at the cut: nothing above
        if w.get('height', H) <= CUT:
            continue
        # above the cut: solid except over the doors (up to 2.05 m) and the windows (1.0 to 2.1 m)
        for a, b in spans(length, doors + windows):
            box(a, b, CUT, H, upper)
        for at, wd in doors:
            box(at - wd / 2, at + wd / 2, 2.05, H, upper)
        for at, wd in windows:
            box(at - wd / 2, at + wd / 2, 2.1, H, upper)
            box(at - wd / 2, at + wd / 2, CUT, 1.0, upper)
            box(at - wd / 2, at + wd / 2, 1.0, 2.1, upper, 'glass')


# ----------------------------------------------------------------------------------------- furniture
def place(cx, cz, rot):
    """Local (lx, lz) in a piece's frame to a game point, turned `rot` degrees as lib.xbox turns boxes."""
    t = math.radians(rot)
    c, s = math.cos(t), math.sin(t)

    def at(lx, lz):
        bx, by = lx, -lz                         # to Blender's frame (y north)
        rx, ry = bx * c - by * s, bx * s + by * c
        return cx + rx, cz - ry
    return at


def furniture(mb_ink, mb_flat):
    for f in PLAN.get('furniture', []):
        k, x, z, w, d, h = f['kind'], f['x'], f['z'], f['w'], f['d'], f.get('h', 0.8)
        rot = f.get('rot', 0)
        at = place(x, z, rot)

        def part(lx, lz, y0, y1, sw, sd, mat, mb=mb_ink):
            px, pz = at(lx, lz)
            mb.xbox(px, pz, (y0 + y1) / 2, sw, sd, y1 - y0, mat, rot=rot)

        col = f.get('color')
        if k == 'table':
            wood = key(col, 'wood')
            part(0, 0, h - 0.05, h, w, d, wood)
            for sx in (-1, 1):
                for sz in (-1, 1):
                    part(sx * (w / 2 - 0.08), sz * (d / 2 - 0.08), 0, h - 0.05, 0.07, 0.07, key(col, 'wood_d'))
        elif k == 'counter':
            part(0, 0, 0, h - 0.04, w - 0.04, d - 0.04, key(col, 'cabinet'))
            part(0, 0, h - 0.04, h, w, d, 'counter')
        elif k == 'couch':
            c = key(col, 'sofa')
            part(0, 0.08, 0, 0.42, w, d - 0.16, c)                        # the seat
            part(0, -d / 2 + 0.11, 0, h, w, 0.22, c)                       # the back (toward -z before turning)
            for sx in (-1, 1):
                part(sx * (w / 2 - 0.1), 0.05, 0, 0.6, 0.2, d - 0.1, c)    # the arms
            for i in range(max(1, round(w / 0.9))):
                n = max(1, round(w / 0.9))
                part(-w / 2 + 0.2 + (i + 0.5) * (w - 0.4) / n, 0.1, 0.42, 0.52, (w - 0.4) / n - 0.05, d - 0.4, 'cushion')
        elif k == 'chair':
            c = key(col, 'wood')
            part(0, 0, 0.42, 0.47, w, d, c)
            part(0, -d / 2 + 0.03, 0.47, h, w, 0.05, c)
            for sx in (-1, 1):
                for sz in (-1, 1):
                    part(sx * (w / 2 - 0.04), sz * (d / 2 - 0.04), 0, 0.42, 0.04, 0.04, key(col, 'wood_d'))
        elif k == 'bed':
            part(0, 0, 0, 0.3, w, d, 'wood_d')                             # the frame
            part(0, 0.05, 0.3, h - 0.05, w - 0.06, d - 0.1, 'linen')       # the mattress
            part(0, 0.25, h - 0.08, h, w - 0.02, d * 0.62, key(col, 'curtain'))   # the blanket
            part(0, -d / 2 + 0.28, h - 0.06, h + 0.07, w * 0.7, 0.32, 'cushion')  # the pillow
            part(0, -d / 2 + 0.03, 0, h + 0.35, w + 0.04, 0.06, 'wood_d')  # the headboard
        elif k == 'plant':
            px, pz = at(0, 0)
            mb_ink.cyl(px, pz, 0.18, min(w, d) * 0.38, 0.36, 'pot', r2=min(w, d) * 0.3)
            mb_ink.blob(px, pz, h * 0.65, w * 0.55, d * 0.55, h * 0.4, key(col, 'plant'), jitter=0.12, seed=int(x * 7 + z * 13))
        elif k == 'rug':
            part(0, 0, 0.0, 0.02, w, d, key(col, 'rug_a'), mb_flat)
            continue                                                      # rugs never collide
        else:
            part(0, 0, 0, h, w, d, key(col, 'wood'))
        lib.piece(k if k in ('table', 'counter', 'couch', 'bed', 'chair', 'plant') else 'box', f.get('name', k), x, z, w, d, h, rot)


# -------------------------------------------------------------------------------------------- floors
def floors(mb):
    x0, x1, z0, z1 = HOUSE['x0'], HOUSE['x1'], HOUSE['z0'], HOUSE['z1']
    mb.box(x0 - TH / 2, x1 + TH / 2, z0 - TH / 2, z1 + TH / 2, -0.3, 0.0, 'floor')
    # boards: faint lines across the main floor
    for i, zz in enumerate([z0 + 0.6 * k for k in range(1, int((z1 - z0) / 0.6))]):
        mb.box(x0, x1, zz - 0.006, zz + 0.006, 0.0, 0.002, 'floor_line')
    for r in PLAN.get('rooms', []):
        if r.get('floor') and r['floor'] != 'wood':
            mb.box(r['x0'], r['x1'], r['z0'], r['z1'], 0.0, 0.004, key(r['floor'], 'tile'))


# ---------------------------------------------------------------------------------------------- roof
def roof(mb):
    rf = {'pitch': 0.45, 'overhang': 0.5, 'color': 'roof', **PLAN.get('roof', {})}
    o = rf['overhang']
    x0, x1, z0, z1 = HOUSE['x0'] - o, HOUSE['x1'] + o, HOUSE['z0'] - o, HOUSE['z1'] + o
    # a gable along the longer side
    along_x = (x1 - x0) >= (z1 - z0)
    half = ((z1 - z0) if along_x else (x1 - x0)) / 2
    rise = half * rf['pitch']
    k = key(rf['color'], 'roof')
    t = 0.18
    if along_x:
        zm = (z0 + z1) / 2
        mb.prism([(x0, z0, H), (x1, z0, H), (x1, zm, H + rise), (x0, zm, H + rise)], (0, 0, t), k)
        mb.prism([(x0, zm, H + rise), (x1, zm, H + rise), (x1, z1, H), (x0, z1, H)], (0, 0, t), k)
        for xx in (HOUSE['x0'], HOUSE['x1']):    # the gable ends
            mb.prism([(xx, HOUSE['z0'], H), (xx, HOUSE['z1'], H), (xx, zm, H + rise * (half - o) / half)], (0.001, 0, 0), 'wall')
    else:
        xm = (x0 + x1) / 2
        mb.prism([(x0, z0, H), (xm, z0, H + rise), (xm, z1, H + rise), (x0, z1, H)], (0, 0, t), k)
        mb.prism([(xm, z0, H + rise), (x1, z0, H), (x1, z1, H), (xm, z1, H + rise)], (0, 0, t), k)


# ---------------------------------------------------------------------------------------------- yard
def yard(ground, trees):
    y = {'margin': 7, 'trees': 10, 'seed': 3, **PLAN.get('yard', {})}
    m = y['margin']
    x0, x1, z0, z1 = HOUSE['x0'] - m, HOUSE['x1'] + m, HOUSE['z0'] - m, HOUSE['z1'] + m
    ground.box(x0, x1, z0, z1, -0.5, -0.05, 'grass')
    # a path from the front door, if one is marked
    if 'path' in y:
        (px, pz), w = y['path']['from'], y['path'].get('width', 1.2)
        ground.box(px - w / 2, px + w / 2, pz, z1, -0.05, -0.03, 'gravel')
    rnd = random.Random(y['seed'])
    placed = 0
    while placed < y['trees']:
        tx, tz = rnd.uniform(x0 + 1, x1 - 1), rnd.uniform(z0 + 1, z1 - 1)
        if HOUSE['x0'] - 2.5 < tx < HOUSE['x1'] + 2.5 and HOUSE['z0'] - 2.5 < tz < HOUSE['z1'] + 2.5:
            continue
        s = rnd.uniform(0.8, 1.3)
        trees.cyl(tx, tz, 1.0 * s, 0.14 * s, 2.0 * s, 'trunk')
        trees.blob(tx, tz, 2.6 * s, 1.4 * s, 1.4 * s, 1.2 * s, rnd.choice(['leaf_a', 'leaf_b', 'leaf_c', 'leaf_d']),
                   jitter=0.15, seed=placed)
        placed += 1


# ----------------------------------------------------------------------------------------- the build
def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for g in ('GRP_Lower', 'GRP_Upper', 'GRP_Site'):
        lib.group(g)
    floor = MB('floor', 'GRP_Lower', vcol=False)
    lower = MB('walls_lower', 'GRP_Lower', ink=True, vcol=False)
    upper = MB('walls_upper', 'GRP_Upper', ink=True, vcol=False)
    things = MB('furniture', 'GRP_Lower', ink=True, vcol=False)
    flat = MB('rugs', 'GRP_Lower', vcol=False)
    top = MB('roof', 'GRP_Upper', ink=True, vcol=False)
    ground = MB('terrain', 'GRP_Site', vcol=False)
    trees = MB('trees', 'GRP_Site', ink=True, vcol=False)

    floors(floor)
    walls(lower, upper)
    furniture(things, flat)
    roof(top)
    yard(ground, trees)
    for mb in (floor, lower, upper, things, flat, top, ground, trees):
        mb.finish()

    lib.LAYOUT['bounds'] = {'kind': 'rect', 'hx': round((HOUSE['x1'] - HOUSE['x0']) / 2 - TH / 2, 3),
                            'hz': round((HOUSE['z1'] - HOUSE['z0']) / 2 - TH / 2, 3)}
    lib.LAYOUT['spawns'] = PLAN['spawns']
    lib.LAYOUT['dogStart'] = PLAN['dogStart']
    lib.LAYOUT['turkeyStart'] = PLAN['turkeyStart']


def preview():
    """A quick Workbench still from above (a check on the geometry, not the game's look)."""
    os.makedirs(PREVIEW, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.render.resolution_x, scene.render.resolution_y = 1400, 900
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'MATERIAL'
    scene.display.shading.show_object_outline = True
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    span = max(HOUSE['x1'] - HOUSE['x0'], HOUSE['z1'] - HOUSE['z0'])
    for name, upper in (('outside', True), ('dollhouse', False)):
        cam.location = B(0, span * 1.5, span * 1.3)
        cam.rotation_euler = (B(0, 0, 0) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        for o in bpy.data.objects:
            if o.parent and o.parent.name == 'GRP_Upper':
                o.hide_render = not upper
        scene.render.filepath = os.path.join(PREVIEW, f'{ID}-{name}.png')
        bpy.ops.render.render(write_still=True)


def export():
    os.makedirs(os.path.dirname(GLB), exist_ok=True)
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    kw = dict(filepath=GLB, export_format='GLB', export_apply=True, export_yup=True,
              export_cameras=False, export_lights=False, export_extras=False)
    if 'export_image_format' in props:
        kw['export_image_format'] = 'NONE'
    bpy.ops.export_scene.gltf(**kw)
    print('EXPORTED', GLB, os.path.getsize(GLB), 'bytes')


if __name__ == '__main__':
    build()
    lib.write_layout(LAYOUT)
    print('LAYOUT', LAYOUT, len(lib.LAYOUT['pieces']), 'pieces')
    if PREVIEW:
        preview()
    export()
