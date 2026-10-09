/// <reference lib="webworker" />
// Manifold CSG runs here so the UI never blocks. The .wasm is imported with ?url so Vite emits it
// as an asset and the path works under any base (GitHub Pages sub-path).
import Module, { type ManifoldToplevel } from 'manifold-3d'
import wasmUrl from 'manifold-3d/manifold.wasm?url'
import { buildModel, meshOf } from './lib/models'
import type { ModelId, Values } from './lib/params'

export type WorkerRequest = { id: number; model: ModelId; values: Values }
export type WorkerResponse =
  | { id: number; ok: true; positions: Float32Array; indices: Uint32Array; volume: number }
  | { id: number; ok: false; error: string }

let ready: Promise<ManifoldToplevel> | null = null
const load = () =>
  (ready ??= Module({ locateFile: () => wasmUrl }).then((w) => {
    w.setup()
    return w
  }))

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, model, values } = e.data
  try {
    const wasm = await load()
    const built = buildModel(wasm, model, values)
    try {
      const mesh = meshOf(built.manifold)
      const volume = built.manifold.volume()
      const res: WorkerResponse = { id, ok: true, positions: mesh.positions, indices: mesh.indices, volume }
      self.postMessage(res, { transfer: [mesh.positions.buffer, mesh.indices.buffer] })
    } finally {
      built.dispose()
    }
  } catch (err) {
    const res: WorkerResponse = { id, ok: false, error: err instanceof Error ? err.message : String(err) }
    self.postMessage(res)
  }
}
