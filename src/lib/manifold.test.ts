import { beforeAll, describe, expect, it } from 'vitest'
import Module, { type ManifoldToplevel } from 'manifold-3d'
import { buildModel, meshOf } from './models'
import { meshStats } from './mesh'
import { MODEL_IDS, MODELS, defaults, validate, type ModelId, type Values } from './params'

let wasm: ManifoldToplevel
beforeAll(async () => {
  wasm = await Module()
  wasm.setup()
})

describe('manifold in node', () => {
  it('generates a plain box with the analytic volume', () => {
    const v: Values = { ...defaults('box'), part: 1, radius: 0, bosses: 0, vents: 0, cableD: 0, lid: 0 }
    const b = buildModel(wasm, 'box', v)
    try {
      const L = 80, W = 50, H = 30, w = 2
      const expected = L * W * H - (L - 2 * w) * (W - 2 * w) * (H - w)
      const vol = b.manifold.volume()
      // Four small spherical grooves are cut from the walls, so the volume is slightly below the plain shell.
      expect(vol).toBeLessThan(expected)
      expect(vol).toBeGreaterThan(expected - 20)
      const bb = b.manifold.boundingBox()
      expect(bb.max[0] - bb.min[0]).toBeCloseTo(L, 4)
      expect(bb.max[1] - bb.min[1]).toBeCloseTo(W, 4)
      expect(bb.max[2] - bb.min[2]).toBeCloseTo(H, 4)
      expect(b.manifold.status()).toBe('NoError')
    } finally {
      b.dispose()
    }
  })

  it('mesh volume agrees with manifold volume', () => {
    const b = buildModel(wasm, 'knob', defaults('knob'))
    try {
      const s = meshStats(meshOf(b.manifold))
      expect(s.volume).toBeCloseTo(b.manifold.volume(), 0)
    } finally {
      b.dispose()
    }
  })

  it('hex standoff has the analytic volume', () => {
    const v: Values = { ...defaults('standoff'), shape: 1, outerD: 10, height: 20, holeD: 4, nut: 0 }
    const b = buildModel(wasm, 'standoff', v)
    try {
      const hexArea = (Math.sqrt(3) / 2) * 10 * 10 // across flats 10
      const hole16 = 0.5 * 16 * 2 * 2 * Math.sin((2 * Math.PI) / 16) // the 4 mm hole is a 16-gon
      expect(b.manifold.volume()).toBeCloseTo((hexArea - hole16) * 20, 3)
    } finally {
      b.dispose()
    }
  })

  it.each(MODEL_IDS)('%s builds a valid solid with default parameters', (id: ModelId) => {
    expect(validate(id, defaults(id))).toEqual([])
    const b = buildModel(wasm, id, defaults(id))
    try {
      expect(b.manifold.status()).toBe('NoError')
      expect(b.manifold.volume()).toBeGreaterThan(100)
      expect(b.manifold.numTri()).toBeGreaterThan(12)
      const bb = b.manifold.boundingBox()
      expect(bb.min[2]).toBeCloseTo(0, 6)
    } finally {
      b.dispose()
    }
  })

  it('keeps every model valid at the corners of its options', () => {
    for (const id of MODEL_IDS) {
      for (const p of MODELS[id].params.filter((q) => q.kind === 'choice' || q.kind === 'bool')) {
        for (let o = p.min; o <= p.max; o++) {
          const v = { ...defaults(id), [p.key]: o }
          if (validate(id, v).length) continue
          const b = buildModel(wasm, id, v)
          try {
            expect(b.manifold.status(), `${id}.${p.key}=${o}`).toBe('NoError')
            expect(b.manifold.volume(), `${id}.${p.key}=${o}`).toBeGreaterThan(0)
          } finally {
            b.dispose()
          }
        }
      }
    }
  })
})
