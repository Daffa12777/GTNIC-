"""Create the illustrative hydraulic power unit asset with Blender.

Run: blender --background --python scripts/build_hydraulic_model.py
"""
import bpy
import math
from pathlib import Path

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color, metallic=0.0, roughness=0.5):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.metallic = metallic
    mat.roughness = roughness
    return mat

blue = material('Painted steel blue', (0.08, 0.22, 0.32), 0.35, 0.38)
body = material('Reservoir blue', (0.15, 0.34, 0.42), 0.25, 0.48)
steel = material('Steel', (0.48, 0.56, 0.57), 0.75, 0.28)
dark = material('Dark steel', (0.045, 0.065, 0.07), 0.4, 0.42)
rubber = material('Rubber hose', (0.045, 0.055, 0.05), 0.0, 0.86)
light = material('Gauge face', (0.84, 0.9, 0.88))
yellow = material('Safety yellow', (0.93, 0.64, 0.08))
red = material('Valve handle', (0.73, 0.12, 0.09))

def box(name, location, dimensions, mat, bevel=0.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new('Rounded steel edges', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 2
        obj.modifiers.new('Surface normals', 'WEIGHTED_NORMAL')
    obj.data.materials.append(mat)
    return obj

def cylinder(name, location, radius, depth, mat, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new('Edge chamfer', 'BEVEL')
    bevel.width = min(radius / 5, 0.015)
    bevel.segments = 2
    obj.modifiers.new('Surface normals', 'WEIGHTED_NORMAL')
    return obj

def pipe(name, points, radius, mat):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 2
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    spline = curve.splines.new('POLY')
    spline.points.add(len(points) - 1)
    for point, coords in zip(spline.points, points):
        point.co = (*coords, 1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj

# Skid and reservoir.
box('Base frame', (0, 0, 0.13), (2.0, 1.25, 0.18), blue)
box('Reservoir', (-0.22, 0, 0.49), (1.38, 1.0, 0.62), body, 0.05)
box('Reservoir cover', (-0.22, 0, 0.82), (1.43, 1.04, 0.08), blue)
box('Oil level sight glass', (-0.9, -0.506, 0.48), (0.12, 0.025, 0.35), steel)
box('Oil level', (-0.9, -0.524, 0.46), (0.055, 0.01, 0.23), yellow, 0.005)
for x in (-0.95, 0.15):
    for y in (-0.48, 0.48):
        cylinder('Cover bolt', (x, y, 0.88), 0.035, 0.025, steel)

# Motor, flange, cooling fins and terminal box.
cylinder('Electric motor', (-0.3, 0.0, 1.12), 0.23, 0.70, blue, (0, math.pi / 2, 0))
for x in (-0.58, -0.45, -0.32, -0.19, -0.06):
    cylinder('Motor cooling fin', (x, 0.0, 1.12), 0.245, 0.025, steel, (0, math.pi / 2, 0))
cylinder('Motor end cap', (-0.69, 0, 1.12), 0.2, 0.08, dark, (0, math.pi / 2, 0))
cylinder('Pump coupling', (0.12, 0, 1.12), 0.16, 0.18, steel, (0, math.pi / 2, 0))
box('Motor terminal box', (-0.32, 0, 1.4), (0.30, 0.27, 0.17), blue)

# Valve manifold, fittings, gauges and hoses.
box('Valve manifold', (0.48, 0.0, 1.02), (0.52, 0.74, 0.31), steel)
for y in (-0.23, 0, 0.23):
    cylinder('Solenoid valve', (0.48, y, 1.28), 0.075, 0.28, dark)
    cylinder('Valve cap', (0.48, y, 1.44), 0.08, 0.04, blue)
    pipe('Hydraulic hose', [(0.7, y, 1.04), (0.86, y, 1.04), (0.86, y, 0.72), (0.55, y, 0.72)], 0.035, rubber)
cylinder('Gauge stem', (0.7, -0.25, 1.42), 0.025, 0.3, steel)
cylinder('Pressure gauge bezel', (0.7, -0.25, 1.61), 0.14, 0.055, dark, (math.pi / 2, 0, 0))
cylinder('Pressure gauge face', (0.7, -0.282, 1.61), 0.115, 0.01, light, (math.pi / 2, 0, 0))
pipe('Gauge needle', [(0.7, -0.291, 1.61), (0.76, -0.291, 1.67)], 0.008, red)
cylinder('Oil filler cap', (-0.75, 0.32, 0.94), 0.1, 0.14, yellow)
box('Control cabinet', (0.74, 0.47, 0.93), (0.33, 0.18, 0.58), light)
box('Control panel', (0.74, 0.365, 0.98), (0.25, 0.02, 0.3), blue)
for z, mat in ((1.08, red), (0.98, yellow), (0.88, dark)):
    cylinder('Control button', (0.74, 0.345, z), 0.035, 0.03, mat, (math.pi / 2, 0, 0))

# Bake contact occlusion into vertex colors after applying the edge modifiers.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.convert(target='MESH')
bpy.context.view_layer.objects.active = bpy.context.selected_objects[0]
bpy.ops.object.join()
asset = bpy.context.object
asset.name = 'Hydraulic power unit'
asset.data.color_attributes.new(name='BakedAO', type='BYTE_COLOR', domain='CORNER')
asset.data.color_attributes.active_color = asset.data.color_attributes['BakedAO']
bpy.context.scene.render.engine = 'CYCLES'
bpy.context.scene.cycles.samples = 24
bpy.context.scene.render.bake.target = 'VERTEX_COLORS'
bpy.ops.object.bake(type='AO')

output = Path(__file__).resolve().parents[1] / 'public' / 'models' / 'hydraulic-unit.glb'
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', export_apply=True, export_vertex_color='ACTIVE')
print(f'Exported {output}')
