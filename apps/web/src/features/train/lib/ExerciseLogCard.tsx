// Owns: one exercise in the session logger (2a) — a header (thumbnail and "1 · name", tap for the detail sheet; a Done /
// Current / recovery chip; muscles · equipment · sets × reps · rest · last time), then, while expanded, the set table
// under its column strip with last session greyed, a footer (add set, copy last session's set into the next open one,
// remove the last set, the engine's progression hint) and the exercise note; the menu (note, about, collapse, remove
// from this session). Collapsed it shows the header only, with "0 of 3 sets" and an expand button.
import AddRounded from '@mui/icons-material/AddRounded'
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded'
import MoreHorizRounded from '@mui/icons-material/MoreHorizRounded'
import RemoveRounded from '@mui/icons-material/RemoveRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import type { ExerciseSummary } from '@fitness/shared/schemas'
import { memo, useEffect, useState } from 'react'
import { cardSurface, formatNumber, highlightSurface, outlinedIconButton, StatusChip } from '../../../components'
import { MUSCLE_LABELS } from '../../../muscle-map'
import { COARSE_POINTER_QUERY, tokens } from '../../../theme'
import { ExerciseThumb } from '../../library'
import type { LoggerActions } from './actions'
import { previousSet, progressionHint, setHint, type LoggerExercise } from './logger-model'
import { SET_GRID_SX, SET_GUTTER_SX, SetRow } from './SetRow'

export interface ExerciseLogCardProps {
  exercise: LoggerExercise
  /** Position in the session (0-based), shown as "1 · …". */
  position: number
  /** The library entry (name, image); undefined while the library loads. */
  info: ExerciseSummary | undefined
  actions: LoggerActions
  onAbout: (exerciseId: string) => void
  /** The first exercise with a set still to tick: blue border and ring, and it opens when it becomes current. */
  current: boolean
  /** Expanded on mount (the logger folds exercises still to come once a session is under way). */
  defaultOpen: boolean
  /** One of its main muscles was also a main target the day before or after (the session's recovery check). */
  recoveryConflict: boolean
}

/** "Lats, biceps": the main muscles and the first helper (three labels at most, so the line stays short), sentence case. */
function musclesText(info: ExerciseSummary | undefined): string | null {
  if (!info) return null
  const labels = [...info.primary_muscles, ...info.secondary_muscles.slice(0, 1)].slice(0, 3).map((m, i) =>
    i === 0 ? MUSCLE_LABELS[m] : MUSCLE_LABELS[m].toLowerCase(),
  )
  return labels.length ? labels.join(', ') : null
}

const range = (min: number, max: number) => (min === max ? `${min}` : `${min}–${max}`)

/** "last time 3 × 10–11 at 45 kg": last session's set count, its rep range and top load. */
function lastText(exercise: LoggerExercise): string | null {
  const sets = exercise.last?.sets ?? []
  if (sets.length === 0) return null
  const reps = sets.flatMap((s) => (s.reps === null ? [] : [s.reps]))
  const loads = sets.flatMap((s) => (s.load_kg === null ? [] : [s.load_kg]))
  const top = loads.length ? Math.max(...loads) : null
  return `last time ${sets.length}${reps.length ? ` × ${range(Math.min(...reps), Math.max(...reps))}` : ''}${
    top === null ? '' : ` at ${formatNumber(top, top % 1 ? 1 : 0)} kg`
  }`
}

/** 2a's 32 px outlined icon button (44 on a touch screen, from the theme). */
const ICON_BUTTON_SX = { ...outlinedIconButton, width: 32, height: 32, color: tokens.ink.label } as const

function ExerciseLogCardInner({
  exercise,
  position,
  info,
  actions,
  onAbout,
  current,
  defaultOpen,
  recoveryConflict,
}: ExerciseLogCardProps) {
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const [noteOpen, setNoteOpen] = useState(exercise.note !== '')
  const [open, setOpen] = useState(defaultOpen)
  const id = exercise.exercise_id
  const name = info?.name ?? 'Exercise'
  const hint = progressionHint(exercise)
  const doneCount = exercise.sets.filter((s) => s.done).length
  const done = exercise.sets.length > 0 && doneCount === exercise.sets.length
  // "Copy previous": last session's set into the first open set that has one.
  const copyTarget = exercise.sets.findIndex((s, i) => !s.done && previousSet(exercise, i) !== null)

  // The exercise Aaron moves on to opens by itself.
  useEffect(() => {
    if (current) setOpen(true)
  }, [current])

  const meta = [
    musclesText(info),
    info?.equipment,
    `${exercise.sets.length} × ${range(exercise.rep_min, exercise.rep_max)}`,
    `rest ${exercise.rest_sec} s`,
    lastText(exercise),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Box
      component="section"
      data-testid="exercise-log-card"
      aria-labelledby={`exercise-${id}`}
      sx={{ ...(current ? highlightSurface : cardSurface), overflow: 'hidden', minWidth: 0 }}
    >
      {/* Thumb · name and chips · actions, the meta line under the name; on a phone the meta runs full width. */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '44px minmax(0, 1fr) auto',
          gridTemplateAreas: { xs: '"thumb title actions" "meta meta meta"', sm: '"thumb title actions" "thumb meta actions"' },
          alignItems: 'center',
          columnGap: '12px',
          rowGap: { xs: 1, sm: 0 },
          ...SET_GUTTER_SX,
          py: '14px',
        }}
      >
        {/* Pointer-only: the title and "About" are the keyboard and screen-reader routes to the same sheet. */}
        <ButtonBase
          onClick={() => onAbout(id)}
          tabIndex={-1}
          aria-hidden
          sx={{ gridArea: 'thumb', borderRadius: `${tokens.radius.control}px` }}
        >
          <ExerciseThumb exercise={info} size={44} />
        </ButtonBase>
        <Box sx={{ gridArea: 'title', alignSelf: { sm: 'end' }, display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 2, rowGap: 0.5, minWidth: 0 }}>
          <Box
            component="h2"
            id={`exercise-${id}`}
            sx={{ m: 0, fontSize: tokens.font.size.itemTitle, fontWeight: tokens.font.weight.heading, lineHeight: 1.35 }}
          >
            <ButtonBase
              onClick={() => onAbout(id)}
              sx={{
                font: 'inherit',
                textAlign: 'left',
                color: tokens.ink.text,
                borderRadius: `${tokens.radius.inner}px`,
                overflowWrap: 'anywhere',
                [COARSE_POINTER_QUERY]: { minHeight: tokens.tapTarget },
              }}
            >
              {position + 1} · {name}
            </ButtonBase>
          </Box>
          {done ? (
            <StatusChip size="small" tone="success" label="Done" />
          ) : current ? (
            <StatusChip size="small" tone="info" label="Current" />
          ) : null}
          {recoveryConflict && !done && <StatusChip size="small" tone="warning" label="Recovery conflict" />}
        </Box>
        <Box sx={{ gridArea: 'meta', alignSelf: { sm: 'start' }, fontSize: tokens.font.size.small, lineHeight: 1.5, color: tokens.ink.muted, minWidth: 0 }}>
          {meta}
        </Box>
        <Box sx={{ gridArea: 'actions', display: 'flex', alignItems: 'center', gap: 2 }}>
          {open ? (
            <>
              <Button
                variant="outlined"
                size="small"
                onClick={() => onAbout(id)}
                sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
                aria-label={`About ${name}`}
              >
                About
              </Button>
              <IconButton aria-label={`More for ${name}`} onClick={(e) => setMenu(e.currentTarget)} sx={ICON_BUTTON_SX}>
                <MoreHorizRounded sx={{ fontSize: 18 }} />
              </IconButton>
            </>
          ) : (
            <>
              <Box sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.muted, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                {doneCount} of {exercise.sets.length} sets
              </Box>
              <IconButton
                aria-label={`Show sets for ${name}`}
                aria-expanded={false}
                onClick={() => setOpen(true)}
                sx={ICON_BUTTON_SX}
              >
                <ExpandMoreRounded sx={{ fontSize: 18 }} />
              </IconButton>
            </>
          )}
        </Box>
      </Box>

      {open && (
        <>
          <Box
            aria-hidden
            sx={{
              ...SET_GRID_SX,
              ...SET_GUTTER_SX,
              py: '6px',
              borderTop: `1px solid ${tokens.ink.border}`,
              borderBottom: `1px solid ${tokens.ink.border}`,
              bgcolor: tokens.ink.panel,
              fontSize: tokens.font.size.micro,
              fontWeight: tokens.font.weight.label,
              lineHeight: 1.45,
              color: tokens.ink.muted,
              textTransform: 'uppercase',
              letterSpacing: tokens.font.em.micro,
              whiteSpace: 'nowrap',
              '& > :last-of-type': { textAlign: 'center' },
            }}
          >
            <span>Set</span>
            <span data-col="previous">Previous</span>
            <span>kg</span>
            <span>Reps</span>
            <Box component="span" sx={{ textAlign: { xs: 'center', sm: 'left' } }}>RPE</Box>
            <span>Done</span>
          </Box>
          <div>
            {exercise.sets.map((set, i) => (
              <SetRow
                key={set.id}
                position={i}
                set={set}
                previous={previousSet(exercise, i)}
                hint={setHint(exercise, i)}
                onValues={(values) => actions.setValues(set.id, values)}
                onCopyPrevious={() => actions.copyPrevious(set.id)}
                onToggle={() => actions.toggleDone(set.id)}
              />
            ))}
          </div>

          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 2,
              ...SET_GUTTER_SX,
              pt: '10px',
              pb: '14px',
              borderTop: `1px solid ${tokens.ink.hairline}`,
            }}
          >
            <Button variant="outlined" size="tiny" startIcon={<AddRounded />} onClick={() => actions.addSet(id)} data-testid="add-set">
              Add set
            </Button>
            {copyTarget >= 0 && (
              <Button
                variant="outlined"
                size="tiny"
                onClick={() => {
                  const set = exercise.sets[copyTarget]
                  if (set) actions.copyPrevious(set.id)
                }}
                aria-label={`Copy previous: last session's set ${copyTarget + 1}`}
              >
                Copy previous
              </Button>
            )}
            <Button
              variant="outlined"
              size="tiny"
              startIcon={<RemoveRounded />}
              onClick={() => actions.removeLastSet(id)}
              disabled={exercise.sets.length === 0}
            >
              Remove set
            </Button>
            {exercise.suggestion && (
              // The engine's reason always shows; the test id marks a load hint ("+2.5 kg", "Deload"), as before 2a.
              <Box
                data-testid={hint ? 'progression-hint' : undefined}
                sx={{
                  ml: { sm: 'auto' },
                  flexBasis: { xs: '100%', sm: 'auto' },
                  minWidth: 0,
                  fontSize: tokens.font.size.caption,
                  lineHeight: 1.4,
                  color: tokens.ink.muted,
                  textAlign: { sm: 'right' },
                }}
              >
                {hint && (
                  <Box
                    component="span"
                    sx={{
                      fontWeight: tokens.font.weight.heading,
                      color: exercise.suggestion.kind === 'increase' ? tokens.tone.success.text : tokens.ink.text,
                    }}
                  >
                    {hint} ·{' '}
                  </Box>
                )}
                {exercise.suggestion.reason}
              </Box>
            )}
            {noteOpen && (
              <TextField
                size="small"
                multiline
                fullWidth
                maxRows={4}
                placeholder="Note for this exercise (seat 4, left shoulder…)"
                value={exercise.note}
                onChange={(e) => actions.setNote(id, e.target.value.slice(0, 200))}
                slotProps={{ htmlInput: { 'aria-label': `Note for ${name}`, maxLength: 200 } }}
                sx={{ flexBasis: '100%', mt: 1 }}
              />
            )}
          </Box>
        </>
      )}

      <Menu anchorEl={menu} open={menu !== null} onClose={() => setMenu(null)}>
        <MenuItem
          onClick={() => {
            setNoteOpen(true)
            setMenu(null)
          }}
        >
          Add a note
        </MenuItem>
        <MenuItem
          onClick={() => {
            onAbout(id)
            setMenu(null)
          }}
        >
          About this exercise
        </MenuItem>
        <MenuItem
          onClick={() => {
            setOpen(false)
            setMenu(null)
          }}
        >
          Hide sets
        </MenuItem>
        <MenuItem
          onClick={() => {
            actions.removeExercise(id)
            setMenu(null)
          }}
          sx={{ color: tokens.status.flag }}
        >
          Remove from session
        </MenuItem>
      </Menu>
    </Box>
  )
}

export const ExerciseLogCard = memo(ExerciseLogCardInner)
