// Owns: small pieces the Data page's cards share — the titled 2a card, a labelled determinate progress line,
// how an instant reads (Edmonton local date and time), byte sizes, and turning a failed call into one sentence.
import Box from '@mui/material/Box'
import { localTime, today } from '@fitness/shared/engine'
import type { ReactNode } from 'react'
import { isApiError, problemText } from '../../../api'
import { formatNumber, Panel, ProgressBar, tabularNums } from '../../../components'
import { tokens } from '../../../theme'

/** The 2a card every section of the page sits in: title, a 13 px muted description, then the card's own body. */
export function DataCard({
  id,
  title,
  description,
  tone,
  children,
}: {
  id: string
  title: string
  description?: ReactNode
  tone?: 'card' | 'panel'
  children?: ReactNode
}) {
  return (
    <Panel id={id} title={title} description={description} tone={tone} testId={`data-${id}`}>
      {children}
    </Panel>
  )
}

/** A 13 px muted line inside a card body (a status, a caveat). */
export function Help({ children }: { children: ReactNode }) {
  return <Box sx={{ fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.secondary }}>{children}</Box>
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
  const value = total > 0 ? Math.min(1, done / total) : 0
  return (
    <Box data-testid={testId}>
      <ProgressBar value={value} label={label} />
      <Box sx={{ mt: 2, display: 'flex', gap: 2, fontSize: tokens.font.size.caption, lineHeight: tokens.font.leading.caption, color: tokens.ink.secondary }}>
        <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: tokens.ink.text, fontWeight: tokens.font.weight.label }}>
          {label}
        </Box>
        <Box sx={{ ...tabularNums, whiteSpace: 'nowrap' }}>
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
