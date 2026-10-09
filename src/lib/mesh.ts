/** Triangle-mesh helpers: statistics, binary STL and 3MF writers. Units are mm. */
import { zipSync, strToU8 } from 'fflate'

export type MeshData = {
  /** x,y,z per vertex. */
  positions: Float32Array
  /** 3 vertex indices per triangle, counter-clockwise seen from outside. */
  indices: Uint32Array
}

export type MeshStats = {
  triangles: number
  min: [number, number, number]
  max: [number, number, number]
  size: [number, number, number]
  /** mm^3 */
  volume: number
  /** mm^2 */
  area: number
}

export function meshStats(m: MeshData): MeshStats {
  const p = m.positions
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      if (p[i + k] < min[k]) min[k] = p[i + k]
      if (p[i + k] > max[k]) max[k] = p[i + k]
    }
  }
  let vol = 0
  let area = 0
  const n = m.indices.length / 3
  for (let t = 0; t < n; t++) {
    const a = m.indices[3 * t] * 3
    const b = m.indices[3 * t + 1] * 3
    const c = m.indices[3 * t + 2] * 3
    const ax = p[a], ay = p[a + 1], az = p[a + 2]
    const bx = p[b], by = p[b + 1], bz = p[b + 2]
    const cx = p[c], cy = p[c + 1], cz = p[c + 2]
    // Signed tetrahedron volume against the origin: a . (b x c) / 6.
    vol += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6
    const ux = bx - ax, uy = by - ay, uz = bz - az
    const vx = cx - ax, vy = cy - ay, vz = cz - az
    area += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
  }
  if (n === 0) return { triangles: 0, min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0], volume: 0, area: 0 }
  return {
    triangles: n,
    min,
    max,
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    volume: Math.abs(vol),
    area,
  }
}

export type Material = { id: string; name: string; density: number }
/** Density in g/cm^3. */
export const MATERIALS: Material[] = [
  { id: 'pla', name: 'PLA', density: 1.24 },
  { id: 'petg', name: 'PETG', density: 1.27 },
  { id: 'abs', name: 'ABS', density: 1.04 },
  { id: 'tpu', name: 'TPU', density: 1.21 },
]

/**
 * Rough filament mass: a perimeter shell (surface area x shell thickness, capped at the
 * volume) printed solid, and the rest at the infill fraction.
 */
export function filamentGrams(volumeMm3: number, areaMm2: number, density: number, infill: number, shellMm = 1.2): number {
  const shell = Math.min(volumeMm3, areaMm2 * shellMm)
  const inner = volumeMm3 - shell
  return ((shell + inner * Math.min(1, Math.max(0, infill))) / 1000) * density
}

/** Binary STL: 80-byte header, uint32 triangle count, then 50 bytes per triangle. */
export function writeBinaryStl(m: MeshData, name = 'parametric-3d-generator'): Uint8Array<ArrayBuffer> {
  const n = m.indices.length / 3
  const buf = new ArrayBuffer(84 + 50 * n)
  const dv = new DataView(buf)
  const head = strToU8(name).subarray(0, 79)
  new Uint8Array(buf, 0, 80).set(head)
  dv.setUint32(80, n, true)
  const p = m.positions
  let o = 84
  for (let t = 0; t < n; t++) {
    const a = m.indices[3 * t] * 3
    const b = m.indices[3 * t + 1] * 3
    const c = m.indices[3 * t + 2] * 3
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2]
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2]
    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz) || 1
    nx /= len; ny /= len; nz /= len
    dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true)
    o += 12
    for (const i of [a, b, c]) {
      dv.setFloat32(o, p[i], true); dv.setFloat32(o + 4, p[i + 1], true); dv.setFloat32(o + 8, p[i + 2], true)
      o += 12
    }
    dv.setUint16(o, 0, true)
    o += 2
  }
  return new Uint8Array(buf)
}

const num = (x: number) => String(+x.toFixed(5))

/** 3MF package (a zip with the core-spec model part), millimetre units. */
export function write3mf(m: MeshData, title = 'Model'): Uint8Array<ArrayBuffer> {
  const v: string[] = []
  for (let i = 0; i < m.positions.length; i += 3) {
    v.push(`<vertex x="${num(m.positions[i])}" y="${num(m.positions[i + 1])}" z="${num(m.positions[i + 2])}"/>`)
  }
  const t: string[] = []
  for (let i = 0; i < m.indices.length; i += 3) {
    t.push(`<triangle v1="${m.indices[i]}" v2="${m.indices[i + 1]}" v3="${m.indices[i + 2]}"/>`)
  }
  const esc = title.replace(/[<>&"]/g, '')
  const model =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">` +
    `<metadata name="Title">${esc}</metadata><metadata name="Application">parametric-3d-generator</metadata>` +
    `<resources><object id="1" type="model" name="${esc}"><mesh><vertices>${v.join('')}</vertices><triangles>${t.join('')}</triangles></mesh></object></resources>` +
    `<build><item objectid="1"/></build></model>`
  const files = {
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`,
    ),
    '_rels/.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`,
    ),
    '3D/3dmodel.model': strToU8(model),
  }
  return zipSync(files) as Uint8Array<ArrayBuffer>
}
