import { MODELS, type Issue, type ModelId, type Values } from '../lib/params'
import type { T } from '../i18n'

type Props = {
  model: ModelId
  values: Values
  issues: Issue[]
  t: T
  onChange: (key: string, value: number) => void
}

export default function ParamForm({ model, values, issues, t, onChange }: Props) {
  const def = MODELS[model]
  const groups: string[] = []
  for (const p of def.params) if (!groups.includes(p.group)) groups.push(p.group)
  const byKey = new Map<string, Issue>()
  for (const i of issues) if (!byKey.has(i.key)) byKey.set(i.key, i)

  return (
    <>
      {groups.map((g) => (
        <fieldset className="section" key={g}>
          <legend>{t(g)}</legend>
          {def.params
            .filter((p) => p.group === g)
            .map((p) => {
              const x = values[p.key]
              const issue = byKey.get(p.key)
              const id = `${model}-${p.key}`
              const err = issue ? t(issue.msg, ...issue.args) : null
              const errId = err ? `${id}-err` : undefined
              if (p.kind === 'bool') {
                return (
                  <div className="field check" key={p.key}>
                    <label htmlFor={id}>
                      <input id={id} type="checkbox" checked={x === 1} onChange={(e) => onChange(p.key, e.target.checked ? 1 : 0)} /> {t(p.label)}
                    </label>
                  </div>
                )
              }
              if (p.kind === 'choice') {
                return (
                  <div className="field" key={p.key}>
                    <label htmlFor={id}>{t(p.label)}</label>
                    <select id={id} value={x} onChange={(e) => onChange(p.key, Number(e.target.value))}>
                      {p.options!.map((o, i) => (
                        <option key={o} value={i}>
                          {t(o)}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              }
              const finite = Number.isFinite(x)
              return (
                <div className="field" key={p.key}>
                  <label htmlFor={id}>
                    {t(p.label)}
                    {p.unit && <span className="unit"> ({p.unit})</span>}
                  </label>
                  <div className="num">
                    <input
                      type="range"
                      aria-label={t(p.label)}
                      min={p.min}
                      max={p.max}
                      step={p.step}
                      value={finite ? Math.min(p.max, Math.max(p.min, x)) : p.def}
                      onChange={(e) => onChange(p.key, Number(e.target.value))}
                    />
                    <input
                      id={id}
                      type="number"
                      inputMode="decimal"
                      min={p.min}
                      max={p.max}
                      step={p.step}
                      className={issue ? 'bad' : undefined}
                      aria-invalid={!!issue}
                      aria-describedby={errId}
                      value={finite ? x : ''}
                      onChange={(e) => onChange(p.key, e.target.value.trim() === '' ? NaN : Number(e.target.value))}
                    />
                  </div>
                  {err && (
                    <span id={errId} className="err-text">
                      {err}
                    </span>
                  )}
                </div>
              )
            })}
        </fieldset>
      ))}
    </>
  )
}
