// Owns: the session finish screen (SPEC §7 "Finish") — duration, total volume, sets and PRs as stat cards, the muscle
// map of what was trained (levels from the session's muscle scores), volume per muscle as a compact bar list, the
// PRs (best load at a rep count, best e1RM), each exercise's ticked sets, and one-tap "Save as template".
import BookmarkAddOutlined from '@mui/icons-material/BookmarkAddOutlined'
import EmojiEventsRounded from '@mui/icons-material/EmojiEventsRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import type { PersonalRecord } from '@fitness/shared/schemas'
import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { formatNumber, formatShortDate, formatWeekday, PendingBadge, StatCard } from '../../../components'
import { MUSCLE_LABELS, MuscleMap, MuscleMapLegend } from '../../../muscle-map'
import { tokens } from '../../../theme'
import { useExerciseIndex } from '../../library'
import type { LoggerSession } from './logger-model'
import { SaveTemplateDialog } from './SaveTemplateDialog'
import { formatSet } from './SetRow'
import { finishView } from './summary'

function SectionCard({
  title,
  subtitle,
  children,
  testId,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  testId?: string
}) {
  return (
    <Card sx={{ p: 4 }} data-testid={testId}>
      <Box component="h3" sx={{ m: 0, fontSize: 16, fontWeight: tokens.font.weight.heading }}>
        {title}
      </Box>
      {subtitle && <Box sx={{ mt: 0.5, fontSize: 13, color: tokens.ink.secondary }}>{subtitle}</Box>}
      <Box sx={{ mt: 3 }}>{children}</Box>
    </Card>
  )
}

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
    <Stack spacing={3} data-testid="session-summary">
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ fontSize: 13, color: tokens.ink.secondary, fontWeight: tokens.font.weight.label }}>
            {formatWeekday(session.date)} {formatShortDate(session.date)}
          </Box>
          <Box
            component="h2"
            sx={{ m: 0, fontSize: 24, fontWeight: tokens.font.weight.heading, lineHeight: 1.25 }}
          >
            {session.name ? `${session.name} done` : 'Session done'}
          </Box>
        </Box>
        {queued && <PendingBadge label="Syncs when online" />}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
        <StatCard label="Duration" value={summary.duration_min} unit="min" testId="summary-duration" />
        <StatCard label="Volume" value={summary.total_volume_kg} unit="kg" testId="summary-volume" />
        <StatCard label="Sets" value={view.sets_done} />
        <StatCard
          label="PRs"
          value={view.prs_pending ? '—' : summary.prs.length}
          footnote={view.prs_pending ? 'After it syncs' : undefined}
        />
      </Box>

      <SectionCard
        title="What you trained"
        subtitle="Sets × 1.0 for main muscles, × 0.5 for helpers"
        testId="summary-muscle-map"
      >
        {view.volume.length === 0 && Object.keys(summary.muscle_scores).length === 0 ? (
          <Box sx={{ fontSize: 14, color: tokens.ink.secondary }}>
            No ticked sets, so nothing was trained.
          </Box>
        ) : (
          <Stack spacing={3} sx={{ alignItems: 'center' }}>
            <MuscleMap levels={view.levels} size={300} title="Muscles trained this session" />
            <MuscleMapLegend dense />
          </Stack>
        )}
      </SectionCard>

      {view.volume.length > 0 && (
        <SectionCard
          title="Volume per muscle"
          subtitle="Reps × kg, main muscles in full, helpers at half"
          testId="summary-volume-by-muscle"
        >
          <Stack spacing={2}>
            {view.volume.map(({ muscle, kg }) => (
              <Box
                key={muscle}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '92px 1fr 72px',
                  gap: 2,
                  alignItems: 'center',
                  fontSize: 14,
                }}
              >
                <Box sx={{ color: tokens.ink.text }}>{MUSCLE_LABELS[muscle]}</Box>
                <Box sx={{ height: 8, borderRadius: 4, bgcolor: tokens.chart.grid, overflow: 'hidden' }}>
                  <Box
                    sx={{
                      height: '100%',
                      width: `${maxKg ? Math.max(4, (kg / maxKg) * 100) : 0}%`,
                      bgcolor: tokens.muscleMap.steps[3],
                      borderRadius: 4,
                    }}
                  />
                </Box>
                <Box
                  sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: tokens.ink.secondary }}
                >
                  {formatNumber(kg)} kg
                </Box>
              </Box>
            ))}
          </Stack>
        </SectionCard>
      )}

      <SectionCard title="Personal records" testId="summary-prs">
        {view.prs_pending ? (
          <Box sx={{ fontSize: 14, color: tokens.ink.secondary }}>
            PRs are checked against your history once this session syncs.
          </Box>
        ) : summary.prs.length === 0 ? (
          <Box sx={{ fontSize: 14, color: tokens.ink.secondary }}>
            No new records this time. Consistency is what moves them.
          </Box>
        ) : (
          <Stack spacing={2.5}>
            {summary.prs.map((pr) => {
              const t = prText(pr)
              return (
                <Box
                  key={`${pr.exercise_id}-${pr.kind}-${pr.reps}`}
                  sx={{ display: 'flex', gap: 2.5, alignItems: 'flex-start' }}
                >
                  <EmojiEventsRounded sx={{ color: tokens.metric.carbs, mt: 0.25 }} aria-hidden />
                  <Box sx={{ minWidth: 0 }}>
                    <Box sx={{ fontSize: 15, fontWeight: tokens.font.weight.heading }}>
                      {name(pr.exercise_id)}
                    </Box>
                    <Box sx={{ fontSize: 14 }}>{t.title}</Box>
                    <Box sx={{ fontSize: 13, color: tokens.ink.secondary }}>{t.detail}</Box>
                  </Box>
                </Box>
              )
            })}
          </Stack>
        )}
      </SectionCard>

      {done.length > 0 && (
        <SectionCard title="Exercises">
          <Stack spacing={2.5}>
            {done.map(({ e, sets }) => (
              <Box key={e.exercise_id}>
                <Box sx={{ fontSize: 15, fontWeight: tokens.font.weight.label }}>{name(e.exercise_id)}</Box>
                <Box sx={{ fontSize: 14, color: tokens.ink.secondary, fontVariantNumeric: 'tabular-nums' }}>
                  {sets.map((s) => formatSet(s.reps, s.load_kg)).join(' · ')} kg
                </Box>
                {e.note.trim() && (
                  <Box sx={{ fontSize: 13, color: tokens.ink.secondary, fontStyle: 'italic' }}>
                    {e.note.trim()}
                  </Box>
                )}
              </Box>
            ))}
          </Stack>
        </SectionCard>
      )}

      <Button
        variant="contained"
        size="large"
        startIcon={<BookmarkAddOutlined />}
        onClick={() => setSaving(true)}
        disabled={done.length === 0}
        data-testid="summary-save-template"
      >
        Save as template
      </Button>
      <Button size="large" onClick={() => void navigate('/train')}>
        Back to Train
      </Button>

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
        message={saved?.queued ? 'Template saved on this phone; it syncs when online' : 'Saved as a template'}
        action={
          saved ? (
            <Button color="inherit" onClick={() => void navigate(`/train/builder/${saved.templateId}`)}>
              Edit
            </Button>
          ) : undefined
        }
      />
    </Stack>
  )
}
