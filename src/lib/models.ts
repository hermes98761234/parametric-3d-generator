/** Parametric solid models built with Manifold CSG. Z is up, units are mm. */
import type { CrossSection, Manifold, ManifoldToplevel, Vec2 } from 'manifold-3d'
import type { MeshData } from './mesh'
import { LIP_H, type ModelId, type Values } from './params'

type Disposable = { delete(): void }

/** Thin helpers over Manifold that remember every intermediate object so it can be freed. */
class Kit {
  private pool: Disposable[] = []
  readonly w: ManifoldToplevel
  constructor(w: ManifoldToplevel) {
    this.w = w
  }
  private t<T extends Disposable>(x: T): T {
    this.pool.push(x)
    return x
  }
  dispose() {
    for (const x of this.pool) x.delete()
    this.pool = []
  }
  seg(r: number) {
    return Math.max(16, Math.min(96, Math.ceil(r * 8)))
  }
  sphere(r: number, segments: number) {
    return this.t(this.w.Manifold.sphere(r, segments))
  }
  box(x: number, y: number, z: number, center = false) {
    return this.t(this.w.Manifold.cube([x, y, z], center))
  }
  /** Cylinder along +Z from z=0 (or centered). `r2` makes a cone. */
  cyl(h: number, r: number, r2 = r, center = false, segments?: number) {
    return this.t(this.w.Manifold.cylinder(h, r, r2, segments ?? this.seg(Math.max(r, r2)), center))
  }
  move(m: Manifold, x: number, y: number, z: number) {
    return this.t(m.translate([x, y, z]))
  }
  rot(m: Manifold, x: number, y: number, z: number) {
    return this.t(m.rotate([x, y, z]))
  }
  add(...ms: Manifold[]) {
    return this.t(this.w.Manifold.union(ms))
  }
  sub(a: Manifold, ...bs: Manifold[]) {
    return bs.length ? this.t(this.w.Manifold.difference([a, ...bs])) : a
  }
  inter(a: Manifold, b: Manifold) {
    return this.t(this.w.Manifold.intersection([a, b]))
  }
  compose(ms: Manifold[]) {
    return this.t(this.w.Manifold.compose(ms))
  }
  ext(cs: CrossSection, h: number) {
    return this.t(this.w.Manifold.extrude(cs, h))
  }
  /** Centered rectangle with rounded corners of radius r. */
  rrect(w: number, d: number, r: number) {
    if (r < 0.01) return this.t(this.w.CrossSection.square([w, d], true))
    const s = this.t(this.w.CrossSection.square([w - 2 * r, d - 2 * r], true))
    return this.t(s.offset(r, 'Round', 2, this.seg(r)))
  }
  circle(r: number) {
    return this.t(this.w.CrossSection.circle(r, this.seg(r)))
  }
  rect(x0: number, y0: number, x1: number, y1: number) {
    return this.t(this.w.CrossSection.square([x1 - x0, y1 - y0]).translate([x0, y0]))
  }
  poly(pts: Vec2[]) {
    return this.t(new this.w.CrossSection([pts]))
  }
  csInter(a: CrossSection, b: CrossSection) {
    return this.t(a.intersect(b))
  }
}

/** A screw hole cutter along +Z from z=-1 through z=thick, optionally countersunk at the z=thick face. */
function holeCutter(k: Kit, d: number, thick: number, csink: boolean) {
  const bore = k.move(k.cyl(thick + 2, d / 2), 0, 0, -1)
  if (!csink) return bore
  const cs = Math.min(thick * 0.6, d * 0.5)
  return k.add(bore, k.move(k.cyl(cs + 0.01, d / 2, d / 2 + cs + 0.01), 0, 0, thick - cs))
}

function buildBox(k: Kit, v: Values): Manifold {
  const L = v.length, W = v.width, H = v.height, w = v.wall, r = v.radius
  const screw = v.lid === 1
  const bosses = v.bosses === 1 || screw
  const rIn = Math.max(r - w, 0)
  const c = v.fit
  const bx = L / 2 - w - v.bossD / 2 + 0.5
  const by = W / 2 - w - v.bossD / 2 + 0.5
  const bossPos: [number, number][] = [[bx, by], [-bx, by], [bx, -by], [-bx, -by]]
  const zc = w + (H - w - LIP_H) / 2

  // Base
  const outer = k.ext(k.rrect(L, W, r), H)
  const cavity = k.move(k.ext(k.rrect(L - 2 * w, W - 2 * w, rIn), H), 0, 0, w)
  const parts: Manifold[] = [k.sub(outer, cavity)]
  if (bosses) {
    const top = screw ? H : H - LIP_H - 1
    const bossCyl = (p: [number, number]) => k.move(k.cyl(top - (w - 0.2), v.bossD / 2), p[0], p[1], w - 0.2)
    parts.push(k.inter(k.add(...bossPos.map(bossCyl)), outer))
  }
  let base = k.add(...parts)
  const cuts: Manifold[] = []
  if (bosses) {
    const top = screw ? H : H - LIP_H - 1
    for (const [x, y] of bossPos) cuts.push(k.move(k.cyl(top - w, v.screwD / 2), x, y, w + 1))
  }
  const ventL = Math.min(v.ventL, H - w - LIP_H - 4)
  for (let s = -1; s <= 1; s += 2) {
    for (let i = 0; i < v.vents; i++) {
      const x = (i - (v.vents - 1) / 2) * 2 * v.ventW
      cuts.push(k.move(k.box(v.ventW, w + 2, ventL, true), x, s * (W / 2 - w / 2), zc))
    }
    if (!screw) for (const x of [-L / 4, L / 4]) cuts.push(k.move(k.sphere(0.7, 12), x, s * (W / 2 - w), H - LIP_H / 2))
  }
  if (v.cableD > 0) {
    cuts.push(k.move(k.rot(k.cyl(w + 4, v.cableD / 2, v.cableD / 2, true), 0, 90, 0), -L / 2 + w / 2, 0, zc))
  }
  base = k.sub(base, ...cuts)

  // Lid, printed outer face down with the locating lip pointing up.
  const lo = [L - 2 * w - 2 * c, W - 2 * w - 2 * c, Math.max(rIn - c, 0)] as const
  const ringOuter = k.ext(k.rrect(lo[0], lo[1], lo[2]), LIP_H + 0.2)
  const ringInner = k.move(k.ext(k.rrect(lo[0] - 2.4, lo[1] - 2.4, Math.max(lo[2] - 1.2, 0)), LIP_H + 2), 0, 0, -1)
  const lidCuts: Manifold[] = [ringInner]
  const lidAdds: Manifold[] = []
  if (screw) {
    for (const [x, y] of bossPos) {
      lidCuts.push(k.move(k.cyl(LIP_H + 4, v.bossD / 2 + 0.4), x, y, v.lidT - 0.2))
    }
  } else {
    for (let s = -1; s <= 1; s += 2) {
      for (const x of [-L / 4, L / 4]) lidAdds.push(k.move(k.sphere(0.6, 12), x, s * lo[1] / 2, v.lidT + LIP_H / 2))
    }
  }
  const ring = k.add(k.sub(k.move(ringOuter, 0, 0, v.lidT - 0.2), ...lidCuts), ...lidAdds)
  let lid = k.add(k.ext(k.rrect(L, W, r), v.lidT), ring)
  if (screw) {
    const d = v.screwD + 0.5
    const cs = Math.min(v.lidT - 0.6, d * 0.5)
    const holes = bossPos.map(([x, y]) =>
      k.move(k.add(k.move(k.cyl(v.lidT + 2, d / 2), 0, 0, -1), k.move(k.cyl(cs + 0.01, d / 2 + cs, d / 2), 0, 0, -0.01)), x, y, 0),
    )
    lid = k.sub(lid, ...holes)
  }
  lid = k.move(lid, 0, W + 8, 0)

  return v.part === 1 ? base : v.part === 2 ? k.move(lid, 0, -(W + 8), 0) : k.compose([base, lid])
}

function buildBracket(k: Kit, v: Values): Manifold {
  const A = v.legA, B = v.legB, W = v.width, t = v.thick, f = v.fillet
  const parts: Manifold[] = [k.box(A, W, t), k.box(t, W, B)]
  if (f > 0.01) {
    const corner = k.move(k.box(f + 0.01, W, f + 0.01), t - 0.01, 0, t - 0.01)
    const round = k.move(k.rot(k.cyl(W + 2, f), -90, 0, 0), t + f, -1, t + f)
    parts.push(k.sub(corner, round))
  }
  if (v.gusset) {
    const g = Math.min(v.gussetSize, A - t, B - t)
    const tri = k.poly([[t / 2, t / 2], [t + g, t / 2], [t + g, t], [t, t + g], [t / 2, t + g]])
    parts.push(k.move(k.rot(k.ext(tri, v.gussetT), 90, 0, 0), 0, W / 2 + v.gussetT / 2, 0))
  }
  let m = k.add(...parts)
  if (v.holes > 0) {
    const cutter = holeCutter(k, v.holeD, t, v.csink === 1)
    const cutterX = k.rot(cutter, 0, 90, 0)
    const rows = v.gusset ? [v.holeD / 2 + 3, W - v.holeD / 2 - 3] : [W / 2]
    const a = t + f
    const cuts: Manifold[] = []
    for (let i = 0; i < v.holes; i++) {
      const x = a + ((A - a) * (i + 0.5)) / v.holes
      const z = a + ((B - a) * (i + 0.5)) / v.holes
      for (const y of rows) {
        cuts.push(k.move(cutter, x, y, 0))
        cuts.push(k.move(cutterX, 0, y, z))
      }
    }
    m = k.sub(m, ...cuts)
  }
  return m
}

function buildKnob(k: Kit, v: Values): Manifold {
  const R = v.diameter / 2, H = v.height
  let body: Manifold
  if (v.grip === 1) {
    const n = v.ridges, per = 8, pts: Vec2[] = []
    for (let i = 0; i < n * per; i++) {
      const th = (i / (n * per)) * Math.PI * 2
      const rr = R - v.ridgeDepth * (0.5 - 0.5 * Math.cos(n * th))
      pts.push([rr * Math.cos(th), rr * Math.sin(th)])
    }
    body = k.ext(k.poly(pts), H)
  } else {
    body = k.cyl(H, R, R, false, 96)
  }
  const rs = v.shaftD / 2 + v.clear
  let prof = k.circle(rs)
  if (v.shaft === 0) prof = k.csInter(prof, k.rect(-rs - 1, -rs - 1, v.shaftD / 2 - v.flat + v.clear, rs + 1))
  const cuts: Manifold[] = [k.move(k.ext(prof, v.shaftDepth + 0.01), 0, 0, -0.01)]
  if (v.setScrew) {
    const z = Math.min(Math.max(v.shaftDepth / 2, v.setD / 2 + 0.5), H - v.setD / 2 - 1)
    cuts.push(k.move(k.rot(k.cyl(R + 1, v.setD / 2), 0, 90, 0), 0, 0, z))
  }
  if (v.pointer === 1) cuts.push(k.move(k.box(R * 0.55, 1.4, 1.6, true), R * 0.7, 0, H - 0.4))
  let m = k.sub(body, ...cuts)
  if (v.pointer === 2) m = k.add(m, k.move(k.box(R * 0.55, 2.4, 1.01, true), R * 0.65, 0, H + 0.005))
  return m
}

function buildClip(k: Kit, v: Values): Manifold {
  const ri = v.cableD / 2 + 0.2, ro = ri + v.wall, len = v.length
  const zc = v.baseT + ro - 0.5
  const half = ro + v.flange
  const along = (m: Manifold) => k.rot(m, -90, 0, 0) // axis Z -> +Y
  const ring = k.sub(along(k.cyl(len, ro)), along(k.move(k.cyl(len + 2, ri), 0, 0, -1)))
  const ringUp = k.move(ring, 0, 0, zc)
  const gap = Math.min(ri * 2 * (v.opening / 100), ri * 2 - 0.2)
  const slot = k.move(k.box(gap, len + 2, ro + 2), -gap / 2, -1, zc)
  const base = k.move(k.box(2 * half, len, v.baseT), -half, 0, 0)
  let m = k.add(base, k.sub(ringUp, slot))
  if (v.screwD > 0) {
    const cutter = holeCutter(k, v.screwD, v.baseT, true)
    const cx = ro + v.flange / 2
    m = k.sub(m, k.move(cutter, cx, len / 2, 0), k.move(cutter, -cx, len / 2, 0))
  }
  return m
}

function buildStandoff(k: Kit, v: Values): Manifold {
  const h = v.height
  const r = v.outerD / 2
  let m = v.shape === 1 ? k.cyl(h, r / Math.cos(Math.PI / 6), r / Math.cos(Math.PI / 6), false, 6) : k.cyl(h, r, r, false, 64)
  const cuts: Manifold[] = []
  if (v.holeD > 0) cuts.push(k.move(k.cyl(h + 2, v.holeD / 2), 0, 0, -1))
  if (v.nut === 1) {
    const rn = v.nutAF / 2 / Math.cos(Math.PI / 6)
    cuts.push(k.move(k.cyl(v.nutDepth + 1, rn, rn, false, 6), 0, 0, -1))
  }
  m = k.sub(m, ...cuts)
  return m
}

export type Built = { manifold: Manifold; dispose: () => void }

/** Builds a model and moves it so it is centred on the origin in X/Y and sits on z=0. */
export function buildModel(wasm: ManifoldToplevel, id: ModelId, v: Values): Built {
  const k = new Kit(wasm)
  try {
    const raw = { box: buildBox, bracket: buildBracket, knob: buildKnob, clip: buildClip, standoff: buildStandoff }[id](k, v)
    const bb = raw.boundingBox()
    const placed = raw.translate([-(bb.min[0] + bb.max[0]) / 2, -(bb.min[1] + bb.max[1]) / 2, -bb.min[2]])
    return {
      manifold: placed,
      dispose: () => {
        placed.delete()
        k.dispose()
      },
    }
  } catch (e) {
    k.dispose()
    throw e
  }
}

export function meshOf(m: Manifold): MeshData {
  const mesh = m.getMesh()
  const np = mesh.numProp
  const n = mesh.vertProperties.length / np
  const positions = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    positions[3 * i] = mesh.vertProperties[i * np]
    positions[3 * i + 1] = mesh.vertProperties[i * np + 1]
    positions[3 * i + 2] = mesh.vertProperties[i * np + 2]
  }
  return { positions, indices: new Uint32Array(mesh.triVerts) }
}
