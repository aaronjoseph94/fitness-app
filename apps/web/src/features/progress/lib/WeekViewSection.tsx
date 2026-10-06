// Owns: the Progress tab's "Week plan" section — the week module's full week view (plan beside last week's actuals,
// planned vs eaten per weekday, sessions with mini muscle maps), opening on this week.
import Box from '@mui/material/Box'
import type { LocalDate } from '@fitness/shared/schemas'
import { SectionHeader } from '../../../components'
import { WeekView } from '../../week'

export function WeekViewSection({ date }: { date: LocalDate }) {
  return (
    <Box data-testid="progress-week-plan">
      <SectionHeader title="Week plan" subtitle="Targets and sessions beside last week's actuals" />
      <WeekView date={date} />
    </Box>
  )
}
