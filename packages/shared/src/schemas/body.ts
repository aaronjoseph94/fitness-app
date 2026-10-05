// Owns: weigh-ins, tape measurements, milestones, and the trend series (raw + trend weight, waist, forecast).
import * as z from 'zod'
import { Cm, Id, Kg, LocalDate, MeasurementSite, Row } from './common'
import { Forecast } from './plan'

/** A plausible scale reading for an adult. */
const BodyWeightKg = Kg.min(30).max(300)

/** One raw scale weight per local date. */
export const WeighIn = Row.extend({ date: LocalDate, weight_kg: BodyWeightKg, note: z.string().nullable() })
export type WeighIn = z.infer<typeof WeighIn>

/** Body of POST /api/weights. One weigh-in per date: logging a date that has one replaces it. */
export const WeighInCreate = z.object({
  id: Id,
  date: LocalDate,
  weight_kg: BodyWeightKg,
  note: z.string().trim().max(500).optional(),
})
export type WeighInCreate = z.infer<typeof WeighInCreate>

/** Body of PUT /api/weights/:id: the weigh-in's new values. */
export const WeighInUpdate = z.object({
  date: LocalDate,
  weight_kg: BodyWeightKg,
  note: z.string().trim().max(500).nullable(),
})
export type WeighInUpdate = z.infer<typeof WeighInUpdate>

export const Measurement = Row.extend({ date: LocalDate, site: MeasurementSite, value_cm: Cm })
export type Measurement = z.infer<typeof Measurement>

/** Body of POST /api/measurements: one tape session (any of the eight sites). A site already logged that date is replaced. */
export const MeasurementsCreate = z.object({
  date: LocalDate,
  entries: z
    .array(z.object({ id: Id, site: MeasurementSite, value_cm: Cm }))
    .min(1)
    .max(MeasurementSite.options.length)
    .refine((es) => new Set(es.map((e) => e.site)).size === es.length, { message: 'Each site at most once' }),
})
export type MeasurementsCreate = z.infer<typeof MeasurementsCreate>

export const MilestoneKind = z.enum(['weight', 'body_fat_pct', 'visceral_level', 'whr', 'segment'])
export type MilestoneKind = z.infer<typeof MilestoneKind>

/** A target value and the date it was reached (with the scan nearest to it). */
export const Milestone = Row.extend({
  kind: MilestoneKind,
  /** e.g. "85 kg", "Torso fat < 10.4 kg". */
  label: z.string().min(1),
  target_value: z.number(),
  /** For kind 'segment': which segment (e.g. 'torso'). */
  segment: z.string().nullable().optional(),
  reached_on: LocalDate.nullable(),
  scan_id: Id.nullable(),
})
export type Milestone = z.infer<typeof Milestone>

/** One day of the weight chart: the raw weigh-in (null on a gap) and the trend (EWMA α = 0.25, carried over gaps). */
export const TrendPoint = z.object({ date: LocalDate, weight_kg: BodyWeightKg.nullable(), trend_kg: BodyWeightKg.nullable() })
export type TrendPoint = z.infer<typeof TrendPoint>

/** Response of GET /api/trend: daily points, the 7-day trend change, measurements, the forecast and milestones. */
export const TrendSeries = z.object({
  from: LocalDate,
  to: LocalDate,
  points: z.array(TrendPoint),
  /** trend(to) − trend(to − 7 days). */
  change_7d_kg: z.number().nullable(),
  measurements: z.array(Measurement),
  forecast: Forecast.nullable(),
  milestones: z.array(Milestone),
})
export type TrendSeries = z.infer<typeof TrendSeries>
