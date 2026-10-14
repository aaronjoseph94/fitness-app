// Owns: one AI draft of the split on the Train tab (2a) — a pending `workout` proposal with a name ("Upper A") shown
// like a TemplateCard so it sits in the same grid: the 92 px muscle map from the draft's engine scores, the name,
// "N exercises · M sets · AI draft" with its main muscles, "Replaces your Upper A" when a template already has its name,
// and three actions — Keep (accept: the Worker makes the template, or replaces the one of that name in place), Preview
// (the AI page on this draft, to swap or start) and Dismiss (reject). Keep and Dismiss go through the shared proposal
// decision hook, so they wait offline and roll back with the reason if the Worker refuses. Once kept (here or by the
// week's Keep all) it shows the outcome, the link to the template and, when it replaced one, Undo (POST
// /api/train-changes/:id/revert: the old version comes back).
import BookmarkAddOutlined from '@mui/icons-material/BookmarkAddOutlined'
import CloseRounded from '@mui/icons-material/CloseRounded'
import UndoRounded from '@mui/icons-material/UndoRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import { endpoints } from '@fitness/shared/api'
import { muscleLevels } from '@fitness/shared/engine'
import type { Muscle, ProposalDecision } from '@fitness/shared/schemas'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router'
import { apiQueryKey, call, isApiError, problemText } from '../../../api'
import { cardSurface, outlinedIconButton } from '../../../components'
import { MUSCLE_LABELS, MuscleMap } from '../../../muscle-map'
import { COARSE_POINTER_QUERY, tokens } from '../../../theme'
import { pendingWorkoutPath, type PendingWorkout } from '../../builder'
import { useProposalDecision } from '../../proposals'
import type { KeptDraft } from './useTrainData'

/** "Open the template" after Keep: a text link, 44 px tall on touch. */
const OPEN_LINK = {
  display: 'inline-flex',
  alignItems: 'center',
  [COARSE_POINTER_QUERY]: { minHeight: tokens.tapTarget },
} as const

/** Dismiss is drawn at 26 px and pulled into the 20 px title line, so it adds no height there (the text sits where a
 * TemplateCard's does); on touch the drawn box stays 26 px and its hit area is 44 × 44 around it. */
const DISMISS_SIZE = 26
const DISMISS = {
  ...outlinedIconButton,
  my: '-3px',
  mr: '-2px',
  flex: 'none',
  color: tokens.ink.label,
  [COARSE_POINTER_QUERY]: {
    minWidth: 0,
    minHeight: 0,
    '&::after': { content: '""', position: 'absolute', inset: (DISMISS_SIZE - tokens.tapTarget) / 2 },
  },
} as const

/** Undo after a replacing Keep: idle, sending, done (the old version is back), or why it failed. */
type UndoState = { kind: 'idle' | 'busy' | 'done' } | { kind: 'failed'; message: string }

export interface DraftTemplateCardProps {
  draft: PendingWorkout
  /** The template Keep replaces in place (its name); null = Keep makes a new template. */
  replaces: string | null
  /** Set once this draft was kept from the Train tab (this card or Keep all). */
  kept: KeptDraft | null
  /** Called with this card's draft and the Worker's answer when its Keep went through. */
  onKept: (draft: PendingWorkout, decision: ProposalDecision) => void
}

/** Key the card by `draft.id` so a decision never carries over to the next draft. */
export function DraftTemplateCard({ draft, replaces, kept, onKept }: DraftTemplateCardProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [undo, setUndo] = useState<UndoState>({ kind: 'idle' })
  const d = useProposalDecision(
    kept ? 'accepted' : 'pending',
    (decision) =>
      call(decision === 'accepted' ? endpoints.plan.acceptProposal : endpoints.plan.rejectProposal, {
        params: { id: draft.id },
      }),
    (decision, result) => {
      if (decision === 'accepted') onKept(draft, result)
    },
  )
  const templateId = kept?.template_id ?? null
  const revert = async () => {
    setUndo({ kind: 'busy' })
    try {
      await call(endpoints.training.revertChange, { params: { id: draft.id } })
      setUndo({ kind: 'done' })
    } catch (e) {
      // Undone already (another tab, the AI page): the old version is back either way.
      if (isApiError(e) && e.code === 'already_reverted') setUndo({ kind: 'done' })
      else setUndo({ kind: 'failed', message: `Undo didn't go through: ${problemText(e)}` })
    }
    void queryClient.invalidateQueries({ queryKey: apiQueryKey() })
  }
  const workout = draft.draft
  const name = workout.name ?? 'AI draft'
  const scores = workout.muscle_scores ?? {}
  const sets = workout.exercises.reduce((n, e) => n + e.sets, 0)
  const top = (Object.entries(scores) as [Muscle, number][])
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([m]) => MUSCLE_LABELS[m].toLowerCase())

  return (
    <Box
      data-testid="draft-template"
      data-status={d.status}
      sx={{ ...cardSurface, display: 'flex', gap: '14px', p: 4, minWidth: 0 }}
    >
      <Box sx={{ width: 92, flex: 'none' }}>
        <MuscleMap levels={muscleLevels(scores)} size={92} title={`Muscles in ${name}`} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
          <Box
            component="h3"
            sx={{
              m: 0,
              fontSize: tokens.font.size.itemTitle,
              fontWeight: tokens.font.weight.heading,
              lineHeight: tokens.font.leading.itemTitle,
              overflowWrap: 'anywhere',
            }}
          >
            {name}
          </Box>
          {d.status === 'pending' && (
            // Dismiss sits where TemplateCard has its chip, so Keep and Preview fit one row at the grid's 300 px.
            <IconButton
              size="tiny"
              onClick={d.onReject}
              disabled={d.busy || !d.onReject}
              aria-label={`Dismiss ${name}`}
              data-testid="draft-dismiss"
              sx={DISMISS}
            >
              <CloseRounded sx={{ fontSize: 14 }} />
            </IconButton>
          )}
        </Box>
        <Box
          sx={{ mt: '2px', fontSize: tokens.font.size.small, lineHeight: 'normal', color: tokens.ink.muted }}
        >
          {workout.exercises.length} exercises · {sets} sets · AI draft
          {top.length > 0 && ` · ${top.join(', ')}`}
        </Box>
        {d.status === 'pending' && replaces && (
          <Box
            data-testid="draft-replaces"
            sx={{
              mt: 1,
              fontSize: tokens.font.size.caption,
              lineHeight: 'normal',
              fontWeight: tokens.font.weight.label,
              color: tokens.ink.label,
            }}
          >
            Replaces your {replaces}
          </Box>
        )}
        <Box sx={{ flex: 1 }} />
        {d.status === 'pending' ? (
          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', mt: '10px' }}>
            <Button
              variant="contained"
              size="small"
              startIcon={<BookmarkAddOutlined />}
              onClick={d.onAccept}
              disabled={d.busy || !d.onAccept}
              aria-label={`Keep ${name} as a template`}
              data-testid="draft-keep"
            >
              Keep
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={() => void navigate(pendingWorkoutPath(draft.id))}
              aria-label={`Preview ${name}`}
              data-testid="draft-preview"
            >
              Preview
            </Button>
          </Box>
        ) : (
          <Box
            data-testid="draft-outcome"
            sx={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 2,
              mt: '10px',
              fontSize: tokens.font.size.small,
              fontWeight: tokens.font.weight.label,
            }}
          >
            {d.status === 'rejected' ? (
              <Box component="span" role="status" sx={{ color: tokens.ink.label }}>
                Dismissed
              </Box>
            ) : (
              <>
                <Box
                  component="span"
                  role="status"
                  sx={{ color: undo.kind === 'done' ? tokens.ink.label : tokens.tone.success.text }}
                >
                  {undo.kind === 'done'
                    ? `Undone: your ${kept?.replaced ?? name} is back`
                    : kept?.replaced
                      ? `Replaced your ${kept.replaced}`
                      : 'Saved as a template'}
                </Box>
                {templateId && (
                  <Link
                    component={RouterLink}
                    to={`/train/builder/${templateId}`}
                    sx={OPEN_LINK}
                    data-testid="draft-open-template"
                  >
                    Open the template
                  </Link>
                )}
                {kept?.replaced && undo.kind !== 'done' && (
                  <Button
                    size="small"
                    startIcon={<UndoRounded />}
                    onClick={() => void revert()}
                    disabled={undo.kind === 'busy'}
                    aria-label={`Undo: bring back your old ${kept.replaced}`}
                    data-testid="draft-undo"
                  >
                    {undo.kind === 'busy' ? 'Undoing…' : 'Undo'}
                  </Button>
                )}
              </>
            )}
          </Box>
        )}
        {d.notes && <Box sx={{ display: 'grid', gap: 2, mt: 2 }}>{d.notes}</Box>}
        {undo.kind === 'failed' && (
          <Alert severity="error" onClose={() => setUndo({ kind: 'idle' })} sx={{ mt: 2 }}>
            {undo.message}
          </Alert>
        )}
      </Box>
    </Box>
  )
}
