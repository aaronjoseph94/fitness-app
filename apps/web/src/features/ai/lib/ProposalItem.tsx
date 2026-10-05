// Owns: one Ask AI proposal card with its decision — a proposal goes to POST /api/proposals/:id/accept|reject (the
// Worker decides per kind and says what accepting made, so the card can link to it); a proposed week plan goes to
// POST /api/week-plans/:id/apply|reject. The card shows the decision at once, rolls back if the server refuses, then
// the whole app refreshes.
import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import { endpoints } from '@fitness/shared/api'
import type { ChatProposal, ProposalApplied, ProposalBody } from '@fitness/shared/schemas'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router'
import { call } from '../../../api'
import { ProposalCard } from '../../../components'
import { tokens } from '../../../theme'
import { useProposalDecision, type Decision } from '../../proposals'
import { chatProposalView } from './proposal-view'

type FollowUp = { to: string; label: string } | null

const WEEK_LINK = { to: '/progress', label: 'See the week on Progress' }

/** Where to look at what accepting changed: the Worker's `applied`, else the kind's own page. */
function followUp(body: ProposalBody, applied: ProposalApplied | null): FollowUp {
  if (applied?.entity === 'template') return { to: `/train/builder/${applied.id}`, label: 'Open the template' }
  if (applied?.entity === 'week_plan') return WEEK_LINK
  if (applied?.entity === 'settings') return { to: '/settings/reminders', label: 'Reminders' }
  return body.kind === 'plan_change' ? { to: '/plan', label: 'Plan history' } : null
}

/** Runs the decision; resolves with an in-app link to what accepting created, if any. */
async function decide(p: ChatProposal, decision: Decision): Promise<FollowUp> {
  if (p.type === 'week_plan') {
    if (decision === 'rejected') {
      await call(endpoints.weekPlans.reject, { params: { id: p.id } })
      return null
    }
    await call(endpoints.weekPlans.apply, { params: { id: p.id } })
    return WEEK_LINK
  }
  if (decision === 'rejected') {
    await call(endpoints.plan.rejectProposal, { params: { id: p.id } })
    return null
  }
  const { applied } = await call(endpoints.plan.acceptProposal, { params: { id: p.id } })
  return followUp(p.body, applied)
}

/** `source`: who proposed it ("Proposal · Coach"); default Ask AI, for the cards under a chat reply. */
export function ProposalItem({ proposal, source = 'Proposal · Ask AI' }: { proposal: ChatProposal; source?: string }) {
  const view = chatProposalView(proposal)
  const [link, setLink] = useState<FollowUp>(null)
  const d = useProposalDecision(view.status, (decision) => decide(proposal, decision), (_, created) => setLink(created))

  return (
    <ProposalCard
      testId="ask-ai-proposal"
      source={view.replaced ? 'Proposal · rejected or replaced by a newer plan' : source}
      title={view.title}
      summary={view.summary}
      changes={view.changes}
      status={view.replaced ? 'rejected' : d.status}
      busy={d.busy}
      onAccept={d.onAccept}
      onReject={d.onReject}
    >
      {(link || d.notes) && (
        <Box sx={{ display: 'grid', gap: 2 }}>
          {link && (
            <Link component={RouterLink} to={link.to} sx={{ display: 'inline-flex', alignItems: 'center', minHeight: tokens.tapTarget, fontSize: tokens.font.size.small, fontWeight: tokens.font.weight.label }}>
              {link.label}
            </Link>
          )}
          {d.notes}
        </Box>
      )}
    </ProposalCard>
  )
}
