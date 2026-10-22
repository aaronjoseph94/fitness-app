// Owns: the session logger screen (SPEC §7 session logging; 1d Summit "Session") — the sky hero ("← Train", origin and
// "In progress" pills, the session's name as the page h1, when it started and how many exercises, and the glass stat
// strip: running clock, sets ticked, volume, readiness), the start notes in a violet well (recovery conflicts, deload
// week, low readiness, planned exercises left out for being outside the allowed set), one card per exercise (the one in
// hand gold-ringed; once a session is under way the exercises still to come open folded), one picker to add an exercise
// mid-session or swap one for another with the same primary muscle, Add exercise, the coral Finish session with a
// confirm, the red "Delete session", the rail beside the list at 1fr : 320 px, wrapping under it (progress ring and
// per-exercise bars, the deep-sky "Last time" with its sets and volume, the readiness chip with its details), the
// snackbar (a write problem, or a swap refused; at the top, as the quick-log notice), and the edit mode of a finished
// session (its duration fixed, "Save changes" finishes it again with the same end time). No rest timer (removed
// 2026-10-14): planned rest stays as text on each exercise.
import AddRounded from '@mui/icons-material/AddRounded'
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded'
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded'
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
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router'
import {
  cardSurface,
  deepSkySurface,
  deepSkyWell,
  displayTitle,
  EmptyState,
  eyebrow,
  fixedCol,
  formatClock,
  formatNumber,
  formatShortDate,
  formatWeekday,
  GlassPill,
  MetricRing,
  PageHeader,
  PendingBadge,
  Reveal,
  staggerDelay,
  wellSurface,
  WrapRow,
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
import { ReadinessChip, readinessOnSky } from './ReadinessChip'
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
  // The picker adds exercises, or swaps `swapFrom` for one with the same primary muscle. The mode is kept while the
  // sheet closes, so its list doesn't change under the exit animation.
  const [picker, setPicker] = useState<{ open: boolean; swapFrom: string | null }>({
    open: false,
    swapFrom: null,
  })
  const openAdd = () => setPicker({ open: true, swapFrom: null })
  const openSwap = useCallback((exerciseId: string) => setPicker({ open: true, swapFrom: exerciseId }), [])
  /** A plain message for the snackbar (not a write problem). */
  const [notice, setNotice] = useState<string | null>(null)
  const [about, setAbout] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const problem = useLoggerStore((s) => s.problem)
  const setProblem = useLoggerStore((s) => s.setProblem)
  const now = useNow(1000)
  const counts = setCounts(session)
  const picked = useMemo(() => new Set(session.exercises.map((e) => e.exercise_id)), [session.exercises])
  const [folded] = useState(() => (session.finished ? new Set<string>() : foldedAtStart(session)))
  const currentId = session.finished
    ? null
    : (session.exercises.find((e) => e.sets.some((s) => !s.done))?.exercise_id ?? null)
  const conflicts = session.recovery?.conflicts ?? []

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
    ...new Set([
      ...(session.left_out ?? []),
      ...(session.recovery?.notes.filter((n) => n.startsWith(LEFT_OUT)) ?? []),
    ]),
  ]

  const clock = elapsed(session.started_at, edited ? Date.parse(edited.ended_at) : now)

  const currentSetId = currentId
    ? (session.exercises.find((e) => e.exercise_id === currentId)?.sets.find((x) => !x.done)?.id ?? null)
    : null

  return (
    <>
      <PageHeader
        eyebrow={
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '8px 10px',
              textTransform: 'none',
              letterSpacing: 0,
            }}
          >
            <ButtonBase
              component={RouterLink}
              to="/train"
              sx={{
                gap: '2px',
                fontSize: 14,
                fontWeight: tokens.font.weight.heading,
                borderRadius: `${tokens.radius.inner}px`,
                '&.Mui-focusVisible': {
                  outline: `${tokens.focusRing.width}px solid ${tokens.summit.onSky.text}`,
                  outlineOffset: tokens.focusRing.offset,
                },
                [COARSE_POINTER_QUERY]: { minHeight: tokens.tapTarget },
              }}
            >
              <ArrowBackRounded aria-hidden sx={{ fontSize: 18 }} />
              Train
            </ButtonBase>
            <GlassPill size="small">
              {edited ? `Editing · ${formatShortDate(session.date)}` : ORIGIN_LABEL[session.origin]}
            </GlassPill>
            {!edited && (
              <GlassPill tone="teal" size="small">
                <Box
                  component="span"
                  aria-hidden
                  sx={{
                    display: 'inline-block',
                    width: 7,
                    height: 7,
                    mr: '6px',
                    borderRadius: '50%',
                    bgcolor: tokens.summit.onSky.text,
                    verticalAlign: '1px',
                  }}
                />
                In progress
              </GlassPill>
            )}
            {session.start === 'pending' && <PendingBadge label="Starting…" />}
          </Box>
        }
        title={session.name ?? 'Workout'}
        subtitle={`Started ${formatClock(session.started_at)} · ${session.exercises.length} exercise${session.exercises.length === 1 ? '' : 's'}`}
        action={
          <StatStrip>
            <Stat label="Time" testId="session-clock">
              {clock}
            </Stat>
            <Stat label="Sets">
              {counts.done}
              <StatUnit> / {counts.planned}</StatUnit>
            </Stat>
            <Stat label="Volume">
              {formatNumber(counts.volume_kg)}
              <StatUnit> kg</StatUnit>
            </Stat>
            {session.readiness && (
              <Stat
                label="Readiness"
                colour={readinessOnSky(session.readiness.score, tokens.tone.success.light)}
              >
                {session.readiness.score}
              </Stat>
            )}
          </StatStrip>
        }
      />
      <Box data-testid="session-logger">
        <WrapRow align="flex-start">
          <Box
            sx={{
              flex: '100 1 280px',
              minWidth: 0,
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr)',
              gap: `${tokens.summit.space.gap.tile}px`,
            }}
          >
            {notes.length > 0 && (
              <Reveal delay={100}>
                <Box
                  data-testid="session-notes"
                  sx={{
                    display: 'flex',
                    gap: '12px',
                    px: '20px',
                    py: '16px',
                    borderRadius: `${tokens.summit.radius.small}px`,
                    bgcolor: tokens.accent.soft,
                    color: tokens.summit.ink.deep,
                    fontSize: tokens.font.size.body,
                    fontWeight: tokens.font.weight.body,
                    lineHeight: tokens.font.leading.body,
                  }}
                >
                  <AutoAwesomeRounded
                    aria-hidden
                    sx={{ fontSize: 22, color: tokens.accent.deep, flex: 'none' }}
                  />
                  <Box sx={{ minWidth: 0 }}>
                    {notes.map((n) => (
                      <div key={n}>{n}</div>
                    ))}
                  </Box>
                </Box>
              </Reveal>
            )}

            {session.exercises.length === 0 ? (
              <EmptyState
                title="No exercises yet"
                body="Add the exercises you're doing; each starts with three sets."
                action={{ label: 'Add exercises', onClick: openAdd }}
              />
            ) : (
              session.exercises.map((e, i) => {
                const info = index.byId.get(e.exercise_id)
                return (
                  <Reveal
                    key={e.exercise_id}
                    delay={staggerDelay(i, tokens.motion.stagger.section, 200)}
                    sx={{ minWidth: 0 }}
                  >
                    <ExerciseLogCard
                      exercise={e}
                      position={i}
                      info={info}
                      actions={actions}
                      onAbout={setAbout}
                      onSwap={openSwap}
                      current={e.exercise_id === currentId}
                      activeSetId={e.exercise_id === currentId ? currentSetId : null}
                      defaultOpen={!folded.has(e.exercise_id)}
                      recoveryConflict={!!info?.primary_muscles.some((m) => conflicts.includes(m))}
                    />
                  </Reveal>
                )
              })
            )}

            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', mt: '6px' }}>
              {session.exercises.length > 0 && (
                <Button
                  variant="outlined"
                  size="large"
                  startIcon={<AddRounded />}
                  onClick={openAdd}
                  data-testid="add-exercise"
                  sx={{ flex: { xs: '1 1 auto', sm: 'none' } }}
                >
                  Add exercise
                </Button>
              )}
              {edited ? (
                <Button
                  variant="contained"
                  size="large"
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
                  size="large"
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
                sx={{
                  ml: 'auto',
                  mr: '-12px',
                  fontWeight: tokens.font.weight.heading,
                  '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' },
                }}
              >
                Delete session
              </Button>
            </Box>
          </Box>

          <Box
            component="aside"
            aria-label="This session"
            sx={{
              ...fixedCol(320),
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr)',
              gap: `${tokens.summit.space.gap.tile}px`,
              alignContent: 'start',
            }}
          >
            <ProgressPanel session={session} done={counts.done} planned={counts.planned} now={now} />
            <LastTimePanel session={session} done={counts.done} volume={counts.volume_kg} />
            {session.readiness && <ReadinessPanel readiness={session.readiness} />}
          </Box>
        </WrapRow>
      </Box>

      <ExercisePicker
        open={picker.open}
        onClose={() => setPicker((p) => ({ ...p, open: false }))}
        keepOpen={picker.swapFrom === null}
        pickedIds={picked}
        sameMuscleAs={picker.swapFrom ?? undefined}
        onPick={(e) => {
          if (picker.swapFrom === null) actions.addExercise(e.id)
          else if (!actions.swapExercise(picker.swapFrom, e.id))
            setNotice('That exercise is already in this session.')
        }}
        title={picker.swapFrom === null ? 'Add to session' : undefined}
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

      <DeleteSessionDialog
        open={deleting}
        sessionId={session.id}
        setsDone={counts.done}
        onClose={() => setDeleting(false)}
      />
      {/* At the top, under the app bar or the desktop header, as the quick-log notice. */}
      <Snackbar
        open={notice !== null || problem !== null}
        autoHideDuration={6000}
        onClose={() => {
          setNotice(null)
          setProblem(null)
        }}
        message={notice ?? (problem ? `Couldn't save: ${problem}` : '')}
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

const RAIL_TEXT_SX = {
  fontSize: tokens.font.size.small,
  fontWeight: tokens.font.weight.body,
  lineHeight: tokens.font.leading.small,
  color: tokens.ink.secondary,
} as const
const STRONG_SX = { color: tokens.ink.text, fontWeight: tokens.font.weight.heading } as const

const { summit } = tokens

/**
 * The glass stat strip on the sky (README §5.5): dark glass, cells split by white hairlines, wrapping on a phone. Each
 * cell draws its rule on its left a pixel outside itself, and the inner row clips it, so a cell that starts a line
 * shows none.
 */
function StatStrip({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        p: '8px',
        maxWidth: '100%',
        boxSizing: 'border-box',
        borderRadius: `${summit.radius.tabBar}px`,
        bgcolor: summit.glass.card,
        border: `1px solid ${summit.glass.cardBorder}`,
        backdropFilter: `blur(${summit.glass.cardBlur}px)`,
      }}
    >
      <Box sx={{ display: 'flex', flexWrap: 'wrap', rowGap: '6px', overflow: 'hidden' }}>{children}</Box>
    </Box>
  )
}

/** One cell: an 11/600 uppercase label over an Outfit 22 value (tabular). */
function Stat({
  label,
  colour = summit.onSky.text,
  testId,
  children,
}: {
  label: string
  colour?: string
  testId?: string
  children: ReactNode
}) {
  return (
    <Box
      data-testid={testId}
      sx={{
        flex: '1 0 auto',
        px: '18px',
        py: '10px',
        ml: '-1px',
        textAlign: 'center',
        borderLeft: `1px solid ${summit.glass.cardBorder}`,
      }}
    >
      <Box
        sx={{
          fontSize: tokens.font.size.micro,
          fontWeight: tokens.font.weight.heading,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: summit.onSky.muted,
        }}
      >
        {label}
      </Box>
      <Box
        sx={{
          mt: '2px',
          fontFamily: tokens.font.display,
          fontSize: tokens.font.size.bigNumberSmall,
          fontWeight: tokens.font.weight.number,
          lineHeight: 1.2,
          color: colour,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
      >
        {children}
      </Box>
    </Box>
  )
}

/** A unit after a stat (DM Sans 14, white .55-ish). */
function StatUnit({ children }: { children: ReactNode }) {
  return (
    <Box component="span" sx={{ fontFamily: tokens.font.family, fontSize: 14, color: summit.onSky.muted }}>
      {children}
    </Box>
  )
}

/** A rail card: white radius 30, padded 22 × 24, with an Outfit 17 title (or a deep-sky one for "Last time"). */
function RailCard({
  title,
  deep = false,
  children,
}: {
  title?: ReactNode
  deep?: boolean
  children: ReactNode
}) {
  return (
    <Box
      component="section"
      sx={{
        ...(deep ? deepSkySurface : cardSurface),
        position: 'relative',
        overflow: 'hidden',
        minWidth: 0,
        px: '24px',
        py: '22px',
      }}
    >
      {title && (
        <Box component="h2" sx={{ m: 0, mb: '14px', ...displayTitle('card'), fontSize: 17 }}>
          {title}
        </Box>
      )}
      {children}
    </Box>
  )
}

/**
 * Progress: a 64 px ring of sets ticked, the time left at this pace (minutes so far ÷ sets ticked × sets still open),
 * and one 8 px bar per exercise filled by its share of sets ticked.
 */
function ProgressPanel({
  session,
  done,
  planned,
  now,
}: {
  session: LoggerSession
  done: number
  planned: number
  now: number
}) {
  const pct = planned ? Math.round((done / planned) * 100) : 0
  const minutesLeft = done
    ? Math.round(((now - Date.parse(session.started_at)) / done / 60_000) * (planned - done))
    : null
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
      <RailCard>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <MetricRing
            value={done}
            target={Math.max(1, planned)}
            metric="steps"
            color={tokens.accent.main}
            trackColor={tokens.ink.fill}
            size={64}
            thickness={7}
            centre={`${pct}%`}
            label="Sets ticked"
            unit="sets"
          />
          <Box sx={{ minWidth: 0 }}>
            <Box component="h2" sx={{ m: 0, ...displayTitle('card'), fontSize: 17 }}>
              Progress
            </Box>
            <Box sx={{ ...RAIL_TEXT_SX, mt: '2px' }}>
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
        </Box>
        {session.exercises.length > 0 && (
          <Box aria-hidden sx={{ display: 'flex', gap: '4px', mt: '16px' }}>
            {session.exercises.map((e) => {
              const share = e.sets.length ? (e.sets.filter((x) => x.done).length / e.sets.length) * 100 : 0
              return (
                <Box
                  key={e.exercise_id}
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    height: 8,
                    borderRadius: `${tokens.radius.pill}px`,
                    background: `linear-gradient(90deg, ${tokens.accent.main} ${share}%, ${tokens.ink.fill} ${share}%)`,
                  }}
                />
              )
            })}
          </Box>
        )}
      </RailCard>
    </Reveal>
  )
}

/**
 * Last time (the deep-sky card): each exercise's sets from the last session that logged it (the greyed "Previous"
 * column), summed — sets against this session's plan and volume (Σ reps × kg) — with the volume to beat and today's
 * so far.
 */
function LastTimePanel({ session, done, volume }: { session: LoggerSession; done: number; volume: number }) {
  const withLast = session.exercises.filter((e) => e.last && e.last.sets.length > 0)
  if (withLast.length === 0) return null
  const sets = withLast.flatMap((e) => e.last!.sets)
  const lastVolume = sets.reduce((sum, s) => sum + (s.reps ?? 0) * (s.load_kg ?? 0), 0)
  const date = withLast
    .map((e) => e.last!.date)
    .sort()
    .at(-1)!
  const planned = session.exercises.reduce((n, e) => n + e.sets.length, 0)
  const started = session.exercises.filter((e) => e.sets.some((x) => x.done)).length
  const strong = { color: summit.deepSky.text, fontWeight: tokens.font.weight.heading } as const
  return (
    <Reveal delay={railDelay(1)} sx={{ minWidth: 0 }}>
      <RailCard deep title={`Last time · ${formatWeekday(date)}, ${formatShortDate(date)}`}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
          {[
            ['sets', String(sets.length), `/${planned}`],
            ['kg', formatNumber(lastVolume), ''],
          ].map(([label, value, of]) => (
            <Box key={label} sx={{ ...deepSkyWell, px: '6px', py: '10px', textAlign: 'center' }}>
              <Box
                sx={{
                  fontFamily: tokens.font.display,
                  fontSize: 17,
                  fontWeight: tokens.font.weight.number,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {value}
                {of && (
                  <Box
                    component="span"
                    sx={{ fontSize: tokens.font.size.micro, color: summit.deepSky.muted }}
                  >
                    {of}
                  </Box>
                )}
              </Box>
              <Box
                sx={{
                  fontSize: tokens.font.size.micro,
                  fontWeight: tokens.font.weight.body,
                  color: summit.deepSky.muted,
                }}
              >
                {label}
              </Box>
            </Box>
          ))}
        </Box>
        <Box
          sx={{
            mt: '12px',
            fontSize: tokens.font.size.small,
            fontWeight: tokens.font.weight.body,
            lineHeight: tokens.font.leading.body,
            color: summit.coach.muted,
          }}
        >
          {session.finished ? (
            <>
              This session:{' '}
              <Box component="strong" sx={strong}>
                {formatNumber(volume)} kg
              </Box>
              .
            </>
          ) : volume > lastVolume ? (
            <>
              <Box component="strong" sx={strong}>
                {formatNumber(volume)} kg
              </Box>{' '}
              so far: {formatNumber(volume - lastVolume)} kg more than last time.
            </>
          ) : (
            <>
              Beat it today:{' '}
              <Box component="strong" sx={strong}>
                {formatNumber(lastVolume + 1)} kg
              </Box>
              .
              {done > 0 &&
                ` You’re ${formatNumber(volume)} kg in after ${started} exercise${started === 1 ? '' : 's'}.`}
            </>
          )}
        </Box>
      </RailCard>
    </Reveal>
  )
}

/**
 * Readiness at the start: the readiness chip (score and volume verdict; tap for its details), then what it is made of
 * (sleep, steps, rest days) in words, in a warm well.
 */
function ReadinessPanel({ readiness }: { readiness: NonNullable<LoggerSession['readiness']> }) {
  const sleep = readiness.sleep_h === null ? 'not logged' : `${formatNumber(readiness.sleep_h, 1)} h of 7.5 h`
  const steps =
    readiness.steps_vs_median === null
      ? 'not logged'
      : `${formatNumber(readiness.steps_vs_median, 2)} × your 14-day median`
  const days =
    readiness.days_since_last_session === null
      ? 'no session yet'
      : `${readiness.days_since_last_session} day${readiness.days_since_last_session === 1 ? '' : 's'}`
  return (
    <Reveal delay={railDelay(2)} sx={{ minWidth: 0 }}>
      <RailCard>
        <Box component="h2" sx={{ ...eyebrow, m: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <SpeedRounded aria-hidden sx={{ fontSize: 18, color: summit.plum }} />
          Readiness
        </Box>
        <Box
          sx={{
            mt: '12px',
            display: 'grid',
            gap: '10px',
            fontSize: tokens.font.size.body,
            fontWeight: tokens.font.weight.body,
            lineHeight: tokens.font.leading.body,
            color: tokens.ink.body,
          }}
        >
          <Box>
            <ReadinessChip readiness={readiness} />
          </Box>
          <Box sx={{ ...wellSurface, borderRadius: `${summit.radius.wellSmall}px`, px: '14px', py: '12px' }}>
            Sleep last night: {sleep}. Steps yesterday: {steps}. Since your last session: {days}.
          </Box>
        </Box>
      </RailCard>
    </Reveal>
  )
}
