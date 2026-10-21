// Owns: Today's AI check-in card (1d README §5.1, the middle card of the second row) — the sparkle and "AI check-in"
// with the time of its newest item; the newest safety flag of the last 7 days (rapid loss, plateau, protein low; shown,
// never applied) as a warning; today's day adjustment when the AI has made one (status, kcal and protein left, the AI's
// note, next-meal ideas that log a favourite in one tap); the latest AI event (review, note, change) from the live feed
// when no proposal waits; and behind a hairline the latest pending proposal, titled with the proposer's own summary
// when it is one short line, else with the change's own title over that summary (Accept / Reject / Why? →
// POST /api/proposals/:id/accept|reject through the shared decision hook; Why lists the reasons and links to the plan
// history). With nothing from the AI yet, one quiet line says what will show here.
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import { keyframes } from '@mui/material/styles'
import { endpoints } from '@fitness/shared/api'
import type { AiEvent, Proposal } from '@fitness/shared/schemas'
import { useId, useState } from 'react'
import { Link as RouterLink } from 'react-router'
import { call, useApiQuery } from '../../../api'
import { cardSurface, displayTitle, eyebrow, formatRecentTime, ProposalCard } from '../../../components'
import { tokens } from '../../../theme'
import { PROPOSAL_TITLE_MAX, useProposalDecision } from '../../proposals'
import { DayAdjustmentCard, latestAdjustment, todayLocal } from '../../quick-log'
import { eventView, proposalView } from './event-view'
import { useRefreshAfterDecision } from './useEventFeed'

const { font } = tokens

interface AiCardProps {
  /** DayView.proposals.latest: the newest pending proposal, as the day knows it. */
  latest: Proposal | null
  pendingCount: number
  /** The live feed, newest first. */
  events: readonly AiEvent[]
}

/** How far back a safety flag still shows on Today (the nightly job notes each kind at most once a week). */
const FLAG_DAYS = 7

type NoteEvent = Extract<AiEvent, { kind: 'note' }>

const pulse = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.55; transform: scale(0.86); }
`

/** A section of the card after the first: a hairline above it. */
const SECTION = { mt: '16px', pt: '14px', borderTop: `1px solid ${tokens.ink.hairline}` } as const

/**
 * The newest safety-flag note of the last FLAG_DAYS days. The nightly job writes each flag as a note whose body
 * carries `flag` (rapid_loss, plateau, protein_low, low_steps_stalled); every meal analysis also writes a note, so a
 * flag would otherwise fall out of the event slot by lunchtime.
 */
function latestFlag(events: readonly AiEvent[], now = Date.now()): NoteEvent | null {
  const since = new Date(now - FLAG_DAYS * 86_400_000).toISOString()
  return (
    events.find(
      (e): e is NoteEvent =>
        e.kind === 'note' && e.created_at >= since && typeof (e.body as { flag?: unknown }).flag === 'string',
    ) ?? null
  )
}

/** The freshest copy of a proposal: the feed's, when it has the same id with a later update. */
function freshest(latest: Proposal | null, events: readonly AiEvent[]): Proposal | null {
  const fromFeed = events.find((e): e is Proposal => e.kind === 'proposal' && e.proposal_status === 'pending')
  if (!latest) return fromFeed ?? null
  const same = events.find((e): e is Proposal => e.kind === 'proposal' && e.id === latest.id)
  return same && same.updated_at > latest.updated_at ? same : latest
}

export function AiCard({ latest, pendingCount, events }: AiCardProps) {
  const titleId = useId()
  const today = todayLocal()
  const proposal = freshest(latest, events)
  const adjustment = latestAdjustment(events, today)
  // Adjustments show as their own section (today's only; an older one is stale), so the event slot skips them.
  const first = proposal ? null : events.find((e) => e.kind !== 'proposal' || e.proposal_status !== 'pending')
  const event = first && first.kind !== 'adjustment' ? first : null
  const flag = latestFlag(events)
  // The flag shows at the top, so the event slot does not repeat it.
  const slotEvent = event && event.id === flag?.id ? null : event
  const newest = [adjustment, proposal, slotEvent, flag]
    .flatMap((e) => (e ? [e.created_at] : []))
    .sort()
    .at(-1)
  const sections = [
    flag && (
      <Alert key="flag" severity="warning" data-testid="today-flag">
        <Box sx={{ fontWeight: font.weight.label }}>Safety flag · {formatRecentTime(flag.created_at)}</Box>
        {flag.summary}
      </Alert>
    ),
    adjustment && (
      <DayAdjustmentCard key="adjustment" date={today} adjustment={adjustment} variant="embedded" />
    ),
    slotEvent && <EventSection key="event" event={slotEvent} />,
    proposal && <ProposalSlot key={proposal.id} proposal={proposal} pendingCount={pendingCount} />,
  ].filter(Boolean)

  return (
    <Box
      component="section"
      aria-labelledby={titleId}
      data-testid="today-ai"
      sx={{
        ...cardSurface,
        height: '100%',
        boxSizing: 'border-box',
        minWidth: 0,
        px: `${tokens.pad.card.x}px`,
        py: `${tokens.pad.card.y}px`,
      }}
    >
      <Box sx={{ ...eyebrow, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <AutoAwesomeRounded
          aria-hidden
          sx={{
            fontSize: 18,
            color: tokens.accent.main,
            flex: 'none',
            animation: `${pulse} 2600ms ease-in-out infinite`,
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        />
        <Box component="h2" id={titleId} sx={{ m: 0, font: 'inherit', flex: 1, minWidth: 0 }}>
          AI check-in
        </Box>
        {newest && (
          <Box component="span" sx={{ textTransform: 'none', letterSpacing: 0, flex: 'none' }}>
            {formatRecentTime(newest)}
          </Box>
        )}
      </Box>
      {sections.length === 0 ? (
        <Box
          sx={{
            mt: '10px',
            fontSize: font.size.emphasis,
            lineHeight: font.leading.emphasis,
            color: tokens.ink.body,
          }}
        >
          Day adjustments, proposals and notes from the AI show here.
        </Box>
      ) : (
        sections.map((section, i) => (
          <Box key={i} sx={i === 0 ? { mt: '10px' } : SECTION}>
            {section}
          </Box>
        ))
      )}
    </Box>
  )
}

/** Keyed by the proposal's id, so a decision never carries over to the next proposal in the slot. */
function ProposalSlot({ proposal, pendingCount }: { proposal: Proposal; pendingCount: number }) {
  const refresh = useRefreshAfterDecision()
  const [showWhy, setShowWhy] = useState(false)
  const d = useProposalDecision(
    proposal.proposal_status,
    (decision) =>
      call(decision === 'accepted' ? endpoints.plan.acceptProposal : endpoints.plan.rejectProposal, {
        params: { id: proposal.id },
      }),
    () => refresh(),
  )
  const view = proposalView(proposal)
  const short = proposal.summary.length <= PROPOSAL_TITLE_MAX

  return (
    // Inside the check-in card the proposal drops its own card: no padding, shadow or fill (kit request: a flat look).
    <Box
      sx={{
        '& > [data-testid="today-proposal"]': {
          p: 0,
          boxShadow: 'none',
          borderRadius: 0,
          bgcolor: 'transparent',
        },
      }}
    >
      <ProposalCard
        testId="today-proposal"
        headingComponent="h3"
        title={short ? proposal.summary : view.title}
        source={view.source}
        summary={short ? null : proposal.summary}
        changes={view.changes}
        status={d.status}
        busy={d.busy}
        onAccept={d.onAccept}
        onReject={d.onReject}
        onWhy={view.why.length ? () => setShowWhy((v) => !v) : undefined}
      >
        {(showWhy || d.notes) && (
          <Box sx={{ display: 'grid', gap: 2 }}>
            {showWhy && (
              <Box>
                <Box
                  component="ul"
                  data-testid="proposal-why"
                  sx={{ m: 0, pl: 5, fontSize: font.size.small, color: tokens.ink.text, lineHeight: 1.5 }}
                >
                  {view.why.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </Box>
                <Link
                  component={RouterLink}
                  to="/plan"
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    minHeight: tokens.tapTarget,
                    fontSize: font.size.small,
                    fontWeight: font.weight.label,
                  }}
                >
                  Plan history and the rails it was checked against
                </Link>
              </Box>
            )}
            {d.notes}
          </Box>
        )}
      </ProposalCard>
      {pendingCount > 1 && (
        <Box sx={{ mt: 2, fontSize: font.size.small, color: tokens.ink.muted }}>
          {pendingCount - 1} more {pendingCount - 1 === 1 ? 'proposal waits' : 'proposals wait'} in the{' '}
          <Link component={RouterLink} to="/ai" underline="always" color="inherit">
            AI tab
          </Link>
          .
        </Box>
      )}
    </Box>
  )
}

/** The latest AI event that is not a pending proposal or an adjustment: its source, title, text, details and link. */
function EventSection({ event }: { event: AiEvent }) {
  const favouriteIds =
    event.kind === 'adjustment'
      ? event.body.suggestions.flatMap((s) => (s.favorite_id ? [s.favorite_id] : []))
      : []
  const favourites = useApiQuery(
    endpoints.nutrition.listFavourites,
    {},
    { enabled: favouriteIds.length > 0, staleTime: 5 * 60_000 },
  )
  const view = eventView(event, (id) => favourites.data?.find((f) => f.id === id)?.label ?? null)
  return (
    <Box
      component="article"
      aria-label={view.title}
      data-testid="today-event"
      data-kind={event.kind}
      sx={{ minWidth: 0 }}
    >
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          fontSize: font.size.small,
          fontWeight: font.weight.heading,
          color: tokens.accent.main,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>{view.source}</Box>
        <Box
          sx={{
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
            color: tokens.ink.muted,
            fontWeight: font.weight.body,
          }}
        >
          {formatRecentTime(event.created_at)}
        </Box>
      </Box>
      <Box component="h3" sx={{ ...displayTitle('card'), m: 0, mt: '6px' }}>
        {view.title}
      </Box>
      {view.text && (
        <Box
          sx={{
            mt: '4px',
            fontSize: font.size.emphasis,
            color: tokens.ink.body,
            lineHeight: font.leading.emphasis,
          }}
        >
          {view.text}
        </Box>
      )}
      {view.details.length > 0 && (
        <Box
          component="ul"
          sx={{
            m: 0,
            mt: 2,
            pl: 5,
            fontSize: font.size.small,
            color: tokens.ink.body,
            lineHeight: font.leading.small,
          }}
        >
          {view.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </Box>
      )}
      {view.link && (
        <Link
          component={RouterLink}
          to={view.link.to}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: tokens.tapTarget,
            mt: 1,
            fontSize: font.size.small,
            fontWeight: font.weight.heading,
          }}
        >
          {view.link.label}
        </Link>
      )}
    </Box>
  )
}
