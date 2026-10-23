// Owns: the app's climbing vocabulary (1d README §5 "Copy layer") in one place, so it can be turned off with one switch
// — base camp = the start weight and date, the summit = the goal, camps = the milestones, "the climb" = the plan. With
// `CLIMB` false every string falls back to the plain word ("start", "goal", "milestone", "the plan"). Screen copy that
// names any of these reads it from here, never types it inline. Words only: no numbers are formatted here beyond
// dropping them into the sentence the caller hands over already formatted ("1.5", "Nov 12").

/** The climbing vocabulary on (1d) or off (plain words). */
export const CLIMB = true

const pick = (climb: string, plain: string): string => (CLIMB ? climb : plain)

/** Upper-cases the first letter, for a word that opens a sentence or a label. */
const lead = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1)

const START = pick('base camp', 'start')
const GOAL = pick('summit', 'goal')
const MILESTONE = pick('camp', 'milestone')
const MILESTONES = pick('camps', 'milestones')
const PLAN = pick('the climb', 'the plan')

export const copy = {
  /** "base camp" / "start": the start weight and date. */
  startLabel: START,
  /** "Base camp" / "Start", opening a label. */
  StartLabel: lead(START),
  /** "summit" / "goal". */
  goalLabel: GOAL,
  /** "Summit" / "Goal". */
  GoalLabel: lead(GOAL),
  /** "camp" / "milestone". */
  milestoneLabel: MILESTONE,
  /** "camps" / "milestones". */
  milestonesLabel: MILESTONES,
  /** "the climb" / "the plan". */
  planLabel: PLAN,
  /** "The climb" / "The plan". */
  PlanLabel: lead(PLAN),

  /** Today's eyebrow: "Day 12 of the climb" / "Day 12 of the plan". */
  dayOfPlan: (day: number) => `Day ${day} of ${PLAN}`,
  /** "since base camp" / "since start" (after a signed change: "↓ 1.5 kg since base camp"). */
  sinceStart: pick('since base camp', 'since start'),
  /** "28.6 kg to the summit" / "28.6 kg to goal". */
  toGoal: (kg: string) => (CLIMB ? `${kg} kg to the summit` : `${kg} kg to goal`),
  /** "Next camp" / "Next milestone". */
  nextMilestone: lead(pick('next camp', 'next milestone')),
  /** "Next camp · 90 kg" / "Next milestone · 90 kg". */
  nextMilestoneAt: (kg: string) => `${lead(pick('next camp', 'next milestone'))} · ${kg} kg`,
  /** "Camp 1 · 90 kg" / "Milestone 1 · 90 kg". */
  milestoneAt: (index: number, kg: string) => `${lead(MILESTONE)} ${index} · ${kg} kg`,
  /** "Camps on the way" / "Milestones". */
  milestonesTitle: CLIMB ? 'Camps on the way' : 'Milestones',
  /** "Base camp · 95.1 kg" / "Start · 95.1 kg". */
  startAt: (kg: string) => `${lead(START)} · ${kg} kg`,
  /** "Summit · 65 kg" / "Goal · 65 kg". */
  goalAt: (kg: string) => `${lead(GOAL)} · ${kg} kg`,
  /** The base camp → summit bar's ends: "Base camp" … "Summit". */
  startToGoal: `${lead(START)} → ${lead(GOAL)}`,
  /** "The climb so far" / "The plan so far" (Progress). */
  planSoFar: `${lead(PLAN)} so far`,
  /** "Fat at the summit" / "Fat at goal" (Scans' dashed line). */
  fatAtGoal: CLIMB ? 'Fat at the summit' : 'Fat at goal',
  /** "Base camp week" / "First week". */
  startWeek: pick('Base camp week', 'First week'),
  /** The not-found page's title: "Off the trail" / "Nothing here". */
  lostTitle: pick('Off the trail', 'Nothing here'),
  /** The "you are here" marker on the route: "You · 93.6". */
  youAt: (kg: string) => `You · ${kg}`,
} as const
