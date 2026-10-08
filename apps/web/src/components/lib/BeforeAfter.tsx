// Owns: the 2a before → after row a proposal shows — the label on the left in #52525B, the old value struck through and
// the new one in bold on the right, on a #FAFAFA strip at the control radius — and the list that stacks them 6 px apart
// as a description list (label = term, change = definition). The struck value is muted ink rather than 2a's #A1A1AA,
// which is 2.56:1 and the value is information; screen readers, which do not announce a strike-through, hear
// "130 g, changes to 140 g".
import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import { tokens } from '../../theme'
import { visuallyHidden } from './PageHero'

export interface BeforeAfterProps {
  label: ReactNode
  from: ReactNode
  to: ReactNode
  /** Strip colour. Default `tokens.ink.panel` (#FAFAFA); on a #FAFAFA card pass `tokens.ink.card`. */
  background?: string
  testId?: string
}

/** One row. Render it inside a `BeforeAfterList` (it is a `<dt>`/`<dd>` pair). */
export function BeforeAfter({ label, from, to, background = tokens.ink.panel, testId }: BeforeAfterProps) {
  return (
    <Box
      data-testid={testId}
      sx={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        columnGap: 3,
        rowGap: 0.5,
        px: '10px',
        py: '8px',
        borderRadius: `${tokens.radius.control}px`,
        bgcolor: background,
        fontSize: tokens.font.size.small,
        lineHeight: tokens.font.leading.small,
      }}
    >
      <Box component="dt" sx={{ color: tokens.ink.label, minWidth: 0 }}>
        {label}
      </Box>
      <Box component="dd" sx={{ m: 0, ml: 'auto', color: tokens.ink.text, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        <Box component="s" sx={{ color: tokens.ink.muted }}>
          {from}
        </Box>
        <Box component="span" aria-hidden sx={{ mx: '6px', color: tokens.ink.muted }}>
          →
        </Box>
        <Box component="span" sx={visuallyHidden}>
          , changes to{' '}
        </Box>
        <Box component="b" sx={{ fontWeight: tokens.font.weight.heading }}>
          {to}
        </Box>
      </Box>
    </Box>
  )
}

export interface BeforeAfterListProps {
  changes: readonly { label: string; from: ReactNode; to: ReactNode }[]
  background?: string
  testId?: string
}

/** The stack of before → after rows, as a description list. */
export function BeforeAfterList({ changes, background, testId }: BeforeAfterListProps) {
  if (changes.length === 0) return null
  return (
    <Box component="dl" data-testid={testId} sx={{ m: 0, display: 'grid', gap: '6px' }}>
      {changes.map((c) => (
        <BeforeAfter key={c.label} label={c.label} from={c.from} to={c.to} background={background} />
      ))}
    </Box>
  )
}
