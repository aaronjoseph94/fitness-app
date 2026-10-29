// Owns: the reply's "Logged" card (1d warm well) — one row per thing the message logged (its summary and day) with an
// Undo (POST /api/ai/receipts/:id/undo; queued offline, the row then says it waits for a connection). An undone row is
// struck through and greyed with "Undone". After an undo the thread's copy of the receipt is replaced and every other
// screen refetches, so Today, Log and Progress drop what was undone at once.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { endpoints } from '@fitness/shared/api'
import type { ChatMessage, Receipt } from '@fitness/shared/schemas'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { apiQueryKey, problemText, useApiMutation } from '../../../api'
import { eyebrow, formatDay, tabularNums, wellSurface } from '../../../components'
import { askAiCopy } from '../../../copy/ask-ai'
import { usePendingWrites } from '../../../offline'
import { COARSE_POINTER_QUERY, tokens } from '../../../theme'

/** '/api/ai/receipts/<id>/undo' → '<id>'. */
const receiptIdOf = (path: string) => path.split('/')[4] ?? ''

function ReceiptRow({ receipt, queued }: { receipt: Receipt; queued: boolean }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const undo = useApiMutation(endpoints.ai.undoReceipt, {
    onSuccess: (outcome) => {
      if (outcome.status !== 'saved') return
      const stored = outcome.data
      // Every cached thread page holding this receipt shows it undone now, before the refetch lands.
      queryClient.setQueriesData<ChatMessage[]>({ queryKey: apiQueryKey(endpoints.ai.chatHistory) }, (old) =>
        old?.map((m) =>
          m.receipts.some((r) => r.id === stored.id)
            ? { ...m, receipts: m.receipts.map((r) => (r.id === stored.id ? stored : r)) }
            : m,
        ),
      )
      void queryClient.invalidateQueries({ queryKey: apiQueryKey() })
    },
    onError: (e) => setError(problemText(e)),
  })
  const undone = receipt.undone_at !== null
  const waiting = !undone && queued
  return (
    <Box
      component="li"
      data-testid="chat-receipt"
      data-undone={undone || undefined}
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '4px 12px',
        py: '8px',
        '& + &': { borderTop: `1px solid ${tokens.ink.hairline}` },
      }}
    >
      <Box sx={{ flex: '1 1 160px', minWidth: 0 }}>
        <Box
          sx={{
            fontSize: tokens.font.size.body,
            lineHeight: tokens.font.leading.small,
            color: undone ? tokens.ink.muted : tokens.ink.text,
            textDecoration: undone ? 'line-through' : 'none',
            overflowWrap: 'break-word',
          }}
        >
          {receipt.summary}
        </Box>
        <Box sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.muted, ...tabularNums }}>
          {formatDay(receipt.date)}
          {waiting && ` · ${askAiCopy.undoQueued}`}
        </Box>
        {error && (
          <Box role="alert" sx={{ fontSize: tokens.font.size.caption, color: tokens.tone.danger.text }}>
            {error}
          </Box>
        )}
      </Box>
      {undone ? (
        <Box
          component="span"
          sx={{
            fontSize: tokens.font.size.small,
            fontWeight: tokens.font.weight.label,
            color: tokens.ink.label,
          }}
        >
          {askAiCopy.undone}
        </Box>
      ) : (
        <Button
          size="small"
          variant="outlined"
          data-testid="chat-receipt-undo"
          aria-label={askAiCopy.undoLabel(receipt.summary)}
          disabled={waiting || undo.isPending}
          onClick={() => {
            setError(null)
            undo.mutate({ params: { id: receipt.id } })
          }}
          sx={{ flex: 'none', [COARSE_POINTER_QUERY]: { minHeight: tokens.tapTarget } }}
        >
          {askAiCopy.undo}
        </Button>
      )}
    </Box>
  )
}

export function ReceiptsCard({ receipts }: { receipts: readonly Receipt[] }) {
  const pending = usePendingWrites(endpoints.ai.undoReceipt)
  const queued = new Set(pending.map((w) => receiptIdOf(w.path)))
  return (
    <Box
      component="section"
      aria-label={askAiCopy.loggedTitle}
      data-testid="chat-receipts"
      sx={{
        ...wellSurface,
        borderRadius: `${tokens.summit.radius.wellSmall}px`,
        px: '14px',
        pt: '10px',
        pb: '4px',
      }}
    >
      <Box component="h3" sx={{ m: 0, ...eyebrow }}>
        {askAiCopy.loggedTitle}
      </Box>
      <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none' }}>
        {receipts.map((r) => (
          <ReceiptRow key={r.id} receipt={r} queued={queued.has(r.id)} />
        ))}
      </Box>
    </Box>
  )
}
