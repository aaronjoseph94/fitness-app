// Owns: the milestone timeline (custom SVG): milestones evenly spaced on a line, reached ones filled in the metric
// colour with a white check and their date, the next one ringed (2a: a 2 px ring with a dot in it) with its forecast
// date, later ones as light grey rings; tap one for the full date.
// A label wider than the room at either end is anchored to that edge instead of centred, so it is never clipped; when
// labels are wider than the gap between milestones (six composition goals on a phone) they alternate between two rows.
// Screen readers get one image whose name lists every milestone with its date (tapping only shows the full date).
import Box from '@mui/material/Box'
import { useState } from 'react'
import { formatShortDate } from '../../components'
import { tokens, type MetricKey } from '../../theme'
import { ChartFrame, TapCaption, readableDates, useWidth } from './frame'

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
/** Geist's average glyph width as a share of the font size (labels are short: digits, units, a few letters). */
const GLYPH = 0.58

/** Centre `text` on `x` unless it would cross 0 or `width`; then pin it to that edge. */
function placeText(
  x: number,
  text: string,
  fontSize: number,
  width: number,
): { x: number; textAnchor: 'start' | 'middle' | 'end' } {
  const half = (text.length * fontSize * GLYPH) / 2
  if (x - half < 0) return { x: 0, textAnchor: 'start' }
  if (x + half > width) return { x: width, textAnchor: 'end' }
  return { x, textAnchor: 'middle' }
}

export function MilestoneTimeline({ milestones, metric = 'weight', width }: MilestoneTimelineProps) {
  const [ref, w] = useWidth(width)
  const [selected, setSelected] = useState<number | null>(null)
  const C = tokens.metric[metric]
  const n = milestones.length
  const xs = milestones.map((_, i) => (n === 1 ? w / 2 : PAD + (i * (w - 2 * PAD)) / (n - 1)))
  const gap = n > 1 ? (w - 2 * PAD) / (n - 1) : w
  const stagger = milestones.some((m) => m.label.length * 12 * GLYPH + 6 > gap)
  const labelY = (i: number) => (!stagger ? 20 : i % 2 === 0 ? 11 : 27)
  const lastReached = milestones.reduce((acc, m, i) => (m.reachedOn ? i : acc), -1)
  const next = lastReached + 1 < n ? lastReached + 1 : -1
  const pick = selected === null ? null : milestones[selected]
  const reachedCount = lastReached + 1
  const summary =
    next === -1
      ? 'Every milestone reached'
      : readableDates(
          `${reachedCount} of ${n} reached · next ${milestones[next]!.label}${milestones[next]!.expectedOn ? ` around ${milestones[next]!.expectedOn}` : ''}`,
        )
  const spoken = milestones
    .map(
      (m) =>
        `${m.label} ${m.reachedOn ? `reached ${formatShortDate(m.reachedOn)}` : m.expectedOn ? `forecast around ${formatShortDate(m.expectedOn)}` : 'not yet forecast'}`,
    )
    .join('; ')

  return (
    <ChartFrame testId="chart-milestones" label="Milestone timeline" width={width} height={H} empty={n === 0}>
      <Box ref={ref} sx={{ width: '100%' }}>
        <svg
          width={w}
          height={H}
          role="img"
          aria-label={`Milestones: ${reachedCount} of ${n} reached. ${spoken}.`}
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
            const dateText = date ? `${reached ? '' : '~'}${formatShortDate(date)}` : '—'
            return (
              <g
                key={m.label}
                onClick={() => setSelected(selected === i ? null : i)}
                style={{ cursor: 'pointer' }}
              >
                <rect x={x - 22} y={0} width={44} height={H} fill="transparent" />
                <text
                  {...placeText(x, m.label, 12, w)}
                  y={labelY(i)}
                  fontSize={tokens.font.size.caption}
                  fontWeight={reached || isNext ? tokens.font.weight.heading : tokens.font.weight.label}
                  fill={reached || isNext ? tokens.ink.text : tokens.ink.label}
                >
                  {m.label}
                </text>
                {reached ? (
                  <>
                    <circle cx={x} cy={LINE_Y} r={9} fill={C} stroke={tokens.ink.card} strokeWidth={2} />
                    <path
                      d={`M${x - 3.5} ${LINE_Y}l2.5 2.5 4.5-5`}
                      fill="none"
                      stroke={tokens.ink.card}
                      strokeWidth={1.8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </>
                ) : isNext ? (
                  <>
                    <circle cx={x} cy={LINE_Y} r={8} fill={tokens.ink.card} stroke={C} strokeWidth={2} />
                    <circle cx={x} cy={LINE_Y} r={3} fill={C} />
                  </>
                ) : (
                  <circle
                    cx={x}
                    cy={LINE_Y}
                    r={7.25}
                    fill={tokens.ink.card}
                    stroke={tokens.ink.disabled}
                    strokeWidth={1.5}
                  />
                )}
                {selected === i && (
                  <circle
                    cx={x}
                    cy={LINE_Y}
                    r={13}
                    fill="none"
                    stroke={tokens.accent.main}
                    strokeWidth={1.5}
                  />
                )}
                <text
                  {...placeText(x, dateText, tokens.chart.axisFontSize, w)}
                  y={70}
                  fontSize={tokens.chart.axisFontSize}
                  fill={reached ? tokens.ink.text : tokens.ink.muted}
                >
                  {dateText}
                </text>
              </g>
            )
          })}
        </svg>
      </Box>
      <TapCaption>
        {pick
          ? readableDates(
              `${pick.label} · ${pick.reachedOn ? `reached ${pick.reachedOn}` : pick.expectedOn ? `forecast ${pick.expectedOn}` : 'not yet forecast'}`,
            )
          : summary}
      </TapCaption>
    </ChartFrame>
  )
}
