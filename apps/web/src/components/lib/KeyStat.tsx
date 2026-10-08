// Owns: the 2a key stat — a 12 px muted label over a tabular 600 value (16, 20 or 28 px) with an optional unit and a
// 12 px caption run inline after it ("−1.0 kg  on pace"), the caption optionally in a status colour — and
// `KeyStatGrid`, which lays a row of them out with #E4E4E7 dividers between cells (the weight trend's four-stat
// footer, the session's stat strip, Scans' stat cells). The value can count up once on mount.
import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import { tokens, type Tone } from '../../theme'
import { CountUp } from './CountUp'
import { formatNumber } from './format'

export interface KeyStatProps {
  label: ReactNode
  value: number | string | null
  unit?: ReactNode
  /** Decimal places for a numeric value. Default 0. */
  precision?: number
  /** A short line run inline after the value, e.g. "from 95.1", "on pace". */
  caption?: ReactNode
  /** Colours the caption: `success` for "on pace", `warning` for a shortfall. Default muted. */
  captionTone?: Tone
  /** `sm` 16 px (default — a footer stat), `md` 20 px (a stat strip), `lg` 28 px (a stat cell). */
  size?: 'sm' | 'md' | 'lg'
  /** Count a numeric value up once on mount. */
  countUp?: boolean
  /** Where the count starts. Default 0. */
  countFrom?: number
  /** ms before the count starts. */
  delay?: number
  testId?: string
}

const SIZES = { sm: 16, md: 20, lg: 28 } as const

const CAPTION_TONES: Record<Tone, string> = {
  success: tokens.tone.success.text,
  warning: tokens.tone.warning.text,
  danger: tokens.tone.danger.text,
  info: tokens.accent.deep,
  neutral: tokens.ink.secondary,
}

export function KeyStat({ label, value, unit, precision = 0, caption, captionTone, size = 'sm', countUp = false, countFrom, delay, testId }: KeyStatProps) {
  const numeric = typeof value === 'number' && Number.isFinite(value)
  const display = typeof value === 'string' ? value : formatNumber(value, precision)
  return (
    <Box data-testid={testId} sx={{ minWidth: 0 }}>
      <Box sx={{ fontSize: tokens.font.size.caption, lineHeight: tokens.font.leading.caption, color: tokens.ink.secondary }}>{label}</Box>
      <Box
        sx={{
          mt: '4px',
          fontSize: SIZES[size],
          fontWeight: tokens.font.weight.number,
          lineHeight: 1.25,
          letterSpacing: size === 'sm' ? 0 : tokens.font.em.number,
          color: tokens.ink.text,
          fontVariantNumeric: 'tabular-nums',
          overflowWrap: 'anywhere',
        }}
      >
        {countUp && numeric ? <CountUp value={value} precision={precision} from={countFrom} delay={delay} /> : display}
        {unit && value !== null && (
          <Box component="span" sx={{ ml: '4px', fontSize: size === 'sm' ? tokens.font.size.caption : tokens.font.size.small, fontWeight: tokens.font.weight.body, letterSpacing: 0, color: tokens.ink.secondary }}>
            {unit}
          </Box>
        )}
        {caption && (
          <Box
            component="span"
            sx={{
              ml: '6px',
              fontSize: tokens.font.size.caption,
              fontWeight: tokens.font.weight.body,
              letterSpacing: 0,
              color: captionTone ? CAPTION_TONES[captionTone] : tokens.ink.secondary,
            }}
          >
            {caption}
          </Box>
        )}
      </Box>
    </Box>
  )
}

export interface KeyStatGridProps {
  children: ReactNode
  /** Cells per row from `md` up (phones: two per row, or one when `columns` is 1). Default 4. */
  columns?: number
  /** Draw the #E4E4E7 rule above the grid (as a card footer does). Default false — a `Panel` footer draws its own. */
  ruleAbove?: boolean
  testId?: string
}

/** A row of KeyStats with hairline dividers; each child is a cell padded 14 × 20. */
export function KeyStatGrid({ children, columns = 4, ruleAbove = false, testId }: KeyStatGridProps) {
  const phone = Math.min(2, columns)
  return (
    <Box
      data-testid={testId}
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: `repeat(${phone}, minmax(0, 1fr))`, md: `repeat(${columns}, minmax(0, 1fr))` },
        borderTop: ruleAbove ? `1px solid ${tokens.ink.border}` : undefined,
        // Every cell carries a right and a bottom rule; the grid's own overflow clip hides the ones on its outer edge.
        overflow: 'hidden',
        '& > *': {
          px: `${tokens.pad.card.x}px`,
          py: '14px',
          borderRight: `1px solid ${tokens.ink.border}`,
          borderBottom: `1px solid ${tokens.ink.border}`,
          marginRight: '-1px',
          marginBottom: '-1px',
        },
      }}
    >
      {children}
    </Box>
  )
}
