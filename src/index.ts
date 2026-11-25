// Reads Rhino .3dm files with McNeel's rhino3dm (WebAssembly) into three.js: meshes, the render
// meshes of Breps and extrusions, SubD control nets, curves, points, block instances and lights,
// grouped by layer, with Rhino's materials, colours and units.

import * as THREE from 'three';
import rhino3dm, { type RhinoModule, type RhinoModuleOptions } from 'rhino3dm';

export interface ThreeDmOptions {
  /** A rhino3dm module already loaded, to share between calls or with other code. */
  rhino?: RhinoModule;
  /**
   * Options for loading rhino3dm, such as `locateFile`, when a bundler doesn't serve
   * rhino3dm.wasm next to its script.
   */
  rhinoOptions?: RhinoModuleOptions;
  /** Metres per model unit, overriding the file's unit system. */
  unitScale?: number;
  /** Segments per curve span. Default 16. */
  curveSegments?: number;
  /** Adds objects on hidden layers, hidden. Default true. */
  hiddenLayers?: boolean;
}

export interface ThreeDmStats {
  objects: number;
  meshes: number;
  triangles: number;
  curves: number;
  points: number;
  instances: number;
  lights: number;
  /** Objects not drawn, by type. */
  skipped: Record<string, number>;
}

export interface ThreeDmLoadResult {
  /** The model, in metres and Y up: a group per layer. */
  group: THREE.Group;
  /** The model's unit system, such as Millimeters. */
  units: string;
  /** Metres per model unit. */
  unitScale: number;
  /** The Rhino version that saved the file. */
  version: number;
  layers: { name: string; fullPath: string; visible: boolean; color: number }[];
  warnings: string[];
  stats: ThreeDmStats;
}

export class ThreeDmImportError extends Error {
  override name = 'ThreeDmImportError';
}

const METRES: Record<string, number> = {
  Angstroms: 1e-10, Nanometers: 1e-9, Microns: 1e-6, Millimeters: 0.001, Centimeters: 0.01, Decimeters: 0.1, Meters: 1, Dekameters: 10,
  Hectometers: 100, Kilometers: 1000, Megameters: 1e6, Gigameters: 1e9, Microinches: 2.54e-8, Mils: 2.54e-5, Inches: 0.0254, Feet: 0.3048,
  Yards: 0.9144, Miles: 1609.344, NauticalMiles: 1852, AstronomicalUnits: 1.495978707e11, LightYears: 9.4607304725808e15, Parsecs: 3.0856775814913673e16,
};

let shared: Promise<RhinoModule> | null = null;

/** Loads rhino3dm once and keeps it for later calls. */
export function loadRhino(options?: RhinoModuleOptions): Promise<RhinoModule> {
  if (!shared) shared = rhino3dm(options);
  return shared;
}

// rhino3dm's enum values are objects; compare them by value.
const same = (a: unknown, b: unknown) => a === b || (a as { value?: number })?.value === (b as { value?: number })?.value;
const enumName = (e: Record<string, unknown>, v: unknown) => Object.keys(e).find((k) => k !== 'values' && same(e[k], v)) ?? String((v as { value?: number })?.value ?? v);
const rgb = (c: unknown) => {
  const o = c as { r?: number; g?: number; b?: number } | undefined;
  return o ? ((Math.round(o.r ?? 0) << 16) | (Math.round(o.g ?? 0) << 8) | Math.round(o.b ?? 0)) : 0xcccccc;
};

/** Reads a Rhino .3dm file. */
export async function load3dm(input: ArrayBuffer | Uint8Array, options: ThreeDmOptions = {}): Promise<ThreeDmLoadResult> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (new TextDecoder().decode(bytes.subarray(0, 24)) !== '3D Geometry File Format ') throw new ThreeDmImportError('Not a Rhino .3dm file');
  // The file format version follows the header text, such as 80 for Rhino 8 and 50 for Rhino 5.
  const version = Number(new TextDecoder().decode(bytes.subarray(24, 32)).trim()) || 0;
  const rhino = options.rhino ?? (await loadRhino(options.rhinoOptions));
  const r = rhino as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const doc = r.File3dm.fromByteArray(bytes);
  if (!doc) throw new ThreeDmImportError('The .3dm file could not be read');
  const warnings = new Set<string>();
  const stats: ThreeDmStats = { objects: 0, meshes: 0, triangles: 0, curves: 0, points: 0, instances: 0, lights: 0, skipped: {} };
  const skip = (type: string, why: string) => {
    stats.skipped[type] = (stats.skipped[type] ?? 0) + 1;
    warnings.add(why);
  };
  const segments = options.curveSegments ?? 16;

  try {
    // Layers.
    const layerTable = doc.layers();
    const layers: ThreeDmLoadResult['layers'] = [];
    const layerGroups: THREE.Group[] = [];
    for (let i = 0; i < layerTable.count; i++) {
      const l = layerTable.get(i);
      const info = { name: l.name as string, fullPath: (l.fullPath as string) || (l.name as string), visible: l.visible !== false, color: rgb(l.color) };
      layers.push(info);
      const g = new THREE.Group();
      g.name = info.fullPath;
      g.visible = info.visible;
      g.userData.rhino = { layer: info.fullPath };
      layerGroups.push(g);
    }

    // Materials, made on first use.
    const materialTable = doc.materials();
    const materials = new Map<string, THREE.Material>();
    const textureLoader = new THREE.TextureLoader();
    const material = (index: number, fallback: number, kind: 'mesh' | 'line' | 'point'): THREE.Material => {
      const key = `${kind}:${index}:${fallback}`;
      let m = materials.get(key);
      if (m) return m;
      const mat = index >= 0 && index < materialTable.count ? materialTable.get(index) : null;
      const color = mat ? rgb(mat.diffuseColor) : fallback;
      if (kind === 'line') m = new THREE.LineBasicMaterial({ color });
      else if (kind === 'point') m = new THREE.PointsMaterial({ color, size: 3, sizeAttenuation: false });
      else {
        const standard = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0, side: THREE.DoubleSide });
        if (mat) {
          standard.name = mat.name || `material ${index}`;
          const t = Number(mat.transparency ?? 0);
          if (t > 0) {
            standard.transparent = true;
            standard.opacity = 1 - t;
          }
          standard.roughness = Math.min(1, Math.sqrt(2 / (Number(mat.shine ?? 0) / 2 + 2)));
          try {
            const pbr = mat.physicallyBased?.();
            if (pbr?.supported) {
              standard.color.setHex(rgb(pbr.baseColor ? { r: pbr.baseColor.r * 255, g: pbr.baseColor.g * 255, b: pbr.baseColor.b * 255 } : mat.diffuseColor));
              standard.metalness = Number(pbr.metallic ?? 0);
              standard.roughness = Number(pbr.roughness ?? 0.5);
            }
          } catch {
            // Older files have no physically based settings.
          }
          // A bitmap texture embedded in the file.
          const file = mat.getBitmapTexture?.()?.fileName as string | undefined;
          if (file) {
            const data = doc.getEmbeddedFileAsBase64(file) as unknown as string | undefined;
            if (data) {
              const ext = file.split('.').pop()?.toLowerCase() === 'png' ? 'png' : 'jpeg';
              standard.map = textureLoader.load(`data:image/${ext};base64,${data}`);
              standard.map.colorSpace = THREE.SRGBColorSpace;
              standard.map.wrapS = standard.map.wrapT = THREE.RepeatWrapping;
              standard.color.setHex(0xffffff);
            } else warnings.add('Textures that are not embedded in the file are not loaded');
          }
        }
        m = standard;
      }
      materials.set(key, m);
      return m;
    };

    // Objects.
    const objectTable = doc.objects();
    const definitions = doc.instanceDefinitions();
    const meshFrom = (mesh: any): THREE.BufferGeometry | null => {
      if (!mesh) return null;
      const b = mesh.toThreejsBuffers(false) as { position: Float32Array; normal?: Float32Array; index?: Uint32Array; uv?: Float32Array; color?: Float32Array };
      if (!b?.position?.length) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(b.position, 3));
      if (b.normal?.length) g.setAttribute('normal', new THREE.BufferAttribute(b.normal, 3));
      if (b.uv?.length) g.setAttribute('uv', new THREE.BufferAttribute(b.uv, 2));
      if (b.color?.length) g.setAttribute('color', new THREE.BufferAttribute(b.color, b.color.length / (b.position.length / 3)));
      if (b.index?.length) g.setIndex(new THREE.BufferAttribute(b.index, 1));
      if (!b.normal?.length) g.computeVertexNormals();
      return g;
    };
    const merge = (geoms: THREE.BufferGeometry[]): THREE.BufferGeometry | null => {
      if (!geoms.length) return null;
      if (geoms.length === 1) return geoms[0]!;
      // Join face meshes into one geometry without shared vertices between them.
      const parts = geoms.map((g) => (g.index ? g.toNonIndexed() : g));
      const total = parts.reduce((s, g) => s + g.getAttribute('position').count, 0);
      const out = new THREE.BufferGeometry();
      for (const name of ['position', 'normal']) {
        const data = new Float32Array(total * 3);
        let o = 0;
        for (const g of parts) {
          const a = g.getAttribute(name);
          if (a) data.set(a.array as Float32Array, o);
          o += g.getAttribute('position').count * 3;
        }
        out.setAttribute(name, new THREE.BufferAttribute(data, 3));
      }
      return out;
    };

    const build = (obj: any, depth: number): THREE.Object3D | null => {
      const geometry = obj.geometry();
      const attrs = obj.attributes();
      const type = geometry.objectType;
      const T = r.ObjectType;
      const layerIndex = attrs.layerIndex as number;
      const fromLayer = same(attrs.materialSource, r.ObjectMaterialSource.MaterialFromLayer);
      const materialIndex = fromLayer ? (layerTable.get(layerIndex)?.renderMaterialIndex ?? -1) : (attrs.materialIndex as number);
      const draw = rgb(attrs.drawColor(doc));
      let object: THREE.Object3D | null = null;
      if (same(type, T.Mesh) || same(type, T.Brep) || same(type, T.Extrusion) || same(type, T.SubD)) {
        let geoms: THREE.BufferGeometry[] = [];
        if (same(type, T.Mesh)) geoms = [meshFrom(geometry)].filter((g): g is THREE.BufferGeometry => !!g);
        else if (same(type, T.Brep)) {
          const faces = geometry.faces();
          for (let i = 0; i < faces.count; i++) {
            const g = meshFrom(faces.get(i).getMesh(r.MeshType.Any));
            if (g) geoms.push(g);
          }
          if (!geoms.length) warnings.add('Some surfaces and solids were saved without render meshes, so they are not drawn; save them with "Save small" off');
        } else if (same(type, T.Extrusion)) {
          const g = meshFrom(geometry.getMesh(r.MeshType.Any));
          if (g) geoms = [g];
          else warnings.add('Some surfaces and solids were saved without render meshes, so they are not drawn; save them with "Save small" off');
        } else {
          geometry.subdivide?.(3);
          const g = meshFrom(r.Mesh.createFromSubDControlNet(geometry, false));
          if (g) geoms = [g];
        }
        const g = merge(geoms);
        if (g) {
          const mesh = new THREE.Mesh(g, material(materialIndex, draw, 'mesh'));
          if (g.getAttribute('color')) (mesh.material as THREE.MeshStandardMaterial).vertexColors = true;
          stats.meshes++;
          stats.triangles += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
          object = mesh;
        }
      } else if (same(type, T.Curve)) {
        const domain = geometry.domain as number[];
        const spans = Math.max(1, Number(geometry.spanCount ?? 1));
        const degree = Number(geometry.degree ?? 3);
        const count = degree === 1 ? spans : spans * segments;
        const pts: number[] = [];
        for (let i = 0; i <= count; i++) pts.push(...(geometry.pointAt(domain[0]! + ((domain[1]! - domain[0]!) * i) / count) as number[]));
        const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        object = new THREE.Line(g, material(-1, draw, 'line'));
        stats.curves++;
      } else if (same(type, T.Point)) {
        const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(geometry.location as number[], 3));
        object = new THREE.Points(g, material(-1, draw, 'point'));
        stats.points++;
      } else if (same(type, T.PointSet)) {
        const pts: number[] = [];
        for (let i = 0; i < geometry.count; i++) pts.push(...((geometry.get?.(i)?.location ?? geometry.getPoint?.(i)) as number[]));
        const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        object = new THREE.Points(g, material(-1, draw, 'point'));
        stats.points += geometry.count;
      } else if (same(type, T.InstanceReference)) {
        if (depth > 16) return null;
        const id = geometry.parentIdefId as string;
        let def: any = null;
        for (let i = 0; i < definitions.count; i++) if (definitions.get(i).id === id) def = definitions.get(i);
        if (def) {
          const holder = new THREE.Group();
          holder.name = def.name;
          for (const childId of def.getObjectIds() as string[]) {
            const child = objectTable.findId(childId);
            const built = child ? build(child, depth + 1) : null;
            if (built) holder.add(built);
          }
          const m = new THREE.Matrix4().fromArray(geometry.xform.toFloatArray(false) as number[]);
          holder.applyMatrix4(m);
          object = holder;
          stats.instances++;
        }
      } else if (same(type, T.Light)) {
        const style = enumName(r.LightStyle, geometry.lightStyle);
        const color = rgb(geometry.diffuse);
        const intensity = Number(geometry.intensity ?? 1) * Math.PI;
        let light: THREE.Light;
        const loc = geometry.location as number[];
        const dir = geometry.direction as number[];
        if (/Directional/.test(style)) {
          const d = new THREE.DirectionalLight(color, intensity);
          d.position.set(loc[0]!, loc[1]!, loc[2]!);
          d.target.position.set(loc[0]! + dir[0]!, loc[1]! + dir[1]!, loc[2]! + dir[2]!);
          light = d;
        } else if (/Spot/.test(style)) {
          const s = new THREE.SpotLight(color, intensity, 0, Number(geometry.spotAngleRadians ?? Math.PI / 4), 0.2, 2);
          s.position.set(loc[0]!, loc[1]!, loc[2]!);
          s.target.position.set(loc[0]! + dir[0]!, loc[1]! + dir[1]!, loc[2]! + dir[2]!);
          light = s;
        } else {
          if (!/Point/.test(style)) warnings.add(`${style} lights are read as point lights`);
          light = new THREE.PointLight(color, intensity, 0, 2);
          light.position.set(loc[0]!, loc[1]!, loc[2]!);
        }
        light.visible = geometry.isEnabled !== false;
        object = light;
        stats.lights++;
      } else {
        const name = enumName(r.ObjectType, type);
        skip(name, `${name} objects are not drawn`);
      }
      if (object) {
        object.name = (attrs.name as string) || object.name;
        object.userData.rhino = { id: attrs.id, layer: layers[layerIndex]?.fullPath, name: attrs.name };
        if (attrs.visible === false) object.visible = false;
      }
      return object;
    };

    for (let i = 0; i < objectTable.count; i++) {
      const obj = objectTable.get(i);
      const attrs = obj.attributes();
      // Objects inside block definitions are drawn through their instances.
      if (attrs.isInstanceDefinitionObject) continue;
      stats.objects++;
      try {
        const built = build(obj, 0);
        if (built) (layerGroups[attrs.layerIndex as number] ?? layerGroups[0])?.add(built);
      } catch (error) {
        warnings.add(`An object could not be read: ${(error as Error).message}`);
      }
    }

    const units = enumName(r.UnitSystem, doc.settings().modelUnitSystem);
    const scale = options.unitScale ?? METRES[units] ?? 1;
    const group = new THREE.Group();
    group.name = 'Rhino';
    // Rhino models are Z up.
    group.rotation.x = -Math.PI / 2;
    group.scale.setScalar(scale);
    for (const g of layerGroups) if (g.children.length && (g.visible || (options.hiddenLayers ?? true))) group.add(g);
    if (units === 'None') warnings.add('The model has no unit system; it is not scaled');
    return { group, units, unitScale: scale, version, layers, warnings: [...warnings], stats };
  } finally {
    doc.delete?.();
  }
}
