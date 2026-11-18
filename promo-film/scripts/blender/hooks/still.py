# Renders one frame of the reveal as a still: SCENE_HOOK=hooks/still.py STILL_FRAME=28 STILL_OUT=clock.png
import bpy, os
sc = bpy.context.scene
f = int(os.environ["STILL_FRAME"])
sc.frame_set(f)
sc.render.filepath = os.environ["STILL_OUT"]
bpy.ops.render.render(write_still=True)
