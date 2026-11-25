# Formats and support

mc-3dm-import reads Rhino 3DM with rhino3dm.

## What is read

- Meshes, with normals, texture coordinates and vertex colours.
- Breps (surfaces and polysurfaces) and extrusions by the render meshes saved in the file.
- SubDs, subdivided from their control nets.
- Curves, points and point clouds.
- Block instances, placed by their transforms, nested.
- Point, directional and spot lights.
- Layers (with their visibility), object colours, and materials: colours, transparency, shine, physically based settings and embedded textures.
- The model's unit system, scaled to metres.

## Orientation and units

Rhino models are Z up; the group turns them Y up and scales them to metres.

## Limits

Breps and extrusions saved without render meshes ("Save small") are not drawn, with a warning; Rhino adds them when it saves normally. Text, dimensions, hatches and other annotations are not drawn.
