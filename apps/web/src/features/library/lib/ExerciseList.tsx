// Owns: the exercise list — one 72 px row per exercise (thumbnail, name, primary muscles · equipment, "Hidden" when
// outside the allowed set), rendered 40 at a time as the end of the list scrolls into view, with an optional trailing
// action per row (e.g. an info button) and an "Added" mark for exercises already picked.
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ListItemButton from '@mui/material/ListItemButton'
import type { Exercise } from '@fitness/shared/schemas'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MUSCLE_LABELS } from '../../../muscle-map'
import { tokens } from '../../../theme'
import { ExerciseThumb } from './ExerciseThumb'
import { equipmentLabel } from './labels'

const PAGE = 40

export interface ExerciseListProps {
  exercises: readonly Exercise[]
  onSelect: (exercise: Exercise) => void
  /** Rendered at the right end of a row (outside the row's button). */
  trailing?: (exercise: Exercise) => ReactNode
  /** Exercises shown with an "Added" check. */
  pickedIds?: ReadonlySet<string>
  testId?: string
}

export function musclesLine(e: Pick<Exercise, 'primary_muscles' | 'equipment'>): string {
  const muscles = e.primary_muscles.map((m) => MUSCLE_LABELS[m]).join(', ')
  return [muscles, equipmentLabel(e.equipment)].filter(Boolean).join(' · ')
}

export function ExerciseList({ exercises, onSelect, trailing, pickedIds, testId = 'exercise-list' }: ExerciseListProps) {
  const [shown, setShown] = useState(PAGE)
  const sentinel = useRef<HTMLDivElement | null>(null)

  // A new result set starts from the top page again.
  useEffect(() => setShown(PAGE), [exercises])

  useEffect(() => {
    const el = sentinel.current
    if (!el || shown >= exercises.length || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((x) => x.isIntersecting)) setShown((n) => n + PAGE)
    }, { rootMargin: '400px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [shown, exercises.length])

  return (
    <Box component="ul" data-testid={testId} sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {exercises.slice(0, shown).map((e) => {
        const picked = pickedIds?.has(e.id) ?? false
        return (
          <Box component="li" key={e.id} sx={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${tokens.ink.border}` }}>
            <ListItemButton
              onClick={() => onSelect(e)}
              data-testid="exercise-row"
              sx={{ flex: 1, minWidth: 0, minHeight: 72, gap: 3, px: 0, py: 2, borderRadius: `${tokens.radius.control}px` }}
            >
              <ExerciseThumb exercise={e} size={52} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box
                  sx={{
                    fontSize: 15,
                    fontWeight: tokens.font.weight.label,
                    color: tokens.ink.text,
                    lineHeight: 1.3,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {e.name}
                </Box>
                <Box sx={{ fontSize: 13, color: tokens.ink.secondary, mt: 0.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {!e.allowed && <Box component="span" sx={{ color: tokens.status.warning, fontWeight: tokens.font.weight.label }}>Hidden · </Box>}
                  {musclesLine(e)}
                </Box>
              </Box>
              {picked && <CheckCircleRounded aria-label="Added" sx={{ color: tokens.status.good, flex: 'none' }} />}
            </ListItemButton>
            {trailing && <Box sx={{ flex: 'none' }}>{trailing(e)}</Box>}
          </Box>
        )
      })}
      {shown < exercises.length && (
        <Box component="li" ref={sentinel} sx={{ py: 3, textAlign: 'center' }}>
          <Button onClick={() => setShown((n) => n + PAGE)}>Show more ({exercises.length - shown})</Button>
        </Box>
      )}
    </Box>
  )
}
