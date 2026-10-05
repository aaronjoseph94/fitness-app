// Owns: the calendar heatmap (custom SVG; Recharts has none) used for protein adherence and logging adherence:
// one column per Monday-start week, one row per weekday, cells tinted by value in one metric colour, tap for the day.
import Box from '@mui/material/Box'
import { useState } from 'react'
import { dateToTime, formatMonth, formatNumber, timeToDate, type LegendItem } from '../../components'
import { tokens, withAlpha, type MetricKey } from '../../theme'
import { ChartFrame, TapCaption, useWidth } from './frame'
import { DAY } from './time'

export interface HeatmapDay {
  date: string
  /** 0–1 (share of target or adherence score). `null` = no data / not applicable (e.g. a fast day). */
  value: number | null
}

export interface CalendarHeatmapProps {
  days: readonly HeatmapDay[]
  metric: MetricKey
  /** `binary`: at/above target (value ≥ 1) vs below. `scale`: four steps by quarter. Default `scale`. */
  mode?: 'binary' | 'scale'
  /** Accessible name, e.g. "Protein adherence". */
  label: string
  /** Default "chart-calendar-heatmap". */
  testId?: string
  /** Text for a tapped day's value. Default: "At target"/"Below target" or a percentage. */
  describe?: (value: number | null) => string
  width?: number
  legend?: boolean
}

const LEFT = 18
const TOP = 16
const MAX_CELL = 22
const WEEKDAYS = ['M', '', 'W', '', 'F', '', 'S']

function mondayOnOrBefore(t: number): number {
  const dow = (new Date(t).getUTCDay() + 6) % 7 // 0 = Monday
  return t - dow * DAY
}

export function CalendarHeatmap({
  days,
  metric,
  mode = 'scale',
  label,
  testId = 'chart-calendar-heatmap',
  describe,
  width,
  legend = true,
}: CalendarHeatmapProps) {
  const [ref, w] = useWidth(width)
  const [selected, setSelected] = useState<string | null>(null)
  const color = tokens.metric[metric]
  const byDate = new Map(days.map((d) => [d.date.slice(0, 10), d.value]))
  const times = days.map((d) => dateToTime(d.date))
  const first = times.length ? Math.min(...times) : 0
  const last = times.length ? Math.max(...times) : 0
  const start = mondayOnOrBefore(first)
  const weeks = times.length ? Math.floor((last - start) / DAY / 7) + 1 : 0
  // Cells shrink to fit the width (never a horizontal scroll); below 10 px the gaps tighten to 1 px.
  const fit = (gap: number) => Math.floor((w - LEFT - gap * (weeks - 1)) / Math.max(weeks, 1))
  const gap = fit(3) >= 10 ? 3 : 1
  const cell = Math.max(2, Math.min(MAX_CELL, fit(gap)))
  const svgW = LEFT + weeks * cell + (weeks - 1) * gap
  const svgH = TOP + 7 * cell + 6 * gap

  const fill = (v: number | null | undefined) => {
    if (v === null || v === undefined) return tokens.chart.grid
    if (mode === 'binary') return v >= 1 ? color : withAlpha(color, 0.2)
    if (v >= 0.75) return color
    if (v >= 0.5) return withAlpha(color, 0.7)
    if (v >= 0.25) return withAlpha(color, 0.42)
    return withAlpha(color, 0.2)
  }
  const say =
    describe ??
    ((v: number | null) =>
      v === null
        ? 'No data'
        : mode === 'binary'
          ? v >= 1
            ? 'At target'
            : 'Below target'
          : `${formatNumber(v * 100)} %`)

  const items: LegendItem[] =
    mode === 'binary'
      ? [
          { label: 'Below target', color: withAlpha(color, 0.2) },
          { label: 'At target', color },
          { label: 'No data', color: tokens.chart.grid },
        ]
      : [
          { label: '< 25 %', color: withAlpha(color, 0.2) },
          { label: '25–50 %', color: withAlpha(color, 0.42) },
          { label: '50–75 %', color: withAlpha(color, 0.7) },
          { label: '≥ 75 %', color },
        ]

  const scored = days.filter((d) => d.value !== null)
  const summary =
    mode === 'binary'
      ? `${scored.filter((d) => (d.value ?? 0) >= 1).length} of ${scored.length} days at target`
      : `Average ${formatNumber((scored.reduce((s, d) => s + (d.value ?? 0), 0) / Math.max(1, scored.length)) * 100)} % over ${scored.length} days`

  const cells: { date: string; x: number; y: number; v: number | null | undefined }[] = []
  const months: { x: number; text: string; partial?: boolean }[] = []
  for (let t = start; t <= last; t += DAY) {
    if (t < first) continue
    const i = Math.round((t - start) / DAY)
    const col = Math.floor(i / 7)
    const row = i % 7
    const date = timeToDate(t)
    const x = LEFT + col * (cell + gap)
    cells.push({ date, x, y: TOP + row * (cell + gap), v: byDate.get(date) })
    // Label each month at its first column; a partial first month gives way when the next label is too close.
    if (date.endsWith('-01') || t === first) {
      const prev = months.at(-1)
      if (!prev || x - prev.x > 3 * (cell + gap)) months.push({ x, text: formatMonth(t) })
      else if (prev.partial) months[months.length - 1] = { x, text: formatMonth(t) }
      if (t === first && !date.endsWith('-01')) months[months.length - 1]!.partial = true
    }
  }
  const pick = cells.find((c) => c.date === selected)

  return (
    <ChartFrame
      testId={testId}
      label={label}
      legend={legend ? items : undefined}
      width={width}
      height={svgH}
      empty={days.length === 0}
    >
      <Box ref={ref} sx={{ width: '100%' }}>
        <svg
          width={svgW}
          height={svgH}
          role="img"
          aria-label={`${label}: ${summary}`}
          style={{ display: 'block' }}
        >
          {months.map((m) => (
            <text key={m.x} x={m.x} y={11} fontSize={11} fill={tokens.chart.axis}>
              {m.text}
            </text>
          ))}
          {WEEKDAYS.map((d, i) =>
            d ? (
              <text
                key={i}
                x={0}
                y={TOP + i * (cell + gap) + cell / 2 + 4}
                fontSize={10}
                fill={tokens.chart.axis}
              >
                {d}
              </text>
            ) : null,
          )}
          {cells.map((c) => (
            <rect
              key={c.date}
              x={c.x}
              y={c.y}
              width={cell}
              height={cell}
              rx={Math.min(4, cell / 4)}
              fill={fill(c.v)}
              stroke={c.date === selected ? tokens.ink.text : 'none'}
              strokeWidth={1.5}
              style={{ cursor: 'pointer' }}
              onClick={() => setSelected(c.date === selected ? null : c.date)}
            >
              <title>{`${c.date}: ${say(c.v ?? null)}`}</title>
            </rect>
          ))}
        </svg>
      </Box>
      <TapCaption>{pick ? `${pick.date} · ${say(pick.v ?? null)}` : summary}</TapCaption>
    </ChartFrame>
  )
}
