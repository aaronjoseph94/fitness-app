// Owns: the Dashboard's "Recovery and habits" section (2a) — water, steps and sleep as mini bars against their targets
// (a bar per day, or per week on a long window), three to a row, then the fasting strip (past days, today, the days
// ahead and the planned fast) beside the logging strip (each day's share of weigh-in, meals and water), drawn from the
// window's v_day rows and fasts. On a phone the section folds away and opens on a tap.
// Series mappings come from the progress module's shared entry point (../../progress/series), so these cards count
// days exactly as the Progress tab does.
import { addDays, dayAdherence, fastDay } from '@fitness/shared/engine'
import type { LocalDate } from '@fitness/shared/schemas'
import { useUiStore } from '../../../app/ui-store'
import type { FastEntry, FastStatus } from '../../../charts'
import { Column, Columns, formatLongDate, formatNumber, formatShortDate, formatWeekday, MiniBars } from '../../../components'
import { tokens, metricTint, type MetricKey } from '../../../theme'
import { fastEntries, hasAny, latestTargets, sleepNights, stepsDays, waterDays } from '../../progress/series'
import { DashCard } from './DashCard'
import { DayStrip, type DayCell } from './DayStrip'
import { barSeries } from './kpis'
import { DashboardSection } from './Section'
import type { DashboardData } from './useDashboardData'

/** SPEC §9 readiness compares sleep with 7.5 h. */
const SLEEP_TARGET_H = 7.5
/** SPEC §2: a planned fast lasts 24 h. */
const DEFAULT_FAST_HOURS = 24
/** 2a's habit bars: 90 px tall. */
const BAR_HEIGHT = 90

/** The day holding the highest value, or null. */
function best(series: readonly { date: string; value: number | null | undefined }[]): { date: string; value: number } | null {
  let top: { date: string; value: number } | null = null
  for (const d of series) if (typeof d.value === 'number' && (top === null || d.value > top.value)) top = { date: d.date, value: d.value }
  return top
}

/** "Hit on 2 of 12 days": days at or above the target, out of the days with a value. */
function hits(values: readonly (number | null | undefined)[], target: number | undefined): string | null {
  const present = values.filter((v): v is number => typeof v === 'number')
  if (target === undefined || present.length === 0) return null
  return `Hit on ${present.filter((v) => v >= target).length} of ${present.length} ${present.length === 1 ? 'day' : 'days'}`
}

function Bars({ values, metric, target, label }: { values: readonly (number | null | undefined)[]; metric: MetricKey; target?: number; label: string }) {
  return <MiniBars values={barSeries(values.map((v) => v ?? null))} metric={metric} target={target} height={BAR_HEIGHT} label={label} />
}

export function RecoverySection({ data }: { data: DashboardData }) {
  const openQuickLog = useUiStore((s) => s.openQuickLog)
  const rows = data.days
  const today = data.to
  const targets = latestTargets(rows)
  const fastHours = data.settings?.fast_hours ?? DEFAULT_FAST_HOURS
  const water = waterDays(rows)
  const steps = stepsDays(rows)
  const sleep = sleepNights(rows)
  // Each fast sits on its fast day (the engine's `fastDay`: the local day it covers most — Saturday for a 24 h fast from
  // Friday 8 PM), as the goals rail and the Log tab date it; a fast too short to have one keeps its start date.
  const now = Date.now()
  const entries = data.fasts
    .flatMap((f) => fastEntries([f], now, fastHours).map((e) => ({ ...e, date: fastDay(f, fastHours) ?? e.date })))
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  const waterValues = water.map((d) => (d.ml ? d.ml : null))
  const stepsValues = steps.map((d) => (d.steps ? d.steps : null))
  const sleepValues = sleep.map((n) => n.hours ?? null)
  const bestSteps = best(steps.map((d) => ({ date: d.date, value: d.steps })))
  const bestSleep = best(sleep.map((n) => ({ date: n.date, value: n.hours })))
  const presentSleep = sleepValues.filter((v): v is number => v !== null)
  const avgSleep = presentSleep.length ? presentSleep.reduce((s, v) => s + v, 0) / presentSleep.length : null
  const presentWater = waterValues.filter((v): v is number => v !== null)
  const avgWater = presentWater.length ? presentWater.reduce((s, v) => s + v, 0) / presentWater.length : null

  return (
    <DashboardSection id="recovery" title="Recovery and habits" subtitle="Water, steps, sleep, fasting and logging">
      {/* 2a draws four equal cards; with water as a card too, the three bar cards share a row and the two strips the
          next, so no card is narrower than its title and target line. */}
      <Columns xs={1} sm={2} md={6} lg={12} align="stretch">
        <Column span={4} mdSpan={2}>
          <DashCard
            title="Water"
            action={targets ? `target ${formatNumber(targets.water_ml)} ml` : undefined}
            caption={[hits(waterValues, targets?.water_ml), avgWater !== null ? `average ${formatNumber(avgWater)} ml` : null].filter(Boolean).join(' · ')}
            testId="dashboard-water"
            empty={
              hasAny(water, (d) => d.ml)
                ? null
                : { title: 'No water logged in this window', body: 'Quick-add 250, 500 or 750 ml and the bars fill in.', action: { label: 'Log water', onClick: () => openQuickLog('water') } }
            }
          >
            <Bars values={waterValues} metric="water" target={targets?.water_ml} label={`Water per day in this window${targets ? `; target ${formatNumber(targets.water_ml)} ml` : ''}`} />
          </DashCard>
        </Column>

        <Column span={4} mdSpan={2}>
          <DashCard
            title="Steps"
            action={targets ? `target ${formatNumber(targets.steps)}` : undefined}
            caption={[hits(stepsValues, targets?.steps), bestSteps ? `best ${formatNumber(bestSteps.value)} on ${formatShortDate(bestSteps.date)}` : null].filter(Boolean).join(' · ')}
            testId="dashboard-steps"
            empty={hasAny(steps, (d) => d.steps) ? null : { title: 'No steps in this window', body: 'Steps arrive from the Apple Watch Shortcut or the manual form.' }}
          >
            <Bars values={stepsValues} metric="steps" target={targets?.steps} label={`Steps per day in this window${targets ? `; target ${formatNumber(targets.steps)}` : ''}`} />
          </DashCard>
        </Column>

        <Column span={4} mdSpan={2}>
          <DashCard
            title="Sleep"
            action={`target ${SLEEP_TARGET_H} h`}
            caption={[
              avgSleep !== null ? `Average ${formatNumber(avgSleep, 1)} h` : null,
              bestSleep ? `${formatNumber(bestSleep.value, 1)} h best on ${formatShortDate(bestSleep.date)}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            testId="dashboard-sleep"
            empty={
              hasAny(sleep, (n) => n.hours)
                ? null
                : { title: 'No sleep in this window', body: 'Last night’s sleep arrives from the Apple Watch Shortcut or the manual form.' }
            }
          >
            <Bars values={sleepValues} metric="sleep" target={SLEEP_TARGET_H} label={`Hours asleep per night in this window; target ${SLEEP_TARGET_H} h`} />
          </DashCard>
        </Column>

        <Column span={6} mdSpan={3}>
          <FastingCard data={data} entries={entries} fastHours={fastHours} today={today} onStart={() => openQuickLog('fast')} />
        </Column>

        <Column span={6} mdSpan={3} smSpan={2}>
          <LoggingCard data={data} today={today} />
        </Column>
      </Columns>
    </DashboardSection>
  )
}

/** A fast dated by its fast day. */
type Entries = readonly (FastEntry & { date: LocalDate })[]

/** Every local date from `from` to `to`, inclusive. */
function datesBetween(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

const FAST_LOOK: Record<FastStatus, Pick<DayCell, 'fill' | 'dashed'> & { word: string }> = {
  completed: { fill: tokens.metric.fasting, word: 'fast completed' },
  partial: { fill: metricTint('fasting'), word: 'fast broken off early' },
  planned: { dashed: tokens.tone.warning.text, word: 'fast planned' },
  missed: { dashed: tokens.ink.faint, word: 'planned fast missed' },
}

/**
 * 2a's fasting strip: each day from the start of the window's data to the last fast planned (past days grey, today
 * blue, the days ahead dashed, a fast by its status), then the window's count and the next fasts in words ("First 24 h
 * fast is Saturday, October 10 · second planned Oct 24").
 */
function FastingCard({ data, entries, fastHours, today, onStart }: { data: DashboardData; entries: Entries; fastHours: number; today: LocalDate; onStart: () => void }) {
  const from: LocalDate = data.days[0]?.date ?? data.from
  // The strip runs to whichever is later: today or the last fast planned beyond it.
  const to = entries.reduce<LocalDate>((latest, f) => (f.date > latest ? f.date : latest), today)
  const byDate = new Map(entries.map((e) => [e.date, e]))
  const cells: DayCell[] = datesBetween(from, to).map((date) => {
    const fast = byDate.get(date)
    const day = `${formatWeekday(date)}, ${formatShortDate(date)}`
    if (fast) return { date, fill: FAST_LOOK[fast.status].fill, dashed: FAST_LOOK[fast.status].dashed, description: `${day}: ${FAST_LOOK[fast.status].word}` }
    if (date === today) return { date, fill: tokens.accent.main, description: `${day}: today` }
    if (date > today) return { date, dashed: tokens.ink.dashed, description: `${day}: ahead` }
    return { date, fill: tokens.ink.fill, description: `${day}: no fast` }
  })
  const done = entries.filter((e) => e.status === 'completed' && e.date >= from).length
  const [next, second] = entries.filter((e) => e.status === 'planned' && e.date >= today)
  // "First" only when the whole plan is in the window and none has been completed yet; otherwise "next".
  const first = done === 0 && (data.profile?.start_date ?? '') >= data.from
  const summary = [
    done ? `${done} ${done === 1 ? 'fast' : 'fasts'} completed in this window` : null,
    next ? `${first ? 'first' : 'next'} ${fastHours} h fast is ${formatLongDate(next.date)}` : 'none planned',
    second ? `second planned ${formatShortDate(second.date)}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const perMonth = data.settings?.fasts_per_month
  return (
    <DashCard
      title="Fasting"
      action={perMonth ? `${perMonth} × ${fastHours} h a month` : undefined}
      caption={summary.charAt(0).toUpperCase() + summary.slice(1)}
      testId="dashboard-fasting"
      empty={
        entries.length > 0
          ? null
          : { title: 'No fasts in this window', body: 'A fast day is a known pattern, not a missed day. Start one from the quick-log button.', action: { label: 'Start a fast', onClick: onStart } }
      }
    >
      <DayStrip
        cells={cells}
        label={`Fasting, ${formatShortDate(from)} to ${formatShortDate(to)}: ${summary}`}
        startLabel={formatShortDate(from)}
        endLabel={to > today ? formatWeekday(to) : formatShortDate(to)}
        mark={{ index: cells.findIndex((c) => c.date === today), label: 'today' }}
      />
    </DashCard>
  )
}

/**
 * 2a's logging strip: one cell per day of the window's data, by the engine's day adherence (weigh-in, two meals or a
 * fast, water) — all three green, some light green, today pale while it is still in progress.
 */
function LoggingCard({ data, today }: { data: DashboardData; today: string }) {
  const days = data.days
  const scored = days.map((d) => ({ day: d, a: dayAdherence(d) }))
  const cells: DayCell[] = scored.map(({ day, a }) => {
    const n = Math.round(a.score * 3)
    const when = `${formatWeekday(day.date)}, ${formatShortDate(day.date)}`
    const fill =
      a.adherent ? tokens.tone.success.solid : day.date === today ? tokens.tone.success.border : n > 0 ? tokens.tone.success.light : tokens.ink.fill
    return { date: day.date, fill, description: `${when}: ${a.adherent ? 'all three logged' : `${n} of 3 logged`}${day.date === today && !a.adherent ? ', in progress' : ''}` }
  })
  const share = scored.length ? scored.reduce((s, x) => s + x.a.score, 0) / scored.length : 0
  const noWater = scored.filter((x) => !x.a.water && x.day.date !== today).length
  const todayOpen = scored.some((x) => x.day.date === today && !x.a.adherent)
  const summary = [
    `Adherence ${Math.round(share * 100)} %`,
    noWater ? `${noWater} ${noWater === 1 ? 'day' : 'days'} missed water` : null,
    todayOpen ? 'today in progress' : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <DashCard
      title="Logging"
      action="weigh-in · meals · water"
      caption={summary}
      empty={days.length ? null : { title: 'Nothing logged in this window', body: 'Weigh-in, meals and water each day fill this strip.' }}
      testId="dashboard-logging"
    >
      <DayStrip
        cells={cells}
        label={`Logging adherence: ${summary}`}
        startLabel={days[0] ? formatShortDate(days[0].date) : undefined}
        endLabel={days.at(-1) ? formatShortDate(days.at(-1)!.date) : undefined}
        testId="chart-logging-adherence"
      />
    </DashCard>
  )
}

