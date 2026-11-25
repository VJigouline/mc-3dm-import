import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { load3dm, ThreeDmImportError } from '../src/index.js';
import { sample } from './files.js';

describe('Rhino 3DM', () => {
  it('reads a mesh in its units, turned Y up', async () => {
    const r = await load3dm(sample('mesh.3dm').data);
    expect(r.version).toBe(80);
    expect(r.units).toBe('Millimeters');
    expect(r.unitScale).toBe(0.001);
    expect(r.stats).toMatchObject({ objects: 1, meshes: 1, triangles: 276 });
    expect(r.group.rotation.x).toBeCloseTo(-Math.PI / 2);
    expect(r.layers.length).toBe(1);
  });

  it('reads SubDs through their control nets', async () => {
    for (const name of ['subd_creases.3dm', 'subduv.3dm']) {
      const r = await load3dm(sample(name).data);
      expect(r.stats.meshes, name).toBe(1);
      expect(r.stats.triangles, name).toBeGreaterThan(100);
    }
  });

  it('reads block instances, and says when solids have no render meshes', async () => {
    const r = await load3dm(sample('blocks.3dm').data);
    expect(r.stats.instances).toBe(2);
    expect(r.warnings.some((w) => w.includes('render meshes'))).toBe(true);
  });

  it('reads a mesh with its material', async () => {
    const r = await load3dm(sample('sphereDecals.3dm').data);
    const mesh = r.group.getObjectByProperty('type', 'Mesh') as THREE.Mesh;
    expect(mesh.material).toBeInstanceOf(THREE.MeshStandardMaterial);
  });

  it('refuses files that are not 3DM', async () => {
    await expect(load3dm(new TextEncoder().encode('hello'))).rejects.toThrow(ThreeDmImportError);
  });
});
