// Owns: the "This week" card on Today (SPEC §8) — the week's active plan (status, author, focus note), a Monday–Sunday
// strip (training days, fasts, scan date, today ringed), today's targets, today's session with its 96 px muscle map,
// what the plan changed from last week, and any proposed plan for this week or later with Review → Accept.
// Without a week plan it reads the day's materialised targets and the training days from settings.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import { addDays, eachDate, weekdayOf, weekStart } from '@fitness/shared/engine'
import type { DayView, LocalDate, Weekday, WeekPlan, WeekPlanSession } from '@fitness/shared/schemas'
import { useState } from 'react'
import { formatNumber, formatShortDate, formatWeekday } from '../../../components'
import { tokens } from '../../../theme'
import { Label, PlanBadge, sessionDetail, SessionThumb } from './parts'
import { ProposedBanner } from './ProposedBanner'
import { useProposedWeekPlans, useWeekPlan } from './useWeekPlan'

/** Lines of "what changed" shown before "and N more". */
const CHANGES_SHOWN = 4

export interface WeekPlanCardProps {
  date: LocalDate
  day: DayView | undefined
  trainingDays: readonly Weekday[] | null
}

interface StripDay {
  date: LocalDate
  training: boolean
  fast: boolean
  scan: boolean
}

function weekStrip(date: LocalDate, day: DayView | undefined, plan: WeekPlan | null, trainingDays: readonly Weekday[] | null): StripDay[] {
  const monday = weekStart(date)
  return eachDate(monday, addDays(monday, 6)).map((d) => {
    const wd = weekdayOf(d)
    // Today's materialised targets know best (a fast day drops training); other days: week plan, else settings.
    const training =
      d === date && day?.targets
        ? day.targets.training_planned
        : plan
          ? plan.plan.sessions[wd] !== null
          : (trainingDays?.includes(wd) ?? false)
    const fastToday = d === date && (day?.fast.is_fast_day === true || day?.targets?.is_fast_day === true)
    return { date: d, training, fast: fastToday || (plan?.plan.fast_dates.includes(d) ?? false), scan: plan?.plan.scan_date === d }
  })
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

function Strip({ strip, date }: { strip: StripDay[]; date: LocalDate }) {
  return (
    <>
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
    </>
  )
}

/** Today's training: a finished or running session, else the planned one with its muscle map, else rest. */
function TrainingToday({ day, planned, training, fastDay }: { day: DayView | undefined; planned: WeekPlanSession | null; training: boolean; fastDay: boolean }) {
  const s = day?.session
  return (
    <Box sx={{ mt: 4 }}>
      <Label>Training today</Label>
      {s ? (
        <Box sx={{ mt: 1, fontSize: 16, fontWeight: tokens.font.weight.label }} data-testid="training-today">
          {s.ended_at ? 'Done' : 'In progress'}: {s.template_name ?? 'Session'} · {s.sets_done} sets · {formatNumber(s.volume_kg)} kg
        </Box>
      ) : planned ? (
        <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
          <SessionThumb session={planned} size={96} />
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ fontSize: 16, fontWeight: tokens.font.weight.heading, overflowWrap: 'anywhere' }} data-testid="training-today">
              {planned.name}
            </Box>
            <Box sx={{ mt: 0.5, fontSize: 13, color: tokens.ink.secondary }}>{sessionDetail(planned)}</Box>
            <Box sx={{ mt: 0.5, fontSize: 13, color: tokens.ink.secondary }}>Start it from the Train tab.</Box>
          </Box>
        </Box>
      ) : (
        <Box sx={{ mt: 1, fontSize: 16, fontWeight: tokens.font.weight.label }} data-testid="training-today">
          {training ? 'Training day' : 'Rest day'}
        </Box>
      )}
      {fastDay && <Box sx={{ mt: 0.5, fontSize: 13, color: tokens.ink.secondary }}>Fast day: keep any training light.</Box>}
    </Box>
  )
}

export function WeekPlanCard({ date, day, trainingDays }: WeekPlanCardProps) {
  const view = useWeekPlan(date)
  const proposed = useProposedWeekPlans(date)
  const plan = view.data?.active ?? null
  const strip = weekStrip(date, day, plan, trainingDays)
  const wd = weekdayOf(date)
  const fallback = plan?.plan.targets[wd] ?? null
  const t = day?.targets ?? null
  const fastDay = strip.find((d) => d.date === date)?.fast ?? false
  const planned = day?.planned_session ?? plan?.plan.sessions[wd] ?? null
  const training = day?.targets ? day.targets.training_planned : (strip.find((d) => d.date === date)?.training ?? false)
  const changes = view.data?.changes.active ?? []
  const [allChanges, setAllChanges] = useState(false)
  const monday = weekStart(date)
  const source = `${formatShortDate(monday)} – ${formatShortDate(addDays(monday, 6))}${plan ? '' : ' · from your daily targets'}`

  return (
    <Card data-testid="this-week" sx={{ p: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Box component="h2" sx={{ m: 0, fontSize: 18, fontWeight: tokens.font.weight.heading, flex: 1 }}>
          This week
        </Box>
        {plan && <PlanBadge plan={plan} />}
      </Box>
      <Box sx={{ mt: 0.5, fontSize: 13, color: tokens.ink.secondary }}>{source}</Box>

      <Strip strip={strip} date={date} />

      {plan?.plan.focus_note && (
        <Box sx={{ mt: 3, fontSize: 15, lineHeight: 1.5, color: tokens.ink.text }} data-testid="week-focus">
          {plan.plan.focus_note}
        </Box>
      )}

      {(proposed.data ?? []).slice(0, 2).map((p) => (
        <ProposedBanner key={p.id} plan={p} />
      ))}

      <Box sx={{ mt: 4, pt: 3, borderTop: `1px solid ${tokens.ink.border}` }}>
        <Label>Today’s targets{fastDay ? ' · fast day' : ''}</Label>
        {t || fallback ? (
          <Box sx={{ mt: 2, display: 'grid', gap: 3, gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))' }}>
            <Target label="Calories" value={t?.kcal ?? fallback?.kcal ?? null} unit="kcal" />
            <Target label="Protein" value={t?.protein_g ?? fallback?.protein_g ?? null} unit="g" />
            <Target label="Carbs" value={t?.carbs_g ?? fallback?.carbs_g ?? null} unit="g" />
            <Target label="Fat" value={t?.fat_g ?? fallback?.fat_g ?? null} unit="g" />
            <Target label="Fibre" value={t?.fibre_g ?? fallback?.fibre_g ?? null} unit="g" />
            <Target label="Water" value={t?.water_ml ?? plan?.plan.water_ml ?? null} unit="ml" />
            <Target label="Steps" value={t?.steps ?? plan?.plan.steps ?? null} unit="" />
          </Box>
        ) : (
          <Box sx={{ mt: 1, fontSize: 14, color: tokens.ink.secondary }}>No targets for today yet; they come from the active plan.</Box>
        )}
      </Box>

      <TrainingToday day={day} planned={planned} training={training} fastDay={fastDay} />

      {plan && (
        <Box sx={{ mt: 4 }} data-testid="week-changes">
          <Label>Changed from last week</Label>
          {changes.length === 0 ? (
            <Box sx={{ mt: 1, fontSize: 14, color: tokens.ink.secondary }}>Same targets and sessions as last week.</Box>
          ) : (
            <>
              <Box component="ul" sx={{ m: 0, mt: 1, pl: 4, fontSize: 14, lineHeight: 1.6 }}>
                {(allChanges ? changes : changes.slice(0, CHANGES_SHOWN)).map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </Box>
              {!allChanges && changes.length > CHANGES_SHOWN && (
                <Button size="small" onClick={() => setAllChanges(true)} sx={{ mt: 1, minHeight: tokens.tapTarget }}>
                  and {changes.length - CHANGES_SHOWN} more
                </Button>
              )}
            </>
          )}
        </Box>
      )}
    </Card>
  )
}
