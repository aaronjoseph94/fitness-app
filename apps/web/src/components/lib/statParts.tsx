// Owns: the two pieces every 2a stat surface is made of, so the stat card and any tile built on it cannot drift
// apart: the head row (13/500 `ink.label` label, a right-aligned 16 px `ink.faint` glyph, an optional badge) and the
// figure (a 28/600 tabular value — 40 for a hero — with its unit in 13 px muted, counting up once on mount when
// asked). Internal to the kit.
import type { SvgIconComponent } from '@mui/icons-material'
import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import { tokens } from '../../theme'
import { CountUp } from './CountUp'
import { formatNumber } from './format'
import { statValue } from './surfaces'

export function StatHead({ label, icon: Icon, badge }: { label: ReactNode; icon?: SvgIconComponent; badge?: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: 20, minWidth: 0 }}>
      <Box
        component="span"
        sx={{
          flex: 1,
          minWidth: 0,
          fontSize: tokens.font.size.label,
          fontWeight: tokens.font.weight.label,
          lineHeight: tokens.font.leading.label,
          color: tokens.ink.label,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Box>
      {badge}
      {Icon && <Icon aria-hidden sx={{ fontSize: 16, color: tokens.ink.faint, flex: 'none' }} />}
    </Box>
  )
}

export interface StatFigureProps {
  value: number | string | null
  unit?: ReactNode
  precision: number
  hero?: boolean
  countUp?: boolean
  delay?: number
  /** Right of the value, pushed to the row's end (a delta pill); wraps under the value when the card is narrow. */
  trailing?: ReactNode
  /** On a phone, give `trailing` its own right-aligned row, so the card's height never depends on the number's width. */
  trailingBelowOnPhone?: boolean
}

export function StatFigure({ value, unit, precision, hero = false, countUp = false, delay, trailing, trailingBelowOnPhone = false }: StatFigureProps) {
  const display = typeof value === 'number' || value === null ? formatNumber(value, precision) : value
  const numeric = typeof value === 'number' && Number.isFinite(value)
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: '6px', rowGap: '6px', mt: '10px', minWidth: 0 }}>
      <Box
        component="span"
        sx={{
          ...statValue(hero ? 'large' : 'standard'),
          // A hero steps down to 34 on a phone; a stat value stays 28 (its unit wraps under it in a narrow card).
          ...(hero && { fontSize: { xs: tokens.font.size.bigNumberMedium, sm: tokens.font.size.bigNumberLarge } }),
          lineHeight: tokens.font.leading.number,
          color: tokens.ink.text,
          whiteSpace: 'nowrap',
        }}
      >
        {countUp && numeric ? <CountUp value={value} precision={precision} delay={delay} /> : display}
      </Box>
      {unit && value !== null && (
        <Box component="span" sx={{ fontSize: hero ? tokens.font.size.body : tokens.font.size.small, color: tokens.ink.secondary, minWidth: 0 }}>
          {unit}
        </Box>
      )}
      {trailing && (
        <Box
          sx={{
            ml: 'auto',
            display: 'inline-flex',
            alignSelf: 'center',
            minWidth: 0,
            ...(trailingBelowOnPhone && { flexBasis: { xs: '100%', sm: 'auto' }, justifyContent: 'flex-end' }),
          }}
        >
          {trailing}
        </Box>
      )}
    </Box>
  )
}

/** The caption under a stat: 12 px muted, with any <strong>/<b> inside it as the 500 ink key figure. */
export function StatCaption({ children, muted = tokens.ink.secondary }: { children: ReactNode; muted?: string }) {
  return (
    <Box
      sx={{
        mt: '8px',
        fontSize: tokens.font.size.caption,
        lineHeight: tokens.font.leading.caption,
        color: muted,
        '& strong, & b': { fontWeight: tokens.font.weight.label, color: tokens.ink.text },
      }}
    >
      {children}
    </Box>
  )
}
