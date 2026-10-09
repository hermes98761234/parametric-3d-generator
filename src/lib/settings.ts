import { MATERIALS } from './mesh'
import { MODEL_IDS, decodeHash, defaults, sanitize, type ModelId, type Values } from './params'

export type Lang = 'en' | 'uk'
export type Theme = 'auto' | 'light' | 'dark'
export type Settings = { lang: Lang; theme: Theme; material: string; infill: number }

export type AppState = {
  model: ModelId
  values: Record<ModelId, Values>
  settings: Settings
}

const KEY = 'p3g:v1'

export function defaultSettings(nav = typeof navigator === 'undefined' ? 'en' : navigator.language): Settings {
  return { lang: nav.toLowerCase().startsWith('uk') ? 'uk' : 'en', theme: 'auto', material: 'pla', infill: 20 }
}

export function parseSettings(raw: unknown, base: Settings = defaultSettings()): Settings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const infill = Number(o.infill)
  return {
    lang: o.lang === 'uk' || o.lang === 'en' ? o.lang : base.lang,
    theme: o.theme === 'light' || o.theme === 'dark' || o.theme === 'auto' ? o.theme : base.theme,
    material: MATERIALS.some((m) => m.id === o.material) ? (o.material as string) : base.material,
    infill: Number.isFinite(infill) ? Math.min(100, Math.max(0, Math.round(infill))) : base.infill,
  }
}

function allDefaults(): Record<ModelId, Values> {
  return Object.fromEntries(MODEL_IDS.map((id) => [id, defaults(id)])) as Record<ModelId, Values>
}

/** URL hash wins over the stored state, so shared links open exactly as shared. */
export function loadState(hash: string = location.hash): AppState {
  let stored: Record<string, unknown> = {}
  try {
    stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>
  } catch {
    /* corrupt storage: start fresh */
  }
  const values = allDefaults()
  const sv = (stored.values ?? {}) as Record<string, Record<string, unknown>>
  for (const id of MODEL_IDS) if (sv[id] && typeof sv[id] === 'object') values[id] = sanitize(id, sv[id])
  let model: ModelId = MODEL_IDS.includes(stored.model as ModelId) ? (stored.model as ModelId) : 'box'
  const shared = decodeHash(hash)
  if (shared) {
    model = shared.id
    values[shared.id] = shared.values
  }
  return { model, values, settings: parseSettings(stored.settings) }
}

export function saveState(s: AppState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage unavailable (private mode): ignore */
  }
}
