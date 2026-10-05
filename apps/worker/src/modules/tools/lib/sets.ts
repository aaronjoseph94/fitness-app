// Owns: the list of tool sets. Each area's tools live in lib/sets/<area>.ts and are added here (one import + one entry).
import type { ToolDefinition } from './define'
import { BODY_TOOLS } from './sets/body'
import { COACH_TOOLS } from './sets/coach'
import { DAY_TOOLS } from './sets/day'
import { FASTING_TOOLS } from './sets/fasting'
import { HEALTH_TOOLS } from './sets/health'
import { METRIC_TOOLS } from './sets/metrics'
import { NUTRITION_TOOLS } from './sets/nutrition'
import { PLAN_TOOLS } from './sets/plan'
import { REVIEW_TOOLS } from './sets/reviews'
import { SCAN_TOOLS } from './sets/scans'
import { TRAINING_TOOLS } from './sets/training'
import { WATER_TOOLS } from './sets/water'
import { WEEK_PLAN_TOOLS } from './sets/week-plans'

export const TOOL_SETS: ReadonlyArray<readonly ToolDefinition[]> = [
  DAY_TOOLS,
  BODY_TOOLS,
  PLAN_TOOLS,
  NUTRITION_TOOLS,
  FASTING_TOOLS,
  HEALTH_TOOLS,
  TRAINING_TOOLS,
  SCAN_TOOLS,
  REVIEW_TOOLS,
  METRIC_TOOLS,
  COACH_TOOLS,
  WEEK_PLAN_TOOLS,
  WATER_TOOLS,
]
