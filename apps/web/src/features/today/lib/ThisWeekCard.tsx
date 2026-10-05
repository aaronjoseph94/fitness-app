// Owns: Today's "This week" slot — the week module's WeekPlanCard for today: the active week plan (status, author,
// focus note), the week strip, today's targets, today's session with its muscle map, what changed from last week, and
// Review → Accept for a proposed plan. Without a week plan it reads the day's targets and the settings' training days.
import type { DayView, LocalDate, Weekday, WeekPlan } from '@fitness/shared/schemas'
import { WeekPlanCard } from '../../week'

interface ThisWeekCardProps {
  date: LocalDate
  day: DayView | undefined
  /** The week's active plan; the card reads the full week view itself (this stays for the page's other readers). */
  weekPlan: WeekPlan | null
  trainingDays: readonly Weekday[] | null
}

export function ThisWeekCard({ date, day, trainingDays }: ThisWeekCardProps) {
  return <WeekPlanCard date={date} day={day} trainingDays={trainingDays} />
}
