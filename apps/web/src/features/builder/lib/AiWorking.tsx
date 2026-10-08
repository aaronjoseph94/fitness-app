// Owns: the waiting state of an AI workout job — what the AI is doing, and a calm note when the free tier is slow — as
// a 2a `ink.panel` panel.
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import { panelSurface } from '../../../components'
import { tokens } from '../../../theme'

/** Waiting for the job: what the AI is doing, and a calm note when the free tier is slow. */
export function AiWorking({ slow }: { slow: boolean }) {
  return (
    <Stack spacing={2} sx={{ ...panelSurface, alignItems: 'center', textAlign: 'center', py: 10, px: `${tokens.pad.card.x}px` }} data-testid="ai-working">
      <CircularProgress size={28} aria-label="Building the workout" />
      <Box sx={{ pt: 1, fontSize: tokens.font.size.itemTitle, fontWeight: tokens.font.weight.heading, color: tokens.ink.text }}>Building a balanced session…</Box>
      <Box sx={{ fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.secondary, maxWidth: 320 }}>
        {slow ? 'Still working: the free AI tier can take a minute when busy.' : 'Only exercises from your allowed set, 12–28 sets, loads from your history.'}
      </Box>
    </Stack>
  )
}
