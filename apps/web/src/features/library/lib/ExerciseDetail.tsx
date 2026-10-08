// Owns: the body of an exercise's detail view (SPEC §7) as 2a cards — animated demo when matched (with the Gym visual
// credit its terms require; a GIF that fails to load leaves the step images), both step images, a "Muscles and
// equipment" card (primary / secondary muscles, equipment, category, level, mechanic and force as rows beside the
// muscle map on an `ink.panel` panel — primary at level 4, secondary at level 2 — with the YouTube form-video search),
// "How to" (GET /api/exercises/:id: the cached list has none), the strength chart with PRs and next session's
// suggestion from GET /api/history/exercises/:id, and "Hide forever" (or, when hidden, why and "Un-hide"). Shared by
// the detail sheet (cards under the sheet's h2) and the /train/library/:id page (cards under its h1). The cards rise in
// one after another on mount (2a's entrance, `cardDelay`).
import BlockRounded from '@mui/icons-material/BlockRounded'
import OndemandVideoRounded from '@mui/icons-material/OndemandVideoRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import { endpoints } from '@fitness/shared/api'
import type { Exercise, ExerciseHistory, ExerciseSummary, Muscle, PersonalRecord } from '@fitness/shared/schemas'
import { useMemo, useState } from 'react'
import { useApiQuery } from '../../../api'
import { StrengthChart, type StrengthSession } from '../../../charts'
import { ChartCard, formatNumber, formatShortDate, LegendChips, Panel, PanelRow, Reveal, staggerDelay } from '../../../components'
import { MUSCLE_LABELS, MuscleMap, type MuscleLevel } from '../../../muscle-map'
import { tokens, withAlpha } from '../../../theme'
import { HiddenNotice } from './HiddenNotice'
import { HideForeverDialog } from './HideForeverDialog'
import { categoryLabel, equipmentLabel, sentence } from './labels'

/** Map levels for one exercise: primary muscles heavy (4), secondary moderate (2). */
export function exerciseLevels(e: Pick<Exercise, 'primary_muscles' | 'secondary_muscles'>): Partial<Record<Muscle, MuscleLevel>> {
  const levels: Partial<Record<Muscle, MuscleLevel>> = {}
  for (const m of e.secondary_muscles) levels[m] = 2
  for (const m of e.primary_muscles) levels[m] = 4
  return levels
}

/**
 * One point per session with a loaded set, oldest first: top-set load, the reps done at it, best Epley e1RM. Entries
 * come newest first; read oldest first so two sessions on one day keep their order through the (stable) date sort.
 */
export function strengthSessions(history: ExerciseHistory): StrengthSession[] {
  const points: StrengthSession[] = []
  for (const entry of [...history.entries].reverse()) {
    if (entry.top_load_kg === null) continue
    const atTop = entry.sets.filter((s) => s.load_kg === entry.top_load_kg && s.reps !== null)
    const reps = atTop.length ? Math.max(...atTop.map((s) => s.reps ?? 0)) : null
    points.push({ date: entry.date, load: entry.top_load_kg, reps, e1rm: entry.best_e1rm_kg ?? entry.top_load_kg })
  }
  return points.sort((a, b) => a.date.localeCompare(b.date))
}

/** Gym visual's terms: every use of an ExerciseDB GIF shows this line (packages/exercises/SOURCE.md). */
const GIF_CREDIT = '© Gym visual — gymvisual.com'
const GIF_CREDIT_URL = 'https://gymvisual.com/'
const isExerciseDbGif = (url: string) => url.startsWith('/media/exercises/')

type Heading = 'h2' | 'h3'

/** 2a's entrance: the cards rise in reading order, a card's stagger apart, after the page's title row. */
const cardDelay = (i: number) => staggerDelay(i, tokens.motion.stagger.card, tokens.motion.stagger.section)

function Media({ exercise, delay }: { exercise: ExerciseSummary; delay: number }) {
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set())
  const fail = (src: string) => setBroken((s) => new Set(s).add(src))
  const gif = exercise.gif_url && !broken.has(exercise.gif_url) ? exercise.gif_url : null
  const steps = exercise.image_paths.filter((p) => !broken.has(p)).slice(0, 2)
  if (!gif && steps.length === 0) return null
  // 2a frame: white, 1 px `ink.border`, the control radius.
  const frame = {
    borderRadius: `${tokens.radius.control}px`,
    border: `1px solid ${tokens.ink.border}`,
    bgcolor: tokens.ink.card,
    width: '100%',
    display: 'block',
    objectFit: 'contain' as const,
  }
  return (
    <Reveal delay={delay}>
      <Stack spacing={2} data-testid="exercise-media">
        {gif && (
          <Box component="figure" sx={{ m: 0 }}>
            <Box component="img" src={gif} alt={`${exercise.name} demonstration`} onError={() => fail(gif)} sx={{ ...frame, aspectRatio: '1 / 1', maxHeight: 320 }} />
            {isExerciseDbGif(gif) && (
              <Box component="figcaption" data-testid="exercise-gif-credit" sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.secondary, textAlign: 'center' }}>
                {/* A full-height tap target (44 px), not just the 15 px line of text. */}
                <Box component="a" href={GIF_CREDIT_URL} target="_blank" rel="noopener noreferrer" sx={{ color: 'inherit', display: 'inline-flex', alignItems: 'center', minHeight: tokens.tapTarget, px: 2 }}>
                  {GIF_CREDIT}
                </Box>
              </Box>
            )}
          </Box>
        )}
        {steps.length > 0 && (
          <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`, gap: 2 }}>
            {steps.map((src, i) => (
              <Box key={src} sx={{ position: 'relative' }}>
                <Box component="img" src={src} alt={`${exercise.name}, step ${i + 1}`} loading="lazy" onError={() => fail(src)} sx={{ ...frame, aspectRatio: '3 / 2' }} />
                {/* A badge on the photo: 11/500 on a near-opaque white chip. */}
                <Box
                  sx={{
                    position: 'absolute',
                    left: 8,
                    top: 8,
                    px: '6px',
                    py: '1px',
                    borderRadius: `${tokens.radius.inner}px`,
                    bgcolor: withAlpha(tokens.ink.card, 0.92),
                    fontSize: tokens.font.size.micro,
                    fontWeight: tokens.font.weight.label,
                    lineHeight: tokens.font.leading.micro,
                    color: tokens.ink.label,
                  }}
                >
                  {i === 0 ? 'Start' : 'Finish'}
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Stack>
    </Reveal>
  )
}

function History({ exerciseId, heading, delay }: { exerciseId: string; heading: Heading; delay: number }) {
  const history = useApiQuery(endpoints.training.exerciseHistory, { params: { id: exerciseId } }, { retry: false })
  const points = useMemo(() => (history.data ? strengthSessions(history.data) : []), [history.data])
  if (!history.data || points.length === 0) return null
  // The highest e1RM PR (PRs of one day come in no particular order).
  const best = history.data.prs.filter((p) => p.kind === 'best_e1rm').reduce<PersonalRecord | null>((b, p) => (b && b.e1rm_kg >= p.e1rm_kg ? b : p), null)
  const next = history.data.next
  return (
    <Reveal delay={delay}>
      <ChartCard
        title="Strength"
        subtitle={`${points.length} session${points.length === 1 ? '' : 's'}${best ? ` · best e1RM ${formatNumber(best.e1rm_kg, 1)} kg (${formatShortDate(best.date)})` : ''}`}
        headingComponent={heading}
        testId="exercise-strength"
      >
        <StrengthChart sessions={points} />
        {next && (
          <Box sx={{ mt: 3, fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.secondary }}>
            <Box component="span" sx={{ color: tokens.ink.text, fontWeight: tokens.font.weight.label }}>
              Next time:{' '}
            </Box>
            {next.load_kg !== null ? `${formatNumber(next.load_kg, 1)} kg · ` : ''}
            {next.reason}
          </Box>
        )}
      </ChartCard>
    </Reveal>
  )
}

/** "How to": the steps from GET /api/exercises/:id (kept for an hour; offline it answers from the read cache). */
function Instructions({ exerciseId, heading, delay }: { exerciseId: string; heading: Heading; delay: number }) {
  const full = useApiQuery(endpoints.training.getExercise, { params: { id: exerciseId } }, { staleTime: 60 * 60_000 })
  const steps: Exercise['instructions'] = full.data?.instructions ?? []
  if (!full.isPending && steps.length === 0) return null
  return (
    <Reveal delay={delay}>
      <Box data-testid="exercise-instructions">
        <Panel title="How to" description={full.isPending ? undefined : `${steps.length} step${steps.length === 1 ? '' : 's'}`} headingComponent={heading}>
          {full.isPending ? (
            <Stack spacing={1} aria-busy="true" aria-label="Loading the steps">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} variant="text" sx={{ fontSize: tokens.font.size.body }} />
              ))}
            </Stack>
          ) : (
            // Numbered like Train's exercise list: the step number in muted tabular figures, the text 14/1.55.
            <Box component="ol" role="list" sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {steps.map((step, i) => (
                <Box component="li" key={i} sx={{ display: 'flex', alignItems: 'baseline', gap: '12px', fontSize: tokens.font.size.body, lineHeight: tokens.font.leading.emphasis, color: tokens.ink.body }}>
                  <Box component="span" sx={{ flex: 'none', width: 16, textAlign: 'right', color: tokens.ink.secondary, fontSize: tokens.font.size.small, fontVariantNumeric: 'tabular-nums' }}>
                    {i + 1}
                  </Box>
                  <Box component="span" sx={{ minWidth: 0 }}>
                    {step}
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Panel>
      </Box>
    </Reveal>
  )
}

const muscleNames = (muscles: readonly Muscle[]) => muscles.map((m) => MUSCLE_LABELS[m]).join(', ')

/** Muscles and equipment: label/value rows beside the muscle map on Train's 260 px `ink.panel` side panel. */
function Overview({ exercise, heading }: { exercise: ExerciseSummary; heading: Heading }) {
  const rows: [string, string][] = [
    ['Primary', muscleNames(exercise.primary_muscles)],
    ['Secondary', muscleNames(exercise.secondary_muscles)],
    ['Equipment', equipmentLabel(exercise.equipment)],
    ['Category', categoryLabel(exercise.category)],
    ['Level', sentence(exercise.level)],
    ['Mechanic', exercise.mechanic ? sentence(exercise.mechanic) : ''],
    ['Force', exercise.force ? sentence(exercise.force) : ''],
  ]
  return (
    <Panel
      title="Muscles and equipment"
      headingComponent={heading}
      padding="none"
      actions={
        <Button variant="outlined" size="small" startIcon={<OndemandVideoRounded />} href={exercise.video_search_url} target="_blank" rel="noopener noreferrer">
          Watch form videos
        </Button>
      }
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) 260px' }, borderTop: `1px solid ${tokens.ink.hairline}` }}>
        <Box sx={{ px: `${tokens.pad.card.x}px`, py: '6px', minWidth: 0 }}>
          {rows
            .filter(([, value]) => value !== '')
            .map(([label, value]) => (
              <PanelRow key={label} label={label} value={value} />
            ))}
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
            borderLeft: { sm: `1px solid ${tokens.ink.border}` },
            borderTop: { xs: `1px solid ${tokens.ink.border}`, sm: 'none' },
          }}
        >
          <MuscleMap levels={exerciseLevels(exercise)} size={200} title={`Muscles trained by ${exercise.name}`} />
          <LegendChips
            items={[
              { label: 'Primary', color: tokens.muscleMap.steps[3] },
              { label: 'Secondary', color: tokens.muscleMap.steps[1] },
            ]}
          />
        </Box>
      </Box>
    </Panel>
  )
}

export interface ExerciseDetailProps {
  /** A row of the cached library list; the instructions are fetched here. */
  exercise: ExerciseSummary
  /** Called after the exercise was hidden (e.g. close the sheet). */
  onHidden?: () => void
  /** Heading level of the cards: h3 under a sheet's h2 title (default), h2 under a page's h1. */
  headingComponent?: Heading
}

export function ExerciseDetail({ exercise, onHidden, headingComponent = 'h3' }: ExerciseDetailProps) {
  const [hiding, setHiding] = useState(false)

  return (
    <Stack spacing={4} data-testid="exercise-detail">
      {!exercise.allowed && (
        <Reveal delay={cardDelay(0)}>
          <HiddenNotice exercise={exercise} />
        </Reveal>
      )}
      <Media exercise={exercise} delay={cardDelay(1)} />
      <Reveal delay={cardDelay(2)}>
        <Overview exercise={exercise} heading={headingComponent} />
      </Reveal>
      <Instructions exerciseId={exercise.id} heading={headingComponent} delay={cardDelay(3)} />
      <History exerciseId={exercise.id} heading={headingComponent} delay={cardDelay(4)} />

      {exercise.allowed && (
        <Reveal delay={cardDelay(5)}>
          <Button color="error" startIcon={<BlockRounded />} onClick={() => setHiding(true)} data-testid="hide-forever">
            Hide forever
          </Button>
        </Reveal>
      )}
      {hiding && (
        <HideForeverDialog
          exercise={exercise}
          onClose={() => setHiding(false)}
          onHidden={() => {
            setHiding(false)
            onHidden?.()
          }}
        />
      )}
    </Stack>
  )
}
