// Owns: the Dashboard's right-hand rail — the one panel that answers "where am I against the plan" without reading a
// chart: the three weight anchors (start, now, goal), one big ring for how much of the goal is behind him, the latest
// day's targets as a short ring list, and a footer row of the window's countable facts. Everything on it is derived
// from the same window the sections below draw, so the rail can never disagree with them.
import BedtimeRounded from '@mui/icons-material/BedtimeRounded'
import DirectionsWalkRounded from '@mui/icons-material/DirectionsWalkRounded'
import EggAltRounded from '@mui/icons-material/EggAltRounded'
import FlagRounded from '@mui/icons-material/FlagRounded'
import LocalFireDepartmentRounded from '@mui/icons-material/LocalFireDepartmentRounded'
import WaterDropRounded from '@mui/icons-material/WaterDropRounded'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import Divider from '@mui/material/Divider'
import type { SvgIconComponent } from '@mui/icons-material'
import { dayAdherence } from '@fitness/shared/engine'
import type { DaySummary, TargetValues } from '@fitness/shared/schemas'
import { formatNumber, MetricRing } from '../../../components'
import { tokens, type MetricKey } from '../../../theme'
import { lastTrend } from '../../progress/series'
import type { DashboardData } from './useDashboardData'

/** SPEC §9 readiness compares sleep with 7.5 h; used only when the day carries no target. */
const SLEEP_TARGET_H = 7.5

/** The most recent day that carries a target: fast days have none by design, so they are skipped. */
function latestTargetDay(days: readonly DaySummary[]): DaySummary | null {
  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i]
    if (day?.targets && !day.is_fast_day) return day
  }
  return null
}

interface GoalRow {
  key: string
  label: string
  icon: SvgIconComponent
  metric: MetricKey
  value: number
  target: number
  unit: string
}

/** The latest day's targets as rows: value, target and the share of it reached. Pure. */
export function goalRows(day: DaySummary | null, waterTargetMl: number): GoalRow[] {
  const targets: TargetValues | null = day?.targets ?? null
  if (!day || !targets) return []
  const rows: GoalRow[] = [
    { key: 'kcal', label: 'Calories', icon: LocalFireDepartmentRounded, metric: 'calories', value: Math.round(day.intake.kcal), target: targets.kcal, unit: 'kcal' },
    { key: 'protein', label: 'Protein', icon: EggAltRounded, metric: 'protein', value: Math.round(day.intake.protein_g), target: targets.protein_g, unit: 'g' },
    { key: 'water', label: 'Water', icon: WaterDropRounded, metric: 'water', value: day.water_ml, target: targets.water_ml || waterTargetMl, unit: 'ml' },
    { key: 'steps', label: 'Steps', icon: DirectionsWalkRounded, metric: 'steps', value: day.steps ?? 0, target: targets.steps, unit: 'steps' },
  ]
  const sleepH = day.sleep_min === null ? null : day.sleep_min / 60
  if (sleepH !== null) {
    rows.push({ key: 'sleep', label: 'Sleep', icon: BedtimeRounded, metric: 'sleep', value: sleepH, target: SLEEP_TARGET_H, unit: 'h' })
  }
  // A row with no target has nothing to sit against, so it is dropped rather than drawn as a full ring.
  return rows.filter((r) => r.target > 0)
}

/**
 * How much of the goal is behind him: kilograms moved from the start weight, out of the kilograms the whole goal
 * asks for. Null when the goal is not a loss, or when either anchor is missing — the rail then shows no ring rather
 * than a number that means nothing. Pure.
 */
export function goalProgress(startKg: number | null, nowKg: number | null, goalKg: number | null): number | null {
  if (startKg === null || nowKg === null || goalKg === null) return null
  const total = startKg - goalKg
  if (total <= 0) return null
  return Math.max(0, Math.min(1, (startKg - nowKg) / total))
}

function Anchor({ label, value, unit, testId }: { label: string; value: string; unit: string; testId: string }) {
  return (
    <Box data-testid={testId} sx={{ minWidth: 0 }}>
      <Box sx={{ fontSize: tokens.font.size.label, fontWeight: tokens.font.weight.label, color: tokens.ink.secondary }}>{label}</Box>
      <Box sx={{ mt: 0.5, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        <Box component="span" sx={{ fontSize: tokens.font.size.cardTitle, fontWeight: tokens.font.weight.number, color: tokens.ink.text, letterSpacing: -0.3 }}>
          {value}
        </Box>
        <Box component="span" sx={{ ml: 0.75, fontSize: tokens.font.size.label, fontWeight: tokens.font.weight.label, color: tokens.ink.secondary }}>
          {unit}
        </Box>
      </Box>
    </Box>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Box sx={{ fontSize: tokens.font.size.label, color: tokens.ink.secondary }}>{label}</Box>
      <Box sx={{ mt: 0.5, fontSize: tokens.font.size.cardTitle, fontWeight: tokens.font.weight.number, color: tokens.ink.text, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Box>
    </Box>
  )
}

export function GoalRail({ data }: { data: DashboardData }) {
  const profile = data.profile
  const nowKg = lastTrend(data.trend?.points ?? [])?.kg ?? null
  const startKg = profile?.start_weight_kg ?? null
  const goalKg = profile?.goal_weight_kg ?? null

  const day = latestTargetDay(data.days)
  const rows = goalRows(day, data.settings?.water_target_ml ?? 0)
  const progress = goalProgress(startKg, nowKg, goalKg)
  const percent = progress === null ? null : Math.round(progress * 100)
  const toGo = nowKg !== null && goalKg !== null ? Math.max(0, nowKg - goalKg) : null

  const logged = data.days.filter((d) => d.meals_logged > 0 || d.water_ml > 0).length
  const adherence = data.days.length
    ? Math.round((data.days.reduce((sum, d) => sum + dayAdherence(d).score, 0) / data.days.length) * 100)
    : 0
  const fasts = data.fasts.filter((f) => f.ended_at !== null).length

  return (
    <Card data-testid="dashboard-goal-rail" sx={{ p: 4, height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box
          aria-hidden
          sx={{
            width: 36,
            height: 36,
            flex: 'none',
            display: 'grid',
            placeItems: 'center',
            borderRadius: `${tokens.radius.control}px`,
            backgroundImage: `linear-gradient(135deg, ${tokens.accent.bright}, ${tokens.accent.main})`,
            color: tokens.ink.card,
          }}
        >
          <FlagRounded sx={{ fontSize: 20 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box component="h2" sx={{ m: 0, fontSize: tokens.font.size.cardTitle, fontWeight: tokens.font.weight.heading, color: tokens.ink.text }}>
            Your goals
          </Box>
          <Box sx={{ fontSize: tokens.font.size.label, color: tokens.ink.secondary }}>
            {goalKg === null ? 'Set a goal in Settings' : `Goal ${formatNumber(goalKg, 1)} kg`}
          </Box>
        </Box>
      </Box>

      <Box sx={{ mt: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
        {percent !== null && progress !== null && (
          <MetricRing
            label="Goal progress"
            metric="weight"
            size={104}
            value={Math.round(progress * 1000) / 10}
            target={100}
            unit="%"
            centre={`${percent}%`}
            centreCaption="of goal"
          />
        )}
        <Box sx={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 3 }}>
          <Anchor label="Start" value={formatNumber(startKg, 1)} unit="kg" testId="goal-start" />
          <Anchor label="Now" value={formatNumber(nowKg, 1)} unit="kg" testId="goal-now" />
          <Anchor label="To go" value={formatNumber(toGo, 1)} unit="kg" testId="goal-to-go" />
          <Anchor label="Logged" value={`${adherence}%`} unit="of days" testId="goal-adherence" />
        </Box>
      </Box>

      {rows.length > 0 && (
        <>
          <Divider sx={{ mt: 4, mb: 1 }} />
          <Box sx={{ fontSize: tokens.font.size.label, fontWeight: tokens.font.weight.label, color: tokens.ink.secondary, mt: 2 }}>
            Latest day · {day?.date}
          </Box>
          <Box sx={{ mt: 2 }}>
            {rows.map((row) => {
              const Icon = row.icon
              const ratio = row.value / row.target
              const pct = ratio >= 1 ? '100%' : `${Math.round(ratio * 100)}%`
              return (
                <Box key={row.key} data-testid={`goal-row-${row.key}`} sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5 }}>
                  <Box
                    aria-hidden
                    sx={{
                      width: 32,
                      height: 32,
                      flex: 'none',
                      display: 'grid',
                      placeItems: 'center',
                      borderRadius: `${tokens.radius.inner}px`,
                      bgcolor: tokens.ink.sunken,
                      color: tokens.metric[row.metric],
                    }}
                  >
                    <Icon sx={{ fontSize: 18 }} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ fontSize: tokens.font.size.small, fontWeight: tokens.font.weight.label, color: tokens.ink.text, whiteSpace: 'nowrap' }}>
                      {row.label}
                    </Box>
                    <Box sx={{ fontSize: tokens.font.size.label, color: tokens.ink.secondary, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {formatNumber(row.value, row.key === 'sleep' ? 1 : 0, row.key === 'steps')} /{' '}
                      {formatNumber(row.target, 0, row.key === 'steps')} {row.unit}
                    </Box>
                  </Box>
                  <MetricRing
                    label={row.label}
                    metric={row.metric}
                    size={48}
                    thickness={5}
                    value={row.value}
                    target={row.target}
                    unit={row.unit}
                    centre={pct}
                  />
                </Box>
              )
            })}
          </Box>
        </>
      )}

      <Divider sx={{ mt: 3, mb: 3 }} />
      <Box sx={{ display: 'flex', gap: 3 }}>
        <Fact label="Sessions" value={String(data.sessions.length)} />
        <Fact label="Fasts" value={String(fasts)} />
        <Fact label="Days logged" value={String(logged)} />
      </Box>
    </Card>
  )
}
