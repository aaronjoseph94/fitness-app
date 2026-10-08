// Owns: the Train tab's recent sessions — the last four weeks from the Worker plus sessions finished on this phone
// that haven't synced, newest first: weekday and day, name, ticked sets, volume (Σ reps × kg) and duration, a PR chip;
// tap for the summary or logger — and the "This week" panel under them (sessions finished, volume and ticked sets since
// Monday). Also the one-line facts other cards quote: each template's newest finished session and this week's totals.
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import { weekStart } from '@fitness/shared/engine'
import type { Template, WorkoutSession } from '@fitness/shared/schemas'
import { Link } from 'react-router'
import {
  cardSurface,
  formatNumber,
  formatShortDate,
  formatWeekday,
  panelSurface,
  PendingBadge,
  StatusChip,
  visuallyHidden,
} from '../../../components'
import { tokens, transitionOf } from '../../../theme'
import { setCounts, type LoggerSession } from './logger-model'
import { sessionPath, templateName } from './session'

const SHOWN = 6

const ORIGIN_NAME = {
  template: 'Template session',
  ai: 'AI workout',
  blank: 'Workout',
  week_plan: 'Planned session',
} as const

interface Row {
  id: string
  date: string
  name: string
  sets: number
  volume_kg: number
  /** ended_at − started_at in whole minutes; null while the session is open. */
  minutes: number | null
  pr: boolean
  status: 'done' | 'open' | 'unsynced'
}

const minutesBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 60_000)

function fromServer(s: WorkoutSession, templates: readonly Template[] | undefined): Row {
  const done = s.sets.filter((x) => x.completed)
  return {
    id: s.id,
    date: s.date,
    name: templateName(templates, s.template_id) ?? ORIGIN_NAME[s.origin],
    sets: done.length,
    volume_kg: done.reduce((v, x) => v + (x.reps ?? 0) * (x.load_kg ?? 0), 0),
    minutes: s.ended_at ? minutesBetween(s.started_at, s.ended_at) : null,
    pr: (s.prs?.length ?? 0) > 0,
    status: s.ended_at ? 'done' : 'open',
  }
}

function fromCopy(s: LoggerSession): Row {
  const c = setCounts(s)
  return {
    id: s.id,
    date: s.date,
    name: s.name ?? ORIGIN_NAME[s.origin],
    sets: c.done,
    volume_kg: c.volume_kg,
    minutes: s.finished ? minutesBetween(s.started_at, s.finished.ended_at) : null,
    pr: (s.prs?.length ?? 0) > 0,
    status: 'unsynced',
  }
}

/** A finished session in one line: when, how much (Σ reps × kg over ticked sets) and how long. */
export interface SessionLine {
  date: string
  volume_kg: number
  minutes: number | null
}

/** The newest finished session of each template, keyed by template id. */
export function lastDoneByTemplate(sessions: readonly WorkoutSession[]): Map<string, SessionLine> {
  const last = new Map<string, SessionLine>()
  for (const s of sessions) {
    if (!s.template_id || !s.ended_at) continue
    const seen = last.get(s.template_id)
    if (seen && seen.date >= s.date) continue
    const { date, volume_kg, minutes } = fromServer(s, undefined)
    last.set(s.template_id, { date, volume_kg, minutes })
  }
  return last
}

/** "Wed, Sep 30" — the day a SessionLine names. */
export const sessionDay = (date: string) => `${formatWeekday(date)}, ${formatShortDate(date)}`

export interface WeekTotals {
  sessions: number
  sets: number
  volume_kg: number
}

/** Sessions finished from Monday to `date` (synced or not), their ticked sets and volume. */
export function weekTotals(
  sessions: readonly WorkoutSession[],
  unsynced: readonly LoggerSession[],
  date: string,
): WeekTotals {
  const monday = weekStart(date)
  const rows = [...unsynced.map(fromCopy), ...sessions.map((s) => fromServer(s, undefined))].filter(
    (r) => r.status !== 'open' && r.date >= monday && r.date <= date,
  )
  return {
    sessions: rows.length,
    sets: rows.reduce((n, r) => n + r.sets, 0),
    volume_kg: rows.reduce((v, r) => v + r.volume_kg, 0),
  }
}

function WeekStat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div>
      <Box component="dt" sx={{ fontSize: tokens.font.size.micro, lineHeight: tokens.font.leading.micro, color: tokens.ink.muted }}>
        {label}
      </Box>
      <Box
        component="dd"
        sx={{
          m: 0,
          fontSize: tokens.font.size.sectionTitle,
          fontWeight: tokens.font.weight.heading,
          lineHeight: 'normal',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
        {unit && (
          <Box component="span" sx={{ ml: '4px', fontSize: tokens.font.size.caption, fontWeight: tokens.font.weight.body, color: tokens.ink.muted }}>
            {unit}
          </Box>
        )}
      </Box>
    </div>
  )
}

export interface RecentSessionsProps {
  sessions: readonly WorkoutSession[]
  unsynced: readonly LoggerSession[]
  templates: readonly Template[] | undefined
  week: WeekTotals
}

export function RecentSessions({ sessions, unsynced, templates, week }: RecentSessionsProps) {
  const rows = [...unsynced.map(fromCopy), ...sessions.map((s) => fromServer(s, templates))]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, SHOWN)
  return (
    <>
      <Box data-testid="recent-sessions" sx={{ ...cardSurface, overflow: 'hidden' }}>
        {rows.map((r, i) => (
          <ButtonBase
            key={r.id}
            component={Link}
            to={sessionPath(r.id)}
            sx={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              px: 4,
              py: 3,
              justifyContent: 'flex-start',
              textAlign: 'left',
              fontSize: tokens.font.size.small,
              lineHeight: 'normal',
              color: tokens.ink.text,
              borderTop: i === 0 ? 'none' : `1px solid ${tokens.ink.hairline}`,
              transition: transitionOf('background-color', tokens.motion.duration.instant),
              '@media (hover: hover)': { '&:hover': { bgcolor: tokens.ink.panel } },
              // Flush in a card that clips its corners: draw the keyboard ring inside the row.
              '&.Mui-focusVisible': { outlineOffset: -2 },
            }}
          >
            <Box sx={{ width: 36, flex: 'none', textAlign: 'center', lineHeight: 1.1 }}>
              <Box aria-hidden sx={{ fontSize: tokens.font.size.micro, color: tokens.ink.muted, textTransform: 'uppercase' }}>
                {formatWeekday(r.date)}
              </Box>
              <Box aria-hidden sx={{ fontSize: tokens.font.size.itemTitle, fontWeight: tokens.font.weight.heading, fontVariantNumeric: 'tabular-nums' }}>
                {Number(r.date.slice(8, 10))}
              </Box>
              <Box component="span" sx={visuallyHidden}>
                {sessionDay(r.date)}
              </Box>
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box
                sx={{
                  fontWeight: tokens.font.weight.heading,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {r.name}
              </Box>
              <Box sx={{ color: tokens.ink.muted, fontVariantNumeric: 'tabular-nums' }}>
                {r.sets} set{r.sets === 1 ? '' : 's'} · {formatNumber(r.volume_kg)} kg
                {r.minutes !== null && ` · ${r.minutes} min`}
              </Box>
            </Box>
            {r.pr && <StatusChip tone="success" size="small" label="PR" />}
            {r.status === 'unsynced' && <PendingBadge label="Not synced" />}
            {r.status === 'open' && <PendingBadge label="Open" />}
            <ChevronRightRounded sx={{ fontSize: 18, color: tokens.ink.faint, flex: 'none' }} aria-hidden />
          </ButtonBase>
        ))}
      </Box>
      <Box component="section" aria-labelledby="this-week-title" sx={{ ...panelSurface, mt: 4, px: '18px', py: 4 }}>
        <Box
          component="h3"
          id="this-week-title"
          sx={{ m: 0, fontSize: tokens.font.size.small, fontWeight: tokens.font.weight.heading, lineHeight: 'normal' }}
        >
          This week
        </Box>
        <Box component="dl" sx={{ m: 0, mt: '10px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
          <WeekStat label="Sessions" value={String(week.sessions)} />
          <WeekStat label="Volume" value={formatNumber(week.volume_kg)} unit="kg" />
          <WeekStat label="Sets" value={String(week.sets)} />
        </Box>
      </Box>
    </>
  )
}
