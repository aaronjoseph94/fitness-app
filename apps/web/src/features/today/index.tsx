// Owns: the Today tab (SPEC §6 dashboard). Placeholder until the Today work package replaces it.
import { PhasePlaceholder } from '../../app/placeholder'

export function TodayPage() {
  return (
    <PhasePlaceholder title="Today" phase={1}>
      Trend weight, today's rings, the weight trend with forecast, this week's plan and the latest AI note.
    </PhasePlaceholder>
  )
}
