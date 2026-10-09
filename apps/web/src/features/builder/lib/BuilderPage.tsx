// Owns: the workout builder page (/train/builder, /train/builder/:templateId, /train/builder?from=<id> to duplicate;
// SPEC §7) — name, a live muscle map of the template's scores, the exercise list (tap to add from the picker, drag to
// reorder, per-exercise sets / rep range / load / rest / note), notes, "Fill with AI" into a preview, and a sticky
// Start / Save bar, and "Delete template" (asks first; sessions started from it keep their sets). The fill's pending
// workout proposal goes with the next create or start (accepting it). Leaving with unsaved changes asks first.
// 2a: the page's h1 ("Workout builder", or "Edit template") with Duplicate / Delete on the right, a summary card in
// Train's today-card idiom (name, notes and sets | the muscle map and what it trains on an `ink.panel` panel), the exercise
// cards and the sticky bar (above the bottom tabs on a phone, at the bottom of the window from `md` up).
import AddRounded from '@mui/icons-material/AddRounded'
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded'
import CloseRounded from '@mui/icons-material/CloseRounded'
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded'
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded'
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { endpoints } from '@fitness/shared/api'
import { SESSION_SETS, today } from '@fitness/shared/engine'
import type { Template, WorkoutDraft } from '@fitness/shared/schemas'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useBlocker, useNavigate, useParams, useSearchParams } from 'react-router'
import { apiQueryKey, problemText, useApiMutation, useApiQuery } from '../../../api'
import { Banner, dashedSurface, EmptyState, formatShortDate, LoadProblem, PageHeader, Reveal, SectionHeader, staggerDelay, statValue, StatusChip } from '../../../components'
import { MUSCLE_LABELS } from '../../../muscle-map'
import { tokens } from '../../../theme'
import { ExerciseDetailSheet, ExercisePicker, useExerciseIndex } from '../../library'
import { AiWorking } from './AiWorking'
import { AiWorkoutPreview } from './AiWorkoutPreview'
import { ExerciseCard } from './ExerciseCard'
import { MapCard } from './MapCard'
import { defaultPrescription, draftMuscleLevels } from './scores'
import { useTemplateWrites } from './start'
import { fromTemplate, problems, toExercises, useBuilder } from './useBuilder'
import { useAiWorkout } from './useAiWorkout'

/** On a phone, sticky bars sit above the fixed bottom nav. */
const ABOVE_NAV = `calc(${tokens.layout.bottomNavHeight}px + env(safe-area-inset-bottom, 0px))`

export function BuilderPage() {
  const { templateId } = useParams()
  const [params] = useSearchParams()
  const duplicateOf = templateId ? null : params.get('from')
  const navigate = useNavigate()
  const templates = useApiQuery(endpoints.training.listTemplates, {})
  const index = useExerciseIndex()
  const builder = useBuilder()
  const writes = useTemplateWrites()
  const ai = useAiWorkout()
  const { state, load } = builder

  const [picker, setPicker] = useState<{ mode: 'add' } | { mode: 'swap'; key: string } | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [showProblems, setShowProblems] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const queryClient = useQueryClient()
  const remove = useApiMutation(endpoints.training.deleteTemplate, { invalidates: [endpoints.training.listTemplates] })
  /** The pending workout proposal of the AI fill now in the builder; sent with the next create or start, then cleared. */
  const [proposalId, setProposalId] = useState<string | null>(null)
  /** Set before a navigation the builder makes itself (after a save, into a session), so it is not blocked. */
  const leaving = useRef(false)
  const nameRef = useRef<HTMLInputElement | null>(null)

  // Load the template being edited or duplicated once per source (a fresh save navigates without reloading).
  const loaded = useRef<string | null>(null)
  const sourceId = templateId ?? duplicateOf
  const sourceKey = `${templateId ?? ''}|${duplicateOf ?? ''}`
  const source = sourceId ? templates.data?.find((t) => t.id === sourceId) : undefined
  useEffect(() => {
    if (loaded.current === sourceKey) return
    if (!sourceId) {
      loaded.current = sourceKey
      return
    }
    if (source) {
      loaded.current = sourceKey
      load(fromTemplate(source, duplicateOf !== null))
    }
  }, [sourceKey, sourceId, source, duplicateOf, load])
  useEffect(() => {
    leaving.current = false
  }, [templateId])

  const training = useMemo(() => draftMuscleLevels(state.items, index.byId), [state.items, index.byId])
  const pickedIds = useMemo(() => new Set(state.items.map((i) => i.exercise_id)), [state.items])
  const issues = problems(state, index.byId)

  const blocker = useBlocker(({ currentLocation, nextLocation }) => builder.dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = state.items.findIndex((i) => i.key === active.id)
    const to = state.items.findIndex((i) => i.key === over.id)
    if (from >= 0 && to >= 0) builder.move(from, to)
  }

  /** Save the builder; returns the template id, or null when something blocks it. */
  const save = async (override?: WorkoutDraft): Promise<string | null> => {
    const list = override ? override.exercises : toExercises(state.items)
    if (issues.length > 0 && !override) {
      setShowProblems(true)
      if (!state.name.trim()) nameRef.current?.focus()
      return null
    }
    const name = state.name.trim() || `AI · ${formatShortDate(today(Date.now()))}`
    const proposal_id = override?.proposal_id ?? proposalId ?? undefined
    try {
      const outcome = await writes.save({
        id: templateId,
        name,
        origin: state.origin,
        notes: state.notes.trim() || override?.rationale.trim() || null,
        exercises: list,
        proposal_id,
      })
      builder.markSaved()
      // A new template accepted it; a replace cannot, so the next start sends it instead.
      if (!templateId) setProposalId(null)
      if (!templateId) {
        loaded.current = `${outcome.templateId}|`
        leaving.current = true
        void navigate(`/train/builder/${outcome.templateId}`, { replace: true })
      }
      setNotice(outcome.queued ? 'Saved on this device · syncs when you’re back online' : 'Template saved')
      return outcome.templateId
    } catch (e) {
      setNotice(problemText(e))
      return null
    }
  }

  const start = async (override?: WorkoutDraft) => {
    const proposal_id = override?.proposal_id ?? proposalId ?? undefined
    const id = builder.dirty || !templateId || override ? await save(override) : templateId
    if (!id) return
    leaving.current = true
    try {
      await writes.start(id, override ? 'ai' : 'template', proposal_id)
    } catch (e) {
      leaving.current = false
      setNotice(problemText(e))
    }
  }

  /** Delete the template being edited; the Train tab's list drops it at once, even while the write is queued. */
  const deleteTemplate = async () => {
    if (!templateId) return
    try {
      await remove.mutateAsync({ params: { id: templateId } })
      queryClient.setQueriesData<Template[]>({ queryKey: apiQueryKey(endpoints.training.listTemplates) }, (list) => list?.filter((t) => t.id !== templateId))
      setConfirmDelete(false)
      leaving.current = true
      void navigate('/train', { replace: true })
    } catch (e) {
      setConfirmDelete(false)
      setNotice(problemText(e))
    }
  }

  const fillWithAi = () => {
    setAiOpen(true)
    ai.run({ mode: 'fill', exercises: toExercises(state.items) })
  }

  const subtitle = (
    <>
      Machines and free weights from your allowed set ·{' '}
      <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
        {SESSION_SETS.min}–{SESSION_SETS.max} sets a session
      </Box>
    </>
  )
  const title = templateId ? 'Edit template' : 'Workout builder'

  // The template to edit or duplicate isn't here yet (loading, a failed read, not found): the title row still stands,
  // as the same first element as the builder's own, so it rises in once.
  const gate =
    sourceId && !source ? (
      templates.isLoading ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 10 }}>
          <CircularProgress aria-label="Loading template" />
        </Box>
      ) : templates.error && !templates.data ? (
        <LoadProblem what="The template" error={templates.error} onRetry={() => void templates.refetch()} />
      ) : loaded.current !== sourceKey ? (
        <EmptyState title="Template not found" body="It may not have synced yet." action={{ label: 'New template', onClick: () => navigate('/train/builder') }} />
      ) : null
    ) : null
  if (gate)
    return (
      <Stack spacing={6}>
        <PageHeader title={title} subtitle={subtitle} />
        {gate}
      </Stack>
    )

  const addButton = (variant: 'slot' | 'outlined') => (
    <Button
      variant="outlined"
      startIcon={<AddRounded />}
      onClick={() => setPicker({ mode: 'add' })}
      data-testid="builder-add"
      // The slot: 2a's dashed empty-slot frame across the list's width, under the last card.
      sx={variant === 'slot' ? { ...dashedSurface, width: '100%', mt: 3, minHeight: 48, color: tokens.ink.label, boxShadow: 'none', '&:hover': { bgcolor: tokens.ink.fill } } : undefined}
    >
      Add exercise
    </Button>
  )

  return (
    <Stack spacing={6} data-testid="builder-page">
      <PageHeader
        title={title}
        subtitle={subtitle}
        action={
          templateId && (
            <>
              <Button variant="outlined" startIcon={<ContentCopyRounded />} aria-label="Duplicate template" onClick={() => navigate(`/train/builder?from=${templateId}`)}>
                Duplicate
              </Button>
              <Button color="error" startIcon={<DeleteOutlineRounded />} aria-label="Delete template" onClick={() => setConfirmDelete(true)} data-testid="builder-delete">
                Delete
              </Button>
            </>
          )
        }
      />

      {/* 2a's entrance: after the title row, the summary card and then the exercises rise in, a section's stagger apart. */}
      <Reveal delay={staggerDelay(1, tokens.motion.stagger.section)}>
        <MapCard
          levels={training.levels}
          mapTitle="Muscles this template trains"
          caption={training.top.length > 0 ? training.top.slice(0, 4).map((m) => MUSCLE_LABELS[m]).join(', ') : 'Muscles light up as you add exercises'}
          testId="builder-map"
        >
          <TextField
            inputRef={nameRef}
            fullWidth
            label="Template name"
            value={state.name}
            onChange={(e) => builder.setName(e.target.value)}
            placeholder="e.g. Upper A"
            error={showProblems && !state.name.trim()}
            helperText={showProblems && !state.name.trim() ? 'Needed to save' : undefined}
            slotProps={{ htmlInput: { maxLength: 100, enterKeyHint: 'done' } }}
          />
          <TextField
            label="Notes"
            fullWidth
            value={state.notes}
            onChange={(e) => builder.setNotes(e.target.value)}
            multiline
            minRows={2}
            sx={{ mt: 4 }}
            slotProps={{ htmlInput: { maxLength: 1000 } }}
          />
          <Box sx={{ mt: 5, display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: '6px' }}>
            <Box
              data-testid="builder-sets"
              sx={{ ...statValue('standard'), lineHeight: tokens.font.leading.number, color: tokens.ink.text }}
            >
              {training.totalSets}
            </Box>
            <Box sx={{ fontSize: tokens.font.size.small, color: tokens.ink.secondary }}>
              sets · {state.items.length} exercise{state.items.length === 1 ? '' : 's'}
            </Box>
          </Box>
          {training.outsideRail && (
            <Box sx={{ mt: 3 }}>
              <StatusChip
                tone="warning"
                label={`${training.outsideRail === 'under' ? `Under ${SESSION_SETS.min} sets` : `Over ${SESSION_SETS.max} sets`} (session range ${SESSION_SETS.min}–${SESSION_SETS.max})`}
              />
            </Box>
          )}
        </MapCard>
      </Reveal>

      <Reveal delay={staggerDelay(2, tokens.motion.stagger.section)}>
        <SectionHeader
          title="Exercises"
          subtitle={state.items.length > 0 ? 'Drag to reorder · open one to set its sets, reps, load and rest' : undefined}
          action={
            <Button size="small" startIcon={<AutoAwesomeRounded />} onClick={fillWithAi} disabled={state.items.length === 0} data-testid="fill-with-ai">
              Fill with AI
            </Button>
          }
        />
        {state.items.length === 0 ? (
          <EmptyState title="No exercises yet" body="Add one or two exercises, then let the AI fill a balanced session." action={addButton('outlined')} />
        ) : (
          <>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={state.items.map((i) => i.key)} strategy={verticalListSortingStrategy}>
                <Stack spacing={3}>
                  {state.items.map((item, i) => (
                    <ExerciseCard
                      key={item.key}
                      item={item}
                      index={i}
                      exercise={index.byId.get(item.exercise_id)}
                      expanded={expanded === item.key}
                      onToggle={() => setExpanded((k) => (k === item.key ? null : item.key))}
                      onChange={(patch) => builder.update(item.key, patch)}
                      onRemove={() => builder.remove(item.key)}
                      onSwap={() => setPicker({ mode: 'swap', key: item.key })}
                      onInfo={() => setInfo(item.exercise_id)}
                    />
                  ))}
                </Stack>
              </SortableContext>
            </DndContext>
            {addButton('slot')}
          </>
        )}
      </Reveal>

      {showProblems && issues.length > 0 && (
        <Alert severity="warning" onClose={() => setShowProblems(false)}>
          {issues.join(' ')}
        </Alert>
      )}

      <Box
        sx={{
          position: 'sticky',
          // Above the bottom tabs on a phone; from `md` up there are none.
          bottom: { xs: ABOVE_NAV, md: 0 },
          zIndex: 2,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 2,
          py: 3,
          mx: { xs: -4, md: 0 },
          px: { xs: 4, md: 0 },
          bgcolor: tokens.ink.page,
          borderTop: `1px solid ${tokens.ink.border}`,
        }}
      >
        <Button variant="outlined" startIcon={<PlayArrowRounded />} disabled={writes.busy || state.items.length === 0} onClick={() => void start()} sx={{ flex: { xs: 1, sm: 'none' }, minWidth: 120 }} data-testid="builder-start">
          Start
        </Button>
        <Button variant="contained" disabled={writes.busy || (!builder.dirty && !!templateId)} onClick={() => void save()} sx={{ flex: { xs: 1, sm: 'none' }, minWidth: 120 }} data-testid="builder-save">
          {builder.dirty || !templateId ? 'Save' : 'Saved'}
        </Button>
      </Box>

      <ExercisePicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        keepOpen={picker?.mode === 'add'}
        pickedIds={pickedIds}
        sameMuscleAs={picker?.mode === 'swap' ? state.items.find((i) => i.key === picker.key)?.exercise_id : undefined}
        onPick={(e) => {
          // One row per exercise: the session logger keeps one card per exercise, so a second row's sets would be lost.
          if (pickedIds.has(e.id)) setNotice(`${e.name} is already in this template`)
          else if (picker?.mode === 'swap') builder.update(picker.key, { exercise_id: e.id, target_load_kg: null })
          else setExpanded(builder.add(defaultPrescription(e)))
        }}
      />
      <ExerciseDetailSheet exerciseId={info} open={info !== null} onClose={() => setInfo(null)} />

      <Dialog open={aiOpen} onClose={() => setAiOpen(false)} fullScreen aria-labelledby="ai-fill-title">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 4, pt: `calc(${tokens.space(2)}px + env(safe-area-inset-top, 0px))`, pb: 2, borderBottom: `1px solid ${tokens.ink.border}` }}>
          <IconButton aria-label="Close" onClick={() => (setAiOpen(false), ai.reset())}>
            <CloseRounded />
          </IconButton>
          <Typography id="ai-fill-title" variant="sectionTitle" component="h2">
            Fill with AI
          </Typography>
        </Box>
        <Box sx={{ flex: 1, overflowY: 'auto', bgcolor: tokens.ink.page }}>
          <Box sx={{ maxWidth: (t) => t.breakpoints.values.sm, mx: 'auto', px: 4, pt: 4 }}>
            {ai.state.status === 'done' ? (
              <AiWorkoutPreview
                draft={ai.state.draft}
                headingComponent="h3"
                busy={writes.busy}
                saveLabel="Use in builder"
                actionsBottom="env(safe-area-inset-bottom, 0px)"
                onSwap={(next) => ai.setDraft(next)}
                onSave={(draft) => {
                  builder.replaceAll(draft.exercises, { notes: state.notes.trim() ? state.notes : draft.rationale })
                  setProposalId(draft.proposal_id ?? null)
                  setAiOpen(false)
                  ai.reset()
                  setNotice('AI fill added · review and save')
                }}
                onStart={(draft) => {
                  builder.replaceAll(draft.exercises)
                  setAiOpen(false)
                  void start(draft)
                }}
              />
            ) : ai.state.status === 'failed' ? (
              <Banner
                tone="warning"
                role="alert"
                action={
                  <Button variant="outlined" size="small" onClick={fillWithAi}>
                    Try again
                  </Button>
                }
              >
                {ai.state.message}
              </Banner>
            ) : (
              <AiWorking slow={ai.state.status === 'working' && ai.state.slow} />
            )}
          </Box>
        </Box>
      </Dialog>

      <Dialog open={confirmDelete} onClose={() => !remove.isPending && setConfirmDelete(false)} aria-labelledby="delete-template-title">
        <DialogTitle id="delete-template-title">Delete {state.name.trim() || 'this template'}?</DialogTitle>
        <DialogContent sx={{ color: 'text.secondary' }}>Sessions you started from it keep their sets and history.</DialogContent>
        <DialogActions sx={{ px: 6, pb: 4 }}>
          <Button onClick={() => setConfirmDelete(false)} disabled={remove.isPending}>
            Keep it
          </Button>
          <Button color="error" onClick={() => void deleteTemplate()} disabled={remove.isPending} data-testid="confirm-delete-template">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={blocker.state === 'blocked'} onClose={() => blocker.reset?.()} aria-labelledby="discard-title">
        <DialogTitle id="discard-title">Discard changes?</DialogTitle>
        <DialogContent sx={{ color: 'text.secondary' }}>This template has unsaved changes.</DialogContent>
        <DialogActions sx={{ px: 6, pb: 4 }}>
          <Button onClick={() => blocker.reset?.()}>Keep editing</Button>
          <Button color="error" onClick={() => blocker.proceed?.()}>
            Discard
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={notice !== null}
        autoHideDuration={3500}
        onClose={() => setNotice(null)}
        message={notice ?? ''}
        sx={{ bottom: { xs: `calc(${tokens.layout.bottomNavHeight + 84}px + env(safe-area-inset-bottom, 0px))`, md: '84px' } }}
      />
    </Stack>
  )
}
