// Owns: the Train tab's recent sessions — the last four weeks from the Worker plus sessions finished on this phone
// that haven't synced, newest first: day, name, ticked sets and volume (Σ reps × kg); tap for the summary or logger.
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Card from '@mui/material/Card'
import type { Template, WorkoutSession } from '@fitness/shared/schemas'
import { Link } from 'react-router'
import { formatNumber, formatShortDate, formatWeekday, PendingBadge } from '../../../components'
import { tokens } from '../../../theme'
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
  status: 'done' | 'open' | 'unsynced'
}

function fromServer(s: WorkoutSession, templates: readonly Template[] | undefined): Row {
  const done = s.sets.filter((x) => x.completed)
  return {
    id: s.id,
    date: s.date,
    name: templateName(templates, s.template_id) ?? ORIGIN_NAME[s.origin],
    sets: done.length,
    volume_kg: done.reduce((v, x) => v + (x.reps ?? 0) * (x.load_kg ?? 0), 0),
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
    status: 'unsynced',
  }
}

export interface RecentSessionsProps {
  sessions: readonly WorkoutSession[]
  unsynced: readonly LoggerSession[]
  templates: readonly Template[] | undefined
}

export function RecentSessions({ sessions, unsynced, templates }: RecentSessionsProps) {
  const rows = [...unsynced.map(fromCopy), ...sessions.map((s) => fromServer(s, templates))]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, SHOWN)
  return (
    <Card data-testid="recent-sessions">
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
            borderTop: i === 0 ? 'none' : `1px solid ${tokens.ink.border}`,
          }}
        >
          <Box sx={{ width: 52, flex: 'none', textAlign: 'center' }}>
            <Box sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.secondary, fontWeight: tokens.font.weight.label }}>
              {formatWeekday(r.date)}
            </Box>
            <Box sx={{ fontSize: tokens.font.size.emphasis, fontWeight: tokens.font.weight.heading, whiteSpace: 'nowrap' }}>
              {formatShortDate(r.date)}
            </Box>
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box
              sx={{
                fontSize: tokens.font.size.emphasis,
                fontWeight: tokens.font.weight.label,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {r.name}
            </Box>
            <Box sx={{ fontSize: tokens.font.size.label, color: tokens.ink.secondary, fontVariantNumeric: 'tabular-nums' }}>
              {r.sets} sets · {formatNumber(r.volume_kg)} kg
            </Box>
          </Box>
          {r.status === 'unsynced' && <PendingBadge label="Not synced" />}
          {r.status === 'open' && <PendingBadge label="Open" />}
          <ChevronRightRounded sx={{ color: tokens.ink.secondary }} aria-hidden />
        </ButtonBase>
      ))}
    </Card>
  )
}
