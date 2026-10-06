// Owns: Ask AI (SPEC §8) on the web — the AI tab page (proposals waiting for a tap, then the chat) and the slide-up
// panel the shell offers on every other tab; both show the same thread. Reads/writes: GET/POST /api/ai/chat, GET
// /api/events, POST /api/proposals/:id/accept|reject, POST /api/templates, POST /api/week-plans/:id/apply.
import Drawer from '@mui/material/Drawer'
import { tokens } from '../../theme'
import { Chat } from './lib/Chat'
import { PendingProposals, usePendingProposals } from './lib/PendingProposals'

export { SUGGESTIONS } from './lib/Chat'

export function AskAiPage() {
  const pending = usePendingProposals()
  // Nothing waiting: no rail, so the thread takes the width instead of leaving a column-shaped gap beside it.
  return <Chat variant="page" aside={pending.length ? <PendingProposals /> : undefined} />
}

export interface AskAiPanelProps {
  open: boolean
  onClose: () => void
}

/** The chat as a sheet sliding up over the current tab. */
export function AskAiPanel({ open, onClose }: AskAiPanelProps) {
  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          // The paper carries role="dialog", so its name goes here (on the Drawer root it names nothing).
          'aria-label': 'Ask AI',
          'data-testid': 'ask-ai-panel',
          sx: {
            height: 'calc(100dvh - 48px - env(safe-area-inset-top, 0px))',
            maxWidth: 640,
            mx: 'auto',
            borderTopLeftRadius: tokens.radius.card,
            borderTopRightRadius: tokens.radius.card,
            boxShadow: 'none',
            borderTop: `1px solid ${tokens.ink.border}`,
            bgcolor: tokens.ink.page,
          },
        } as object,
      }}
    >
      <Chat variant="panel" onClose={onClose} />
    </Drawer>
  )
}
