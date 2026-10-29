// Owns: the "dump or ask" contracts — what the model may pull out of one free-form Ask AI message (facts to log, a goal
// change asked for, plan requests, questions), the receipt each logged fact leaves (with its one-tap Undo), the
// screenshots a message may carry, and how the forecast moved after the dump was logged.
import * as z from 'zod'
import { BodyArea, BodyNoteKind, Severity } from './body-notes'
import { Count, Id, Instant, Kg, LocalDate, MealSlot, MeasurementSite, Cm } from './common'
import { Forecast } from './plan'
import { EquipmentName, EquipmentStatus } from './training'
import { ImageType } from './files'

/** How many days back a dumped fact may land ("yesterday" = 1). Older logs go through Log. */
export const DUMP_MAX_DAYS_AGO = 14
const DaysAgo = z
  .number()
  .int()
  .min(0)
  .max(DUMP_MAX_DAYS_AGO)
  .default(0)
  .describe('Edmonton days before today the fact belongs to: 0 today, 1 yesterday')
const HoursAgo = z.number().min(0).max(48).default(0).describe('Hours before now it happened; 0 = now')

/**
 * Where a fact was read: his own words ('text') or an attached screenshot ('screenshot'). A screenshot's fact is logged
 * only when his own text asks to log it, and a fast or a body note never comes from a screenshot. The model fills it;
 * left out, it counts as 'screenshot' whenever the message carries one (fail closed).
 */
export const FactSource = z
  .enum(['text', 'screenshot'])
  .optional()
  .describe("'text' when his own words state it, 'screenshot' when it is read from an attached image")
export type FactSource = z.infer<typeof FactSource>
const source = { source: FactSource }

/**
 * One thing Aaron says happened, in his own words, ready to log. Only facts he states — never a hypothetical ("what
 * if I ate…"), a plan ("I'll have…") or a guess. Each kind maps to one tools-layer log tool (equipment to a Train
 * change that waits for his tap).
 */
export const DumpFact = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('weight'), ...source, days_ago: DaysAgo, weight_kg: Kg.min(30).max(300) }),
  z.object({
    kind: z.literal('measurement'),
    ...source,
    days_ago: DaysAgo,
    site: MeasurementSite,
    value_cm: Cm,
  }),
  z.object({
    kind: z.literal('meal'),
    ...source,
    days_ago: DaysAgo,
    slot: MealSlot,
    text: z.string().trim().min(1).max(2000).describe('What he ate, his words with amounts'),
  }),
  z.object({
    kind: z.literal('water'),
    ...source,
    hours_ago: HoursAgo,
    amount_ml: z.number().int().min(1).max(5000),
  }),
  z.object({
    kind: z.literal('sleep'),
    ...source,
    days_ago: DaysAgo.describe('The wake day: 0 = woke today'),
    asleep_min: z
      .number()
      .int()
      .min(1)
      .max(24 * 60),
  }),
  z.object({
    kind: z.literal('steps'),
    ...source,
    days_ago: DaysAgo,
    steps: Count.max(200_000),
    active_kcal: z.number().nonnegative().max(10_000).optional(),
  }),
  z.object({ kind: z.literal('fast_start'), ...source, hours_ago: HoursAgo }),
  z.object({ kind: z.literal('fast_end'), ...source, hours_ago: HoursAgo }),
  z.object({
    kind: z.literal('equipment'),
    ...source,
    equipment: EquipmentName.describe('The machine or equipment as he names it'),
    status: EquipmentStatus,
    reason: z.string().trim().min(1).max(300),
  }),
  z.object({
    kind: z.literal('body_note'),
    ...source,
    days_ago: DaysAgo,
    area: BodyArea,
    note_kind: BodyNoteKind,
    severity: Severity,
    note: z.string().trim().max(500).describe('His words, short'),
  }),
])
export type DumpFact = z.infer<typeof DumpFact>
export type DumpFactKind = DumpFact['kind']

/** A goal change Aaron asks for (or reports from his doctor); it becomes a proposal he taps. */
export const DumpGoal = z.object({
  goal_weight_kg: Kg.min(40).max(200).nullable(),
  goal_date: LocalDate.nullable(),
  reason: z.string().trim().min(1).max(300).optional(),
})
export type DumpGoal = z.infer<typeof DumpGoal>

/**
 * What one message holds, as the model is shown it. Everything not a fact or a goal goes to the coach as
 * requests/questions. The worker reads the reply leniently (each fact and the goal checked on its own), so one
 * unreadable fact is reported instead of dropping the rest.
 */
export const DumpExtraction = z.object({
  facts: z.array(DumpFact).max(20),
  goal: DumpGoal.nullable(),
  /** Changes he asks for to targets, training or the week ("make Thursday lighter"), his words. */
  requests: z.array(z.string().trim().min(1).max(500)).max(5),
  /** Questions he asks, his words. */
  questions: z.array(z.string().trim().min(1).max(500)).max(5),
})
export type DumpExtraction = z.infer<typeof DumpExtraction>

/** What a logged fact (or an attached meal photo / scan sheet) was saved as. */
export const ReceiptKind = z.enum([
  'weight',
  'measurement',
  'meal',
  'water',
  'sleep',
  'steps',
  'fast_start',
  'fast_end',
  'body_note',
  'scan',
])
export type ReceiptKind = z.infer<typeof ReceiptKind>

/**
 * One thing an Ask AI message logged, with its Undo. `ref_id`: the row written. `before`: what that day's row held
 * before (weight, sleep, steps and a measurement are one row per day or site; null when there was none), so Undo puts
 * it back instead of deleting. `undone_at`: set once; a receipt is undone at most once.
 */
export const Receipt = z.object({
  id: Id,
  message_id: Id,
  kind: ReceiptKind,
  date: LocalDate,
  summary: z.string(),
  ref_id: Id,
  before: z.json().nullable(),
  undone_at: Instant.nullable(),
  created_at: Instant,
})
export type Receipt = z.infer<typeof Receipt>

/** How the forecast moved when a message's facts were logged (`before` null: there was none). */
export const ForecastShift = z.object({ before: Forecast.nullable(), after: Forecast })
export type ForecastShift = z.infer<typeof ForecastShift>

/**
 * What a message carries besides its text. A screenshot (Watch summary, gym app, a label) is uploaded first with
 * POST /api/ai/attachments — re-encoded in the browser, EXIF gone, any box Aaron blacked out painted over — and the model
 * reads it. A meal photo was already logged as a photo meal and a scan sheet uploaded to Scans (name blacked out); the
 * message only names them, so the reply lists them. A progress photo never joins a message.
 */
export const ChatAttachmentRef = z.discriminatedUnion('tag', [
  z.object({ tag: z.literal('screenshot'), id: Id }),
  z.object({ tag: z.literal('meal'), meal_id: Id }),
  z.object({ tag: z.literal('scan'), scan_id: Id }),
])
export type ChatAttachmentRef = z.infer<typeof ChatAttachmentRef>

/** Most screenshots one message may carry. */
export const MAX_SCREENSHOTS = 3

/** Query of POST /api/ai/attachments (the body is the image bytes). */
export const ChatAttachmentUploadQuery = z.object({
  attachment_id: Id,
  content_type: ImageType,
})
export type ChatAttachmentUploadQuery = z.infer<typeof ChatAttachmentUploadQuery>

export const ChatAttachment = z.object({ id: Id, content_type: ImageType, created_at: Instant })
export type ChatAttachment = z.infer<typeof ChatAttachment>
