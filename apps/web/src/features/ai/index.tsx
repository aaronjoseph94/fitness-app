// Owns: Ask AI (SPEC §8) on the web — the AI tab page (2a: chats, the thread, proposals waiting for a tap) and the slide-up
// panel the shell offers on every other tab; both show the same thread. Reads/writes: GET/POST /api/ai/chat, GET
// /api/events, POST /api/proposals/:id/accept|reject, POST /api/templates, POST /api/week-plans/:id/apply.
import Drawer from '@mui/material/Drawer'
import { tokens } from '../../theme'
import { Chat } from './lib/Chat'
import { PendingProposals, usePendingProposals } from './lib/PendingProposals'

export { SUGGESTIONS } from './lib/Chat'

export function AskAiPage() {
  const pending = usePendingProposals()
  // Nothing waiting: a phone shows nothing above the thread, and a desktop's rail says so in one quiet line.
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
          // A sheet, not a bordered panel: the rounded top corners, the dimmed page behind it and the sheet's own
          // shadow are what separate it from the tab underneath, where a hairline would be a Material separator.
          // No grabber, because this panel has no drag: its header and its thread scroll as one subtree inside
          // `Chat`, so there is no region of the paper a gesture could own. The quick-log sheet, whose draggable
          // header is a direct child of its paper, is the one that drags away. See `useSheetDrag`.
          sx: {
            height: 'calc(100dvh - 48px - env(safe-area-inset-top, 0px))',
            maxWidth: 640,
            mx: 'auto',
            borderTopLeftRadius: tokens.radius.card,
            borderTopRightRadius: tokens.radius.card,
            bgcolor: tokens.ink.page,
          },
        } as object,
      }}
    >
      <Chat variant="panel" onClose={onClose} />
    </Drawer>
  )
}
