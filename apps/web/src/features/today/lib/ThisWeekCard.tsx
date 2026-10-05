// Owns: the "This week" card on Today — a Monday–Sunday strip (training days, fasts, a scan date, today ringed), the
// week plan's focus note when one is active (phase 4), today's targets and today's training (done, planned or rest).
// Without a week plan it reads the day's materialised targets and the training days from settings.
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import { addDays, eachDate, weekdayOf, weekStart } from '@fitness/shared/engine'
import type { DayView, LocalDate, Weekday, WeekPlan, WeekPlanAuthor } from '@fitness/shared/schemas'
import { formatNumber, formatWeekday } from '../../../components'
import { tokens } from '../../../theme'

const AUTHOR: Record<WeekPlanAuthor, string> = { claude_mcp: 'planned with the Coach', gemini: 'AI draft', user: 'your plan' }

interface ThisWeekCardProps {
  date: LocalDate
  day: DayView | undefined
  weekPlan: WeekPlan | null
  trainingDays: readonly Weekday[] | null
}

interface StripDay {
  date: LocalDate
  training: boolean
  fast: boolean
  scan: boolean
}

function weekStrip(date: LocalDate, day: DayView | undefined, weekPlan: WeekPlan | null, trainingDays: readonly Weekday[] | null): StripDay[] {
  const monday = weekStart(date)
  return eachDate(monday, addDays(monday, 6)).map((d) => {
    const wd = weekdayOf(d)
    // Today's materialised targets know best (a fast day drops training); other days: week plan, else settings.
    const training =
      d === date && day?.targets
        ? day.targets.training_planned
        : weekPlan
          ? weekPlan.plan.sessions[wd] !== null
          : (trainingDays?.includes(wd) ?? false)
    const fastToday = d === date && (day?.fast.is_fast_day === true || day?.targets?.is_fast_day === true)
    return { date: d, training, fast: fastToday || (weekPlan?.plan.fast_dates.includes(d) ?? false), scan: weekPlan?.plan.scan_date === d }
  })
}

function trainingLine(date: LocalDate, day: DayView | undefined, weekPlan: WeekPlan | null, strip: StripDay[]): string {
  const s = day?.session
  if (s) {
    const what = `${s.template_name ?? 'Session'} · ${s.sets_done} sets · ${formatNumber(s.volume_kg)} kg`
    return s.ended_at ? `Done: ${what}` : `In progress: ${what}`
  }
  const planned = day?.planned_session ?? weekPlan?.plan.sessions[weekdayOf(date)] ?? null
  if (planned) return `${planned.name} · ${planned.exercises.length} exercises`
  const training = day?.targets ? day.targets.training_planned : (strip.find((d) => d.date === date)?.training ?? false)
  return training ? 'Training day' : 'Rest day'
}

function Target({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ fontSize: 12, fontWeight: tokens.font.weight.label, color: tokens.ink.secondary }}>{label}</Box>
      <Box sx={{ fontSize: 16, fontWeight: tokens.font.weight.heading, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {formatNumber(value)}
        {value !== null && unit && (
          <Box component="span" sx={{ ml: 0.75, fontSize: 12, fontWeight: tokens.font.weight.label, color: tokens.ink.secondary }}>
            {unit}
          </Box>
        )}
      </Box>
    </Box>
  )
}

export function ThisWeekCard({ date, day, weekPlan, trainingDays }: ThisWeekCardProps) {
  const strip = weekStrip(date, day, weekPlan, trainingDays)
  const fallback = weekPlan?.plan.targets[weekdayOf(date)] ?? null
  const t = day?.targets ?? null
  const fastDay = strip.find((d) => d.date === date)?.fast ?? false
  const source = weekPlan
    ? `Week of ${weekPlan.week_start} · ${AUTHOR[weekPlan.author]}`
    : `Week of ${weekStart(date)} · from your daily targets`

  return (
    <Card data-testid="this-week" sx={{ p: 4 }}>
      <Box component="h2" sx={{ m: 0, fontSize: 18, fontWeight: tokens.font.weight.heading }}>
        This week
      </Box>
      <Box sx={{ mt: 0.5, fontSize: 13, color: tokens.ink.secondary }}>{source}</Box>

      <Box
        component="ol"
        aria-label="This week's days"
        sx={{ listStyle: 'none', m: 0, mt: 3, p: 0, display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 1 }}
      >
        {strip.map((d) => {
          const isToday = d.date === date
          const marks = [d.training ? 'training' : null, d.fast ? 'fast' : null, d.scan ? 'scan' : null].filter(Boolean).join(', ')
          return (
            <Box
              component="li"
              key={d.date}
              aria-current={isToday ? 'date' : undefined}
              aria-label={`${d.date}${marks ? `: ${marks}` : ''}`}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 0.5,
                py: 1.5,
                borderRadius: `${tokens.radius.control}px`,
                border: `1.5px solid ${isToday ? tokens.ink.text : 'transparent'}`,
              }}
            >
              <Box sx={{ fontSize: 11, fontWeight: tokens.font.weight.label, color: tokens.ink.secondary }}>{formatWeekday(d.date)}</Box>
              <Box sx={{ fontSize: 15, fontWeight: isToday ? tokens.font.weight.number : tokens.font.weight.label, fontVariantNumeric: 'tabular-nums' }}>
                {Number(d.date.slice(8))}
              </Box>
              <Box sx={{ display: 'flex', gap: 0.5, height: 8 }} aria-hidden>
                {d.training && <Box sx={{ width: 6, height: 6, borderRadius: tokens.radius.chip, bgcolor: tokens.ink.text }} />}
                {d.fast && <Box sx={{ width: 6, height: 6, borderRadius: tokens.radius.chip, bgcolor: tokens.metric.fasting }} />}
                {d.scan && <Box sx={{ width: 6, height: 6, borderRadius: tokens.radius.chip, border: `1.5px solid ${tokens.metric.lean}` }} />}
              </Box>
            </Box>
          )
        })}
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, mt: 1.5, fontSize: 12, color: tokens.ink.secondary }}>
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 6, height: 6, borderRadius: tokens.radius.chip, bgcolor: tokens.ink.text }} /> Training
        </Box>
        {strip.some((d) => d.fast) && (
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 6, height: 6, borderRadius: tokens.radius.chip, bgcolor: tokens.metric.fasting }} /> Fast
          </Box>
        )}
        {strip.some((d) => d.scan) && (
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 6, height: 6, borderRadius: tokens.radius.chip, border: `1.5px solid ${tokens.metric.lean}` }} /> Scan
          </Box>
        )}
      </Box>

      {weekPlan?.plan.focus_note && (
        <Box sx={{ mt: 3, fontSize: 15, lineHeight: 1.5, color: tokens.ink.text }} data-testid="week-focus">
          {weekPlan.plan.focus_note}
        </Box>
      )}

      <Box sx={{ mt: 4, pt: 3, borderTop: `1px solid ${tokens.ink.border}` }}>
        <Box sx={{ fontSize: tokens.font.size.label, fontWeight: tokens.font.weight.label, color: tokens.ink.secondary }}>
          Today’s targets{fastDay ? ' · fast day' : ''}
        </Box>
        {t || fallback ? (
          <Box sx={{ mt: 2, display: 'grid', gap: 3, gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))' }}>
            <Target label="Calories" value={t?.kcal ?? fallback?.kcal ?? null} unit="kcal" />
            <Target label="Protein" value={t?.protein_g ?? fallback?.protein_g ?? null} unit="g" />
            <Target label="Carbs" value={t?.carbs_g ?? fallback?.carbs_g ?? null} unit="g" />
            <Target label="Fat" value={t?.fat_g ?? fallback?.fat_g ?? null} unit="g" />
            <Target label="Fibre" value={t?.fibre_g ?? fallback?.fibre_g ?? null} unit="g" />
            <Target label="Water" value={t?.water_ml ?? weekPlan?.plan.water_ml ?? null} unit="ml" />
            <Target label="Steps" value={t?.steps ?? weekPlan?.plan.steps ?? null} unit="" />
          </Box>
        ) : (
          <Box sx={{ mt: 1, fontSize: 14, color: tokens.ink.secondary }}>No targets for today yet; they come from the active plan.</Box>
        )}
      </Box>

      <Box sx={{ mt: 4 }}>
        <Box sx={{ fontSize: tokens.font.size.label, fontWeight: tokens.font.weight.label, color: tokens.ink.secondary }}>Training today</Box>
        <Box sx={{ mt: 1, fontSize: 16, fontWeight: tokens.font.weight.label }} data-testid="training-today">
          {trainingLine(date, day, weekPlan, strip)}
        </Box>
        {fastDay && <Box sx={{ mt: 0.5, fontSize: 13, color: tokens.ink.secondary }}>Fast day: keep any training light.</Box>}
      </Box>
    </Card>
  )
}
