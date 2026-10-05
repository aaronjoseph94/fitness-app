// Owns: the Progress module's second entry point — the pure series mappings other screens share with the Progress tab:
// weight (trend points, the forecast path to the goal, milestones, weekly loss), the day charts (calories, macros,
// water, steps, sleep) and weekly training volume per muscle group (Today's hero chart and the weekly report use them,
// so both draw the same data the same way). Importing it never pulls in the page.
export {
  forecastPath,
  lastTrend,
  weightMilestones,
  weightPoints,
  weeklyLoss,
  milestoneTimelines,
  effectiveRate,
  caloriesDays,
  macrosDays,
  waterDays,
  stepsDays,
  sleepNights,
  VOLUME_GROUPS,
  groupVolume,
} from './lib/series'
