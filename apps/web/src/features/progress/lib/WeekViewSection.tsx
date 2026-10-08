// Owns: the Progress tab's "Week plan" slot — the week module's week view (2a: a table card titled with its own h2:
// the plan's days beside last week's actuals), opening on this week.
import Box from '@mui/material/Box'
import type { LocalDate } from '@fitness/shared/schemas'
import { WeekView } from '../../week'

export function WeekViewSection({ date }: { date: LocalDate }) {
  return (
    <Box data-testid="progress-week-plan">
      <WeekView date={date} />
    </Box>
  )
}
