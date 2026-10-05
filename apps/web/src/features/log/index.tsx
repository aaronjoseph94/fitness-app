// Owns: the Log tab (SPEC §6 weigh-ins, meals, water, fasting). Placeholder until the logging work package replaces it.
import { PhasePlaceholder } from '../../app/placeholder'

export function LogPage() {
  return (
    <PhasePlaceholder title="Log" phase={1}>
      Weigh-ins, meals by slot, water and fasts for the day.
    </PhasePlaceholder>
  )
}
