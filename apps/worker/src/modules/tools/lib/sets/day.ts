// Owns: the day tools — get_today, the one read that shows a whole local date the way Today does (the day module).
import { today } from '@fitness/shared/engine'
import { DayView, LocalDate } from '@fitness/shared/schemas'
import * as z from 'zod'
import { getDay } from '../../../day'
import { defineTool, type ToolDefinition } from '../define'

export const DAY_TOOLS: readonly ToolDefinition[] = [
  defineTool({
    name: 'get_today',
    title: 'Get a day',
    area: 'day',
    description:
      "Everything for one Edmonton date, exactly as the Today tab shows it: the day's daily targets, intake (total and by meal slot), remaining kcal and macros, water, steps, last night's sleep, fast state (fast day or not), raw and trend weight with the 7-day trend change, the forecast, the session done and the session planned by the week plan, pending proposals, and the dashboard note. Call it first when Aaron asks about today or a specific day. Read-only.",
    input: z.object({ date: LocalDate.optional().describe('YYYY-MM-DD in Edmonton; default today') }),
    output: DayView,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    run: (deps, { date }) => getDay(deps, date ?? today(deps.now())),
  }),
]
