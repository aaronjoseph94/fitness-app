// Owns: realistic, deterministic sample series for the styleguide and chart development, built from Aaron's
// baseline (Evolt scan 2026-09-26: 95.1 kg, 35.5 kg fat, 59.6 kg lean, 37.3 %, visceral 16, WHR 1.02; goal 65 kg;
// 1,400 kcal floor, 130 g protein, 3,000 ml water, two 24 h fasts a month, Mon–Thu training). Not engine output:
// the trend is a plain EWMA (α = 0.25) and the forecast a simple decaying rate, good enough to look real.
import type { CaloriesDay, MacrosDay, StepsDay, WaterDay } from './lib/DayCharts'
import type { CompositionScan, FatScan, WaistPoint } from './lib/BodyCharts'
import type { FastEntry } from './lib/FastingStrip'
import type { GaugeBand } from './lib/Gauge'
import type { HeatmapDay } from './lib/CalendarHeatmap'
import type { Milestone } from './lib/MilestoneTimeline'
import type { SegmentFat } from './lib/SegmentalFatChart'
import type { SleepNight } from './lib/SleepChart'
import type { PlanDay, StrengthSession, VolumeGroup, VolumeWeek } from './lib/TrainingCharts'
import type { WeeklyLossPoint } from './lib/WeeklyLossChart'
import type { ForecastPoint, WeightMilestone, WeightPoint } from './lib/WeightTrendChart'

const DAY = 86_400_000
const START = Date.UTC(2026, 8, 26) // 2026-09-26, baseline scan
const DAYS = 70 // through 2026-12-04
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
const dayN = (n: number) => iso(START + n * DAY)
const round = (v: number, p = 1) => Math.round(v * 10 ** p) / 10 ** p

/** mulberry32: a tiny seeded PRNG so the sample never changes between renders. */
function rng(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = rng(20260926)
const between = (lo: number, hi: number) => lo + rand() * (hi - lo)

export const SAMPLE_TARGETS = {
  goalKg: 65,
  kcal: 1400,
  proteinG: 130,
  waterMl: 3000,
  steps: 8000,
  sleepH: 7.5,
  fatTargetKg: 11.7,
  bodyFatTargetPct: 18,
  visceralTarget: 9,
  whrTarget: 0.9,
} as const

const FAST_DAYS = new Set(['2026-10-14', '2026-10-28', '2026-11-11', '2026-11-25'])

// ---------------------------------------------------------------------------------------------------------------
// Weight: an early water drop, then ~0.75 kg/week; raw = truth + noise, a few skipped mornings.

const weightPoints: WeightPoint[] = []
{
  let trend: number | null = null
  for (let i = 0; i < DAYS; i++) {
    const truth = 95.1 - 1.6 * (1 - Math.exp(-i / 10)) - 0.105 * i
    const skipped = i > 0 && rand() < 0.08
    const raw = skipped
      ? null
      : round(truth + (rand() - 0.5) * 1.1 + (FAST_DAYS.has(dayN(i - 1)) ? -0.6 : 0), 1)
    if (raw !== null) trend = trend === null ? raw : trend + 0.25 * (raw - trend)
    weightPoints.push({ date: dayN(i), raw, trend: trend === null ? null : round(trend, 2) })
  }
}
const lastTrend = weightPoints.at(-1)!.trend!

const forecast: ForecastPoint[] = [{ date: dayN(DAYS - 1), mid: lastTrend, low: lastTrend, high: lastTrend }]
{
  let mid = lastTrend
  let week = 0
  while (mid > SAMPLE_TARGETS.goalKg && week < 60) {
    week++
    mid -= Math.max(0.45, 0.74 - week * 0.008)
    const lost = lastTrend - mid
    forecast.push({
      date: dayN(DAYS - 1 + week * 7),
      mid: round(mid, 2),
      low: round(lastTrend - lost * 1.2, 2),
      high: round(lastTrend - lost * 0.8, 2),
    })
  }
}

const reachedOn = (value: number) =>
  weightPoints.find((p) => p.trend !== null && p.trend !== undefined && p.trend <= value)?.date ?? null
const expectedOn = (value: number) => forecast.find((f) => f.mid <= value)?.date ?? null
const WEIGHT_MILESTONES = [90, 85, 80, 75, 70, 65]

const weightMilestones: WeightMilestone[] = WEIGHT_MILESTONES.map((value) => ({
  value,
  reachedOn: reachedOn(value),
}))
const milestones: Milestone[] = WEIGHT_MILESTONES.map((value) => {
  const reached = reachedOn(value)
  return { label: `${value} kg`, reachedOn: reached, expectedOn: reached ? null : expectedOn(value) }
})

// Weeks start on Mondays: 2026-09-28 is the first full week.
const MONDAY0 = 2
const weeklyLoss: WeeklyLossPoint[] = []
for (let w = 0; MONDAY0 + (w + 1) * 7 < DAYS; w++) {
  const a = weightPoints[MONDAY0 + w * 7]!.trend!
  const b = weightPoints[MONDAY0 + (w + 1) * 7]!.trend!
  const tdee = 2551 - w * 14
  weeklyLoss.push({
    week: dayN(MONDAY0 + w * 7),
    change: round(b - a, 2),
    expected: round(-((tdee - 1400) * 7) / 7700, 2),
  })
}

// ---------------------------------------------------------------------------------------------------------------
// Daily intake, water, steps, sleep.

const calories: CaloriesDay[] = []
const macros: MacrosDay[] = []
const water: WaterDay[] = []
const steps: StepsDay[] = []
const sleep: SleepNight[] = []
const proteinAdherence: HeatmapDay[] = []
const loggingAdherence: HeatmapDay[] = []

for (let i = 0; i < DAYS; i++) {
  const date = dayN(i)
  const dow = new Date(START + i * DAY).getUTCDay() // 0 Sun … 6 Sat
  const weekend = dow === 0 || dow === 6
  const fast = FAST_DAYS.has(date)
  if (fast) {
    calories.push({ date, lunch: 0, dinner: 0, snack: 0, fast: true })
    macros.push({ date, protein: 0, carbs: 0, fat: 0 })
  } else {
    const lunch = Math.round(between(470, 610))
    const dinner = Math.round(between(560, weekend ? 760 : 690))
    const snack = rand() < 0.75 ? Math.round(between(110, 260)) : 0
    const breakfast = weekend && rand() < 0.3 ? Math.round(between(150, 220)) : 0
    const kcal = lunch + dinner + snack + breakfast
    calories.push({ date, breakfast, lunch, dinner, snack })
    const protein = Math.round(between(108, 146))
    const fat = Math.round(between(42, 58))
    const carbs = Math.max(40, Math.round((kcal - protein * 4 - fat * 9) / 4))
    macros.push({ date, protein, carbs, fat })
    proteinAdherence.push({
      date,
      value: protein >= SAMPLE_TARGETS.proteinG ? 1 : round(protein / SAMPLE_TARGETS.proteinG, 2),
    })
  }
  if (fast) proteinAdherence.push({ date, value: null })
  water.push({ date, ml: Math.round(fast ? between(3200, 3800) : between(2050, 3450)) })
  steps.push({ date, steps: Math.round(weekend ? between(3800, 12500) : between(5200, 10400)) })
  const hours = round(between(5.8, 8.2), 1)
  const bed = Math.round(between(22 * 60 + 5, 24 * 60 + 40)) % (24 * 60)
  sleep.push({
    date,
    hours,
    bedtime: `${String(Math.floor(bed / 60)).padStart(2, '0')}:${String(bed % 60).padStart(2, '0')}`,
  })
  const weighed = weightPoints[i]!.raw != null ? 1 : 0
  const meals = fast ? 1 : rand() < 0.9 ? 1 : 0.5
  loggingAdherence.push({ date, value: round((weighed + meals + (rand() < 0.85 ? 1 : 0)) / 3, 2) })
}

// ---------------------------------------------------------------------------------------------------------------
// Scans every 4 weeks, tape measurements weekly.

const scans: (CompositionScan & FatScan)[] = [
  { date: '2026-09-26', fatMass: 35.5, leanMass: 59.6, bodyFatPct: 37.3, visceralLevel: 16 },
  { date: '2026-10-24', fatMass: 32.6, leanMass: 58.7, bodyFatPct: 35.7, visceralLevel: 15 },
  { date: '2026-11-21', fatMass: 30.1, leanMass: 58.0, bodyFatPct: 34.2, visceralLevel: 14 },
]

const segments: SegmentFat[] = [
  { segment: 'Left arm', baseline: 2.18, latest: 1.86 },
  { segment: 'Right arm', baseline: 2.29, latest: 1.95 },
  { segment: 'Torso', baseline: 20.5, latest: 17.2 },
  { segment: 'Left leg', baseline: 5.23, latest: 4.62 },
  { segment: 'Right leg', baseline: 5.35, latest: 4.7 },
]

const waist: WaistPoint[] = Array.from({ length: 10 }, (_, w) => ({
  date: dayN(1 + w * 7),
  waist: round(112 - w * 0.78 + (rand() - 0.5) * 0.8, 1),
  whr: round(1.02 - w * 0.0055 + (rand() - 0.5) * 0.006, 3),
}))

// ---------------------------------------------------------------------------------------------------------------
// Training: Mon–Thu upper / lower / upper / lower.

const volumeGroups: VolumeGroup[] = [
  { key: 'legs', label: 'Legs' },
  { key: 'pull', label: 'Back & biceps' },
  { key: 'push', label: 'Chest, shoulders & triceps' },
  { key: 'core', label: 'Core' },
]

const volume: VolumeWeek[] = Array.from({ length: 9 }, (_, w) => {
  const ramp = Math.min(1, 0.72 + w * 0.06)
  const deload = w === 7 ? 0.6 : 1
  return {
    week: dayN(MONDAY0 + w * 7),
    volume: {
      legs: Math.round(between(13000, 16500) * ramp * deload),
      pull: Math.round(between(7000, 9200) * ramp * deload),
      push: Math.round(between(6400, 8600) * ramp * deload),
      core: Math.round(between(700, 1400) * ramp * deload),
    },
  }
})

const strength: StrengthSession[] = []
{
  let load = 40
  let hits = 0
  for (let s = 0; s < 18; s++) {
    const reps = Math.min(12, 8 + Math.floor(rand() * 5))
    strength.push({
      date: dayN(MONDAY0 + Math.floor(s / 2) * 7 + (s % 2) * 2),
      load,
      reps,
      e1rm: round(load * (1 + reps / 30), 1),
    })
    hits = reps >= 12 ? hits + 1 : 0
    if (hits >= 2) {
      load += 2.5
      hits = 0
    }
  }
}

const weekPlan: PlanDay[] = [
  { day: 'Mon', plannedKcal: 1400, eatenKcal: 1385, session: 'done' },
  { day: 'Tue', plannedKcal: 1400, eatenKcal: 1452, session: 'done' },
  { day: 'Wed', plannedKcal: 1400, eatenKcal: 1340, session: 'missed' },
  { day: 'Thu', plannedKcal: 1400, eatenKcal: 1418, session: 'done' },
  { day: 'Fri', plannedKcal: 1450, eatenKcal: 1120, session: 'rest' },
  { day: 'Sat', plannedKcal: 1550, eatenKcal: null, session: 'rest' },
  { day: 'Sun', plannedKcal: 1550, eatenKcal: null, session: 'rest' },
]

const fasts: FastEntry[] = [
  { date: '2026-10-14', status: 'completed', hours: 24.3 },
  { date: '2026-10-28', status: 'partial', hours: 19.5 },
  { date: '2026-11-11', status: 'completed', hours: 24 },
  { date: '2026-11-25', status: 'completed', hours: 24.6 },
  { date: '2026-12-09', status: 'planned' },
  { date: '2026-12-23', status: 'planned' },
]

// ---------------------------------------------------------------------------------------------------------------
// Gauges: Evolt ranges (body fat 15–20 % healthy for Aaron's profile; visceral 1–9 balanced).

const bodyFatBands: GaugeBand[] = [
  { to: 20, tone: 'good', label: 'Healthy' },
  { to: 25, tone: 'warning', label: 'Above range' },
  { to: 45, tone: 'flag', label: 'High' },
]
const visceralBands: GaugeBand[] = [
  { to: 9, tone: 'good', label: 'Balanced' },
  { to: 14, tone: 'warning', label: 'Above range' },
  { to: 30, tone: 'flag', label: 'High' },
]

const lastN = <T>(xs: readonly T[], n: number) => xs.slice(Math.max(0, xs.length - n))

export const sample = {
  today: dayN(DAYS - 1),
  targets: SAMPLE_TARGETS,
  weight: { points: weightPoints, forecast, goal: SAMPLE_TARGETS.goalKg, milestones: weightMilestones },
  /** Last 14 trend values, for a StatCard sparkline. */
  weightSparkline: lastN(weightPoints, 14).map((p) => p.trend ?? null),
  weeklyLoss,
  calories: lastN(calories, 28),
  macros: lastN(macros, 28),
  water: lastN(water, 28),
  steps: lastN(steps, 28),
  sleep: lastN(sleep, 21),
  proteinAdherence,
  loggingAdherence,
  scans,
  segments,
  waist,
  volumeGroups,
  volume,
  strength: { exercise: 'Chest press (machine)', sessions: strength },
  weekPlan,
  fasts,
  fastingRange: { from: '2026-10-01', to: '2026-12-31' },
  milestones,
  gauges: {
    bodyFat: { value: 34.2, min: 10, max: 45, bands: bodyFatBands },
    visceral: { value: 14, min: 1, max: 30, bands: visceralBands },
  },
} as const
