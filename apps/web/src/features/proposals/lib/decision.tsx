// Owns: deciding a proposal from any card (Today, the AI tab, the plan page) — the decision shows at once, rolls back
// with the reason in plain words if the server refuses, waits calmly while offline (no buttons, one line saying so),
// and refreshes every read once it lands, since accepting can change targets, templates, week plans or settings.
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { apiQueryKey, problemText } from '../../../api'
import type { ProposalStatus } from '../../../components'
import { useOnline } from '../../../offline'
import { tokens } from '../../../theme'

export type Decision = 'accepted' | 'rejected'

export interface ProposalDecision {
  /** The decision made here (shown before the server answers), else `current`. */
  status: ProposalStatus
  busy: boolean
  /** Undefined while offline: the card disables its buttons. */
  onAccept: (() => void) | undefined
  onReject: (() => void) | undefined
  /** "Deciding needs a connection" (offline, still pending) and the refusal; null when there is nothing to say. */
  notes: ReactNode
}

/**
 * `run` makes the calls for one decision; `onDone` gets its result once the server agreed. Mount one per proposal (key
 * the card by its id) so a decision never carries over to the next proposal.
 */
export function useProposalDecision<T>(
  current: ProposalStatus,
  run: (decision: Decision) => Promise<T>,
  onDone?: (decision: Decision, result: T) => void,
): ProposalDecision {
  const online = useOnline()
  const queryClient = useQueryClient()
  const [decided, setDecided] = useState<Decision | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mutation = useMutation({
    networkMode: 'always',
    mutationFn: run,
    onSuccess: (result, decision) => {
      void queryClient.invalidateQueries({ queryKey: apiQueryKey() })
      onDone?.(decision, result)
    },
    onError: (e) => {
      setDecided(null)
      setError(`That didn't go through: ${problemText(e)}`)
    },
  })
  const decide = (decision: Decision) => {
    setError(null)
    setDecided(decision)
    mutation.mutate(decision)
  }
  const status = decided ?? current
  const offline = !online && status === 'pending'
  return {
    status,
    busy: mutation.isPending,
    onAccept: online ? () => decide('accepted') : undefined,
    onReject: online ? () => decide('rejected') : undefined,
    notes:
      offline || error ? (
        <>
          {offline && <Box sx={{ fontSize: tokens.font.size.label, color: tokens.ink.secondary }}>Deciding needs a connection; it will wait here.</Box>}
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
        </>
      ) : null,
  }
}
