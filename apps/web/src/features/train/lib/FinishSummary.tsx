// Owns: the session finish screen (SPEC §7 "Finish"; 2a kit) — the title row ("Upper B — Pull done", the date, a
// pending badge while the finish is queued), duration, total volume, sets and PRs as stat cards, the muscle map of
// what was trained (levels from the session's muscle scores), volume per muscle as a compact bar list, the PRs (best
// load at a rep count, best e1RM), each exercise's ticked sets, one-tap "Save as template", "Edit sets" (back into the
// logger; saving finishes it again with the same end time), "Back to Train" and "Delete session".
import BookmarkAddOutlined from '@mui/icons-material/BookmarkAddOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import EmojiEventsRounded from '@mui/icons-material/EmojiEventsRounded'
import FitnessCenterRounded from '@mui/icons-material/FitnessCenterRounded'
import TaskAltRounded from '@mui/icons-material/TaskAltRounded'
import TimerOutlined from '@mui/icons-material/TimerOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import type { PersonalRecord } from '@fitness/shared/schemas'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  formatNumber,
  formatShortDate,
  formatWeekday,
  PageHeader,
  Panel,
  PendingBadge,
  ProgressBar,
  StatCard,
} from '../../../components'
import { MUSCLE_LABELS, MuscleMap, MuscleMapLegend } from '../../../muscle-map'
import { tokens } from '../../../theme'
import { useExerciseIndex } from '../../library'
import { DeleteSessionDialog } from './DeleteSessionDialog'
import type { LoggerSession } from './logger-model'
import { loggerState } from './logger-store'
import { SaveTemplateDialog } from './SaveTemplateDialog'
import { liftText } from './SetRow'
import { finishView } from './summary'

const MUTED_SX = { fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.muted } as const

function prText(pr: PersonalRecord): { title: string; detail: string } {
  const lift = `${formatNumber(pr.load_kg, pr.load_kg % 1 ? 1 : 0)} kg × ${pr.reps}`
  if (pr.kind === 'best_e1rm')
    return {
      title: `Best e1RM ${formatNumber(pr.e1rm_kg, 1)} kg`,
      detail: `${lift}${pr.previous_best_kg === null ? '' : ` · was ${formatNumber(pr.previous_best_kg, 1)} kg`}`,
    }
  return {
    title: `Best at ${pr.reps} reps: ${lift}`,
    detail:
      pr.previous_best_kg === null
        ? 'First time at this many reps'
        : `Was ${formatNumber(pr.previous_best_kg, 1)} kg`,
  }
}

export function FinishSummary({ session }: { session: LoggerSession }) {
  const index = useExerciseIndex()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<{ templateId: string; queued: boolean } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const view = useMemo(() => finishView(session, index.byId), [session, index.byId])
  if (!view) return null
  const { summary } = view
  const name = (id: string) => index.byId.get(id)?.name ?? 'Exercise'
  const maxKg = view.volume[0]?.kg ?? 0
  const queued = session.finished?.queued ?? false
  const defaultName = `${session.name ?? 'Session'} · ${formatShortDate(session.date)}`.slice(0, 100)
  const done = session.exercises
    .map((e) => ({ e, sets: e.sets.filter((s) => s.done) }))
    .filter((x) => x.sets.length > 0)

  return (
    <Box data-testid="session-summary" sx={{ display: 'grid', gap: 4, minWidth: 0 }}>
      <PageHeader
        title={session.name ? `${session.name} done` : 'Session done'}
        subtitle={`${formatWeekday(session.date)}, ${formatShortDate(session.date)}`}
        action={queued ? <PendingBadge label="Syncs when online" /> : undefined}
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 4 }}>
        <StatCard label="Duration" icon={TimerOutlined} value={summary.duration_min} unit="min" testId="summary-duration" />
        <StatCard label="Volume" icon={FitnessCenterRounded} value={summary.total_volume_kg} unit="kg" testId="summary-volume" />
        <StatCard label="Sets" icon={TaskAltRounded} value={view.sets_done} />
        <StatCard
          label="PRs"
          icon={EmojiEventsRounded}
          value={view.prs_pending ? '—' : summary.prs.length}
          footnote={view.prs_pending ? 'After it syncs' : undefined}
        />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 4, alignItems: 'start' }}>
        <Panel
          title="What you trained"
          description="Sets × 1.0 for main muscles, × 0.5 for helpers"
          testId="summary-muscle-map"
        >
          {view.volume.length === 0 && Object.keys(summary.muscle_scores).length === 0 ? (
            <Box sx={MUTED_SX}>No ticked sets, so nothing was trained.</Box>
          ) : (
            <Stack spacing={3} sx={{ alignItems: 'center' }}>
              <MuscleMap levels={view.levels} size={300} title="Muscles trained this session" />
              <MuscleMapLegend dense />
            </Stack>
          )}
        </Panel>

        <Box sx={{ display: 'grid', gap: 4, minWidth: 0 }}>
          {view.volume.length > 0 && (
            <Panel
              title="Volume per muscle"
              description="Reps × kg, main muscles in full, helpers at half"
              testId="summary-volume-by-muscle"
            >
              <Stack spacing={2}>
                {view.volume.map(({ muscle, kg }) => (
                  <Box
                    key={muscle}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '92px minmax(0, 1fr) 72px',
                      gap: 3,
                      alignItems: 'center',
                      fontSize: tokens.font.size.small,
                    }}
                  >
                    <Box sx={{ color: tokens.ink.text }}>{MUSCLE_LABELS[muscle]}</Box>
                    <ProgressBar
                      value={maxKg ? Math.max(0.04, kg / maxKg) : 0}
                      color={tokens.accent.main}
                      label={`${MUSCLE_LABELS[muscle]} volume`}
                    />
                    <Box sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: tokens.ink.label }}>
                      {formatNumber(kg)} kg
                    </Box>
                  </Box>
                ))}
              </Stack>
            </Panel>
          )}

          <Panel title="Personal records" testId="summary-prs">
            {view.prs_pending ? (
              <Box sx={MUTED_SX}>PRs are checked against your history once this session syncs.</Box>
            ) : summary.prs.length === 0 ? (
              <Box sx={MUTED_SX}>No new records this time. Consistency is what moves them.</Box>
            ) : (
              <Stack spacing={3}>
                {summary.prs.map((pr) => {
                  const t = prText(pr)
                  return (
                    <Box key={`${pr.exercise_id}-${pr.kind}-${pr.reps}`} sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
                      <EmojiEventsRounded sx={{ fontSize: 18, color: tokens.tone.warning.text, mt: '1px' }} aria-hidden />
                      <Box sx={{ minWidth: 0 }}>
                        <Box sx={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.heading }}>{name(pr.exercise_id)}</Box>
                        <Box sx={{ fontSize: tokens.font.size.small }}>{t.title}</Box>
                        <Box sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.muted }}>{t.detail}</Box>
                      </Box>
                    </Box>
                  )
                })}
              </Stack>
            )}
          </Panel>
        </Box>
      </Box>

      {done.length > 0 && (
        <Panel title="Exercises">
          {done.map(({ e, sets }) => (
            <Box
              key={e.exercise_id}
              sx={{ py: '8px', '&:first-of-type': { pt: 0 }, '&:last-of-type': { pb: 0 }, '& + &': { borderTop: `1px solid ${tokens.ink.hairline}` } }}
            >
              <Box sx={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.label }}>{name(e.exercise_id)}</Box>
              <Box sx={{ ...MUTED_SX, fontVariantNumeric: 'tabular-nums' }}>
                {sets.map((s) => liftText(s)).join(' · ')}
              </Box>
              {e.note.trim() && (
                <Box sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.muted, fontStyle: 'italic' }}>{e.note.trim()}</Box>
              )}
            </Box>
          ))}
        </Panel>
      )}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
        <Button
          variant="contained"
          startIcon={<BookmarkAddOutlined />}
          onClick={() => setSaving(true)}
          disabled={done.length === 0}
          data-testid="summary-save-template"
          sx={{ flex: { xs: '1 1 auto', sm: 'none' } }}
        >
          Save as template
        </Button>
        <Button
          variant="outlined"
          startIcon={<EditOutlined />}
          onClick={() => loggerState().update(session.id, (c) => ({ ...c, editing: true }))}
          data-testid="summary-edit"
          sx={{ flex: { xs: '1 1 auto', sm: 'none' } }}
        >
          Edit sets
        </Button>
        <Button variant="outlined" onClick={() => void navigate('/train')} sx={{ flex: { xs: '1 1 auto', sm: 'none' } }}>
          Back to Train
        </Button>
        <Button
          color="error"
          onClick={() => setDeleting(true)}
          data-testid="delete-session"
          sx={{ ml: { sm: 'auto' }, width: { xs: '100%', sm: 'auto' } }}
        >
          Delete session
        </Button>
      </Box>
      <DeleteSessionDialog open={deleting} sessionId={session.id} setsDone={view.sets_done} onClose={() => setDeleting(false)} />

      <SaveTemplateDialog
        open={saving}
        session={session}
        defaultName={defaultName}
        onClose={() => setSaving(false)}
        onSaved={(outcome) => {
          setSaving(false)
          setSaved(outcome)
        }}
      />
      <Snackbar
        open={saved !== null}
        autoHideDuration={6000}
        onClose={() => setSaved(null)}
        message={saved?.queued ? 'Template saved on this device; it syncs when online' : 'Saved as a template'}
        action={
          saved ? (
            <Button color="inherit" onClick={() => void navigate(`/train/builder/${saved.templateId}`)}>
              Edit
            </Button>
          ) : undefined
        }
      />
    </Box>
  )
}
