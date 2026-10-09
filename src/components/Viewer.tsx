import { useEffect, useRef } from 'react'
import {
  AmbientLight,
  Box3,
  Box3Helper,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  GridHelper,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { MeshData } from '../lib/mesh'

type Props = {
  mesh: MeshData | null
  /** Changing this re-frames the camera (a different model, not just new parameters). */
  frameKey: string
  /** Changing this re-reads the theme colours. */
  themeKey: string
  label: string
  reset: string
}

type Ctx = {
  renderer: WebGLRenderer
  scene: Scene
  camera: PerspectiveCamera
  controls: OrbitControls
  mat: MeshStandardMaterial
  grid: GridHelper | null
  mesh: Mesh | null
  box: Box3Helper | null
  framed: string | null
  render: () => void
}

const cssVar = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback

/** Aims the camera at the model from a three-quarter view, far enough to fit it. */
function frame(c: Ctx) {
  const bb = c.mesh?.geometry.boundingBox
  if (!bb) return
  const center = bb.getCenter(new Vector3())
  const extent = Math.max(...bb.getSize(new Vector3()).toArray())
  const dist = (extent / 2 / Math.tan((c.camera.fov * Math.PI) / 360)) * 1.25 + extent * 0.35
  c.camera.position.copy(center).addScaledVector(new Vector3(0.55, -0.75, 0.55).normalize(), dist)
  c.controls.target.copy(center)
  c.camera.near = Math.max(0.1, dist / 200)
  c.camera.far = dist * 40
  c.camera.updateProjectionMatrix()
  c.controls.update()
}

function applyGridColors(g: GridHelper) {
  const main = new Color(cssVar('--grid-strong', '#3a414e'))
  const sub = new Color(cssVar('--grid', '#1f242d'))
  const col = g.geometry.getAttribute('color')
  const centre = (col.count / 4 - 1) / 2 // GridHelper: 4 vertices per division, all one colour
  for (let i = 0; i < col.count; i++) {
    const c = Math.floor(i / 4) === centre ? main : sub
    col.setXYZ(i, c.r, c.g, c.b)
  }
  col.needsUpdate = true
}

export default function Viewer({ mesh, frameKey, themeKey, label, reset }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const ctx = useRef<Ctx | null>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return
    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({ antialias: true })
    } catch (e) {
      el.dataset.error = e instanceof Error ? e.message : String(e)
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    el.prepend(renderer.domElement)
    const scene = new Scene()
    scene.background = new Color(cssVar('--chart-bg', '#0b0d11'))
    const camera = new PerspectiveCamera(40, 1, 0.5, 5000)
    camera.up.set(0, 0, 1)
    camera.position.set(120, -160, 110)
    scene.add(new HemisphereLight(0xffffff, 0x445066, 1.1))
    scene.add(new AmbientLight(0xffffff, 0.35))
    const key = new DirectionalLight(0xffffff, 2.2)
    key.position.set(150, -200, 300)
    scene.add(key)
    const fill = new DirectionalLight(0xffffff, 0.8)
    fill.position.set(-200, 100, 80)
    scene.add(fill)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.screenSpacePanning = true
    const render = () => renderer.render(scene, camera)
    controls.addEventListener('change', render)
    const mat = new MeshStandardMaterial({ color: 0x5b9bff, roughness: 0.5, metalness: 0.05 })
    const c: Ctx = { renderer, scene, camera, controls, mat, grid: null, mesh: null, box: null, framed: null, render }
    ctx.current = c
    const resize = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      render()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()
    return () => {
      ro.disconnect()
      controls.dispose()
      c.mesh?.geometry.dispose()
      c.box?.geometry.dispose()
      c.grid?.geometry.dispose()
      mat.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      ctx.current = null
    }
  }, [])

  // Theme colours.
  useEffect(() => {
    const c = ctx.current
    if (!c) return
    c.scene.background = new Color(cssVar('--chart-bg', '#0b0d11'))
    if (c.grid) applyGridColors(c.grid)
    c.render()
  }, [themeKey])

  // Geometry.
  useEffect(() => {
    const c = ctx.current
    if (!c) return
    for (const o of [c.mesh, c.box, c.grid]) {
      if (o) {
        c.scene.remove(o)
        o.geometry.dispose()
      }
    }
    c.mesh = c.box = c.grid = null
    if (!mesh) {
      c.render()
      return
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(mesh.positions, 3))
    g.setIndex(new BufferAttribute(mesh.indices, 1))
    const flat = g.toNonIndexed() // separate vertices per triangle: crisp facets instead of smoothed edges
    g.dispose()
    flat.computeVertexNormals()
    flat.computeBoundingBox()
    c.mesh = new Mesh(flat, c.mat)
    c.scene.add(c.mesh)
    const bb = flat.boundingBox as Box3
    c.box = new Box3Helper(bb, new Color(0xf59e0b))
    c.scene.add(c.box)
    const extent = Math.max(...bb.getSize(new Vector3()).toArray())
    const span = Math.max(200, Math.ceil((extent * 2.5) / 20) * 20)
    c.grid = new GridHelper(span, span / 10)
    c.grid.rotation.x = Math.PI / 2
    c.grid.position.z = -0.05
    applyGridColors(c.grid)
    c.scene.add(c.grid)
    if (c.framed !== frameKey) {
      c.framed = frameKey
      frame(c)
    }
    c.render()
  }, [mesh, frameKey])

  return (
    <div className="viewer" ref={host} role="img" aria-label={label}>
      <button
        type="button"
        className="small viewer-reset"
        aria-label={reset}
        title={reset}
        onClick={() => {
          const c = ctx.current
          if (c) {
            frame(c)
            c.render()
          }
        }}
      >
        {'↺'}
      </button>
    </div>
  )
}
