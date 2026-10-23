// Owns: the Ask AI chat surface shared by the AI tab and the slide-up panel — the thread header (past chats, new
// chat, deleting a chat for good), the turns, the empty thread's note, the starter chips (always on the page, on an
// empty thread in the panel), send and delete errors, and the composer. On the page it is 1d's wrapping row of cards
// (README §4: chats rail 260 px : thread : waiting-for-a-tap 340 px, each `1 1 Npx`, the thread `100 1 280px`): from
// 900 px the chats rail shows and the thread's turns scroll inside its card; below that the rail gives way to the
// past-chats menu in the thread header, the page scrolls, the composer sticks above the tab bar, and the proposals
// waiting for a tap and recent Train changes wrap under the thread. In the panel the turns scroll inside the sheet.
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
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import {
  cardSurface,
  displayTitle,
  fixedCol,
  NoModelKey,
  Reveal,
  staggerDelay,
  wrapCol,
} from '../../../components'
import { useOnline } from '../../../offline'
import { COARSE_POINTER_QUERY, minWidth, scrollBehavior, tokens } from '../../../theme'
import { useModelChain } from '../../settings/models'
import { ChatsRail, shorten } from './ChatsRail'
import { Composer } from './Composer'
import { NothingWaiting, RailsCard, RecentTrainChanges } from './PendingProposals'
import { useThreadStore } from './thread-store'
import { AiTile, TurnView } from './TurnView'
import { useChat, useThreads, type Turn } from './useChat'
import { chatWhen } from './when'

const SUGGESTIONS = [
  'What did I average for protein in September?',
  'Swap Thursday to a pull day',
  'Raise water to 3.5 L',
  'Plan my week: Mon, Tue, Thu',
] as const

/** README §4: the chats rail shows from 900 px (the page column); below it the past-chats menu switches chats. */
const WITH_RAIL = minWidth(tokens.layout.aiRail)
/** The fixed side columns' bases, px (README §4's table). */
const RAIL_PX = 260
const ASIDE_PX = 340
/** The gap between the page's columns, px (1d's Ask AI: 22). */
const COLUMN_GAP = 22
/** The columns rise in left to right, a card's stagger apart, after the hero. */
const enter = (i: number) => staggerDelay(i, tokens.motion.stagger.card, 150)

/**
 * A thread that scrolls on its own is a named, focusable region, so a keyboard alone can scroll back through replies
 * that hold nothing focusable (axe scrollable-region-focusable). Positioned, so the kit's visually hidden text inside
 * it is clipped with the rest instead of stretching the page.
 */
const scrollRegion = { tabIndex: 0, role: 'region', 'aria-label': 'Conversation history' } as const
const scrollRegionSx = {
  position: 'relative',
  '&:focus-visible': {
    outline: `${tokens.focusRing.width}px solid ${tokens.focusRing.color}`,
    outlineOffset: `-${tokens.focusRing.width}px`,
  },
} as const

const READ_TOOL = /^(?:get|list|search)_/

/** The thread header's "reads today, favourites, plan": what the thread's lookup tools read, the first three named. */
function readsLine(turns: readonly Turn[]): string | null {
  const calls = turns.flatMap((t) => t.reply?.tool_calls ?? [])
  const names = [
    ...new Set(
      calls
        .filter((c) => READ_TOOL.test(c.name))
        .map((c) => c.name.replace(READ_TOOL, '').replaceAll('_', ' ')),
    ),
  ]
  if (names.length === 0) return null
  return `reads ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` +${names.length - 3}` : ''}`
}

/**
 * The thread header: the open chat's title (Outfit 17) and how many messages it holds, the past-chats menu (each row
 * opens a chat or deletes it for good) and new-chat. Deleting asks first, in a small dialog that names the chat it is
 * about to remove. Beside the chats rail (`rail`) the menu is the "more" glyph and new-chat lives in the rail.
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
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 10px', minWidth: 0 }}>
      {/* The title keeps 160 px; the meta and the buttons wrap under it on a narrow thread (1d: a phone). */}
      <Box
        component="h2"
        sx={{
          m: 0,
          flex: '1 1 160px',
          minWidth: 0,
          ...displayTitle('card'),
          fontSize: tokens.font.size.subtitle,
          color: tokens.ink.text,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {title}
      </Box>
      <Box
        sx={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, maxWidth: '100%', ml: 'auto' }}
      >
        {meta && (
          <Box
            sx={{
              minWidth: 0,
              fontSize: tokens.font.size.small,
              fontWeight: tokens.font.weight.body,
              lineHeight: tokens.font.leading.small,
              color: tokens.ink.muted,
            }}
          >
            {meta}
            {reads && ` · ${reads}`}
          </Box>
        )}
        <IconButton
          aria-label="Past chats"
          size="small"
          onClick={(e) => setAnchor(e.currentTarget)}
          sx={{ flex: 'none' }}
        >
          {rail ? <MoreHorizRounded sx={{ fontSize: 20 }} /> : <HistoryRounded sx={{ fontSize: 20 }} />}
        </IconButton>
        {!rail && (
          <IconButton aria-label="New chat" size="small" onClick={startNew} sx={{ flex: 'none' }}>
            <AddCommentOutlined sx={{ fontSize: 20 }} />
          </IconButton>
        )}
        {onClose && (
          <IconButton aria-label="Close Ask AI" size="small" onClick={onClose} sx={{ flex: 'none' }}>
            <CloseRounded sx={{ fontSize: 20 }} />
          </IconButton>
        )}
      </Box>
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
              slotProps={{
                primary: {
                  noWrap: true,
                  sx: { fontSize: tokens.font.size.small, fontWeight: tokens.font.weight.label },
                },
                secondary: { sx: { fontSize: tokens.font.size.caption } },
              }}
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
          {confirming
            ? `“${confirming.label}” and every message in it go for good. Logs you asked for are already saved.`
            : ''}
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
    <Box sx={{ display: 'flex', gap: '12px', maxWidth: 760 }}>
      <AiTile />
      <Box
        sx={{
          pt: '6px',
          fontSize: tokens.font.size.emphasis,
          fontWeight: tokens.font.weight.body,
          lineHeight: 1.6,
          color: tokens.ink.body,
        }}
      >
        Ask about anything you have logged, or ask for a change. Logs you mention are saved; plan changes come
        back as a card you accept with one tap.
      </Box>
    </Box>
  )
}

/**
 * A sideways row's edges fade out, so a chip cut at the edge reads as "scroll for more". A mask: only the alpha counts,
 * so any opaque token does.
 */
const ROW_FADE = `linear-gradient(to right, transparent 0, ${tokens.ink.text} 12px, ${tokens.ink.text} calc(100% - 28px), transparent 100%)`

/**
 * 1d's starter chips above the composer: 34 px soft-violet pills (44 px on touch); a tap sends that question. `row`
 * (the phone's sticky dock) keeps them on one line that scrolls sideways with faded edges, so the composer never
 * covers one. With no model key they are off, under the shared "add a model key" line.
 */
function Starters({
  onPick,
  disabled,
  row = false,
  noKey = false,
}: {
  onPick: (text: string) => void
  disabled: boolean
  row?: boolean
  noKey?: boolean
}) {
  return (
    <Box sx={{ display: 'grid', gap: '8px', mb: '12px', minWidth: 0 }}>
      {noKey && <NoModelKey testId="ask-ai-no-key" />}
      <Box
        data-testid="ask-ai-suggestions"
        sx={{
          display: 'flex',
          gap: '6px',
          minWidth: 0,
          ...(row
            ? {
                flexWrap: 'nowrap',
                overflowX: 'auto',
                scrollbarWidth: 'none',
                '&::-webkit-scrollbar': { display: 'none' },
                mx: '-12px',
                px: '12px',
                maskImage: ROW_FADE,
                '& .MuiChip-label': { whiteSpace: 'nowrap' },
              }
            : { flexWrap: 'wrap', '& .MuiChip-label': { whiteSpace: 'normal' } }),
        }}
      >
        {SUGGESTIONS.map((s) => (
          <Chip
            key={s}
            label={s}
            variant="outlined"
            disabled={disabled || noKey}
            onClick={() => onPick(s)}
            sx={{
              flex: 'none',
              maxWidth: row ? 'none' : '100%',
              minHeight: 34,
              px: '14px',
              border: 0,
              borderRadius: `${tokens.radius.pill}px`,
              bgcolor: tokens.summit.surface.soft,
              fontSize: tokens.font.size.small,
              fontWeight: tokens.font.weight.label,
              color: tokens.summit.ink.deep,
              '&.MuiChip-clickable:hover': { bgcolor: tokens.summit.surface.softHover },
              [COARSE_POINTER_QUERY]: { minHeight: tokens.tapTarget },
            }}
          />
        ))}
      </Box>
    </Box>
  )
}

export interface ChatProps {
  variant: 'page' | 'panel'
  onClose?: () => void
  /** Page only: the proposals waiting for a tap — the right-hand column, under the thread on a narrow page. */
  aside?: ReactNode
}

/** On a wide page the turns scroll inside the thread card, which stays within a window's height below the hero. */
const TURNS_MAX_HEIGHT = 'max(360px, calc(100dvh - 300px))'

export function Chat({ variant, onClose, aside }: ChatProps) {
  const chat = useChat()
  const online = useOnline()
  const noKey = useModelChain()?.keys === 0
  // Read before the panel's early return so the hook order never changes (rules of hooks).
  const wide = useMediaQuery(WITH_RAIL)
  const [text, setText] = useState('')
  // The page takes a question to start from as `?q=` (the command palette's "Ask AI: '…'"): it fills the composer,
  // unsent, and leaves the address so a reload doesn't fill it again.
  const [params, setParams] = useSearchParams()
  const prefill = variant === 'page' ? params.get('q') : null
  useEffect(() => {
    if (!prefill) return
    setText(prefill)
    setParams(
      (p) => {
        p.delete('q')
        return p
      },
      { replace: true },
    )
  }, [prefill, setParams])
  const end = useRef<HTMLDivElement>(null)
  /** The box the turns scroll in, where they have one (the panel, a wide page); null where the page scrolls. */
  const scroller = useRef<HTMLDivElement>(null)
  const lastKey = chat.turns.at(-1)?.key
  const replied = chat.turns.at(-1)?.reply?.id

  useEffect(() => {
    if (chat.failedText) setText((t) => t || chat.failedText!)
  }, [chat.failedText])

  useEffect(() => {
    const behavior = lastKey ? scrollBehavior() : 'auto'
    // A thread that scrolls in its own box moves only that box, so the page under the hero stays put; otherwise the
    // page brings the end of the thread into view.
    const box = scroller.current
    if (box) box.scrollTo({ top: box.scrollHeight, behavior })
    else end.current?.scrollIntoView({ block: 'end', behavior })
  }, [lastKey, replied, chat.threadId])

  const send = (value: string) => {
    if (chat.send(value)) setText('')
  }
  const title = chat.turns.find((t) => t.question.content)?.question.content
  const empty = !chat.loading && chat.turns.length === 0
  const count = chat.turns.reduce((n, t) => n + (t.question.content ? 1 : 0) + (t.reply ? 1 : 0), 0)
  const page = variant === 'page'
  // An empty thread says what the AI may do, unless the page's hero above it already does.
  const meta =
    count > 0
      ? `${count} ${count === 1 ? 'message' : 'messages'}`
      : page
        ? null
        : 'Numbers come from your data; changes wait for your tap.'
  const reads = count > 0 ? readsLine(chat.turns) : null
  // A narrow page scrolls as a whole: its composer sticks above the tab bar, so the end of the thread scrolls clear.
  const phonePage = page && !wide
  const dock = useRef<HTMLDivElement>(null)
  // While the phone's dock is up it is part of the bottom chrome: the page's bottom scroll padding grows to clear it,
  // so a proposal's Accept / Reject / Plan history never takes focus behind it (WCAG 2.4.11).
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
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '20px' }}>
          <Skeleton
            variant="rounded"
            height={48}
            sx={{ width: '60%', justifySelf: 'end', borderRadius: `${tokens.radius.small}px` }}
          />
          <Skeleton variant="rounded" height={76} sx={{ borderRadius: `${tokens.radius.small}px` }} />
        </Box>
      )}
      {chat.loadError && <Alert severity="warning">{chat.loadError}</Alert>}
      {empty && <Intro />}
      {/* A log region: screen readers announce each new question and reply as it arrives (WCAG 4.1.3). */}
      <Box role="log" aria-live="polite" aria-label="Conversation">
        <Box
          component="ol"
          data-testid="ask-ai-turns"
          sx={{ m: 0, p: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '20px' }}
        >
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
  // The page always offers the starters above its composer (1d, at every width); the panel only on an empty thread.
  // On a phone they sit in the page's flow just above the sticky dock, so the dock stays one composer tall.
  const showStarters = empty || page
  const starters = (row = false) => (
    <Starters onPick={send} disabled={!online || chat.sending} row={row} noKey={noKey} />
  )
  const composer = (
    <>
      {showStarters && !phonePage && starters()}
      <Composer
        value={text}
        onChange={setText}
        onSend={() => send(text)}
        sending={chat.sending}
        online={online}
        autoFocus={variant === 'panel'}
      />
    </>
  )
  /** The turns, bottom-aligned in their area as a chat reads (1d: 20 px apart). */
  const turns = (
    <Box sx={{ mt: 'auto', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '20px' }}>
      {turnList}
    </Box>
  )

  if (variant === 'panel')
    return (
      <Box
        data-testid="ask-ai-chat"
        sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
      >
        <Box sx={{ px: 4, py: '14px', borderBottom: `1px solid ${tokens.ink.hairline}` }}>
          <ThreadHeader
            title={title ? shorten(title, 80) : 'Ask AI'}
            meta={meta}
            reads={reads}
            onClose={onClose}
            onDelete={chat.remove}
            deleting={chat.deleting}
          />
        </Box>
        <Box
          {...scrollRegion}
          ref={scroller}
          sx={{
            ...scrollRegionSx,
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            px: 4,
            py: '20px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {turns}
        </Box>
        <Box
          sx={{
            px: 4,
            pt: '12px',
            pb: 'calc(12px + env(safe-area-inset-bottom, 0px))',
            borderTop: `1px solid ${tokens.ink.hairline}`,
          }}
        >
          {composer}
        </Box>
      </Box>
    )

  const gutter = { xs: '18px', sm: '24px' }
  const thread = (
    <Box
      component="section"
      aria-label="Thread"
      data-testid="ask-ai-chat"
      sx={{
        ...cardSurface,
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        // Clips the phone dock's skirt at the card's edge (`clip`, not `hidden`: no scroll box, so the dock still sticks).
        ...(phonePage && { overflow: 'clip' }),
      }}
    >
      <Box sx={{ px: gutter, py: '16px', borderBottom: `1px solid ${tokens.ink.hairline}` }}>
        <ThreadHeader
          title={title ? shorten(title, 80) : 'New chat'}
          meta={meta}
          reads={reads}
          rail={wide}
          onDelete={chat.remove}
          deleting={chat.deleting}
        />
      </Box>
      <Box
        {...(wide ? scrollRegion : {})}
        ref={wide ? scroller : undefined}
        sx={{
          ...(wide && { ...scrollRegionSx, maxHeight: TURNS_MAX_HEIGHT, overflowY: 'auto' }),
          flex: 1,
          px: gutter,
          py: '22px',
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        {turns}
      </Box>
      <Box
        ref={dock}
        sx={{
          px: gutter,
          pb: '22px',
          // A narrow page: the composer sticks above the tab bar while its thread is on screen.
          ...(phonePage && {
            position: 'sticky',
            bottom: `calc(${tokens.layout.bottomNavHeight + tokens.space(3)}px + env(safe-area-inset-bottom, 0px))`,
            zIndex: 1,
            pt: '12px',
            bgcolor: tokens.ink.card,
            borderRadius: `0 0 ${tokens.radius.card}px ${tokens.radius.card}px`,
            // A skirt in the card's colour down to the tab bar, so no reply shows between the composer and the tabs.
            '&::after': {
              content: '""',
              position: 'absolute',
              left: 0,
              right: 0,
              top: '100%',
              height: `calc(${tokens.layout.bottomNavHeight + tokens.space(3)}px + env(safe-area-inset-bottom, 0px))`,
              bgcolor: tokens.ink.card,
              pointerEvents: 'none',
            },
          }),
        }}
      >
        {/* The phone's starters ride in the dock as one sideways row, so the composer never covers them. */}
        {showStarters && phonePage && starters(true)}
        {composer}
      </Box>
    </Box>
  )

  // README §4: chats rail 260 px : thread (100 1 280px) : waiting for a tap 340 px, wrapping rather than squeezing.
  return (
    <Box
      sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: `${COLUMN_GAP}px`, minWidth: 0 }}
    >
      {wide && (
        <Reveal delay={enter(0)} sx={{ ...fixedCol(RAIL_PX), display: 'flex', flexDirection: 'column' }}>
          <ChatsRail />
        </Reveal>
      )}
      <Reveal delay={enter(1)} sx={{ ...wrapCol(1), display: 'flex', flexDirection: 'column' }}>
        {thread}
      </Reveal>
      {/* Under 900 px the thread takes the full width and this column sits below it (never squeezing the thread). */}
      <Reveal
        delay={enter(2)}
        sx={wide ? { ...fixedCol(ASIDE_PX), alignSelf: 'flex-start' } : { flex: '1 1 100%', minWidth: 0 }}
      >
        <Box
          component="aside"
          aria-label="Proposals and rails"
          sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '22px', alignContent: 'start' }}
        >
          {aside ?? (wide ? <NothingWaiting /> : null)}
          <RecentTrainChanges />
          {/* Without the chats rail, its rails card closes this column instead. */}
          {!wide && <RailsCard />}
        </Box>
      </Reveal>
    </Box>
  )
}
