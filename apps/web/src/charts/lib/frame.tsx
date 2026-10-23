// Owns: what every chart shares — the 1d "Summit" frame (testid, a top row with the unit caption left and the legend
// keys right — or the keys under the plot — the dashed empty slot, responsive vs fixed print width, the line/area
// draw-in) and the Summit mark styling from `tokens.chart`: horizontal hairline grids, a lilac baseline under bars,
// 11/500 axis labels in the muted axis ink, the 3 px trend line over an area fading to 0, white weigh-in dots ringed in
// faint lilac, the current point (a white dot in a gold halo, or a filled dot in its own colour's halo), bar fills as a
// metric's ramp (a vertical gradient, low → high), wide bars with 14 px tops and 6 px feet, dashed targets, the dashed
// gold plan / expected line; the dark deep-ink tooltip (12 px, radius 14, 8 × 12, 8 × 8 keys); and the text that names
// a chart for screen readers (its label and a one-line summary, never its tick numbers).
import Box from '@mui/material/Box'
import { keyframes } from '@mui/material/styles'
import { useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { chartFocus, dashedSurface, formatShortDate, LegendChips, type LegendItem } from '../../components'
import { metricRamp, prefersReducedMotion, tokens, withAlpha, type MetricKey } from '../../theme'

/** Size props shared by every chart. */
export interface ChartSizeProps {
  /** Fixed pixel width (print/report renders at ~700). Omit to fill the container. */
  width?: number
  /** Plot height in px including the x-axis band. Each chart has a sensible default. */
  height?: number
}

/** Recharts size props: fixed when `width` is given, else responsive to the container. */
export function rechartsSize(width: number | undefined, height: number) {
  return width === undefined
    ? ({ responsive: true, width: '100%', height } as const)
    : ({ width, height } as const)
}

/**
 * Bars grow on screen, never in print (fixed width) or under reduced motion, so the PDF never catches a half-grown bar.
 * Lines and areas never use Recharts' own animation: it measures the path length once, so a responsive resize
 * mid-animation leaves the line cut short of its last point. They draw in with the frame's CSS wipe instead.
 */
function animated(width: number | undefined): boolean {
  return width === undefined && !prefersReducedMotion()
}

/** Recharts props for a bar series: 2a's 1.4 s grow from the baseline on screen, none in print. */
export function barMotion(width: number | undefined) {
  return {
    isAnimationActive: animated(width),
    animationDuration: tokens.motion.duration.grow,
    animationEasing: 'ease-out',
  } as const
}

export const MARGIN = { top: 8, right: 8, bottom: 0, left: 0 } as const

const tick = {
  fontSize: tokens.chart.axisFontSize,
  fill: tokens.chart.axis,
  fontWeight: tokens.font.weight.label,
} as const

export const xAxisStyle = { axisLine: false, tickLine: false, tick, tickMargin: 8, minTickGap: 18 } as const
/** An x-axis under bars: the same labels over a 1 px `tokens.chart.baseline` rule. */
export const barXAxisStyle = {
  ...xAxisStyle,
  axisLine: { stroke: tokens.chart.baseline, strokeWidth: 1 },
} as const
/**
 * Every y-axis passes its own ticks (niceScale), so `interval: 0` shows them all: Recharts then skips measuring each
 * tick label in the DOM to decide which ones fit. X-axes pass `interval={tickInterval(…)}` for the same reason.
 */
export const yAxisStyle = {
  axisLine: false,
  tickLine: false,
  tick,
  width: 44,
  tickMargin: 6,
  interval: 0,
} as const

/** Plot width one short date label needs on an x-axis: "Oct 12" at 11 px (~32 px) plus the 18 px tick gap. */
export const X_LABEL_PX = 52
/** Plot width a day-of-month label ("26") needs: ~12 px plus the gap. */
export const DAY_LABEL_PX = 26

/**
 * Recharts `interval` for an x-axis with `count` candidate ticks (every category, or a time axis's explicit ticks):
 * a label on every (interval + 1)-th tick from the first, so at most one label sits in each `labelPx` of plot.
 * fit = max(1, ⌊(plotWidth − y-axis width) / labelPx⌋), interval = max(0, ⌈count / fit⌉ − 1).
 * A number here means Recharts never measures tick text to thin the labels itself.
 */
export function tickInterval(
  count: number,
  plotWidth: number,
  yAxisWidth: number = yAxisStyle.width,
  labelPx: number = X_LABEL_PX,
): number {
  const fit = Math.max(1, Math.floor((plotWidth - yAxisWidth) / labelPx))
  return Math.max(0, Math.ceil(count / fit) - 1)
}

/** Most bars a per-day chart labels with the bare day of the month (2a: "26 27 … 1 2"); longer spans get "Oct 12". */
export const DAY_NUMBER_MAX = 16

/** X tick text for a per-day category axis of `count` days: the day of the month for short spans, else "Oct 12". */
export function dayTick(count: number): (date: string) => string {
  return count <= DAY_NUMBER_MAX ? (d) => String(Number(d.slice(8, 10))) : (d) => formatShortDate(d)
}

/** Horizontal-only gridlines (`tokens.chart.grid`). */
export const gridStyle = { stroke: tokens.chart.grid, vertical: false } as const
/** A dashed target line, 1.5 px; grey unless the target belongs to one series (e.g. the protein target). */
export function targetLine(color: string = tokens.chart.target) {
  return {
    stroke: color,
    strokeDasharray: tokens.chart.targetDash,
    strokeWidth: 1.5,
    ifOverflow: 'extendDomain',
  } as const
}
export const targetStyle = targetLine()
export const lineStyle = {
  strokeWidth: tokens.chart.lineWidth,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  type: 'monotone',
} as const
/** The hero trend line (1d: 3 px). */
export const TREND_WIDTH = tokens.chart.lineWidth
/** The forecast's mid line: dashed "5 5", 1.5 px. */
export const FORECAST_WIDTH = 1.5
/** Widest bar, px: a day bar in a 12-day chart (2a draws them ~36 px wide with a 6–8 px gap). */
export const BAR_MAX = 40
/** Widest bar in a per-week chart (1d: up to 120 px, two to four weeks across a card). */
export const WEEK_BAR_MAX = 120
/** 1d's wide bar (a week of loss, a week of volume): 14 px rounded top, 6 px rounded foot. */
export const WEEK_BAR_RADIUS = { top: 14, foot: 6 } as const
/** Top corners rounded (2a radius 3–4), baseline square. */
export const BAR_RADIUS: [number, number, number, number] = [
  tokens.chart.barRadius,
  tokens.chart.barRadius,
  0,
  0,
]
export const barCursor = { fill: tokens.chart.grid, radius: tokens.chart.barRadius * 2 } as const
export const lineCursor = { stroke: tokens.ink.border, strokeWidth: 1 } as const
/**
 * Two "#rrggbb" token colours mixed per channel, as an opaque hex: mix(a, b, t) = round(a + (b − a) × t), t in 0–1
 * (0 = a, 1 = b). A step between a ramp's two ends, or a colour laid over the card (`tintOnCard`).
 */
export function mix(a: string, b: string, t: number): string {
  const parse = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const from = parse(a)
  const to = parse(b)
  return `#${from
    .map((c, i) =>
      Math.round(c + (to[i]! - c) * t)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

/**
 * `color` at `alpha` over the card, as an opaque hex: 2a's lighter steps of a metric (a meal stack's lunch and dinner,
 * a day under target) without gridlines showing through the bar, and legible as a tooltip key on the dark tooltip.
 * tintOnCard(c, alpha) = mix(card, c, alpha): each channel round(card + (c − card) × alpha).
 */
export function tintOnCard(color: string, alpha: number): string {
  return mix(tokens.ink.card, color, alpha)
}

/**
 * A day under its target is drawn in the metric's lighter step (2a's on-target / off-target bars). 68 % keeps the
 * lighter bar at ≈ 3:1 on white for every metric (WCAG 1.4.11) — 2a's mini-bar tints (16–25 %) would leave a bar's
 * height unreadable in a full-size chart.
 */
export const UNDER_TARGET_ALPHA = 0.68

/** Filled dot with a 2 px surface ring, r ≥ 4 (a hovered point, a bedtime). */
export function dotStyle(color: string, r = 4) {
  return { r, fill: color, stroke: tokens.ink.card, strokeWidth: 2 } as const
}
/**
 * 1d's measurement dot: white with a 2 px ring (9 px across at r = 3.5). The weigh-ins ring in faint lilac; a line's
 * points ring in the line's colour. `small` (dense series, < 10 px between points) shrinks it to 5 px.
 */
export function ringDot(color: string = tokens.chart.dotRing, small = false) {
  return small
    ? ({ r: 2, fill: tokens.ink.card, stroke: color, strokeWidth: 1 } as const)
    : ({ r: 3.5, fill: tokens.ink.card, stroke: color, strokeWidth: 2 } as const)
}

interface DotShapeProps {
  cx?: number
  cy?: number
}

/**
 * 1d's current point, as a Recharts `shape` / `dot` renderer. `color` given: a 12 px dot in that colour with a 2 px
 * white ring inside a 4 px halo of the colour at 25 % (the strength line's latest session). No colour: "you are here" —
 * a 14 px white dot in a 4 px gold halo at 70 % (the weight trend's latest day, the Dashboard sparkline).
 */
export function currentPoint(color?: string) {
  return function CurrentPoint({ cx, cy }: DotShapeProps) {
    if (cx === undefined || cy === undefined || !Number.isFinite(cx) || !Number.isFinite(cy)) return <g />
    if (!color)
      return (
        <g data-chart="current-point">
          <circle cx={cx} cy={cy} r={9} fill={withAlpha(tokens.summit.gold.main, 0.7)} />
          <circle cx={cx} cy={cy} r={7} fill={tokens.ink.card} />
        </g>
      )
    // A series colour may already carry an alpha (`withAlpha(…, .6)`): the halo is the opaque colour at 25 %.
    const halo = withAlpha(color.length === 9 ? color.slice(0, 7) : color, 0.25)
    return (
      <g data-chart="current-point">
        <circle cx={cx} cy={cy} r={10} fill={halo} />
        <circle cx={cx} cy={cy} r={6} fill={color} stroke={tokens.ink.card} strokeWidth={2} />
      </g>
    )
  }
}

/**
 * A metric's ramp as a vertical SVG gradient (README §2 "Metric ramps": a bar is `from` at its foot and `to` at its
 * top), or any two token colours. Put the returned <linearGradient> inside a chart's <defs> and fill with `url(#id)`.
 */
export function rampGradient(id: string, ramp: MetricKey | { from: string; to: string }) {
  const r = typeof ramp === 'string' ? metricRamp(ramp) : ramp
  return (
    <linearGradient key={id} id={id} x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stopColor={r.from} />
      <stop offset="1" stopColor={r.to} />
    </linearGradient>
  )
}

/**
 * The dashed gold plan line (the base camp → summit line, a week's expected loss): `tokens.chart.plan` on white (the
 * README gold deepened to 3:1), 2 px, dashes 6 / 8.
 */
export const planLine = {
  stroke: tokens.chart.plan,
  strokeWidth: 2,
  strokeDasharray: tokens.chart.planDash,
} as const

/**
 * Path for 1d's wide bar: `top` px corners at its data end and `foot` px at the baseline. `up` = the bar grows upward
 * from its baseline. Radii shrink to fit a short or narrow bar.
 */
export function wideBarPath(
  x: number,
  y: number,
  w: number,
  h: number,
  up: boolean,
  top: number = WEEK_BAR_RADIUS.top,
  foot: number = WEEK_BAR_RADIUS.foot,
) {
  const yTop = Math.min(y, y + h)
  const height = Math.abs(h)
  if (height === 0 || w <= 0) return ''
  const rt = Math.max(0, Math.min(top, w / 2, height / 2))
  const rf = Math.max(0, Math.min(foot, w / 2, height - rt))
  // Corner radii at the visual top (a) and bottom (b) edges.
  const a = up ? rt : rf
  const b = up ? rf : rt
  const yb = yTop + height
  return `M${x},${yTop + a}Q${x},${yTop} ${x + a},${yTop}H${x + w - a}Q${x + w},${yTop} ${x + w},${yTop + a}V${yb - b}Q${x + w},${yb} ${x + w - b},${yb}H${x + b}Q${x},${yb} ${x},${yb - b}Z`
}

/**
 * The 2a area fill under a line: `color` fading from `tokens.chart.areaOpacity` (+2 points at the top, 2a's 16–18 %)
 * to 0 at the baseline. `id` comes from useFadeId(); put the returned <defs> first inside the chart and fill the
 * <Area> with `url(#id)`.
 */
export function fadeDefs(id: string, color: string) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={color} stopOpacity={tokens.chart.areaOpacity + 0.02} />
        <stop offset="1" stopColor={color} stopOpacity={0} />
      </linearGradient>
    </defs>
  )
}

/** A gradient id unique to this chart instance, safe inside `url(#…)` (React's ids carry punctuation). */
export function useFadeId(prefix = 'fade'): string {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
}

/** Any row with a date; a series reads its `key` field from it. */
export interface DayRow {
  date: string
}

export const field = (r: DayRow, key: string): unknown => (r as unknown as Record<string, unknown>)[key]
export const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

// ---------------------------------------------------------------------------------------------------------------

/**
 * Accessible text for a Recharts surface. With the accessibility layer on, the SVG is a keyboard stop (arrow keys move
 * the tooltip), so it needs a name: <title> is the chart's label and <desc> a one-line summary — without them a screen
 * reader names the chart by its axis numbers.
 */
export function surfaceText(label: string, summary: string): { title: string; desc: string } {
  return { title: label, desc: summary }
}

/** "Sep 8 to Oct 5" (or one date) for a series' first and last date; dates are "YYYY-MM-DD". */
export function dateSpan(dates: readonly string[]): string {
  const first = dates[0]
  const last = dates.at(-1)
  if (!first || !last) return ''
  return first === last ? formatShortDate(first) : `${formatShortDate(first)} to ${formatShortDate(last)}`
}

/**
 * One-line summary of a dated series for a chart's <desc>, e.g. "Sep 8 to Oct 5: latest 92.1 kg, lowest 91.8 kg,
 * highest 98.2 kg." Points without a value are skipped; no values at all reads "no values yet".
 */
export function seriesSummary(
  points: readonly { date: string; value: number | null | undefined }[],
  format: (v: number) => string,
): string {
  const have = points.filter(
    (p): p is { date: string; value: number } => typeof p.value === 'number' && Number.isFinite(p.value),
  )
  const span = dateSpan(points.map((p) => p.date))
  if (have.length === 0) return span ? `${span}: no values yet.` : 'No values yet.'
  const values = have.map((p) => p.value)
  const latest = have.at(-1)!.value
  if (have.length === 1) return `${span}: ${format(latest)}.`
  return `${span}: latest ${format(latest)}, lowest ${format(Math.min(...values))}, highest ${format(Math.max(...values))}.`
}

// ---------------------------------------------------------------------------------------------------------------

/**
 * The frame's top row: the unit caption at the left (over the y ticks) and the legend keys at the right, both 11 px at
 * line-height 1.4. Legend rows wrap 4 px apart; 6 px separate the row from the plot.
 */
const ROW_PX = tokens.font.size.micro * tokens.font.leading.caption
const LEGEND_ROW_GAP_PX = 4
const HEADER_GAP_PX = 6

/**
 * Height of a ChartFrame drawn around a plot of `plot` px:
 * header = max(legendRows × 15.4 + (legendRows − 1) × 4, 15.4 when there is a unit caption), plus 6 under it when
 * either is shown; total = header + plot. Loading skeletons take it, so the chart that replaces them has their height.
 */
export function frameHeight(
  plot: number,
  { legendRows = 1, caption = true }: { legendRows?: number; caption?: boolean } = {},
): number {
  const legend = legendRows > 0 ? legendRows * ROW_PX + (legendRows - 1) * LEGEND_ROW_GAP_PX : 0
  const header = Math.max(legend, caption ? ROW_PX : 0)
  return (header > 0 ? header + HEADER_GAP_PX : 0) + plot
}

/** 2a's draw-in: a line or area is revealed left to right; dots and labels fade in once it has passed. */
const wipe = keyframes`
  from { clip-path: inset(-12px 100% -12px -12px); }
  to { clip-path: inset(-12px -12px -12px -12px); }
`
const appear = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`

/**
 * The draw-in, on screen only: never in print (fixed width — the PDF must not catch a half-drawn line) and never under
 * reduced motion (the rule sits inside `no-preference`, so the global reduced-motion clamp never turns it into a
 * 200 ms wipe). CSS on Recharts' own class names, so a resize mid-draw never leaves a line short of its last point.
 */
function drawIn(width: number | undefined) {
  if (width !== undefined) return {}
  const draw = `${tokens.motion.duration.draw}ms ${tokens.motion.easing.standard} both`
  const after = `${tokens.motion.duration.base}ms ${tokens.motion.easing.standard} ${Math.round(tokens.motion.duration.draw * 0.6)}ms both`
  return {
    '@media (prefers-reduced-motion: no-preference)': {
      '& .recharts-line-curve, & .recharts-area-area, & .recharts-area-curve, & .recharts-reference-line-line':
        {
          animation: `${wipe} ${draw}`,
        },
      '& .recharts-line-dots, & .recharts-reference-dot, & .recharts-label-list, & [data-chart="current-point"]':
        {
          animation: `${appear} ${after}`,
        },
    },
  }
}

/** A plot-sized message slot (no data yet, couldn't load): 1d's dashed empty slot, a radius-18 well inside the card. */
export const plotSlot = {
  ...dashedSurface,
  borderRadius: `${tokens.summit.radius.wellLarge}px`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  px: 4,
  textAlign: 'center',
  color: tokens.ink.muted,
  fontSize: tokens.font.size.small,
} as const

export interface ChartFrameProps {
  testId: string
  /** Read by screen readers, e.g. "Weight trend with forecast". */
  label: string
  legend?: readonly LegendItem[]
  /** Axis unit shown above the y-axis ticks, e.g. "kg". */
  unit?: string
  width?: number
  empty?: boolean
  /** Placeholder height when empty. */
  height: number
  /** Where the legend keys sit: the top row's right end (default) or a row under the plot, packed left (1d cards). */
  legendPlacement?: 'top' | 'bottom'
  children: ReactNode
}

export function ChartFrame({
  testId,
  label,
  legend,
  unit,
  width,
  empty,
  height,
  legendPlacement = 'top',
  children,
}: ChartFrameProps) {
  const below = legendPlacement === 'bottom'
  const hasLegend = !!legend && legend.length > 0
  const legendTop = hasLegend && !below
  const caption = unit && !empty ? unit : null
  return (
    <Box
      data-testid={testId}
      role="figure"
      aria-label={label}
      sx={{
        width: width ?? '100%',
        minWidth: 0,
        fontFamily: tokens.font.family,
        fontVariantNumeric: 'tabular-nums',
        '& .recharts-surface': { overflow: 'visible' },
        // The kit's themed ring on a focused chart (Recharts' keyboard layer), not the browser's black square.
        ...chartFocus,
        ...drawIn(width),
      }}
    >
      {(legendTop || caption) && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 3,
            mb: `${HEADER_GAP_PX}px`,
          }}
        >
          <AxisCaption inline>{caption}</AxisCaption>
          {legendTop && (
            <Box sx={{ minWidth: 0, flex: '0 1 auto' }}>
              <LegendChips items={legend!} dense align="end" />
            </Box>
          )}
        </Box>
      )}
      {empty ? <Box sx={{ ...plotSlot, height }}>No data yet</Box> : children}
      {hasLegend && below && !empty && (
        <Box sx={{ mt: '14px', minWidth: 0 }}>
          <LegendChips items={legend!} dense />
        </Box>
      )}
    </Box>
  )
}

/**
 * The small caption above a panel's y ticks that names its unit, e.g. "kg" or "Bedtime" (11 px, the axis colour).
 * `inline` is the frame's own top-row slot; otherwise it heads a second panel (`first={false}` adds 12 px above).
 */
export function AxisCaption({
  children,
  first = true,
  inline = false,
}: {
  children: ReactNode
  first?: boolean
  inline?: boolean
}) {
  return (
    <Box
      sx={{
        flex: inline ? 'none' : undefined,
        fontSize: tokens.chart.axisFontSize,
        fontWeight: tokens.font.weight.label,
        color: tokens.chart.axis,
        mt: inline || first ? 0 : 3,
        mb: inline ? 0 : `${HEADER_GAP_PX}px`,
        lineHeight: tokens.font.leading.caption,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </Box>
  )
}

// ---------------------------------------------------------------------------------------------------------------

export interface TipLine<Row> {
  label: string
  color: string
  /** `dashed` for targets; default solid. */
  dashed?: boolean
  value: (row: Row) => string | null | undefined
}

interface TipProps {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: unknown }>
}

const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/g

/** Every ISO date in `text` made readable: "2026-10-07" → "Oct 7", with ", 2027" outside the current year. */
export function readableDates(text: string): string {
  const year = new Date().getFullYear()
  return text.replace(ISO_DATE, (d, y: string) =>
    Number(y) === year ? formatShortDate(d) : `${formatShortDate(d)}, ${y}`,
  )
}

/**
 * A key colour as the deep-ink tooltip can show it: a mark darker than ~10 % relative luminance (the ink target line,
 * the volume stack's deep step) would vanish on it, so it is drawn in the tooltip's own white instead.
 * L = 0.2126 R + 0.7152 G + 0.0722 B over the linearised sRGB channels.
 */
function onTooltip(color: string): string {
  if (!/^#[0-9a-fA-F]{6}/.test(color)) return color
  const lin = (i: number) => {
    const c = parseInt(color.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5)
  return luminance < 0.1 ? tokens.chart.tooltip.text : color
}

/**
 * A tooltip key: an 8 × 8 radius-2 square, or a short dashed stroke for a target. On the deep-ink tooltip a dark key
 * (the volume stack's deep ink, a total in ink) would vanish, so every square carries a faint white ring.
 */
function TipKey({ color: given, dashed }: { color: string; dashed?: boolean }) {
  const color = onTooltip(given)
  return dashed ? (
    <Box aria-hidden sx={{ width: 10, height: 0, borderTop: `1.5px dashed ${color}`, flex: 'none' }} />
  ) : (
    <Box
      aria-hidden
      sx={{
        width: 8,
        height: 8,
        borderRadius: `${tokens.radius.bar}px`,
        bgcolor: color,
        boxShadow: `0 0 0 1px ${tokens.summit.glass.tileBorder}`,
        flex: 'none',
      }}
    />
  )
}

/**
 * Tooltip content (1d): a deep-ink `tokens.chart.tooltip` card, 12/500, radius 14, padding 8 × 12, the tooltip shadow;
 * the title (dates as "Oct 7") in white at 65 %, then one entry per series — key, name, value in 600. Two entries sit
 * side by side, more stack.
 */
export function tooltip<Row>(title: (row: Row) => string, lines: readonly TipLine<Row>[]) {
  return function ChartTip({ active, payload }: TipProps) {
    const row = active ? (payload?.[0]?.payload as Row | undefined) : undefined
    if (!row) return null
    const shown = lines.flatMap((l) => {
      const v = l.value(row)
      return v === null || v === undefined ? [] : [{ ...l, v }]
    })
    const stacked = shown.length > 2
    return (
      <Box
        sx={{
          bgcolor: tokens.chart.tooltip.bg,
          color: tokens.chart.tooltip.text,
          borderRadius: `${tokens.summit.radius.wellSmall}px`,
          boxShadow: tokens.elevation.tooltip,
          px: '12px',
          py: '8px',
          fontFamily: tokens.font.family,
          fontWeight: tokens.font.weight.body,
          fontSize: tokens.font.size.caption,
          lineHeight: tokens.font.leading.caption,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      >
        <Box sx={{ color: tokens.chart.tooltip.muted }}>{readableDates(title(row))}</Box>
        {shown.length > 0 && (
          <Box
            sx={{
              mt: '2px',
              display: 'flex',
              flexDirection: stacked ? 'column' : 'row',
              columnGap: '10px',
              rowGap: '2px',
            }}
          >
            {shown.map((l) => (
              <Box
                key={l.label}
                component="span"
                sx={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              >
                <TipKey color={l.color} dashed={l.dashed} />
                <span>{l.label}</span>
                <Box
                  component="b"
                  sx={{
                    fontWeight: tokens.font.weight.heading,
                    ml: stacked ? 'auto' : 0,
                    pl: stacked ? 2 : 0,
                  }}
                >
                  {l.v}
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    )
  }
}

// ---------------------------------------------------------------------------------------------------------------

/** Width of an element, tracked with ResizeObserver; `fixed` wins (print). Used by the custom-SVG charts. */
export function useWidth(
  fixed: number | undefined,
  fallback = 358,
): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null)
  const [measured, setMeasured] = useState<number | null>(null)
  useLayoutEffect(() => {
    if (fixed !== undefined) return
    const el = ref.current
    if (!el) return
    setMeasured(el.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setMeasured(Math.round(entry.contentRect.width))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [fixed])
  return [ref, fixed ?? measured ?? fallback]
}

/** Path for a bar with its data end rounded (`r`, default the 2a bar radius) and the baseline end square. `up` = value ≥ 0. */
export function dataEndBarPath(
  x: number,
  y: number,
  w: number,
  h: number,
  up: boolean,
  r: number = tokens.chart.barRadius,
) {
  const top = Math.min(y, y + h)
  const height = Math.abs(h)
  const rr = Math.max(0, Math.min(r, w / 2, height))
  if (height === 0 || w <= 0) return ''
  if (up) {
    return `M${x},${top + height}V${top + rr}Q${x},${top} ${x + rr},${top}H${x + w - rr}Q${x + w},${top} ${x + w},${top + rr}V${top + height}Z`
  }
  const bottom = top + height
  return `M${x},${top}V${bottom - rr}Q${x},${bottom} ${x + rr},${bottom}H${x + w - rr}Q${x + w},${bottom} ${x + w},${bottom - rr}V${top}Z`
}

/**
 * How many y steps a plot of `height` px has room for: one per ~26 px of plot (11 px labels with air between them),
 * at least 2 and at most `max` — so a 72 px print panel gets 0 / 5K / 10K instead of five labels on top of each other.
 * count = clamp(⌊(height − 24) / 26⌋, 2, max).
 */
export function tickCount(height: number, max = 4): number {
  return Math.max(2, Math.min(max, Math.floor((height - 24) / 26)))
}

/**
 * Clean y-axis ticks (steps of 1, 2, 2.5 or 5 × 10ⁿ) covering the values, e.g. 64.2…96.8 → 60, 70, 80, 90, 100.
 * `zero` forces the axis to start at 0 (bars). `minStep` keeps every step a multiple of it (10^−decimals when ticks are
 * printed with that many decimals), so a narrow range never prints the same label twice (100.2…100.8 → 100, 101).
 */
export function niceScale(
  values: readonly number[],
  { count = 4, zero = false, minStep }: { count?: number; zero?: boolean; minStep?: number } = {},
) {
  const finite = values.filter((v) => Number.isFinite(v))
  let lo = finite.length ? Math.min(...finite) : 0
  let hi = finite.length ? Math.max(...finite) : 1
  if (zero) {
    lo = Math.min(0, lo)
    hi = Math.max(0, hi)
  }
  if (hi === lo) hi = lo + 1
  const raw = (hi - lo) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const fits = (s: number) => !minStep || Math.abs(s / minStep - Math.round(s / minStep)) < 1e-9
  const nice = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw && fits(s)) ?? 10 * mag
  const step = minStep ? Math.max(minStep, nice) : nice
  const start = Math.floor(lo / step) * step
  const end = Math.ceil(hi / step) * step
  const ticks: number[] = []
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Number(v.toFixed(6)))
  return { domain: [start, end] as [number, number], ticks }
}

/** The 12 px muted line under a custom-SVG chart (1d caption): what was tapped, or a summary when nothing is. */
export function TapCaption({ children }: { children: ReactNode }) {
  return (
    <Box
      aria-live="polite"
      sx={{
        mt: 2,
        minHeight: 18,
        fontSize: tokens.font.size.caption,
        color: tokens.ink.muted,
        lineHeight: 1.5,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {children}
    </Box>
  )
}
