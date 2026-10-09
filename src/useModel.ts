import { useEffect, useRef, useState } from 'react'
import type { MeshData } from './lib/mesh'
import type { ModelId, Values } from './lib/params'
import type { WorkerRequest, WorkerResponse } from './model.worker'

export type BuildState = {
  mesh: (MeshData & { volume: number }) | null
  busy: boolean
  error: string | null
}

type Result = { key: string; mesh: BuildState['mesh']; error: string | null }

/** Rebuilds the model in a worker (debounced) whenever the parameters change; stale replies are dropped. */
export function useModel(model: ModelId, values: Values, enabled: boolean): BuildState {
  const [last, setLast] = useState<Result | null>(null)
  const [mesh, setMesh] = useState<BuildState['mesh']>(null)
  const worker = useRef<Worker | null>(null)
  const latest = useRef(0)
  const keys = useRef(new Map<number, string>())
  const key = model + JSON.stringify(values)

  useEffect(() => {
    const w = new Worker(new URL('./model.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const r = e.data
      if (r.id !== latest.current) return
      const k = keys.current.get(r.id) ?? ''
      if (r.ok) {
        const m = { positions: r.positions, indices: r.indices, volume: r.volume }
        setMesh(m)
        setLast({ key: k, mesh: m, error: null })
      } else {
        setLast({ key: k, mesh: null, error: r.error })
      }
    }
    w.onerror = (e) => setLast({ key: '', mesh: null, error: e.message || 'Worker failed' })
    worker.current = w
    return () => {
      w.terminate()
      worker.current = null
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    const id = ++latest.current
    keys.current.set(id, key)
    const timer = setTimeout(() => {
      const req: WorkerRequest = { id, model, values: JSON.parse(key.slice(model.length)) as Values }
      worker.current?.postMessage(req)
    }, 120)
    return () => clearTimeout(timer)
  }, [model, key, enabled])

  const error = last?.key === key || last?.key === '' ? last.error : null
  return { mesh, busy: enabled && last?.key !== key && !error, error }
}
