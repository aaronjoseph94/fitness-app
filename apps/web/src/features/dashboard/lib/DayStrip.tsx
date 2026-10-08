// Owns: 2a's day-cell strip (the Dashboard's Fasting and Logging cards) — one 22 px cell per day, 4 px apart, each
// filled or outlined by what the day was, up to 16 to a row (a longer window wraps into rows of equal length, so no row
// is left with a lone cell — two weeks and the planned fast just past them still fit on one), with the first and
// last day labelled under it and, on one row, a label under a marked day ("today"). The strip is one image with a
// caller-written summary, and each cell carries its own description as a tooltip.
import Box from '@mui/material/Box'
import { tokens } from '../../../theme'

export interface DayCell {
  date: string
  /** Fill colour (a token). */
  fill?: string
  /** A dashed outline in this colour (a token), for a day still ahead. */
  dashed?: string
  /** What the day was, e.g. "Oct 4: all three logged". */
  description: string
}

export interface DayStripProps {
  cells: readonly DayCell[]
  /** Accessible summary of the whole strip. */
  label: string
  startLabel?: string
  endLabel?: string
  /** A cell to label under the strip (only while the strip is one row). */
  mark?: { index: number; label: string }
  testId?: string
}

/** The most cells on one row. */
const PER_ROW = 16
const CELL_HEIGHT = 22
/** 2a's cell radius: 4 px, two of the kit's bar radii. */
const CELL_RADIUS = tokens.radius.bar * 2
/** 2a's dashed outline of a planned day (the theme has no border-width scale). */
const DASH_WIDTH = 1.5

export function DayStrip({ cells, label, startLabel, endLabel, mark, testId }: DayStripProps) {
  const rows = Math.max(1, Math.ceil(cells.length / PER_ROW))
  const columns = Math.max(1, Math.ceil(cells.length / rows))
  const grid = { display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, columnGap: '4px' } as const
  const oneRow = rows === 1
  return (
    <Box data-testid={testId} role="img" aria-label={label} sx={{ minWidth: 0 }}>
      <Box sx={{ ...grid, rowGap: '4px' }}>
        {cells.map((c) => (
          <Box
            key={c.date}
            title={c.description}
            sx={{
              height: CELL_HEIGHT,
              borderRadius: `${CELL_RADIUS}px`,
              bgcolor: c.fill ?? 'transparent',
              border: c.dashed ? `${DASH_WIDTH}px dashed ${c.dashed}` : 'none',
            }}
          />
        ))}
      </Box>
      {(startLabel || endLabel) && (
        <Box
          aria-hidden
          sx={{ ...(oneRow && mark ? grid : { display: 'flex', justifyContent: 'space-between' }), mt: '6px', fontSize: tokens.font.size.micro, color: tokens.ink.secondary, whiteSpace: 'nowrap' }}
        >
          {oneRow && mark ? (
            <>
              <Box sx={{ gridColumn: 1, gridRow: 1, justifySelf: 'start' }}>{startLabel}</Box>
              {/* Kept clear of the end labels: at least one cell between them. */}
              {mark.index > 1 && mark.index < cells.length - 2 && <Box sx={{ gridColumn: mark.index + 1, gridRow: 1, justifySelf: 'center' }}>{mark.label}</Box>}
              <Box sx={{ gridColumn: cells.length, gridRow: 1, justifySelf: 'end' }}>{endLabel}</Box>
            </>
          ) : (
            <>
              <span>{startLabel}</span>
              <span>{endLabel}</span>
            </>
          )}
        </Box>
      )}
    </Box>
  )
}
