// Owns: the milestone timeline (custom SVG): milestones evenly spaced on a line, reached ones filled in the metric
// colour with their date, the next one ringed with its forecast date, later ones grey; tap one for the full date.
import Box from '@mui/material/Box'
import { useState } from 'react'
import { formatShortDate } from '../../components'
import { tokens, type MetricKey } from '../../theme'
import { ChartFrame, TapCaption, useWidth } from './frame'

export interface Milestone {
  /** e.g. "90 kg" or "BF < 30 %". */
  label: string
  /** Local date reached; null/undefined = not yet. */
  reachedOn?: string | null
  /** Forecast date for an unreached milestone. */
  expectedOn?: string | null
}

export interface MilestoneTimelineProps {
  milestones: readonly Milestone[]
  /** Default `weight`. */
  metric?: MetricKey
  width?: number
}

const H = 86
const LINE_Y = 42
const PAD = 26

export function MilestoneTimeline({ milestones, metric = 'weight', width }: MilestoneTimelineProps) {
  const [ref, w] = useWidth(width)
  const [selected, setSelected] = useState<number | null>(null)
  const C = tokens.metric[metric]
  const n = milestones.length
  const xs = milestones.map((_, i) => (n === 1 ? w / 2 : PAD + (i * (w - 2 * PAD)) / (n - 1)))
  const lastReached = milestones.reduce((acc, m, i) => (m.reachedOn ? i : acc), -1)
  const next = lastReached + 1 < n ? lastReached + 1 : -1
  const pick = selected === null ? null : milestones[selected]
  const reachedCount = lastReached + 1
  const summary =
    next === -1
      ? 'Every milestone reached'
      : `${reachedCount} of ${n} reached · next ${milestones[next]!.label}${milestones[next]!.expectedOn ? ` around ${milestones[next]!.expectedOn}` : ''}`

  return (
    <ChartFrame testId="chart-milestones" label="Milestone timeline" width={width} height={H} empty={n === 0}>
      <Box ref={ref} sx={{ width: '100%' }}>
        <svg
          width={w}
          height={H}
          role="img"
          aria-label={`Milestones: ${summary}`}
          style={{ display: 'block', overflow: 'visible' }}
        >
          <line
            x1={xs[0]}
            x2={xs.at(-1)}
            y1={LINE_Y}
            y2={LINE_Y}
            stroke={tokens.ink.border}
            strokeWidth={2}
            strokeLinecap="round"
          />
          {lastReached > 0 && (
            <line
              x1={xs[0]}
              x2={xs[lastReached]}
              y1={LINE_Y}
              y2={LINE_Y}
              stroke={C}
              strokeWidth={2}
              strokeLinecap="round"
            />
          )}
          {milestones.map((m, i) => {
            const x = xs[i]!
            const reached = !!m.reachedOn
            const isNext = i === next
            const date = m.reachedOn ?? m.expectedOn
            return (
              <g
                key={m.label}
                onClick={() => setSelected(selected === i ? null : i)}
                style={{ cursor: 'pointer' }}
                role="button"
                aria-label={`${m.label}: ${reached ? `reached ${m.reachedOn}` : date ? `forecast ${date}` : 'not yet'}`}
              >
                <rect x={x - 22} y={0} width={44} height={H} fill="transparent" />
                <text
                  x={x}
                  y={20}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={reached || isNext ? 600 : 500}
                  fill={reached || isNext ? tokens.ink.text : tokens.ink.secondary}
                >
                  {m.label}
                </text>
                {reached ? (
                  <>
                    <circle cx={x} cy={LINE_Y} r={8} fill={C} stroke={tokens.ink.card} strokeWidth={2} />
                    <path
                      d={`M${x - 3.5} ${LINE_Y}l2.5 2.5 4.5-5`}
                      fill="none"
                      stroke={tokens.ink.card}
                      strokeWidth={1.8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </>
                ) : (
                  <circle
                    cx={x}
                    cy={LINE_Y}
                    r={isNext ? 7 : 6}
                    fill={tokens.ink.card}
                    stroke={isNext ? C : tokens.ink.border}
                    strokeWidth={isNext ? 2.5 : 2}
                  />
                )}
                {selected === i && (
                  <circle cx={x} cy={LINE_Y} r={12} fill="none" stroke={tokens.ink.text} strokeWidth={1} />
                )}
                <text
                  x={x}
                  y={70}
                  textAnchor="middle"
                  fontSize={11}
                  fill={reached ? tokens.ink.text : tokens.ink.secondary}
                >
                  {date ? `${reached ? '' : '~'}${formatShortDate(date)}` : '—'}
                </text>
              </g>
            )
          })}
        </svg>
      </Box>
      <TapCaption>
        {pick
          ? `${pick.label} · ${pick.reachedOn ? `reached ${pick.reachedOn}` : pick.expectedOn ? `forecast ${pick.expectedOn}` : 'not yet forecast'}`
          : summary}
      </TapCaption>
    </ChartFrame>
  )
}
