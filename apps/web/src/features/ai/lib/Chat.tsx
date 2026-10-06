// Owns: the Ask AI chat surface shared by the AI tab and the slide-up panel — the thread header (past chats, new
// chat), the turns, starter suggestions on an empty thread, send errors, and the composer. On the page the composer
// sticks above the bottom tabs; in the panel the turns scroll inside the sheet.
import AddCommentOutlined from '@mui/icons-material/AddCommentOutlined'
import CloseRounded from '@mui/icons-material/CloseRounded'
import HistoryRounded from '@mui/icons-material/HistoryRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Skeleton from '@mui/material/Skeleton'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Column, Columns, formatShortDate } from '../../../components'
import { useOnline } from '../../../offline'
import { scrollBehavior, tokens } from '../../../theme'
import { Composer } from './Composer'
import { useThreadStore } from './thread-store'
import { TurnView } from './TurnView'
import { useChat, useThreads } from './useChat'

export const SUGGESTIONS = [
  'What did I average for protein in September?',
  'Swap Thursday to a pull day',
  'Raise water to 3.5 L',
] as const

const shorten = (text: string, n: number) => (text.length > n ? `${text.slice(0, n - 1).trimEnd()}…` : text)

function ThreadHeader({ title, onClose }: { title: string; onClose?: () => void }) {
  const threads = useThreads()
  const { threadId, open, startNew } = useThreadStore()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: tokens.tapTarget }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.heading, color: tokens.ink.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </Box>
        <Box sx={{ fontSize: tokens.font.size.label, color: tokens.ink.secondary }}>Numbers come from your data; changes wait for your tap.</Box>
      </Box>
      <IconButton aria-label="Past chats" onClick={(e) => setAnchor(e.currentTarget)} sx={{ width: tokens.tapTarget, height: tokens.tapTarget }}>
        <HistoryRounded />
      </IconButton>
      <IconButton aria-label="New chat" onClick={startNew} sx={{ width: tokens.tapTarget, height: tokens.tapTarget }}>
        <AddCommentOutlined />
      </IconButton>
      {onClose && (
        <IconButton aria-label="Close Ask AI" edge="end" onClick={onClose} sx={{ width: tokens.tapTarget, height: tokens.tapTarget }}>
          <CloseRounded />
        </IconButton>
      )}
      <Menu
        anchorEl={anchor}
        open={anchor !== null}
        onClose={() => setAnchor(null)}
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
          >
            <ListItemText
              primary={shorten(m.content, 60)}
              secondary={formatShortDate(m.created_at.slice(0, 10))}
              slotProps={{ primary: { noWrap: true, sx: { fontSize: tokens.font.size.emphasis } }, secondary: { sx: { fontSize: tokens.font.size.caption } } }}
            />
          </MenuItem>
        ))}
      </Menu>
    </Box>
  )
}

function Starters({ onPick, disabled }: { onPick: (text: string) => void; disabled: boolean }) {
  return (
    <Box data-testid="ask-ai-suggestions" sx={{ display: 'grid', gap: 3, py: 2 }}>
      <Box sx={{ fontSize: tokens.font.size.emphasis, color: tokens.ink.secondary, lineHeight: 1.5 }}>
        Ask about anything you have logged, or ask for a change. Logs you mention are saved; plan changes come back as a card you
        accept with one tap.
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {SUGGESTIONS.map((s) => (
          <Chip
            key={s}
            label={s}
            variant="outlined"
            disabled={disabled}
            onClick={() => onPick(s)}
            sx={{ height: 'auto', minHeight: tokens.tapTarget, py: 1, borderColor: tokens.ink.border, bgcolor: tokens.ink.card, '& .MuiChip-label': { whiteSpace: 'normal', fontSize: tokens.font.size.small } }}
          />
        ))}
      </Box>
    </Box>
  )
}

export interface ChatProps {
  variant: 'page' | 'panel'
  onClose?: () => void
  /** Page only: shown between the header and the turns (e.g. proposals waiting for a tap). */
  aside?: ReactNode
}

export function Chat({ variant, onClose, aside }: ChatProps) {
  const chat = useChat()
  const online = useOnline()
  const theme = useTheme()
  // Read before the panel's early return so the hook order never changes (rules of hooks).
  const desktop = useMediaQuery(theme.breakpoints.up('md'))
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

  /** The thread's content without the aside: the page puts that beside the thread on a desktop, above it on a phone. */
  const turnList = (
    <>
      {chat.loading && (
        <Box sx={{ display: 'grid', gap: 3 }}>
          <Skeleton variant="rounded" height={44} sx={{ width: '60%', justifySelf: 'end', borderRadius: `${tokens.radius.card}px` }} />
          <Skeleton variant="rounded" height={72} sx={{ borderRadius: `${tokens.radius.card}px` }} />
        </Box>
      )}
      {chat.loadError && <Alert severity="warning">{chat.loadError}</Alert>}
      {empty && <Starters onPick={send} disabled={!online || chat.sending} />}
      {/* A log region: screen readers announce each new question and reply as it arrives (WCAG 4.1.3). */}
      <Box role="log" aria-live="polite" aria-label="Conversation">
        <Box component="ol" data-testid="ask-ai-turns" sx={{ m: 0, p: 0, display: 'grid', gap: 6 }}>
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
      <Box ref={end} sx={{ scrollMarginBottom: variant === 'page' ? 180 : 16 }} />
    </>
  )
  const composer = (
    <Composer value={text} onChange={setText} onSend={() => send(text)} sending={chat.sending} online={online} autoFocus={variant === 'panel'} />
  )

  if (variant === 'panel')
    return (
      <Box data-testid="ask-ai-chat" sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <Box sx={{ px: 4, pt: 2, pb: 2, borderBottom: `1px solid ${tokens.ink.border}` }}>
          <ThreadHeader title={title ? shorten(title, 80) : 'Ask AI'} onClose={onClose} />
        </Box>
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', px: 4, py: 4, display: 'grid', alignContent: 'start', gap: 5 }}>
          {turnList}
        </Box>
        <Box sx={{ px: 4, pt: 2, pb: 'calc(12px + env(safe-area-inset-bottom, 0px))', borderTop: `1px solid ${tokens.ink.border}` }}>{composer}</Box>
      </Box>
    )

  /** The thread: header, turns and the composer pinned above the bottom tabs. `lead` is what sits above the turns. */
  const thread = (lead?: ReactNode) => (
    <Box
      data-testid="ask-ai-chat"
      // A thread is prose, so it stops widening at a readable measure: full width on a phone, 760 px on a wide page
      // with no rail to share it with, and the rail's column width whenever there is one.
      sx={{ display: 'flex', flexDirection: 'column', gap: 5, minHeight: 'calc(100dvh - 200px)', width: '100%', maxWidth: 760, mx: 'auto' }}
    >
      <ThreadHeader title={title ? shorten(title, 80) : 'New chat'} />
      <Box sx={{ flex: 1, display: 'grid', alignContent: 'start', gap: 5 }}>
        {lead}
        {turnList}
      </Box>
      <Box
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

  // From `md` up, changes waiting for a tap become a rail beside the thread instead of a block above it, so the
  // conversation keeps its full reading height and accepting one never means scrolling back through it. A phone keeps
  // them on top, where the width for a rail does not exist.
  if (desktop && aside)
    return (
      <Columns md={2} lg={3}>
        <Column span={2}>{thread()}</Column>
        <Column span={1}>{aside}</Column>
      </Columns>
    )

  return thread(aside)
}

