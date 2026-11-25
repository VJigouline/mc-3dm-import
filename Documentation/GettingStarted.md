# Getting started

## Install

```sh
npm install three github:VJigouline/mc-3dm-import
```

## Open a file

`load3dm` takes the file's text or bytes, as a string, `ArrayBuffer` or `Uint8Array`. It returns a promise of the model.

```ts
import * as THREE from 'three';
import { load3dm } from 'mc-3dm-import';

const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
input.addEventListener('change', async () => {
  const result = await load3dm(await input.files![0]!.arrayBuffer());
  scene.add(result.group);
  for (const warning of result.warnings) console.warn(warning);
});
```

## What you get

- **`group`:** a `THREE.Group` holding the model, named after the file.
- **`stats`:** counts of what was read.
- **`warnings`:** anything that couldn't be read or was left out.

Rhino models are Z up; the group turns them Y up and scales them to metres.

## Options

- **`rhino`** (default —): A rhino3dm module already loaded.
- **`rhinoOptions`** (default —): Options for loading rhino3dm, such as `locateFile`, for bundlers that don't serve `rhino3dm.wasm` next to its script.
- **`unitScale`** (default from the file): Metres per model unit.
- **`curveSegments`** (default 16): Segments per curve span.
- **`hiddenLayers`** (default true): Adds objects on hidden layers, hidden.

See the [API](API.md) for every field of the result.
