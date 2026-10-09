import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { MATERIALS, filamentGrams, meshStats, write3mf, writeBinaryStl } from './lib/mesh'
import { MODELS, MODEL_IDS, decodeHash, defaults, encodeHash, validate } from './lib/params'
import { loadState, saveState, type AppState, type Settings } from './lib/settings'
import { tr, type T } from './i18n'
import { useModel } from './useModel'
import ParamForm from './components/ParamForm'
// three.js is the bulk of the bundle; load it after the form has rendered.
const Viewer = lazy(() => import('./components/Viewer'))

const REPO = 'https://github.com/hermes98761234/parametric-3d-generator'

function download(data: Uint8Array<ArrayBuffer>, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const fmt = (x: number, d = 1) => x.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }).replace(/,/g, ' ')

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState())
  const [copied, setCopied] = useState(false)
  const { model, values, settings } = state
  const t: T = (s, ...a) => tr(settings.lang, s, ...a)
  const cur = values[model]
  const issues = useMemo(() => validate(model, cur), [model, cur])
  const valid = issues.length === 0
  const build = useModel(model, cur, valid)
  const setSettings = (patch: Partial<Settings>) => setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }))
  const hash = encodeHash(model, cur)
  const timer = useRef(0)

  useEffect(() => saveState(state), [state])
  // Keep the address bar a shareable link to the current model and parameters.
  useEffect(() => {
    if (location.hash !== hash) history.replaceState(null, '', hash)
  }, [hash])
  // Opening a shared link in an already-open tab.
  useEffect(() => {
    const onHash = () => {
      const d = decodeHash(location.hash)
      if (d) setState((s) => ({ ...s, model: d.id, values: { ...s.values, [d.id]: d.values } }))
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'auto') delete root.dataset.theme
    else root.dataset.theme = settings.theme
    root.lang = settings.lang
    document.title = t('Parametric 3D generator: boxes, brackets, knobs, STL export')
  })

  const stats = useMemo(() => (build.mesh ? meshStats(build.mesh) : null), [build.mesh])
  const material = MATERIALS.find((m) => m.id === settings.material) ?? MATERIALS[0]
  const grams = stats ? filamentGrams(build.mesh!.volume, stats.area, material.density, settings.infill / 100) : null
  const def = MODELS[model]
  // Mesh and form can briefly disagree while a rebuild is in flight; export what is shown.
  const exportName = model

  const share = async () => {
    try {
      await navigator.clipboard.writeText(location.origin + location.pathname + hash)
    } catch {
      /* clipboard blocked: the address bar already holds the link */
    }
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="app">
      <header className="toolbar">
        <span className="brand">{t('Parametric 3D generator')}</span>
        <nav className="tabs" role="tablist" aria-label={t('Model')}>
          {MODEL_IDS.map((id) => (
            <button
              key={id}
              role="tab"
              aria-selected={id === model}
              className={id === model ? 'tab on' : 'tab'}
              onClick={() => setState((s) => ({ ...s, model: id }))}
            >
              {t(MODELS[id].name)}
            </button>
          ))}
        </nav>
        <span className="spacer" />
        <label className="inline">
          {t('Language')}{' '}
          <select value={settings.lang} onChange={(e) => setSettings({ lang: e.target.value as Settings['lang'] })}>
            <option value="en">English</option>
            <option value="uk">Українська</option>
          </select>
        </label>
        <label className="inline">
          {t('Theme')}{' '}
          <select value={settings.theme} onChange={(e) => setSettings({ theme: e.target.value as Settings['theme'] })}>
            <option value="auto">{t('System')}</option>
            <option value="light">{t('Light')}</option>
            <option value="dark">{t('Dark')}</option>
          </select>
        </label>
      </header>
      <div className="body">
        <aside className="side">
          <div className="panel">
            <p className="hint">{t(def.blurb)}</p>
            <ParamForm
              model={model}
              values={cur}
              issues={issues}
              t={t}
              onChange={(k, v) => setState((s) => ({ ...s, values: { ...s.values, [model]: { ...s.values[model], [k]: v } } }))}
            />
            <div className="row">
              <button onClick={() => setState((s) => ({ ...s, values: { ...s.values, [model]: defaults(model) } }))}>{t('Reset to defaults')}</button>
            </div>
          </div>
        </aside>
        <main className="main">
          <div className="viewer-wrap">
            <Suspense fallback={<div className="viewer" />}>
            <Viewer
              mesh={build.mesh}
              frameKey={model}
              themeKey={settings.theme}
              label={t('3D preview of the model. Drag to rotate, scroll to zoom, right-drag to pan.')}
              reset={t('Reset view')}
            />
            </Suspense>
            <div className="status" aria-live="polite">
              {!valid ? (
                <span className="err-text">{t('Fix the highlighted fields.')}</span>
              ) : build.error ? (
                <span className="err-text">{t('Error: {0}', build.error)}</span>
              ) : build.busy ? (
                t('Building…')
              ) : null}
            </div>
          </div>
          <section className="box" aria-label={t('Dimensions')}>
            <h3>{t('Dimensions')}</h3>
            {stats ? (
              <table className="data">
                <tbody>
                  <tr>
                    <td>{t('Bounding box')}</td>
                    <td data-testid="bbox">
                      {fmt(stats.size[0])} × {fmt(stats.size[1])} × {fmt(stats.size[2])} mm
                    </td>
                  </tr>
                  <tr>
                    <td>{t('Volume')}</td>
                    <td data-testid="volume">{fmt(build.mesh!.volume / 1000, 2)} cm³</td>
                  </tr>
                  <tr>
                    <td>{t('Surface area')}</td>
                    <td>{fmt(stats.area / 100, 1)} cm²</td>
                  </tr>
                  <tr>
                    <td>{t('Estimated filament')}</td>
                    <td data-testid="grams">
                      <strong>{fmt(grams!, 1)} g</strong>
                    </td>
                  </tr>
                  <tr>
                    <td>{t('Triangles')}</td>
                    <td>{stats.triangles.toLocaleString('en-US')}</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <p className="hint">{t('Building…')}</p>
            )}
            <div className="row">
              <label className="inline">
                {t('Material')}{' '}
                <select value={settings.material} onChange={(e) => setSettings({ material: e.target.value })}>
                  {MATERIALS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.density} g/cm³)
                    </option>
                  ))}
                </select>
              </label>
              <label className="inline">
                {t('Infill')} <span>{settings.infill}%</span>{' '}
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={settings.infill}
                  aria-label={t('Infill')}
                  onChange={(e) => setSettings({ infill: Number(e.target.value) })}
                />
              </label>
            </div>
            <p className="hint">{t('Filament is a rough estimate: a 1.2 mm solid shell plus the infill. Slicer settings differ.')}</p>
            <div className="row">
              <button className="primary" disabled={!build.mesh || !valid} onClick={() => build.mesh && download(writeBinaryStl(build.mesh, `${exportName} - parametric-3d-generator`), `${exportName}.stl`, 'model/stl')}>
                {t('Download STL')}
              </button>
              <button disabled={!build.mesh || !valid} onClick={() => build.mesh && download(write3mf(build.mesh, exportName), `${exportName}.3mf`, 'model/3mf')}>
                {t('Download 3MF')}
              </button>
              <button onClick={share}>{copied ? t('Link copied') : t('Copy share link')}</button>
            </div>
          </section>
        </main>
      </div>
      <p className="hint foot">
        {t('Everything runs in your browser; nothing is uploaded.')} <a href={REPO}>{t('Source on GitHub')}</a>
      </p>
    </div>
  )
}
