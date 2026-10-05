// Owns: the empty state: an unDraw illustration (public/illustrations, see SOURCE.md there), a title, one line
// of body text and an optional action. `compact` fits inside a chart card.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import type { ReactNode } from 'react'
import { tokens } from '../../theme'

/** Files in apps/web/public/illustrations/ (add the SVG and the name together). */
export const ILLUSTRATIONS = ['empty', 'training', 'meals', 'progress', 'schedule', 'goals'] as const
export type Illustration = (typeof ILLUSTRATIONS)[number]

/** Intrinsic size of each SVG (its viewBox), so the browser reserves the right box before it loads (no layout shift). */
const ILLUSTRATION_SIZE: Readonly<Record<Illustration, readonly [width: number, height: number]>> = {
  empty: [648, 632],
  training: [960, 665],
  meals: [296, 658],
  progress: [960, 665],
  schedule: [801, 779],
  goals: [960, 769],
}

export function illustrationUrl(name: Illustration): string {
  return `${import.meta.env.BASE_URL}illustrations/${name}.svg`
}

export interface EmptyStateProps {
  title: string
  body?: ReactNode
  /** Default `empty`. Pass `null` for text only. */
  illustration?: Illustration | null
  /** A button `{ label, onClick }`, or any node. */
  action?: { label: string; onClick: () => void } | ReactNode
  /** Smaller illustration and spacing, for use inside a card. */
  compact?: boolean
  testId?: string
}

function isButtonAction(a: EmptyStateProps['action']): a is { label: string; onClick: () => void } {
  return typeof a === 'object' && a !== null && 'label' in a && 'onClick' in a
}

export function EmptyState({
  title,
  body,
  illustration = 'empty',
  action,
  compact = false,
  testId,
}: EmptyStateProps) {
  return (
    <Box
      data-testid={testId ?? 'empty-state'}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        px: compact ? 2 : 4,
        py: compact ? 4 : 8,
      }}
    >
      {illustration && (
        <Box
          component="img"
          src={illustrationUrl(illustration)}
          alt=""
          decoding="async"
          width={ILLUSTRATION_SIZE[illustration][0]}
          height={ILLUSTRATION_SIZE[illustration][1]}
          sx={{ height: compact ? 88 : 140, width: 'auto', maxWidth: '80%', objectFit: 'contain', mb: compact ? 3 : 5 }}
        />
      )}
      <Box
        sx={{
          fontSize: compact ? 16 : 18,
          fontWeight: tokens.font.weight.heading,
          color: tokens.ink.text,
          lineHeight: 1.3,
        }}
      >
        {title}
      </Box>
      {body && (
        <Box sx={{ mt: 1.5, fontSize: tokens.font.size.small, color: tokens.ink.secondary, lineHeight: 1.5, maxWidth: 320 }}>
          {body}
        </Box>
      )}
      {action && (
        <Box sx={{ mt: compact ? 3 : 5 }}>
          {isButtonAction(action) ? (
            <Button variant="contained" onClick={action.onClick}>
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
