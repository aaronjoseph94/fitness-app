// Owns: the Ask AI chat surface shared by the AI tab and the slide-up panel — the thread header (past chats, new
// chat, deleting a chat for good), the turns, the empty thread's note and starter chips, send and delete errors, and
// the composer. On a desktop page it is 2a's full-height three columns (chats rail from 1,280 px, the thread, the
// rail of proposals waiting for a tap); on a phone the composer sticks above the bottom tabs; in the panel the turns
// scroll inside the sheet.
import AddCommentOutlined from '@mui/icons-material/AddCommentOutlined'
import CloseRounded from '@mui/icons-material/CloseRounded'
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded'
import HistoryRounded from '@mui/icons-material/HistoryRounded'
import MoreHorizRounded from '@mui/icons-material/MoreHorizRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Skeleton from '@mui/material/Skeleton'
import Tooltip from '@mui/material/Tooltip'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Reveal } from '../../../components'
import { useOnline } from '../../../offline'
import { COARSE_POINTER_QUERY, scrollBehavior, tokens } from '../../../theme'
import { ChatsRail, shorten } from './ChatsRail'
import { Composer } from './Composer'
import { NothingWaiting, RailsCard } from './PendingProposals'
import { useThreadStore } from './thread-store'
import { AiTile, TurnView } from './TurnView'
import { useChat, useThreads, type Turn } from './useChat'
import { chatWhen } from './when'

export const SUGGESTIONS = [
  'What did I average for protein in September?',
  'Swap Thursday to a pull day',
  'Raise water to 3.5 L',
] as const

/** Where the page has room for 2a's three columns (thread ≥ 440 px beside the 240 px sidebar and both rails). */
const THREE_COLUMNS = '@media (min-width: 1280px)'
/** Below 2a's 1,440 px the one-line thread header gives the title the room: the meta's "reads …" part steps aside. */
const TIGHT_HEADER = '@media (max-width: 1439.95px)'

/**
 * A thread that scrolls on its own is a named, focusable region, so a keyboard alone can scroll back through replies
 * that hold nothing focusable (axe scrollable-region-focusable). Positioned, so the kit's visually hidden text inside
 * it is clipped with the rest instead of stretching the page.
 */
const scrollRegion = { tabIndex: 0, role: 'region', 'aria-label': 'Conversation history' } as const
const scrollRegionSx = {
  position: 'relative',
  '&:focus-visible': { outline: `${tokens.focusRing.width}px solid ${tokens.focusRing.color}`, outlineOffset: `-${tokens.focusRing.width}px` },
} as const

const READ_TOOL = /^(?:get|list|search)_/

/** The thread header's "reads today, favourites, plan": what the thread's lookup tools read, the first three named. */
function readsLine(turns: readonly Turn[]): string | null {
  const calls = turns.flatMap((t) => t.reply?.tool_calls ?? [])
  const names = [...new Set(calls.filter((c) => READ_TOOL.test(c.name)).map((c) => c.name.replace(READ_TOOL, '').replaceAll('_', ' ')))]
  if (names.length === 0) return null
  return `reads ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` +${names.length - 3}` : ''}`
}

/**
 * The thread header: the open chat's title and how many messages it holds, the past-chats menu (each row opens a chat
 * or deletes it for good) and new-chat. Deleting asks first, in a small dialog that names the chat it is about to
 * remove. Beside the chats rail (`rail`) it is 2a's one-line header: the menu is the "more" glyph and new-chat lives in
 * the rail.
 */
function ThreadHeader({
  title,
  meta,
  reads = null,
  rail = false,
  onClose,
  onDelete,
  deleting,
}: {
  title: string
  meta: string | null
  /** What the thread's lookups read ("reads today, favourites, plan"), after the meta. */
  reads?: string | null
  rail?: boolean
  onClose?: () => void
  /** Delete one chat, messages and all (the page's `useChat().remove`). */
  onDelete: (threadId: string) => void
  /** A delete is in flight, so the row buttons are disabled. */
  deleting: boolean
}) {
  const threads = useThreads()
  const { threadId, open, startNew } = useThreadStore()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  /** The chat the confirm is about: null while no confirm is on screen. */
  const [confirming, setConfirming] = useState<{ thread_id: string; label: string } | null>(null)
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: rail ? 'row' : 'column', alignItems: rail ? 'center' : 'stretch', gap: rail ? '10px' : '2px' }}>
        <Box
          component="h2"
          sx={{
            m: 0,
            flex: rail ? 1 : 'none',
            minWidth: 0,
            fontSize: tokens.font.size.itemTitle,
            fontWeight: tokens.font.weight.heading,
            lineHeight: tokens.font.leading.itemTitle,
            color: tokens.ink.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </Box>
        {meta && (
          <Box
            sx={{
              fontSize: tokens.font.size.caption,
              lineHeight: tokens.font.leading.caption,
              color: tokens.ink.muted,
              flex: 'none',
              ...(rail && { maxWidth: '50%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }),
            }}
          >
            {meta}
            {reads && (
              <Box component="span" sx={rail ? { [TIGHT_HEADER]: { display: 'none' } } : undefined}>
                {` · ${reads}`}
              </Box>
            )}
          </Box>
        )}
      </Box>
      <IconButton aria-label="Past chats" size={rail ? 'small' : 'medium'} onClick={(e) => setAnchor(e.currentTarget)}>
        {rail ? <MoreHorizRounded sx={{ fontSize: 18 }} /> : <HistoryRounded fontSize="small" />}
      </IconButton>
      {!rail && (
        <IconButton aria-label="New chat" onClick={startNew}>
          <AddCommentOutlined fontSize="small" />
        </IconButton>
      )}
      {onClose && (
        <IconButton aria-label="Close Ask AI" edge="end" onClick={onClose}>
          <CloseRounded fontSize="small" />
        </IconButton>
      )}
      <Menu
        anchorEl={anchor}
        open={anchor !== null}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 320, maxWidth: 'calc(100vw - 32px)', maxHeight: 420 } } }}
      >
        {threads.isPending && <MenuItem disabled>Loading past chats…</MenuItem>}
        {threads.data?.length === 0 && <MenuItem disabled>No past chats yet</MenuItem>}
        {threads.isError && <MenuItem disabled>Past chats need a connection</MenuItem>}
        {threads.data?.map((m) => (
          <MenuItem
            key={m.thread_id}
            selected={m.thread_id === threadId}
            onClick={() => {
              open(m.thread_id)
              setAnchor(null)
            }}
            sx={{ gap: 1, pr: 1 }}
          >
            <ListItemText
              primary={shorten(m.content, 60)}
              secondary={chatWhen(m.created_at)}
              slotProps={{ primary: { noWrap: true, sx: { fontSize: tokens.font.size.small, fontWeight: tokens.font.weight.label } }, secondary: { sx: { fontSize: tokens.font.size.caption } } }}
            />
            {/*
             * The row itself is "open this chat"; delete is its own button inside the row, with the chat's opening
             * words in its accessible name so a screen reader hears which one it would remove. Opening the confirm
             * closes the menu, so only one popover layer is ever on screen.
             */}
            <Tooltip title="Delete chat">
              <IconButton
                aria-label={`Delete chat: ${shorten(m.content, 40)}`}
                data-testid="chat-delete"
                size="small"
                disabled={deleting}
                onClick={(event) => {
                  event.stopPropagation()
                  setAnchor(null)
                  setConfirming({ thread_id: m.thread_id, label: shorten(m.content, 80) })
                }}
                sx={{ flex: 'none' }}
              >
                <DeleteOutlineRounded sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          </MenuItem>
        ))}
      </Menu>
      <Dialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        fullWidth
        maxWidth="xs"
        aria-labelledby="delete-chat-title"
      >
        <DialogTitle id="delete-chat-title">Delete this chat?</DialogTitle>
        <DialogContent sx={{ color: 'text.secondary' }}>
          {confirming ? `“${confirming.label}” and every message in it go for good. Logs you asked for are already saved.` : ''}
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setConfirming(null)}>
            Keep it
          </Button>
          <Button
            color="error"
            variant="contained"
            data-testid="chat-delete-confirm"
            onClick={() => {
              if (!confirming) return
              onDelete(confirming.thread_id)
              setConfirming(null)
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

/** An empty thread opens with the AI's note on what it can do, beside its sparkle tile like a reply. */
function Intro() {
  return (
    <Box sx={{ display: 'flex', gap: '12px', maxWidth: 720 }}>
      <AiTile />
      <Box sx={{ fontSize: tokens.font.size.body, lineHeight: tokens.font.leading.emphasis, color: tokens.ink.text }}>
        Ask about anything you have logged, or ask for a change. Logs you mention are saved; plan changes come back as a card you
        accept with one tap.
      </Box>
    </Box>
  )
}

/** 2a's starter chips above the composer: 30 px outline pills (44 px on touch); a tap sends that question. */
function Starters({ onPick, disabled }: { onPick: (text: string) => void; disabled: boolean }) {
  return (
    <Box data-testid="ask-ai-suggestions" sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px', mb: '10px' }}>
      {SUGGESTIONS.map((s) => (
        <Chip
          key={s}
          label={s}
          variant="outlined"
          disabled={disabled}
          onClick={() => onPick(s)}
          sx={{
            minHeight: 30,
            px: '12px',
            borderRadius: `${tokens.radius.pill}px`,
            fontSize: tokens.font.size.small,
            color: tokens.ink.text,
            '& .MuiChip-label': { whiteSpace: 'normal' },
            [COARSE_POINTER_QUERY]: { minHeight: tokens.tapTarget },
          }}
        />
      ))}
    </Box>
  )
}

export interface ChatProps {
  variant: 'page' | 'panel'
  onClose?: () => void
  /** Page only: the proposals waiting for a tap — the right-hand rail on a desktop, above the turns on a phone. */
  aside?: ReactNode
}

export function Chat({ variant, onClose, aside }: ChatProps) {
  const chat = useChat()
  const online = useOnline()
  const theme = useTheme()
  // Read before the panel's early return so the hook order never changes (rules of hooks).
  const desktop = useMediaQuery(theme.breakpoints.up('md'))
  const wide = useMediaQuery(THREE_COLUMNS)
  const [text, setText] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const lastKey = chat.turns.at(-1)?.key
  const replied = chat.turns.at(-1)?.reply?.id

  useEffect(() => {
    if (chat.failedText) setText((t) => t || chat.failedText!)
  }, [chat.failedText])

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end', behavior: lastKey ? scrollBehavior() : 'auto' })
  }, [lastKey, replied, chat.threadId])

  const send = (value: string) => {
    if (chat.send(value)) setText('')
  }
  const title = chat.turns.find((t) => t.question.content)?.question.content
  const empty = !chat.loading && chat.turns.length === 0
  const count = chat.turns.reduce((n, t) => n + (t.question.content ? 1 : 0) + (t.reply ? 1 : 0), 0)
  const page = variant === 'page' && desktop
  // An empty thread says what the AI may do, unless the chats rail's card beside it already does.
  const meta =
    count > 0
      ? `${count} ${count === 1 ? 'message' : 'messages'}`
      : page && wide
        ? null
        : 'Numbers come from your data; changes wait for your tap.'
  const reads = count > 0 ? readsLine(chat.turns) : null
  // The phone's composer sticks above the bottom tabs, so the end of the thread scrolls clear of both.
  const phonePage = variant === 'page' && !desktop
  const dock = useRef<HTMLDivElement>(null)
  // While the phone's dock is up it is part of the bottom chrome, like the rest timer: the page's bottom scroll padding
  // grows to clear it, so a proposal's Accept / Reject / Plan history never takes focus behind it (WCAG 2.4.11).
  // `bottom` is the dock's sticky offset above the tabs.
  useLayoutEffect(() => {
    const el = dock.current
    if (!phonePage || !el) return
    const root = document.documentElement
    const fit = () => {
      const clear = parseFloat(getComputedStyle(el).bottom) + el.offsetHeight + tokens.space(3)
      root.style.scrollPaddingBottom = `max(calc(${tokens.layout.scrollPadding.bottom}px + env(safe-area-inset-bottom, 0px)), ${clear}px)`
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => {
      observer.disconnect()
      root.style.removeProperty('scroll-padding-bottom')
    }
  }, [phonePage])

  const turnList = (
    <>
      {chat.loading && (
        <Box sx={{ display: 'grid', gap: '18px' }}>
          <Skeleton variant="rounded" height={44} sx={{ width: '60%', justifySelf: 'end' }} />
          <Skeleton variant="rounded" height={72} />
        </Box>
      )}
      {chat.loadError && <Alert severity="warning">{chat.loadError}</Alert>}
      {empty && <Intro />}
      {/* A log region: screen readers announce each new question and reply as it arrives (WCAG 4.1.3). */}
      <Box role="log" aria-live="polite" aria-label="Conversation">
        <Box component="ol" data-testid="ask-ai-turns" sx={{ m: 0, p: 0, display: 'grid', gap: '18px' }}>
          {chat.turns.map((t) => (
            <TurnView key={t.key} turn={t} />
          ))}
        </Box>
      </Box>
      {chat.error && (
        <Alert severity="error" onClose={chat.clearError}>
          {chat.error}
        </Alert>
      )}
      <Box ref={end} sx={{ scrollMarginBottom: phonePage ? 180 : 16 }} />
    </>
  )
  const composer = (
    <>
      {/* A desktop page always offers the starters (2a); a phone and the panel only on an empty thread. */}
      {(empty || page) && <Starters onPick={send} disabled={!online || chat.sending} />}
      <Composer value={text} onChange={setText} onSend={() => send(text)} sending={chat.sending} online={online} autoFocus={variant === 'panel'} />
    </>
  )
  /** The turns, bottom-aligned in their scroll area as a chat reads (2a: 18 px apart). */
  const turns = <Box sx={{ mt: 'auto', display: 'grid', gap: '18px' }}>{turnList}</Box>

  if (variant === 'panel')
    return (
      <Box data-testid="ask-ai-chat" sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <Box sx={{ px: 4, py: '12px', borderBottom: `1px solid ${tokens.ink.border}` }}>
          <ThreadHeader title={title ? shorten(title, 80) : 'Ask AI'} meta={meta} reads={reads} onClose={onClose} onDelete={chat.remove} deleting={chat.deleting} />
        </Box>
        <Box {...scrollRegion} sx={{ ...scrollRegionSx, flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', px: 4, py: '20px', display: 'flex', flexDirection: 'column' }}>
          {turns}
        </Box>
        <Box sx={{ px: 4, pt: '12px', pb: 'calc(12px + env(safe-area-inset-bottom, 0px))', borderTop: `1px solid ${tokens.ink.border}` }}>{composer}</Box>
      </Box>
    )

  if (page) {
    const pad = tokens.layout.mainPadding
    return (
      // 2a's Ask AI fills the window under the header: the page cancels `main`'s padding and the thread scrolls on
      // its own, so the rails and the composer stay put. Three columns from 1,280 px; below that the chats rail gives
      // way to the past-chats menu so the thread keeps a readable width beside the 340 px rail.
      <Box
        sx={{
          mx: `-${pad.x}px`,
          mt: `-${pad.top}px`,
          mb: `-${pad.bottom}px`,
          height: `calc(100dvh - ${tokens.layout.headerHeight}px)`,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 340px',
          [THREE_COLUMNS]: { gridTemplateColumns: '260px minmax(0, 1fr) 340px' },
          // Past 2a's 1,440 px the content column is centred with room either side: close the block's edges.
          '@media (min-width: 1500px)': { borderLeft: `1px solid ${tokens.ink.border}`, borderRight: `1px solid ${tokens.ink.border}` },
        }}
      >
        {wide && <ChatsRail />}
        <Box component="section" aria-label="Thread" data-testid="ask-ai-chat" sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          <Box sx={{ px: '24px', py: '12px', borderBottom: `1px solid ${tokens.ink.border}` }}>
            <ThreadHeader title={title ? shorten(title, 80) : 'New chat'} meta={meta} reads={reads} rail={wide} onDelete={chat.remove} deleting={chat.deleting} />
          </Box>
          <Box {...scrollRegion} sx={{ ...scrollRegionSx, flex: 1, minHeight: 0, overflowY: 'auto', px: '24px', py: '20px', display: 'flex', flexDirection: 'column' }}>
            {turns}
          </Box>
          <Box sx={{ px: '24px', pb: '20px' }}>{composer}</Box>
        </Box>
        <Box
          component="aside"
          aria-label="Proposals and rails"
          sx={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '16px', p: '20px', borderLeft: `1px solid ${tokens.ink.border}`, minHeight: 0, overflowY: 'auto' }}
        >
          {aside ?? <NothingWaiting />}
          <Box sx={{ flex: 1 }} />
          <Reveal delay={300}>
            <RailsCard />
          </Reveal>
        </Box>
      </Box>
    )
  }

  // A phone: the header, what waits for a tap, the turns, and the composer pinned above the bottom tabs.
  return (
    <Box
      data-testid="ask-ai-chat"
      sx={{ display: 'flex', flexDirection: 'column', gap: 4, minHeight: 'calc(100dvh - 200px)', width: '100%', maxWidth: 760, mx: 'auto' }}
    >
      <ThreadHeader title={title ? shorten(title, 80) : 'New chat'} meta={meta} reads={reads} onDelete={chat.remove} deleting={chat.deleting} />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {aside}
        {turns}
      </Box>
      <Box
        ref={dock}
        sx={{
          position: 'sticky',
          bottom: `calc(${tokens.layout.bottomNavHeight + tokens.space(3)}px + env(safe-area-inset-bottom, 0px))`,
          zIndex: 1,
          pt: 2,
          bgcolor: 'background.default',
        }}
      >
        {composer}
      </Box>
    </Box>
  )
}
