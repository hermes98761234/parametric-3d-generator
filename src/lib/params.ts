/** Parameter definitions, validation and URL-hash (de)serialisation for every model. All lengths are mm. */

export type ModelId = 'box' | 'bracket' | 'knob' | 'clip' | 'standoff'
export const MODEL_IDS: ModelId[] = ['box', 'bracket', 'knob', 'clip', 'standoff']

export type ParamSpec = {
  key: string
  label: string
  group: string
  kind: 'num' | 'int' | 'bool' | 'choice'
  min: number
  max: number
  step: number
  def: number
  /** Choice labels; the value is the index. */
  options?: string[]
  unit?: string
}

export type Values = Record<string, number>
export type Issue = { key: string; msg: string; args: (string | number)[] }

const num = (key: string, label: string, group: string, min: number, max: number, step: number, def: number, unit = 'mm'): ParamSpec => ({
  key, label, group, kind: 'num', min, max, step, def, unit,
})
const int = (key: string, label: string, group: string, min: number, max: number, def: number): ParamSpec => ({
  key, label, group, kind: 'int', min, max, step: 1, def,
})
const bool = (key: string, label: string, group: string, def: boolean): ParamSpec => ({
  key, label, group, kind: 'bool', min: 0, max: 1, step: 1, def: def ? 1 : 0,
})
const choice = (key: string, label: string, group: string, options: string[], def: number): ParamSpec => ({
  key, label, group, kind: 'choice', min: 0, max: options.length - 1, step: 1, def, options,
})

export type ModelDef = {
  id: ModelId
  name: string
  blurb: string
  params: ParamSpec[]
  /** Cross-parameter checks, run only when every single value is in range. */
  check: (v: Values) => Issue[]
}

const bad = (key: string, msg: string, ...args: (string | number)[]): Issue => ({ key, msg, args })

/** Height of the inner lip that locates the box lid. */
export const LIP_H = 3

const box: ModelDef = {
  id: 'box',
  name: 'Project box',
  blurb: 'Enclosure with a snap-fit or screw-down lid, vent slots and a cable hole.',
  params: [
    choice('part', 'Show', 'Size', ['Box and lid', 'Box only', 'Lid only'], 0),
    num('length', 'Length', 'Size', 40, 250, 1, 80),
    num('width', 'Width', 'Size', 30, 200, 1, 50),
    num('height', 'Box height', 'Size', 20, 120, 1, 30),
    num('wall', 'Wall thickness', 'Walls', 1.2, 5, 0.1, 2),
    num('radius', 'Corner radius', 'Walls', 0, 20, 0.5, 4),
    choice('lid', 'Lid type', 'Lid', ['Snap-fit', 'Screw-down'], 0),
    num('lidT', 'Lid thickness', 'Lid', 1.5, 5, 0.1, 2),
    num('fit', 'Lid clearance', 'Lid', 0.05, 0.6, 0.05, 0.2),
    bool('bosses', 'Screw bosses', 'Bosses', true),
    num('bossD', 'Boss diameter', 'Bosses', 5, 12, 0.5, 6.5),
    num('screwD', 'Screw hole diameter', 'Bosses', 1.5, 5, 0.1, 2.5),
    int('vents', 'Vent slots per side', 'Openings', 0, 14, 5),
    num('ventW', 'Vent slot width', 'Openings', 1, 6, 0.5, 2),
    num('ventL', 'Vent slot length', 'Openings', 5, 60, 1, 14),
    num('cableD', 'Cable hole diameter (0 = none)', 'Openings', 0, 30, 0.5, 7),
  ],
  check(v) {
    const out: Issue[] = []
    const m = Math.min(v.length, v.width)
    const screw = v.lid === 1
    if (2 * v.wall + 8 > m) out.push(bad('wall', 'Walls are too thick for this size.'))
    if (v.radius > m / 2 - 1) out.push(bad('radius', 'Corner radius must be at most {0} mm for this size.', +(m / 2 - 1).toFixed(1)))
    if (v.bosses || screw) {
      if (v.screwD + 1.6 > v.bossD) out.push(bad('bossD', 'Boss must be at least {0} mm wider than the screw hole.', 1.6))
      if (2 * v.wall + 2 * v.bossD > m) out.push(bad('bossD', 'Bosses do not fit inside this box.'))
    }
    const room = v.height - v.wall - LIP_H - 4
    if (v.vents > 0) {
      if (v.ventL > room) out.push(bad('ventL', 'Vent slots can be at most {0} mm long at this height.', +room.toFixed(1)))
      const span = v.vents * v.ventW * 2 - v.ventW
      const avail = v.length - 2 * v.radius - 2 * v.wall - 6
      if (span > avail) out.push(bad('vents', 'Vent slots need {0} mm but only {1} mm is available.', +span.toFixed(1), +avail.toFixed(1)))
    }
    if (v.cableD > 0) {
      if (v.cableD > room + 2) out.push(bad('cableD', 'Cable hole is too big for this height.'))
      if (v.cableD > v.width - 2 * v.radius - 4) out.push(bad('cableD', 'Cable hole is too big for this width.'))
    }
    return out
  },
}

const bracket: ModelDef = {
  id: 'bracket',
  name: 'L-bracket',
  blurb: 'Angle bracket with mounting holes, optional gusset and inner fillet.',
  params: [
    num('legA', 'Base leg length', 'Size', 20, 200, 1, 50),
    num('legB', 'Upright leg height', 'Size', 20, 200, 1, 50),
    num('width', 'Width', 'Size', 10, 120, 1, 30),
    num('thick', 'Thickness', 'Size', 2, 12, 0.5, 4),
    num('fillet', 'Inner fillet radius', 'Size', 0, 25, 0.5, 6),
    int('holes', 'Holes per leg', 'Holes', 0, 5, 2),
    num('holeD', 'Hole diameter', 'Holes', 3, 12, 0.2, 5),
    bool('csink', 'Countersunk holes', 'Holes', true),
    bool('gusset', 'Gusset rib', 'Gusset', true),
    num('gussetSize', 'Gusset size', 'Gusset', 5, 100, 1, 30),
    num('gussetT', 'Gusset thickness', 'Gusset', 2, 12, 0.5, 4),
  ],
  check(v) {
    const out: Issue[] = []
    if (v.fillet > Math.min(v.legA, v.legB) - v.thick - 2) out.push(bad('fillet', 'Fillet is too large for the legs.'))
    if (v.holes > 0) {
      if (v.holeD + 4 > v.width) out.push(bad('holeD', 'Hole is too wide for this bracket width.'))
      if (v.gusset && v.width < 2 * v.holeD + v.gussetT + 8) out.push(bad('gusset', 'With a gusset the width must be at least {0} mm.', +(2 * v.holeD + v.gussetT + 8).toFixed(1)))
      const need = (n: number) => v.thick + v.fillet + n * (v.holeD + 3)
      const base = need(v.holes)
      if (base > v.legA + 0.001) out.push(bad('holes', 'Base leg needs to be at least {0} mm long for these holes.', Math.ceil(base)))
      if (base > v.legB + 0.001) out.push(bad('holes', 'Upright leg needs to be at least {0} mm high for these holes.', Math.ceil(base)))
    }
    if (v.gusset && v.gussetSize > Math.min(v.legA, v.legB) - v.thick) out.push(bad('gussetSize', 'Gusset is larger than the legs.'))
    return out
  },
}

const knob: ModelDef = {
  id: 'knob',
  name: 'Knob',
  blurb: 'Potentiometer-style knob: D or round shaft, set screw, grip ridges, pointer.',
  params: [
    num('diameter', 'Diameter', 'Body', 15, 90, 1, 30),
    num('height', 'Height', 'Body', 8, 50, 1, 18),
    choice('grip', 'Grip', 'Body', ['Smooth', 'Ridges'], 1),
    int('ridges', 'Ridge count', 'Body', 6, 60, 24),
    num('ridgeDepth', 'Ridge depth', 'Body', 0.3, 4, 0.1, 1),
    choice('pointer', 'Pointer', 'Body', ['None', 'Engraved line', 'Raised bar'], 1),
    choice('shaft', 'Shaft type', 'Shaft', ['D-shaft', 'Round'], 0),
    num('shaftD', 'Shaft diameter', 'Shaft', 2, 14, 0.1, 6),
    num('shaftDepth', 'Shaft hole depth', 'Shaft', 4, 40, 0.5, 12),
    num('flat', 'D flat depth', 'Shaft', 0.2, 3, 0.1, 0.5),
    num('clear', 'Shaft clearance', 'Shaft', 0, 0.6, 0.05, 0.15),
    bool('setScrew', 'Set-screw hole', 'Set screw', true),
    num('setD', 'Set-screw hole diameter', 'Set screw', 1.5, 5, 0.1, 2.8),
  ],
  check(v) {
    const out: Issue[] = []
    if (v.shaftD + 8 > v.diameter) out.push(bad('shaftD', 'Shaft hole is too wide for this knob diameter.'))
    if (v.shaftDepth > v.height - 2) out.push(bad('shaftDepth', 'Shaft hole must be at least {0} mm shallower than the knob height.', 2))
    if (v.shaft === 0 && v.flat >= v.shaftD / 2 - 0.3) out.push(bad('flat', 'D flat is too deep for this shaft.'))
    if (v.grip === 1 && v.ridgeDepth > v.diameter / 6) out.push(bad('ridgeDepth', 'Ridges are too deep for this diameter.'))
    if (v.grip === 1 && v.ridges * 2.5 > Math.PI * v.diameter) out.push(bad('ridges', 'Too many ridges for this diameter.'))
    if (v.setScrew && v.setD > v.height - 2) out.push(bad('setD', 'Set-screw hole is too big for this height.'))
    return out
  },
}

const clip: ModelDef = {
  id: 'clip',
  name: 'Cable clip',
  blurb: 'Snap-in clip for a cable, on a flat base with screw holes.',
  params: [
    num('cableD', 'Cable diameter', 'Clip', 2, 30, 0.5, 8),
    num('wall', 'Clip wall thickness', 'Clip', 1.2, 5, 0.1, 2),
    num('length', 'Clip length', 'Clip', 5, 40, 1, 10),
    int('opening', 'Opening, % of cable diameter', 'Clip', 40, 95, 75),
    num('baseT', 'Base thickness', 'Base', 2, 8, 0.5, 3),
    num('flange', 'Flange width per side', 'Base', 4, 30, 1, 10),
    num('screwD', 'Screw hole diameter (0 = none)', 'Base', 0, 8, 0.1, 3.5),
  ],
  check(v) {
    const out: Issue[] = []
    if (v.screwD > 0 && v.flange < v.screwD + 4) out.push(bad('flange', 'Flange must be at least {0} mm for this screw hole.', +(v.screwD + 4).toFixed(1)))
    if (v.screwD > 0 && v.length < v.screwD + 2) out.push(bad('length', 'Clip is too short for the screw hole.'))
    return out
  },
}

const standoff: ModelDef = {
  id: 'standoff',
  name: 'Standoff / spacer',
  blurb: 'Round or hex standoff with a through hole and an optional nut trap.',
  params: [
    choice('shape', 'Outline', 'Body', ['Round', 'Hex'], 0),
    num('outerD', 'Outer diameter / across flats', 'Body', 4, 40, 0.5, 8),
    num('height', 'Height', 'Body', 2, 100, 0.5, 10),
    num('holeD', 'Hole diameter (0 = solid)', 'Hole', 0, 20, 0.1, 3.2),
    bool('nut', 'Hex nut trap at the bottom', 'Hole', false),
    num('nutAF', 'Nut across flats', 'Hole', 3, 20, 0.1, 5.7),
    num('nutDepth', 'Nut trap depth', 'Hole', 1, 12, 0.1, 2.5),
  ],
  check(v) {
    const out: Issue[] = []
    if (v.holeD > 0 && v.holeD + 1.6 > v.outerD) out.push(bad('holeD', 'Hole leaves a wall thinner than {0} mm.', 0.8))
    if (v.nut) {
      if (v.nutAF + 1.6 > v.outerD) out.push(bad('nutAF', 'Nut trap does not fit in this outline.'))
      if (v.nutDepth > v.height - 1) out.push(bad('nutDepth', 'Nut trap is deeper than the standoff allows.'))
    }
    return out
  },
}

export const MODELS: Record<ModelId, ModelDef> = { box, bracket, knob, clip, standoff }

export function defaults(id: ModelId): Values {
  return Object.fromEntries(MODELS[id].params.map((p) => [p.key, p.def]))
}

/** Single-value checks first; cross-parameter checks only when all values are individually fine. */
export function validate(id: ModelId, v: Values): Issue[] {
  const out: Issue[] = []
  for (const p of MODELS[id].params) {
    const x = v[p.key]
    if (typeof x !== 'number' || !Number.isFinite(x)) out.push(bad(p.key, 'Enter a number.'))
    else if (x < p.min || x > p.max) out.push(bad(p.key, 'Must be between {0} and {1}.', p.min, p.max))
    else if ((p.kind === 'int' || p.kind === 'choice' || p.kind === 'bool') && !Number.isInteger(x)) out.push(bad(p.key, 'Must be a whole number.'))
  }
  return out.length ? out : MODELS[id].check(v)
}

/** Fills missing/garbage values with defaults and clamps the rest to range. Used for untrusted input. */
export function sanitize(id: ModelId, raw: Record<string, unknown>): Values {
  const out: Values = {}
  for (const p of MODELS[id].params) {
    let x = Number(raw[p.key])
    if (raw[p.key] === undefined || raw[p.key] === '' || !Number.isFinite(x)) x = p.def
    x = Math.min(p.max, Math.max(p.min, x))
    if (p.kind !== 'num') x = Math.round(x)
    out[p.key] = x
  }
  return out
}

const isModelId = (s: unknown): s is ModelId => typeof s === 'string' && (MODEL_IDS as string[]).includes(s)

/** `#m=knob&diameter=40&...` with only the values that differ from the defaults. */
export function encodeHash(id: ModelId, v: Values): string {
  const d = defaults(id)
  const q = new URLSearchParams({ m: id })
  for (const p of MODELS[id].params) {
    if (v[p.key] !== d[p.key] && Number.isFinite(v[p.key])) q.set(p.key, String(+v[p.key].toFixed(4)))
  }
  return '#' + q.toString()
}

export function decodeHash(hash: string): { id: ModelId; values: Values } | null {
  const q = new URLSearchParams(hash.replace(/^#/, ''))
  const id = q.get('m')
  if (!isModelId(id)) return null
  return { id, values: sanitize(id, Object.fromEntries(q.entries())) }
}
