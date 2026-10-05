// Owns: small pieces the Data page's cards share — the titled card shell, a labelled determinate progress line,
// how an instant reads (Edmonton local date and time), byte sizes, and turning a failed call into one sentence.
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import LinearProgress from '@mui/material/LinearProgress'
import { localTime, today } from '@fitness/shared/engine'
import type { ReactNode } from 'react'
import { isApiError, problemText } from '../../../api'
import { formatNumber } from '../../../components'
import { tokens } from '../../../theme'

export function DataCard({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <Card component="section" aria-labelledby={`${id}-title`} data-testid={`data-${id}`} sx={{ p: 4 }}>
      <Box
        component="h2"
        id={`${id}-title`}
        sx={{ m: 0, fontSize: tokens.font.size.cardTitle, fontWeight: tokens.font.weight.heading, lineHeight: 1.3 }}
      >
        {title}
      </Box>
      {children}
    </Card>
  )
}

export function Help({ children }: { children: ReactNode }) {
  return <Box sx={{ mt: 1.5, fontSize: tokens.font.size.small, lineHeight: 1.55, color: tokens.ink.secondary }}>{children}</Box>
}

export function ProgressLine({
  done,
  total,
  label,
  unit,
  testId,
}: {
  done: number
  total: number
  label: string
  unit: string
  testId: string
}) {
  const value = total > 0 ? Math.min(100, (done / total) * 100) : 0
  return (
    <Box sx={{ mt: 4 }} data-testid={testId}>
      <LinearProgress
        variant="determinate"
        value={value}
        aria-label={label}
        sx={{ height: 8, borderRadius: tokens.radius.chip }}
      />
      <Box sx={{ mt: 1.5, display: 'flex', gap: 2, fontSize: tokens.font.size.label, color: tokens.ink.secondary }}>
        <Box
          sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {label}
        </Box>
        <Box sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {formatNumber(done)} / {formatNumber(total)} {unit}
        </Box>
      </Box>
    </Box>
  )
}

/** "2026-10-05 08:14" in Edmonton. */
export const localStamp = (instant: string) => `${today(instant)} ${localTime(instant)}`

/** 1536 → "1.5 KB", 12_900_000 → "12.3 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${formatNumber(bytes / 1024, 1)} KB`
  return `${formatNumber(bytes / (1024 * 1024), 1)} MB`
}

/** One sentence for a failed export or restore: an API failure in the app's usual words, else the step's own message. */
export function failureText(error: unknown): string {
  if (isApiError(error)) return problemText(error)
  return error instanceof Error ? error.message : 'Something went wrong.'
}
