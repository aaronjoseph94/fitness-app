// Owns: what every chart shares — the frame (testid, legend chips, unit caption, empty placeholder, responsive vs
// fixed print width), axis/grid/target styling from `tokens.chart`, and the tap tooltip (value first, line keys).
import Box from '@mui/material/Box'
import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { LegendChips, type LegendItem } from '../../components'
import { tokens } from '../../theme'

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
 * Bars animate on screen, never in print (fixed width), so the PDF never catches a half-grown bar.
 * Lines and areas never animate: Recharts measures the path length once, so a responsive resize mid-animation
 * leaves the line cut short of its last point.
 */
export function animated(width: number | undefined): boolean {
  return width === undefined
}

export const MARGIN = { top: 8, right: 8, bottom: 0, left: 0 } as const

const tick = { fontSize: tokens.chart.axisFontSize, fill: tokens.chart.axis }

export const xAxisStyle = { axisLine: false, tickLine: false, tick, tickMargin: 8, minTickGap: 18 } as const
export const yAxisStyle = { axisLine: false, tickLine: false, tick, width: 44, tickMargin: 6 } as const
export const gridStyle = { stroke: tokens.chart.grid, vertical: false } as const
export const targetStyle = {
  stroke: tokens.chart.target,
  strokeDasharray: tokens.chart.targetDash,
  strokeWidth: 1.5,
  ifOverflow: 'extendDomain',
} as const
export const lineStyle = {
  strokeWidth: tokens.chart.lineWidth,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  type: 'monotone',
} as const
/** 2 px surface gap between touching bar segments. */
export const barGap = { stroke: tokens.ink.card, strokeWidth: 2 } as const
export const BAR_MAX = 24
export const barCursor = { fill: tokens.chart.grid } as const
export const lineCursor = { stroke: tokens.ink.border, strokeWidth: 1 } as const
/** Dot with a 2 px surface ring, r ≥ 4. */
export function dotStyle(color: string, r = 4) {
  return { r, fill: color, stroke: tokens.ink.card, strokeWidth: 2 } as const
}

/** Any row with a date; a series reads its `key` field from it. */
export interface DayRow {
  date: string
}

export const field = (r: DayRow, key: string): unknown => (r as unknown as Record<string, unknown>)[key]
export const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

// ---------------------------------------------------------------------------------------------------------------

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
  children: ReactNode
}

export function ChartFrame({ testId, label, legend, unit, width, empty, height, children }: ChartFrameProps) {
  return (
    <Box
      data-testid={testId}
      role="figure"
      aria-label={label}
      sx={{
        width: width ?? '100%',
        minWidth: 0,
        fontFamily: tokens.font.family,
        '& .recharts-surface': { overflow: 'visible' },
      }}
    >
      {legend && legend.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <LegendChips items={legend} />
        </Box>
      )}
      {unit && !empty && <AxisCaption>{unit}</AxisCaption>}
      {empty ? (
        <Box
          sx={{
            height,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: `${tokens.radius.control}px`,
            bgcolor: tokens.ink.page,
            color: tokens.ink.secondary,
            fontSize: tokens.font.size.small,
          }}
        >
          No data yet
        </Box>
      ) : (
        children
      )}
    </Box>
  )
}

/** The small caption above a panel's y ticks that names its unit, e.g. "kg" or "Bedtime". */
export function AxisCaption({ children, first = true }: { children: ReactNode; first?: boolean }) {
  return (
    <Box
      sx={{
        fontSize: 11,
        fontWeight: tokens.font.weight.label,
        color: tokens.chart.axis,
        mt: first ? 0 : 3,
        mb: 0.5,
        lineHeight: 1,
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

/** Tooltip content: title from the row, then one line per series (value bold, series name secondary). */
export function tooltip<Row>(title: (row: Row) => string, lines: readonly TipLine<Row>[]) {
  return function ChartTip({ active, payload }: TipProps) {
    const row = active ? (payload?.[0]?.payload as Row | undefined) : undefined
    if (!row) return null
    const shown = lines.flatMap((l) => {
      const v = l.value(row)
      return v === null || v === undefined ? [] : [{ ...l, v }]
    })
    return (
      <Box
        sx={{
          bgcolor: tokens.ink.card,
          border: `1px solid ${tokens.ink.border}`,
          borderRadius: `${tokens.radius.control}px`,
          px: 3,
          py: 2,
          minWidth: 120,
          fontFamily: tokens.font.family,
          pointerEvents: 'none',
        }}
      >
        <Box sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.secondary, mb: shown.length ? 1 : 0 }}>{title(row)}</Box>
        {shown.map((l) => (
          <Box key={l.label} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, lineHeight: 1.6 }}>
            <Box
              aria-hidden
              sx={{
                width: 12,
                height: 0,
                borderTop: `${l.dashed ? 2 : 3}px ${l.dashed ? 'dashed' : 'solid'} ${l.color}`,
                borderRadius: 2,
                flex: 'none',
              }}
            />
            <Box
              component="span"
              sx={{ fontSize: tokens.font.size.small, fontWeight: tokens.font.weight.heading, color: tokens.ink.text }}
            >
              {l.v}
            </Box>
            <Box component="span" sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.secondary }}>
              {l.label}
            </Box>
          </Box>
        ))}
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

/** Path for a bar with its data end rounded (4 px) and the baseline end square. `up` = value ≥ 0. */
export function dataEndBarPath(
  x: number,
  y: number,
  w: number,
  h: number,
  up: boolean,
  r = tokens.chart.barRadius,
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

/** The line under a custom-SVG chart: what was tapped, or a summary when nothing is. */
export function TapCaption({ children }: { children: ReactNode }) {
  return (
    <Box
      aria-live="polite"
      sx={{
        mt: 2,
        minHeight: 20,
        fontSize: tokens.font.size.label,
        color: tokens.ink.secondary,
        lineHeight: 1.5,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {children}
    </Box>
  )
}
