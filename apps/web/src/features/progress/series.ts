// Owns: the Progress module's second entry point — the pure series mappings other screens share with the Progress tab:
// weight (trend points, the forecast path to the goal and its band, milestones, weekly loss, pace against the goal
// date), the day charts (calories, macros, water, steps, sleep), adherence calendars, the fasting strip, tape
// measurements and weekly training volume per muscle group. Today's hero chart, the Dashboard and the weekly report all
// use them, so every screen draws the same data the same way. Importing it never pulls in the page.
export {
  forecastPath,
  forecastBandPercent,
  lastTrend,
  weightMilestones,
  weightPoints,
  weeklyLoss,
  milestoneTimelines,
  milestoneList,
  type MilestoneItem,
  forecastRate,
  projectionOf,
  paceVersusPlan,
  type Pace,
  caloriesDays,
  macrosDays,
  waterDays,
  stepsDays,
  sleepNights,
  proteinAdherence,
  SLEEP_TARGET_H,
  fastEntries,
  waistPoints,
  VOLUME_GROUPS,
  groupVolume,
  volumeBetween,
  sessionVolumeWeeks,
  exercisesByUse,
  latestTargets,
  hasAny,
} from './lib/series'
export { plannedFasts, type PlannedFast } from './lib/planned-fasts'
