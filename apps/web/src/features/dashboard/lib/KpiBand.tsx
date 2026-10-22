// Owns: the Dashboard's opening band (1d) — the trend card beside the deep-sky "Against the plan" (a 1.6 : 1 row that
// wraps), then the five KPI tiles. The trend card: the uppercase eyebrow, the 72 px trend weight counting down from
// base camp, a teal pill for the window's move and a soft one for the weekly rate against the plan's, the gold base
// camp → summit bar with its three labels, and the trend's sparkline (facts 1fr : sparkline 300 px, wrapping). Each
// tile: a 13/600 muted label, the window's average in Outfit 26 with its unit, one coloured line against the target,
// and 12 mini bars for the last 12 days (a day on target — at or under intake's ceiling, at or over every other
// metric's minimum (kpis `onTarget`) — in the metric's strong end, the rest in its light end, today in its tint). Tiles are 150 px columns that wrap: five across on a desktop, two on a phone.
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded'
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded'
import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import { Sparkline } from '../../../charts'
import {
  cardSurface,
  CountUp,
  eyebrow,
  formatNumber,
  formatShortDate,
  formatSigned,
  Reveal,
  staggerDelay,
  tabularNums,
  useEntrance,
  wrapCol,
  WrapRow,
} from '../../../components'
import { copy } from '../../../copy'
import { enterEasing, metricRamp, tokens, type MetricKey } from '../../../theme'
import { SLEEP_TARGET_H } from '../../progress/series'
import { shortDate, type GoalFacts } from './GoalRail'
import { onTarget, type Kpi } from './kpis'

const { summit, font } = tokens

export interface KpiBandProps {
  kpis: readonly Kpi[]
  /** Start, goal and the share done, for the trend card's bar. */
  goal: GoalFacts
  /** The deep-sky "Against the plan", beside the trend card. */
  rail: ReactNode
  /** The window's last day (today): the "updated" note and the year in the summit's date. */
  today: string
  /** The last entry of every tile's series is today (still in progress): its bar is drawn in the tint. */
  todayLast: boolean
}

export function KpiBand({ kpis, goal, rail, today, todayLast }: KpiBandProps) {
  const hero = kpis.find((k) => k.key === 'weight')
  const tiles = kpis.filter((k) => k.key !== 'weight')
  return (
    <Box
      data-testid="dashboard-kpis"
      sx={{ display: 'grid', gap: `${tokens.rhythm.section}px`, minWidth: 0 }}
    >
      <WrapRow>
        {hero && (
          <Box sx={{ ...wrapCol(1.6), display: 'flex' }}>
            <Reveal delay={staggerDelay(0, tokens.motion.stagger.card, 80)} sx={{ width: '100%' }}>
              <TrendCard kpi={hero} goal={goal} today={today} />
            </Reveal>
          </Box>
        )}
        <Box sx={{ ...wrapCol(1), display: 'flex' }}>
          <Reveal delay={staggerDelay(1, tokens.motion.stagger.card, 80)} sx={{ width: '100%' }}>
            {rail}
          </Reveal>
        </Box>
      </WrapRow>
      <WrapRow gap={summit.space.gap.tile}>
        {tiles.map((kpi, i) => (
          <Box key={kpi.key} sx={{ ...wrapCol(1, tokens.layout.wrapBasis.tile), display: 'flex' }}>
            <Reveal delay={staggerDelay(i, 70, 240)} sx={{ width: '100%' }}>
              <KpiTile kpi={kpi} todayLast={todayLast} delay={staggerDelay(i, 70, 500)} />
            </Reveal>
          </Box>
        ))}
      </WrapRow>
    </Box>
  )
}

// ── The trend card ──────────────────────────────────────────────────────────────────────────────────────────────

/** A 1d pill in the trend card (14/600, 7 × 12): `teal` for the window's move, `soft` for the weekly rate. */
function Pill({
  tone,
  icon,
  children,
  ariaLabel,
}: {
  tone: 'teal' | 'warning' | 'soft'
  icon?: ReactNode
  children: ReactNode
  ariaLabel?: string
}) {
  const look = {
    teal: { bg: tokens.tone.success.bg, text: tokens.tone.success.text },
    warning: { bg: tokens.tone.warning.bg, text: tokens.tone.warning.text },
    soft: { bg: summit.surface.soft, text: summit.ink.deep },
  }[tone]
  return (
    <Box
      component="span"
      aria-label={ariaLabel}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        maxWidth: '100%',
        py: '7px',
        pl: icon ? '8px' : '12px',
        pr: '12px',
        borderRadius: `${tokens.radius.pill}px`,
        bgcolor: look.bg,
        color: look.text,
        fontSize: font.size.body,
        fontWeight: font.weight.heading,
        lineHeight: '18px',
        ...tabularNums,
      }}
    >
      {icon}
      {children}
    </Box>
  )
}

/** 1d's gold base camp → summit bar: 12 px, soft violet track, the gold gradient growing from 0 on mount. */
function ClimbBar({ progress }: { progress: number }) {
  const { entered, reduced } = useEntrance()
  const percent = Math.round(progress * 100)
  return (
    <Box
      role="progressbar"
      aria-label={`From ${copy.startLabel} to the ${copy.goalLabel}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      sx={{
        mt: '22px',
        height: 12,
        borderRadius: `${tokens.radius.pill}px`,
        bgcolor: summit.surface.soft,
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          height: '100%',
          // A sliver is always shown, so "the way" has a start even on day one.
          width: `${Math.max(2, Math.min(100, progress * 100))}%`,
          borderRadius: 'inherit',
          backgroundImage: `linear-gradient(90deg, ${summit.gold.main}, ${summit.gold.deep})`,
          transformOrigin: 'left center',
          transform: entered ? 'none' : 'scaleX(0)',
          transition: reduced ? 'none' : `transform 1800ms ${enterEasing()} 900ms`,
        }}
      />
    </Box>
  )
}

const caption = {
  fontSize: font.size.caption,
  fontWeight: font.weight.label,
  lineHeight: font.leading.caption,
  color: tokens.ink.secondary,
} as const

/** The trend card (1d): facts on the left, the trend's sparkline on the right; wraps under on a narrow card. */
function TrendCard({ kpi, goal, today }: { kpi: Kpi; goal: GoalFacts; today: string }) {
  const precision = kpi.precision ?? 1
  const delta = kpi.delta
  const moved = delta && Math.abs(delta.value) >= 10 ** -precision / 2
  const percent = goal.progress === null ? null : Math.round(goal.progress * 100)
  const lastWeighIn = kpi.seriesTo ?? null
  const ahead = goal.ahead
  const rate =
    goal.forecastRate === null
      ? null
      : `−${formatNumber(goal.forecastRate, 2)} kg a week${
          ahead === null ? '' : ` · ${ahead ? 'ahead of' : 'behind'} ${formatNumber(goal.requiredRate, 2)}`
        }`
  const series = kpi.series ?? []
  return (
    <Box
      component="section"
      aria-labelledby="trend-weight-title"
      data-testid={`kpi-${kpi.key}`}
      sx={{ ...cardSurface, height: '100%', px: '28px', py: '26px', minWidth: 0, boxSizing: 'border-box' }}
    >
      <Box sx={{ ...eyebrow, display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        <Box component="h3" id="trend-weight-title" sx={{ m: 0, flex: 1, minWidth: 0, font: 'inherit' }}>
          {kpi.label}
        </Box>
        {lastWeighIn && (
          <Box component="span" sx={{ textTransform: 'none', letterSpacing: 0, flex: 'none' }}>
            Updated {lastWeighIn === today ? 'today' : formatShortDate(lastWeighIn)}
          </Box>
        )}
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'flex-end', mt: '10px' }}>
        <Box sx={{ flex: '100 1 280px', minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <Box
              component="span"
              data-testid="goal-now"
              sx={{
                fontFamily: font.display,
                fontSize: font.fluid.dashboardHero,
                fontWeight: font.weight.display,
                lineHeight: 0.95,
                letterSpacing: font.em.hero,
                color: tokens.ink.text,
                ...tabularNums,
              }}
            >
              {kpi.value === null ? (
                '—'
              ) : (
                <CountUp
                  value={kpi.value}
                  from={goal.startKg ?? undefined}
                  precision={precision}
                  delay={600}
                />
              )}
            </Box>
            <Box
              component="span"
              sx={{
                fontFamily: font.display,
                fontSize: 22,
                fontWeight: font.weight.display,
                color: tokens.ink.text,
              }}
            >
              {kpi.unit}
            </Box>
          </Box>
          {(moved || rate) && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '8px', mt: '14px' }}>
              {moved && delta && (
                <Pill
                  tone={delta.value < 0 ? 'teal' : 'warning'}
                  icon={
                    delta.value < 0 ? (
                      <ArrowDownwardRounded aria-hidden sx={{ fontSize: 18 }} />
                    ) : (
                      <ArrowUpwardRounded aria-hidden sx={{ fontSize: 18 }} />
                    )
                  }
                  ariaLabel={`${delta.value < 0 ? 'Down' : 'Up'} ${formatNumber(Math.abs(delta.value), precision)} ${kpi.unit ?? ''} ${delta.period}`}
                >
                  {formatNumber(Math.abs(delta.value), precision)} {kpi.unit} {delta.period}
                </Pill>
              )}
              {rate && <Pill tone="soft">{rate}</Pill>}
            </Box>
          )}
          {percent !== null && goal.progress !== null && (
            <>
              <ClimbBar progress={goal.progress} />
              <Box
                sx={{
                  ...caption,
                  display: 'flex',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '4px 12px',
                  mt: '8px',
                }}
              >
                <Box component="span" data-testid="goal-start">
                  {copy.StartLabel} {formatNumber(goal.startKg, 1)}
                  {goal.startDate ? ` · ${shortDate(goal.startDate, today)}` : ''}
                </Box>
                <Box component="span" sx={{ color: tokens.ink.text }}>
                  {percent} % of the way
                </Box>
                <Box component="span">
                  {copy.GoalLabel} {formatNumber(goal.goalKg, 1)}
                  {goal.goalDate ? ` · ${shortDate(goal.goalDate, today)}` : ''}
                </Box>
              </Box>
            </>
          )}
        </Box>
        {series.length > 1 && (
          <Box sx={{ flex: '1 1 300px', minWidth: 0, pb: '22px' }}>
            <Sparkline values={series} metric={kpi.metric ?? 'weight'} height={150} />
            {kpi.seriesFrom && kpi.seriesTo && (
              <Box
                sx={{ ...caption, display: 'flex', justifyContent: 'space-between', mt: '4px', mb: '-22px' }}
              >
                <span>{formatShortDate(kpi.seriesFrom)}</span>
                <span>{formatShortDate(kpi.seriesTo)}</span>
              </Box>
            )}
          </Box>
        )}
      </Box>
    </Box>
  )
}

// ── The KPI tiles ───────────────────────────────────────────────────────────────────────────────────────────────

/** Bars per tile: the last 12 days (README: "12-bar sparklines"). */
const BARS = 12

/** Each tile's unit after its number, as 1d writes it. */
const UNIT: Record<string, string> = {
  intake: 'kcal',
  protein: 'g a day',
  steps: 'a day',
  sleep: 'h a night',
  water: 'ml a day',
}

/** The tile's one line against its target, and its colour. */
function tileLine(kpi: Kpi): { text: string; color: string } | null {
  const target = kpi.reference
  const muted = tokens.ink.secondary
  if (kpi.key === 'intake') {
    if (kpi.value === null || target === undefined) return { text: 'Fasts excluded', color: muted }
    const diff = kpi.value - target
    return {
      text: `${formatSigned(diff, 0)} vs ${formatNumber(target)} target`,
      color: onTarget(kpi, kpi.value, target) ? tokens.tone.success.text : tokens.tone.warning.text,
    }
  }
  if (kpi.key === 'protein') {
    if (kpi.value === null || target === undefined) return { text: 'Daily average', color: muted }
    const diff = kpi.value - target
    return {
      text: `${formatSigned(diff, 0)} vs ${formatNumber(target)} minimum`,
      color: onTarget(kpi, kpi.value, target) ? tokens.tone.success.text : tokens.tone.warning.text,
    }
  }
  if (kpi.key === 'steps') {
    const present = (kpi.series ?? []).filter((v): v is number => v !== null)
    if (target === undefined || present.length === 0) return { text: 'Daily average', color: muted }
    const hit = present.filter((v) => onTarget(kpi, v, target)).length
    return { text: `${hit} of ${present.length} days at ${formatNumber(target)}`, color: muted }
  }
  if (kpi.key === 'sleep') return { text: `target ${formatNumber(SLEEP_TARGET_H, 1)} h`, color: muted }
  if (kpi.key === 'water')
    return {
      text: target === undefined ? 'Daily average' : `target ${formatNumber(target)} ml`,
      color: muted,
    }
  return null
}

function KpiTile({ kpi, todayLast, delay }: { kpi: Kpi; todayLast: boolean; delay: number }) {
  const line = tileLine(kpi)
  const values = (kpi.series ?? []).slice(-BARS)
  const present = values.filter((v) => v !== null).length
  const precision = kpi.precision ?? 0
  const target = kpi.reference
  const hits =
    target === undefined ? null : values.filter((v) => v !== null && onTarget(kpi, v, target)).length
  return (
    <Box
      data-testid={`kpi-${kpi.key}`}
      sx={{
        ...cardSurface,
        borderRadius: `${summit.radius.tile}px`,
        height: '100%',
        boxSizing: 'border-box',
        px: '22px',
        py: '20px',
        minWidth: 0,
      }}
    >
      <Box
        sx={{
          fontSize: font.size.label,
          fontWeight: font.weight.heading,
          color: tokens.ink.secondary,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {kpi.label}
      </Box>
      <Box
        sx={{
          mt: '6px',
          display: 'flex',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          columnGap: '5px',
          fontFamily: font.display,
          fontSize: 26,
          fontWeight: font.weight.number,
          letterSpacing: font.em.number,
          lineHeight: 1.15,
          color: tokens.ink.text,
          ...tabularNums,
        }}
      >
        <span>
          {kpi.value === null ? '—' : <CountUp value={kpi.value} precision={precision} delay={delay} />}
        </span>
        {kpi.value !== null && (
          <Box
            component="span"
            sx={{
              fontFamily: font.family,
              fontSize: font.size.small,
              fontWeight: font.weight.label,
              letterSpacing: 0,
              color: tokens.ink.secondary,
            }}
          >
            {UNIT[kpi.key] ?? kpi.unit}
          </Box>
        )}
      </Box>
      {line && (
        <Box
          sx={{
            mt: '2px',
            fontSize: font.size.small,
            fontWeight: font.weight.label,
            lineHeight: font.leading.small,
            color: line.color,
          }}
        >
          {line.text}
        </Box>
      )}
      {present > 0 && kpi.metric && (
        <KpiBars
          values={values}
          metric={kpi.metric}
          target={target}
          ceiling={kpi.ceiling ?? false}
          todayLast={todayLast}
          delay={delay + 200}
          label={`${kpi.label}, last ${values.length} days${target !== undefined ? `, against a target of ${formatNumber(target, precision)}` : ''}: ${present} ${present === 1 ? 'day' : 'days'} logged${hits !== null ? `, ${hits} on target` : ''}`}
          testId={`chart-kpi-${kpi.key}`}
        />
      )}
    </Box>
  )
}

/**
 * The tile's 12 mini bars (1d): 44 px tall, 4 px apart, radius 3, each grown from the baseline 35 ms after the one
 * before it. A day on target (`onTarget`: at or under a ceiling, at or over a minimum) in the metric's strong end, the
 * rest in its light end, today (still in progress) in its tint, a day with nothing logged a 2 px stub. One image with a
 * written summary.
 */
function KpiBars({
  values,
  metric,
  target,
  ceiling,
  todayLast,
  delay,
  label,
  testId,
}: {
  values: readonly (number | null)[]
  metric: MetricKey
  target: number | undefined
  /** The target is a ceiling (intake). */
  ceiling: boolean
  todayLast: boolean
  delay: number
  label: string
  testId: string
}) {
  const { entered, reduced } = useEntrance()
  const ramp = metricRamp(metric)
  const numbers = values.filter((v): v is number => v !== null)
  const top = Math.max(...numbers, target ?? 0, 1) * 1.08
  return (
    <Box
      role="img"
      aria-label={label}
      data-testid={testId}
      sx={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: 44, mt: '14px', minWidth: 0 }}
    >
      {values.map((v, i) => {
        const today = todayLast && i === values.length - 1
        const fill =
          v === null || today
            ? ramp.track
            : target !== undefined && onTarget({ ceiling }, v, target)
              ? ramp.from
              : ramp.to
        return (
          <Box
            key={i}
            aria-hidden
            sx={{
              flex: 1,
              minWidth: 0,
              height: v === null ? '2px' : `${Math.max(4, (v / top) * 100)}%`,
              borderRadius: '3px',
              bgcolor: fill,
              transformOrigin: 'bottom',
              transform: entered ? 'none' : 'scaleY(0)',
              transition: reduced ? 'none' : `transform 700ms ${enterEasing()} ${delay + i * 35}ms`,
            }}
          />
        )
      })}
    </Box>
  )
}
