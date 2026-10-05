// Owns: mapping body rows (weight_logs, measurements, milestones) to their contract shapes (drops the actor column).
import type { Measurement, Milestone, WeighIn } from '@fitness/shared/schemas'
import type { measurements, milestones, Row, weight_logs } from '../../../db'

export const toWeighIn = (r: Row<typeof weight_logs>): WeighIn => ({
  id: r.id,
  date: r.date,
  weight_kg: r.weight_kg,
  note: r.note,
  created_at: r.created_at,
  updated_at: r.updated_at,
})

export const toMeasurement = (r: Row<typeof measurements>): Measurement => ({
  id: r.id,
  date: r.date,
  site: r.site,
  value_cm: r.value_cm,
  created_at: r.created_at,
  updated_at: r.updated_at,
})

export const toMilestone = (r: Row<typeof milestones>): Milestone => ({
  id: r.id,
  kind: r.kind,
  label: r.label,
  target_value: r.target_value,
  segment: r.segment,
  reached_on: r.reached_on,
  scan_id: r.scan_id,
  created_at: r.created_at,
  updated_at: r.updated_at,
})
