// Owns: the pinned dashboard note on Today (set_dashboard_note, 1d) — the coach gradient card: the pin and "Coach note"
// as its eyebrow, who pinned it and until when on the right ("Claude · until Oct 11"), and the text at 17 px.
import PushPinRounded from '@mui/icons-material/PushPinRounded'
import Box from '@mui/material/Box'
import { localDate } from '@fitness/shared/engine'
import type { DashboardNote } from '@fitness/shared/schemas'
import { CoachCard, formatShortDate } from '../../../components'
import { tokens } from '../../../theme'
import { actorLabel } from '../../proposals'

/** The last day a note shows: `until` is the instant it stops (a midnight stops it at the end of the day before). */
const lastDay = (until: string) => localDate(new Date(Date.parse(until) - 1).toISOString())

export function CoachNote({ note }: { note: DashboardNote }) {
  const who = note.actor === 'mcp' ? 'Coach note' : `${actorLabel(note.actor)} note`
  // MCP reaches the app only from Aaron's own Claude chats, so the Coach is Claude.
  const by = note.actor === 'mcp' ? 'Claude' : actorLabel(note.actor)
  return (
    <CoachCard
      testId="coach-note"
      component="aside"
      ariaLabel={who}
      eyebrow={who}
      icon={<PushPinRounded aria-hidden sx={{ fontSize: 18, flex: 'none' }} />}
      aside={
        <>
          {by}
          {note.until && ` · until ${formatShortDate(lastDay(note.until))}`}
        </>
      }
    >
      <Box
        component="p"
        sx={{
          m: 0,
          fontSize: tokens.font.size.subtitle,
          lineHeight: 1.48,
          fontWeight: tokens.font.weight.body,
          whiteSpace: 'pre-line',
          overflowWrap: 'anywhere',
        }}
      >
        {note.text}
      </Box>
    </CoachCard>
  )
}
