// Owns: the session logger screen (SPEC §7 session logging) — header (name, running clock, sets ticked, volume,
// readiness), the start notes (recovery conflicts, deload week, low readiness), one card per exercise, add an exercise
// mid-session (picker), finish with a confirm, the sticky rest timer and the write-problem snackbar.
import AddRounded from '@mui/icons-material/AddRounded'
import FlagRounded from '@mui/icons-material/FlagRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import { useCallback, useMemo, useState } from 'react'
import { EmptyState, formatNumber, PendingBadge } from '../../../components'
import { MUSCLE_LABELS } from '../../../muscle-map'
import { tokens } from '../../../theme'
import { ExerciseDetailSheet, ExercisePicker, useExerciseIndex } from '../../library'
import { useNow } from '../../quick-log'
import { loggerActions } from './actions'
import { ExerciseLogCard } from './ExerciseLogCard'
import { setCounts, type LoggerSession } from './logger-model'
import { useLoggerStore } from './logger-store'
import { ReadinessChip } from './ReadinessChip'
import { RestTimerBar } from './RestTimerBar'
import { finishSession } from './sync'

const ORIGIN_LABEL = {
  template: 'Template',
  ai: 'AI workout',
  blank: 'Blank session',
  week_plan: 'Planned session',
} as const

function elapsed(fromIso: string, now: number): string {
  const s = Math.max(0, Math.floor((now - Date.parse(fromIso)) / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`
}

export function SessionLogger({ session }: { session: LoggerSession }) {
  const index = useExerciseIndex()
  const actions = useMemo(() => loggerActions(session.id), [session.id])
  const [picker, setPicker] = useState(false)
  const [about, setAbout] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const problem = useLoggerStore((s) => s.problem)
  const setProblem = useLoggerStore((s) => s.setProblem)
  const now = useNow(1000)
  const counts = setCounts(session)
  const picked = useMemo(() => new Set(session.exercises.map((e) => e.exercise_id)), [session.exercises])
  const nameOf = useCallback((id: string) => index.byId.get(id)?.name ?? 'exercise', [index.byId])

  const finish = async () => {
    setFinishing(true)
    await finishSession(session.id, new Date().toISOString())
    setFinishing(false)
    setConfirm(false)
    window.scrollTo({ top: 0 })
  }

  const notes = [
    ...(session.deload?.active ? ['Deload week: about 60 % of your usual sets, same loads.'] : []),
    ...(session.recovery?.conflicts.length
      ? [
          `${session.recovery.conflicts.map((m) => MUSCLE_LABELS[m]).join(', ')} also trained as a main target the day before or after.`,
        ]
      : []),
    ...(session.recovery?.reduced_volume || session.readiness?.reduced_volume
      ? ['Readiness is low: consider one set fewer per exercise.']
      : []),
  ]

  return (
    <>
      <Stack spacing={3} data-testid="session-logger">
        <Card sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ fontSize: tokens.font.size.label, color: tokens.ink.secondary, fontWeight: tokens.font.weight.label }}>
                {ORIGIN_LABEL[session.origin]}
              </Box>
              <Box
                sx={{
                  fontSize: tokens.font.size.sectionTitle,
                  fontWeight: tokens.font.weight.heading,
                  lineHeight: 1.3,
                  overflowWrap: 'anywhere',
                }}
              >
                {session.name ?? 'Workout'}
              </Box>
            </Box>
            {session.readiness && <ReadinessChip readiness={session.readiness} />}
          </Box>
          <Box sx={{ mt: 3, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
            <HeaderStat label="Time" value={elapsed(session.started_at, now)} testId="session-clock" />
            <HeaderStat label="Sets" value={`${counts.done}/${counts.planned}`} />
            <HeaderStat label="Volume" value={`${formatNumber(counts.volume_kg)} kg`} />
          </Box>
          {session.start === 'pending' && (
            <Box sx={{ mt: 2 }}>
              <PendingBadge label="Starting…" />
            </Box>
          )}
        </Card>

        {notes.length > 0 && (
          <Alert severity="info" variant="outlined" sx={{ '& .MuiAlert-message': { fontSize: tokens.font.size.small } }}>
            {notes.map((n) => (
              <div key={n}>{n}</div>
            ))}
          </Alert>
        )}

        {session.exercises.length === 0 ? (
          <Card>
            <EmptyState
              compact
              illustration="training"
              title="No exercises yet"
              body="Add the exercises you're doing; each starts with three sets."
              action={{ label: 'Add exercises', onClick: () => setPicker(true) }}
            />
          </Card>
        ) : (
          session.exercises.map((e) => (
            <ExerciseLogCard
              key={e.exercise_id}
              exercise={e}
              info={index.byId.get(e.exercise_id)}
              actions={actions}
              onAbout={setAbout}
            />
          ))
        )}

        {session.exercises.length > 0 && (
          <Button
            variant="outlined"
            size="large"
            startIcon={<AddRounded />}
            onClick={() => setPicker(true)}
            data-testid="add-exercise"
          >
            Add exercise
          </Button>
        )}
        <Button
          variant="contained"
          size="large"
          startIcon={<FlagRounded />}
          onClick={() => setConfirm(true)}
          data-testid="finish-session"
        >
          Finish session
        </Button>
        {/* Room for the rest timer bar. */}
        <Box sx={{ height: 72 }} aria-hidden />
      </Stack>

      <ExercisePicker
        open={picker}
        onClose={() => setPicker(false)}
        keepOpen
        pickedIds={picked}
        onPick={(e) => actions.addExercise(e.id)}
        title="Add to session"
      />
      <ExerciseDetailSheet exerciseId={about} open={about !== null} onClose={() => setAbout(null)} />

      <Dialog open={confirm} onClose={() => !finishing && setConfirm(false)} fullWidth maxWidth="xs">
        <DialogTitle>Finish session?</DialogTitle>
        <DialogContent sx={{ fontSize: tokens.font.size.emphasis, color: tokens.ink.secondary, lineHeight: 1.5 }}>
          {counts.done === 0
            ? 'No sets are ticked yet, so nothing will be logged.'
            : `${counts.done} of ${counts.planned} sets ticked · ${formatNumber(counts.volume_kg)} kg. Sets that aren't ticked aren't logged.`}
        </DialogContent>
        <DialogActions sx={{ px: 4, pb: 3 }}>
          <Button onClick={() => setConfirm(false)} disabled={finishing}>
            Keep going
          </Button>
          <Button
            variant="contained"
            onClick={() => void finish()}
            disabled={finishing}
            data-testid="confirm-finish"
          >
            {finishing ? 'Finishing…' : 'Finish'}
          </Button>
        </DialogActions>
      </Dialog>

      <RestTimerBar sessionId={session.id} nameOf={nameOf} />
      <Snackbar
        open={problem !== null}
        autoHideDuration={6000}
        onClose={() => setProblem(null)}
        message={problem ? `Couldn't save: ${problem}` : ''}
      />
    </>
  )
}

function HeaderStat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <Box data-testid={testId}>
      <Box sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.secondary, fontWeight: tokens.font.weight.label }}>
        {label}
      </Box>
      <Box
        sx={{
          fontSize: tokens.font.size.sectionTitle,
          fontWeight: tokens.font.weight.number,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </Box>
    </Box>
  )
}
