// Owns: the 2a stat card (Today's five across, the Dashboard tiles, Progress' summary cards): `padding 18 × 20 × 16`;
// a 13/500 #52525B label with a 16 px #A1A1AA glyph right-aligned; a 28/600 tabular value with its unit
// ("/ 1,400 kcal") in 13 px muted; an optional signed delta at the right of the value (a tinted pill, or plain
// coloured text); an optional 6 px progress bar in the metric colour; a slot for a sparkline (`MiniBars`); and a 12 px
// muted caption whose <strong> is the 500 ink key figure. The value can count up once on mount.
//
// Restyled for 2a (2026-10-07) without changing a prop: `icon` is now the right-aligned glyph rather than a tinted
// tile, `metric` colours the progress fill (the old accent dot is gone — the label names the metric), and a delta that
// is bad for the plan reads in the warning amber 2a uses for a shortfall. New: `progress`, `deltaStyle`, `countUp`.
import type { SvgIconComponent } from '@mui/icons-material'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Card from '@mui/material/Card'
import type { ReactNode } from 'react'
import { tokens, transitionOf, type MetricKey } from '../../theme'
import { formatSigned } from './format'
import { ProgressBar } from './ProgressBar'
import { StatCaption, StatFigure, StatHead } from './statParts'
import { StatusChip } from './StatusChip'

export interface StatDelta {
  value: number
  /** Unit after the number, e.g. "kg". Defaults to the card's unit. */
  unit?: string
  /** What the delta is measured against, e.g. "since start" or "vs last week". */
  period?: string
  /** Which direction is good. `down` for weight, `up` for protein; `neutral` keeps it grey. */
  good: 'up' | 'down' | 'neutral'
}

export interface StatCardProps {
  label: string
  value: number | string | null
  unit?: string
  /** Decimal places for a numeric value. Default 0. */
  precision?: number
  delta?: StatDelta
  /** `pill` (default): a tinted pill right of the value (Progress). `text`: 12/600 coloured text (Dashboard tiles). */
  deltaStyle?: 'pill' | 'text'
  /** The metric this card reports: colours the progress bar. */
  metric?: MetricKey
  /** A 16 px glyph right of the label, in faint ink. Decoration: the label always names the metric. */
  icon?: SvgIconComponent
  /** Value ÷ target, drawn as the 6 px bar under the value. Omit for no bar. */
  progress?: number | null
  /** Anything chart-like under the number, e.g. a <MiniBars/>. */
  sparkline?: ReactNode
  /** The 12 px caption at the bottom, e.g. <><strong>540 left</strong> · 2 meals logged</>. */
  footnote?: ReactNode
  /** Right of the label, e.g. a <PendingBadge/>. */
  badge?: ReactNode
  /** Makes the whole card a tap target. */
  onClick?: () => void
  /** Big-number size. `hero` (40 px) is the one per view. Default `standard` (28 px). */
  emphasis?: 'standard' | 'hero'
  /** Count a numeric value up once on mount (~1.6 s; never under reduced motion). */
  countUp?: boolean
  /** Where the count starts. Default 0. */
  countFrom?: number
  /** ms before the count and the bar start, to follow the card's entrance stagger. */
  delay?: number
  testId?: string
}

/** The delta's tone: good for the plan → success, bad → warning (2a's shortfall amber), flat or neutral → neutral. */
export function deltaTone(delta: StatDelta, precision: number): 'success' | 'warning' | 'neutral' {
  const flat = Math.abs(delta.value) < 10 ** -precision / 2
  if (delta.good === 'neutral' || flat) return 'neutral'
  return delta.value < 0 === (delta.good === 'down') ? 'success' : 'warning'
}

const TEXT_TONES = { success: tokens.tone.success.text, warning: tokens.tone.warning.text, neutral: tokens.ink.label } as const

function Delta({ delta, fallbackUnit, precision, style }: { delta: StatDelta; fallbackUnit?: string; precision: number; style: 'pill' | 'text' }) {
  const unit = delta.unit ?? fallbackUnit
  const text = [formatSigned(delta.value, precision), unit, delta.period].filter(Boolean).join(' ')
  const tone = deltaTone(delta, precision)
  if (style === 'pill') return <StatusChip tone={tone} shape="pill" label={text} />
  return (
    <Box component="span" sx={{ fontSize: tokens.font.size.caption, fontWeight: tokens.font.weight.heading, color: TEXT_TONES[tone], whiteSpace: 'nowrap' }}>
      {text}
    </Box>
  )
}

export function StatCard({
  label,
  value,
  unit,
  precision = 0,
  delta,
  deltaStyle = 'pill',
  metric,
  icon,
  progress,
  sparkline,
  footnote,
  badge,
  onClick,
  emphasis = 'standard',
  countUp = false,
  countFrom,
  delay = 0,
  testId,
}: StatCardProps) {
  const body = (
    <Box sx={{ px: `${tokens.pad.card.x}px`, pt: `${tokens.pad.card.y}px`, pb: '16px', width: '100%', textAlign: 'left', minWidth: 0 }}>
      <StatHead label={label} icon={icon} badge={badge} />
      <StatFigure
        value={value}
        unit={unit}
        precision={precision}
        hero={emphasis === 'hero'}
        countUp={countUp}
        countFrom={countFrom}
        delay={delay}
        trailing={delta && <Delta delta={delta} fallbackUnit={unit} precision={precision} style={deltaStyle} />}
      />
      {progress !== undefined && progress !== null && (
        <Box sx={{ mt: '12px' }}>
          <ProgressBar value={progress} metric={metric} label={`${label} against target`} delay={delay} />
        </Box>
      )}
      {sparkline && <Box sx={{ mt: '12px' }}>{sparkline}</Box>}
      {footnote && <StatCaption>{footnote}</StatCaption>}
    </Box>
  )

  return (
    <Card
      data-testid={testId}
      sx={{
        height: '100%',
        display: 'flex',
        ...(onClick && {
          // 2a: a card's border never changes on hover; a clickable one deepens its whisper of shadow.
          '@media (hover: hover)': { '&:hover': { boxShadow: tokens.elevation.raised } },
          '&:active': { transform: 'scale(0.99)' },
          '@media (prefers-reduced-motion: reduce)': { '&:active': { transform: 'none' } },
          transition: transitionOf(['box-shadow', 'transform'], tokens.motion.duration.fast, tokens.motion.easing.standard),
        }),
      }}
    >
      {onClick ? (
        <ButtonBase
          onClick={onClick}
          sx={{ display: 'flex', alignItems: 'stretch', width: '100%', minHeight: tokens.tapTarget, borderRadius: 'inherit', font: 'inherit', color: 'inherit' }}
        >
          {body}
        </ButtonBase>
      ) : (
        body
      )}
    </Card>
  )
}
