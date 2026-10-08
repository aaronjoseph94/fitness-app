// Owns: the session logger screen (SPEC §7 session logging; 2a) — the title row ("← Train", origin and "In progress"
// chips, the session's name as the page h1, a stat strip: running clock, sets ticked, volume, readiness), the start
// notes banner (recovery conflicts, deload week, low readiness, planned exercises left out for being outside the
// allowed set), one card per exercise (the one in hand highlighted; once a session is under way the exercises still to
// come open folded), add an exercise mid-session (picker), finish with a confirm, "Delete session", the rail beside the
// list from `lg` (progress ring and per-exercise bars, last time's sets and volume, the readiness chip with its
// details), the floating rest
// timer, the write-problem snackbar (at the top, clear of the rest timer), and the edit mode of a finished session (its
// duration fixed, "Save changes" finishes it again with the same end time).
import AddRounded from '@mui/icons-material/AddRounded'
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded'
import FlagRounded from '@mui/icons-material/FlagRounded'
import SpeedRounded from '@mui/icons-material/SpeedRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Snackbar from '@mui/material/Snackbar'
import { useCallback, useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router'
import {
  Banner,
  EmptyState,
  formatNumber,
  formatShortDate,
  formatWeekday,
  KeyStat,
  MetricRing,
  PageHeader,
  Panel,
  panelSurface,
  PendingBadge,
  Reveal,
  StatusChip,
  staggerDelay,
  wellSurface,
} from '../../../components'
import { MUSCLE_LABELS } from '../../../muscle-map'
import { COARSE_POINTER_QUERY, tokens } from '../../../theme'
import { ExerciseDetailSheet, ExercisePicker, useExerciseIndex } from '../../library'
import { useNow } from '../../quick-log'
import { loggerActions } from './actions'
import { DeleteSessionDialog } from './DeleteSessionDialog'
import { ExerciseLogCard } from './ExerciseLogCard'
import { LEFT_OUT, setCounts, type LoggerSession } from './logger-model'
import { loggerState, useLoggerStore } from './logger-store'
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

/** Exercises still to come in a session already under way (after the one in hand, nothing ticked): opened folded. */
function foldedAtStart(session: LoggerSession): Set<string> {
  const folded = new Set<string>()
  const current = session.exercises.findIndex((e) => e.sets.some((s) => !s.done))
  if (setCounts(session).done === 0 || current < 0) return folded
  session.exercises.forEach((e, i) => {
    if (i > current && !e.sets.some((s) => s.done)) folded.add(e.exercise_id)
  })
  return folded
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
  const [folded] = useState(() => (session.finished ? new Set<string>() : foldedAtStart(session)))
  const currentId = session.finished ? null : (session.exercises.find((e) => e.sets.some((s) => !s.done))?.exercise_id ?? null)
  const conflicts = session.recovery?.conflicts ?? []

  /** The next set to do after a rest: the rested exercise's next open set, else the next exercise with one. */
  const upNext = (exerciseId: string): string | null => {
    const from = Math.max(0, session.exercises.findIndex((e) => e.exercise_id === exerciseId))
    for (const e of [...session.exercises.slice(from), ...session.exercises.slice(0, from)]) {
      const open = e.sets.findIndex((x) => !x.done)
      if (open >= 0) return `${nameOf(e.exercise_id)}, set ${open + 1}`
    }
    return null
  }

  const [deleting, setDeleting] = useState(false)
  /** A finished session reopened to fix its sets (SessionPage shows the logger while `editing`). */
  const edited = session.finished
  const saveEdits = async () => {
    if (!edited) return
    setFinishing(true)
    await finishSession(session.id, edited.ended_at)
    loggerState().update(session.id, (c) => ({ ...c, editing: false }))
    setFinishing(false)
    window.scrollTo({ top: 0 })
  }

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
    // Left out here at the start, or by the Worker (same wording, so a note shows once).
    ...new Set([...(session.left_out ?? []), ...(session.recovery?.notes.filter((n) => n.startsWith(LEFT_OUT)) ?? [])]),
  ]

  const clock = elapsed(session.started_at, edited ? Date.parse(edited.ended_at) : now)

  return (
    <>
      <Box data-testid="session-logger">
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) 320px' },
            gap: '20px',
            alignItems: 'start',
          }}
        >
          <Box sx={{ display: 'grid', gap: 4, minWidth: 0 }}>
            <PageHeader
              eyebrow={
                <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: '4px' }}>
                  <ButtonBase
                    component={RouterLink}
                    to="/train"
                    sx={{
                      gap: '2px',
                      fontSize: tokens.font.size.small,
                      color: tokens.ink.muted,
                      borderRadius: `${tokens.radius.inner}px`,
                      '&:hover': { color: tokens.ink.text },
                      [COARSE_POINTER_QUERY]: { minHeight: tokens.tapTarget },
                    }}
                  >
                    <ArrowBackRounded aria-hidden sx={{ fontSize: 16 }} />
                    Train
                  </ButtonBase>
                  <StatusChip tone="info" label={edited ? `Editing · ${formatShortDate(session.date)}` : ORIGIN_LABEL[session.origin]} />
                  {!edited && <StatusChip tone="success" dot label="In progress" />}
                  {session.start === 'pending' && <PendingBadge label="Starting…" />}
                </Box>
              }
              title={session.name ?? 'Workout'}
              action={
                <Box
                  sx={{
                    ...panelSurface,
                    display: 'flex',
                    gap: { xs: '20px', sm: '28px' },
                    py: { xs: '10px', sm: '12px' },
                    px: { xs: '14px', sm: '18px' },
                  }}
                >
                  <KeyStat size="md" label="Time" value={clock} testId="session-clock" />
                  <KeyStat size="md" label="Sets" value={`${counts.done}/${counts.planned}`} />
                  <KeyStat size="md" label="Volume" value={counts.volume_kg} unit="kg" />
                  {session.readiness && <KeyStat size="md" label="Readiness" value={session.readiness.score} />}
                </Box>
              }
            />

            {notes.length > 0 && (
              <Reveal delay={100}>
                <Banner tone="info">
                  {notes.map((n) => (
                    <div key={n}>{n}</div>
                  ))}
                </Banner>
              </Reveal>
            )}

            {session.exercises.length === 0 ? (
              <EmptyState
                title="No exercises yet"
                body="Add the exercises you're doing; each starts with three sets."
                action={{ label: 'Add exercises', onClick: () => setPicker(true) }}
              />
            ) : (
              session.exercises.map((e, i) => {
                const info = index.byId.get(e.exercise_id)
                return (
                  <Reveal key={e.exercise_id} delay={staggerDelay(i, tokens.motion.stagger.section, 200)} sx={{ minWidth: 0 }}>
                    <ExerciseLogCard
                      exercise={e}
                      position={i}
                      info={info}
                      actions={actions}
                      onAbout={setAbout}
                      current={e.exercise_id === currentId}
                      defaultOpen={!folded.has(e.exercise_id)}
                      recoveryConflict={!!info?.primary_muscles.some((m) => conflicts.includes(m))}
                    />
                  </Reveal>
                )
              })
            )}

            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
              {session.exercises.length > 0 && (
                <Button
                  variant="outlined"
                  startIcon={<AddRounded />}
                  onClick={() => setPicker(true)}
                  data-testid="add-exercise"
                  sx={{ flex: { xs: '1 1 auto', sm: 'none' } }}
                >
                  Add exercise
                </Button>
              )}
              {edited ? (
                <Button
                  variant="contained"
                  disabled={finishing}
                  onClick={() => void saveEdits()}
                  data-testid="save-edits"
                  sx={{ flex: { xs: '1 1 auto', sm: 'none' } }}
                >
                  {finishing ? 'Saving…' : 'Save changes'}
                </Button>
              ) : (
                <Button
                  variant="contained"
                  startIcon={<FlagRounded />}
                  onClick={() => setConfirm(true)}
                  data-testid="finish-session"
                  sx={{ flex: { xs: '1 1 auto', sm: 'none' } }}
                >
                  Finish session
                </Button>
              )}
              <Button
                color="error"
                onClick={() => setDeleting(true)}
                data-testid="delete-session"
                sx={{ ml: { sm: 'auto' }, width: { xs: '100%', sm: 'auto' } }}
              >
                Delete session
              </Button>
            </Box>
          </Box>

          <Box
            component="aside"
            aria-label="This session"
            sx={{
              display: 'grid',
              gap: 4,
              gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'minmax(0, 1fr)' },
              alignItems: 'start',
            }}
          >
            <ProgressPanel session={session} done={counts.done} planned={counts.planned} now={now} />
            <LastTimePanel session={session} done={counts.done} volume={counts.volume_kg} />
            {session.readiness && <ReadinessPanel readiness={session.readiness} />}
          </Box>
        </Box>
        <RestTimerBar sessionId={session.id} nameOf={nameOf} upNext={upNext} />
      </Box>

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
        <DialogContent sx={{ color: tokens.ink.secondary, lineHeight: tokens.font.leading.body }}>
          {counts.done === 0
            ? 'No sets are ticked yet, so nothing will be logged.'
            : `${counts.done} of ${counts.planned} sets ticked · ${formatNumber(counts.volume_kg)} kg. Sets that aren't ticked aren't logged.`}
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setConfirm(false)} disabled={finishing}>
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

      <DeleteSessionDialog open={deleting} sessionId={session.id} setsDone={counts.done} onClose={() => setDeleting(false)} />
      {/* At the top, under the app bar or the desktop header (as the quick-log notice): the rest timer holds the bottom. */}
      <Snackbar
        open={problem !== null}
        autoHideDuration={6000}
        onClose={() => setProblem(null)}
        message={problem ? `Couldn't save: ${problem}` : ''}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{
          top: {
            xs: `calc(${tokens.tapTarget + tokens.space(4)}px + env(safe-area-inset-top, 0px))`,
            md: `${tokens.layout.headerHeight + tokens.space(4)}px`,
          },
        }}
        data-testid="logger-problem"
      />
    </>
  )
}

/** Rail entrance: after the title row, 90 ms apart. */
const railDelay = (i: number) => staggerDelay(i, tokens.motion.stagger.section, 300)

const RAIL_TEXT_SX = { fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.label } as const
const STRONG_SX = { color: tokens.ink.text, fontWeight: tokens.font.weight.heading } as const

/**
 * Progress: a 56 px ring of sets ticked, the time left at this pace (minutes so far ÷ sets ticked × sets still open),
 * and one 6 px bar per exercise filled by its share of sets ticked.
 */
function ProgressPanel({ session, done, planned, now }: { session: LoggerSession; done: number; planned: number; now: number }) {
  const pct = planned ? Math.round((done / planned) * 100) : 0
  const minutesLeft = done ? Math.round(((now - Date.parse(session.started_at)) / done / 60_000) * (planned - done)) : null
  const pace = session.finished
    ? null
    : done === 0
      ? 'Tick a set to see the time left'
      : done >= planned
        ? 'Every planned set is ticked'
        : minutesLeft !== null && minutesLeft < 1
          ? 'Under a minute left at this pace'
          : `About ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'} left at this pace`
  return (
    <Reveal delay={railDelay(0)} sx={{ minWidth: 0 }}>
      <Panel title="Progress" titleSize="card" padding="dense">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <MetricRing
            value={done}
            target={Math.max(1, planned)}
            metric="weight"
            color={tokens.accent.main}
            trackColor={tokens.ink.fill}
            size={56}
            thickness={6}
            centre={`${pct}%`}
            label="Sets ticked"
            unit="sets"
          />
          <Box sx={RAIL_TEXT_SX}>
            <Box component="strong" sx={STRONG_SX}>
              {done} of {planned} sets
            </Box>{' '}
            ticked
            {pace && (
              <>
                <br />
                {pace}
              </>
            )}
          </Box>
        </Box>
        {session.exercises.length > 0 && (
          <Box
            aria-hidden
            sx={{
              display: 'grid',
              gridTemplateColumns: `repeat(${session.exercises.length}, minmax(0, 1fr))`,
              gap: '4px',
              mt: '14px',
            }}
          >
            {session.exercises.map((e) => {
              const share = e.sets.length ? (e.sets.filter((x) => x.done).length / e.sets.length) * 100 : 0
              return (
                <Box
                  key={e.exercise_id}
                  sx={{
                    height: 6,
                    borderRadius: `${tokens.radius.pill}px`,
                    background: `linear-gradient(90deg, ${tokens.tone.success.solid} ${share}%, ${tokens.ink.border} ${share}%)`,
                  }}
                />
              )
            })}
          </Box>
        )}
      </Panel>
    </Reveal>
  )
}

/**
 * Last time: each exercise's sets from the last session that logged it (the greyed "Previous" column), summed — sets
 * against this session's plan and volume (Σ reps × kg) — with the volume to beat and today's so far.
 */
function LastTimePanel({ session, done, volume }: { session: LoggerSession; done: number; volume: number }) {
  const withLast = session.exercises.filter((e) => e.last && e.last.sets.length > 0)
  if (withLast.length === 0) return null
  const sets = withLast.flatMap((e) => e.last!.sets)
  const lastVolume = sets.reduce((sum, s) => sum + (s.reps ?? 0) * (s.load_kg ?? 0), 0)
  const date = withLast.map((e) => e.last!.date).sort().at(-1)!
  const planned = session.exercises.reduce((n, e) => n + e.sets.length, 0)
  const started = session.exercises.filter((e) => e.sets.some((x) => x.done)).length
  return (
    <Reveal delay={railDelay(1)} sx={{ minWidth: 0 }}>
      <Panel
        title="Last time"
        titleSize="card"
        padding="dense"
        actions={
          <Box component="span" sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.muted }}>
            {formatWeekday(date)}, {formatShortDate(date)}
          </Box>
        }
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2 }}>
          {[
            ['Sets', `${sets.length}/${planned}`],
            ['Volume', `${formatNumber(lastVolume)} kg`],
          ].map(([label, value]) => (
            <Box key={label} sx={{ ...wellSurface, p: '10px' }}>
              <Box sx={{ fontSize: tokens.font.size.micro, color: tokens.ink.muted }}>{label}</Box>
              <Box sx={{ fontSize: tokens.font.size.sectionTitle, fontWeight: tokens.font.weight.number, fontVariantNumeric: 'tabular-nums' }}>
                {value}
              </Box>
            </Box>
          ))}
        </Box>
        <Box sx={{ ...RAIL_TEXT_SX, mt: 3 }}>
          {session.finished ? (
            <>
              This session:{' '}
              <Box component="strong" sx={STRONG_SX}>
                {formatNumber(volume)} kg
              </Box>
              .
            </>
          ) : volume > lastVolume ? (
            <>
              <Box component="strong" sx={STRONG_SX}>
                {formatNumber(volume)} kg
              </Box>{' '}
              so far: {formatNumber(volume - lastVolume)} kg more than last time.
            </>
          ) : (
            <>
              Beat it today:{' '}
              <Box component="strong" sx={STRONG_SX}>
                {formatNumber(lastVolume + 1)} kg
              </Box>
              .
              {done > 0 &&
                ` You’re ${formatNumber(volume)} kg in after ${started} exercise${started === 1 ? '' : 's'}.`}
            </>
          )}
        </Box>
      </Panel>
    </Reveal>
  )
}

/**
 * Readiness at the start: the readiness chip (score and volume verdict; tap for its details), then what it is made of
 * (sleep, steps, rest days) in words.
 */
function ReadinessPanel({ readiness }: { readiness: NonNullable<LoggerSession['readiness']> }) {
  const sleep = readiness.sleep_h === null ? 'not logged' : `${formatNumber(readiness.sleep_h, 1)} h of 7.5 h`
  const steps =
    readiness.steps_vs_median === null ? 'not logged' : `${formatNumber(readiness.steps_vs_median, 2)} × your 14-day median`
  const days =
    readiness.days_since_last_session === null
      ? 'no session yet'
      : `${readiness.days_since_last_session} day${readiness.days_since_last_session === 1 ? '' : 's'}`
  return (
    <Reveal delay={railDelay(2)} sx={{ minWidth: 0 }}>
      <Panel
        title={
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            <SpeedRounded aria-hidden sx={{ fontSize: 18, color: tokens.accent.main }} />
            Readiness
          </Box>
        }
        titleSize="card"
        padding="dense"
      >
        <Box sx={{ display: 'grid', gap: 2, fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.body }}>
          <Box>
            <ReadinessChip readiness={readiness} />
          </Box>
          <Box sx={{ ...wellSurface, px: 3, py: '10px' }}>
            Sleep last night: {sleep}. Steps yesterday: {steps}. Since your last session: {days}.
          </Box>
        </Box>
      </Panel>
    </Reveal>
  )
}
