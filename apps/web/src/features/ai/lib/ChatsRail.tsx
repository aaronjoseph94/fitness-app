// Owns: 2a's chats rail on a wide Ask AI page — "Chats" with "+ New", every past thread (its opening words and when;
// the open one marked) to switch to, and the card at its foot saying what the AI may do. Opening, starting and the
// list are the same thread store and history query the past-chats menu uses; deleting stays in that menu.
import AddRounded from '@mui/icons-material/AddRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Skeleton from '@mui/material/Skeleton'
import { tokens } from '../../../theme'
import { useThreadStore } from './thread-store'
import { useThreads } from './useChat'
import { chatWhen } from './when'

/** The first `n` characters of a chat's opening words, with an ellipsis when cut. */
export const shorten = (text: string, n: number) => (text.length > n ? `${text.slice(0, n - 1).trimEnd()}…` : text)

const noteSx = { px: '10px', py: '9px', fontSize: tokens.font.size.caption, color: tokens.ink.muted } as const

export function ChatsRail() {
  const threads = useThreads()
  const { threadId, open, startNew } = useThreadStore()
  return (
    <Box
      component="nav"
      aria-labelledby="ask-ai-chats-title"
      sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, bgcolor: tokens.ink.panel, borderRight: `1px solid ${tokens.ink.border}` }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', px: '14px', pt: '14px', pb: '10px' }}>
        <Box component="h2" id="ask-ai-chats-title" sx={{ m: 0, flex: 1, fontSize: tokens.font.size.small, fontWeight: tokens.font.weight.heading, color: tokens.ink.text }}>
          Chats
        </Box>
        <Button variant="outlined" size="tiny" startIcon={<AddRounded />} onClick={startNew} aria-label="New chat">
          New
        </Button>
      </Box>
      <Box component="ul" sx={{ m: 0, px: '8px', py: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', alignContent: 'start', gap: '2px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {threads.isPending &&
          [0, 1, 2].map((i) => (
            <Box component="li" key={i} sx={{ px: '10px', py: '9px' }}>
              <Skeleton width="80%" height={18} />
              <Skeleton width="40%" height={16} />
            </Box>
          ))}
        {threads.data?.length === 0 && (
          <Box component="li" sx={noteSx}>
            No past chats yet
          </Box>
        )}
        {threads.isError && (
          <Box component="li" sx={noteSx}>
            Past chats need a connection
          </Box>
        )}
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
                  px: '10px',
                  py: '9px',
                  borderRadius: `${tokens.radius.control}px`,
                  // A bare <button> takes the browser's font; the rows read in the theme's Geist like the rest.
                  font: 'inherit',
                  bgcolor: 'transparent',
                  boxShadow: active ? `inset 0 0 0 1px ${tokens.ink.border}` : 'none',
                  color: tokens.ink.text,
                  // On the #F4F4F5 fill the time line steps up to #52525B (#71717A there is 4.39:1, under AA).
                  '&:hover, &[aria-current]': { bgcolor: tokens.ink.fill, '& .chat-when': { color: tokens.ink.label } },
                  // Inset, like the kit's flush rows: the scrolling list would clip a ring drawn outside the row.
                  '&.Mui-focusVisible': { outlineOffset: -tokens.focusRing.width },
                }}
              >
                <Box
                  component="span"
                  sx={{
                    display: 'block',
                    fontSize: tokens.font.size.small,
                    fontWeight: active ? tokens.font.weight.heading : tokens.font.weight.label,
                    lineHeight: 'normal',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {shorten(m.content, 80)}
                </Box>
                <Box component="span" className="chat-when" sx={{ display: 'block', fontSize: tokens.font.size.caption, lineHeight: 'normal', color: tokens.ink.muted }}>
                  {chatWhen(m.created_at)}
                </Box>
              </ButtonBase>
            </li>
          )
        })}
      </Box>
      <Box
        sx={{
          m: '12px',
          p: '12px',
          borderRadius: `${tokens.radius.panel}px`,
          border: `1px solid ${tokens.ink.border}`,
          bgcolor: tokens.ink.card,
          fontSize: tokens.font.size.caption,
          lineHeight: tokens.font.leading.small,
          color: tokens.ink.label,
        }}
      >
        <Box sx={{ fontWeight: tokens.font.weight.heading, color: tokens.ink.text }}>Free-tier models</Box>
        Numbers come from your data; every change passes the rails and waits for your tap.
      </Box>
    </Box>
  )
}
