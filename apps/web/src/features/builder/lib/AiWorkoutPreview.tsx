// Owns: the AI workout preview (SPEC §7) — the draft's rationale, its muscle map (engine scores → levels) with total
// sets, each exercise with its prescription, swap (picker limited to the same primary muscle) and about, then "Start
// session" or "Save as template". Controlled: the caller holds the draft and applies swaps through `onSwap`.
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded'
import InfoOutlined from '@mui/icons-material/InfoOutlined'
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded'
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Card from '@mui/material/Card'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import type { ExerciseSummary, WorkoutDraft } from '@fitness/shared/schemas'
import { useMemo, useState } from 'react'
import { MUSCLE_LABELS, MuscleMap, MuscleMapLegend } from '../../../muscle-map'
import { tokens } from '../../../theme'
import { ExerciseDetailSheet, ExercisePicker, ExerciseThumb, useExerciseIndex } from '../../library'
import { prescription } from './ExerciseCard'
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
  /** CSS `bottom` of the sticky action bar (e.g. above the bottom nav). Default 0. */
  actionsBottom?: string
}

export function AiWorkoutPreview({ draft, onStart, onSave, onSwap, busy = false, saveLabel = 'Save as template', actionsBottom = '0px' }: AiWorkoutPreviewProps) {
  const index = useExerciseIndex()
  const [swapAt, setSwapAt] = useState<number | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const training = useMemo(() => draftMuscleLevels(draft.exercises, index.byId), [draft.exercises, index.byId])
  const swapping = swapAt !== null ? draft.exercises[swapAt] : undefined
  const pickedIds = useMemo(() => new Set(draft.exercises.map((e) => e.exercise_id)), [draft.exercises])

  const swap = (to: ExerciseSummary) => {
    if (swapAt === null || !swapping) return
    // Same prescription; the load was chosen for the old exercise, so it starts empty.
    const exercises = draft.exercises.map((e, i) => (i === swapAt ? { ...e, exercise_id: to.id, target_load_kg: null } : e))
    onSwap({ ...draft, exercises }, { index: swapAt, from: swapping.exercise_id, to })
  }

  return (
    <Stack spacing={4} data-testid="ai-workout-preview">
      <Card sx={{ p: 4, display: 'flex', gap: 3, alignItems: 'flex-start' }}>
        <AutoAwesomeRounded sx={{ color: tokens.metric.weight, mt: 0.25 }} aria-hidden />
        <Box sx={{ fontSize: 15, lineHeight: 1.5 }} data-testid="ai-rationale">
          {draft.rationale || 'A balanced session from your allowed exercises.'}
        </Box>
      </Card>

      <Card sx={{ p: 4 }}>
        <Box sx={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <Box sx={{ flex: 'none' }}>
            <MuscleMap levels={training.levels} size={168} title="Muscles this workout trains" />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ fontSize: 32, fontWeight: tokens.font.weight.number, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{training.totalSets}</Box>
            <Box sx={{ fontSize: 13, color: tokens.ink.secondary }}>sets · {draft.exercises.length} exercises</Box>
            <Box sx={{ fontSize: 14, mt: 2, lineHeight: 1.45 }}>{training.top.slice(0, 4).map((m) => MUSCLE_LABELS[m]).join(', ')}</Box>
          </Box>
        </Box>
        <Box sx={{ mt: 3 }}>
          <MuscleMapLegend dense />
        </Box>
      </Card>

      <Card sx={{ px: 2 }}>
        {draft.exercises.map((e, i) => {
          const exercise = index.byId.get(e.exercise_id)
          return (
            <Box
              key={`${i}-${e.exercise_id}`}
              data-testid="ai-exercise"
              sx={{ display: 'flex', alignItems: 'center', gap: 1, borderBottom: `1px solid ${tokens.ink.border}`, '&:last-of-type': { borderBottom: 'none' } }}
            >
              <ButtonBase
                onClick={() => setInfo(e.exercise_id)}
                sx={{ flex: 1, minWidth: 0, display: 'flex', gap: 3, py: 3, pl: 2, justifyContent: 'flex-start', textAlign: 'left', borderRadius: 2, font: 'inherit', color: 'inherit' }}
              >
                <ExerciseThumb exercise={exercise} size={48} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ fontSize: 15, fontWeight: tokens.font.weight.label, lineHeight: 1.3 }}>{exercise?.name ?? 'Unknown exercise'}</Box>
                  <Box sx={{ fontSize: 13, color: tokens.ink.secondary, mt: 0.25, fontVariantNumeric: 'tabular-nums' }}>{prescription(e)}</Box>
                </Box>
              </ButtonBase>
              <IconButton aria-label={`About ${exercise?.name ?? 'exercise'}`} onClick={() => setInfo(e.exercise_id)} sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>
                <InfoOutlined />
              </IconButton>
              <IconButton aria-label={`Swap ${exercise?.name ?? 'exercise'}`} onClick={() => setSwapAt(i)} data-testid="ai-swap" sx={{ color: 'primary.main' }}>
                <SwapHorizRounded />
              </IconButton>
            </Box>
          )
        })}
      </Card>

      <Box
        sx={{
          position: 'sticky',
          bottom: actionsBottom,
          zIndex: 1,
          display: 'flex',
          gap: 3,
          py: 3,
          bgcolor: tokens.ink.page,
          borderTop: `1px solid ${tokens.ink.border}`,
        }}
      >
        <Button variant="outlined" size="large" disabled={busy} onClick={() => onSave(draft)} sx={{ flex: 1 }} data-testid="ai-save">
          {saveLabel}
        </Button>
        <Button variant="contained" size="large" disabled={busy} startIcon={<PlayArrowRounded />} onClick={() => onStart(draft)} sx={{ flex: 1 }} data-testid="ai-start">
          Start session
        </Button>
      </Box>

      <ExercisePicker
        open={swapAt !== null}
        onClose={() => setSwapAt(null)}
        onPick={swap}
        sameMuscleAs={swapping?.exercise_id}
        pickedIds={pickedIds}
      />
      <ExerciseDetailSheet exerciseId={info} open={info !== null} onClose={() => setInfo(null)} />
    </Stack>
  )
}
