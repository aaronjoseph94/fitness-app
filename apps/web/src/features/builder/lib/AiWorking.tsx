// Owns: the waiting state of an AI workout job — what the AI is doing, and a calm note when the free tier is slow.
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import { tokens } from '../../../theme'

/** Waiting for the job: what the AI is doing, and a calm note when the free tier is slow. */
export function AiWorking({ slow }: { slow: boolean }) {
  return (
    <Stack spacing={3} sx={{ alignItems: 'center', textAlign: 'center', py: 10 }} data-testid="ai-working">
      <CircularProgress aria-label="Building the workout" />
      <Box sx={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.label }}>Building a balanced session…</Box>
      <Box sx={{ fontSize: tokens.font.size.small, color: tokens.ink.secondary, maxWidth: 300 }}>
        {slow ? 'Still working: the free AI tier can take a minute when busy.' : 'Only exercises from your allowed set, 12–28 sets, loads from your history.'}
      </Box>
    </Stack>
  )
}
