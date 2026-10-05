// Owns: the proposal card shell (SPEC §6/§8): who proposed it, title, one-line summary, optional before → after
// rows, and Accept / Reject / Why. Decisions go out through callbacks; once decided, the buttons give way to the status.
import CheckRounded from '@mui/icons-material/CheckRounded'
import CloseRounded from '@mui/icons-material/CloseRounded'
import HelpOutlineRounded from '@mui/icons-material/HelpOutlineRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import type { ReactNode } from 'react'
import { tokens } from '../../theme'
import { PendingBadge } from './PendingBadge'

export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'auto_applied'

export interface ProposalChange {
  label: string
  from: string
  to: string
}

export interface ProposalCardProps {
  title: string
  summary: ReactNode
  /** Small line above the title, e.g. "Weekly review · AI". */
  source?: string
  changes?: readonly ProposalChange[]
  status?: ProposalStatus
  onAccept?: () => void
  onReject?: () => void
  onWhy?: () => void
  /** Disables the buttons while a decision is in flight. */
  busy?: boolean
  /** Expanded content under the summary, e.g. the "why" text once loaded. */
  children?: ReactNode
  testId?: string
  /** Heading level of the title, so the page outline never skips a level. Default h3. */
  headingComponent?: 'h2' | 'h3' | 'h4'
}

const STATUS_TEXT: Record<Exclude<ProposalStatus, 'pending'>, { text: string; color: string }> = {
  accepted: { text: 'Accepted', color: tokens.status.good },
  auto_applied: { text: 'Applied automatically', color: tokens.status.good },
  rejected: { text: 'Rejected', color: tokens.ink.secondary },
}

export function ProposalCard({
  title,
  summary,
  source,
  changes,
  status = 'pending',
  onAccept,
  onReject,
  onWhy,
  busy = false,
  children,
  testId,
  headingComponent = 'h3',
}: ProposalCardProps) {
  const decided = status !== 'pending' ? STATUS_TEXT[status] : null
  return (
    <Card data-testid={testId ?? 'proposal-card'} data-status={status} sx={{ p: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minHeight: 24 }}>
        <Box
          component="span"
          sx={{
            flex: 1,
            minWidth: 0,
            fontSize: tokens.font.size.label,
            fontWeight: tokens.font.weight.label,
            color: tokens.ink.secondary,
          }}
        >
          {source ?? 'Proposal'}
        </Box>
        {status === 'pending' && <PendingBadge />}
      </Box>
      <Box
        component={headingComponent}
        sx={{
          m: 0,
          mt: 1.5,
          fontSize: tokens.font.size.cardTitle,
          fontWeight: tokens.font.weight.heading,
          color: tokens.ink.text,
          lineHeight: 1.3,
        }}
      >
        {title}
      </Box>
      <Box sx={{ mt: 1.5, fontSize: tokens.font.size.emphasis, color: tokens.ink.secondary, lineHeight: 1.5 }}>{summary}</Box>

      {changes && changes.length > 0 && (
        <Box component="dl" sx={{ m: 0, mt: 3, borderTop: `1px solid ${tokens.ink.border}` }}>
          {changes.map((c) => (
            <Box
              key={c.label}
              sx={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 2,
                py: 2,
                borderBottom: `1px solid ${tokens.ink.border}`,
              }}
            >
              <Box component="dt" sx={{ flex: 1, minWidth: 0, fontSize: tokens.font.size.small, color: tokens.ink.secondary }}>
                {c.label}
              </Box>
              <Box
                component="dd"
                sx={{
                  m: 0,
                  fontSize: tokens.font.size.small,
                  color: tokens.ink.text,
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap',
                }}
              >
                <Box component="span" sx={{ color: tokens.ink.secondary }}>
                  {c.from}
                </Box>
                {' → '}
                <Box component="span" sx={{ fontWeight: tokens.font.weight.heading }}>
                  {c.to}
                </Box>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {children && <Box sx={{ mt: 3 }}>{children}</Box>}

      {decided ? (
        <Box sx={{ mt: 3, fontSize: tokens.font.size.small, fontWeight: tokens.font.weight.label, color: decided.color }}>
          {decided.text}
        </Box>
      ) : (
        <Box sx={{ display: 'flex', gap: 2, mt: 4, flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            startIcon={<CheckRounded />}
            onClick={onAccept}
            disabled={busy || !onAccept}
            sx={{ flex: '1 1 0', minWidth: 96 }}
          >
            Accept
          </Button>
          <Button
            variant="outlined"
            startIcon={<CloseRounded />}
            onClick={onReject}
            disabled={busy || !onReject}
            sx={{ flex: '1 1 0', minWidth: 96 }}
          >
            Reject
          </Button>
          {onWhy && (
            <Button variant="text" startIcon={<HelpOutlineRounded />} onClick={onWhy} disabled={busy}>
              Why
            </Button>
          )}
        </Box>
      )}
    </Card>
  )
}
