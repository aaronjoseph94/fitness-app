// Owns: one Ask AI proposal card with its decision — Accept / Reject go to POST /api/proposals/:id/accept|reject (a
// workout is accepted by saving it as a template with its proposal_id; a week plan by POST /api/week-plans/:id/apply).
// The card shows the decision at once, rolls back if the server refuses, then the whole app refreshes.
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import { endpoints } from '@fitness/shared/api'
import type { ChatProposal } from '@fitness/shared/schemas'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router'
import { call } from '../../../api'
import { formatShortDate, ProposalCard, type ProposalStatus } from '../../../components'
import { useOnline } from '../../../offline'
import { tokens } from '../../../theme'
import { problemText } from '../../quick-log'
import { chatProposalView } from './proposal-view'

type Decision = 'accepted' | 'rejected'

/** Runs the decision; resolves with an in-app link to what accepting created, if any. */
async function decide(p: ChatProposal, decision: Decision): Promise<{ to: string; label: string } | null> {
  if (p.type === 'week_plan') {
    // A proposed week plan has no reject on the server: it stays proposed until a newer plan supersedes it.
    if (decision === 'rejected') return null
    await call(endpoints.weekPlans.apply, { params: { id: p.id } })
    return { to: '/progress', label: 'See the week on Progress' }
  }
  if (decision === 'rejected') {
    await call(endpoints.plan.rejectProposal, { params: { id: p.id } })
    return null
  }
  switch (p.body.kind) {
    case 'plan_change':
      await call(endpoints.plan.acceptProposal, { params: { id: p.id } })
      return { to: '/plan', label: 'Plan history' }
    case 'workout': {
      const template = await call(endpoints.training.createTemplate, {
        body: {
          id: crypto.randomUUID(),
          name: `AI · ${p.body.date ? formatShortDate(p.body.date) : 'workout'}`,
          origin: 'ai',
          notes: p.body.workout.rationale || undefined,
          exercises: p.body.workout.exercises,
          proposal_id: p.id,
        },
      })
      return { to: `/train/builder/${template.id}`, label: 'Open the template' }
    }
    case 'week_plan':
      await call(endpoints.weekPlans.apply, { params: { id: p.body.week_plan_id } })
      return { to: '/progress', label: 'See the week on Progress' }
  }
}

export function ProposalItem({ proposal }: { proposal: ChatProposal }) {
  const online = useOnline()
  const queryClient = useQueryClient()
  const view = chatProposalView(proposal)
  const [local, setLocal] = useState<ProposalStatus | null>(null)
  const [link, setLink] = useState<{ to: string; label: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mutation = useMutation({
    networkMode: 'always',
    mutationFn: (decision: Decision) => decide(proposal, decision),
    onSuccess: (created) => {
      setLink(created)
      void queryClient.invalidateQueries({ queryKey: ['api'] })
    },
    onError: (e) => {
      setLocal(null)
      setError(`That didn't go through: ${problemText(e)}`)
    },
  })
  const status = local ?? view.status
  const choose = (decision: Decision) => {
    setError(null)
    setLocal(decision)
    mutation.mutate(decision)
  }

  return (
    <ProposalCard
      testId="ask-ai-proposal"
      source={view.replaced ? 'Proposal · replaced by a newer plan' : 'Proposal · Ask AI'}
      title={view.title}
      summary={view.summary}
      changes={view.changes}
      status={view.replaced ? 'rejected' : status}
      busy={mutation.isPending}
      onAccept={online ? () => choose('accepted') : undefined}
      onReject={online ? () => choose('rejected') : undefined}
    >
      {(link || error || (!online && status === 'pending')) && (
        <Box sx={{ display: 'grid', gap: 2 }}>
          {link && (
            <Link component={RouterLink} to={link.to} sx={{ display: 'inline-flex', alignItems: 'center', minHeight: tokens.tapTarget, fontSize: 14, fontWeight: tokens.font.weight.label }}>
              {link.label}
            </Link>
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
  )
}
