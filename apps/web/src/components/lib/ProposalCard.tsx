// Owns: the proposal card shell (SPEC §6/§8) in its 2a form (README, Today "Proposal card"): a header row — the blue
// sparkle, who proposed it (default "Proposal") and the neutral "Pending" chip — the title at 15/600, the one-line
// summary, the before → after rows on `ink.panel` (old value struck through, new value bold), and the actions:
// "Accept" in the dark button, "Reject" in the outline one and a "Why?" link on the right. Decisions go out through
// `onAccept` / `onReject`; once decided, the buttons give way to the status line.
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import type { ReactNode } from 'react'
import { tokens } from '../../theme'
import { BeforeAfterList } from './BeforeAfter'
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
  /** The header label, e.g. "Weekly review · AI". Default "Proposal". */
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
  accepted: { text: 'Accepted', color: tokens.tone.success.text },
  auto_applied: { text: 'Applied automatically', color: tokens.tone.success.text },
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
    <Box
      data-testid={testId ?? 'proposal-card'}
      data-status={status}
      sx={{
        px: `${tokens.pad.dense.x}px`,
        py: `${tokens.pad.dense.y}px`,
        borderRadius: `${tokens.radius.card}px`,
        border: `1px solid ${tokens.ink.border}`,
        bgcolor: tokens.ink.card,
        boxShadow: tokens.elevation.card,
        minWidth: 0,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: 22 }}>
        <AutoAwesomeRounded aria-hidden sx={{ fontSize: 18, color: tokens.accent.main, flex: 'none' }} />
        <Box
          component="span"
          sx={{
            flex: 1,
            minWidth: 0,
            fontSize: tokens.font.size.body,
            fontWeight: tokens.font.weight.heading,
            color: tokens.ink.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
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
          mt: '8px',
          fontSize: tokens.font.size.itemTitle,
          fontWeight: tokens.font.weight.heading,
          lineHeight: tokens.font.leading.itemTitle,
          color: tokens.ink.text,
        }}
      >
        {title}
      </Box>
      <Box sx={{ mt: '4px', fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.secondary }}>{summary}</Box>

      {changes && changes.length > 0 && (
        <Box sx={{ mt: '10px' }}>
          <BeforeAfterList changes={changes} />
        </Box>
      )}

      {children && <Box sx={{ mt: '12px', fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small }}>{children}</Box>}

      {decided ? (
        <Box sx={{ mt: '12px', fontSize: tokens.font.size.small, fontWeight: tokens.font.weight.label, color: decided.color }}>{decided.text}</Box>
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, mt: '12px' }}>
          <Button variant="contained" color="dark" size="dense" onClick={onAccept} disabled={busy || !onAccept}>
            Accept
          </Button>
          <Button variant="outlined" size="dense" onClick={onReject} disabled={busy || !onReject}>
            Reject
          </Button>
          {onWhy && (
            <Button variant="text" size="dense" onClick={onWhy} disabled={busy} sx={{ ml: 'auto', px: '8px', mr: '-8px' }}>
              Why?
            </Button>
          )}
        </Box>
      )}
    </Box>
  )
}
