# API

## `load3dm(input, options?)`

Reads `.3dm` (Rhino 5 to 8) and returns a promise of a `3dmLoadResult`.

`input` is the file's text or bytes, as a string, `ArrayBuffer` or `Uint8Array`.

It throws `ThreeDmImportError` for input that isn't Rhino 3DM.

### Options

| Option | Default | Meaning |
| --- | --- | --- |
| `rhino` | — | A rhino3dm module already loaded. |
| `rhinoOptions` | — | Options for loading rhino3dm, such as `locateFile`, for bundlers that don't serve `rhino3dm.wasm` next to its script. |
| `unitScale` | from the file | Metres per model unit. |
| `curveSegments` | 16 | Segments per curve span. |
| `hiddenLayers` | true | Adds objects on hidden layers, hidden. |

### `3dmLoadResult`

| Field | Type | Meaning |
| --- | --- | --- |
| `group` | `THREE.Group` | The model. |
| `units` | `string` | The model's unit system, such as Millimeters. |
| `unitScale` | `number` | Metres per model unit. |
| `version` | `number` | The file's version: 80 for Rhino 8, 50 for Rhino 5. |
| `layers` | array | Layers: `name`, `fullPath`, `visible` and `color`. |
| `warnings` | `string[]` | Problems that didn't stop the import. |
| `stats` | object | Counts of meshes, triangles and the like. |

See the package's `index.d.ts` for every exported type and helper.
