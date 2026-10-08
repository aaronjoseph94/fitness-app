// Owns: the card every chart sits in (2a): a header row — title 16/600 over a 13 px muted description, or 14/600 over
// 12 px for a chart in a grid of cards, and right-hand actions (a segmented range) — legend keys under it, the chart,
// an optional 12 px caption pinned to the bottom (with `fill`, captions line up across a row of cards), an optional
// full-bleed footer behind a hairline (the weight trend's four stats), or the 2a empty state (a dashed #FAFAFA slot)
// when there is nothing to plot. Built on `Panel`, so it is the same white, hairline-bordered, radius-12 card as every
// other. Prints without breaking across pages.
import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import { EmptyState, type EmptyStateProps } from './EmptyState'
import { LegendChips, type LegendItem } from './LegendChips'
import { Panel } from './Panel'

export interface ChartCardProps {
  title: string
  /** The muted description under the title (13 px, or 12 px with `titleSize="card"`). */
  subtitle?: ReactNode
  /** Extra legend items. Charts from `charts/` draw their own legend; use this for anything else. */
  legend?: readonly LegendItem[]
  /** Right of the title, e.g. a `<Segmented tone="outline" size="small">` range. */
  action?: ReactNode
  /** When set, the empty state replaces the chart. `true` uses a generic message. */
  empty?: boolean | Omit<EmptyStateProps, 'compact'> | null
  children?: ReactNode
  /** A 12 px muted line pinned to the card's bottom. Hidden while empty. */
  caption?: ReactNode
  /** Full-bleed footer behind a hairline, e.g. a `<KeyStatGrid>`. Hidden while empty. */
  footer?: ReactNode
  /**
   * `card` 14/600 + a 12 px description: a chart in a grid of cards (Dashboard, Progress, Scans). Default `section`
   * 16/600 + 13 px: a full-width chart (Today's weight trend).
   */
  titleSize?: 'section' | 'card'
  /** Fill the grid cell's height, so a row of cards ends level and their captions line up. */
  fill?: boolean
  testId?: string
  /** Heading level of the title, so the page outline never skips a level. Default h3 (a chart inside a section). */
  headingComponent?: 'h2' | 'h3' | 'h4'
}

export function ChartCard({
  title,
  subtitle,
  legend,
  action,
  empty,
  children,
  caption,
  footer,
  titleSize,
  fill,
  testId,
  headingComponent = 'h3',
}: ChartCardProps) {
  const emptyProps: Omit<EmptyStateProps, 'compact'> | null =
    empty === true ? { title: 'Nothing to show yet', body: 'Log a few days and this chart fills in.' } : empty || null
  return (
    <Panel
      component="div"
      title={title}
      description={subtitle}
      actions={action}
      headingComponent={headingComponent}
      titleSize={titleSize}
      fill={fill}
      caption={emptyProps ? undefined : caption}
      footer={emptyProps ? undefined : footer}
      testId={testId}
    >
      {legend && legend.length > 0 && !emptyProps && (
        <Box sx={{ mb: '14px' }}>
          <LegendChips items={legend} />
        </Box>
      )}
      <Box sx={{ minWidth: 0 }}>{emptyProps ? <EmptyState {...emptyProps} compact /> : children}</Box>
    </Panel>
  )
}
