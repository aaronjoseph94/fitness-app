// Owns: the small pieces every week-plan view shares — who wrote a plan, its status badge, a planned session's line
// and muscle-map thumbnail, and one row per day (date, targets or fast, session) derived from a plan.
import Box from '@mui/material/Box'
import { addDays, muscleLevels } from '@fitness/shared/engine'
import { Weekday, type WeekPlan, type WeekPlanAuthor, type WeekPlanSession } from '@fitness/shared/schemas'
import type { ReactNode } from 'react'
import { MuscleMap } from '../../../muscle-map'
import { tokens, withAlpha } from '../../../theme'

export const AUTHOR: Record<WeekPlanAuthor, string> = { claude_mcp: 'Claude', gemini: 'Gemini', user: 'you' }

/** "Active · by Claude" in status green, "Proposed · by Gemini" outlined. */
export function PlanBadge({ plan }: { plan: Pick<WeekPlan, 'status' | 'author'> }) {
  const active = plan.status === 'active'
  const label = `${plan.status === 'active' ? 'Active' : plan.status === 'proposed' ? 'Proposed' : 'Superseded'} · by ${AUTHOR[plan.author]}`
  return (
    <Box
      component="span"
      data-testid="week-plan-badge"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        px: 2,
        height: 24,
        borderRadius: `${tokens.radius.chip}px`,
        fontSize: 12,
        fontWeight: tokens.font.weight.label,
        whiteSpace: 'nowrap',
        color: active ? tokens.status.good : tokens.ink.secondary,
        bgcolor: active ? withAlpha(tokens.status.good, 0.1) : 'transparent',
        border: `1px solid ${active ? 'transparent' : tokens.ink.border}`,
      }}
    >
      {label}
    </Box>
  )
}

export function sessionSets(session: WeekPlanSession): number {
  return session.exercises.reduce((n, e) => n + e.sets, 0)
}

/** "4 exercises · 16 sets". */
export function sessionDetail(session: WeekPlanSession): string {
  const n = session.exercises.length
  return `${n} exercise${n === 1 ? '' : 's'} · ${sessionSets(session)} sets`
}

/** The session's muscle map from its muscle-score snapshot (96 px on Today, smaller in the week view). */
export function SessionThumb({ session, size }: { session: WeekPlanSession; size: number }) {
  return (
    <Box sx={{ flex: 'none', width: size }}>
      <MuscleMap levels={muscleLevels(session.muscle_scores ?? {})} size={size} title={`Muscles in ${session.name}`} />
    </Box>
  )
}

export interface PlanDayRow {
  date: string
  weekday: Weekday
  kcal: number
  protein_g: number
  fast: boolean
  scan: boolean
  session: WeekPlanSession | null
}

export function planDays(plan: WeekPlan): PlanDayRow[] {
  return Weekday.options.map((weekday, i) => {
    const date = addDays(plan.week_start, i)
    const t = plan.plan.targets[weekday]
    return {
      date,
      weekday,
      kcal: t.kcal,
      protein_g: t.protein_g,
      fast: plan.plan.fast_dates.includes(date),
      scan: plan.plan.scan_date === date,
      session: plan.plan.sessions[weekday],
    }
  })
}

/** Small grey label above a value. */
export function Label({ children }: { children: ReactNode }) {
  return <Box sx={{ fontSize: tokens.font.size.label, fontWeight: tokens.font.weight.label, color: tokens.ink.secondary }}>{children}</Box>
}
