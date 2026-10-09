import { describe, expect, it } from 'vitest'
import { MODEL_IDS, MODELS, decodeHash, defaults, encodeHash, sanitize, validate } from './params'

describe('parameter validation', () => {
  it.each(MODEL_IDS)('%s defaults are valid and inside their ranges', (id) => {
    expect(validate(id, defaults(id))).toEqual([])
    for (const p of MODELS[id].params) {
      expect(p.def).toBeGreaterThanOrEqual(p.min)
      expect(p.def).toBeLessThanOrEqual(p.max)
    }
  })
  it('flags out-of-range and non-finite values', () => {
    const v = { ...defaults('box'), wall: 99, length: NaN }
    const keys = validate('box', v).map((i) => i.key)
    expect(keys).toContain('wall')
    expect(keys).toContain('length')
  })
  it('flags fractional integers', () => {
    expect(validate('box', { ...defaults('box'), vents: 2.5 }).map((i) => i.key)).toEqual(['vents'])
  })
  it('catches cross-parameter conflicts', () => {
    const tooThick = { ...defaults('box'), width: 30, wall: 5, bossD: 12 }
    expect(validate('box', tooThick).map((i) => i.key)).toContain('bossD')
    const longVents = { ...defaults('box'), ventL: 60 }
    expect(validate('box', longVents).map((i) => i.key)).toContain('ventL')
    const bigHole = { ...defaults('standoff'), holeD: 8 }
    expect(validate('standoff', bigHole).map((i) => i.key)).toContain('holeD')
    expect(validate('bracket', { ...defaults('bracket'), width: 14, holeD: 6 }).length).toBeGreaterThan(0)
    expect(validate('knob', { ...defaults('knob'), shaftDepth: 18 }).map((i) => i.key)).toContain('shaftDepth')
  })
})

describe('sanitize', () => {
  it('clamps, rounds and fills defaults', () => {
    const s = sanitize('box', { length: '1000', vents: '3.6', wall: 'abc', lid: '9' })
    expect(s.length).toBe(250)
    expect(s.vents).toBe(4)
    expect(s.wall).toBe(2)
    expect(s.lid).toBe(1)
    expect(s.width).toBe(50)
  })
})

describe('URL hash', () => {
  it('encodes only non-default values', () => {
    expect(encodeHash('knob', defaults('knob'))).toBe('#m=knob')
    expect(encodeHash('knob', { ...defaults('knob'), diameter: 42.5 })).toBe('#m=knob&diameter=42.5')
  })
  it.each(MODEL_IDS)('%s round-trips', (id) => {
    const v = { ...defaults(id), [MODELS[id].params[1].key]: MODELS[id].params[1].max }
    const back = decodeHash(encodeHash(id, v))
    expect(back).toEqual({ id, values: v })
  })
  it('rejects unknown models and sanitises garbage', () => {
    expect(decodeHash('#m=nope')).toBeNull()
    expect(decodeHash('')).toBeNull()
    const d = decodeHash('#m=clip&cableD=-5&junk=1')
    expect(d?.values.cableD).toBe(2)
    expect(d?.values).not.toHaveProperty('junk')
  })
})
