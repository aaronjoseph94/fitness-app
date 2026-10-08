// Owns: the Dashboard's "Now" band (2a) — the window's headline metrics as a 12-track board of panels of different
// weights. The trend weight is the hero (span 8: the 40 px number, the window's move, the goal as a 6 px bar between
// its start and its goal, and a 120 px trend sparkline beside them); the goals rail spans 4 tracks and two rows beside
// it; the five supporting tiles take 4 tracks each, with a 12-bar mini sparkline against the target. Every span is
// chosen so a row adds up to the board's track count — 12 at `lg`, 6 at `md` (two tiles across), two from `sm` and
// one on a phone — so a row is never left half empty.
import TrendingDownRounded from '@mui/icons-material/TrendingDownRounded'
import TrendingUpRounded from '@mui/icons-material/TrendingUpRounded'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import type { ReactNode } from 'react'
import { Sparkline } from '../../../charts'
import { Column, Columns, CountUp, deltaTone, formatNumber, formatShortDate, MiniBars, ProgressBar, Reveal, StatCard, StatusChip } from '../../../components'
import { tokens } from '../../../theme'
import type { GoalFacts } from './GoalRail'
import { barSeries, type Kpi, type KpiGroup } from './kpis'

/** The rows of the band in reading order: the goal, then what went in, then how the body moved, then the daily habits. */
const GROUP_ORDER: readonly KpiGroup[] = ['weight', 'intake', 'body', 'habits']

/** The goals rail takes the third of the widest board beside the hero. */
const RAIL_SPAN = 4
/** How many of the board's rows the rail is tall: the hero's row, plus the one row of tiles that shares it with the rail. */
const RAIL_ROWS = 2

export interface KpiBandProps {
  kpis: readonly Kpi[]
  /** Start, goal and the share done, for the hero's goal bar. */
  goal: GoalFacts
  /** The goals rail, drawn beside the hero and spanning two of its rows. */
  rail: ReactNode
}

export function KpiBand({ kpis, goal, rail }: KpiBandProps) {
  // Stable sort: within a category the order stays the order `dashboardKpis` pushed them in.
  const [hero, ...rest] = [...kpis].sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group))
  if (!hero) return null
  return (
    <Reveal delay={80}>
      <Box data-testid="dashboard-kpis">
        {/* `stretch`: the rail is two rows tall, so the tiles beside it take the row's full height rather than floating
            at the top of it with their own height of empty space underneath. */}
        <Columns xs={1} sm={2} md={6} lg={12} gap={4} align="stretch">
          <Column span={hero.span} mdSpan={hero.mdSpan ?? 6} xsSpan={1} smSpan={2}>
            <HeroTile kpi={hero} goal={goal} />
          </Column>
          {/* As many rows tall as the tiles beside it take: the rail is the tallest panel in the band, and matching its
              height to a whole number of tile rows is what keeps it from dangling past them or leaving a gap under it. */}
          <Column span={RAIL_SPAN} mdSpan={6} xsSpan={1} smSpan={2} rowSpan={RAIL_ROWS}>
            {/* The rail fills its two rows, so its tinted panel never stops short of the tiles beside it. */}
            <Box sx={{ height: '100%', '& > *': { height: '100%' } }}>{rail}</Box>
          </Column>
          {rest.map((kpi, i) => {
            // Two tiles across below `lg`: an odd last tile takes the whole row rather than leaving a hole beside it.
            const alone = i === rest.length - 1 && rest.length % 2 === 1
            return (
              <Column key={kpi.key} span={kpi.span} mdSpan={alone ? 6 : (kpi.mdSpan ?? 3)} xsSpan={1} smSpan={alone ? 2 : 1}>
                <MetricTile kpi={kpi} />
              </Column>
            )
          })}
        </Columns>
      </Box>
    </Reveal>
  )
}

const caption = { fontSize: tokens.font.size.caption, lineHeight: tokens.font.leading.caption, color: tokens.ink.secondary } as const

/**
 * The hero's facts column never gets narrower than its start / share / goal line needs to sit on one line over the
 * bar; past that the 300 px sparkline gives way instead (at 1200 px with the full sidebar it is about 200 px).
 */
const HERO_FACTS_MIN = 330

/**
 * The hero (2a): facts on the left — label, the 40 px trend weight with the window's move as a pill, the goal bar from
 * start to goal, one line of plan facts — and the trend's sparkline on the right, labelled with its first and last day.
 */
function HeroTile({ kpi, goal }: { kpi: Kpi; goal: GoalFacts }) {
  const precision = kpi.precision ?? 1
  const delta = kpi.delta
  const moved = delta && Math.abs(delta.value) >= 10 ** -precision / 2
  const Icon = kpi.icon
  const percent = goal.progress === null ? null : Math.round(goal.progress * 100)
  const facts = [
    kpi.footnote,
    goal.requiredRate !== null ? `${formatNumber(goal.requiredRate, 2)} kg a week` : null,
    goal.nextMilestone?.date ? `next milestone ${goal.nextMilestone.label} on ${formatShortDate(goal.nextMilestone.date)}` : null,
  ].filter(Boolean)
  return (
    <Card data-testid={`kpi-${kpi.key}`} sx={{ height: '100%' }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) minmax(0, 38%)', lg: `minmax(${HERO_FACTS_MIN}px, 1fr) minmax(0, 300px)` },
          gap: '20px',
          px: '22px',
          py: '20px',
          height: '100%',
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: tokens.font.size.label, fontWeight: tokens.font.weight.label, color: tokens.ink.label }}>
            {Icon && <Icon aria-hidden sx={{ fontSize: 16, color: tokens.accent.main }} />}
            {kpi.label}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: '10px', rowGap: 1, mt: '10px' }}>
            <Box
              component="span"
              data-testid="goal-now"
              sx={{
                fontSize: tokens.font.size.bigNumberLarge,
                lineHeight: 1,
                fontWeight: tokens.font.weight.number,
                letterSpacing: tokens.font.em.hero,
                fontVariantNumeric: 'tabular-nums',
                color: tokens.ink.text,
              }}
            >
              {kpi.value === null ? '—' : <CountUp value={kpi.value} from={goal.startKg ?? undefined} precision={precision} delay={500} />}
            </Box>
            <Box component="span" sx={{ fontSize: tokens.font.size.body, color: tokens.ink.secondary }}>
              {kpi.unit}
            </Box>
            {moved && delta && (
              <Box component="span" sx={{ alignSelf: 'center' }}>
                <StatusChip
                  shape="pill"
                  tone={deltaTone(delta, precision)}
                  icon={delta.value < 0 ? TrendingDownRounded : TrendingUpRounded}
                  label={`${formatNumber(Math.abs(delta.value), precision)} ${kpi.unit ?? ''} ${delta.period}`}
                  ariaLabel={`${delta.value < 0 ? 'Down' : 'Up'} ${formatNumber(Math.abs(delta.value), precision)} ${kpi.unit ?? ''} ${delta.period}`}
                />
              </Box>
            )}
          </Box>
          {percent !== null && (
            <>
              <Box sx={{ ...caption, display: 'flex', justifyContent: 'space-between', gap: 2, mt: '18px', flexWrap: 'wrap' }}>
                <Box component="span" data-testid="goal-start" sx={{ whiteSpace: 'nowrap' }}>
                  Start {formatNumber(goal.startKg, 1)} kg{goal.startDate ? ` · ${formatShortDate(goal.startDate)}` : ''}
                </Box>
                <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
                  <Box component="b" sx={{ fontWeight: tokens.font.weight.heading, color: tokens.ink.text }}>
                    {percent}%
                  </Box>{' '}
                  of the way
                </Box>
                <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
                  Goal {formatNumber(goal.goalKg, 1)} kg
                </Box>
              </Box>
              <Box sx={{ mt: '6px' }}>
                <ProgressBar value={goal.progress} color={tokens.accent.main} label="Goal progress" delay={700} />
              </Box>
            </>
          )}
          <Box sx={{ ...caption, mt: '10px' }}>{facts.join(' · ')}</Box>
        </Box>
        {kpi.series && kpi.series.length > 1 && (
          <Box sx={{ alignSelf: 'end', minWidth: 0 }}>
            <Sparkline values={kpi.series} metric={kpi.metric ?? 'weight'} height={120} />
            {kpi.seriesFrom && kpi.seriesTo && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: '6px', fontSize: tokens.font.size.micro, color: tokens.ink.secondary }}>
                <span>{formatShortDate(kpi.seriesFrom)}</span>
                <span>{formatShortDate(kpi.seriesTo)}</span>
              </Box>
            )}
          </Box>
        )}
      </Box>
    </Card>
  )
}

/** A supporting metric (2a stat card): label and glyph, the number with its delta against target, mini bars, a caption. */
function MetricTile({ kpi }: { kpi: Kpi }) {
  const bars = kpi.series ? barSeries(kpi.series) : []
  const present = bars.filter((v) => v !== null).length
  return (
    <StatCard
      label={kpi.label}
      value={kpi.value}
      unit={kpi.unit}
      precision={kpi.precision ?? 0}
      delta={kpi.delta}
      deltaStyle="text"
      metric={kpi.metric}
      icon={kpi.icon}
      footnote={kpi.footnote}
      countUp
      delay={600}
      testId={`kpi-${kpi.key}`}
      sparkline={
        present > 0 ? (
          <MiniBars
            values={bars}
            metric={kpi.metric ?? 'weight'}
            target={kpi.reference}
            label={`${kpi.label}: ${present} ${bars.length === kpi.series?.length ? 'days' : 'weeks'} in this window${kpi.reference !== undefined ? `, against a target of ${formatNumber(kpi.reference, kpi.precision ?? 0)}` : ''}`}
            testId={`chart-kpi-${kpi.key}`}
          />
        ) : undefined
      }
    />
  )
}
