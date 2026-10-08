// Owns: the 2a key stat — a 12 px muted label over a tabular 600 value (16, 20 or 28 px, or any type-scale size) with
// an optional unit, a trailing slot (a delta) and a 12 px caption run inline after it ("−1.0 kg  on pace"), then an
// optional 12 px note under the value ("range 10–20 %"), caption and note optionally in a status colour — and
// `KeyStatGrid`, which lays them out in cells divided by #E4E4E7 rules (or the lighter row hairline), a set count per
// row or one per breakpoint (the weight trend's four-stat footer, the session's stat strip). The value can count up
// once on mount.
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
  /** Right after the unit, e.g. the change since last time. */
  trailing?: ReactNode
  /** A 12 px line under the value, e.g. "range 10–20 %". */
  note?: ReactNode
  /** Colours the note, as `captionTone` does the caption. Default muted. */
  noteTone?: Tone
  /**
   * `sm` 16 px (default — a footer stat), `md` 20 px (a stat strip), `lg` 28 px (a stat cell), or a
   * `tokens.font.size.*` value (`bigNumberSmall` 22 for Scans' headline cells).
   */
  size?: 'sm' | 'md' | 'lg' | number
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

export function KeyStat({
  label,
  value,
  unit,
  precision = 0,
  caption,
  captionTone,
  trailing,
  note,
  noteTone,
  size = 'sm',
  countUp = false,
  countFrom,
  delay,
  testId,
}: KeyStatProps) {
  const numeric = typeof value === 'number' && Number.isFinite(value)
  const display = typeof value === 'string' ? value : formatNumber(value, precision)
  const px = typeof size === 'number' ? size : SIZES[size]
  // Up to 16 px the value is set like body text: no tracking, a 12 px unit.
  const small = px <= SIZES.sm
  return (
    <Box data-testid={testId} sx={{ minWidth: 0 }}>
      <Box sx={{ fontSize: tokens.font.size.caption, lineHeight: tokens.font.leading.caption, color: tokens.ink.secondary }}>{label}</Box>
      <Box
        sx={{
          mt: '4px',
          fontSize: px,
          fontWeight: tokens.font.weight.number,
          lineHeight: 1.25,
          letterSpacing: small ? 0 : tokens.font.em.number,
          color: tokens.ink.text,
          fontVariantNumeric: 'tabular-nums',
          overflowWrap: 'anywhere',
        }}
      >
        {countUp && numeric ? <CountUp value={value} precision={precision} from={countFrom} delay={delay} /> : display}
        {unit && value !== null && (
          <Box component="span" sx={{ ml: '4px', fontSize: small ? tokens.font.size.caption : tokens.font.size.small, fontWeight: tokens.font.weight.body, letterSpacing: 0, color: tokens.ink.secondary }}>
            {unit}
          </Box>
        )}
        {/* One unit: wraps under the value as a whole rather than breaking inside. */}
        {trailing && (
          <Box component="span" sx={{ display: 'inline-block', ml: '6px' }}>
            {trailing}
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
      {note && (
        <Box
          sx={{
            mt: '2px',
            fontSize: tokens.font.size.caption,
            lineHeight: tokens.font.leading.caption,
            color: noteTone ? CAPTION_TONES[noteTone] : tokens.ink.secondary,
          }}
        >
          {note}
        </Box>
      )}
    </Box>
  )
}

type CellsPerBreakpoint = { xs?: number; sm?: number; md?: number; lg?: number }

export interface KeyStatGridProps {
  children: ReactNode
  /**
   * Cells per row: a number from `md` up (phones: two per row, or one when it is 1), or a count per breakpoint
   * (`{ xs: 2, sm: 4, md: 2, lg: 4 }`). Default 4.
   */
  columns?: number | CellsPerBreakpoint
  /** Draw the #E4E4E7 rule above the grid (as a card footer does). Default false — a `Panel` footer draws its own. */
  ruleAbove?: boolean
  /** The rules between cells: `border` (`ink.border`, default) or `hairline` (`ink.hairline`). The rule above stays `border`. */
  rule?: 'border' | 'hairline'
  /** 12 px vertical cell padding instead of 14 (a strip of small readings). */
  dense?: boolean
  testId?: string
}

/** A row of KeyStats with rules between them; each child is a cell padded 14 × 20 (12 × 20 dense). */
export function KeyStatGrid({ children, columns = 4, ruleAbove = false, rule = 'border', dense = false, testId }: KeyStatGridProps) {
  const cells: CellsPerBreakpoint = typeof columns === 'number' ? { xs: Math.min(2, columns), md: columns } : columns
  const template: Partial<Record<keyof CellsPerBreakpoint, string>> = {}
  for (const bp of ['xs', 'sm', 'md', 'lg'] as const) if (cells[bp]) template[bp] = `repeat(${cells[bp]}, minmax(0, 1fr))`
  const divider = `1px solid ${rule === 'hairline' ? tokens.ink.hairline : tokens.ink.border}`
  return (
    <Box
      data-testid={testId}
      sx={{
        display: 'grid',
        gridTemplateColumns: template,
        borderTop: ruleAbove ? `1px solid ${tokens.ink.border}` : undefined,
        // Every cell carries a right and a bottom rule; the grid's own overflow clip hides the ones on its outer edge.
        overflow: 'hidden',
        '& > *': {
          px: `${tokens.pad.card.x}px`,
          py: dense ? '12px' : '14px',
          borderRight: divider,
          borderBottom: divider,
          marginRight: '-1px',
          marginBottom: '-1px',
        },
      }}
    >
      {children}
    </Box>
  )
}
