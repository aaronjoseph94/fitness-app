// Owns: the public surface of the week plan in the web app (SPEC §8 "Next-week plan") — the "This week" card Today
// shows, the full week view on Progress (plan beside last week's actuals, planned vs eaten), and the week-view read.
// Both views offer Review → Accept for a proposed plan; the week view also reverts the active one.
// Second entry point: ./queries (the week view read's input).
export { WeekPlanCard, type WeekPlanCardProps } from './lib/WeekPlanCard'
export { WeekView, type WeekViewProps } from './lib/WeekView'
export { useWeekPlan } from './lib/useWeekPlan'
