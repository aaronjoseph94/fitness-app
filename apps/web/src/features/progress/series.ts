// Owns: the Progress module's second entry point — the pure series mappings other screens share with the Progress tab:
// weight (trend points, the forecast path to the goal, milestones, weekly loss), the day charts (calories, macros,
// water, steps, sleep), adherence calendars, the fasting strip, tape measurements and weekly training volume per muscle
// group. Today's hero chart, the Dashboard and the weekly report all use them, so every screen draws the same data the
// same way. Importing it never pulls in the page.
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
  proteinAdherence,
  loggingAdherence,
  fastEntries,
  waistPoints,
  VOLUME_GROUPS,
  groupVolume,
  volumeBetween,
  sessionVolumeWeeks,
  exercisesByUse,
  latestTargets,
  rangeSummary,
  hasAny,
  rangeDays,
  type RangeSummary,
} from './lib/series'
