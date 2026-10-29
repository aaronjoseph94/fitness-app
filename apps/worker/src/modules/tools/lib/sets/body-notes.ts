// Owns: the body-note tools — get_body_notes, log_body_note, resolve_body_note (the body-notes module: how Aaron says
// his body feels; active notes steer generated workouts away from a sore area and lower volume when he is unwell).
import { today } from '@fitness/shared/engine'
import {
  BodyArea,
  BodyNote,
  BodyNoteCreate,
  BodyNoteKind,
  Id,
  LocalDate,
  Severity,
} from '@fitness/shared/schemas'
import * as z from 'zod'
import { activeBodyNotes, logBodyNote, resolveBodyNote } from '../../../body-notes'
import { defineTool, type ToolDefinition } from '../define'

/** What log_body_note returns: the note, and what a renewal replaced (null for a new note). */
const LoggedBodyNote = BodyNote.extend({
  before: BodyNote.pick({ date: true, severity: true, note: true })
    .nullable()
    .describe('A renewal: the date, severity and words the active note had before; null for a new note'),
})

export const BODY_NOTE_TOOLS: readonly ToolDefinition[] = [
  defineTool({
    name: 'get_body_notes',
    title: 'Get the active body notes',
    area: 'body_notes',
    description:
      'Body notes active today (a note stays active 7 days after its date unless resolved), newest first: area (a ' +
      'muscle key, a joint such as knee, or whole_body), kind (pain, soreness, energy, illness, mood), severity 1 mild ' +
      '– 3 severe, and his words. Generated workouts avoid loading a painful area and lower volume when he is ill or ' +
      'low on energy. Read-only.',
    input: z.object({}),
    output: z.array(BodyNote),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    run: (deps) => activeBodyNotes(deps),
  }),
  defineTool({
    name: 'log_body_note',
    title: 'Log a body note',
    area: 'body_notes',
    description:
      'Record how Aaron says his body feels on a day: a sore knee (area "knee", kind "pain"), tight hamstrings ' +
      '(soreness), low energy or a cold (area "whole_body", kind energy / illness), mood. Severity 1 mild (train ' +
      'around it), 2 moderate (keep it light), 3 severe (rest it). A note on the same area and kind that is already ' +
      'active is renewed (its date, severity and words updated; `before` says what it held) rather than duplicated. ' +
      'Active for 7 days. Use only for what Aaron says about his own body.',
    input: z.object({
      id: Id.optional().describe('A client id; replaying it returns the stored note'),
      date: LocalDate.optional().describe('YYYY-MM-DD in Edmonton; default today'),
      area: BodyArea.describe('A muscle key (e.g. "quadriceps"), a joint (e.g. "knee") or "whole_body"'),
      kind: BodyNoteKind,
      severity: Severity.describe('1 mild, 2 moderate, 3 severe'),
      note: BodyNoteCreate.shape.note.describe('His words, short (e.g. "knee\'s sore after leg day")'),
    }),
    output: LoggedBodyNote,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (deps, { id, date, ...rest }) =>
      logBodyNote(deps, { id: id ?? crypto.randomUUID(), date: date ?? today(deps.now()), ...rest }),
  }),
  defineTool({
    name: 'resolve_body_note',
    title: 'Resolve a body note',
    area: 'body_notes',
    description:
      'Mark a body note resolved (Aaron says the knee is fine now): from `resolved_on` (default today) it no longer ' +
      'steers workouts. resolved_on null re-opens it. `id` from get_body_notes.',
    input: z.object({
      id: Id,
      resolved_on: LocalDate.nullable().optional().describe('YYYY-MM-DD; default today; null re-opens it'),
    }),
    output: BodyNote,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (deps, { id, resolved_on }) =>
      resolveBodyNote(deps, id, { resolved_on: resolved_on === undefined ? today(deps.now()) : resolved_on }),
  }),
]
