// Owns: the Train tab's "This week" card (1d Summit: the screen's deep-sky card) over GET /api/ai/week — the week's dates
// and day count, Keep all and Generate as glass buttons; the seven days as a row of tiles that scrolls sideways when
// narrow (README §4: grid-auto-columns minmax(128px, 1fr)) — each a toggle that picks it as a training day (preset to his
// training days), named by the split those days give (engine splitSlots, live as he picks), done days gold-outlined with
// their sets and volume, today white, a picked day ahead dashed, a fast day coral, rest dim; the live preview of the split
// ("Mon Upper A · Tue Lower A · Thu Full body"); Generate (POST /api/ai/week with the chosen days, which become his
// training days and get one AI draft each; it asks first when a chosen day already has a template, says where to add a
// model key when none is set, and re-reads everything even when it fails, since the days may have been saved); each saved
// training day with its template, "No workout yet" or, when its last draft failed, "Couldn't draft — Generate to retry",
// and "Drafting…" / "Draft waiting"; Keep all (accepts the week's pending split drafts in turn, with progress and any
// refusal); whether the week's templates cover every major muscle group; the week plan line; the combined map.
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded'
import CheckCircleOutlineRounded from '@mui/icons-material/CheckCircleOutlineRounded'
import DoneAllRounded from '@mui/icons-material/DoneAllRounded'
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded'
import EventNoteOutlined from '@mui/icons-material/EventNoteOutlined'
import PlayCircleRounded from '@mui/icons-material/PlayCircleRounded'
import TimerOutlined from '@mui/icons-material/TimerOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Link from '@mui/material/Link'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { endpoints } from '@fitness/shared/api'
import {
  addDays,
  muscleLevels,
  splitNameKey,
  splitSlots,
  weekdayOf,
  weekStart,
  type MuscleValues,
} from '@fitness/shared/engine'
import type {
  LocalDate,
  Muscle,
  ProposalDecision,
  SplitSlot,
  Template,
  TrainingWeek,
  TrainingWeekSlot,
  Weekday,
} from '@fitness/shared/schemas'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router'
import { apiQueryKey, call, isApiError, problemText } from '../../../api'
import {
  deepSkyWell,
  displayTitle,
  eyebrow,
  fixedCol,
  formatDayRange,
  formatNumber,
  StatusChip,
  wrapCol,
} from '../../../components'
import { MuscleMap } from '../../../muscle-map'
import { tokens, withAlpha } from '../../../theme'
import { pendingWorkoutOf, type PendingWorkout } from '../../builder'
import type { DayWork } from './RecentSessions'

const { summit } = tokens

const DAYS: readonly { key: Weekday; short: string; long: string }[] = [
  { key: 'mon', short: 'Mon', long: 'Monday' },
  { key: 'tue', short: 'Tue', long: 'Tuesday' },
  { key: 'wed', short: 'Wed', long: 'Wednesday' },
  { key: 'thu', short: 'Thu', long: 'Thursday' },
  { key: 'fri', short: 'Fri', long: 'Friday' },
  { key: 'sat', short: 'Sat', long: 'Saturday' },
  { key: 'sun', short: 'Sun', long: 'Sunday' },
]

const SHORT = Object.fromEntries(DAYS.map((d) => [d.key, d.short])) as Record<Weekday, string>

/** The days in week order, each once. */
const inWeekOrder = (days: readonly Weekday[]): Weekday[] =>
  DAYS.filter((d) => days.includes(d.key)).map((d) => d.key)

/** "Mon Upper A · Tue Lower A · Thu Full body". */
const splitLine = (slots: readonly SplitSlot[]) =>
  slots.map((s) => `${SHORT[s.weekday]} ${s.name}`).join(' · ')

/** A line under the controls: what Generate or Keep all did, or why not. */
type Note = { tone: 'info' | 'success' | 'error'; text: ReactNode }

/** On the deep sky: white for news, light teal for done, coral for a refusal (each ≥ 6:1 on the card). */
const NOTE_COLOUR = {
  info: summit.onSky.subtitle,
  success: tokens.tone.success.light,
  error: summit.coral.main,
} as const

const NO_MODEL_KEY = (
  <>
    Add a model key in{' '}
    <Link
      component={RouterLink}
      to="/settings/ai"
      sx={{ color: summit.gold.main, textDecoration: 'underline', '&:hover': { color: summit.onSky.text } }}
    >
      Settings → AI
    </Link>{' '}
    first.
  </>
)

/** The keyboard ring on the deep sky: gold (the theme's violet would not read). */
const goldFocus = {
  '&.Mui-focusVisible': {
    outline: `${tokens.focusRing.width}px solid ${summit.gold.main}`,
    outlineOffset: tokens.focusRing.offset,
  },
} as const

/** A glass button on the deep sky: white on white .1 with a white .3 edge, radius 12, 38 px (44 on touch). */
const glassButtonSx = {
  minHeight: 38,
  px: '14px',
  border: `1px solid ${summit.glass.controlBorder}`,
  bgcolor: summit.glass.fill,
  color: summit.onSky.text,
  fontSize: tokens.font.size.small,
  '&:hover': { bgcolor: summit.glass.fillHover },
  '&.Mui-disabled': {
    bgcolor: summit.deepSky.well,
    color: summit.onSky.disabled,
    border: `1px solid ${summit.deepSky.hairline}`,
  },
  ...goldFocus,
} as const

export interface WeekSplitCardProps {
  week: TrainingWeek
  /** Today (Edmonton): its tile is marked. */
  date: LocalDate
  /** The templates: Generate asks first when a chosen day already has one. */
  templates: readonly Template[]
  /** Finished work this week by date (a done day's tile shows its sets and volume). */
  done?: ReadonlyMap<LocalDate, DayWork>
  /** Fast days this week (planned or kept), by date. */
  fastDays?: ReadonlySet<LocalDate>
  /**
   * Called with each draft Keep all kept (read from the Worker's answer) and that answer, so its card shows the outcome
   * (and Undo).
   */
  onKept: (draft: PendingWorkout, decision: ProposalDecision) => void
  /** Called as Generate starts: the drafts kept from the page make way for the new week's. */
  onGenerate: () => void
}

export function WeekSplitCard({
  week,
  date,
  templates,
  done,
  fastDays,
  onKept,
  onGenerate,
}: WeekSplitCardProps) {
  const queryClient = useQueryClient()
  // null = follow his saved training days; a pick previews a new split until Generate saves it.
  const [picked, setPicked] = useState<Weekday[] | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState<'generate' | 'keep' | null>(null)
  const [note, setNote] = useState<Note | null>(null)

  const chosen = inWeekOrder(picked ?? week.training_days)
  const preview = splitSlots(chosen)
  const todayKey = weekdayOf(date)
  const monday = weekStart(date)
  const waiting = week.slots.flatMap((s) => (s.draft ? [{ id: s.draft.proposal_id, name: s.name }] : []))
  // Generate asks first when a chosen day's slot already has a template (its draft would replace it on Keep).
  const redraws = preview.some((s) => templates.some((t) => splitNameKey(t.name) === splitNameKey(s.name)))

  const weekTemplates = week.slots.flatMap((s) => (s.template ? [s.template] : []))
  /** The week's map: score(m) = Σ over the days' templates of that template's score(m), then the engine's levels. */
  const levels = useMemo(() => {
    const summed: MuscleValues = {}
    for (const s of week.slots)
      for (const [m, v] of Object.entries(s.template?.muscle_scores ?? {}) as [Muscle, number][])
        summed[m] = (summed[m] ?? 0) + v
    return muscleLevels(summed)
  }, [week.slots])

  const generate = async () => {
    setConfirming(false)
    setBusy('generate')
    setNote(null)
    onGenerate()
    try {
      const result = await call(endpoints.ai.planWeek, { body: { training_days: chosen } })
      // The days may have moved (targets' training flags, today's split template) and every chosen day is drafting.
      await queryClient.invalidateQueries({ queryKey: apiQueryKey() })
      setPicked(null)
      if (result.job_ids.length === 0 && result.skipped.length > 0)
        setNote({ tone: 'info', text: `Already drafting: ${result.skipped.join(', ')}.` })
    } catch (e) {
      // The days may have been saved before the drafting failed: re-read them all the same.
      void queryClient.invalidateQueries({ queryKey: apiQueryKey() })
      setNote({
        tone: 'error',
        text:
          isApiError(e) && e.code === 'no_model_key'
            ? NO_MODEL_KEY
            : `Couldn't generate the week: ${problemText(e)}`,
      })
    } finally {
      setBusy(null)
    }
  }

  /** Accept the week's pending split drafts one after another (each Keep replaces or makes a template). */
  const keepAll = async () => {
    const refused: string[] = []
    setBusy('keep')
    for (const [i, d] of waiting.entries()) {
      setNote({ tone: 'info', text: `Keeping ${i + 1} of ${waiting.length}…` })
      try {
        const decision = await call(endpoints.plan.acceptProposal, { params: { id: d.id } })
        // The draft from the Worker's answer, not the feed: a kept draft leaves the pending feed, and its Undo with it.
        const draft = pendingWorkoutOf(decision.proposal)
        if (draft) onKept(draft, decision)
      } catch (e) {
        refused.push(`${d.name}: ${problemText(e)}`)
      }
    }
    await queryClient.invalidateQueries({ queryKey: apiQueryKey() })
    const kept = waiting.length - refused.length
    setNote(
      refused.length === 0
        ? { tone: 'success', text: `Kept ${kept} draft${kept === 1 ? '' : 's'}.` }
        : { tone: 'error', text: `Kept ${kept} of ${waiting.length}. ${refused.join(' ')}` },
    )
    setBusy(null)
  }

  const n = chosen.length
  return (
    <Box
      component="section"
      aria-labelledby="week-split-title"
      data-testid="week-split"
      sx={{
        position: 'relative',
        overflow: 'hidden',
        minWidth: 0,
        px: { xs: '22px', sm: '28px' },
        py: '24px',
        borderRadius: `${summit.radius.large}px`,
        background: summit.deepSky.bg,
        color: summit.deepSky.text,
        boxShadow: summit.deepSky.shadow,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px 12px' }}>
        <Box
          component="h2"
          id="week-split-title"
          sx={{ m: 0, flex: '1 1 160px', minWidth: 0, ...displayTitle('card'), fontSize: 22 }}
        >
          This week
        </Box>
        <Box
          sx={{
            fontSize: tokens.font.size.small,
            fontWeight: tokens.font.weight.body,
            color: summit.deepSky.muted,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatDayRange(monday, addDays(monday, 6))} · {n} training day{n === 1 ? '' : 's'}
        </Box>
        {waiting.length > 0 && (
          <Button
            startIcon={<DoneAllRounded />}
            onClick={() => void keepAll()}
            disabled={busy !== null}
            data-testid="keep-all"
            sx={glassButtonSx}
          >
            Keep all
          </Button>
        )}
        <Button
          startIcon={<AutoAwesomeRounded sx={{ color: summit.gold.main }} />}
          onClick={() => (redraws ? setConfirming(true) : void generate())}
          disabled={n === 0 || busy !== null}
          aria-describedby="week-preview"
          data-testid="generate-week"
          // Wide enough for "Generating…", so the label change does not move the row.
          sx={{ ...glassButtonSx, minWidth: 136 }}
        >
          {busy === 'generate' ? 'Generating…' : 'Generate'}
        </Button>
      </Box>
      <Box
        sx={{
          mt: '6px',
          fontSize: tokens.font.size.small,
          lineHeight: tokens.font.leading.small,
          color: summit.deepSky.muted,
        }}
      >
        Pick the days you train and generate a workout for each. The days you pick become your training days.
      </Box>

      {/* The seven days scroll sideways inside the card when they no longer fit (README §4). */}
      <Box
        sx={{
          mt: '18px',
          mx: { xs: '-22px', sm: '-28px' },
          px: { xs: '22px', sm: '28px' },
          pb: '6px',
          overflowX: 'auto',
          overscrollBehaviorX: 'contain',
          scrollbarWidth: 'thin',
          scrollbarColor: `${summit.glass.border} transparent`,
        }}
      >
        <ToggleButtonGroup
          value={chosen}
          onChange={(_, next: Weekday[]) => setPicked(inWeekOrder(next))}
          aria-label="Training days"
          disabled={busy !== null}
          sx={{
            display: 'grid',
            gridAutoFlow: 'column',
            gridAutoColumns: 'minmax(128px, 1fr)',
            gap: '10px',
            p: 0,
            borderRadius: 0,
            bgcolor: 'transparent',
          }}
        >
          {DAYS.map((d, i) => {
            const day = addDays(monday, i)
            const slot = preview.find((s) => s.weekday === d.key) ?? null
            const saved = week.slots.find((s) => s.weekday === d.key) ?? null
            return (
              <DayTile
                key={d.key}
                value={d.key}
                short={d.short}
                long={d.long}
                today={d.key === todayKey}
                slot={slot}
                saved={saved && slot && splitNameKey(saved.name) === splitNameKey(slot.name) ? saved : null}
                work={done?.get(day) ?? null}
                fast={fastDays?.has(day) ?? false}
                past={day < date}
              />
            )
          })}
        </ToggleButtonGroup>
      </Box>
      <Box
        id="week-preview"
        aria-live="polite"
        data-testid="week-preview"
        sx={{
          mt: '10px',
          fontSize: tokens.font.size.small,
          fontWeight: tokens.font.weight.label,
          lineHeight: tokens.font.leading.small,
          color: summit.onSky.subtitle,
        }}
      >
        {n > 0 ? splitLine(preview) : 'Pick at least one day.'}
      </Box>
      {note && (
        <Box
          role={note.tone === 'error' ? 'alert' : 'status'}
          data-testid="week-note"
          sx={{
            mt: '8px',
            fontSize: tokens.font.size.small,
            fontWeight: tokens.font.weight.label,
            lineHeight: tokens.font.leading.small,
            color: NOTE_COLOUR[note.tone],
          }}
        >
          {note.text}
        </Box>
      )}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '18px', mt: '18px', alignItems: 'flex-start' }}>
        <Box sx={{ ...wrapCol(2), display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ ...eyebrow, fontSize: tokens.font.size.caption, color: summit.deepSky.muted }}>
            Your training days
          </Box>
          <Box
            component="ul"
            aria-label="Your training days"
            aria-live="polite"
            sx={{
              listStyle: 'none',
              p: 0,
              m: 0,
              mt: '10px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            {week.slots.length > 0 ? (
              week.slots.map((slot) => <DayRow key={slot.weekday} slot={slot} />)
            ) : (
              <Box
                component="li"
                sx={{
                  ...deepSkyWell,
                  flex: '1 1 100%',
                  px: '14px',
                  py: '12px',
                  fontSize: tokens.font.size.small,
                  color: summit.deepSky.muted,
                }}
              >
                No training days yet. Pick them above, then Generate.
              </Box>
            )}
          </Box>

          <Coverage uncovered={week.uncovered} />
          {week.week_plan_sessions && (
            <Box
              data-testid="week-plan-line"
              sx={{
                mt: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: tokens.font.size.small,
                color: summit.onSky.subtitle,
              }}
            >
              <EventNoteOutlined aria-hidden sx={{ fontSize: 16, color: summit.gold.main }} />
              This week follows your week plan
            </Box>
          )}
        </Box>

        <Box
          sx={{
            ...fixedCol(180),
            ...deepSkyWell,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            p: '14px',
          }}
        >
          <Box data-testid="week-muscles">
            <MuscleMap levels={levels} size={120} title="Muscles your week's templates train" />
          </Box>
          <Box
            sx={{
              fontSize: tokens.font.size.caption,
              lineHeight: tokens.font.leading.caption,
              color: summit.deepSky.muted,
              textAlign: 'center',
            }}
          >
            {weekTemplates.length > 0
              ? `${weekTemplates.length} template${weekTemplates.length === 1 ? '' : 's'} combined`
              : 'No templates for these days yet'}
          </Box>
        </Box>
      </Box>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        fullWidth
        maxWidth="xs"
        aria-labelledby="redraft-title"
        aria-describedby="redraft-body"
      >
        <DialogTitle id="redraft-title">
          {n === 1 && preview[0]
            ? `Redraft ${SHORT[preview[0].weekday]} ${preview[0].name}?`
            : `Redraft all ${n} days?`}
        </DialogTitle>
        <DialogContent id="redraft-body" sx={{ color: 'text.secondary' }}>
          Your templates stay until you keep the new drafts.
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => void generate()} data-testid="confirm-redraft">
            Redraft
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

/** What a day tile looks like: done (gold), today (white), a picked day ahead (dashed), fast (coral), rest (dim). */
function tileLook({
  picked,
  today,
  done,
  fast,
}: {
  picked: boolean
  today: boolean
  done: boolean
  fast: boolean
}) {
  if (today)
    return {
      bg: summit.avatar.bg,
      border: picked ? `1px solid ${summit.avatar.bg}` : `1px dashed ${summit.plum}`,
      text: summit.ink.deep,
      label: summit.plum,
      meta: tokens.ink.secondary,
      glow: `0 0 24px ${withAlpha(summit.gold.main, 0.45)}`,
    }
  if (done)
    return {
      bg: withAlpha(summit.gold.main, 0.16),
      border: `1px solid ${withAlpha(summit.gold.main, picked ? 0.4 : 0.2)}`,
      text: summit.deepSky.text,
      label: summit.gold.main,
      meta: summit.deepSky.muted,
      glow: 'none',
    }
  if (fast)
    return {
      bg: withAlpha(summit.coral.main, 0.2),
      border: `1px ${picked ? 'dashed' : 'solid'} ${withAlpha(summit.coral.main, 0.5)}`,
      text: summit.deepSky.text,
      label: summit.coral.main,
      meta: summit.deepSky.muted,
      glow: 'none',
    }
  if (picked)
    return {
      bg: 'transparent',
      border: `1px dashed ${summit.onSky.disabled}`,
      text: summit.deepSky.text,
      label: summit.onSky.subtitle,
      meta: summit.deepSky.muted,
      glow: 'none',
    }
  return {
    bg: summit.deepSky.well,
    border: '1px solid transparent',
    text: summit.onSky.subtitle,
    label: summit.deepSky.muted,
    meta: summit.deepSky.muted,
    glow: 'none',
  }
}

/**
 * One weekday as a toggle (pressed = a training day): its short name and a glyph (done, today, fast), the split's name
 * for it as picked (or "Rest" / "Fast day"), and a line of what it holds — the work done, the saved day's template, its
 * draft state, or "Generate to draft" for a day picked but not saved yet. ToggleButtonGroup clones its value props in.
 */
function DayTile({
  value,
  short,
  long,
  today,
  slot,
  saved,
  work,
  fast,
  past,
  ...group
}: {
  value: Weekday
  short: string
  long: string
  today: boolean
  slot: SplitSlot | null
  saved: TrainingWeekSlot | null
  work: DayWork | null
  fast: boolean
  past: boolean
}) {
  const picked = slot !== null
  const look = tileLook({ picked, today, done: work !== null, fast })
  const Glyph = work ? CheckCircleOutlineRounded : today ? PlayCircleRounded : fast ? TimerOutlined : null
  const name = slot ? slot.name : fast ? 'Fast day' : 'Rest'
  const meta = work
    ? `${work.sets} set${work.sets === 1 ? '' : 's'} · ${formatNumber(work.volume_kg)} kg`
    : !slot
      ? fast
        ? 'planned fast'
        : ''
      : saved?.drafting
        ? 'Drafting…'
        : saved?.template
          ? `${saved.template.sets} sets · ${today ? 'today' : past ? 'missed' : 'planned'}`
          : saved
            ? 'No workout yet'
            : 'Generate to draft'
  const surface = { bgcolor: look.bg, color: look.text, border: look.border, boxShadow: look.glow }
  return (
    <ToggleButton
      {...group}
      value={value}
      aria-label={today ? `${long}, today` : long}
      data-testid="day-chip"
      sx={{
        // Three classes deep, to outrank the theme's segmented-control look on a grouped button.
        '&&&': {
          ...surface,
          display: 'block',
          minWidth: 0,
          minHeight: 96,
          p: '14px',
          borderRadius: `${summit.radius.wellLarge}px`,
          textAlign: 'left',
          textTransform: 'none',
          lineHeight: 1.3,
          '&:hover': { ...surface, filter: 'brightness(1.12)' },
          '&.Mui-disabled': { opacity: 0.6 },
          ...goldFocus,
        },
      }}
    >
      <Box
        component="span"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '6px',
          fontSize: tokens.font.size.caption,
          fontWeight: tokens.font.weight.heading,
          color: look.label,
        }}
      >
        <span>
          {short}
          {today && ' · today'}
        </span>
        {Glyph && <Glyph aria-hidden sx={{ fontSize: 18 }} />}
      </Box>
      <Box
        component="span"
        sx={{
          display: 'block',
          mt: '8px',
          fontSize: tokens.font.size.emphasis,
          fontWeight: tokens.font.weight.heading,
          overflowWrap: 'anywhere',
        }}
      >
        {name}
      </Box>
      <Box
        component="span"
        sx={{
          display: 'block',
          minHeight: '1.3em',
          fontSize: tokens.font.size.caption,
          fontWeight: tokens.font.weight.body,
          color: look.meta,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {meta}
      </Box>
    </ToggleButton>
  )
}

/**
 * One saved training day, in a well: the weekday, its slot name, its template's size, "No workout yet" or (its last draft
 * failed) "Couldn't draft — Generate to retry" in gold, and a drafting / draft chip.
 */
function DayRow({ slot }: { slot: TrainingWeekSlot }) {
  const status = slot.drafting ? 'Drafting…' : slot.draft ? 'Draft waiting' : null
  const failed = !slot.template && !slot.drafting && slot.failed
  return (
    <Box
      component="li"
      data-testid="week-day"
      data-weekday={slot.weekday}
      sx={{
        ...deepSkyWell,
        flex: '1 1 170px',
        minWidth: 0,
        display: 'grid',
        gridTemplateColumns: '34px minmax(0, 1fr) auto',
        alignItems: 'center',
        columnGap: '8px',
        px: '12px',
        py: '10px',
      }}
    >
      <Box
        sx={{
          fontSize: tokens.font.size.caption,
          fontWeight: tokens.font.weight.heading,
          color: summit.deepSky.muted,
        }}
      >
        {SHORT[slot.weekday]}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Box
          sx={{
            fontSize: tokens.font.size.body,
            fontWeight: tokens.font.weight.heading,
            lineHeight: tokens.font.leading.small,
            overflowWrap: 'anywhere',
          }}
        >
          {slot.name}
        </Box>
        <Box
          data-testid={failed ? 'week-day-failed' : undefined}
          sx={{
            fontSize: tokens.font.size.caption,
            lineHeight: tokens.font.leading.caption,
            color: failed ? summit.gold.main : summit.deepSky.muted,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {slot.template
            ? `${slot.template.exercise_count} exercises · ${slot.template.sets} sets`
            : failed
              ? "Couldn't draft — Generate to retry"
              : 'No workout yet'}
        </Box>
      </Box>
      {/* The chip column is always there, so a day starting or finishing its draft never moves the row. */}
      <Box sx={{ justifySelf: 'end' }}>
        {status && (
          <StatusChip
            tone={slot.drafting ? 'neutral' : 'info'}
            dot
            size="small"
            label={status}
            testId="week-day-status"
          />
        )}
      </Box>
    </Box>
  )
}

/** "Covers every major muscle group", or the groups no day's template reaches yet. */
function Coverage({ uncovered }: { uncovered: TrainingWeek['uncovered'] }) {
  const covered = uncovered.length === 0
  const Icon = covered ? CheckCircleOutlineRounded : ErrorOutlineRounded
  return (
    <Box
      data-testid="week-uncovered"
      sx={{
        mt: '12px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '6px',
        fontSize: tokens.font.size.small,
        lineHeight: tokens.font.leading.small,
        fontWeight: tokens.font.weight.label,
        color: covered ? tokens.tone.success.light : summit.gold.main,
      }}
    >
      <Icon aria-hidden sx={{ fontSize: 16, mt: '2px', flex: 'none' }} />
      {covered ? 'Covers every major muscle group' : `Not covered yet: ${uncovered.join(', ')}`}
    </Box>
  )
}
