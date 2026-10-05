// Owns: the printable weekly report page /reports/week/:week (SPEC §8, §11 print). Placeholder until the reviews work
// package replaces it.
import { useParams } from 'react-router'
import { PhasePlaceholder } from '../../app/placeholder'

export function WeeklyReportPage() {
  const { week } = useParams()
  return (
    <PhasePlaceholder title={`Weekly report ${week ?? ''}`} phase={4}>
      Weight trend, intake, macros, water, steps, sleep, training volume, the review narrative and next week's plan.
    </PhasePlaceholder>
  )
}
