// Owns: one Ask AI turn on screen — Aaron's question as a dark bubble on the right, the reply as plain text on the left
// (paragraphs, lists and **bold** from the model's light Markdown; never raw HTML), the tool chips, the proposal cards,
// and the "thinking" line while the reply is on its way.
import Box from '@mui/material/Box'
import LinearProgress from '@mui/material/LinearProgress'
import { Fragment, type ReactNode } from 'react'
import { tokens } from '../../../theme'
import { ProposalItem } from './ProposalItem'
import { ToolChips } from './ToolChips'
import type { Turn } from './useChat'

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
  return <Box sx={{ display: 'grid', gap: 2.5, fontSize: 16, lineHeight: 1.5, color: tokens.ink.text }}>{blocks}</Box>
}

export function TurnView({ turn }: { turn: Turn }) {
  const { question, reply, tools } = turn
  return (
    <Box component="li" data-testid="ask-ai-turn" sx={{ listStyle: 'none', display: 'grid', gap: 3 }}>
      {question.content && (
        <Box
          data-testid="ask-ai-question"
          sx={{
            justifySelf: 'end',
            maxWidth: '85%',
            px: 3.5,
            py: 2.5,
            borderRadius: `${tokens.radius.card}px ${tokens.radius.card}px 4px ${tokens.radius.card}px`,
            bgcolor: tokens.ink.text,
            color: tokens.ink.card,
            fontSize: 16,
            lineHeight: 1.45,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {question.content}
        </Box>
      )}
      {turn.waiting && (
        <Box role="status" sx={{ display: 'grid', gap: 2, maxWidth: 220 }}>
          <Box sx={{ fontSize: 14, color: tokens.ink.secondary }}>Looking it up…</Box>
          <LinearProgress color="inherit" sx={{ height: 2, borderRadius: 1, color: tokens.ink.secondary }} />
        </Box>
      )}
      {reply && (
        <Box data-testid="ask-ai-reply" sx={{ display: 'grid', gap: 3, minWidth: 0 }}>
          <ReplyText text={reply.content} />
          {reply.tool_calls && reply.tool_calls.length > 0 && <ToolChips calls={reply.tool_calls} tools={tools} />}
          {reply.proposals.map((p) => (
            <ProposalItem key={p.id} proposal={p} />
          ))}
        </Box>
      )}
    </Box>
  )
}
