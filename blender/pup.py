"""
The pups: the characters you play. Original cartoon heeler-style pups: a big round head, upright ears with
folded tips, a muzzle, big dark eyes, a jumper in the player's color, a long tail. They are made of rigid
parts on pivots (hips, head, ears, arms, legs, tail), so the game can animate them in code.

Built facing +z (the way the game's figures face), feet on y = 0, about 1.3 m to the top of the head.
The materials are named for what they are (coat, point, muzzle, ear, jumper...), and the game repaints them
per player, so there is one model and many pups.

    blender -b --factory-startup --python-exit-code 1 --python blender/pup.py -- [--glb PATH] [--preview DIR]
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402

import lib  # noqa: E402
from lib import MB, B, group, pivot  # noqa: E402

lib.OX = 0.0  # the pup lives at its own origin
ROOT = os.path.dirname(HERE)
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


GLB = arg('--glb', os.path.join(ROOT, 'public', 'models', 'pup.glb'))
PREVIEW = arg('--preview')


def part(name, grp, ink=True):
    return MB(name, grp, ink=ink, vcol=False)


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    lib._groups.clear()
    lib._materials.clear()
    root = bpy.data.objects.new('Pup', None)
    bpy.context.scene.collection.objects.link(root)
    lib._groups['Pup'] = root
    hy = 0.46
    pivot('Hips', 'Pup', 0, 0, hy)

    # ---- the torso: a jumper, a stripe across it, a collar ---------------------------------------------
    t = part('o_torso', 'Hips')
    t.blob(0, 0, 0.67, 0.185, 0.16, 0.27, 'jumper', sub=2)
    t.blob(0, 0, 0.60, 0.193, 0.168, 0.03, 'jumper_hem', sub=2)
    t.blob(0, 0.0, 0.925, 0.115, 0.10, 0.04, 'jumper_hem', sub=2)
    t.finish()

    # ---- the head ---------------------------------------------------------------------------------------
    pivot('Head', 'Hips', 0, 0.0, 0.93)
    h = part('o_head', 'Head')
    h.blob(0, 0.01, 1.07, 0.25, 0.22, 0.22, 'coat', sub=3)
    h.blob(0, 0.19, 1.015, 0.11, 0.125, 0.085, 'muzzle', sub=3)
    h.finish()
    f = part('face', 'Head', ink=False)
    f.blob(0, 0.298, 1.045, 0.048, 0.038, 0.036, 'nose', sub=2)
    for s in (-1, 1):
        f.blob(s * 0.1, 0.208, 1.12, 0.043, 0.022, 0.06, 'eye', sub=2)
        f.blob(s * 0.088, 0.226, 1.145, 0.013, 0.01, 0.013, 'eye_hi', sub=1)
        f.blob(s * 0.108, 0.19, 1.212, 0.062, 0.03, 0.028, 'point', sub=2)        # the brow marks
        f.blob(s * 0.17, 0.1, 0.985, 0.07, 0.07, 0.06, 'point', sub=2)            # the cheeks
    f.box(-0.035, 0.035, 0.286, 0.306, 0.958, 0.968, 'nose')                        # a small smile
    f.finish()

    # ---- the ears: upright, broad, flat, a folded tip ------------------------------------------------------
    for name, s in (('EarL', 1), ('EarR', -1)):
        pivot(name, 'Head', s * 0.15, -0.03, 1.23)
        e = part('o_' + name.lower(), name)
        e.cone_between((s * 0.15, -0.03, 1.24), (s * 0.25, -0.05, 1.5), 0.125, 0.04, 'ear', seg=10, flat=0.38)
        e.cone_between((s * 0.25, -0.05, 1.49), (s * 0.35, -0.04, 1.44), 0.058, 0.02, 'ear', seg=8, flat=0.42)
        e.finish()
        ei = part(name.lower() + '_in', name, ink=False)
        ei.cone_between((s * 0.155, 0.0, 1.26), (s * 0.243, -0.02, 1.45), 0.075, 0.022, 'ear_in', seg=8, flat=0.3)
        ei.finish()

    # ---- the arms --------------------------------------------------------------------------------------------------
    for name, s in (('ArmL', 1), ('ArmR', -1)):
        pivot(name, 'Hips', s * 0.215, 0.0, 0.85)
        a = part('o_' + name.lower(), name)
        a.cyl_between((s * 0.215, 0, 0.85), (s * 0.235, 0, 0.67), 0.058, 'jumper', seg=10)
        a.cyl_between((s * 0.235, 0, 0.68), (s * 0.255, 0.02, 0.5), 0.04, 'coat', seg=8)
        a.blob(s * 0.258, 0.03, 0.465, 0.057, 0.062, 0.057, 'point', sub=2)
        a.finish()

    # ---- the legs --------------------------------------------------------------------------------------------------
    for name, s in (('LegL', 1), ('LegR', -1)):
        pivot(name, 'Hips', s * 0.09, 0.0, hy)
        l = part('o_' + name.lower(), name)
        l.cyl_between((s * 0.09, 0, hy), (s * 0.09, 0.0, 0.1), 0.048, 'coat', seg=10)
        l.blob(s * 0.09, 0.05, 0.05, 0.07, 0.115, 0.05, 'foot', sub=2)
        l.finish()

    # ---- the tail: three segments, to wag; out and back, then curling up -------------------------------------
    pivot('Tail1', 'Hips', 0, -0.13, 0.52)
    t1 = part('o_tail1', 'Tail1')
    t1.cone_between((0, -0.13, 0.52), (0, -0.37, 0.5), 0.075, 0.058, 'coat', seg=10)
    t1.finish()
    pivot('Tail2', 'Tail1', 0, -0.37, 0.5)
    t2 = part('o_tail2', 'Tail2')
    t2.cone_between((0, -0.37, 0.5), (0, -0.53, 0.66), 0.058, 0.048, 'coat', seg=10)
    t2.finish()
    pivot('Tail3', 'Tail2', 0, -0.53, 0.66)
    t3 = part('o_tail3', 'Tail3')
    t3.cone_between((0, -0.53, 0.66), (0, -0.55, 0.86), 0.048, 0.04, 'coat', seg=10)
    t3.blob(0, -0.55, 0.9, 0.058, 0.058, 0.075, 'tail_tip', sub=2)
    t3.finish()


def preview():
    """Workbench stills of the pup from the front, three-quarters and the back (a check on the shapes)."""
    from mathutils import Vector
    os.makedirs(PREVIEW, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.render.resolution_x, scene.render.resolution_y = 700, 900
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'MATERIAL'
    scene.display.shading.show_object_outline = True
    cam = bpy.data.objects.new('preview_cam', bpy.data.cameras.new('preview_cam'))
    cam.data.lens = 60
    scene.collection.objects.link(cam)
    scene.camera = cam
    for name, at in (('pup_front', (0.0, -3.2, 0.75)), ('pup_34', (2.0, -2.6, 1.0)), ('pup_back', (-1.5, 2.8, 1.0))):
        cam.location = Vector(at)
        cam.rotation_euler = (Vector((0, 0, 0.7)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(PREVIEW, f'{name}.png')
        bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)


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
    if PREVIEW:
        preview()
    if '--no-export' not in argv:
        export()
