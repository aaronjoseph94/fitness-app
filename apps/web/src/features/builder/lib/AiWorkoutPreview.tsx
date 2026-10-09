// Owns: the AI workout preview (SPEC §7) — the draft's rationale, its muscle map (engine scores → levels) with total
// sets, what the guards dropped or repaired (guard_notes), each exercise with its prescription, swap (picker limited to
// the same primary muscle and kind of lift, never an exercise already in the draft) and about, then "Start session" or
// "Save as template". Controlled: the caller holds the draft and applies swaps through `onSwap`.
// 2a: a summary card in Train's today-card idiom (the AI's reasoning, guard notes and the set count | the muscle map on
// an `ink.panel` panel), the exercises as a card of rows, and the sticky Save / Start bar. The two cards rise in on mount.
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded'
import InfoOutlined from '@mui/icons-material/InfoOutlined'
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded'
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import type { ExerciseSummary, WorkoutDraft } from '@fitness/shared/schemas'
import { useMemo, useState } from 'react'
import { outlinedIconButton, Panel, Reveal, staggerDelay, statValue } from '../../../components'
import { MUSCLE_LABELS } from '../../../muscle-map'
import { tokens } from '../../../theme'
import { ExerciseDetailSheet, ExercisePicker, ExerciseThumb, useExerciseIndex } from '../../library'
import { prescription } from './ExerciseCard'
import { MapCard } from './MapCard'
import { draftMuscleLevels } from './scores'

export interface WorkoutSwap {
  index: number
  from: string
  to: ExerciseSummary
}

export interface AiWorkoutPreviewProps {
  draft: WorkoutDraft
  /** Start a session from this draft. */
  onStart: (draft: WorkoutDraft) => void
  /** Save this draft as a template (or, in the builder, take it into the builder). */
  onSave: (draft: WorkoutDraft) => void
  /** A swap made in the preview: the caller stores `next` (the draft with exercise `index` replaced). */
  onSwap: (next: WorkoutDraft, swap: WorkoutSwap) => void
  /** Disables the actions while a save or start is in flight. */
  busy?: boolean
  /** Default "Save as template". */
  saveLabel?: string
  /** CSS `bottom` of the sticky action bar on a phone (e.g. above the bottom nav); from `md` up it is 0. Default 0. */
  actionsBottom?: string
  /** Heading level of the cards' titles: h2 under a page's h1 (default), h3 under a dialog's h2. */
  headingComponent?: 'h2' | 'h3'
}

export function AiWorkoutPreview({ draft, onStart, onSave, onSwap, busy = false, saveLabel = 'Save as template', actionsBottom = '0px', headingComponent = 'h2' }: AiWorkoutPreviewProps) {
  const index = useExerciseIndex()
  const [swapAt, setSwapAt] = useState<number | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const training = useMemo(() => draftMuscleLevels(draft.exercises, index.byId), [draft.exercises, index.byId])
  const swapping = swapAt !== null ? draft.exercises[swapAt] : undefined
  // The draft's other exercises: the swap list leaves them out, since the logger keeps one card per exercise and would
  // drop a duplicate silently.
  const otherIds = useMemo(() => new Set(draft.exercises.filter((_, i) => i !== swapAt).map((e) => e.exercise_id)), [draft.exercises, swapAt])

  const swap = (to: ExerciseSummary) => {
    if (swapAt === null || !swapping) return
    // Defensive: a pick already in the draft (or the same exercise) changes nothing.
    if (to.id === swapping.exercise_id || otherIds.has(to.id)) return
    // Same prescription; the load was chosen for the old exercise, so it starts empty.
    const exercises = draft.exercises.map((e, i) => (i === swapAt ? { ...e, exercise_id: to.id, target_load_kg: null } : e))
    onSwap({ ...draft, exercises }, { index: swapAt, from: swapping.exercise_id, to })
  }

  return (
    <Stack spacing={4} data-testid="ai-workout-preview">
      {/* 2a's entrance: the summary card, then the exercises, a card's stagger apart. */}
      <Reveal>
        <MapCard levels={training.levels} mapTitle="Muscles this workout trains" caption={training.top.slice(0, 4).map((m) => MUSCLE_LABELS[m]).join(', ')}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <AutoAwesomeRounded sx={{ fontSize: 18, color: tokens.accent.main }} aria-hidden />
            <Box component={headingComponent} sx={{ m: 0, fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.heading, lineHeight: tokens.font.leading.label, color: tokens.ink.text }}>
              Why this session
            </Box>
          </Box>
          <Box sx={{ mt: 2, fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.emphasis, color: tokens.ink.body }} data-testid="ai-rationale">
            {draft.rationale || 'A balanced session from your allowed exercises.'}
          </Box>
          {/* What the guards dropped or repaired: a change that fails a rail is reported, not hidden (SPEC §9). */}
          {draft.guard_notes && draft.guard_notes.length > 0 && (
            <Box component="ul" sx={{ m: 0, mt: 2, pl: 4, fontSize: tokens.font.size.caption, color: tokens.ink.secondary, lineHeight: tokens.font.leading.small }} data-testid="ai-guard-notes">
              {draft.guard_notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </Box>
          )}
          <Box sx={{ mt: 5, display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: '6px' }}>
            <Box sx={{ ...statValue('standard'), lineHeight: tokens.font.leading.number, color: tokens.ink.text }}>
              {training.totalSets}
            </Box>
            <Box sx={{ fontSize: tokens.font.size.small, color: tokens.ink.secondary }}>sets · {draft.exercises.length} exercises</Box>
          </Box>
        </MapCard>
      </Reveal>

      <Reveal delay={staggerDelay(1, tokens.motion.stagger.card)}>
        <Panel title="Exercises" description="Open one to see how it’s done; a swap keeps the same primary muscle" padding="none" headingComponent={headingComponent}>
          {draft.exercises.map((e, i) => {
            const exercise = index.byId.get(e.exercise_id)
            return (
              <Box
                key={`${i}-${e.exercise_id}`}
                data-testid="ai-exercise"
                sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: '12px', borderTop: `1px solid ${tokens.ink.hairline}` }}
              >
                <ButtonBase
                  onClick={() => setInfo(e.exercise_id)}
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    py: '12px',
                    pl: `${tokens.pad.card.x}px`,
                    pr: 1,
                    justifyContent: 'flex-start',
                    textAlign: 'left',
                    font: 'inherit',
                    color: 'inherit',
                    // Flush in the card: draw the keyboard ring inside the row.
                    '&.Mui-focusVisible': { outlineOffset: -2 },
                  }}
                >
                  <ExerciseThumb exercise={exercise} size={44} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.label, lineHeight: tokens.font.leading.label, color: tokens.ink.text }}>
                      {i + 1} · {exercise?.name ?? 'Unknown exercise'}
                    </Box>
                    <Box sx={{ fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.secondary, mt: '2px', fontVariantNumeric: 'tabular-nums' }}>{prescription(e)}</Box>
                  </Box>
                </ButtonBase>
                <IconButton size="small" aria-label={`About ${exercise?.name ?? 'exercise'}`} onClick={() => setInfo(e.exercise_id)} sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>
                  <InfoOutlined sx={{ fontSize: 18 }} />
                </IconButton>
                <IconButton size="small" aria-label={`Swap ${exercise?.name ?? 'exercise'}`} onClick={() => setSwapAt(i)} data-testid="ai-swap" sx={{ ...outlinedIconButton, color: tokens.accent.main }}>
                  <SwapHorizRounded sx={{ fontSize: 18 }} />
                </IconButton>
              </Box>
            )
          })}
        </Panel>
      </Reveal>

      <Box
        sx={{
          position: 'sticky',
          bottom: { xs: actionsBottom, md: 0 },
          zIndex: 1,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 2,
          py: 3,
          bgcolor: tokens.ink.page,
          borderTop: `1px solid ${tokens.ink.border}`,
        }}
      >
        <Button variant="outlined" disabled={busy} onClick={() => onSave(draft)} sx={{ flex: { xs: 1, sm: 'none' } }} data-testid="ai-save">
          {saveLabel}
        </Button>
        <Button variant="contained" disabled={busy} startIcon={<PlayArrowRounded />} onClick={() => onStart(draft)} sx={{ flex: { xs: 1, sm: 'none' } }} data-testid="ai-start">
          Start session
        </Button>
      </Box>

      <ExercisePicker
        open={swapAt !== null}
        onClose={() => setSwapAt(null)}
        onPick={swap}
        sameMuscleAs={swapping?.exercise_id}
        pickedIds={otherIds}
      />
      <ExerciseDetailSheet exerciseId={info} open={info !== null} onClose={() => setInfo(null)} />
    </Stack>
  )
}
