// Owns: the public surface of the week plan in the web app (SPEC §8 "Next-week plan") — the full week view on Progress
// (the plan beside last week's actuals, planned vs eaten, Review → Accept of a proposed plan, revert of the active one),
// the pieces Today's "This week" card composes (ProposedBanner, PlanBadge), and the week-plan reads.
// Second entry point: ./queries (the week view read's input).
export { WeekView, type WeekViewProps } from './lib/WeekView'
export { useProposedWeekPlans, useWeekPlan } from './lib/useWeekPlan'
// The pieces Today's 2a "This week" card composes itself (Review → Accept of a proposed plan, the plan badge).
export { ProposedBanner } from './lib/ProposedBanner'
export { PlanBadge } from './lib/parts'
