// Owns: the 2a card shell — a white card (1 px #E4E4E7, radius 12, the card whisper) with an optional header row
// (title 16/600 — or 14/600 for a small card — a 13 px muted description, right-hand actions; padding 16 × 20 × 12)
// and a body that is padded (18 × 20, or 16 × 18 dense) or flush (for a table or `ListRow`s, which bring their own
// gutters), plus an optional footer behind a hairline. Tones: `card` (default), `panel` (#FAFAFA, no shadow — the
// Dashboard's goal rail, Scans' next-scan card), `dashed` (an empty slot) and `highlight` (the blue border + 3 px ring
// of today's template). `PanelRow` is the 13 px label/value row with #F4F4F5 hairlines between rows.
import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import { tokens } from '../../theme'
import { cardSurface, dashedSurface, highlightSurface, panelSurface } from './surfaces'

export interface PanelProps {
  title?: ReactNode
  description?: ReactNode
  /** Right of the title: a segmented control, a chip, a link button. */
  actions?: ReactNode
  /** Heading level of the title, so the page outline never skips a level. Default h2. */
  headingComponent?: 'h2' | 'h3' | 'h4'
  /** `section` 16/600 (default) or `card` 14/600 (a small card: "Coach note", "Recent activity"). */
  titleSize?: 'section' | 'card'
  /** `standard` 18 × 20 (default), `dense` 16 × 18, `none` (flush: tables and ListRows). */
  padding?: 'standard' | 'dense' | 'none'
  tone?: 'card' | 'panel' | 'dashed' | 'highlight'
  /** Full-bleed footer behind a #E4E4E7 hairline (the weight trend's four stats). */
  footer?: ReactNode
  children?: ReactNode
  /** Root element. Default `section` when titled, otherwise `div`. */
  component?: 'section' | 'aside' | 'div' | 'article' | 'nav'
  /** Names an untitled `section`/`aside` for assistive tech. */
  ariaLabel?: string
  id?: string
  testId?: string
}

const SURFACES = {
  card: cardSurface,
  panel: panelSurface,
  dashed: dashedSurface,
  highlight: highlightSurface,
} as const

export function Panel({
  title,
  description,
  actions,
  headingComponent = 'h2',
  titleSize = 'section',
  padding = 'standard',
  tone = 'card',
  footer,
  children,
  component,
  ariaLabel,
  id,
  testId,
}: PanelProps) {
  const pad = padding === 'dense' ? tokens.pad.dense : tokens.pad.card
  const hasHeader = Boolean(title || actions)
  const hasBody = children !== undefined && children !== null && children !== false
  const headingId = id && title ? `${id}-title` : undefined
  return (
    <Box
      component={component ?? (title ? 'section' : 'div')}
      id={id}
      aria-label={ariaLabel}
      aria-labelledby={!ariaLabel ? headingId : undefined}
      data-testid={testId}
      sx={{
        ...SURFACES[tone],
        minWidth: 0,
        breakInside: 'avoid',
        scrollMarginTop: tokens.layout.scrollPadding.top,
        // Flush children (tables, rows) must not poke out past the rounded corners.
        overflow: padding === 'none' ? 'hidden' : undefined,
      }}
    >
      {hasHeader && (
        <Box
          sx={{
            display: 'flex',
            // A title with a description aligns its actions to the first line; a one-line title centres them.
            alignItems: description ? 'flex-start' : 'center',
            flexWrap: 'wrap',
            gap: '8px 12px',
            pt: `${tokens.pad.header.top}px`,
            px: `${padding === 'dense' ? pad.x : tokens.pad.header.x}px`,
            // Flush rows bring their own hairline 12 px under the header; a header-only card closes at its top padding.
            pb: !hasBody && !footer ? `${tokens.pad.header.top}px` : padding === 'none' ? `${tokens.pad.header.bottom}px` : 0,
          }}
        >
          {/* Basis 0 with a 140 px floor: the title takes what the actions leave and only wraps them under it when
              even 140 px would not fit beside them (a phone, a wide segmented control in a narrow card). */}
          <Box sx={{ flex: '1 1 0%', minWidth: 'min(140px, 100%)' }}>
            {title && (
              <Box
                component={headingComponent}
                id={headingId}
                sx={{
                  m: 0,
                  fontSize: titleSize === 'card' ? tokens.font.size.body : tokens.font.size.cardTitle,
                  fontWeight: tokens.font.weight.heading,
                  lineHeight: tokens.font.leading.cardTitle,
                  color: tokens.ink.text,
                }}
              >
                {title}
              </Box>
            )}
            {description && (
              <Box sx={{ mt: '3px', fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.secondary }}>
                {description}
              </Box>
            )}
          </Box>
          {actions && <Box sx={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 2, ml: 'auto' }}>{actions}</Box>}
        </Box>
      )}
      {hasBody && (
        <Box
          sx={
            padding === 'none'
              ? { minWidth: 0 }
              : { px: `${pad.x}px`, pt: hasHeader ? '14px' : `${pad.y}px`, pb: `${pad.y}px`, minWidth: 0 }
          }
        >
          {children}
        </Box>
      )}
      {footer && <Box sx={{ borderTop: `1px solid ${tokens.ink.border}`, minWidth: 0 }}>{footer}</Box>}
    </Box>
  )
}

export interface PanelRowProps {
  label: ReactNode
  value?: ReactNode
  /** Leading slot, e.g. an 18 px muted glyph (the Dashboard goal rail). */
  leading?: ReactNode
  /** Right-most slot after the value, e.g. a small StatusChip. */
  trailing?: ReactNode
  /** Hairline colour between rows. Default #F4F4F5; on a #FAFAFA panel pass `tokens.ink.border`. */
  hairline?: string
  testId?: string
}

/** A 13 px label / value row; consecutive rows are separated by a hairline. */
export function PanelRow({ label, value, leading, trailing, hairline = tokens.ink.hairline, testId }: PanelRowProps) {
  return (
    <Box
      data-testid={testId}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        py: '8px',
        fontSize: tokens.font.size.small,
        lineHeight: tokens.font.leading.small,
        minWidth: 0,
        '& + &': { borderTop: `1px solid ${hairline}` },
      }}
    >
      {leading}
      <Box sx={{ flex: 1, minWidth: 0, fontWeight: tokens.font.weight.label, color: tokens.ink.text }}>{label}</Box>
      {value !== undefined && value !== null && (
        <Box sx={{ flex: 'none', color: tokens.ink.secondary, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{value}</Box>
      )}
      {trailing}
    </Box>
  )
}
