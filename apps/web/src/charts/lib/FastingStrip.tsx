// Owns: the fasting calendar strip (custom SVG): one row per month, one slot per day, fasts marked as completed,
// partial, planned or missed; tap a fast for its date, status and real duration.
import Box from '@mui/material/Box'
import { useState } from 'react'
import { dateToTime, formatMonth, formatNumber, type LegendItem } from '../../components'
import { tokens, withAlpha } from '../../theme'
import { ChartFrame, TapCaption, useWidth } from './frame'

export type FastStatus = 'completed' | 'partial' | 'planned' | 'missed'

export interface FastEntry {
  /** Local date the fast started. */
  date: string
  status: FastStatus
  /** Real duration, hours (completed / partial). */
  hours?: number | null
}

export interface FastingStripProps {
  fasts: readonly FastEntry[]
  /** First and last local dates shown; whole months are drawn. */
  from: string
  to: string
  width?: number
  legend?: boolean
}

const LABEL_W = 30
const GAP = 2
const ROW_H = 22
const ROW_GAP = 8
const STATUS_TEXT: Record<FastStatus, string> = {
  completed: 'Completed',
  partial: 'Partial',
  planned: 'Planned',
  missed: 'Missed',
}

export function FastingStrip({ fasts, from, to, width, legend = true }: FastingStripProps) {
  const [ref, w] = useWidth(width)
  const [selected, setSelected] = useState<string | null>(null)
  const C = tokens.metric.fasting
  const byDate = new Map(fasts.map((f) => [f.date.slice(0, 10), f]))
  const cellW = Math.max(4, (w - LABEL_W - GAP * 30) / 31)

  const start = new Date(dateToTime(from))
  const end = new Date(dateToTime(to))
  const months: { y: number; m: number }[] = []
  for (
    let y = start.getUTCFullYear(), m = start.getUTCMonth();
    y < end.getUTCFullYear() || (y === end.getUTCFullYear() && m <= end.getUTCMonth());
  ) {
    months.push({ y, m })
    m++
    if (m > 11) {
      m = 0
      y++
    }
  }
  const svgH = months.length * (ROW_H + ROW_GAP) + 14
  const svgW = LABEL_W + 31 * cellW + 30 * GAP

  const counts = (['completed', 'partial', 'planned', 'missed'] as const)
    .map((s) => [s, fasts.filter((f) => f.status === s).length] as const)
    .filter(([, n]) => n > 0)
  const summary =
    counts.map(([s, n]) => `${n} ${STATUS_TEXT[s].toLowerCase()}`).join(' · ') || 'No fasts planned'
  const pick = selected ? byDate.get(selected) : undefined

  const items: LegendItem[] = [
    { label: 'Completed', color: C },
    { label: 'Partial', color: withAlpha(C, 0.45) },
    { label: 'Planned', color: C, mark: 'ring' },
  ]
  if (fasts.some((f) => f.status === 'missed'))
    items.push({ label: 'Missed', color: tokens.chart.target, mark: 'ring' })

  return (
    <ChartFrame
      testId="chart-fasting"
      label="Fasting calendar"
      legend={legend ? items : undefined}
      width={width}
      height={svgH}
      empty={false}
    >
      <Box ref={ref} sx={{ width: '100%' }}>
        <svg
          width={svgW}
          height={svgH}
          role="img"
          aria-label={`Fasting: ${summary}`}
          style={{ display: 'block' }}
        >
          {months.map(({ y, m }, row) => {
            const top = row * (ROW_H + ROW_GAP)
            const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
            return (
              <g key={`${y}-${m}`}>
                <text x={0} y={top + ROW_H / 2 + 4} fontSize={12} fill={tokens.chart.axis}>
                  {formatMonth(Date.UTC(y, m, 1))}
                </text>
                {Array.from({ length: daysInMonth }, (_, d) => {
                  const date = `${y}-${String(m + 1).padStart(2, '0')}-${String(d + 1).padStart(2, '0')}`
                  const f = byDate.get(date)
                  const x = LABEL_W + d * (cellW + GAP)
                  const isSel = date === selected
                  let fill: string = tokens.chart.grid
                  let stroke = 'none'
                  let dash: string | undefined
                  if (f?.status === 'completed') fill = C
                  else if (f?.status === 'partial') fill = withAlpha(C, 0.45)
                  else if (f?.status === 'planned') {
                    fill = tokens.ink.card
                    stroke = C
                  } else if (f?.status === 'missed') {
                    stroke = tokens.chart.target
                    dash = '2 2'
                  }
                  if (isSel) stroke = tokens.ink.text
                  return (
                    <rect
                      key={date}
                      x={x + 0.75}
                      y={top + 0.75}
                      width={cellW - 1.5}
                      height={ROW_H - 1.5}
                      rx={Math.min(3, cellW / 3)}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={1.5}
                      strokeDasharray={dash}
                      style={f ? { cursor: 'pointer' } : undefined}
                      onClick={f ? () => setSelected(isSel ? null : date) : undefined}
                    >
                      {f && (
                        <title>{`${date}: ${STATUS_TEXT[f.status]}${f.hours ? `, ${formatNumber(f.hours, 1)} h` : ''}`}</title>
                      )}
                    </rect>
                  )
                })}
              </g>
            )
          })}
          {[1, 8, 15, 22, 29].map((d) => (
            <text
              key={d}
              x={LABEL_W + (d - 1) * (cellW + GAP) + cellW / 2}
              y={svgH - 2}
              fontSize={10}
              textAnchor="middle"
              fill={tokens.chart.axis}
            >
              {d}
            </text>
          ))}
        </svg>
      </Box>
      <TapCaption>
        {pick
          ? `${selected} · ${STATUS_TEXT[pick.status]}${pick.hours ? ` · ${formatNumber(pick.hours, 1)} h` : ''}`
          : summary}
      </TapCaption>
    </ChartFrame>
  )
}
