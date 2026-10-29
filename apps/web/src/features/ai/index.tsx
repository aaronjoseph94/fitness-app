// Owns: Ask AI (SPEC §8) on the web — the AI tab's page at /ai (1d: a compact sky hero naming the model that answers
// first, then chats, the thread, proposals waiting for a tap, recent Train changes with Undo) and the slide-up panel
// the shell opens from the ⌘K command palette on any other page; both show the same thread.
// The composer takes a dump or a question; the reply shows what was logged (each with Undo) and how the forecast moved.
// Reads/writes: GET/POST/DELETE /api/ai/chat, POST /api/ai/attachments, POST /api/ai/receipts/:id/undo, GET /api/events,
// POST /api/proposals/:id/accept|reject, POST /api/week-plans/:id/apply|reject, POST /api/train-changes/:id/revert; an
// attached photo goes through quick-log (a photo meal), scans (the sheet, name masked) or photos (saved privately).
import Box from '@mui/material/Box'
import Drawer from '@mui/material/Drawer'
import { PageHeader } from '../../components'
import { askAiCopy } from '../../copy/ask-ai'
import { minWidth, tokens } from '../../theme'
import { useModelChain, type ModelChain } from '../settings/models'
import { Chat } from './lib/Chat'
import { PendingProposals, usePendingProposals } from './lib/PendingProposals'

/**
 * The hero's eyebrow: what answers first, as Settings → AI has it ("Groq · free tier", "Claude Opus 5.5 · paid key").
 * A non-breaking space while the key statuses load keeps the line, so the title never moves when they arrive.
 */
function modelLine(chain: ModelChain | undefined): string {
  if (!chain) return '\u00a0'
  if (!chain.first) return 'No model key set yet'
  return `${chain.first} · ${chain.paid ? 'paid key' : 'free tier'}`
}

const NOTE = askAiCopy.pageNote
/**
 * 1d sets the hero's line right of the title, where it clears the sun disc only on a wide sky (from about 1,400 px);
 * narrower, it is the usual subtitle under the title, so it never sits on the disc.
 */
const NOTE_BESIDE = minWidth(1400)

export function AskAiPage() {
  const pending = usePendingProposals()
  const chain = useModelChain()
  return (
    <>
      <PageHeader
        variant="compact"
        eyebrow={modelLine(chain)}
        title="Ask AI"
        subtitle={
          <Box component="span" sx={{ [NOTE_BESIDE]: { display: 'none' } }}>
            {NOTE}
          </Box>
        }
        action={
          <Box
            sx={{
              display: 'none',
              [NOTE_BESIDE]: { display: 'block' },
              maxWidth: 420,
              pb: '6px',
              textAlign: 'right',
              fontSize: tokens.font.size.emphasis,
              fontWeight: tokens.font.weight.body,
              lineHeight: tokens.font.leading.small,
              color: tokens.summit.onSky.subtitle,
            }}
          >
            {NOTE}
          </Box>
        }
      />
      {/* Nothing waiting: a narrow page shows nothing for it, and a wide page's column says so in one quiet line. */}
      <Chat variant="page" aside={pending.length ? <PendingProposals /> : undefined} />
    </>
  )
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
            borderTopLeftRadius: `${tokens.radius.card}px`,
            borderTopRightRadius: `${tokens.radius.card}px`,
            bgcolor: tokens.ink.page,
          },
        } as object,
      }}
    >
      <Chat variant="panel" onClose={onClose} />
    </Drawer>
  )
}
