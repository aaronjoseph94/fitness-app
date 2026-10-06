// Owns: the AI tab's "Waiting for your tap" list — every pending proposal in the live feed (from Ask AI, the nightly
// workout draft or the weekly review) not already shown in the open thread, so Today's "more proposals wait in the
// AI tab" has somewhere to land. Each card says who proposed it (the Coach, the AI clerk), as on Today.
import Box from '@mui/material/Box'
import { endpoints } from '@fitness/shared/api'
import type { ChatProposal, Proposal } from '@fitness/shared/schemas'
import { useApiQuery } from '../../../api'
import { actorLabel } from '../../proposals'
import { SectionHeader } from '../../../components'
import { ProposalItem } from './ProposalItem'
import { useThreadStore } from './thread-store'

const SHOWN = 5

const asChatProposal = (p: Proposal): ChatProposal => ({ type: 'proposal', id: p.id, summary: p.summary, status: p.proposal_status, body: p.body })

/**
 * The proposals waiting for a tap that the open thread is not already showing. Exported so the page can tell whether
 * there is a rail worth laying out at all — a desktop with nothing waiting hands the thread the whole width rather
 * than leaving a rail-shaped hole beside it.
 */
export function usePendingProposals(): Proposal[] {
  const feed = useApiQuery(endpoints.day.events, { query: {} }, { staleTime: 30_000, refetchInterval: 60_000 })
  // The open thread already shows its own proposals under the replies that made them.
  const threadId = useThreadStore((s) => s.threadId)
  const fresh = useThreadStore((s) => s.fresh)
  const thread = useApiQuery(endpoints.ai.chatHistory, { query: { thread_id: threadId } }, { enabled: !fresh, staleTime: 60_000 })
  const inThread = new Set((thread.data ?? []).flatMap((m) => m.proposals.map((p) => p.id)))
  return (feed.data?.events ?? [])
    .filter((e): e is Proposal => e.kind === 'proposal' && e.proposal_status === 'pending' && !inThread.has(e.id))
    .reverse()
}

export function PendingProposals() {
  const pending = usePendingProposals()
  if (pending.length === 0) return null
  return (
    <Box component="section" aria-labelledby="ask-ai-pending-title" data-testid="ask-ai-pending">
      <SectionHeader
        id="ask-ai-pending"
        title="Waiting for your tap"
        subtitle={pending.length > SHOWN ? `The newest ${SHOWN} of ${pending.length}.` : 'Nothing changes until you accept.'}
      />
      <Box sx={{ display: 'grid', gap: 3 }}>
        {pending.slice(0, SHOWN).map((p) => (
          <ProposalItem key={p.id} proposal={asChatProposal(p)} source={`Proposal · ${actorLabel(p.actor)}`} />
        ))}
      </Box>
    </Box>
  )
}
