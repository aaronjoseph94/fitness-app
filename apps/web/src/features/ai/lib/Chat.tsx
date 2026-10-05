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
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { formatShortDate } from '../../../components'
import { useOnline } from '../../../offline'
import { tokens } from '../../../theme'
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
  const [text, setText] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const lastKey = chat.turns.at(-1)?.key
  const replied = chat.turns.at(-1)?.reply?.id

  useEffect(() => {
    if (chat.failedText) setText((t) => t || chat.failedText!)
  }, [chat.failedText])

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end', behavior: lastKey ? 'smooth' : 'auto' })
  }, [lastKey, replied, chat.threadId])

  const send = (value: string) => {
    if (chat.send(value)) setText('')
  }
  const title = chat.turns.find((t) => t.question.content)?.question.content
  const empty = !chat.loading && chat.turns.length === 0

  const turns = (
    <>
      {aside}
      {chat.loading && (
        <Box sx={{ display: 'grid', gap: 3 }}>
          <Skeleton variant="rounded" height={44} sx={{ width: '60%', justifySelf: 'end', borderRadius: `${tokens.radius.card}px` }} />
          <Skeleton variant="rounded" height={72} sx={{ borderRadius: `${tokens.radius.card}px` }} />
        </Box>
      )}
      {chat.loadError && <Alert severity="warning">{chat.loadError}</Alert>}
      {empty && <Starters onPick={send} disabled={!online || chat.sending} />}
      <Box component="ol" data-testid="ask-ai-turns" sx={{ m: 0, p: 0, display: 'grid', gap: 6 }}>
        {chat.turns.map((t) => (
          <TurnView key={t.key} turn={t} />
        ))}
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
          {turns}
        </Box>
        <Box sx={{ px: 4, pt: 2, pb: 'calc(12px + env(safe-area-inset-bottom, 0px))', borderTop: `1px solid ${tokens.ink.border}` }}>{composer}</Box>
      </Box>
    )

  return (
    <Box data-testid="ask-ai-chat" sx={{ display: 'flex', flexDirection: 'column', gap: 5, minHeight: 'calc(100dvh - 200px)' }}>
      <ThreadHeader title={title ? shorten(title, 80) : 'New chat'} />
      <Box sx={{ flex: 1, display: 'grid', alignContent: 'start', gap: 5 }}>{turns}</Box>
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
}

