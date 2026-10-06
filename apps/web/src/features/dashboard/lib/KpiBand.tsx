// Owns: the Dashboard's opening bento — the window's headline metrics as a board of panels of different weights rather
// than a wall of equal cards. The trend weight is the hero (the page's one gradient surface, with the goal drawn as its
// bar), the goals rail spans two of the board's rows beside it, and the supporting metrics fill the remaining rows one
// category at a time. Every span is chosen so a row adds up to the board's track count — 12 at `lg`, 6 at `md`, two
// across on a phone — so a row is never left half empty and no panel is more prominent than its own importance.
import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import { Sparkline } from '../../../charts'
import { Column, Columns, formatNumber, MetricCard, Reveal, StatCard } from '../../../components'
import { type Kpi, type KpiGroup } from './kpis'

/** The rows of the band in reading order: the goal, then what went in, then how the body moved, then the daily habits. */
const GROUP_ORDER: readonly KpiGroup[] = ['weight', 'intake', 'body', 'habits']

/** The goals rail takes the third of the widest board beside the hero. */
const RAIL_SPAN = 4
/** How many of the board's rows the rail is tall, which is how many rows of tiles sit beside it. */
const RAIL_ROWS = 3

export interface KpiBandProps {
  kpis: readonly Kpi[]
  /** The goals rail, drawn beside the hero and spanning two of its rows. */
  rail: ReactNode
}

export function KpiBand({ kpis, rail }: KpiBandProps) {
  // Stable sort: within a category the order stays the order `dashboardKpis` pushed them in.
  const [hero, ...rest] = [...kpis].sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group))
  if (!hero) return null
  return (
    <Reveal delay={80}>
      <Box data-testid="dashboard-kpis">
        {/* `stretch`: the rail is two rows tall, so the tiles beside it take the row's full height rather than floating
            at the top of it with their own height of empty space underneath. */}
        <Columns xs={2} sm={2} md={6} lg={12} gap={4} align="stretch">
          <Column span={hero.span} mdSpan={hero.mdSpan ?? 6} xsSpan={2}>
            <HeroTile kpi={hero} />
          </Column>
          {/* As many rows tall as the tiles beside it take: the rail is the tallest panel in the band, and matching its
              height to a whole number of tile rows is what keeps it from dangling past them or leaving a gap under it. */}
          <Column span={RAIL_SPAN} mdSpan={6} xsSpan={2} rowSpan={RAIL_ROWS}>
            {rail}
          </Column>
          {rest.map((kpi) => (
            <Column key={kpi.key} span={kpi.span} mdSpan={kpi.mdSpan ?? 3} xsSpan={1}>
              <MetricTile kpi={kpi} />
            </Column>
          ))}
        </Columns>
      </Box>
    </Reveal>
  )
}

/**
 * The hero: a gradient metric card, so the one number that matters most is also the one surface that carries the app's
 * colour. Its bar is the share of the goal already behind him, and its caption states the window's move and the goal in
 * words — a gradient card has no room for a delta arrow, and white text keeps both lines readable at 4.5:1 or better.
 */
function HeroTile({ kpi }: { kpi: Kpi }) {
  const delta = kpi.delta
  const moved = delta && Math.abs(delta.value) >= 10 ** -(kpi.precision ?? 0) / 2
  const move = moved
    ? `${delta.value < 0 ? 'Down' : 'Up'} ${formatNumber(Math.abs(delta.value), kpi.precision ?? 0)} ${delta.unit ?? kpi.unit ?? ''} ${delta.period}`.replace(/\s+/g, ' ').trim()
    : null
  const caption = [move, kpi.footnote].filter(Boolean).join(' · ')
  return (
    <MetricCard
      label={kpi.label}
      metric={kpi.metric ?? 'weight'}
      icon={kpi.icon}
      value={kpi.value}
      unit={kpi.unit}
      precision={kpi.precision ?? 0}
      progress={kpi.progress ?? null}
      caption={caption}
      testId={`kpi-${kpi.key}`}
    />
  )
}

/** A supporting metric: white card, metric-tinted icon tile, its sparkline and one line of footnote. */
function MetricTile({ kpi }: { kpi: Kpi }) {
  return (
    <StatCard
      label={kpi.label}
      value={kpi.value}
      unit={kpi.unit}
      precision={kpi.precision ?? 0}
      delta={kpi.delta}
      metric={kpi.metric}
      icon={kpi.icon}
      footnote={kpi.footnote}
      testId={`kpi-${kpi.key}`}
      sparkline={kpi.series && kpi.series.length > 1 ? <Sparkline values={kpi.series} metric={kpi.metric ?? 'weight'} reference={kpi.reference} /> : undefined}
    />
  )
}
