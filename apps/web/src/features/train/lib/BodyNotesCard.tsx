// Owns: Train's "How you feel" card (1d white card) — the body notes active today (GET /api/body-notes: a sore knee, low
// energy, a cold, each with its area, kind, severity and day, and his words), each with "Better now", which resolves it
// today (PATCH /api/body-notes/:id; queued offline, so the row goes at once). Hidden when there is none. Generated
// workouts go easy on what is listed here (the Worker's steer).
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { endpoints } from '@fitness/shared/api'
import type { BodyArea, BodyNote, BodyNoteKind, Muscle } from '@fitness/shared/schemas'
import { useApiMutation, useApiQuery } from '../../../api'
import { cardSurface, displayTitle, formatDay } from '../../../components'
import { askAiCopy } from '../../../copy/ask-ai'
import { MUSCLE_LABELS } from '../../../muscle-map'
import { usePendingWrites } from '../../../offline'
import { COARSE_POINTER_QUERY, tokens } from '../../../theme'
import { todayLocal } from '../../quick-log'

const JOINT_LABEL: Record<string, string> = {
  knee: 'Knee',
  hip: 'Hip',
  ankle: 'Ankle',
  shoulder_joint: 'Shoulder',
  elbow: 'Elbow',
  wrist: 'Wrist',
  neck_joint: 'Neck',
  spine: 'Back',
  whole_body: 'Whole body',
}

const KIND_LABEL: Record<BodyNoteKind, string> = {
  pain: 'pain',
  soreness: 'sore',
  energy: 'low energy',
  illness: 'unwell',
  mood: 'mood',
}

const SEVERITY_LABEL: Record<number, string> = { 1: 'mild', 2: 'moderate', 3: 'severe' }

function areaLabel(area: BodyArea): string {
  return JOINT_LABEL[area] ?? MUSCLE_LABELS[area as Muscle] ?? area
}

/** "Knee · pain · moderate". */
function noteTitle(n: BodyNote): string {
  return [areaLabel(n.area), KIND_LABEL[n.kind], SEVERITY_LABEL[n.severity] ?? ''].filter(Boolean).join(' · ')
}

/** '/api/body-notes/<id>' → '<id>'. */
const noteIdOf = (path: string) => path.split('/')[3]?.split('?')[0] ?? ''

export function BodyNotesCard() {
  const notes = useApiQuery(endpoints.bodyNotes.active, {}, { staleTime: 60_000 })
  const resolve = useApiMutation(endpoints.bodyNotes.resolve, { invalidates: [endpoints.bodyNotes.active] })
  const queued = usePendingWrites(endpoints.bodyNotes.resolve)
  const resolving = new Set(queued.map((w) => noteIdOf(w.path)))
  if (resolve.isPending && resolve.variables) resolving.add(resolve.variables.params.id)
  const active = (notes.data ?? []).filter((n) => n.resolved_on === null && !resolving.has(n.id))
  if (active.length === 0) return null
  return (
    <Box
      component="section"
      aria-labelledby="body-notes-title"
      data-testid="body-notes"
      sx={{ ...cardSurface, px: { xs: '18px', sm: '24px' }, py: '18px' }}
    >
      <Box
        component="h2"
        id="body-notes-title"
        sx={{ m: 0, ...displayTitle('card'), color: tokens.ink.text }}
      >
        {askAiCopy.bodyNotesTitle}
      </Box>
      <Box
        sx={{
          mt: '2px',
          fontSize: tokens.font.size.small,
          lineHeight: tokens.font.leading.small,
          color: tokens.ink.muted,
        }}
      >
        {askAiCopy.bodyNotesSubtitle}
      </Box>
      <Box component="ul" sx={{ m: 0, mt: '10px', p: 0, listStyle: 'none' }}>
        {active.map((n) => (
          <Box
            component="li"
            key={n.id}
            data-testid="body-note"
            sx={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '4px 12px',
              py: '10px',
              '& + &': { borderTop: `1px solid ${tokens.ink.hairline}` },
            }}
          >
            <Box sx={{ flex: '1 1 180px', minWidth: 0 }}>
              <Box
                sx={{
                  fontSize: tokens.font.size.body,
                  fontWeight: tokens.font.weight.label,
                  color: tokens.ink.text,
                }}
              >
                {noteTitle(n)}
              </Box>
              <Box
                sx={{
                  fontSize: tokens.font.size.caption,
                  color: tokens.ink.muted,
                  overflowWrap: 'break-word',
                }}
              >
                {askAiCopy.since(formatDay(n.date))}
                {n.note && ` · ${n.note}`}
              </Box>
            </Box>
            <Button
              size="small"
              variant="outlined"
              data-testid="body-note-resolve"
              aria-label={askAiCopy.betterLabel(noteTitle(n))}
              onClick={() => resolve.mutate({ params: { id: n.id }, body: { resolved_on: todayLocal() } })}
              sx={{ flex: 'none', [COARSE_POINTER_QUERY]: { minHeight: tokens.tapTarget } }}
            >
              {askAiCopy.betterNow}
            </Button>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
