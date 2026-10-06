// Owns: the desktop board — `Columns` lays its `Column` children out in a single column on a phone and in a fixed number
// of columns from `md` (900 px) up, and `Column` claims a span clamped to the board's own column count, so a panel that
// asks for more columns than the board has can never add a stray implicit track. On a phone the board is a plain single
// column in DOM order, which is what keeps each page's phone layout exactly as it was: a page may be laid out as a
// board without touching how it reads on a phone.
import Box from '@mui/material/Box'
import { createContext, useContext, type ReactNode } from 'react'

/** The board's own shape, so a `Column` can clamp its span to what actually exists. */
interface BoardShape {
  md: number
  lg: number
}

const BoardContext = createContext<BoardShape>({ md: 2, lg: 2 })

export interface ColumnsProps {
  /** Columns from 900 px (`md`). Default 2. */
  md?: number
  /** Columns from 1200 px (`lg`). Defaults to `md`. */
  lg?: number
  /** Gap between columns, in theme spacing units. Default 4 (32 px). */
  gap?: number
  /** `start` keeps each column its natural height; `stretch` is for boards of equal-height panels. */
  align?: 'start' | 'stretch'
  children: ReactNode
}

export function Columns({ md = 2, lg, gap = 4, align = 'start', children }: ColumnsProps) {
  const shape: BoardShape = { md, lg: lg ?? md }
  return (
    <BoardContext.Provider value={shape}>
      <Box
        sx={{
          display: 'grid',
          gap,
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            md: `repeat(${shape.md}, minmax(0, 1fr))`,
            lg: shape.lg === shape.md ? undefined : `repeat(${shape.lg}, minmax(0, 1fr))`,
          },
          alignItems: align,
          minWidth: 0,
        }}
      >
        {children}
      </Box>
    </BoardContext.Provider>
  )
}

export interface ColumnProps {
  /** Columns to span from `lg` up (and from `md` too, unless `mdSpan` says otherwise). Clamped to the board's count. Default 1. */
  span?: number
  /**
   * Columns to span from `md` up only. Defaults to `span`. Use it for a board that divides its width evenly at `md`
   * and then weights one column at `lg` — a wide primary panel beside a rail, without leaving a half-empty row on a
   * 900 px window where both columns are still the same size.
   */
  mdSpan?: number
  children: ReactNode
}

export function Column({ span = 1, mdSpan, children }: ColumnProps) {
  const { md, lg } = useContext(BoardContext)
  const atMd = Math.min(mdSpan ?? span, md)
  return (
    <Box
      sx={{
        gridColumn: { xs: 'span 1', md: `span ${atMd}`, lg: `span ${Math.min(span, lg)}` },
        minWidth: 0,
      }}
    >
      {children}
    </Box>
  )
}
