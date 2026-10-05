// Owns: fasting on the Log tab — the plan calendar (the fasting strip from two months back to two months ahead, with
// planned, completed and partial fasts), the month's planned count against the rail, and the history list (a planned
// fast never ended opens the fast sheet to resolve it: its real end, or "Didn't fast"; a fast ended within an hour of
// its start — a mis-tap — can be removed, so it no longer counts toward the month's fasts).
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { FastingStrip, type FastEntry } from '../../../charts'
import { formatNumber, LoadProblem, PendingBadge } from '../../../components'
import { tokens } from '../../../theme'
import { endpoints } from '@fitness/shared/api'
import { dateOf, formatDateTime, plannedInMonth, useFasts, useLogMutation, useLogSettings, useNow, type FastView } from '../../quick-log'
import { LoadingRows, LogCard } from './LogCard'

const HISTORY_MAX = 6
/** A fast ended this soon after it started is a mis-tap the Worker lets you remove (DELETE /api/fasts/:id). */
const MISTAP_H = 1

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
  missed: 'Never ended',
}

export function FastingCard({ today, onPlan }: { today: string; onPlan: () => void }) {
  const now = useNow(60_000)
  const { fastsPerMonth } = useLogSettings()
  const from = monthStart(today, -2)
  const to = monthEnd(today, 2)
  const fasting = useFasts({ from, to }, now)
  const remove = useLogMutation(endpoints.fasting.cancel)

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
            <Box sx={{ fontSize: tokens.font.size.small, color: 'text.secondary', mt: 1 }}>No fasts yet. Plan the month's two on the dates that suit you.</Box>
          ) : (
            <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, mt: 1, display: 'grid' }}>
              {history.map((f) => (
                <Box component="li" key={f.id} sx={{ display: 'flex', alignItems: 'center', gap: 2, minHeight: 40, fontSize: tokens.font.size.small, borderTop: 1, borderColor: 'divider' }}>
                  <Box sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatDateTime(f.startedAt)}</Box>
                  <Box sx={{ flex: 1, color: 'text.secondary' }}>{STATUS_TEXT[f.status]}</Box>
                  {f.status === 'missed' && (
                    <Button size="small" variant="text" onClick={onPlan} data-testid="fast-resolve">
                      Resolve
                    </Button>
                  )}
                  {f.status === 'partial' && f.hours !== null && f.hours < MISTAP_H && !f.pending && (
                    <Button size="small" variant="text" onClick={() => remove.mutate({ params: { id: f.id } })} disabled={remove.isPending} data-testid="fast-remove">
                      Remove
                    </Button>
                  )}
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
