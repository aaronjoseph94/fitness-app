// Owns: the geometry of Today's mountain (1d mock, pure) — its 820 × 560 box, the silhouette paths, the dotted climb
// route as cubic Béziers, the route's length, the point a fraction of the way along it, how far along the route a
// weight sits, and which side of a flag its label fits on without crossing the route. No React, no DOM: the route is
// sampled once into a polyline, so a flag lands in the same place on every render and in every test.

export interface Point {
  x: number
  y: number
}

/** The mountain's drawing box (the mock's SVG viewBox), px at scale 1. */
export const MOUNTAIN_BOX = { width: 820, height: 560 } as const

/** The silhouette as the mock draws it: the far ridge, the mountain, its lit right face, two snow gullies, the ground. */
export const MOUNTAIN_PATHS = {
  ridge:
    'M0,560 L0,430 C100,382 160,332 232,304 C300,276 342,322 402,292 C462,262 522,204 604,194 C684,184 742,240 820,232 L820,560 Z',
  body: 'M0,560 L0,522 C82,502 150,472 210,432 C272,390 304,330 362,270 C420,210 482,120 540,62 C556,46 590,40 606,58 C660,120 720,202 780,272 C800,296 812,312 820,320 L820,560 Z',
  face: 'M606,58 C660,120 720,202 780,272 C800,296 812,312 820,320 L820,560 L700,560 C690,420 650,260 606,58 Z',
  gullies: 'M540,62 C520,130 470,190 440,250 M606,58 C600,140 640,200 660,250',
  ground: 'M0,560 L0,546 C120,536 220,553 330,549 C460,544 600,557 820,540 L820,560 Z',
} as const

/** The route from base camp (bottom left) to the summit, segment by segment: start, two controls, end. */
const SEGMENTS: readonly (readonly [Point, Point, Point, Point])[] = [
  [
    { x: 70, y: 520 },
    { x: 170, y: 512 },
    { x: 250, y: 500 },
    { x: 300, y: 468 },
  ],
  [
    { x: 300, y: 468 },
    { x: 352, y: 434 },
    { x: 262, y: 410 },
    { x: 300, y: 382 },
  ],
  [
    { x: 300, y: 382 },
    { x: 338, y: 354 },
    { x: 430, y: 362 },
    { x: 452, y: 318 },
  ],
  [
    { x: 452, y: 318 },
    { x: 474, y: 274 },
    { x: 372, y: 262 },
    { x: 410, y: 228 },
  ],
  [
    { x: 410, y: 228 },
    { x: 448, y: 194 },
    { x: 515, y: 204 },
    { x: 520, y: 162 },
  ],
  [
    { x: 520, y: 162 },
    { x: 525, y: 122 },
    { x: 462, y: 124 },
    { x: 492, y: 100 },
  ],
  [
    { x: 492, y: 100 },
    { x: 520, y: 78 },
    { x: 548, y: 76 },
    { x: 572, y: 58 },
  ],
]

/** The route as an SVG path. */
export const ROUTE_PATH = `M${SEGMENTS[0]![0].x},${SEGMENTS[0]![0].y} ${SEGMENTS.map(
  ([, c1, c2, end]) => `C${c1.x},${c1.y} ${c2.x},${c2.y} ${end.x},${end.y}`,
).join(' ')}`

/** Samples per segment: enough that the polyline's length is within 0.1 % of the curve's. */
const STEPS = 48

/** B(t) = (1−t)³P0 + 3(1−t)²t P1 + 3(1−t)t² P2 + t³P3. */
function bezier([p0, p1, p2, p3]: readonly [Point, Point, Point, Point], t: number): Point {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y }
}

/** The route as a polyline with the arc length `s` at each sample. */
const SAMPLES: readonly (Point & { s: number })[] = (() => {
  const out: (Point & { s: number })[] = [{ ...SEGMENTS[0]![0], s: 0 }]
  for (const segment of SEGMENTS) {
    for (let i = 1; i <= STEPS; i++) {
      const p = bezier(segment, i / STEPS)
      const prev = out[out.length - 1]!
      out.push({ ...p, s: prev.s + Math.hypot(p.x - prev.x, p.y - prev.y) })
    }
  }
  return out
})()

/** The route's length in the drawing's units (about 930). */
export const ROUTE_LENGTH = SAMPLES[SAMPLES.length - 1]!.s

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/**
 * How far along the route a weight sits: f = (start − kg) / (start − goal), clamped to [0, 1] — base camp is 0, the
 * summit 1. Zero when the start is not above the goal.
 */
export function climbFraction(kg: number, startKg: number, goalKg: number): number {
  const span = startKg - goalKg
  return span > 0 ? clamp01((startKg - kg) / span) : 0
}

/** The point `fraction` (0–1) of the way along the route, by arc length. */
export function pointAt(fraction: number): Point {
  const target = clamp01(fraction) * ROUTE_LENGTH
  let lo = 0
  let hi = SAMPLES.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (SAMPLES[mid]!.s < target) lo = mid
    else hi = mid
  }
  const a = SAMPLES[lo]!
  const b = SAMPLES[hi]!
  const t = b.s > a.s ? (target - a.s) / (b.s - a.s) : 0
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

/** A flag's label box beside its pole, relative to the flag's foot: it sits 16 px up and 22 px right (8 px left). */
const LABEL = { rise: 16, height: 22, rightGap: 22, leftGap: 8 } as const

/**
 * How much route a label may sit on before it moves to the flag's left: the mock lets a label ride over the route as it
 * leaves the flag (≈ 43 units at its 90 kg camp) but moves it when the route climbs straight through it (≈ 66 at 75).
 */
const MAX_OVERLAP = 50

/**
 * Which side of a flag at `fraction` its label (`width` px wide) goes: right, unless more than MAX_OVERLAP units of route
 * (other than the flag's own point) run through the right-hand box and fewer through the left-hand one.
 */
export function labelSide(fraction: number, width: number): 'left' | 'right' {
  const p = pointAt(fraction)
  const s = clamp01(fraction) * ROUTE_LENGTH
  const top = p.y - LABEL.rise - LABEL.height
  const bottom = p.y - LABEL.rise
  const overlap = (left: number, right: number) => {
    let length = 0
    for (let i = 1; i < SAMPLES.length; i++) {
      const q = SAMPLES[i]!
      if (Math.abs(q.s - s) > 12 && q.x >= left && q.x <= right && q.y >= top && q.y <= bottom)
        length += q.s - SAMPLES[i - 1]!.s
    }
    return length
  }
  const right = overlap(p.x + LABEL.rightGap, p.x + LABEL.rightGap + width)
  if (right <= MAX_OVERLAP) return 'right'
  return overlap(p.x - LABEL.leftGap - width, p.x - LABEL.leftGap) < right ? 'left' : 'right'
}
