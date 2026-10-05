// Owns: Today's AI slot — the newest safety flag of the last 7 days (rapid loss, plateau, protein low; shown, never
// applied) as a warning above everything else; the latest pending proposal as a ProposalCard (Accept / Reject / Why →
// POST /api/proposals/:id/accept|reject through the shared decision hook; Why links to the plan history), or else the
// latest AI event (review, note, change) from the live feed; and under it today's day adjustment card (remaining kcal
// and macros, protein status, next-meal ideas) when the AI has made one today.
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import { endpoints } from '@fitness/shared/api'
import type { AiEvent, Proposal } from '@fitness/shared/schemas'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router'
import { call, useApiQuery } from '../../../api'
import { ProposalCard } from '../../../components'
import { tokens } from '../../../theme'
import { useProposalDecision } from '../../proposals'
import { DayAdjustmentCard, latestAdjustment, todayLocal } from '../../quick-log'
import { eventView, proposalView, whenLabel } from './event-view'
import { useRefreshAfterDecision } from './useEventFeed'

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

/**
 * The newest safety-flag note of the last FLAG_DAYS days. The nightly job writes each flag as a note whose body
 * carries `flag` (rapid_loss, plateau, protein_low, low_steps_stalled); every meal analysis also writes a note, so a
 * flag would otherwise fall out of the event slot by lunchtime.
 */
function latestFlag(events: readonly AiEvent[], now = Date.now()): NoteEvent | null {
  const since = new Date(now - FLAG_DAYS * 86_400_000).toISOString()
  return (
    events.find(
      (e): e is NoteEvent => e.kind === 'note' && e.created_at >= since && typeof (e.body as { flag?: unknown }).flag === 'string',
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
  const today = todayLocal()
  const adjustment = latestAdjustment(events, today)
  const proposal = freshest(latest, events)
  // Adjustments show as their own card (today's only; an older one is stale), so the event slot skips them.
  const first = proposal ? null : events.find((e) => e.kind !== 'proposal' || e.proposal_status !== 'pending')
  const event = first && first.kind !== 'adjustment' ? first : null
  const flag = latestFlag(events)
  // The flag shows above the slot, so the slot does not repeat it.
  const slotEvent = event && event.id === flag?.id ? null : event
  const main = proposal ? <ProposalSlot key={proposal.id} proposal={proposal} pendingCount={pendingCount} /> : slotEvent ? <EventCard event={slotEvent} /> : null
  if (!adjustment && !flag) return main
  return (
    <Stack spacing={4}>
      {flag && (
        <Alert severity="warning" data-testid="today-flag">
          <Box sx={{ fontWeight: tokens.font.weight.label }}>Safety flag · {whenLabel(flag.created_at)}</Box>
          {flag.summary}
        </Alert>
      )}
      {main}
      {adjustment && <DayAdjustmentCard date={today} adjustment={adjustment} />}
    </Stack>
  )
}

/** Keyed by the proposal's id, so a decision never carries over to the next proposal in the slot. */
function ProposalSlot({ proposal, pendingCount }: { proposal: Proposal; pendingCount: number }) {
  const refresh = useRefreshAfterDecision()
  const [showWhy, setShowWhy] = useState(false)
  const d = useProposalDecision(
    proposal.proposal_status,
    (decision) => call(decision === 'accepted' ? endpoints.plan.acceptProposal : endpoints.plan.rejectProposal, { params: { id: proposal.id } }),
    () => refresh(),
  )
  const view = proposalView(proposal)

  return (
    <Box>
      <ProposalCard
        testId="today-proposal"
        title={view.title}
        source={`${view.source} · ${whenLabel(proposal.created_at)}`}
        summary={proposal.summary}
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
                <Box component="ul" data-testid="proposal-why" sx={{ m: 0, pl: 5, fontSize: tokens.font.size.small, color: tokens.ink.text, lineHeight: 1.5 }}>
                  {view.why.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </Box>
                <Link component={RouterLink} to="/plan" sx={{ display: 'inline-flex', alignItems: 'center', minHeight: tokens.tapTarget, fontSize: tokens.font.size.small, fontWeight: tokens.font.weight.label }}>
                  Plan history and the rails it was checked against
                </Link>
              </Box>
            )}
            {d.notes}
          </Box>
        )}
      </ProposalCard>
      {pendingCount > 1 && (
        <Box sx={{ mt: 2, px: 1, fontSize: tokens.font.size.label, color: tokens.ink.secondary }}>
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

function EventCard({ event }: { event: AiEvent }) {
  const favouriteIds =
    event.kind === 'adjustment' ? event.body.suggestions.flatMap((s) => (s.favorite_id ? [s.favorite_id] : [])) : []
  const favourites = useApiQuery(endpoints.nutrition.listFavourites, {}, { enabled: favouriteIds.length > 0, staleTime: 5 * 60_000 })
  const view = eventView(event, (id) => favourites.data?.find((f) => f.id === id)?.label ?? null)
  return (
    <Card data-testid="today-event" data-kind={event.kind} sx={{ p: 4 }}>
      <Box sx={{ display: 'flex', gap: 2, fontSize: tokens.font.size.label, fontWeight: tokens.font.weight.label, color: tokens.ink.secondary }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>{view.source}</Box>
        <Box sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{whenLabel(event.created_at)}</Box>
      </Box>
      <Box component="h3" sx={{ m: 0, mt: 1.5, fontSize: tokens.font.size.cardTitle, fontWeight: tokens.font.weight.heading, lineHeight: 1.3 }}>
        {view.title}
      </Box>
      {view.text && <Box sx={{ mt: 1.5, fontSize: tokens.font.size.emphasis, color: tokens.ink.secondary, lineHeight: 1.5 }}>{view.text}</Box>}
      {view.details.length > 0 && (
        <Box component="ul" sx={{ m: 0, mt: 2, pl: 5, fontSize: tokens.font.size.small, color: tokens.ink.text, lineHeight: 1.5 }}>
          {view.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </Box>
      )}
      {view.link && (
        <Link component={RouterLink} to={view.link.to} sx={{ display: 'inline-flex', alignItems: 'center', minHeight: tokens.tapTarget, mt: 1, fontWeight: tokens.font.weight.label }}>
          {view.link.label}
        </Link>
      )}
    </Card>
  )
}
