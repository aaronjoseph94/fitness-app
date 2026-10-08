// Owns: the exercise list — one 2a row per exercise (44 px thumb tile, name 14/500, primary muscles · equipment in 12 px
// muted, a "Hidden" chip when outside the allowed set, a chevron when the row opens something), `ink.hairline` hairlines
// between rows, rendered 40 at a time as the end of the list scrolls into view, with an optional trailing action per
// row (e.g. an info button) and an "Added" mark for exercises already picked. Rows bring their own 20 px gutter, so the
// list sits flush in a card (or full-bleed in a sheet).
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded'
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ListItemButton from '@mui/material/ListItemButton'
import type { ExerciseSummary } from '@fitness/shared/schemas'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { StatusChip } from '../../../components'
import { MUSCLE_LABELS } from '../../../muscle-map'
import { tokens } from '../../../theme'
import { ExerciseThumb } from './ExerciseThumb'
import { equipmentLabel } from './labels'

const PAGE = 40

export interface ExerciseListProps {
  exercises: readonly ExerciseSummary[]
  onSelect: (exercise: ExerciseSummary) => void
  /** Rendered at the right end of a row (outside the row's button). */
  trailing?: (exercise: ExerciseSummary) => ReactNode
  /** Exercises shown with an "Added" check. */
  pickedIds?: ReadonlySet<string>
  testId?: string
}

export function musclesLine(e: Pick<ExerciseSummary, 'primary_muscles' | 'equipment'>): string {
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
          <Box
            component="li"
            key={e.id}
            sx={{ display: 'flex', alignItems: 'center', '& + &': { borderTop: `1px solid ${tokens.ink.hairline}` } }}
          >
            <ListItemButton
              onClick={() => onSelect(e)}
              data-testid="exercise-row"
              sx={{
                flex: 1,
                minWidth: 0,
                gap: '12px',
                px: `${tokens.pad.card.x}px`,
                py: '12px',
                borderRadius: 0,
                '&:hover': { bgcolor: tokens.ink.panel },
                // Flush in a card that clips its corners: draw the keyboard ring inside the row.
                '&.Mui-focusVisible': { outlineOffset: -2 },
              }}
            >
              <ExerciseThumb exercise={e} size={44} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box
                  sx={{
                    fontSize: tokens.font.size.body,
                    fontWeight: tokens.font.weight.label,
                    color: tokens.ink.text,
                    lineHeight: tokens.font.leading.label,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {e.name}
                </Box>
                <Box sx={{ fontSize: tokens.font.size.caption, lineHeight: tokens.font.leading.caption, color: tokens.ink.muted, mt: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {musclesLine(e)}
                </Box>
              </Box>
              {!e.allowed && <StatusChip tone="warning" size="small" label="Hidden" />}
              {picked && <CheckCircleRounded aria-label="Added" sx={{ fontSize: 20, color: tokens.status.good, flex: 'none' }} />}
              {!trailing && <ChevronRightRounded aria-hidden sx={{ fontSize: 18, color: tokens.ink.faint, flex: 'none' }} />}
            </ListItemButton>
            {trailing && <Box sx={{ flex: 'none', pr: '12px' }}>{trailing(e)}</Box>}
          </Box>
        )
      })}
      {shown < exercises.length && (
        <Box component="li" ref={sentinel} sx={{ py: 3, textAlign: 'center', borderTop: `1px solid ${tokens.ink.hairline}` }}>
          <Button onClick={() => setShown((n) => n + PAGE)}>Show more ({exercises.length - shown})</Button>
        </Box>
      )}
    </Box>
  )
}
