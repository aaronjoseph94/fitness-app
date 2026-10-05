// Owns: the stat card: label, ONE big number with its unit, an optional signed delta (arrow + text, coloured by
// whether the direction is good), an optional metric accent dot, and a slot for a sparkline.
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded'
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Card from '@mui/material/Card'
import type { ReactNode } from 'react'
import { tokens, type MetricKey } from '../../theme'
import { formatNumber, formatSigned } from './format'

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
  /** Adds a dot in this metric's colour before the label. */
  metric?: MetricKey
  /** Anything chart-like under the number, e.g. a <Sparkline/>. */
  sparkline?: ReactNode
  /** Small secondary line at the bottom, e.g. "Projected 2027-08-04". */
  footnote?: ReactNode
  /** Top-right slot, e.g. a <PendingBadge/>. */
  badge?: ReactNode
  /** Makes the whole card a 44 px+ tap target. */
  onClick?: () => void
  /** Big-number size. `hero` is the one per view. Default `standard`. */
  emphasis?: 'standard' | 'hero'
  testId?: string
}

function DeltaLine({
  delta,
  fallbackUnit,
  precision,
}: {
  delta: StatDelta
  fallbackUnit?: string
  precision: number
}) {
  const unit = delta.unit ?? fallbackUnit
  const flat = Math.abs(delta.value) < 10 ** -precision / 2
  const isGood = delta.good === 'neutral' || flat ? null : delta.value < 0 === (delta.good === 'down')
  const color = isGood === null ? tokens.ink.secondary : isGood ? tokens.status.good : tokens.status.flag
  const Icon = delta.value < 0 ? ArrowDownwardRounded : ArrowUpwardRounded
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5, minWidth: 0 }}>
      {!flat && <Icon sx={{ fontSize: tokens.font.size.body, color }} aria-hidden />}
      <Box
        component="span"
        sx={{ fontSize: tokens.font.size.small, fontWeight: tokens.font.weight.label, color, whiteSpace: 'nowrap' }}
      >
        {formatSigned(delta.value, precision)}
        {unit ? ` ${unit}` : ''}
      </Box>
      {delta.period && (
        <Box
          component="span"
          sx={{
            fontSize: tokens.font.size.small,
            color: tokens.ink.secondary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {delta.period}
        </Box>
      )}
    </Box>
  )
}

export function StatCard({
  label,
  value,
  unit,
  precision = 0,
  delta,
  metric,
  sparkline,
  footnote,
  badge,
  onClick,
  emphasis = 'standard',
  testId,
}: StatCardProps) {
  const display = typeof value === 'number' || value === null ? formatNumber(value, precision) : value
  const numberSize = emphasis === 'hero' ? tokens.font.size.bigNumberLarge : tokens.font.size.bigNumber

  const body = (
    <Box sx={{ p: 4, width: '100%', textAlign: 'left' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 24 }}>
        {metric && (
          <Box
            aria-hidden
            sx={{
              width: 8,
              height: 8,
              borderRadius: tokens.radius.chip,
              bgcolor: tokens.metric[metric],
              flex: 'none',
            }}
          />
        )}
        <Box
          component="span"
          sx={{
            flex: 1,
            minWidth: 0,
            fontSize: tokens.font.size.label,
            fontWeight: tokens.font.weight.label,
            color: tokens.ink.secondary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </Box>
        {badge}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mt: 1.5, minWidth: 0 }}>
        <Box
          component="span"
          sx={{
            fontSize: numberSize,
            fontWeight: tokens.font.weight.number,
            lineHeight: 1.1,
            color: tokens.ink.text,
            letterSpacing: -0.5,
          }}
        >
          {display}
        </Box>
        {unit && value !== null && (
          <Box
            component="span"
            sx={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.label, color: tokens.ink.secondary }}
          >
            {unit}
          </Box>
        )}
      </Box>
      {delta && <DeltaLine delta={delta} fallbackUnit={unit} precision={precision} />}
      {sparkline && <Box sx={{ mt: 3 }}>{sparkline}</Box>}
      {footnote && (
        <Box sx={{ mt: 2, fontSize: tokens.font.size.label, color: tokens.ink.secondary, lineHeight: 1.4 }}>{footnote}</Box>
      )}
    </Box>
  )

  return (
    <Card data-testid={testId} sx={{ height: '100%', display: 'flex' }}>
      {onClick ? (
        <ButtonBase
          onClick={onClick}
          sx={{
            display: 'flex',
            alignItems: 'stretch',
            width: '100%',
            minHeight: tokens.tapTarget,
            borderRadius: 'inherit',
            font: 'inherit',
            color: 'inherit',
          }}
        >
          {body}
        </ButtonBase>
      ) : (
        body
      )}
    </Card>
  )
}
