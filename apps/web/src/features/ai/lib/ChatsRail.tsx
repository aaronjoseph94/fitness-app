// Owns: the chats rail on a wide Ask AI page (1d) — a white card with "Chats" and "+ New", every past thread (its
// opening words and when; the open one in a warm well with the gold ring) to switch to, and the coach-gradient "Rails
// on" card at its foot. Opening, starting and the list are the same thread store and history query the past-chats menu
// uses; deleting stays in that menu.
import AddRounded from '@mui/icons-material/AddRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Skeleton from '@mui/material/Skeleton'
import { cardSurface, displayTitle, QueryStateCard } from '../../../components'
import { tokens, transitionOf } from '../../../theme'
import { RailsCard } from './PendingProposals'
import { useThreadStore } from './thread-store'
import { useThreads } from './useChat'
import { chatWhen } from './when'

/** The first `n` characters of a chat's opening words, with an ellipsis when cut. */
export const shorten = (text: string, n: number) =>
  text.length > n ? `${text.slice(0, n - 1).trimEnd()}…` : text

const noteSx = {
  px: '12px',
  py: '10px',
  fontSize: tokens.font.size.caption,
  fontWeight: tokens.font.weight.body,
  color: tokens.ink.muted,
} as const

/** The active chat: a warm well inside the 2 px gold ring (1d's "current" mark). */
const activeRing = `inset 0 0 0 2px ${tokens.summit.gold.main}`

export function ChatsRail() {
  const threads = useThreads()
  const { threadId, open, startNew } = useThreadStore()
  return (
    <Box
      component="nav"
      aria-labelledby="ask-ai-chats-title"
      sx={{ ...cardSurface, display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', px: '20px', pt: '20px', pb: '12px' }}>
        <Box
          component="h2"
          id="ask-ai-chats-title"
          sx={{
            m: 0,
            flex: 1,
            ...displayTitle('card'),
            fontSize: tokens.font.size.subtitle,
            color: tokens.ink.text,
          }}
        >
          Chats
        </Box>
        <Button
          variant="outlined"
          size="small"
          startIcon={<AddRounded />}
          onClick={startNew}
          aria-label="New chat"
          sx={{ borderRadius: `${tokens.radius.inner}px`, px: '12px' }}
        >
          New
        </Button>
      </Box>
      <Box
        component="ul"
        sx={{
          m: 0,
          px: '12px',
          py: '2px',
          listStyle: 'none',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          alignContent: 'start',
          gap: '4px',
          // A long history scrolls inside the rail rather than stretching the row past the thread.
          maxHeight: 'max(280px, calc(100dvh - 360px))',
          overflowY: 'auto',
        }}
      >
        {threads.isPending &&
          [0, 1, 2].map((i) => (
            <Box component="li" key={i} sx={{ px: '12px', py: '10px' }}>
              <Skeleton width="80%" height={18} />
              <Skeleton width="40%" height={16} />
            </Box>
          ))}
        {threads.data?.length === 0 && (
          <Box component="li" sx={noteSx}>
            No past chats yet
          </Box>
        )}
        {/* Offline it needs a connection; a failed read online is the kit's warning banner with Try again. */}
        {threads.isError &&
          (threads.fetchStatus === 'paused' || threads.error?.kind === 'network' ? (
            <Box component="li" sx={noteSx}>
              Past chats need a connection
            </Box>
          ) : (
            <li>
              <QueryStateCard query={threads} what="your chats" />
            </li>
          ))}
        {threads.data?.map((m) => {
          const active = m.thread_id === threadId
          return (
            <li key={m.thread_id}>
              <ButtonBase
                onClick={() => open(m.thread_id)}
                aria-current={active ? 'true' : undefined}
                sx={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  px: '12px',
                  py: '10px',
                  borderRadius: `${tokens.summit.radius.wellSmall}px`,
                  // A bare <button> takes the browser's font; the rows read in the theme's face like the rest.
                  font: 'inherit',
                  bgcolor: active ? tokens.ink.panel : 'transparent',
                  boxShadow: active ? activeRing : 'none',
                  color: tokens.ink.text,
                  transition: transitionOf('background-color', tokens.motion.duration.instant),
                  '&:hover': { bgcolor: tokens.ink.panel },
                  // Inset, like the kit's flush rows: the scrolling list would clip a ring drawn outside the row.
                  '&.Mui-focusVisible': { outlineOffset: -tokens.focusRing.width },
                }}
              >
                <Box
                  component="span"
                  sx={{
                    display: 'block',
                    fontSize: tokens.font.size.body,
                    fontWeight: active ? tokens.font.weight.heading : tokens.font.weight.body,
                    lineHeight: tokens.font.leading.label,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {shorten(m.content, 80)}
                </Box>
                <Box
                  component="span"
                  sx={{
                    display: 'block',
                    fontSize: tokens.font.size.caption,
                    fontWeight: tokens.font.weight.body,
                    lineHeight: tokens.font.leading.caption,
                    color: tokens.ink.muted,
                  }}
                >
                  {chatWhen(m.created_at)}
                </Box>
              </ButtonBase>
            </li>
          )
        })}
      </Box>
      <Box sx={{ flex: 1 }} />
      <Box sx={{ m: '14px' }}>
        <RailsCard />
      </Box>
    </Box>
  )
}
