// Owns: picking the tools one Ask AI turn offers the model (≈15, so the free models read fewer schemas): the core reads
// always, then the writes and reads of every area the message (and the previous question, for "yes, do that") talks
// about, in that order, capped at MAX_TOOLS. Only tools the policy allows are ever picked. Also: whether the user's own
// words ask to log something in an area (asksToLog), which a logging call needs before it applies.
import { allTools, type ToolArea, type ToolDefinition } from '../../tools'
import { accessOf, type Access } from './policy'

export const MAX_TOOLS = 16

/** Always offered: the day as Today shows it, any metric series, the plan, this week's plan. */
const CORE = ['get_today', 'query_metric', 'get_plan', 'get_week_plan']

/** When nothing specific is asked ("how am I doing?"): the trend and the latest weekly review too. */
const GENERAL = ['get_trend', 'get_weekly_review']

/** Words that bring an area's tools in. Matched case-insensitively against the message. */
const AREA_WORDS: ReadonlyArray<readonly [RegExp, readonly ToolArea[]]> = [
  [/\b(weigh\w*|weight|scale|kg|lbs?|pounds?|trend|lost|los[se]|loss|goal|finish|forecast)\b/, ['body']],
  [/\b(waist|hips?|neck|chest|thighs?|arms?|tape|measur\w*|cm)\b/, ['body']],
  [
    /\b(target\w*|plan|raise|lower|increase|decrease|reduce|bump|cut|adjust|change|more|less|propos\w*|version\w*|revert|undo|rails?|floor|ceiling|deficit|budget)\b/,
    ['plan'],
  ],
  [
    /\b(eat|ate|eaten|eating|meals?|food\w*|breakfast|lunch|dinner|snacks?|protein|carbs?|fat|fibre|fiber|kcal|calor\w*|macros?|had|log\w*)\b/,
    ['nutrition'],
  ],
  [/\b(water|drank|drink\w*|hydrat\w*|ml|litres?|liters?|glass(es)?|bottles?)\b|\d\s?l\b/, ['nutrition', 'plan']],
  [/\bfast(s|ed|ing)?\b/, ['fasting']],
  [/\b(sleep\w*|slept|bed|woke|wake|nap|steps?|walk\w*)\b/, ['health']],
  [
    /\b(work ?outs?|sessions?|gym|exercis\w*|sets?|reps?|lift\w*|bench|squat\w*|deadlift\w*|press|pull\w*|push\w*|legs?|upper|lower|back|shoulders?|biceps?|triceps?|glutes?|template\w*|muscles?|equipment|machines?|dumbbells?|barbells?|cables?|train\w*|swap\w*|deload|prs?|e?1rm|volume)\b/,
    ['training'],
  ],
  [
    /\b(weeks?|weekly|split|schedule|swap\w*|mon(day)?|tue(s(day)?)?|wed(nesday)?|thu(rs(day)?)?|fri(day)?|sat(urday)?|sun(day)?)\b/,
    ['week_plans'],
  ],
  [/\b(scans?|evolt|body fat|lean|visceral|muscle mass|segment\w*|composition)\b/, ['scans']],
  [/\b(remind\w*|notif\w*|alerts?|alarms?|push)\b/, ['reminders']],
  [/\b(review\w*|report\w*|summary|recap|progress|how am i doing|overall)\b/, ['reviews', 'coach']],
  [/\b(average\w*|avg|mean|total|history|month\w*|january|february|march|april|may|june|july|august|september|october|november|december)\b/, ['metrics']],
]

/**
 * Words (or any number) that report something to record rather than ask about it: "I weighed 94.2", "had 2 eggs",
 * "slept 7 h", "log my lunch", "ended my fast", "finished the workout", and a plain "yes" to a question the model asked.
 */
const LOG_INTENT =
  /\d|\b(log\w*|record\w*|add\w*|enter\w*|track\w*|save\w*|weighed|weigh-?in|ate|eaten|had|drank|drunk|slept|woke|walked|lifted|did|done|finish\w*|complet\w*|start\w*|end\w*|broke|break\w*|began|begin\w*|stop\w*|confirm\w*|yes|yep|yeah|yup|sure|ok(ay)?|go ahead|do it)\b/

/** A reply that only agrees ("yes", "ok, do it"): its area comes from the question before it. */
const AFFIRMATION = /^\W*(yes|yep|yeah|yup|sure|ok(ay)?|please|go ahead|do it|confirm\w*|correct|right)\b/i
const SHORT_REPLY = 80

/**
 * True when the user's own words ask to log something in `area`: the current message, or a short "yes …" with the
 * previous question, names the area (AREA_WORDS) and reports a value or a logging verb. Tool results never count, so
 * text from a food database or a note cannot trigger a write by itself.
 */
export function asksToLog(area: ToolArea, message: string, previousQuestion: string | null): boolean {
  const own = previousQuestion && message.length <= SHORT_REPLY && AFFIRMATION.test(message) ? `${message}\n${previousQuestion}` : message
  return areasOf([own]).has(area) && LOG_INTENT.test(own.toLowerCase())
}

export interface OfferedTool {
  tool: ToolDefinition
  access: Access
}

/** The areas `texts` talk about. */
export function areasOf(texts: readonly string[]): Set<ToolArea> {
  const areas = new Set<ToolArea>()
  for (const text of texts) {
    const t = text.toLowerCase()
    for (const [words, hits] of AREA_WORDS) if (words.test(t)) for (const a of hits) areas.add(a)
  }
  return areas
}

/** The tools to offer for this turn, by intent; `texts` = the new message first, then the previous question. */
export function selectTools(texts: readonly string[], autoApplySafe: boolean): OfferedTool[] {
  const areas = areasOf(texts)
  const allowed: OfferedTool[] = []
  for (const tool of allTools()) {
    const access = accessOf(tool, autoApplySafe)
    if (access) allowed.push({ tool, access })
  }
  const byName = new Map(allowed.map((o) => [o.tool.name, o]))
  const picked = new Map<string, OfferedTool>()
  const add = (o: OfferedTool | undefined) => {
    if (o && picked.size < MAX_TOOLS) picked.set(o.tool.name, o)
  }

  for (const name of CORE) add(byName.get(name))
  if (areas.size === 0 || areas.has('reviews')) for (const name of GENERAL) add(byName.get(name))
  const inArea = allowed.filter((o) => areas.has(o.tool.area))
  for (const o of inArea) if (o.access !== 'read') add(o)
  for (const o of inArea) if (o.access === 'read') add(o)
  return [...picked.values()]
}
