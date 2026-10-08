// Owns: the pinned dashboard note on Today (set_dashboard_note, 2a): the pin, "Coach note", who pinned it and until
// when ("Claude · until Oct 11"), and the text.
import PushPinOutlined from '@mui/icons-material/PushPinOutlined'
import Box from '@mui/material/Box'
import { localDate } from '@fitness/shared/engine'
import type { DashboardNote } from '@fitness/shared/schemas'
import { formatShortDate, Panel } from '../../../components'
import { tokens } from '../../../theme'
import { actorLabel } from './event-view'

/** The last day a note shows: `until` is the instant it stops (a midnight stops it at the end of the day before). */
const lastDay = (until: string) => localDate(new Date(Date.parse(until) - 1).toISOString())

export function CoachNote({ note }: { note: DashboardNote }) {
  const who = note.actor === 'mcp' ? 'Coach note' : `${actorLabel(note.actor)} note`
  // MCP reaches the app only from Aaron's own Claude chats, so the Coach is Claude.
  const by = note.actor === 'mcp' ? 'Claude' : actorLabel(note.actor)
  return (
    <Panel testId="coach-note" component="aside" ariaLabel={who} padding="dense">
      <Box sx={{ display: 'flex', gap: 3 }}>
        <PushPinOutlined aria-hidden sx={{ fontSize: 18, color: tokens.ink.text, mt: '1px', flex: 'none' }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
            <Box sx={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.heading, color: tokens.ink.text }}>{who}</Box>
            <Box sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.muted, whiteSpace: 'nowrap' }}>
              {by}
              {note.until && ` · until ${formatShortDate(lastDay(note.until))}`}
            </Box>
          </Box>
          <Box sx={{ mt: '6px', fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.emphasis, color: tokens.ink.body, whiteSpace: 'pre-line' }}>
            {note.text}
          </Box>
        </Box>
      </Box>
    </Panel>
  )
}
