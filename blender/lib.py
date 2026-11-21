"""
Helpers for building places and characters in Blender, headless (blender/pup.py uses them).

Coordinates: everything is written in GAME coordinates, the way the game reads them:
    x  east,   z  south (so north is -z),   y  up,   in meters.
Blender is Z-up with +Y north, so a game point (x, z, y) becomes Blender (x, -z, y).
The glTF exporter turns that back into the game's Y-up, so the GLB drops into the game as it is.

OX shifts a whole building east, so the game's origin (0, 0) sits in the middle of the part you
can play in and the bounds can be a plain, centered rectangle.
"""
import json
import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

OX = 0.8


# ---------------------------------------------------------------------------------------------
# color
# ---------------------------------------------------------------------------------------------
def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgb(hexcol):
    h = hexcol.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def lin(hexcol, a=1.0):
    r, g, b = rgb(hexcol)
    return (_lin(r), _lin(g), _lin(b), a)


# The storybook palette, sampled from the concept board and the listing photos. Each key is also
# the material's name, so the game can read what a surface is made of.
PALETTE = {
    # the house
    'siding': '#c9d3d1', 'trim': '#f6f1e4', 'roof': '#5b636b', 'roof_dark': '#434a52',
    'cedar': '#c68b56', 'cedar_dark': '#a67651', 'timber': '#b9824f',
    'glass': '#9db4bd', 'frame': '#3c4248', 'iron': '#2d3034',
    'rail_wire': '#aeb6b6', 'brass': '#c9a35a',
    # stone and ground
    'stone_l': '#cdc7ba', 'stone_m': '#a99a86', 'stone_d': '#85755f', 'moss': '#9aa86d',
    'grass': '#b7c273', 'grass_d': '#93ac6b', 'grass_l': '#cdd185', 'gravel': '#e6d6bb',
    'sand': '#d9c8a0', 'earth': '#a58a68', 'water': '#8fbcce', 'water_l': '#c4dfe6',
    # plants
    'leaf_a': '#b9c070', 'leaf_b': '#a4b765', 'leaf_c': '#c8c776', 'leaf_d': '#8fae70',
    'pine': '#7fa07a', 'pine_d': '#6b8f6d', 'trunk': '#8a6b52', 'birch': '#e8e0d0',
    'flower_pink': '#e48ea3', 'flower_yellow': '#f0d36a', 'pot': '#c9825a', 'plant': '#7ea36a',
    # inside
    'floor': '#dcbd8f', 'floor_line': '#c9a877', 'wall': '#f3eee0', 'slate': '#4d5258',
    'cabinet': '#b3b9c6', 'counter': '#dedbd3', 'steel': '#bfc5c8', 'sofa': '#7d8da0',
    'cushion': '#e9e3d4', 'rug_a': '#b9737a', 'rug_b': '#6a9aa6', 'rug_c': '#d9c9a3',
    'teal': '#4f9aa0', 'wood': '#d6b68a', 'wood_d': '#a98860', 'linen': '#f6f3ec',
    'blue_rug': '#43607d', 'curtain': '#8aa0b2', 'tile': '#eceae3', 'porcelain': '#f7f5ef',
    'dog_bowl': '#5f8fb4', 'copper': '#c08457',
    # the pups: the game repaints these by name, per player (see src/world/pups.ts)
    'coat': '#7f9bbd', 'point': '#e0a766', 'muzzle': '#f2e2c4', 'ear': '#5f7898', 'ear_in': '#f2c4b2',
    'nose': '#2a2a30', 'eye': '#26262c', 'eye_hi': '#ffffff', 'jumper': '#c2410c', 'jumper_hem': '#f1e6d2',
    'foot': '#e0a766', 'tail_tip': '#f4ecd8',
    # a white base, for things whose color lives in their vertices (terrain, stones, foliage)
    'white': '#ffffff',
}

_materials = {}


def material(key):
    m = _materials.get(key)
    if m:
        return m
    m = bpy.data.materials.new(key)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    if bsdf is None:
        bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = lin(PALETTE[key])
    bsdf.inputs['Roughness'].default_value = 1.0
    m.diffuse_color = lin(PALETTE[key])
    _materials[key] = m
    return m


# ---------------------------------------------------------------------------------------------
# groups: the empties the game looks for by name
# ---------------------------------------------------------------------------------------------
_groups = {}


def group(name):
    g = _groups.get(name)
    if g is None:
        g = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(g)
        _groups[name] = g
    return g


def pivot(name, parent, x, z, y):
    """An empty at a joint (game point). Parts built under it turn about it."""
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    e.location = B(x, z, y)
    if parent:
        par = _groups[parent]
        e.parent = par
        bpy.context.view_layer.update()
        e.matrix_parent_inverse = par.matrix_world.inverted()
    _groups[name] = e
    bpy.context.view_layer.update()
    return e


def B(x, z, y):
    """A game point as a Blender vector (with the building's east shift)."""
    return Vector((x + OX, -z, y))


def Bd(x, z, y):
    """A game direction (no shift)."""
    return Vector((x, -z, y))


# ---------------------------------------------------------------------------------------------
# the mesh builder
# ---------------------------------------------------------------------------------------------
class MB:
    """One Blender object, built from many primitives. `ink=True` gives it a drawn outline in game."""

    def __init__(self, name, grp, ink=False, vcol=True):
        self.name = ('o_' if ink else '') + name
        self.grp = grp
        self.bm = bmesh.new()
        # per-corner color, multiplied with the material's: for things that vary (planks, stones, leaves).
        # Left off where a boolean will cut the mesh, since a cut's new faces would come out black.
        self.col = self.bm.loops.layers.float_color.new('Col') if vcol else None
        self.keys = []

    def _mi(self, key):
        if key not in self.keys:
            self.keys.append(key)
        return self.keys.index(key)

    def _paint(self, geom, key, color=None, smooth=False, xform=None):
        verts = [g for g in geom if isinstance(g, bmesh.types.BMVert)]
        if xform is not None:
            bmesh.ops.transform(self.bm, matrix=xform, verts=verts)
        faces = {f for v in verts for f in v.link_faces}
        mi = self._mi(key)
        c = color if color is not None else (1.0, 1.0, 1.0, 1.0)
        for f in faces:
            f.material_index = mi
            f.smooth = smooth
            if self.col is not None:
                for l in f.loops:
                    l[self.col] = c
        return faces

    def tint(self, hexcol, k=1.0):
        """A per-vertex color multiplier (the material color is the base)."""
        r, g, b = rgb(hexcol)
        return (_lin(r) * k, _lin(g) * k, _lin(b) * k, 1.0)

    # --- boxes --------------------------------------------------------------------------
    def box(self, x0, x1, z0, z1, y0, y1, key, color=None):
        """An axis-aligned box from its game-coordinate extents."""
        cx, cz, cy = (x0 + x1) / 2, (z0 + z1) / 2, (y0 + y1) / 2
        sx, sz, sy = abs(x1 - x0), abs(z1 - z0), abs(y1 - y0)
        res = bmesh.ops.create_cube(self.bm, size=1.0)
        m = Matrix.Translation(B(cx, cz, cy)) @ Matrix.Diagonal((sx, sz, sy, 1.0))
        return self._paint(res['verts'], key, color, False, m)

    def xbox(self, cx, cz, cy, sx, sz, sy, key, rot=0.0, color=None):
        """A box by center and size, turned `rot` degrees about the vertical (counterclockwise from above)."""
        res = bmesh.ops.create_cube(self.bm, size=1.0)
        m = (Matrix.Translation(B(cx, cz, cy)) @ Matrix.Rotation(math.radians(rot), 4, 'Z')
             @ Matrix.Diagonal((sx, sz, sy, 1.0)))
        return self._paint(res['verts'], key, color, False, m)

    def beam(self, p0, p1, w, h, key, color=None):
        """A square-ended timber from game point p0 to p1, w wide and h deep."""
        a, b = B(*p0), B(*p1)
        d = b - a
        length = d.length
        q = d.to_track_quat('X', 'Z')
        res = bmesh.ops.create_cube(self.bm, size=1.0)
        m = (Matrix.Translation((a + b) / 2) @ q.to_matrix().to_4x4()
             @ Matrix.Diagonal((length, w, h, 1.0)))
        return self._paint(res['verts'], key, color, False, m)

    # --- extruded outlines --------------------------------------------------------------
    def prism(self, pts, vec, key, color=None, smooth=False):
        """A flat polygon (game points, in order) pushed along `vec` (a game direction)."""
        vs = [self.bm.verts.new(B(*p)) for p in pts]
        f = self.bm.faces.new(vs)
        ext = bmesh.ops.extrude_face_region(self.bm, geom=[f])
        verts = [g for g in ext['geom'] if isinstance(g, bmesh.types.BMVert)]
        bmesh.ops.translate(self.bm, verts=verts, vec=Bd(*vec))
        # the extrusion keeps the original face as the base: make every face of the solid point outward
        allv = set(verts) | set(vs)
        faces = list({fc for v in allv for fc in v.link_faces})
        bmesh.ops.recalc_face_normals(self.bm, faces=faces)
        return self._paint(list(allv), key, color, smooth)

    def quad(self, p0, p1, p2, p3, key, color=None):
        """One flat quad from four game points."""
        vs = [self.bm.verts.new(B(*p)) for p in (p0, p1, p2, p3)]
        f = self.bm.faces.new(vs)
        return self._paint(vs, key, color, False)

    # --- rounds -------------------------------------------------------------------------
    def blob(self, cx, cz, cy, rx, rz, ry, key, color=None, sub=2, jitter=0.0, seed=0, smooth=True):
        """A lumpy ellipsoid: a stone, a bush, a puff of foliage."""
        res = bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=1.0)
        verts = res['verts']
        if jitter:
            rnd = random.Random(seed)
            for v in verts:
                k = 1.0 + (rnd.random() - 0.5) * 2 * jitter
                v.co *= k
        m = Matrix.Translation(B(cx, cz, cy)) @ Matrix.Diagonal((rx, rz, ry, 1.0))
        return self._paint(verts, key, color, smooth, m)

    def cyl(self, cx, cz, cy, r, length, key, axis='y', color=None, seg=10, r2=None, smooth=True):
        """A cylinder (or a cone, with r2) centered at a game point, its length along `axis`."""
        res = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=seg,
                                    radius1=r, radius2=(r if r2 is None else r2), depth=length)
        m = Matrix.Translation(B(cx, cz, cy))
        if axis == 'x':
            m = m @ Matrix.Rotation(math.radians(90), 4, 'Y')
        elif axis == 'z':  # game z is Blender -y
            m = m @ Matrix.Rotation(math.radians(90), 4, 'X')
        # axis 'y' (up) is the cone's own axis
        return self._paint(res['verts'], key, color, smooth, m)

    def cyl_between(self, p0, p1, r, key, color=None, seg=8):
        a, b = B(*p0), B(*p1)
        d = b - a
        q = d.to_track_quat('Z', 'Y')
        res = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=seg,
                                    radius1=r, radius2=r, depth=d.length)
        m = Matrix.Translation((a + b) / 2) @ q.to_matrix().to_4x4()
        return self._paint(res['verts'], key, color, True, m)

    def cone_between(self, p0, p1, r0, r1, key, color=None, seg=10, flat=1.0, smooth=True):
        """A cone from p0 (radius r0) to p1 (radius r1); `flat` squashes it across one axis (an ear)."""
        a, b = B(*p0), B(*p1)
        d = b - a
        q = d.to_track_quat('Z', 'Y')
        res = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=seg,
                                    radius1=r0, radius2=r1, depth=d.length)
        m = Matrix.Translation((a + b) / 2) @ q.to_matrix().to_4x4() @ Matrix.Diagonal((1.0, flat, 1.0, 1.0))
        return self._paint(res['verts'], key, color, smooth, m)

    # --- done ---------------------------------------------------------------------------
    def finish(self):
        if not self.bm.verts:
            self.bm.free()
            return None
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-5)
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        for k in self.keys:
            mesh.materials.append(material(k))
        # the glTF exporter writes the *active* color attribute; a mesh made in bmesh has none until we say so
        ca = mesh.color_attributes.get('Col')
        if ca is not None:
            mesh.color_attributes.active_color = ca
            mesh.color_attributes.render_color_index = list(mesh.color_attributes).index(ca)
        mesh.update()
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        parent = group(self.grp)
        obj.parent = parent
        obj.matrix_parent_inverse = parent.matrix_world.inverted()   # stays where it was built
        return obj


# ---------------------------------------------------------------------------------------------
# the game's side of the plan: collision boxes and where things start
# ---------------------------------------------------------------------------------------------
LAYOUT = {'pieces': [], 'spawns': [], 'dogStart': None, 'turkeyStart': None, 'bounds': None}


def piece(kind, name, x, z, w, d, h, rot=0):
    """A collision box, in building coordinates (the east shift is applied here)."""
    p = {'kind': kind, 'name': name, 'x': round(x + OX, 3), 'z': round(z, 3),
         'w': round(w, 3), 'd': round(d, 3), 'h': round(h, 3)}
    if rot:
        p['rot'] = rot
    LAYOUT['pieces'].append(p)


def wall_piece(name, x0, x1, z0, z1, h=1.2):
    piece('wall', name, (x0 + x1) / 2, (z0 + z1) / 2, abs(x1 - x0), abs(z1 - z0), h)


def write_layout(path):
    with open(path, 'w') as f:
        json.dump(LAYOUT, f, indent=1)
        f.write('\n')


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)
