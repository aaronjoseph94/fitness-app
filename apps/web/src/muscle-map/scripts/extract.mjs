// Owns: generating ../lib/geometry.ts from the vendored react-muscle-map SVG. Run: node apps/web/src/muscle-map/scripts/extract.mjs
//
// The source SVG holds both views side by side (viewBox 0 0 1320.92 1206.46). This script:
//  - reads every `data-muscle` element and assigns it to a view by its x position (front left, back right);
//  - folds the extra source groups into our 17-key enum: `hands` → base body, `obliques` → abdominals;
//  - keeps the outline strokes (internal detail lines) per view;
//  - builds the grey base silhouette from the source's own body-outline subpaths (the tall ones) plus a convex
//    hull of the head outline, so head, knees and feet read as body even though the source leaves them unfilled;
//  - writes typed path data and each view's viewBox.
// No geometry is drawn by hand: every point comes from the source file.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(here, '../source/react-muscle-map.svg')
const OUT = path.join(here, '../lib/geometry.ts')
const DEBUG = process.argv.includes('--debug')

const MUSCLES = [
  'abdominals',
  'abductors',
  'adductors',
  'biceps',
  'calves',
  'chest',
  'forearms',
  'glutes',
  'hamstrings',
  'lats',
  'lower back',
  'middle back',
  'neck',
  'quadriceps',
  'shoulders',
  'traps',
  'triceps',
]
/** Source groups that are not one of the 17 keys. */
const ALIASES = { hands: 'base', obliques: 'abdominals' }
/** Padding around each view's content, in source units. */
const PAD = 8

// ---------------------------------------------------------------------------------------------------------------
// Path parsing: tokenise, make absolute, sample points for bounds and hulls.

const NUM = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/i
const ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 }

/** Tokenise path data into [{ cmd, args }], one entry per command repetition (implicit repeats expanded). */
function parse(d) {
  const out = []
  let i = 0
  let cmd = null
  const skip = () => {
    while (i < d.length && /[\s,]/.test(d[i])) i++
  }
  const readNumber = () => {
    skip()
    const m = NUM.exec(d.slice(i))
    if (!m) throw new Error(`Bad number at ${i}: ${d.slice(i, i + 20)}`)
    i += m[0].length
    return Number(m[0])
  }
  const readFlag = () => {
    skip()
    const c = d[i++]
    if (c !== '0' && c !== '1') throw new Error(`Bad arc flag at ${i - 1}`)
    return Number(c)
  }
  while (true) {
    skip()
    if (i >= d.length) break
    if (/[a-zA-Z]/.test(d[i])) cmd = d[i++]
    else if (!cmd) throw new Error('Path does not start with a command')
    const upper = cmd.toUpperCase()
    const n = ARITY[upper]
    if (n === undefined) throw new Error(`Unknown command ${cmd}`)
    const args = []
    for (let k = 0; k < n; k++) args.push(upper === 'A' && (k === 3 || k === 4) ? readFlag() : readNumber())
    out.push({ cmd, args })
    if (upper === 'Z') continue
    // After a moveto, implicit repeats are linetos.
    if (cmd === 'M') cmd = 'L'
    else if (cmd === 'm') cmd = 'l'
  }
  return out
}

/** Absolute commands (M L C Q A Z only) grouped into subpaths, each with sampled points. */
function toSubpaths(d) {
  const subs = []
  let cur = null
  let x = 0,
    y = 0,
    sx = 0,
    sy = 0
  let lastC = null // last cubic control point (for S)
  let lastQ = null // last quadratic control point (for T)
  const push = (c, args, pts) => {
    cur.cmds.push({ c, args })
    cur.points.push(...pts)
  }
  for (const { cmd, args } of parse(d)) {
    const rel = cmd === cmd.toLowerCase()
    const C = cmd.toUpperCase()
    const ox = rel ? x : 0
    const oy = rel ? y : 0
    let nextC = null
    let nextQ = null
    switch (C) {
      case 'M': {
        x = args[0] + ox
        y = args[1] + oy
        sx = x
        sy = y
        cur = { cmds: [{ c: 'M', args: [x, y] }], points: [[x, y]] }
        subs.push(cur)
        break
      }
      case 'L':
      case 'H':
      case 'V': {
        if (C === 'L') {
          x = args[0] + ox
          y = args[1] + oy
        } else if (C === 'H') x = args[0] + (rel ? x : 0)
        else y = args[0] + (rel ? y : 0)
        push('L', [x, y], [[x, y]])
        break
      }
      case 'C':
      case 'S': {
        let x1, y1
        let k = 0
        if (C === 'C') {
          x1 = args[0] + ox
          y1 = args[1] + oy
          k = 2
        } else if (lastC) {
          x1 = 2 * x - lastC[0]
          y1 = 2 * y - lastC[1]
        } else {
          x1 = x
          y1 = y
        }
        const x2 = args[k] + ox,
          y2 = args[k + 1] + oy,
          ex = args[k + 2] + ox,
          ey = args[k + 3] + oy
        push('C', [x1, y1, x2, y2, ex, ey], sampleCubic([x, y], [x1, y1], [x2, y2], [ex, ey]))
        nextC = [x2, y2]
        x = ex
        y = ey
        break
      }
      case 'Q':
      case 'T': {
        let x1, y1
        let k = 0
        if (C === 'Q') {
          x1 = args[0] + ox
          y1 = args[1] + oy
          k = 2
        } else if (lastQ) {
          x1 = 2 * x - lastQ[0]
          y1 = 2 * y - lastQ[1]
        } else {
          x1 = x
          y1 = y
        }
        const ex = args[k] + ox,
          ey = args[k + 1] + oy
        push('Q', [x1, y1, ex, ey], sampleQuad([x, y], [x1, y1], [ex, ey]))
        nextQ = [x1, y1]
        x = ex
        y = ey
        break
      }
      case 'A': {
        const [rx, ry, rot, large, sweep] = args
        const ex = args[5] + ox,
          ey = args[6] + oy
        // Arcs in this file are small rounded joins; the end point is enough for bounds and hulls.
        push('A', [rx, ry, rot, large, sweep, ex, ey], [[ex, ey]])
        x = ex
        y = ey
        break
      }
      case 'Z': {
        push('Z', [], [[sx, sy]])
        x = sx
        y = sy
        break
      }
    }
    lastC = nextC
    lastQ = nextQ
  }
  return subs
}

function sampleCubic(p0, p1, p2, p3, n = 6) {
  const pts = []
  for (let s = 1; s <= n; s++) {
    const t = s / n,
      u = 1 - t
    pts.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ])
  }
  return pts
}

function sampleQuad(p0, p1, p2, n = 4) {
  const pts = []
  for (let s = 1; s <= n; s++) {
    const t = s / n,
      u = 1 - t
    pts.push([
      u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
      u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
    ])
  }
  return pts
}

function bounds(points) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
  for (const [px, py] of points) {
    if (px < minX) minX = px
    if (py < minY) minY = py
    if (px > maxX) maxX = px
    if (py > maxY) maxY = py
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2 }
}

const r2 = (v) => Number(v.toFixed(2)).toString()

function serialise(sub) {
  return sub.cmds.map(({ c, args }) => c + args.map(r2).join(' ')).join('')
}

/** Andrew's monotone chain convex hull. */
function hull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper = []
  for (const p of pts.reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop()
    upper.push(p)
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

// ---------------------------------------------------------------------------------------------------------------
// Read the source.

const svg = fs.readFileSync(SRC, 'utf8')
const fullViewBox = /viewBox="([^"]+)"/.exec(svg)[1].split(/\s+/).map(Number)
const midX = fullViewBox[0] + fullViewBox[2] / 2

const attr = (tag, name) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1]

/** [{ muscle, d }] for every data-muscle element (a <path>, or a <g> of paths). */
const regions = []
for (const m of svg.matchAll(/<path\b([^>]*?)\/>|<g\b([^>]*)>([\s\S]*?)<\/g>/g)) {
  const tag = m[1] ?? m[2]
  const key = attr(tag, 'data-muscle')
  if (!key) continue
  const ds = m[1] !== undefined ? [attr(tag, ' d')] : [...m[3].matchAll(/ d="([^"]*)"/g)].map((x) => x[1])
  for (const d of ds) regions.push({ key, side: attr(tag, 'data-side'), d })
}
const outlineGroups = [...svg.matchAll(/<g\b[^>]*class="muscle-map__outline"[^>]*>([\s\S]*?)<\/g>/g)].map(
  (m) => [...m[1].matchAll(/ d="([^"]*)"/g)].map((x) => x[1]),
)

const views = { front: { paths: [], outline: [], points: [] }, back: { paths: [], outline: [], points: [] } }
const viewOf = (b) => (b.cx < midX ? 'front' : 'back')

for (const { key, side, d } of regions) {
  const subs = toSubpaths(d)
  const pts = subs.flatMap((s) => s.points)
  const view = viewOf(bounds(pts))
  if (side && side !== view) throw new Error(`${key}: data-side ${side} but x position says ${view}`)
  const muscle = ALIASES[key] ?? key
  if (muscle !== 'base' && !MUSCLES.includes(muscle)) throw new Error(`Unknown muscle key ${key}`)
  views[view].paths.push({ muscle, d })
  views[view].points.push(...pts)
}

const outlineSubs = { front: [], back: [] }
for (const group of outlineGroups) {
  for (const d of group) {
    const subs = toSubpaths(d)
    const view = viewOf(bounds(subs.flatMap((s) => s.points)))
    views[view].outline.push(d)
    outlineSubs[view].push(...subs)
    views[view].points.push(...subs.flatMap((s) => s.points))
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Base silhouette per view.

for (const view of ['front', 'back']) {
  const v = views[view]
  const body = bounds(v.points)
  const subsWithBounds = outlineSubs[view].map((s) => ({ s, b: bounds(s.points) }))
  // The body halves are the only outline subpaths spanning most of the figure's height.
  const halves = subsWithBounds.filter(({ b }) => b.h > body.h * 0.6)
  if (halves.length !== 2) throw new Error(`${view}: expected 2 body-half outlines, found ${halves.length}`)
  // The head: every outline point above the top of the shoulders (the highest point the halves reach off-centre).
  const neck = v.paths
    .filter((p) => p.muscle === 'neck')
    .flatMap((p) => toSubpaths(p.d).flatMap((s) => s.points))
  const headBottom = bounds(neck).minY
  const headPts = subsWithBounds.flatMap(({ s }) => s.points).filter(([, py]) => py <= headBottom + 2)
  const head = hull(headPts)
  v.base = [
    ...halves.map(({ s }) => serialise(s)),
    'M' + head.map(([px, py]) => `${r2(px)} ${r2(py)}`).join('L') + 'Z',
  ]
  v.viewBox = [body.minX - PAD, body.minY - PAD, body.w + 2 * PAD, body.h + 2 * PAD].map((n) =>
    Number(n.toFixed(2)),
  )
  if (DEBUG) {
    console.log(view, 'body', body, 'headBottom', headBottom, 'head hull pts', head.length)
    for (const { s, b } of subsWithBounds)
      console.log('  outline sub', serialise(s).slice(0, 30), r2(b.minY), r2(b.maxY), r2(b.h))
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Emit.

const lines = []
lines.push(
  '// Owns: muscle-map path data, GENERATED by ../scripts/extract.mjs from ../source/react-muscle-map.svg. Do not edit.',
)
lines.push("import type { Muscle } from '@fitness/shared/schemas'")
lines.push('')
lines.push("export type MuscleView = 'front' | 'back'")
lines.push('')
lines.push('export interface MuscleRegionPath {')
lines.push('  readonly muscle: Muscle')
lines.push('  readonly d: string')
lines.push('}')
lines.push('')
lines.push('export interface ViewGeometry {')
lines.push('  /** [minX, minY, width, height] in source units. */')
lines.push('  readonly viewBox: readonly [number, number, number, number]')
lines.push('  /** Grey body silhouette (both halves, the head, the hands), drawn under the muscles. */')
lines.push('  readonly base: readonly string[]')
lines.push('  /** One entry per source element, in source paint order. Obliques count as abdominals. */')
lines.push('  readonly muscles: readonly MuscleRegionPath[]')
lines.push('  /** Detail lines (abs, knees, face), stroked on top. */')
lines.push('  readonly outline: readonly string[]')
lines.push('}')
lines.push('')
lines.push('export const GEOMETRY: Readonly<Record<MuscleView, ViewGeometry>> = {')
for (const view of ['front', 'back']) {
  const v = views[view]
  const hands = v.paths.filter((p) => p.muscle === 'base').map((p) => p.d)
  lines.push(`  ${view}: {`)
  lines.push(`    viewBox: [${v.viewBox.join(', ')}],`)
  lines.push(`    base: [`)
  for (const d of [...v.base, ...hands]) lines.push(`      ${JSON.stringify(d)},`)
  lines.push(`    ],`)
  lines.push(`    muscles: [`)
  for (const p of v.paths.filter((p) => p.muscle !== 'base'))
    lines.push(`      { muscle: ${JSON.stringify(p.muscle)}, d: ${JSON.stringify(p.d)} },`)
  lines.push(`    ],`)
  lines.push(`    outline: [`)
  for (const d of v.outline) lines.push(`      ${JSON.stringify(d)},`)
  lines.push(`    ],`)
  lines.push(`  },`)
}
lines.push('}')
lines.push('')

fs.writeFileSync(OUT, lines.join('\n'))
const covered = new Set(Object.values(views).flatMap((v) => v.paths.map((p) => p.muscle)))
const missing = MUSCLES.filter((m) => !covered.has(m))
if (missing.length) throw new Error(`Muscles without geometry: ${missing.join(', ')}`)
console.log(`Wrote ${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB)`)
