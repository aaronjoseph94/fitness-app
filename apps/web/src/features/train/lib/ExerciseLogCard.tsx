// Owns: one exercise in the session logger — thumbnail and name (tap for the detail sheet), the prescription and the
// engine's progression hint ("+2.5 kg", deload), the set table with last session greyed, add / remove set, the
// exercise note, and the menu (note, about, remove from this session).
import AddRounded from '@mui/icons-material/AddRounded'
import MoreVertRounded from '@mui/icons-material/MoreVertRounded'
import RemoveRounded from '@mui/icons-material/RemoveRounded'
import TrendingUpRounded from '@mui/icons-material/TrendingUpRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Card from '@mui/material/Card'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import type { Exercise } from '@fitness/shared/schemas'
import { memo, useState } from 'react'
import { formatShortDate } from '../../../components'
import { tokens, withAlpha } from '../../../theme'
import { ExerciseThumb } from '../../library'
import type { LoggerActions } from './actions'
import { previousSet, progressionHint, setHint, type LoggerExercise } from './logger-model'
import { SET_GRID, SetRow } from './SetRow'

export interface ExerciseLogCardProps {
  exercise: LoggerExercise
  /** The library entry (name, image); undefined while the library loads. */
  info: Exercise | undefined
  actions: LoggerActions
  onAbout: (exerciseId: string) => void
}

function ExerciseLogCardInner({ exercise, info, actions, onAbout }: ExerciseLogCardProps) {
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const [noteOpen, setNoteOpen] = useState(exercise.note !== '')
  const id = exercise.exercise_id
  const name = info?.name ?? 'Exercise'
  const hint = progressionHint(exercise)
  const doneCount = exercise.sets.filter((s) => s.done).length
  const rest =
    exercise.rest_sec >= 60
      ? `${Math.round((exercise.rest_sec / 60) * 10) / 10} min`
      : `${exercise.rest_sec} s`

  return (
    <Card data-testid="exercise-log-card" sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', gap: 3, alignItems: 'center' }}>
        <ButtonBase
          onClick={() => onAbout(id)}
          aria-label={`About ${name}`}
          sx={{ borderRadius: `${tokens.radius.control}px` }}
        >
          <ExerciseThumb exercise={info} size={48} />
        </ButtonBase>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <ButtonBase
            onClick={() => onAbout(id)}
            sx={{
              display: 'block',
              textAlign: 'left',
              fontSize: 16,
              fontWeight: tokens.font.weight.heading,
              lineHeight: 1.3,
              color: tokens.ink.text,
            }}
          >
            {name}
          </ButtonBase>
          <Box
            sx={{
              mt: 0.5,
              fontSize: 13,
              color: tokens.ink.secondary,
              display: 'flex',
              flexWrap: 'wrap',
              columnGap: 2,
              alignItems: 'center',
            }}
          >
            <span>
              {doneCount}/{exercise.sets.length} sets ·{' '}
              {exercise.rep_min === exercise.rep_max
                ? exercise.rep_min
                : `${exercise.rep_min}–${exercise.rep_max}`}{' '}
              reps · {rest} rest
            </span>
            {exercise.last && <span>Last {formatShortDate(exercise.last.date)}</span>}
          </Box>
        </Box>
        <IconButton aria-label={`More for ${name}`} onClick={(e) => setMenu(e.currentTarget)} edge="end">
          <MoreVertRounded />
        </IconButton>
      </Box>

      {hint && exercise.suggestion && (
        <Box
          data-testid="progression-hint"
          sx={{
            mt: 2,
            display: 'flex',
            gap: 1.5,
            alignItems: 'center',
            fontSize: 13,
            color: tokens.ink.secondary,
          }}
        >
          <Box
            component="span"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              px: 1.5,
              height: 24,
              borderRadius: tokens.radius.chip,
              fontWeight: tokens.font.weight.heading,
              color: exercise.suggestion.kind === 'increase' ? tokens.status.good : tokens.ink.text,
              bgcolor:
                exercise.suggestion.kind === 'increase'
                  ? withAlpha(tokens.status.good, 0.1)
                  : tokens.chart.grid,
              flex: 'none',
            }}
          >
            {exercise.suggestion.kind === 'increase' && (
              <TrendingUpRounded sx={{ fontSize: 16 }} aria-hidden />
            )}
            {hint}
          </Box>
          <Box
            component="span"
            sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={exercise.suggestion.reason}
          >
            {exercise.suggestion.reason}
          </Box>
        </Box>
      )}

      <Box
        aria-hidden
        sx={{
          mt: 2.5,
          display: 'grid',
          gridTemplateColumns: SET_GRID,
          gap: 1.5,
          fontSize: 12,
          fontWeight: tokens.font.weight.label,
          color: tokens.ink.secondary,
          textAlign: 'center',
          '& > :nth-of-type(2)': { textAlign: 'left', pl: 1 },
        }}
      >
        <span>Set</span>
        <span>Previous</span>
        <span>kg</span>
        <span>Reps</span>
        <span>RPE</span>
        <span>Done</span>
      </Box>
      <Box sx={{ mt: 1 }}>
        {exercise.sets.map((set, position) => (
          <SetRow
            key={set.id}
            position={position}
            set={set}
            previous={previousSet(exercise, position)}
            hint={setHint(exercise, position)}
            onValues={(values) => actions.setValues(set.id, values)}
            onCopyPrevious={() => actions.copyPrevious(set.id)}
            onToggle={() => actions.toggleDone(set.id)}
          />
        ))}
      </Box>

      <Box sx={{ mt: 2, display: 'flex', gap: 1, alignItems: 'center' }}>
        <Button startIcon={<AddRounded />} onClick={() => actions.addSet(id)} data-testid="add-set">
          Add set
        </Button>
        <Button
          startIcon={<RemoveRounded />}
          color="inherit"
          onClick={() => actions.removeLastSet(id)}
          disabled={exercise.sets.length === 0}
          sx={{ color: tokens.ink.secondary }}
        >
          Remove set
        </Button>
        <Box sx={{ flex: 1 }} />
        {!noteOpen && (
          <Button color="inherit" onClick={() => setNoteOpen(true)} sx={{ color: tokens.ink.secondary }}>
            Note
          </Button>
        )}
      </Box>
      {noteOpen && (
        <TextField
          size="small"
          multiline
          maxRows={4}
          placeholder="Note for this exercise (seat 4, left shoulder…)"
          value={exercise.note}
          onChange={(e) => actions.setNote(id, e.target.value.slice(0, 200))}
          slotProps={{ htmlInput: { 'aria-label': `Note for ${name}`, maxLength: 200 } }}
          sx={{ mt: 1, '& textarea': { fontSize: 16 } }}
        />
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
            actions.removeExercise(id)
            setMenu(null)
          }}
          sx={{ color: tokens.status.flag }}
        >
          Remove from session
        </MenuItem>
      </Menu>
    </Card>
  )
}

export const ExerciseLogCard = memo(ExerciseLogCardInner)
