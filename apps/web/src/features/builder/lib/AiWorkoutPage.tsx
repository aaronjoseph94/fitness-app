// Owns: the AI workout page (/train/ai, SPEC §7 "AI workouts") — pick a focus (or none: the week's upper/lower split
// decides), generate with the workout_generate job, then the preview: swap, start a session or save as a template
// (opened in the builder); either accepts the job's pending workout proposal. `?focus=upper` prefills the focus;
// `?auto=1` generates straight away; `?proposal=<id>` opens a pending draft (the nightly one) in the preview.
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { today } from '@fitness/shared/engine'
import type { WorkoutDraft } from '@fitness/shared/schemas'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { problemText } from '../../../api'
import { formatShortDate } from '../../../components'
import { tokens } from '../../../theme'
import { AiWorkoutPreview } from './AiWorkoutPreview'
import { AiWorking } from './AiWorking'
import { usePendingWorkouts } from './pending-workout'
import { useTemplateWrites } from './start'
import { useAiWorkout } from './useAiWorkout'

const FOCUSES = ['Upper body', 'Lower body', 'Push', 'Pull', 'Full body', 'Arms and shoulders'] as const

const ABOVE_NAV = `calc(${tokens.layout.bottomNavHeight}px + env(safe-area-inset-bottom, 0px))`

export function AiWorkoutPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const ai = useAiWorkout()
  const writes = useTemplateWrites()
  const [focus, setFocus] = useState(params.get('focus') ?? '')
  const [notice, setNotice] = useState<string | null>(null)
  const auto = useRef(params.get('auto') === '1')
  const pendingId = useRef(params.get('proposal'))
  const pending = usePendingWorkouts()

  const generate = () => ai.run({ mode: 'generate', date: today(Date.now()), focus: focus.trim() || undefined })

  useEffect(() => {
    if (!auto.current) return
    auto.current = false
    generate()
  }, [])

  // Open the pending draft named in the link once the feed has it.
  useEffect(() => {
    const found = pendingId.current ? pending.find((w) => w.id === pendingId.current) : undefined
    if (!found) return
    pendingId.current = null
    ai.open(found.draft)
  }, [pending, ai.open])

  const templateName = () => `AI · ${focus.trim() || 'workout'} · ${formatShortDate(today(Date.now()))}`.slice(0, 100)

  const saveDraft = (draft: WorkoutDraft) =>
    writes.save({ name: templateName(), origin: 'ai', notes: draft.rationale || null, exercises: draft.exercises, proposal_id: draft.proposal_id })

  const onSave = async (draft: WorkoutDraft) => {
    try {
      const { templateId } = await saveDraft(draft)
      void navigate(`/train/builder/${templateId}`)
    } catch (e) {
      setNotice(problemText(e))
    }
  }

  const onStart = async (draft: WorkoutDraft) => {
    try {
      await writes.startDraft(draft)
    } catch (e) {
      setNotice(problemText(e))
    }
  }

  const state = ai.state
  return (
    <Stack spacing={4} data-testid="ai-workout-page">
      {state.status === 'idle' || state.status === 'failed' ? (
        <Card sx={{ p: 4 }}>
          <Stack spacing={3}>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <AutoAwesomeRounded sx={{ color: tokens.metric.weight }} aria-hidden />
              <Box sx={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.heading }}>Today&apos;s workout</Box>
            </Box>
            <Box sx={{ fontSize: tokens.font.size.small, color: tokens.ink.secondary, lineHeight: 1.5 }}>
              Built from your allowed exercises, your last two weeks of sessions, readiness and the week&apos;s split. Leave the focus empty to follow the plan.
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
              {FOCUSES.map((f) => (
                <Chip
                  key={f}
                  label={f}
                  variant={focus === f ? 'filled' : 'outlined'}
                  color={focus === f ? 'primary' : 'default'}
                  onClick={() => setFocus(focus === f ? '' : f)}
                />
              ))}
            </Box>
            <TextField label="Focus (optional)" value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. chest and back, go easy on the knees" slotProps={{ htmlInput: { maxLength: 200 } }} />
            {state.status === 'failed' && <Alert severity="warning">{state.message}</Alert>}
            <Button variant="contained" size="large" startIcon={<AutoAwesomeRounded />} onClick={generate} data-testid="ai-generate">
              {state.status === 'failed' ? 'Try again' : 'Generate workout'}
            </Button>
          </Stack>
        </Card>
      ) : state.status === 'working' ? (
        <AiWorking slow={state.slow} />
      ) : (
        <>
          <AiWorkoutPreview
            draft={state.draft}
            busy={writes.busy}
            actionsBottom={ABOVE_NAV}
            onSwap={(next) => ai.setDraft(next)}
            onSave={(d) => void onSave(d)}
            onStart={(d) => void onStart(d)}
          />
          <Button onClick={ai.reset} sx={{ alignSelf: 'center' }}>
            Start over
          </Button>
        </>
      )}
      <Snackbar open={notice !== null} autoHideDuration={4000} onClose={() => setNotice(null)} message={notice ?? ''} />
    </Stack>
  )
}
