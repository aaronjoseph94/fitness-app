// Owns: the card every chart sits in: title (+ optional subtitle and action), legend chips under the title,
// the chart, or an illustrated empty state when there is nothing to plot. Prints without breaking across pages.
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import type { ReactNode } from 'react'
import { tokens } from '../../theme'
import { EmptyState, type EmptyStateProps } from './EmptyState'
import { LegendChips, type LegendItem } from './LegendChips'

export interface ChartCardProps {
  title: string
  subtitle?: ReactNode
  /** Extra legend items. Charts from `charts/` draw their own legend; use this for anything else. */
  legend?: readonly LegendItem[]
  /** Right of the title, e.g. a range toggle. */
  action?: ReactNode
  /** When set, the empty state replaces the chart. `true` uses a generic message. */
  empty?: boolean | Omit<EmptyStateProps, 'compact'>
  children?: ReactNode
  testId?: string
  /** Heading level of the title, so the page outline never skips a level. Default h3 (a chart inside a section). */
  headingComponent?: 'h2' | 'h3' | 'h4'
}

export function ChartCard({ title, subtitle, legend, action, empty, children, testId, headingComponent = 'h3' }: ChartCardProps) {
  const emptyProps: Omit<EmptyStateProps, 'compact'> | null =
    empty === true
      ? {
          title: 'Nothing to show yet',
          body: 'Log a few days and this chart fills in.',
          illustration: 'progress',
        }
      : empty || null
  return (
    <Card data-testid={testId} sx={{ p: 4, breakInside: 'avoid', pageBreakInside: 'avoid', minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box
            component={headingComponent}
            sx={{
              m: 0,
              fontSize: tokens.font.size.body,
              fontWeight: tokens.font.weight.heading,
              color: tokens.ink.text,
              lineHeight: tokens.font.leading.body,
              letterSpacing: tokens.font.tracking.body,
            }}
          >
            {title}
          </Box>
          {subtitle && (
            <Box
              sx={{
                mt: 0.5,
                fontSize: tokens.font.size.label,
                color: tokens.ink.secondary,
                lineHeight: tokens.font.leading.label,
                letterSpacing: tokens.font.tracking.label,
              }}
            >
              {subtitle}
            </Box>
          )}
        </Box>
        {action && <Box sx={{ flex: 'none', mt: -1.5, mr: -1.5 }}>{action}</Box>}
      </Box>
      {legend && legend.length > 0 && !emptyProps && (
        <Box sx={{ mt: 2.5 }}>
          <LegendChips items={legend} />
        </Box>
      )}
      <Box sx={{ mt: 3, minWidth: 0 }}>{emptyProps ? <EmptyState {...emptyProps} compact /> : children}</Box>
    </Card>
  )
}
