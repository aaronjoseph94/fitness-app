// Owns: the Train tab's "This week" card (2a: a full-width card, the week's muscle map in a tinted panel on the right)
// over GET /api/ai/week — seven day chips (preset to his training days, today marked) with a live preview of the split
// those days give (engine splitSlots: "Mon Upper A · Tue Lower A · Thu Full body"); Generate (POST /api/ai/week with the
// chosen days, which become his training days and get one AI draft each; it asks first when a chosen day already has a
// template, says where to add a model key when none is set, and re-reads everything even when it fails, since the
// days may have been saved); each training day with its template, "No workout yet" or, when its last draft failed,
// "Couldn't draft — Generate to retry", and "Drafting…" / "Draft waiting"; Keep all (accepts the week's pending split
// drafts in turn, with progress and any refusal); whether the week's templates cover every major muscle group; the
// week plan line; the combined map.
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded'
import CheckCircleOutlineRounded from '@mui/icons-material/CheckCircleOutlineRounded'
import DoneAllRounded from '@mui/icons-material/DoneAllRounded'
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded'
import EventNoteOutlined from '@mui/icons-material/EventNoteOutlined'
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
import { muscleLevels, splitNameKey, splitSlots, weekdayOf, type MuscleValues } from '@fitness/shared/engine'
import type { LocalDate, Muscle, ProposalDecision, SplitSlot, Template, TrainingWeek, TrainingWeekSlot, Weekday } from '@fitness/shared/schemas'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router'
import { apiQueryKey, call, isApiError, problemText } from '../../../api'
import { cardSurface, StatusChip } from '../../../components'
import { MuscleMap } from '../../../muscle-map'
import { tokens } from '../../../theme'
import { pendingWorkoutOf, type PendingWorkout } from '../../builder'

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
const inWeekOrder = (days: readonly Weekday[]): Weekday[] => DAYS.filter((d) => days.includes(d.key)).map((d) => d.key)

/** "Mon Upper A · Tue Lower A · Thu Full body". */
const splitLine = (slots: readonly SplitSlot[]) => slots.map((s) => `${SHORT[s.weekday]} ${s.name}`).join(' · ')

const hairline = `1px solid ${tokens.ink.hairline}`

/** A line under the controls: what Generate or Keep all did, or why not. */
type Note = { tone: 'info' | 'success' | 'error'; text: ReactNode }

const NOTE_COLOUR = { info: tokens.ink.label, success: tokens.tone.success.text, error: tokens.status.flag } as const

const NO_MODEL_KEY = (
  <>
    Add a model key in{' '}
    <Link component={RouterLink} to="/settings/ai">
      Settings → AI
    </Link>{' '}
    first.
  </>
)

export interface WeekSplitCardProps {
  week: TrainingWeek
  /** Today (Edmonton): its chip is marked. */
  date: LocalDate
  /** The templates: Generate asks first when a chosen day already has one. */
  templates: readonly Template[]
  /** Called with each draft Keep all kept (read from the Worker's answer) and that answer, so its card shows the outcome (and Undo). */
  onKept: (draft: PendingWorkout, decision: ProposalDecision) => void
  /** Called as Generate starts: the drafts kept from the page make way for the new week's. */
  onGenerate: () => void
}

export function WeekSplitCard({ week, date, templates, onKept, onGenerate }: WeekSplitCardProps) {
  const queryClient = useQueryClient()
  // null = follow his saved training days; a pick previews a new split until Generate saves it.
  const [picked, setPicked] = useState<Weekday[] | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState<'generate' | 'keep' | null>(null)
  const [note, setNote] = useState<Note | null>(null)

  const chosen = inWeekOrder(picked ?? week.training_days)
  const preview = splitSlots(chosen)
  const todayKey = weekdayOf(date)
  const waiting = week.slots.flatMap((s) => (s.draft ? [{ id: s.draft.proposal_id, name: s.name }] : []))
  // Generate asks first when a chosen day's slot already has a template (its draft would replace it on Keep).
  const redraws = preview.some((s) => templates.some((t) => splitNameKey(t.name) === splitNameKey(s.name)))

  const weekTemplates = week.slots.flatMap((s) => (s.template ? [s.template] : []))
  /** The week's map: score(m) = Σ over the days' templates of that template's score(m), then the engine's levels. */
  const levels = useMemo(() => {
    const summed: MuscleValues = {}
    for (const s of week.slots)
      for (const [m, v] of Object.entries(s.template?.muscle_scores ?? {}) as [Muscle, number][]) summed[m] = (summed[m] ?? 0) + v
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
        text: isApiError(e) && e.code === 'no_model_key' ? NO_MODEL_KEY : `Couldn't generate the week: ${problemText(e)}`,
      })
    } finally {
      setBusy(null)
    }
  }

  /** Accept the week's pending split drafts one after another (each Keep replaces or makes a template). */
  const keepAll = async () => {
    const drafts = waiting
    const refused: string[] = []
    setBusy('keep')
    for (const [i, d] of drafts.entries()) {
      setNote({ tone: 'info', text: `Keeping ${i + 1} of ${drafts.length}…` })
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
    const kept = drafts.length - refused.length
    setNote(
      refused.length === 0
        ? { tone: 'success', text: `Kept ${kept} draft${kept === 1 ? '' : 's'}.` }
        : { tone: 'error', text: `Kept ${kept} of ${drafts.length}. ${refused.join(' ')}` },
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
        ...cardSurface,
        overflow: 'hidden',
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) 260px' },
      }}
    >
      <Box sx={{ minWidth: 0, px: { xs: 4, sm: '22px' }, py: 5 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 3 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box
              component="h2"
              id="week-split-title"
              sx={{ m: 0, fontSize: tokens.font.size.cardTitle, fontWeight: tokens.font.weight.heading, lineHeight: tokens.font.leading.cardTitle }}
            >
              This week
            </Box>
            <Box sx={{ mt: '2px', fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.muted }}>
              Pick the days you train and generate a workout for each. The days you pick become your training days.
            </Box>
          </Box>
          {waiting.length > 0 && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<DoneAllRounded />}
              onClick={() => void keepAll()}
              disabled={busy !== null}
              data-testid="keep-all"
              sx={{ flex: 'none' }}
            >
              Keep all
            </Button>
          )}
        </Box>

        <Box sx={{ mt: 4, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 3 }}>
          <ToggleButtonGroup
            value={chosen}
            onChange={(_, next: Weekday[]) => setPicked(inWeekOrder(next))}
            aria-label="Training days"
            disabled={busy !== null}
            sx={{
              flex: '1 1 300px',
              maxWidth: 420,
              display: 'grid',
              gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
              // Several days are on at once, so a picked day is dark (as in Settings' training days dialog).
              '& .MuiToggleButton-root': {
                px: 0,
                '&.Mui-selected, &.Mui-selected:hover': { bgcolor: tokens.dark.bg, color: tokens.dark.text, boxShadow: 'none' },
              },
            }}
          >
            {DAYS.map((d) => (
              <ToggleButton key={d.key} value={d.key} aria-label={d.key === todayKey ? `${d.long}, today` : d.long} data-testid="day-chip">
                {d.short}
                {d.key === todayKey && (
                  // Today: a 4 px dot under the label, in the label's own colour (white on a picked day).
                  <Box
                    component="span"
                    aria-hidden
                    sx={{ position: 'absolute', bottom: 3, left: '50%', width: 4, height: 4, ml: '-2px', borderRadius: `${tokens.radius.pill}px`, bgcolor: 'currentColor' }}
                  />
                )}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <Button
            variant="contained"
            startIcon={<AutoAwesomeRounded />}
            onClick={() => (redraws ? setConfirming(true) : void generate())}
            disabled={n === 0 || busy !== null}
            aria-describedby="week-preview"
            data-testid="generate-week"
            // Wide enough for "Generating…", so the label change does not move the row.
            sx={{ minWidth: 136 }}
          >
            {busy === 'generate' ? 'Generating…' : 'Generate'}
          </Button>
        </Box>
        <Box
          id="week-preview"
          aria-live="polite"
          data-testid="week-preview"
          sx={{ mt: 2, fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.label }}
        >
          {n > 0 ? splitLine(preview) : 'Pick at least one day.'}
        </Box>
        {note && (
          <Box
            role={note.tone === 'error' ? 'alert' : 'status'}
            data-testid="week-note"
            sx={{ mt: 2, fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: NOTE_COLOUR[note.tone] }}
          >
            {note.text}
          </Box>
        )}

        <Box component="ul" aria-label="Your training days" aria-live="polite" sx={{ listStyle: 'none', p: 0, m: 0, mt: 4, borderTop: hairline }}>
          {week.slots.length > 0 ? (
            week.slots.map((slot) => <DayRow key={slot.weekday} slot={slot} />)
          ) : (
            <Box component="li" sx={{ py: 3, fontSize: tokens.font.size.small, color: tokens.ink.muted, borderBottom: hairline }}>
              No training days yet. Pick them above, then Generate.
            </Box>
          )}
        </Box>

        <Coverage uncovered={week.uncovered} />
        {week.week_plan_sessions && (
          <Box
            data-testid="week-plan-line"
            sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: '6px', fontSize: tokens.font.size.small, color: tokens.ink.label }}
          >
            <EventNoteOutlined aria-hidden sx={{ fontSize: 16, color: tokens.accent.main }} />
            This week follows your week plan
          </Box>
        )}
      </Box>

      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          p: 4,
          bgcolor: tokens.ink.panel,
          borderTop: { xs: `1px solid ${tokens.ink.border}`, md: 'none' },
          borderLeft: { md: `1px solid ${tokens.ink.border}` },
        }}
      >
        <Box data-testid="week-muscles">
          <MuscleMap levels={levels} size={200} title="Muscles your week's templates train" />
        </Box>
        <Box sx={{ fontSize: tokens.font.size.caption, lineHeight: tokens.font.leading.caption, color: tokens.ink.muted, textAlign: 'center' }}>
          {weekTemplates.length > 0
            ? `${weekTemplates.length} template${weekTemplates.length === 1 ? '' : 's'} combined`
            : 'No templates for these days yet'}
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
          {n === 1 && preview[0] ? `Redraft ${SHORT[preview[0].weekday]} ${preview[0].name}?` : `Redraft all ${n} days?`}
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

/**
 * One training day: the weekday, its slot name, its template's size, "No workout yet" or (its last draft failed)
 * "Couldn't draft — Generate to retry" in the warning tone, and a drafting / draft chip.
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
        display: 'grid',
        gridTemplateColumns: '36px minmax(0, 1fr) auto',
        alignItems: 'center',
        columnGap: 3,
        py: '10px',
        borderBottom: hairline,
      }}
    >
      <Box sx={{ fontSize: tokens.font.size.small, fontWeight: tokens.font.weight.label, color: tokens.ink.label }}>{SHORT[slot.weekday]}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.heading, lineHeight: tokens.font.leading.body, overflowWrap: 'anywhere' }}>
          {slot.name}
        </Box>
        <Box
          data-testid={failed ? 'week-day-failed' : undefined}
          sx={{
            fontSize: tokens.font.size.small,
            lineHeight: tokens.font.leading.small,
            color: failed ? tokens.tone.warning.text : tokens.ink.muted,
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
        {status && <StatusChip tone={slot.drafting ? 'neutral' : 'info'} dot size="small" label={status} testId="week-day-status" />}
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
        mt: 3,
        display: 'flex',
        alignItems: 'flex-start',
        gap: '6px',
        fontSize: tokens.font.size.small,
        lineHeight: tokens.font.leading.small,
        fontWeight: tokens.font.weight.label,
        color: covered ? tokens.tone.success.text : tokens.tone.warning.text,
      }}
    >
      <Icon aria-hidden sx={{ fontSize: 16, mt: '2px', flex: 'none' }} />
      {covered ? 'Covers every major muscle group' : `Not covered yet: ${uncovered.join(', ')}`}
    </Box>
  )
}
