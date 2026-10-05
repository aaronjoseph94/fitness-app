// Owns: the pinned dashboard note at the top of Today (set_dashboard_note): who pinned it, the text, and until when.
import PushPinOutlined from '@mui/icons-material/PushPinOutlined'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import type { DashboardNote } from '@fitness/shared/schemas'
import { tokens } from '../../../theme'
import { actorLabel, whenLabel } from './event-view'

export function CoachNote({ note }: { note: DashboardNote }) {
  const who = note.actor === 'mcp' ? 'Coach note' : `${actorLabel(note.actor)} note`
  return (
    <Card data-testid="coach-note" component="aside" aria-label={who} sx={{ p: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <PushPinOutlined aria-hidden sx={{ fontSize: 16, color: tokens.ink.secondary }} />
        <Box sx={{ flex: 1, fontSize: tokens.font.size.label, fontWeight: tokens.font.weight.label, color: tokens.ink.secondary }}>
          {who}
        </Box>
        {note.until && (
          <Box sx={{ fontSize: 12, color: tokens.ink.secondary, whiteSpace: 'nowrap' }}>until {whenLabel(note.until).slice(0, 10)}</Box>
        )}
      </Box>
      <Box sx={{ mt: 2, fontSize: 16, lineHeight: 1.55, color: tokens.ink.text, whiteSpace: 'pre-line' }}>{note.text}</Box>
    </Card>
  )
}
