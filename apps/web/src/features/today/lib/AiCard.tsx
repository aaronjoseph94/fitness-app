// Owns: Today's AI slot — the latest pending proposal as a ProposalCard (Accept / Reject / Why → POST
// /api/proposals/:id/accept|reject, shown decided at once and rolled back if the server refuses; Why links to the plan
// history), or else the latest AI event (review, note, change) from the live feed; and under it today's day
// adjustment card (remaining kcal and macros, protein status, next-meal ideas) when the AI has made one today.
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import { endpoints } from '@fitness/shared/api'
import type { AiEvent, Proposal } from '@fitness/shared/schemas'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router'
import { useApiMutation, useApiQuery } from '../../../api'
import { useOnline } from '../../../offline'
import { ProposalCard, type ProposalStatus } from '../../../components'
import { tokens } from '../../../theme'
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
  const main = proposal ? <ProposalSlot proposal={proposal} pendingCount={pendingCount} /> : event ? <EventCard event={event} /> : null
  if (!adjustment) return main
  return (
    <Stack spacing={4}>
      {main}
      <DayAdjustmentCard date={today} adjustment={adjustment} />
    </Stack>
  )
}

function ProposalSlot({ proposal, pendingCount }: { proposal: Proposal; pendingCount: number }) {
  const online = useOnline()
  const refresh = useRefreshAfterDecision()
  const [decision, setDecision] = useState<{ id: string; status: ProposalStatus } | null>(null)
  const [showWhy, setShowWhy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const settle = {
    onSuccess: () => refresh(),
    onError: (e: Error) => {
      setDecision(null)
      setError(`That didn't go through: ${e.message}`)
    },
  }
  const accept = useApiMutation(endpoints.plan.acceptProposal, settle)
  const reject = useApiMutation(endpoints.plan.rejectProposal, settle)
  const view = proposalView(proposal)
  const status = decision?.id === proposal.id ? decision.status : proposal.proposal_status
  const busy = accept.isPending || reject.isPending

  const decide = (status: 'accepted' | 'rejected') => {
    setError(null)
    setDecision({ id: proposal.id, status })
    ;(status === 'accepted' ? accept : reject).mutate({ params: { id: proposal.id } })
  }

  return (
    <Box>
      <ProposalCard
        testId="today-proposal"
        title={view.title}
        source={`${view.source} · ${whenLabel(proposal.created_at)}`}
        summary={proposal.summary}
        changes={view.changes}
        status={status}
        busy={busy}
        onAccept={online ? () => decide('accepted') : undefined}
        onReject={online ? () => decide('rejected') : undefined}
        onWhy={view.why.length ? () => setShowWhy((v) => !v) : undefined}
      >
        {(showWhy || error || !online) && (
          <Box sx={{ display: 'grid', gap: 2 }}>
            {showWhy && (
              <Box>
                <Box component="ul" data-testid="proposal-why" sx={{ m: 0, pl: 5, fontSize: 14, color: tokens.ink.text, lineHeight: 1.5 }}>
                  {view.why.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </Box>
                <Link component={RouterLink} to="/plan" sx={{ display: 'inline-flex', alignItems: 'center', minHeight: tokens.tapTarget, fontSize: 14, fontWeight: tokens.font.weight.label }}>
                  Plan history and the rails it was checked against
                </Link>
              </Box>
            )}
            {!online && status === 'pending' && (
              <Box sx={{ fontSize: 13, color: tokens.ink.secondary }}>Deciding needs a connection; it will wait here.</Box>
            )}
            {error && (
              <Alert severity="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}
          </Box>
        )}
      </ProposalCard>
      {pendingCount > 1 && (
        <Box sx={{ mt: 2, px: 1, fontSize: 13, color: tokens.ink.secondary }}>
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
      <Box component="h3" sx={{ m: 0, mt: 1.5, fontSize: 18, fontWeight: tokens.font.weight.heading, lineHeight: 1.3 }}>
        {view.title}
      </Box>
      {view.text && <Box sx={{ mt: 1.5, fontSize: 15, color: tokens.ink.secondary, lineHeight: 1.5 }}>{view.text}</Box>}
      {view.details.length > 0 && (
        <Box component="ul" sx={{ m: 0, mt: 2, pl: 5, fontSize: 14, color: tokens.ink.text, lineHeight: 1.5 }}>
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
