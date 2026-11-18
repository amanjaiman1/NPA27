"""Scene 01, "The Challenge": a study desk at night, built and rendered in Blender.

    blender -b -P desk.py -- --shot reveal --out <dir> [--res 2560x1440] [--samples 64] [--frames 1-120]
    blender -b -P desk.py -- --shot notebook --out <file.png> [--res 6400x2400] [--samples 160]

Two shots:
  notebook  a single wide still of the open notebook, very shallow focus; the
            edit glides across it (a lateral move over a flat page needs no
            more than one frame).
  reveal    120 frames: close on the ticking clock, then the camera pulls back
            and rises to show the whole desk (books, loose notes, a timetable,
            a laptop full of scattered tools) while the lamp dims to darkness.

Everything is procedural apart from the textures from textures.py.
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
opt = {"--shot": "reveal", "--out": "/tmp/desk", "--res": "2560x1440", "--samples": "64", "--frames": "1-120"}
for i in range(0, len(argv) - 1, 2):
    opt[argv[i]] = argv[i + 1]
SHOT = opt["--shot"]
RX, RY = (int(v) for v in opt["--res"].split("x"))
F0, F1 = (int(v) for v in opt["--frames"].split("-"))
HERE = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.abspath(os.path.join(HERE, "..", "..", "public", "renders", "tex"))

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30
scene.frame_start, scene.frame_end = 1, 132


# ── materials ────────────────────────────────────────────────────

def principled(name, color=(0.8, 0.8, 0.8), rough=0.5, metal=0.0, spec=0.5, coat=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Specular IOR Level"].default_value = spec
    if coat:
        b.inputs["Coat Weight"].default_value = coat
        b.inputs["Coat Roughness"].default_value = 0.08
    return m


def textured(name, image, rough=0.75, emission=0.0, mapping_scale=None, sheen=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(os.path.join(TEX, image))
    tex.interpolation = "Linear"
    nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough
    b.inputs["Specular IOR Level"].default_value = 0.35
    if sheen:
        b.inputs["Sheen Weight"].default_value = sheen
    if emission:
        nt.links.new(tex.outputs["Color"], b.inputs["Emission Color"])
        b.inputs["Emission Strength"].default_value = emission
        b.inputs["Base Color"].default_value = (0, 0, 0, 1)
        nt.links.remove(b.inputs["Base Color"].links[0])
    return m


def wood():
    m = bpy.data.materials.new("walnut")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1.0, 9.0, 1.0)
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 3.0
    noise.inputs["Detail"].default_value = 8
    noise.inputs["Distortion"].default_value = 1.4
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.inputs["Scale"].default_value = 2.2
    wave.inputs["Distortion"].default_value = 6.0
    wave.inputs["Detail"].default_value = 3
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "FLOAT"
    mix.inputs["Factor"].default_value = 0.55
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.25
    ramp.color_ramp.elements[0].color = (0.035, 0.018, 0.009, 1)
    ramp.color_ramp.elements[1].position = 0.85
    ramp.color_ramp.elements[1].color = (0.16, 0.085, 0.04, 1)
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.06
    nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], noise.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], wave.inputs["Vector"])
    nt.links.new(noise.outputs["Fac"], mix.inputs["A"])
    nt.links.new(wave.outputs["Fac"], mix.inputs["B"])
    nt.links.new(mix.outputs["Result"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(mix.outputs["Result"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    b.inputs["Roughness"].default_value = 0.38
    b.inputs["Coat Weight"].default_value = 0.25
    b.inputs["Coat Roughness"].default_value = 0.15
    return m


def emission_mat(name, color, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.remove(nt.nodes["Principled BSDF"])
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = (*color, 1)
    e.inputs["Strength"].default_value = strength
    nt.links.new(e.outputs[0], nt.nodes["Material Output"].inputs[0])
    return m


# ── geometry helpers ─────────────────────────────────────────────

def link(obj):
    bpy.context.collection.objects.link(obj)
    return obj


def box(name, size, loc, rot=(0, 0, 0), mat=None, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = o.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 3
    if mat:
        o.data.materials.append(mat)
    return o


def sheet(name, w, h, loc, rot_z=0.0, mat=None, curl=0.0, segments=(24, 24), lift=0.0005):
    """A paper sheet: a subdivided plane with an optional gentle curl."""
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=segments[0], y_subdivisions=segments[1], size=1, location=(0, 0, 0))
    o = bpy.context.object
    o.name = name
    for v in o.data.vertices:
        x, y = v.co.x * w, v.co.y * h
        z = curl * (abs(v.co.x) * 2) ** 2.2
        v.co = Vector((x, y, z))
    o.location = (loc[0], loc[1], loc[2] + lift)
    o.rotation_euler = (0, 0, rot_z)
    bpy.ops.object.shade_smooth()
    if mat:
        o.data.materials.append(mat)
    return o


def cylinder(name, r, depth, loc, rot=(0, 0, 0), mat=None, verts=64):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, vertices=verts, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    bpy.ops.object.shade_smooth()
    if mat:
        o.data.materials.append(mat)
    return o


# ── the desk ────────────────────────────────────────────────────

def walnut():
    m = textured("walnut", "walnut.png", rough=0.42)
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Coat Weight"].default_value = 0.2
    b.inputs["Coat Roughness"].default_value = 0.18
    return m


desk = box("desk", (2.4, 1.3, 0.05), (0, 0.15, -0.025), mat=walnut(), bevel=0.004)
# Box UVs: map the top face to the walnut image across its full size.
uv = desk.data.uv_layers.active.data
for poly in desk.data.polygons:
    for li in poly.loop_indices:
        co = desk.data.vertices[desk.data.loops[li].vertex_index].co
        uv[li].uv = (co.x / 2.4 + 0.5, co.y / 1.3 + 0.5)

paper_edge = principled("page-edge", (0.78, 0.74, 0.66), rough=0.85)
cover_navy = principled("cover", (0.03, 0.05, 0.11), rough=0.55)

# The open notebook: two curled pages over a cover.
NB = (-0.08, 0.02, 0.0)
NB_ROT = math.radians(-5)
nb_cover = box("nb-cover", (0.452, 0.312, 0.003), (NB[0], NB[1], 0.0015), (0, 0, NB_ROT), cover_navy, bevel=0.0015)
nb_block = box("nb-block", (0.436, 0.298, 0.006), (NB[0], NB[1], 0.006), (0, 0, NB_ROT), paper_edge)
nb_pages = sheet("nb-pages", 0.44, 0.3, (NB[0], NB[1], 0.0102), NB_ROT, textured("notebook", "notebook.png", rough=0.82, sheen=0.15), curl=0.0, segments=(60, 20))
# Pages rise towards the gutter and fall at the outer edges.
for v in nb_pages.data.vertices:
    u = v.co.x / 0.44  # -0.5 .. 0.5
    # Rises into the gutter, lifts a little at the outer edges, never below the block (top at 0.009).
    v.co.z = 0.0072 * math.exp(-((u / 0.12) ** 2)) + 0.0016 * (abs(u) * 2) ** 2
nb_pages.data.uv_layers.active.name = "UVMap"

# The printed timetable, half under the notebook, and loose notes.
tt = sheet("timetable", 0.21, 0.297, (0.33, -0.07, 0.0), math.radians(17), textured("timetable", "timetable.png", rough=0.8), curl=0.004)
loose = sheet("loose", 0.21, 0.297, (-0.48, -0.1, 0.0), math.radians(-24), textured("loose", "pyq.png", rough=0.8), curl=0.003, lift=0.0002)
loose2 = sheet("loose2", 0.21, 0.297, (0.62, -0.02, 0.0), math.radians(-33), textured("loose2", "notes.png", rough=0.8), curl=0.003, lift=0.0001)
for name, img, loc, rz in [
    ("sticky1", "sticky_yellow.png", (0.12, -0.17, 0.0), 9),
    ("sticky2", "sticky_pink.png", (-0.36, 0.19, 0.0), -14),
    ("sticky3", "sticky_mint.png", (0.43, 0.06, 0.0), 22),
    ("sticky4", "sticky_yellow.png", (-0.27, -0.2, 0.0), -31),
    ("sticky5", "sticky_pink.png", (0.05, 0.2, 0.0), 41),
]:
    sheet(name, 0.076, 0.076, loc, math.radians(rz), textured(name, img, rough=0.7), curl=0.002, segments=(8, 8), lift=0.0012)

# A stack of books, spines to the camera.
stack_x, stack_y = 0.47, 0.33
z = 0.0
for i, (w, d, h, rz) in enumerate([(0.25, 0.18, 0.045, 3), (0.24, 0.17, 0.035, -4), (0.235, 0.165, 0.04, 6), (0.22, 0.155, 0.03, -2), (0.215, 0.15, 0.038, 9)]):
    spine = textured(f"spine{i}", f"spine{i}.png", rough=0.6)
    coverm = principled(f"book{i}", [(0.03, 0.06, 0.16), (0.2, 0.03, 0.04), (0.02, 0.12, 0.1), (0.36, 0.22, 0.05), (0.05, 0.16, 0.06)][i], rough=0.55)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(stack_x, stack_y, z + h / 2), rotation=(0, 0, math.radians(rz)))
    b = bpy.context.object
    b.name = f"book{i}"
    b.scale = (w, d, h)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    b.data.materials.append(coverm)
    b.data.materials.append(paper_edge)
    for poly in b.data.polygons:
        poly.material_index = 0 if abs(poly.normal.z) > 0.9 or poly.normal.y < -0.9 else 1
    bpy.ops.mesh.primitive_plane_add(size=1)
    sp = bpy.context.object
    sp.name = f"spine{i}"
    sp.scale = (w * 0.985, h * 0.9, 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    sp.data.materials.append(spine)
    sp.parent = b
    sp.location = (0, -d / 2 - 0.0004, 0)
    sp.rotation_euler = (math.radians(90), 0, 0)
    mod = b.modifiers.new("bevel", "BEVEL")
    mod.width = 0.0025
    mod.segments = 2
    z += h + 0.0008

# A desk clock, facing the camera, built in its own frame so the parts line up.
CLK = Vector((0.25, 0.12, 0.0))
CLK_ROT = math.radians(-14)
clock = bpy.data.objects.new("clock", None)
link(clock)
clock.location = (CLK.x, CLK.y, 0.072)
clock.rotation_euler = (0, 0, CLK_ROT)
clock_body = principled("clock-body", (0.012, 0.014, 0.018), rough=0.28, metal=0.7, coat=0.5)
bezel_mat = principled("clock-bezel", (0.62, 0.6, 0.56), rough=0.18, metal=1.0)


def clock_part(obj, loc=(0, 0, 0)):
    obj.parent = clock
    obj.location = loc
    return obj


body = clock_part(cylinder("clock-body", 0.064, 0.036, (0, 0, 0), (math.radians(90), 0, 0), clock_body, 96))
bpy.ops.mesh.primitive_torus_add(major_radius=0.0625, minor_radius=0.0042, major_segments=96, minor_segments=16, rotation=(math.radians(90), 0, 0))
ring = bpy.context.object
ring.data.materials.append(bezel_mat)
bpy.ops.object.shade_smooth()
clock_part(ring, (0, -0.018, 0))
face_mat = textured("clock-face", "clock.png", rough=0.5)
fb = face_mat.node_tree.nodes["Principled BSDF"]
fb.inputs["Coat Weight"].default_value = 1.0
fb.inputs["Coat Roughness"].default_value = 0.04
face = cylinder("clock-face", 0.058, 0.001, (0, 0, 0), (math.radians(90), 0, 0), face_mat, 96)
uv = face.data.uv_layers.active.data
for poly in face.data.polygons:
    for li in poly.loop_indices:
        co = face.data.vertices[face.data.loops[li].vertex_index].co
        uv[li].uv = (co.x / 0.116 + 0.5, co.y / 0.116 + 0.5)
clock_part(face, (0, -0.0182, 0))
for f in (-1, 1):
    foot = cylinder(f"clock-foot{f}", 0.005, 0.03, (0, 0, 0), (math.radians(90), 0, 0), clock_body, 24)
    clock_part(foot, (f * 0.036, -0.004, -0.062))

# Hands pivot at the centre of the face (local -Y is towards the camera).
pivot = bpy.data.objects.new("hands", None)
link(pivot)
pivot.parent = clock
pivot.location = (0, -0.0196, 0)
pivot.rotation_euler = (math.radians(90), 0, 0)
hand_mat = principled("hands", (0.01, 0.01, 0.012), rough=0.4)
red_mat = principled("second", (0.75, 0.05, 0.03), rough=0.35)


def clock_hand(name, length, width, angle_deg, mat, z):
    bpy.ops.mesh.primitive_cube_add(size=1)
    h = bpy.context.object
    h.name = name
    h.scale = (width, length, 0.0007)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for v in h.data.vertices:
        v.co.y += length / 2 - length * 0.14
    h.data.materials.append(mat)
    h.parent = pivot
    h.location = (0, 0, z)
    h.rotation_euler = (0, 0, math.radians(angle_deg))
    return h


# 11:41 PM. Rotation is counter-clockwise about the local axis facing us, so
# a clockwise hand needs a negative angle seen from the front.
clock_hand("hour", 0.032, 0.0038, -(11 + 41 / 60) * 30, hand_mat, 0.0006)
clock_hand("minute", 0.047, 0.0026, -41 * 6, hand_mat, 0.0012)
sec = clock_hand("secondhand", 0.052, 0.001, 0, red_mat, 0.0018)
cap = cylinder("clock-cap", 0.0028, 0.002, (0, 0, 0), (math.radians(90), 0, 0), red_mat, 24)
clock_part(cap, (0, -0.0222, 0))
for s_ in range(0, 6):  # ticks at frames 1, 31, 61, ...
    for f, k in [(0, 0.0), (2, 1.12), (4, 1.0)]:
        sec.rotation_euler = (0, 0, -math.radians((18 + s_ + k) * 6))
        sec.keyframe_insert("rotation_euler", frame=1 + s_ * 30 + f)
        if f == 4:
            sec.keyframe_insert("rotation_euler", frame=1 + s_ * 30 + 29)

# The laptop, half-open towards the camera, its screen a mess of tools.
LP = Vector((-0.06, 0.42, 0.0))
alu = principled("aluminium", (0.32, 0.33, 0.35), rough=0.32, metal=1.0)
lap_base = box("laptop-base", (0.32, 0.22, 0.012), (LP.x, LP.y, 0.006), (0, 0, math.radians(4)), alu, bevel=0.003)
lid = bpy.data.objects.new("lid", None)
link(lid)
lid.location = (LP.x, LP.y + 0.11, 0.012)
lid.rotation_euler = (math.radians(-12), 0, math.radians(4))
lid_shell = box("lid-shell", (0.32, 0.006, 0.215), (0, 0, 0.1075), mat=alu, bevel=0.003)
lid_shell.parent = lid
bezel = box("bezel", (0.312, 0.001, 0.207), (0, -0.0032, 0.1075), mat=principled("bezel", (0.01, 0.01, 0.012), rough=0.2))
bezel.parent = lid
bpy.ops.mesh.primitive_plane_add(size=1)
scr = bpy.context.object
scr.name = "screen"
scr.scale = (0.296, 0.185, 1)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
scr.rotation_euler = (math.radians(90), 0, 0)
scr.location = (0, -0.0039, 0.112)
scr.data.materials.append(textured("screen", "laptop.png", emission=0.85))
scr.parent = lid
lid.rotation_euler = (math.radians(-14), 0, math.radians(4))
# A keyboard suggestion: a dark inset on the base.
box("keys", (0.27, 0.11, 0.0008), (LP.x, LP.y + 0.01, 0.0122), (0, 0, math.radians(4)), principled("keys", (0.02, 0.02, 0.022), rough=0.6))

# A mug of coffee and a few pens.
ceramic = principled("ceramic", (0.82, 0.8, 0.76), rough=0.12, coat=0.4)
cylinder("mug", 0.04, 0.095, (-0.46, 0.2, 0.0475), mat=ceramic)
cylinder("coffee", 0.036, 0.002, (-0.46, 0.2, 0.084), mat=principled("coffee", (0.03, 0.012, 0.005), rough=0.08))
bpy.ops.mesh.primitive_torus_add(major_radius=0.026, minor_radius=0.007, location=(-0.505, 0.2, 0.05), rotation=(math.radians(90), 0, 0))
handle = bpy.context.object
handle.data.materials.append(ceramic)
for name, loc, rz, col in [
    ("pen", (0.2, -0.12, 0.0045), 62, (0.02, 0.05, 0.25)),
    ("highlighter", (-0.32, -0.16, 0.009), -60, (0.95, 0.85, 0.1)),
    ("pencil", (0.2, 0.21, 0.004), 80, (0.85, 0.55, 0.1)),
]:
    cylinder(name, 0.0045 if name != "highlighter" else 0.008, 0.145, loc, (math.radians(90), 0, math.radians(rz)), principled(name, col, rough=0.35, coat=0.5), 24)

# A wall far behind, to catch the moonlight.
box("wall", (4, 0.05, 2.5), (0, 1.25, 1.0), mat=principled("wall", (0.05, 0.055, 0.07), rough=0.9))

# ── light ───────────────────────────────────────────────────────

world = bpy.data.worlds.new("night")
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.0015, 0.0024, 0.0055, 1)

bpy.ops.object.light_add(type="SPOT", location=(-0.55, -0.12, 0.62))
lamp = bpy.context.object
lamp.name = "lamp"
lamp.data.energy = 9
lamp.data.color = (1.0, 0.68, 0.38)
lamp.data.spot_size = math.radians(78)
lamp.data.spot_blend = 0.75
lamp.data.shadow_soft_size = 0.09
target = Vector((0.0, 0.08, 0.0))
lamp.rotation_euler = (target - lamp.location).to_track_quat("-Z", "Y").to_euler()

bpy.ops.object.light_add(type="AREA", location=(1.1, 0.9, 0.9))
moon = bpy.context.object
moon.name = "moon"
moon.data.energy = 60
moon.data.size = 1.2
moon.data.color = (0.42, 0.58, 1.0)
moon.rotation_euler = (Vector((0.1, 0.1, 0.05)) - moon.location).to_track_quat("-Z", "Y").to_euler()

bpy.ops.object.light_add(type="AREA", location=(-0.06, 0.3, 0.16))
glow = bpy.context.object
glow.name = "screen-glow"
glow.data.energy = 2.2
glow.data.size = 0.3
glow.data.color = (0.6, 0.72, 1.0)
glow.rotation_euler = (math.radians(-70), 0, 0)

# ── camera ─────────────────────────────────────────────────────

cam_data = bpy.data.cameras.new("cam")
cam = bpy.data.objects.new("cam", cam_data)
link(cam)
scene.camera = cam
cam_data.dof.use_dof = True
aim = bpy.data.objects.new("aim", None)
link(aim)
track = cam.constraints.new("TRACK_TO")
track.target = aim
track.track_axis = "TRACK_NEGATIVE_Z"
track.up_axis = "UP_Y"


def key(obj, frame, **props):
    for k, v in props.items():
        setattr(obj, k, v)
        obj.keyframe_insert(k, frame=frame)


if SHOT == "notebook":
    # Over the left page at a low angle, focus across the middle of the task list.
    cam_data.lens = 58
    cam_data.sensor_width = 36
    cam_data.dof.aperture_fstop = 2.0
    cam.location = (-0.045, -0.33, 0.17)
    aim.location = (-0.2, 0.012, 0.012)
    cam_data.dof.focus_object = None
    cam_data.dof.focus_distance = (Vector(aim.location) - Vector(cam.location)).length
    lamp.data.energy = 5.5
    glow.data.energy = 1.2
else:
    # Close on the clock, then back and up over the whole desk.
    cam_data.lens = 45
    rot = Matrix.Rotation(CLK_ROT, 4, "Z")
    clock_center = Vector(clock.location) + rot @ Vector((0, -0.0196, 0))
    start = clock_center + rot @ Vector((0.045, -0.235, 0.018))
    hold = clock_center + rot @ Vector((0.04, -0.215, 0.017))
    key(cam, 1, location=start)
    key(cam, 26, location=hold)
    key(aim, 1, location=clock_center + Vector((0.0, 0.0, -0.002)))
    key(aim, 26, location=clock_center + Vector((0.0, 0.0, -0.002)))
    end_cam = Vector((0.06, -1.02, 0.56))
    key(cam, 124, location=end_cam)
    key(aim, 124, location=Vector((0.05, 0.17, 0.04)))
    # Focus: held on the clock, then racking out to the desk.
    d0 = (clock_center - hold).length
    cam_data.dof.focus_distance = (clock_center - start).length
    cam_data.dof.keyframe_insert("focus_distance", frame=1)
    cam_data.dof.focus_distance = d0
    cam_data.dof.keyframe_insert("focus_distance", frame=30)
    cam_data.dof.focus_distance = (Vector((0.0, 0.05, 0.0)) - end_cam).length
    cam_data.dof.keyframe_insert("focus_distance", frame=118)
    cam_data.dof.aperture_fstop = 2.0
    cam_data.dof.keyframe_insert("aperture_fstop", frame=30)
    cam_data.dof.aperture_fstop = 3.5
    cam_data.dof.keyframe_insert("aperture_fstop", frame=118)
    # The lamp goes out at the end; the laptop's glow is the last light.
    for f, e in [(1, 9), (112, 9), (122, 2.0), (129, 0.0)]:
        lamp.data.energy = e
        lamp.data.keyframe_insert("energy", frame=f)
    emit = scr.data.materials[0].node_tree.nodes["Principled BSDF"].inputs["Emission Strength"]
    for f, e in [(1, 0.85), (124, 0.85), (131, 0.0)]:
        emit.default_value = e
        emit.keyframe_insert("default_value", frame=f)
    for f, e in [(1, 2.2), (124, 2.2), (131, 0.0)]:
        glow.data.energy = e
        glow.data.keyframe_insert("energy", frame=f)
    for f, e in [(1, 60), (114, 60), (130, 6)]:
        moon.data.energy = e
        moon.data.keyframe_insert("energy", frame=f)

# Smooth, slightly slow-in-slow-out motion everywhere.
for ob in (cam, aim, cam_data, lamp.data, moon.data):
    ad = getattr(ob, "animation_data", None)
    if ad and ad.action:
        fcs = getattr(ad.action, "fcurves", None)
        if fcs is None:
            continue
        for fc in fcs:
            for kp in fc.keyframe_points:
                kp.interpolation = "BEZIER"
                kp.easing = "AUTO"

# ── render ─────────────────────────────────────────────────────

r = scene.render
r.engine = "CYCLES"
r.resolution_x, r.resolution_y = RX, RY
r.resolution_percentage = 100
r.film_transparent = False
r.image_settings.file_format = "PNG"
r.image_settings.color_depth = "16"
c = scene.cycles
c.device = "CPU"
c.samples = int(opt["--samples"])
c.adaptive_threshold = 0.04
c.adaptive_min_samples = 8
c.use_denoising = True
c.denoiser = "OPENIMAGEDENOISE"
c.denoising_prefilter = "FAST"
try:
    c.denoising_quality = "BALANCED"
except Exception:
    pass
c.max_bounces = 4
c.diffuse_bounces = 2
c.glossy_bounces = 2
c.transmission_bounces = 2
c.transparent_max_bounces = 4
c.blur_glossy = 1.0
c.sample_clamp_indirect = 4.0
c.caustics_reflective = False
c.caustics_refractive = False
c.use_light_tree = True
r.use_persistent_data = True
scene.view_settings.view_transform = "AgX"
for look in ("AgX - Medium High Contrast", "Medium High Contrast"):
    try:
        scene.view_settings.look = look
        break
    except TypeError:
        pass
scene.view_settings.exposure = 0.35

if os.environ.get("SCENE_HOOK"):
    # A Python file run against the finished scene instead of the default render (used for the stills).
    exec(open(os.environ["SCENE_HOOK"]).read())
elif SHOT == "notebook":
    r.filepath = opt["--out"]
    bpy.ops.render.render(write_still=True)
else:
    os.makedirs(opt["--out"], exist_ok=True)
    r.filepath = os.path.join(opt["--out"], "####")
    scene.frame_start, scene.frame_end = F0, F1
    bpy.ops.render.render(animation=True)
