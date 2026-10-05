// Owns: the AI workout page (/train/ai, SPEC §7 "AI workouts") — pick a focus (or none: the week's upper/lower split
// decides), generate with the workout_generate job, then the preview: swap, start a session or save as a template
// (opened in the builder). `?focus=upper` prefills the focus; `?auto=1` generates straight away.
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import type { WorkoutDraft } from '@fitness/shared/schemas'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { formatShortDate } from '../../../components'
import { tokens } from '../../../theme'
import { problemText } from '../../quick-log'
import { AiWorkoutPreview } from './AiWorkoutPreview'
import { AiWorking } from './AiWorking'
import { useTemplateWrites } from './start'
import { useAiWorkout } from './useAiWorkout'

const FOCUSES = ['Upper body', 'Lower body', 'Push', 'Pull', 'Full body', 'Arms and shoulders'] as const

const ABOVE_NAV = `calc(${tokens.layout.bottomNavHeight}px + env(safe-area-inset-bottom, 0px))`

/** Today in Edmonton, "2026-10-05". */
function todayLocal(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton' }).format(new Date())
}

export function AiWorkoutPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const ai = useAiWorkout()
  const writes = useTemplateWrites()
  const [focus, setFocus] = useState(params.get('focus') ?? '')
  const [notice, setNotice] = useState<string | null>(null)
  const auto = useRef(params.get('auto') === '1')

  const generate = () => ai.run({ mode: 'generate', date: todayLocal(), focus: focus.trim() || undefined })

  useEffect(() => {
    if (!auto.current) return
    auto.current = false
    generate()
  }, [])

  const templateName = () => `AI · ${focus.trim() || 'workout'} · ${formatShortDate(todayLocal())}`.slice(0, 100)

  const saveDraft = (draft: WorkoutDraft) =>
    writes.save({ name: templateName(), origin: 'ai', notes: draft.rationale || null, exercises: draft.exercises })

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
      const { templateId } = await saveDraft(draft)
      await writes.start(templateId, 'ai')
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
              <Box sx={{ fontSize: 16, fontWeight: tokens.font.weight.heading }}>Today&apos;s workout</Box>
            </Box>
            <Box sx={{ fontSize: 14, color: tokens.ink.secondary, lineHeight: 1.5 }}>
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
                  sx={{ height: 36 }}
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
