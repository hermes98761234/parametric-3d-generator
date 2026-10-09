import { describe, expect, it } from 'vitest'
import { UK, tr } from './i18n'
import { MODELS, MODEL_IDS, validate, defaults } from './lib/params'

describe('i18n', () => {
  it('interpolates placeholders in both languages', () => {
    expect(tr('en', 'Error: {0}', 'x')).toBe('Error: x')
    expect(tr('uk', 'Error: {0}', 'x')).toBe('Помилка: x')
    expect(tr('uk', 'Must be between {0} and {1}.', 1, 5)).toBe('Має бути від 1 до 5.')
  })
  it('falls back to English for unknown strings', () => {
    expect(tr('uk', 'No such string')).toBe('No such string')
  })
  it('translates every model, group, parameter and option label', () => {
    const missing: string[] = []
    for (const id of MODEL_IDS) {
      const m = MODELS[id]
      for (const s of [m.name, m.blurb]) if (!(s in UK)) missing.push(s)
      for (const p of m.params) for (const s of [p.label, p.group, ...(p.options ?? [])]) if (!(s in UK)) missing.push(s)
    }
    expect([...new Set(missing)]).toEqual([])
  })
  it('translates every validation message with matching placeholders', () => {
    const src = Object.keys(UK).filter((k) => /\{\d\}/.test(k))
    for (const k of src) {
      const ph = (s: string) => (s.match(/\{\d\}/g) ?? []).sort().join()
      expect(ph(UK[k]), k).toBe(ph(k))
    }
    // Messages produced by probing invalid inputs.
    const probes = [
      { ...defaults('box'), width: 30, wall: 5, bossD: 12, radius: 20, vents: 14, ventL: 60, cableD: 30 },
      { ...defaults('bracket'), width: 14, fillet: 25, holes: 5, gussetSize: 100 },
      { ...defaults('knob'), diameter: 15, shaftDepth: 18, flat: 3, ridgeDepth: 4, ridges: 60, setD: 5, height: 8 },
      { ...defaults('clip'), screwD: 8, flange: 4, length: 5 },
      { ...defaults('standoff'), holeD: 8, nut: 1, nutAF: 8, nutDepth: 12, height: 5 },
      { ...defaults('box'), length: NaN, wall: 99, vents: 1.5 },
    ]
    const ids = ['box', 'bracket', 'knob', 'clip', 'standoff', 'box'] as const
    probes.forEach((v, i) => {
      for (const issue of validate(ids[i], v)) expect(issue.msg in UK, issue.msg).toBe(true)
    })
  })
})
