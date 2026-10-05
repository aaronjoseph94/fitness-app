// Owns: fasting on the Log tab — the plan calendar (the fasting strip from two months back to two months ahead, with
// planned, completed and partial fasts), the month's planned count against the rail, and the history list.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { FastingStrip, type FastEntry } from '../../../charts'
import { formatNumber, PendingBadge } from '../../../components'
import { tokens } from '../../../theme'
import { dateOf, formatDateTime, LoadProblem, plannedInMonth, useFasts, useLogSettings, useNow, type FastView } from '../../quick-log'
import { LoadingRows, LogCard } from './LogCard'

const HISTORY_MAX = 6

function monthStart(date: string, deltaMonths: number): string {
  const [y, m] = date.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(y, m - 1 + deltaMonths, 1))
  return d.toISOString().slice(0, 10)
}

function monthEnd(date: string, deltaMonths: number): string {
  const [y, m] = date.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(y, m + deltaMonths, 0)).toISOString().slice(0, 10)
}

const STATUS_TEXT: Record<FastView['status'], string> = {
  active: 'Running',
  planned: 'Planned',
  completed: 'Completed',
  partial: 'Partial',
  missed: 'Not started',
}

export function FastingCard({ today, onPlan }: { today: string; onPlan: () => void }) {
  const now = useNow(60_000)
  const { fastsPerMonth } = useLogSettings()
  const from = monthStart(today, -2)
  const to = monthEnd(today, 2)
  const fasting = useFasts({ from, to }, now)

  const strip: FastEntry[] = fasting.fasts.map((f) => ({
    date: dateOf(f.startedAt),
    status: f.status === 'active' ? 'partial' : f.status,
    hours: f.hours,
  }))
  const history = fasting.fasts.filter((f) => f.status !== 'planned').slice(0, HISTORY_MAX)
  const planned = plannedInMonth(fasting.fasts, today)
  const anyPending = fasting.fasts.some((f) => f.pending)

  return (
    <LogCard
      title="Fasting"
      color={tokens.metric.fasting}
      subtitle={`${formatNumber(planned)} of ${formatNumber(fastsPerMonth)} planned this month`}
      badge={anyPending ? <PendingBadge /> : undefined}
      action={
        <Button variant="text" onClick={onPlan}>
          Plan
        </Button>
      }
      testId="log-fasting"
    >
      {fasting.isLoading && fasting.fasts.length === 0 ? (
        <LoadingRows rows={2} />
      ) : fasting.error != null && fasting.fasts.length === 0 ? (
        <LoadProblem what="Your fasts" error={fasting.error} onRetry={fasting.refetch} />
      ) : (
        <>
          <FastingStrip fasts={strip} from={from} to={to} />
          <Box sx={{ mt: 4, fontSize: tokens.font.size.label, fontWeight: tokens.font.weight.label, color: 'text.secondary' }}>History</Box>
          {history.length === 0 ? (
            <Box sx={{ fontSize: 14, color: 'text.secondary', mt: 1 }}>No fasts yet. Plan the month's two on the dates that suit you.</Box>
          ) : (
            <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, mt: 1, display: 'grid' }}>
              {history.map((f) => (
                <Box component="li" key={f.id} sx={{ display: 'flex', alignItems: 'center', gap: 2, minHeight: 40, fontSize: 14, borderTop: 1, borderColor: 'divider' }}>
                  <Box sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatDateTime(f.startedAt)}</Box>
                  <Box sx={{ flex: 1, color: 'text.secondary' }}>{STATUS_TEXT[f.status]}</Box>
                  {f.pending && <PendingBadge />}
                  <Box sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: tokens.font.weight.label }}>{f.hours !== null ? `${formatNumber(f.hours, 1)} h` : '—'}</Box>
                </Box>
              ))}
            </Box>
          )}
        </>
      )}
    </LogCard>
  )
}
