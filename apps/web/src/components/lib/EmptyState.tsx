// Owns: the 1d empty state — a 2 px dashed lilac slot (`dashedSurface`) at the card radius, an Outfit 400 title, one 13 px
// muted line and one soft violet action on the right (wrapping under the text when narrow). The Log's empty meal slots
// ("Add dinner") are the pattern. `compact` tightens the padding and the radius for a slot inside a chart card.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import type { ReactNode } from 'react'
import { tokens } from '../../theme'
import { dashedSurface, displayTitle } from './surfaces'

export interface EmptyStateProps {
  title: string
  body?: ReactNode
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
        ...dashedSurface,
        px: compact ? `${tokens.pad.dense.x}px` : `${tokens.pad.card.x}px`,
        py: compact ? '14px' : `${tokens.pad.dense.y}px`,
        borderRadius: `${compact ? tokens.radius.small : tokens.radius.card}px`,
        minWidth: 0,
      }}
    >
      <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
        <Box
          sx={{
            ...displayTitle('card'),
            fontSize: compact ? 17 : tokens.font.size.cardTitle,
            color: tokens.ink.text,
          }}
        >
          {title}
        </Box>
        {body && (
          <Box
            sx={{
              mt: '2px',
              fontSize: tokens.font.size.small,
              lineHeight: tokens.font.leading.small,
              color: tokens.ink.secondary,
            }}
          >
            {body}
          </Box>
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
