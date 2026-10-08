// Owns: the 2a card shell — a white card (1 px #E4E4E7, radius 12, the card whisper) with an optional header row
// (a title over a muted description, right-hand actions: 16/600 over 13 px, padding 16 × 20 × 12; or for a small card
// 14/600 over 12 px with 12 px muted actions, its title as far down as the body's top padding, 18 or 16 dense) and a
// body that is padded (18 × 20, or 16 × 18 dense) or flush (for a table or `ListRow`s, which bring their own gutters;
// a table wider than the card scrolls sideways), then an optional 12 px muted caption pinned to the bottom (so captions
// line up across a row of `fill` cards of different heights) and an optional footer behind a hairline. `fill`
// stretches the card to its grid cell. Tones: `card` (default), `panel` (`ink.panel`, no shadow — the
// Dashboard's goal rail, Scans' next-scan card) and `dashed` (an empty slot). `PanelRow` is the 13 px label/value row
// with `ink.hairline` rules between rows.
import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import { tokens } from '../../theme'
import { cardSurface, dashedSurface, panelSurface } from './surfaces'

export interface PanelProps {
  title?: ReactNode
  description?: ReactNode
  /** Right of the title: a segmented control, a chip, a link button. */
  actions?: ReactNode
  /** Heading level of the title, so the page outline never skips a level. Default h2. */
  headingComponent?: 'h2' | 'h3' | 'h4'
  /**
   * `section` 16/600 + a 13 px description (default), or `card` 14/600 + a 12 px description and 12 px muted actions (a
   * small card: "Recent activity", a chart in a grid of cards).
   */
  titleSize?: 'section' | 'card'
  /** `standard` 18 × 20 (default), `dense` 16 × 18, `none` (flush: tables and ListRows). */
  padding?: 'standard' | 'dense' | 'none'
  tone?: 'card' | 'panel' | 'dashed'
  /** A 12 px muted line under the body, pinned to the card's bottom. */
  caption?: ReactNode
  /** Full-bleed footer behind a #E4E4E7 hairline (the weight trend's four stats). */
  footer?: ReactNode
  /** Fill the parent's height (a grid cell), so a row of cards ends level and their captions line up. */
  fill?: boolean
  children?: ReactNode
  /** Root element. Default `section` when titled, otherwise `div`. */
  component?: 'section' | 'aside' | 'div' | 'article'
  /** Names an untitled `section`/`aside` for assistive tech. */
  ariaLabel?: string
  id?: string
  testId?: string
}

const SURFACES = {
  card: cardSurface,
  panel: panelSurface,
  dashed: dashedSurface,
} as const

export function Panel({
  title,
  description,
  actions,
  headingComponent = 'h2',
  titleSize = 'section',
  padding = 'standard',
  tone = 'card',
  caption,
  footer,
  fill = false,
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
  const card = titleSize === 'card'
  // A small card's title sits as far down as its body's top padding (2a: 18, or 16 dense); a section title at 16.
  const headerTop = card ? pad.y : tokens.pad.header.top
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
        // Flush children (tables, rows) must not poke out past the rounded corners. A table wider than the card scrolls
        // sideways inside the flush body (below) rather than being cut off (WCAG 1.4.10's data-table exception); other
        // flush content stays clipped here, so a control a pixel or two past the gutter (a Switch's hidden input) draws
        // no scrollbar.
        overflow: padding === 'none' ? 'hidden' : undefined,
        ...(fill && { height: '100%', display: 'flex', flexDirection: 'column' }),
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
            pt: `${headerTop}px`,
            px: `${padding === 'dense' ? pad.x : tokens.pad.header.x}px`,
            // Flush rows bring their own hairline 12 px under the header; a header-only card closes at its top padding.
            pb: !hasBody && !caption && !footer ? `${headerTop}px` : padding === 'none' ? `${tokens.pad.header.bottom}px` : 0,
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
                  fontSize: card ? tokens.font.size.body : tokens.font.size.cardTitle,
                  fontWeight: tokens.font.weight.heading,
                  lineHeight: tokens.font.leading.cardTitle,
                  color: tokens.ink.text,
                }}
              >
                {title}
              </Box>
            )}
            {description && (
              <Box
                sx={{
                  mt: card ? '2px' : '3px',
                  fontSize: card ? tokens.font.size.caption : tokens.font.size.small,
                  lineHeight: card ? tokens.font.leading.caption : tokens.font.leading.small,
                  color: tokens.ink.secondary,
                }}
              >
                {description}
              </Box>
            )}
          </Box>
          {actions && (
            <Box
              sx={{
                flex: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                ml: 'auto',
                // A small card's plain-text action ("target 9,000") is a 12 px muted note.
                ...(card && { fontSize: tokens.font.size.caption, color: tokens.ink.secondary }),
              }}
            >
              {actions}
            </Box>
          )}
        </Box>
      )}
      {hasBody && (
        <Box
          sx={
            padding === 'none'
              ? { minWidth: 0, '&:has(table)': { overflowX: 'auto' } }
              : { px: `${pad.x}px`, pt: hasHeader ? '14px' : `${pad.y}px`, pb: caption ? 0 : `${pad.y}px`, minWidth: 0 }
          }
        >
          {children}
        </Box>
      )}
      {caption && (
        <Box
          sx={{
            mt: 'auto',
            px: `${pad.x}px`,
            pt: '10px',
            pb: `${pad.y}px`,
            fontSize: tokens.font.size.caption,
            lineHeight: tokens.font.leading.caption,
            color: tokens.ink.secondary,
          }}
        >
          {caption}
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
