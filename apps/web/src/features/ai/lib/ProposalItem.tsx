// Owns: one Ask AI proposal with its decision, in 2a's two forms — the compact card of the "Waiting for your tap" rail
// (source and time, title, before → after rows, "Why:", Accept / Reject, a Plan history link) and the #FAFAFA strip
// under the chat reply that made it. A proposal goes to POST /api/proposals/:id/accept|reject (the Worker decides per
// kind and says what accepting made, so the card can link to it); a proposed week plan goes to POST
// /api/week-plans/:id/apply|reject. The card shows the decision at once, rolls back if the server refuses, then the
// whole app refreshes.
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import { endpoints } from '@fitness/shared/api'
import type { ChatProposal, ProposalApplied, ProposalBody } from '@fitness/shared/schemas'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router'
import { call } from '../../../api'
import { BeforeAfterList, formatRecentTime, type ProposalStatus } from '../../../components'
import { COARSE_POINTER_QUERY, tokens } from '../../../theme'
import { useProposalDecision, type Decision } from '../../proposals'
import { chatProposalView } from './proposal-view'

type FollowUp = { to: string; label: string } | null

const WEEK_LINK = { to: '/progress', label: 'See the week on Progress' }
const PLAN_LINK = { to: '/plan', label: 'Plan history' }

/** Where to look at what accepting changed: the Worker's `applied`, else the kind's own page. */
function followUp(body: ProposalBody, applied: ProposalApplied | null): FollowUp {
  if (applied?.entity === 'template') return { to: `/train/builder/${applied.id}`, label: 'Open the template' }
  if (applied?.entity === 'week_plan') return WEEK_LINK
  if (applied?.entity === 'settings') return { to: '/settings/reminders', label: 'Reminders' }
  return body.kind === 'plan_change' ? PLAN_LINK : null
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

const STATUS_TEXT: Record<Exclude<ProposalStatus, 'pending'>, { text: string; color: string }> = {
  accepted: { text: 'Accepted', color: tokens.tone.success.text },
  auto_applied: { text: 'Applied automatically', color: tokens.tone.success.text },
  rejected: { text: 'Rejected', color: tokens.ink.label },
}

const linkSx = {
  display: 'inline-flex',
  alignItems: 'center',
  fontSize: tokens.font.size.caption,
  fontWeight: tokens.font.weight.label,
  [COARSE_POINTER_QUERY]: { minHeight: tokens.tapTarget },
} as const

export interface ProposalItemProps {
  proposal: ChatProposal
  /** Who proposed it ("Proposal · Coach"); default Ask AI. */
  source?: string
  /** When it was proposed (an instant), shown at the right of the card's source line. */
  when?: string
  /** `card` in the rail (default); `strip` under the chat reply that made it. */
  variant?: 'card' | 'strip'
}

export function ProposalItem({ proposal, source = 'Proposal · Ask AI', when, variant = 'card' }: ProposalItemProps) {
  const view = chatProposalView(proposal)
  const [link, setLink] = useState<FollowUp>(null)
  const d = useProposalDecision(view.status, (decision) => decide(proposal, decision), (_, created) => setLink(created))
  const status = view.replaced ? 'rejected' : d.status
  const decided = status === 'pending' ? null : STATUS_TEXT[status]
  const strip = variant === 'strip'

  const decision = decided ? (
    <Box sx={{ fontSize: tokens.font.size.caption, fontWeight: tokens.font.weight.label, color: decided.color }}>
      {view.replaced ? 'Rejected or replaced by a newer plan' : decided.text}
    </Box>
  ) : (
    <>
      <Button variant="contained" color="dark" size="tiny" onClick={d.onAccept} disabled={d.busy || !d.onAccept}>
        Accept
      </Button>
      <Button variant="outlined" size="tiny" onClick={d.onReject} disabled={d.busy || !d.onReject}>
        Reject
      </Button>
    </>
  )
  const after = (link || d.notes) && (
    <Box sx={{ display: 'grid', gap: 2, mt: '8px', justifyItems: 'start' }}>
      {link && (
        <Link component={RouterLink} to={link.to} sx={linkSx}>
          {link.label}
        </Link>
      )}
      {d.notes}
    </Box>
  )
  const title = (
    <Box component="h3" sx={{ m: 0, fontSize: strip ? tokens.font.size.small : tokens.font.size.body, fontWeight: tokens.font.weight.heading, lineHeight: tokens.font.leading.label, color: tokens.ink.text }}>
      {view.title}
    </Box>
  )

  if (strip)
    return (
      <Box
        data-testid="ask-ai-proposal"
        data-status={status}
        sx={{
          px: '14px',
          py: '12px',
          borderRadius: `${tokens.radius.panel}px`,
          border: `1px solid ${tokens.ink.border}`,
          bgcolor: tokens.ink.panel,
          fontSize: tokens.font.size.small,
          lineHeight: tokens.font.leading.small,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <AutoAwesomeRounded aria-hidden sx={{ fontSize: 18, color: tokens.accent.main, flex: 'none' }} />
          <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
            {title}
            {/* A short summary is already the title (planChangeHeading); don't say it twice. */}
            {view.summary !== view.title && <Box sx={{ color: tokens.ink.muted }}>{view.summary}</Box>}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', ml: 'auto' }}>{decision}</Box>
        </Box>
        {view.changes.length > 0 && (
          <Box sx={{ mt: '10px' }}>
            <BeforeAfterList changes={view.changes} background={tokens.ink.card} />
          </Box>
        )}
        {after}
      </Box>
    )

  return (
    <Box
      data-testid="ask-ai-proposal"
      data-status={status}
      sx={{
        px: '16px',
        py: '14px',
        borderRadius: `${tokens.radius.card}px`,
        border: `1px solid ${tokens.ink.border}`,
        bgcolor: tokens.ink.card,
        boxShadow: tokens.elevation.card,
        minWidth: 0,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: tokens.font.size.caption, color: tokens.ink.muted }}>
        <AutoAwesomeRounded aria-hidden sx={{ fontSize: 16, color: tokens.accent.main, flex: 'none' }} />
        <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {view.replaced ? 'Proposal · rejected or replaced by a newer plan' : source}
        </Box>
        {when && <Box component="span" sx={{ flex: 'none', fontVariantNumeric: 'tabular-nums' }}>{formatRecentTime(when)}</Box>}
      </Box>
      <Box sx={{ mt: '8px' }}>{title}</Box>
      {/* 2a's rail card says it with its before → after rows; the summary line stands in only where there are none. */}
      {view.changes.length > 0 ? (
        <Box sx={{ mt: '8px' }}>
          <BeforeAfterList size="small" changes={view.changes} />
        </Box>
      ) : (
        <Box sx={{ mt: '2px', fontSize: tokens.font.size.caption, lineHeight: tokens.font.leading.small, color: tokens.ink.muted }}>{view.summary}</Box>
      )}
      {view.why && (
        <Box sx={{ mt: '8px', fontSize: tokens.font.size.caption, lineHeight: tokens.font.leading.small, color: tokens.ink.muted }}>Why: {view.why}</Box>
      )}
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', mt: '10px' }}>
        {decision}
        {!decided && proposal.type === 'proposal' && proposal.body.kind === 'plan_change' && (
          <Link component={RouterLink} to={PLAN_LINK.to} sx={{ ...linkSx, ml: 'auto' }}>
            {PLAN_LINK.label}
          </Link>
        )}
      </Box>
      {after}
    </Box>
  )
}
