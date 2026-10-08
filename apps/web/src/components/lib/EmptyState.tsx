// Owns: the 2a empty state — a dashed #D4D4D8 slot on #FAFAFA at the card radius, a 16/600 title, one 13 px muted line
// and one outline action on the right (wrapping under the text when narrow). The Log's empty meal slots are the
// pattern. `compact` tightens the padding for a slot inside a chart card.
//
// 2a dropped the unDraw illustrations from the render. The `illustration` prop, `ILLUSTRATIONS` and `illustrationUrl`
// stay exported so no caller breaks (public/illustrations is untouched); the cleanup phase removes them.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import type { ReactNode } from 'react'
import { tokens } from '../../theme'

/** Files in apps/web/public/illustrations/ (no longer drawn; kept for callers until cleanup). */
export const ILLUSTRATIONS = ['empty', 'training', 'meals', 'progress', 'schedule', 'goals'] as const
export type Illustration = (typeof ILLUSTRATIONS)[number]

export function illustrationUrl(name: Illustration): string {
  return `${import.meta.env.BASE_URL}illustrations/${name}.svg`
}

export interface EmptyStateProps {
  title: string
  body?: ReactNode
  /** Legacy: ignored by the 2a render (kept so callers compile). */
  illustration?: Illustration | null
  /** An outline button `{ label, onClick }`, or any node. */
  action?: { label: string; onClick: () => void } | ReactNode
  /** Tighter padding, for use inside a card. */
  compact?: boolean
  testId?: string
}

function isButtonAction(a: EmptyStateProps['action']): a is { label: string; onClick: () => void } {
  return typeof a === 'object' && a !== null && 'label' in a && 'onClick' in a
}

export function EmptyState({ title, body, action, compact = false, testId }: EmptyStateProps) {
  return (
    <Box
      data-testid={testId ?? 'empty-state'}
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '10px 16px',
        px: compact ? `${tokens.pad.dense.x}px` : `${tokens.pad.card.x}px`,
        py: compact ? '14px' : `${tokens.pad.dense.y}px`,
        borderRadius: `${tokens.radius.card}px`,
        border: `1px dashed ${tokens.ink.dashed}`,
        bgcolor: tokens.ink.panel,
        minWidth: 0,
      }}
    >
      <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
        <Box sx={{ fontSize: tokens.font.size.cardTitle, fontWeight: tokens.font.weight.heading, lineHeight: tokens.font.leading.cardTitle, color: tokens.ink.text }}>
          {title}
        </Box>
        {body && (
          <Box sx={{ mt: '2px', fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.secondary }}>{body}</Box>
        )}
      </Box>
      {action && (
        <Box sx={{ flex: 'none' }}>
          {isButtonAction(action) ? (
            <Button variant="outlined" onClick={action.onClick}>
              {action.label}
            </Button>
          ) : (
            action
          )}
        </Box>
      )}
    </Box>
  )
}
