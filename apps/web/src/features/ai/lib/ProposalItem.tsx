// Owns: one Ask AI proposal with its decision, in 1d's two forms — the white card of the rail ("Waiting for your tap",
// "Recent Train changes": source and time, title, before → after rows in warm wells, "Why:", Accept in deep ink /
// Reject in soft violet, a Plan history link) and the deep-sky strip under the chat reply that made it (its changes
// inline, the new value in gold, white Accept and an outlined Reject). A proposal goes to POST
// /api/proposals/:id/accept|reject (the Worker decides per kind and says what accepting made, so the card can link to
// it); a proposed week plan goes to POST /api/week-plans/:id/apply|reject. The card shows the decision at once, rolls
// back if the server refuses, then the whole app refreshes. An applied Train change, or a workout that replaced a
// template, also has Undo (POST /api/train-changes/:id/revert), which says "Undone" the same way.
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import { endpoints } from '@fitness/shared/api'
import type { ChatProposal, ProposalApplied, ProposalBody } from '@fitness/shared/schemas'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router'
import { apiQueryKey, call, isApiError, problemText } from '../../../api'
import {
  BeforeAfterList,
  deepSkyRule,
  formatRecentTime,
  tabularNums,
  visuallyHidden,
  type ProposalStatus,
} from '../../../components'
import { useOnline } from '../../../offline'
import { COARSE_POINTER_QUERY, tokens } from '../../../theme'
import { useProposalDecision, type Decision } from '../../proposals'
import { chatProposalView } from './proposal-view'

type FollowUp = { to: string; label: string } | null

const WEEK_LINK = { to: '/progress', label: 'See the week on Progress' }
const PLAN_LINK = { to: '/plan', label: 'Plan history' }
const TRAIN_LINK = { to: '/train', label: 'See it on Train' }
const PROGRESS_LINK = { to: '/progress', label: 'See it on Progress' }
const templateLink = (id: string) => ({ to: `/train/builder/${id}`, label: 'Open the template' })

/** Where to look at what accepting changed: the Worker's `applied`, else the kind's own page. */
function followUp(body: ProposalBody, applied: ProposalApplied | null): FollowUp {
  // Train's own changes first: new training days also come back as `settings`, which would otherwise read as Reminders.
  if (body.kind === 'training_days') return TRAIN_LINK
  // A new goal moves the forecast, which Progress draws.
  if (body.kind === 'goal_change') return PROGRESS_LINK
  if (body.kind === 'train_change') {
    const c = body.change
    if (c.op === 'template_create')
      return applied?.entity === 'template' ? templateLink(applied.id) : TRAIN_LINK
    if (c.op === 'template_update') return templateLink(c.template_id)
    return c.op === 'template_delete' ? TRAIN_LINK : null
  }
  if (applied?.entity === 'template') return templateLink(applied.id)
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
const UNDONE_TEXT = { text: 'Undone', color: tokens.ink.label }

const deepSky = tokens.summit.deepSky

/** The strip's buttons: white with deep ink (Accept, 16.4:1) and a white-outlined ghost (Reject, Undo). */
const onDarkSolid = {
  bgcolor: tokens.dark.text,
  color: tokens.dark.bg,
  '&:hover': { bgcolor: tokens.summit.surface.soft },
  '&.Mui-disabled': { bgcolor: tokens.summit.glass.fill, color: tokens.summit.onSky.disabled },
} as const
const onDarkGhost = {
  bgcolor: 'transparent',
  color: deepSky.text,
  border: `1px solid ${tokens.summit.glass.tileBorder}`,
  '&:hover': { bgcolor: tokens.summit.glass.fill, border: `1px solid ${tokens.summit.glass.tileBorder}` },
  '&.Mui-disabled': {
    color: tokens.summit.onSky.disabled,
    border: `1px solid ${tokens.summit.glass.border}`,
  },
} as const

interface UndoNote {
  text: string
  severity: 'error' | 'info'
}

/**
 * Undo for an applied change: "Undone" shows at once, rolls back with the reason if the server refuses (an already
 * undone change, 409 already_reverted, stays "Undone"), and the whole app refreshes. Waits for a connection like a decision does.
 */
function useUndo(id: string, alreadyUndone: boolean) {
  const online = useOnline()
  const queryClient = useQueryClient()
  const [undone, setUndone] = useState(false)
  const [note, setNote] = useState<UndoNote | null>(null)
  const refresh = () => void queryClient.invalidateQueries({ queryKey: apiQueryKey() })
  const mutation = useMutation({
    networkMode: 'always',
    mutationFn: () => call(endpoints.training.revertChange, { params: { id } }),
    onSuccess: refresh,
    onError: (e) => {
      // Only an already-reverted change is "Undone"; any other refusal (409 not_applied too) rolls back with its reason.
      if (isApiError(e) && e.code === 'already_reverted') {
        setNote({ text: 'Already undone', severity: 'info' })
        refresh()
        return
      }
      setUndone(false)
      setNote({ text: `That didn't go through: ${problemText(e)}`, severity: 'error' })
    },
  })
  return {
    undone: alreadyUndone || undone,
    busy: mutation.isPending,
    onUndo: online
      ? () => {
          setNote(null)
          setUndone(true)
          mutation.mutate()
        }
      : undefined,
    note,
    clearNote: () => setNote(null),
  }
}

const linkSx = {
  display: 'inline-flex',
  alignItems: 'center',
  fontSize: tokens.font.size.small,
  fontWeight: tokens.font.weight.heading,
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

export function ProposalItem({
  proposal,
  source = 'Proposal · Ask AI',
  when,
  variant = 'card',
}: ProposalItemProps) {
  const view = chatProposalView(proposal)
  const [link, setLink] = useState<FollowUp>(null)
  const d = useProposalDecision(
    view.status,
    (decision) => decide(proposal, decision),
    (_, created) => setLink(created),
  )
  const u = useUndo(proposal.id, view.undone)
  const strip = variant === 'strip'
  const status = view.replaced ? 'rejected' : d.status
  const decided = u.undone ? UNDONE_TEXT : status === 'pending' ? null : STATUS_TEXT[status]
  // Not while the accept is still in flight: the change may yet be refused and rolled back.
  const canUndo =
    view.revertible && !u.undone && !d.busy && (status === 'accepted' || status === 'auto_applied')

  const decision = decided ? (
    <>
      <Box
        sx={{
          fontSize: tokens.font.size.small,
          fontWeight: tokens.font.weight.heading,
          // On the deep sky: done in light teal, the rest in the sky's muted white.
          color: strip
            ? decided.color === tokens.tone.success.text
              ? tokens.tone.success.light
              : deepSky.muted
            : decided.color,
        }}
      >
        {view.replaced ? 'Rejected or replaced by a newer plan' : decided.text}
      </Box>
      {canUndo && (
        <Button
          variant="outlined"
          size="dense"
          aria-label={`Undo: ${view.title}`}
          onClick={u.onUndo}
          disabled={d.busy || u.busy || !u.onUndo}
          sx={strip ? onDarkGhost : undefined}
        >
          Undo
        </Button>
      )}
    </>
  ) : (
    <>
      <Button
        variant="contained"
        color="dark"
        size="dense"
        onClick={d.onAccept}
        disabled={d.busy || !d.onAccept}
        sx={strip ? onDarkSolid : { px: '16px' }}
      >
        Accept
      </Button>
      <Button
        variant="outlined"
        size="dense"
        onClick={d.onReject}
        disabled={d.busy || !d.onReject}
        sx={strip ? onDarkGhost : undefined}
      >
        Reject
      </Button>
    </>
  )
  // What accepting made is gone once it is undone, so its link goes too.
  const shownLink = u.undone ? null : link
  const after = (shownLink || d.notes || u.note) && (
    <Box sx={{ display: 'grid', gap: 2, mt: '8px', justifyItems: 'start' }}>
      {shownLink && (
        <Link
          component={RouterLink}
          to={shownLink.to}
          sx={
            strip ? { ...linkSx, color: tokens.summit.gold.main, '&:hover': { color: deepSky.text } } : linkSx
          }
        >
          {shownLink.label}
        </Link>
      )}
      {d.notes}
      {u.note && (
        <Alert severity={u.note.severity} onClose={u.clearNote}>
          {u.note.text}
        </Alert>
      )}
    </Box>
  )
  const title = (
    <Box
      component="h3"
      sx={{
        m: 0,
        fontSize: strip ? tokens.font.size.body : tokens.font.size.itemTitle,
        fontWeight: tokens.font.weight.heading,
        lineHeight: tokens.font.leading.itemTitle,
        color: strip ? deepSky.text : tokens.ink.text,
      }}
    >
      {view.title}
    </Box>
  )

  if (strip)
    return (
      <Box
        data-testid="ask-ai-proposal"
        data-status={u.undone ? 'undone' : status}
        sx={{
          px: '16px',
          py: '14px',
          borderRadius: `${tokens.summit.radius.wellLarge}px`,
          background: deepSky.bg,
          color: deepSky.text,
          fontSize: tokens.font.size.small,
          lineHeight: tokens.font.leading.small,
          // A narrow thread (~300 px at 1,024): a long word breaks instead of running out of the strip.
          overflowWrap: 'break-word',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px 12px' }}>
          {/* 220 px before the buttons wrap under the title: never squeezed to a word a line (NOTES). */}
          <Box
            sx={{ flex: '1 1 220px', minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: '12px' }}
          >
            <AutoAwesomeRounded
              aria-hidden
              sx={{ fontSize: 22, color: tokens.summit.gold.deep, flex: 'none', mt: '1px' }}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {title}
              {/* A short summary is already the title (planChangeHeading); don't say it twice. */}
              {view.summary !== view.title && (
                <Box sx={{ fontWeight: tokens.font.weight.body, color: deepSky.muted }}>{view.summary}</Box>
              )}
              {view.changes.length > 0 && (
                <Box
                  component="dl"
                  sx={{ m: 0, mt: '4px', display: 'grid', gap: '2px', fontWeight: tokens.font.weight.body }}
                >
                  {view.changes.map((c) => (
                    <Box
                      key={c.label}
                      sx={{ display: 'flex', flexWrap: 'wrap', columnGap: '6px', color: deepSky.muted }}
                    >
                      <Box component="dt">{c.label}</Box>
                      <Box component="dd" sx={{ m: 0, ...tabularNums }}>
                        <s>{c.from}</s>
                        <Box component="span" aria-hidden sx={{ mx: '5px' }}>
                          →
                        </Box>
                        <Box component="span" sx={visuallyHidden}>
                          , changes to{' '}
                        </Box>
                        <Box
                          component="b"
                          sx={{ fontWeight: tokens.font.weight.heading, color: tokens.summit.gold.main }}
                        >
                          {c.to}
                        </Box>
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', ml: 'auto' }}>
            {decision}
          </Box>
        </Box>
        {/* The reason, as on the rail card; a workout's rationale is already its summary line, so not twice. */}
        {view.why && view.why !== view.summary && (
          <Box
            sx={{
              mt: '10px',
              pt: '10px',
              borderTop: deepSkyRule,
              fontSize: tokens.font.size.caption,
              lineHeight: tokens.font.leading.small,
              color: deepSky.muted,
            }}
          >
            Why: {view.why}
          </Box>
        )}
        {after}
      </Box>
    )

  return (
    <Box
      data-testid="ask-ai-proposal"
      data-status={u.undone ? 'undone' : status}
      sx={{
        px: '20px',
        py: '18px',
        borderRadius: `${tokens.radius.tile}px`,
        bgcolor: tokens.ink.card,
        boxShadow: tokens.elevation.card,
        minWidth: 0,
        overflowWrap: 'break-word',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: tokens.font.size.caption,
          fontWeight: tokens.font.weight.heading,
          color: tokens.ink.muted,
        }}
      >
        <AutoAwesomeRounded aria-hidden sx={{ fontSize: 16, color: tokens.summit.plum, flex: 'none' }} />
        <Box
          component="span"
          sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {view.replaced ? 'Proposal · rejected or replaced by a newer plan' : source}
        </Box>
        {when && (
          <Box component="span" sx={{ flex: 'none', fontVariantNumeric: 'tabular-nums' }}>
            {formatRecentTime(when)}
          </Box>
        )}
      </Box>
      <Box sx={{ mt: '8px' }}>{title}</Box>
      {/* 2a's rail card says it with its before → after rows; the summary line stands in only where there are none. */}
      {view.changes.length > 0 ? (
        <Box sx={{ mt: '10px' }}>
          <BeforeAfterList changes={view.changes} />
        </Box>
      ) : (
        // A short summary is already the title; don't say it twice.
        view.summary !== view.title && (
          <Box
            sx={{
              mt: '4px',
              fontSize: tokens.font.size.small,
              fontWeight: tokens.font.weight.body,
              lineHeight: tokens.font.leading.small,
              color: tokens.ink.muted,
            }}
          >
            {view.summary}
          </Box>
        )
      )}
      {view.why && (
        <Box
          sx={{
            mt: '10px',
            fontSize: tokens.font.size.small,
            fontWeight: tokens.font.weight.body,
            lineHeight: tokens.font.leading.body,
            color: tokens.ink.muted,
          }}
        >
          Why: {view.why}
        </Box>
      )}
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', mt: '12px' }}>
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
