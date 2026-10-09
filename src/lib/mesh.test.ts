import { unzipSync, strFromU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import { filamentGrams, meshStats, write3mf, writeBinaryStl, type MeshData } from './mesh'

/** Unit cube, 8 vertices / 12 outward-facing triangles. */
const cube = (s = 1): MeshData => ({
  positions: new Float32Array([0, 0, 0, s, 0, 0, s, s, 0, 0, s, 0, 0, 0, s, s, 0, s, s, s, s, 0, s, s]),
  indices: new Uint32Array([
    0, 2, 1, 0, 3, 2, // bottom
    4, 5, 6, 4, 6, 7, // top
    0, 1, 5, 0, 5, 4, // front
    1, 2, 6, 1, 6, 5, // right
    2, 3, 7, 2, 7, 6, // back
    3, 0, 4, 3, 4, 7, // left
  ]),
})

describe('meshStats', () => {
  it('computes volume, area and bounding box of a cube', () => {
    const s = meshStats(cube(10))
    expect(s.volume).toBeCloseTo(1000, 6)
    expect(s.area).toBeCloseTo(600, 6)
    expect(s.size).toEqual([10, 10, 10])
    expect(s.triangles).toBe(12)
  })
  it('handles an empty mesh', () => {
    expect(meshStats({ positions: new Float32Array(), indices: new Uint32Array() }).volume).toBe(0)
  })
})

describe('writeBinaryStl', () => {
  const stl = writeBinaryStl(cube(2))
  const dv = new DataView(stl.buffer)
  it('has the binary STL layout', () => {
    expect(stl.byteLength).toBe(84 + 50 * 12)
    expect(dv.getUint32(80, true)).toBe(12)
    expect(new TextDecoder().decode(stl.subarray(0, 5))).toBe('param')
    // Not an ASCII STL: must not start with "solid".
    expect(new TextDecoder().decode(stl.subarray(0, 5))).not.toBe('solid')
  })
  it('writes unit normals pointing outwards and zero attribute bytes', () => {
    for (let t = 0; t < 12; t++) {
      const o = 84 + 50 * t
      const n = [dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true)]
      expect(Math.hypot(...n)).toBeCloseTo(1, 5)
      // Triangle centroid relative to the cube centre (1,1,1) must align with the normal.
      let dot = 0
      for (let k = 0; k < 3; k++) {
        const c = [0, 1, 2].reduce((a, v) => a + dv.getFloat32(o + 12 + 12 * v + 4 * k, true), 0) / 3
        dot += n[k] * (c - 1)
      }
      expect(dot).toBeGreaterThan(0)
      expect(dv.getUint16(o + 48, true)).toBe(0)
    }
  })
  it('round-trips the geometry (volume of the re-read triangles)', () => {
    const pos: number[] = []
    for (let t = 0; t < 12; t++) for (let i = 0; i < 9; i++) pos.push(dv.getFloat32(84 + 50 * t + 12 + (i < 3 ? 0 : i < 6 ? 0 : 0) + i * 4, true))
    const m: MeshData = { positions: new Float32Array(pos), indices: Uint32Array.from({ length: 36 }, (_, i) => i) }
    expect(meshStats(m).volume).toBeCloseTo(8, 5)
  })
})

describe('write3mf', () => {
  it('is a zip with a model that has the right counts and units', () => {
    const files = unzipSync(write3mf(cube(5), 'Cube'))
    expect(Object.keys(files).sort()).toEqual(['3D/3dmodel.model', '[Content_Types].xml', '_rels/.rels'])
    const xml = strFromU8(files['3D/3dmodel.model'])
    expect(xml).toContain('unit="millimeter"')
    expect(xml.match(/<vertex /g)).toHaveLength(8)
    expect(xml.match(/<triangle /g)).toHaveLength(12)
    expect(xml).toContain('v3="')
  })
})

describe('filamentGrams', () => {
  it('is the solid mass at 100% infill', () => {
    expect(filamentGrams(10000, 2000, 1.24, 1)).toBeCloseTo(12.4, 6)
  })
  it('is lower with sparse infill and caps the shell at the volume', () => {
    const g20 = filamentGrams(100000, 10000, 1.24, 0.2)
    expect(g20).toBeGreaterThan(0.2 * 124)
    expect(g20).toBeLessThan(124)
    expect(filamentGrams(100, 1000, 1, 0)).toBeCloseTo(0.1, 6)
  })
})
