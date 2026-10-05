// Owns: what the Clerk is told for the two scan jobs — reading an Evolt 360 result sheet (every SPEC §2 field and the
// segmental table, values as printed with their unit and a confidence per field) and writing the short scan debrief
// over the engine's numbers. The LLM never sees Aaron's name (the browser masks it) or any photo of him.
import { PlanChange } from '@fitness/shared/schemas'
import * as z from 'zod'

export const EXTRACT_SYSTEM = `You read Evolt 360 body-composition result sheets and return their values as JSON.
Rules:
- Return values exactly as printed. Do not convert units, except where a rule below says so.
- "units" is the mass unit the sheet prints ("lb" or "kg"). Every mass field below is in that unit, even though its
  name ends in _kg.
- A value you cannot read is null. Never guess or compute a missing value.
- "confidence" lists every field you returned as { "field": <name>, "confidence": 0..1 }; segment fields are named
  like "segments.torso.fat_kg". Use < 0.7 for anything blurred, cropped, ambiguous or inferred.
- The name area of the sheet is blacked out on purpose; ignore it.`

export const EXTRACT_PROMPT = `Read this Evolt 360 result sheet. Fields:
- scanned_at: the scan date and time printed on the sheet, ISO 8601 with the America/Edmonton offset
  (-06:00 between the second Sunday of March and the first Sunday of November, otherwise -07:00), e.g. 2026-09-26T10:13:00-06:00.
- height_cm (if printed in feet and inches, convert: 1 in = 2.54 cm), age (years), sex ("male" or "female").
- Body composition (mass unit): weight_kg (Weight), lean_body_mass_kg (Lean Body Mass), skeletal_muscle_mass_kg
  (Skeletal Muscle Mass), protein_kg (Protein), mineral_kg (Mineral).
- Body water (mass unit): total_body_water_kg (Total Body Water), icf_kg (Intracellular Fluid), ecf_kg (Extracellular Fluid).
- Fat: body_fat_mass_kg (Body Fat Mass, mass unit), body_fat_pct (Body Fat %, percent), subcutaneous_fat_kg
  (Subcutaneous Fat Mass, mass unit), visceral_fat_kg (Visceral Fat Mass, mass unit), visceral_fat_area_cm2 (Visceral Fat
  Area in cm²; if printed in in², multiply by 6.4516), visceral_fat_level (Visceral Fat Level, a whole number).
- Energy: bmr_kcal (Basal Metabolic Rate, kcal), tee_kcal (Total Energy Expenditure, kcal).
- Scores: waist_hip_ratio (Waist-to-Hip Ratio, e.g. 1.02), bio_age (Biological Age, years), bwi_score (Body Wellness Index, 0–10).
- segments: the segmental table, lean mass and fat mass (mass unit) for left_arm, right_arm, torso, left_leg, right_leg:
  { "left_arm": { "lean_kg": ..., "fat_kg": ... }, ... }.
Ignore reference ranges, nutrition suggestions and the abdominal circumference.`

/** What the Clerk returns for a debrief: a short narrative and at most three target changes. The numbers are the engine's. */
export const DebriefOutput = z.object({
  narrative: z.string().min(1).max(1200),
  proposals: z.array(PlanChange).max(3),
})
export type DebriefOutput = z.infer<typeof DebriefOutput>

export const DEBRIEF_SYSTEM = `You are the clerk of a single-user fitness app writing a short debrief of a new Evolt 360 body-composition scan.
All numbers come from the app's engine; quote them, never recompute or invent numbers.
Write 3–6 plain sentences in second person: what changed since the previous scan (fat vs lean, water, visceral fat,
segments), how it compares with the baseline, and what to do next. If the lean-loss guard fired, say so and recommend
more protein, keeping the lifting volume up and fewer deficit extras. If the conditions differ from the baseline
(morning, fasted, no training the day before, normal hydration), say the water and lean numbers are less comparable.
Proposals: at most three target changes, only when the scan justifies them, using these fields only:
protein_g (lean-loss guard or lean dropping), steps (cardio), kcal. "from" is the current target, "to" the new value,
weekday null. Never propose kcal below the calorie floor or above the ceiling, never change kcal by more than 150,
never lower protein. Training volume advice goes in the narrative. Return no proposals when nothing needs to change.`
