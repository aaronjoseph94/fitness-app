// Owns: rendering the muscle map — grey body, each of the 17 muscles filled by its level (0 = body grey, 1–4 =
// the indigo steps), white separations, an accessible <title> per muscle and one delegated click/keyboard handler.
// Levels come in already bucketed (quantile levelling is the engine's job).
import Box from '@mui/material/Box'
import type { Muscle } from '@fitness/shared/schemas'
import type { KeyboardEvent, MouseEvent } from 'react'
import { tokens } from '../../theme'
import { GEOMETRY, type MuscleView } from './geometry'
import { MUSCLE_LABELS, levelColor, levelLabel, type MuscleLevel } from './levels'

export interface MuscleMapProps {
  levels: Partial<Record<Muscle, MuscleLevel>>
  /** Default `both` (front left, back right). */
  view?: 'both' | MuscleView
  /** Rendered width in px (a 96 px thumbnail works). Omit to fill the container (max 420 px). */
  size?: number
  /** Makes muscles tappable and focusable; called with the muscle key. */
  onSelect?: (muscle: Muscle) => void
  /** Accessible name. Default "Muscle map". */
  title?: string
  /** Outlines this muscle (e.g. the one being edited). */
  selected?: Muscle | null
}

/** Space between the front and back figures, in source units. */
const VIEW_GAP = 48

function layout(view: 'both' | MuscleView) {
  const views: MuscleView[] = view === 'both' ? ['front', 'back'] : [view]
  let x = 0
  const placed = views.map((v) => {
    const [minX, minY, w, h] = GEOMETRY[v].viewBox
    const at = { view: v, dx: x - minX, dy: -minY, w, h }
    x += w + VIEW_GAP
    return at
  })
  const width = x - VIEW_GAP
  const height = Math.max(...placed.map((p) => p.h))
  return { placed, width, height }
}

function muscleFrom(target: EventTarget | null): Muscle | null {
  const el = (target as Element | null)?.closest?.('[data-muscle]')
  return (el?.getAttribute('data-muscle') as Muscle | null) ?? null
}

export function MuscleMap({
  levels,
  view = 'both',
  size,
  onSelect,
  title = 'Muscle map',
  selected = null,
}: MuscleMapProps) {
  const { placed, width, height } = layout(view)
  // Separation strokes in screen px, thinner on thumbnails.
  const stroke = Math.max(0.6, Math.min(1.6, (size ?? 360) / 220))
  const interactive = !!onSelect

  const onClick = (e: MouseEvent<SVGSVGElement>) => {
    const m = muscleFrom(e.target)
    if (m && onSelect) onSelect(m)
  }
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    const m = muscleFrom(e.target)
    if (m && onSelect) {
      e.preventDefault()
      onSelect(m)
    }
  }

  return (
    <Box
      data-testid="muscle-map"
      sx={{
        width: size ?? '100%',
        maxWidth: size ?? 420,
        lineHeight: 0,
        '& [data-muscle]': interactive ? { cursor: 'pointer', outline: 'none' } : undefined,
        '& [data-muscle]:focus-visible path': { stroke: tokens.ink.text, strokeWidth: stroke * 2 },
        '@media (hover: hover)': interactive
          ? { '& [data-muscle]:hover path': { filter: 'brightness(0.94)' } }
          : undefined,
      }}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        role={interactive ? 'group' : 'img'}
        aria-label={title}
        onClick={interactive ? onClick : undefined}
        onKeyDown={interactive ? onKeyDown : undefined}
        style={{ display: 'block', height: 'auto', overflow: 'visible' }}
      >
        <title>{title}</title>
        {placed.map((p) => {
          const g = GEOMETRY[p.view]
          // One <g> per muscle per view, so its <title> and level apply to every path of that muscle.
          const muscles = new Map<Muscle, string[]>()
          for (const m of g.muscles) muscles.set(m.muscle, [...(muscles.get(m.muscle) ?? []), m.d])
          return (
            <g key={p.view} transform={`translate(${p.dx} ${p.dy})`}>
              <g fill={tokens.muscleMap.body}>
                {g.base.map((d, i) => (
                  <path key={i} d={d} />
                ))}
              </g>
              {[...muscles].map(([muscle, ds]) => {
                const level = levels[muscle] ?? 0
                const isSel = selected === muscle
                return (
                  <g
                    key={muscle}
                    data-muscle={muscle}
                    data-level={level}
                    tabIndex={interactive ? 0 : undefined}
                    role={interactive ? 'button' : undefined}
                    aria-label={interactive ? `${MUSCLE_LABELS[muscle]}: ${levelLabel(level)}` : undefined}
                  >
                    <title>{`${MUSCLE_LABELS[muscle]}: ${levelLabel(level)}`}</title>
                    {ds.map((d, i) => (
                      <path
                        key={i}
                        d={d}
                        fill={levelColor(level)}
                        stroke={isSel ? tokens.ink.text : tokens.muscleMap.stroke}
                        strokeWidth={isSel ? stroke * 2 : stroke}
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                  </g>
                )
              })}
              <g
                fill="none"
                stroke={tokens.muscleMap.stroke}
                strokeWidth={stroke * 0.85}
                strokeLinecap="round"
                strokeLinejoin="round"
                pointerEvents="none"
              >
                {g.outline.map((d, i) => (
                  <path key={i} d={d} vectorEffect="non-scaling-stroke" />
                ))}
              </g>
            </g>
          )
        })}
      </svg>
    </Box>
  )
}
