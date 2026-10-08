// Owns: the desktop board — `Columns` lays its `Column` children out in a fixed number of tracks per breakpoint (one
// column on a phone unless the board asks for more), and `Column` claims a span clamped to the board's own track count,
// so a panel that asks for more columns than the board has can never add a stray implicit track. On a phone the default
// board is a plain single column in DOM order, which is what keeps each page's phone layout exactly as it was: a page may
// be laid out as a board without touching how it reads on a phone.
//
// A board of many tracks (the Dashboard's bento boards use 12 at `lg` and 6 at `md`) is what lets panels of different
// weights share a row and still fill it: spans that add up to the track count across a row leave no ragged hole, which
// is the difference between a board and a grid of equal cards. 2a's grids map straight onto it: Today's 2 : 1 is
// `<Columns md={3}>` with spans 2 and 1, the Dashboard's "Now" band is 12 tracks with spans 8 / 4 (rowSpan 2) / 4.
import Box from '@mui/material/Box'
import { createContext, useContext, type ReactNode } from 'react'

/** The board's own shape per breakpoint, so a `Column` can clamp its span to what actually exists. */
interface BoardShape {
  xs: number
  sm: number
  md: number
  lg: number
}

const BoardContext = createContext<BoardShape>({ xs: 1, sm: 1, md: 2, lg: 2 })

/** The number of tracks at each breakpoint, in the order MUI's gridColumns object is evaluated. */
const tracks = (n: number) => `repeat(${n}, minmax(0, 1fr))`

export interface ColumnsProps {
  /** Columns on a phone (`xs`, under 600 px). Default 1: a plain single column, as every page was before boards existed. */
  xs?: number
  /** Columns from 600 px (`sm`). Defaults to `xs`. */
  sm?: number
  /** Columns from 900 px (`md`). Default 2. */
  md?: number
  /** Columns from 1200 px (`lg`). Defaults to `md`. */
  lg?: number
  /** Gap between panels, in theme spacing units (4 px each). Default 4 — 2a's 16 px between cards. */
  gap?: number
  /** `start` keeps each column its natural height; `stretch` is for boards of equal-height panels. */
  align?: 'start' | 'stretch'
  children: ReactNode
}

export function Columns({ xs = 1, sm, md = 2, lg, gap = 4, align = 'start', children }: ColumnsProps) {
  const shape: BoardShape = { xs, sm: sm ?? xs, md, lg: lg ?? md }
  return (
    <BoardContext.Provider value={shape}>
      <Box
        sx={{
          display: 'grid',
          gap,
          gridTemplateColumns: {
            xs: tracks(shape.xs),
            sm: shape.sm === shape.xs ? undefined : tracks(shape.sm),
            md: tracks(shape.md),
            lg: shape.lg === shape.md ? undefined : tracks(shape.lg),
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
  /** Columns to span on a phone (and at `sm`, unless `smSpan` says otherwise). Default 1. */
  xsSpan?: number
  /** Columns to span from 600 px (`sm`) up only. Defaults to `xsSpan`. */
  smSpan?: number
  /**
   * Rows to span from `lg` up. Default 1. A tall panel (a rail) that spans two rows sits beside two shorter rows of
   * panels instead of leaving a column of empty space next to it. Ignored below `lg`, where the board is a single row.
   */
  rowSpan?: number
  children: ReactNode
}

export function Column({ span = 1, mdSpan, xsSpan, smSpan, rowSpan, children }: ColumnProps) {
  const { xs, sm, md, lg } = useContext(BoardContext)
  const atMd = Math.min(mdSpan ?? span, md)
  const atXs = Math.min(xsSpan ?? 1, xs)
  const atSm = Math.min(smSpan ?? xsSpan ?? 1, sm)
  return (
    <Box
      sx={{
        gridColumn: {
          xs: `span ${atXs}`,
          sm: atSm === atXs ? undefined : `span ${atSm}`,
          md: `span ${atMd}`,
          lg: `span ${Math.min(span, lg)}`,
        },
        ...(rowSpan && rowSpan > 1 ? { gridRow: { lg: `span ${Math.min(rowSpan, lg)}` } } : {}),
        minWidth: 0,
      }}
    >
      {children}
    </Box>
  )
}

