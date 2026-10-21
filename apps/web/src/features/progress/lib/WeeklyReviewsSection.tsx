// Owns: the Progress tab's "Weekly reviews" card (SPEC §8: past reviews, each opening its report page and its PDF; 1d
// rows) — a 40 px document tile (violet for Claude's review, the warm well for the app's own AI draft), "Week of …"
// with the author chip, the week's trend change, protein and proposals, when it was written, a chevron, and the
// archived PDF; then a warm note on when the next review comes. Data: GET /api/reviews (newest first).
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined'
import ScheduleRounded from '@mui/icons-material/ScheduleRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import { endpoints } from '@fitness/shared/api'
import { localDate } from '@fitness/shared/engine'
import type { WeeklyReview } from '@fitness/shared/schemas'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router'
import { useApiQuery } from '../../../api'
import {
  EmptyState,
  formatNumber,
  formatShortDate,
  formatSigned,
  isQueryLoading,
  Panel,
  QueryStateCard,
  StatusChip,
} from '../../../components'
import { tokens } from '../../../theme'

/** Claude's review supersedes the app's own draft for the same week (WeeklyReview). */
const AUTHOR = {
  claude_mcp: { label: 'Claude', tone: 'info', tile: tokens.accent.soft, glyph: tokens.accent.deep },
  gemini: { label: 'AI draft', tone: 'neutral', tile: tokens.ink.panel, glyph: tokens.ink.secondary },
} as const
/** Rows shown before "Show all". */
const FIRST_ROWS = 8

const note = {
  fontSize: tokens.font.size.small,
  lineHeight: tokens.font.leading.small,
  color: tokens.ink.secondary,
} as const

export function WeeklyReviewsSection() {
  const reviews = useApiQuery(endpoints.reviews.list, {})
  const [all, setAll] = useState(false)
  const rows = reviews.data ?? []
  return (
    <Panel
      title="Weekly reviews"
      titleSize="card"
      headingComponent="h3"
      actions="Sunday drafts"
      fill
      testId="progress-weekly-reviews"
    >
      {isQueryLoading(reviews) ? (
        <Box sx={note}>Loading reviews…</Box>
      ) : reviews.isError || !reviews.data ? (
        <QueryStateCard query={reviews} what="the reviews" />
      ) : rows.length === 0 ? (
        <Box>
          <EmptyState
            compact
            title="No reviews yet"
            body="The first weekly review is drafted on Sunday at 20:00, or when Claude runs your coach review."
          />
        </Box>
      ) : (
        <>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {(all ? rows : rows.slice(0, FIRST_ROWS)).map((r, i) => (
              <ReviewRow key={r.id} review={r} first={i === 0} />
            ))}
          </Box>
          {!all && rows.length > FIRST_ROWS && (
            <Button fullWidth onClick={() => setAll(true)} sx={{ mt: '6px' }}>
              Show all {rows.length}
            </Button>
          )}
          <Box
            sx={{
              mt: '14px',
              py: '12px',
              px: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              borderRadius: `${tokens.summit.radius.wellSmall}px`,
              bgcolor: tokens.ink.panel,
              ...note,
              fontWeight: tokens.font.weight.label,
              lineHeight: tokens.font.leading.body,
            }}
          >
            <ScheduleRounded aria-hidden sx={{ fontSize: 18, color: tokens.ink.secondary, flex: 'none' }} />A
            draft lands every Sunday at 20:00; Claude’s review supersedes it when it lands and can carry
            proposals.
          </Box>
        </>
      )}
    </Panel>
  )
}

function ReviewRow({ review: r, first }: { review: WeeklyReview; first: boolean }) {
  const change = r.metrics.trend_change_kg
  const protein = r.metrics.intake_avg.protein_g
  const n = r.proposals.length
  const author = AUTHOR[r.author]
  const summary = [
    change === null ? null : `${formatSigned(change, 1)} kg`,
    protein > 0 ? `protein averaged ${formatNumber(protein)} g` : null,
    n > 0 ? `${n} proposal${n === 1 ? '' : 's'}` : null,
    `written ${formatShortDate(localDate(r.created_at))}`,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <Box
      component="li"
      data-testid="weekly-review-row"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        borderTop: first ? 0 : `1px solid ${tokens.ink.hairline}`,
      }}
    >
      <Link
        component={RouterLink}
        to={`/reports/week/${r.week}`}
        underline="none"
        color="inherit"
        sx={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          py: '12px',
          fontSize: tokens.font.size.body,
          lineHeight: tokens.font.leading.small,
          borderRadius: `${tokens.radius.control}px`,
          '@media (hover: hover)': { '&:hover .review-title': { color: tokens.accent.deep } },
        }}
      >
        <Box
          aria-hidden
          sx={{
            width: 40,
            height: 40,
            flex: 'none',
            display: 'grid',
            placeItems: 'center',
            borderRadius: `${tokens.radius.control}px`,
            bgcolor: author.tile,
            color: author.glyph,
          }}
        >
          <DescriptionOutlined sx={{ fontSize: 22 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box
            className="review-title"
            sx={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '6px',
              fontWeight: tokens.font.weight.heading,
              color: tokens.ink.text,
            }}
          >
            Week of {formatShortDate(r.week_start)}
            <StatusChip tone={author.tone} size="small" label={author.label} />
          </Box>
          <Box
            sx={{
              fontSize: tokens.font.size.caption,
              fontWeight: tokens.font.weight.label,
              color: tokens.ink.secondary,
            }}
          >
            {summary}
          </Box>
        </Box>
        <ChevronRightRounded aria-hidden sx={{ flex: 'none', fontSize: 20, color: tokens.ink.faint }} />
      </Link>
      {r.pdf_url && (
        <Button
          variant="text"
          size="tiny"
          href={r.pdf_url}
          target="_blank"
          rel="noopener"
          sx={{ flex: 'none' }}
        >
          PDF
        </Button>
      )}
    </Box>
  )
}
