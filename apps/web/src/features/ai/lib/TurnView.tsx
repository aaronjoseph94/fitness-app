// Owns: one Ask AI turn on screen (2a) — Aaron's question as a dark bubble on the right; the reply beside the blue
// sparkle tile: the tool pills, the text (paragraphs, lists and **bold** from the model's light Markdown; never raw
// HTML), the proposals as strips, and the time it came back; and the "thinking" row while the reply is on its way.
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded'
import Box from '@mui/material/Box'
import { Fragment, type ReactNode } from 'react'
import { formatClock } from '../../../components'
import { tokens } from '../../../theme'
import { ProposalItem } from './ProposalItem'
import { ToolChips } from './ToolChips'
import type { Turn } from './useChat'
import { replyWhen } from './when'

/** `**bold**` spans inside one line. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <Box component="strong" key={i} sx={{ fontWeight: tokens.font.weight.heading }}>
        {part.slice(2, -2)}
      </Box>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )
}

const LIST_ITEM = /^\s*(?:[-*•]|\d+[.)])\s+/

/** Light Markdown → blocks: blank-line paragraphs, "-" / "1." lists, "#" headings as bold lines. */
export function ReplyText({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  const lines = text.replace(/\r/g, '').split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (!line.trim()) {
      i++
      continue
    }
    if (LIST_ITEM.test(line)) {
      const items: string[] = []
      const ordered = /^\s*\d/.test(line)
      while (i < lines.length && LIST_ITEM.test(lines[i]!)) items.push(lines[i++]!.replace(LIST_ITEM, ''))
      blocks.push(
        <Box component={ordered ? 'ol' : 'ul'} key={blocks.length} sx={{ m: 0, pl: 5, display: 'grid', gap: 1 }}>
          {items.map((item, n) => (
            <li key={n}>{inline(item)}</li>
          ))}
        </Box>,
      )
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i]!.trim() && !LIST_ITEM.test(lines[i]!)) para.push(lines[i++]!.replace(/^#+\s*/, ''))
    blocks.push(
      <Box component="p" key={blocks.length} sx={{ m: 0 }}>
        {inline(para.join(' '))}
      </Box>,
    )
  }
  return <Box sx={{ display: 'grid', gap: '10px', fontSize: tokens.font.size.body, lineHeight: tokens.font.leading.emphasis, color: tokens.ink.text }}>{blocks}</Box>
}

/** The AI's 28 px blue sparkle tile, at the start of every reply, of the thinking row and of the empty thread's note. */
export function AiTile() {
  return (
    <Box
      aria-hidden
      sx={{
        width: 28,
        height: 28,
        flex: 'none',
        display: 'grid',
        placeItems: 'center',
        borderRadius: `${tokens.radius.control}px`,
        bgcolor: tokens.accent.soft,
        color: tokens.accent.main,
      }}
    >
      <AutoAwesomeRounded sx={{ fontSize: 16 }} />
    </Box>
  )
}

/** Three dots breathing in turn (static under reduced motion) beside "Looking it up…". */
function Thinking() {
  return (
    <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: tokens.font.size.small, color: tokens.ink.muted }}>
      <AiTile />
      <Box
        aria-hidden
        sx={{
          display: 'inline-flex',
          gap: '3px',
          '@keyframes ai-breathe': { '0%, 100%': { opacity: 0.35 }, '50%': { opacity: 1 } },
          '& > span': {
            width: 6,
            height: 6,
            borderRadius: '50%',
            bgcolor: tokens.ink.faint,
            animation: 'ai-breathe 1200ms ease-in-out infinite',
          },
          '& > span:nth-of-type(2)': { animationDelay: '200ms' },
          '& > span:nth-of-type(3)': { animationDelay: '400ms' },
          '@media (prefers-reduced-motion: reduce)': { '& > span': { animation: 'none' } },
        }}
      >
        <span />
        <span />
        <span />
      </Box>
      Looking it up…
    </Box>
  )
}

export function TurnView({ turn }: { turn: Turn }) {
  const { question, reply, tools } = turn
  const waitingForTap = reply?.proposals.some((p) => p.status === 'pending')
  return (
    <Box component="li" data-testid="ask-ai-turn" sx={{ listStyle: 'none', display: 'grid', gap: '18px' }}>
      {question.content && (
        <Box
          data-testid="ask-ai-question"
          sx={{
            justifySelf: 'end',
            maxWidth: { xs: '85%', md: 520 },
            px: '14px',
            py: '10px',
            borderRadius: `${tokens.radius.card}px ${tokens.radius.card}px 4px ${tokens.radius.card}px`,
            bgcolor: tokens.dark.bg,
            color: tokens.dark.text,
            fontSize: tokens.font.size.body,
            lineHeight: tokens.font.leading.body,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {question.content}
        </Box>
      )}
      {turn.waiting && <Thinking />}
      {reply && (
        <Box sx={{ display: 'flex', gap: '12px', maxWidth: 720, minWidth: 0 }}>
          <AiTile />
          <Box data-testid="ask-ai-reply" sx={{ flex: 1, minWidth: 0 }}>
            {reply.tool_calls && reply.tool_calls.length > 0 && (
              <Box sx={{ mb: '8px' }}>
                <ToolChips calls={reply.tool_calls} tools={tools} />
              </Box>
            )}
            <ReplyText text={reply.content} />
            {reply.proposals.length > 0 && (
              <Box sx={{ display: 'grid', gap: '8px', mt: '10px' }}>
                {reply.proposals.map((p) => (
                  <ProposalItem key={p.id} proposal={p} variant="strip" />
                ))}
              </Box>
            )}
            <Box sx={{ mt: '8px', fontSize: tokens.font.size.caption, color: tokens.ink.muted, fontVariantNumeric: 'tabular-nums' }}>
              {question.content ? replyWhen(question.created_at, reply.created_at) : formatClock(reply.created_at)}
              {waitingForTap && ' · nothing changes until you tap'}
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  )
}
