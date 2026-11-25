# mc-3dm-import

A Rhino 3DM importer for [three.js](https://threejs.org/), written in TypeScript. It reads Rhino .3dm files with McNeel's [rhino3dm](https://github.com/mcneel/rhino3dm) (WebAssembly, MIT): meshes, Breps and extrusions by their render meshes, SubDs, curves, points, block instances and lights, grouped by layer, with Rhino's materials, colours and units, in metres and Y up. It was made for [SceneEditor](https://github.com/VJigouline/SceneEditor), and works in any three.js application.

```ts
import { load3dm } from 'mc-3dm-import';

const result = await load3dm(await file.arrayBuffer());
scene.add(result.group);
console.log(result.warnings);       // anything that couldn't be read
```

## What it reads

- Meshes, with normals, texture coordinates and vertex colours.
- Breps (surfaces and polysurfaces) and extrusions by the render meshes saved in the file.
- SubDs, subdivided from their control nets.
- Curves, points and point clouds.
- Block instances, placed by their transforms, nested.
- Point, directional and spot lights.
- Layers (with their visibility), object colours, and materials: colours, transparency, shine, physically based settings and embedded textures.
- The model's unit system, scaled to metres.

Breps and extrusions saved without render meshes ("Save small") are not drawn, with a warning; Rhino adds them when it saves normally. Text, dimensions, hatches and other annotations are not drawn. See [Formats and support](Documentation/Support.md) for the details.

## Install

The package is not on the npm registry. Install it from GitHub:

```sh
npm install github:VJigouline/mc-3dm-import
```

`three` (r160 or later) is a peer dependency. The package builds itself on install.

## Documentation

- [Getting started](Documentation/GettingStarted.md)
- [API](Documentation/API.md)
- [Formats and support](Documentation/Support.md)
- [Using it in SceneEditor](Documentation/SceneEditor.md)

## Development

```sh
npm install
npm test           # unit tests, with Vitest
npm run typecheck
npm run build      # dist/
```

The tests load real Rhino 3DM files, kept in [`tests/samples`](tests/samples/README.md) with their licences. It needs Node.js 22 or later.

## Licence

[MIT](LICENSE)
