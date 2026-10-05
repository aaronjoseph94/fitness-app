// Owns: the reminder tools — set_reminder_time (the reminders module): move a clock reminder (weigh-in, workout, scan
// due) to a new Edmonton time. A safe-list change: guarded, then applied at once or left as a proposal for a tap.
import { ClockReminder, LocalTime, ReminderPrefs } from '@fitness/shared/schemas'
import * as z from 'zod'
import { setReminderTime } from '../../../reminders'
import { defineTool, safeChangeOutput, type ToolDefinition } from '../define'

export const REMINDER_TOOLS: readonly ToolDefinition[] = [
  defineTool({
    name: 'set_reminder_time',
    title: 'Set a reminder time',
    description:
      'Move a push reminder to a new time of day (Edmonton): the weigh-in reminder (default 07:00), the workout ' +
      'reminder on training days (16:30) or the scan-due reminder (09:00). Reminders only fire between 07:00 and 22:00. ' +
      'A safe-list change: from Claude it applies at once once agreed in chat; from the in-app assistant it applies at ' +
      'once only when auto-apply of safe changes is on in Settings, otherwise it waits as a proposal for a tap. ' +
      '`status` says which (applied, proposed or rejected).',
    area: 'reminders',
    input: z.object({
      kind: ClockReminder.describe('weigh_in, workout or scan_due'),
      time: LocalTime.describe('24-hour HH:MM, Edmonton time, from 07:00 to 21:59'),
    }),
    output: safeChangeOutput(ReminderPrefs),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (deps, input) => setReminderTime(deps, input),
  }),
]
