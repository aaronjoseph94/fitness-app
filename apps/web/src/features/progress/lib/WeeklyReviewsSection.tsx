// Owns: the Progress tab's "Weekly reviews" list (SPEC §8: past reviews, each opening its report page and its PDF) —
// week, trend change, author, and links to the report and the archived PDF. Data: GET /api/reviews (newest first).
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Link from '@mui/material/Link'
import { endpoints } from '@fitness/shared/api'
import { isoWeekRange } from '@fitness/shared/engine'
import type { WeeklyReview } from '@fitness/shared/schemas'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router'
import { useApiQuery } from '../../../api'
import { EmptyState, formatShortDate, formatSigned, SectionHeader } from '../../../components'
import { tokens } from '../../../theme'

const AUTHOR = { claude_mcp: 'Claude', gemini: 'Gemini' } as const
/** Rows shown before "Show all". */
const FIRST_ROWS = 8

function weekLabel(r: WeeklyReview) {
  const { from, to } = isoWeekRange(r.week)
  return `${formatShortDate(from)} – ${formatShortDate(to)}`
}

export function WeeklyReviewsSection() {
  const reviews = useApiQuery(endpoints.reviews.list, {})
  const [all, setAll] = useState(false)
  const rows = reviews.data ?? []
  return (
    <Box data-testid="progress-weekly-reviews">
      <SectionHeader title="Weekly reviews" subtitle="Each week's summary, printable, with its proposals" />
      <Card sx={{ p: 0, overflow: 'hidden' }}>
        {reviews.isPending ? (
          <Box sx={{ p: 4, color: tokens.ink.secondary, fontSize: tokens.font.size.small }}>Loading reviews…</Box>
        ) : reviews.isError ? (
          <Box sx={{ p: 4, color: tokens.ink.secondary, fontSize: tokens.font.size.small }}>Reviews could not be loaded: {reviews.error.message}</Box>
        ) : rows.length === 0 ? (
          <Box sx={{ p: 4 }}>
            <EmptyState
              compact
              title="No reviews yet"
              body="The first weekly review is drafted on Sunday at 20:00, or when Claude runs your coach review."
              illustration={null}
            />
          </Box>
        ) : (
          <>
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {(all ? rows : rows.slice(0, FIRST_ROWS)).map((r) => (
                <ReviewRow key={r.id} review={r} />
              ))}
            </Box>
            {!all && rows.length > FIRST_ROWS && (
              <Button fullWidth onClick={() => setAll(true)} sx={{ borderTop: `1px solid ${tokens.ink.border}`, borderRadius: 0, minHeight: tokens.tapTarget }}>
                Show all {rows.length}
              </Button>
            )}
          </>
        )}
      </Card>
    </Box>
  )
}

function ReviewRow({ review: r }: { review: WeeklyReview }) {
  const change = r.metrics.trend_change_kg
  return (
    <Box
      component="li"
      data-testid="weekly-review-row"
      sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 4, minHeight: 56, '& + &': { borderTop: `1px solid ${tokens.ink.border}` } }}
    >
      <Link
        component={RouterLink}
        to={`/reports/week/${r.week}`}
        underline="none"
        color="inherit"
        sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 2, py: 1.5, minHeight: tokens.tapTarget }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ fontSize: tokens.font.size.emphasis, fontWeight: tokens.font.weight.label }}>
            {r.week} <Box component="span" sx={{ color: tokens.ink.secondary, fontWeight: tokens.font.weight.body, fontSize: tokens.font.size.label }}>{weekLabel(r)}</Box>
          </Box>
          <Box sx={{ fontSize: tokens.font.size.label, color: tokens.ink.secondary }}>
            {AUTHOR[r.author]}
            {r.proposals.length > 0 && ` · ${r.proposals.length} proposal${r.proposals.length === 1 ? '' : 's'}`}
          </Box>
        </Box>
        <Box
          sx={{
            fontSize: tokens.font.size.emphasis,
            fontWeight: tokens.font.weight.number,
            fontVariantNumeric: 'tabular-nums',
            color: change === null ? tokens.ink.secondary : tokens.metric.weight,
            whiteSpace: 'nowrap',
          }}
          aria-label="Trend change"
        >
          {change === null ? '—' : `${formatSigned(change, 1)} kg`}
        </Box>
        <ChevronRightRounded sx={{ color: tokens.ink.secondary }} />
      </Link>
      {r.pdf_url && (
        <Link href={r.pdf_url} target="_blank" rel="noopener" sx={{ fontSize: tokens.font.size.label, whiteSpace: 'nowrap' }}>
          PDF
        </Link>
      )}
    </Box>
  )
}
