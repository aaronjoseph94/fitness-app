// Owns: one Ask AI turn on screen (1d) — Aaron's question as a deep-ink bubble on the right (with "Will send when you're
// back online" under it while it waits in the offline queue); the reply beside the gold sparkle tile: the tool pills,
// what the message logged (the Logged card, each row with Undo), how the forecast moved ("What changed"), the text
// (paragraphs, **bold**, and lists drawn as warm-well rows, from the model's light Markdown; never raw HTML), the
// proposals as deep-sky strips, and the time it came back; the "thinking" row (an amber tile, breathing dots) while
// the reply is on its way; and, for an answer still coming after its message was delivered, what it already logged
// with a calm "Still working on the answer…" line.
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded'
import CloudOffRounded from '@mui/icons-material/CloudOffRounded'
import TrendingFlatRounded from '@mui/icons-material/TrendingFlatRounded'
import Box from '@mui/material/Box'
import { Fragment, type ReactNode } from 'react'
import { formatClock, tabularNums, visuallyHidden, wellSurface } from '../../../components'
import { askAiCopy } from '../../../copy/ask-ai'
import { tokens } from '../../../theme'
import { forecastLine } from './forecast-line'
import { ProposalItem } from './ProposalItem'
import { ReceiptsCard } from './ReceiptsCard'
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

/** The question bubble's corner radius, px (1d draws 20 and 6 under the speaker; the nearest tokens are 18 and 4). */
const BUBBLE = tokens.summit.radius.wellLarge
const BUBBLE_TAIL = tokens.radius.bar

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
      // 1d draws a reply's list (the plate it suggests, the steps of a plan) as warm-well rows, 6 px apart.
      blocks.push(
        <Box
          component={ordered ? 'ol' : 'ul'}
          key={blocks.length}
          sx={{
            m: 0,
            p: 0,
            listStyle: 'none',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr)',
            gap: '6px',
          }}
        >
          {items.map((item, n) => (
            <Box
              component="li"
              key={n}
              sx={{
                ...wellSurface,
                borderRadius: `${tokens.summit.radius.wellSmall}px`,
                display: 'flex',
                gap: '10px',
                px: '14px',
                py: '10px',
                fontSize: tokens.font.size.body,
                lineHeight: tokens.font.leading.small,
                color: tokens.ink.text,
              }}
            >
              {ordered && (
                <Box
                  component="span"
                  aria-hidden
                  sx={{ flex: 'none', color: tokens.ink.muted, ...tabularNums }}
                >
                  {n + 1}.
                </Box>
              )}
              <Box component="span" sx={{ minWidth: 0 }}>
                {inline(item)}
              </Box>
            </Box>
          ))}
        </Box>,
      )
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i]!.trim() && !LIST_ITEM.test(lines[i]!))
      para.push(lines[i++]!.replace(/^#+\s*/, ''))
    blocks.push(
      <Box component="p" key={blocks.length} sx={{ m: 0 }}>
        {inline(para.join(' '))}
      </Box>,
    )
  }
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: '12px',
        fontSize: tokens.font.size.emphasis,
        fontWeight: tokens.font.weight.body,
        lineHeight: 1.6,
        color: tokens.ink.body,
        // A link or a long food name breaks rather than pushing a narrow thread (~300 px at 1,024) sideways.
        overflowWrap: 'break-word',
        '& strong': { color: tokens.ink.text },
      }}
    >
      {blocks}
    </Box>
  )
}

/**
 * The AI's 34 px sparkle tile, at the start of every reply and of the empty thread's note: deep ink on the gold
 * gradient. `thinking` is the amber tile of the row shown while a reply is on its way.
 */
export function AiTile({ thinking = false }: { thinking?: boolean }) {
  return (
    <Box
      aria-hidden
      sx={{
        width: 34,
        height: 34,
        flex: 'none',
        display: 'grid',
        placeItems: 'center',
        borderRadius: `${tokens.radius.control}px`,
        ...(thinking
          ? { bgcolor: tokens.tone.warning.bg, color: tokens.tone.warning.text }
          : { backgroundImage: tokens.summit.cta.gold.bg, color: tokens.summit.cta.gold.text }),
      }}
    >
      <AutoAwesomeRounded sx={{ fontSize: 18 }} />
    </Box>
  )
}

/** Three dots breathing in turn (static under reduced motion) beside "Looking it up…" (or `text`). */
function Thinking({ text = 'Looking it up…' }: { text?: string }) {
  return (
    <Box
      role="status"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        fontSize: tokens.font.size.body,
        fontWeight: tokens.font.weight.body,
        color: tokens.ink.muted,
      }}
    >
      <AiTile thinking />
      <Box
        aria-hidden
        sx={{
          display: 'inline-flex',
          gap: '3px',
          '@keyframes ai-breathe': { '0%, 100%': { opacity: 0.35 }, '50%': { opacity: 1 } },
          '& > span': {
            width: 7,
            height: 7,
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
      {text}
    </Box>
  )
}

/** The "What changed" line under the Logged card: the forecast's move, in the reply's own small type. */
function WhatChanged({ text }: { text: string }) {
  return (
    <Box
      data-testid="chat-forecast"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: tokens.font.size.small,
        fontWeight: tokens.font.weight.label,
        lineHeight: tokens.font.leading.small,
        color: tokens.ink.label,
        ...tabularNums,
      }}
    >
      <TrendingFlatRounded aria-hidden sx={{ fontSize: 18, color: tokens.accent.main }} />
      <span>
        <Box component="span" sx={visuallyHidden}>
          {askAiCopy.whatChanged}:{' '}
        </Box>
        {text}
      </span>
    </Box>
  )
}

export function TurnView({ turn }: { turn: Turn }) {
  const { question, reply, tools } = turn
  const waitingForTap = reply?.proposals.some((p) => p.status === 'pending')
  const moved = reply ? forecastLine(reply.forecast) : null
  return (
    <Box
      component="li"
      data-testid="ask-ai-turn"
      sx={{ listStyle: 'none', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '20px' }}
    >
      {question.content && (
        <Box
          data-testid="ask-ai-question"
          sx={{
            justifySelf: 'end',
            maxWidth: 'min(520px, 88%)',
            px: '16px',
            py: '12px',
            // 1d's bubble: round but for the corner under the speaker.
            borderRadius: `${BUBBLE}px ${BUBBLE}px ${BUBBLE_TAIL}px ${BUBBLE}px`,
            bgcolor: tokens.dark.bg,
            color: tokens.dark.text,
            fontSize: tokens.font.size.emphasis,
            fontWeight: tokens.font.weight.body,
            lineHeight: tokens.font.leading.body,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {question.content}
        </Box>
      )}
      {turn.queued && (
        <Box
          role="status"
          data-testid="ask-ai-queued"
          sx={{
            justifySelf: 'end',
            mt: '-12px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: tokens.font.size.caption,
            fontWeight: tokens.font.weight.label,
            color: tokens.ink.label,
          }}
        >
          <CloudOffRounded aria-hidden sx={{ fontSize: 14 }} />
          {askAiCopy.queuedNote}
        </Box>
      )}
      {turn.waiting && <Thinking />}
      {turn.stillWorking && (
        <Box
          data-testid="ask-ai-still-working"
          sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '12px', maxWidth: 760 }}
        >
          {turn.stillWorking.receipts.length > 0 && <ReceiptsCard receipts={turn.stillWorking.receipts} />}
          {turn.stillWorking.late ? (
            <Box
              role="status"
              sx={{
                fontSize: tokens.font.size.small,
                lineHeight: tokens.font.leading.small,
                color: tokens.ink.muted,
              }}
            >
              {askAiCopy.stillWorkingLate}
            </Box>
          ) : (
            <Thinking text={askAiCopy.stillWorking} />
          )}
        </Box>
      )}
      {reply && (
        <Box sx={{ display: 'flex', gap: '12px', maxWidth: 760, minWidth: 0 }}>
          <AiTile />
          <Box data-testid="ask-ai-reply" sx={{ flex: 1, minWidth: 0 }}>
            {reply.tool_calls && reply.tool_calls.length > 0 && (
              <Box sx={{ mb: '10px' }}>
                <ToolChips calls={reply.tool_calls} tools={tools} />
              </Box>
            )}
            {(reply.receipts.length > 0 || moved) && (
              <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '10px', mb: '12px' }}>
                {reply.receipts.length > 0 && <ReceiptsCard receipts={reply.receipts} />}
                {moved && <WhatChanged text={moved} />}
              </Box>
            )}
            <ReplyText text={reply.content} />
            {reply.proposals.length > 0 && (
              <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '8px', mt: '12px' }}>
                {reply.proposals.map((p) => (
                  <ProposalItem key={p.id} proposal={p} variant="strip" />
                ))}
              </Box>
            )}
            <Box
              sx={{
                mt: '8px',
                fontSize: tokens.font.size.caption,
                fontWeight: tokens.font.weight.body,
                color: tokens.ink.muted,
                ...tabularNums,
              }}
            >
              {question.content
                ? replyWhen(question.created_at, reply.created_at)
                : formatClock(reply.created_at)}
              {waitingForTap && ' · nothing changes until you tap'}
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  )
}
