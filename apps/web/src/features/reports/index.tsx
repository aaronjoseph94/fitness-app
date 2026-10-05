// Owns: the printable weekly report page /reports/week/:week (SPEC §8 weekly review, §11 print) — the module's entry
// point (WeeklyReportPage). It loads the week (review or live engine metrics, days, trend, history, next week's plan),
// lays it out for screen or Letter paper, and marks itself ready (data-report-ready) for the Browser Rendering PDF.
// `?print=1` (what the Worker renders) and the browser's beforeprint event both switch the charts to fixed widths.
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import { useCallback, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { useParams, useSearchParams } from 'react-router'
import { formatNumber, formatSigned } from '../../components'
import { PrintStyles } from './lib/parts'
import { ReportToolbar } from './lib/ReportToolbar'
import { shiftWeek, weekRange } from './lib/series'
import { useWeeklyReport } from './lib/useWeeklyReport'
import { WeeklyReport } from './lib/WeeklyReport'

/** True between the browser's beforeprint and afterprint, applied synchronously so the printout gets fixed widths. */
function usePrinting(): boolean {
  const [printing, setPrinting] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('print').matches)
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true))
    const after = () => setPrinting(false)
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [])
  return printing
}

export function WeeklyReportPage() {
  const { week } = useParams()
  const range = weekRange(week)
  if (!range)
    return (
      <Alert severity="warning" data-testid="report-bad-week">
        “{week}” is not a week. Reports live at /reports/week/YYYY-Www, for example /reports/week/2026-W40.
      </Alert>
    )
  return <Report key={range.week} range={range} />
}

function Report({ range }: { range: { week: string; from: string; to: string } }) {
  const [params] = useSearchParams()
  const printing = usePrinting()
  const fixed = params.get('print') === '1' || printing
  const data = useWeeklyReport(range)
  const { refetch } = data
  const onDrafted = useCallback(() => void refetch(), [refetch])
  const m = data.metrics
  const header = m
    ? `Weekly report ${range.week} · trend ${formatNumber(m.trend_end_kg, 1)} kg${m.trend_change_kg === null ? '' : ` (${formatSigned(m.trend_change_kg, 1)} kg)`}`
    : `Weekly report ${range.week}`

  return (
    <Box
      data-report
      data-testid="weekly-report"
      data-report-ready={data.ready ? 'true' : 'false'}
      sx={{
        // The print frame pads 15 mm on every screen; give phones their 16 px gutter back.
        mx: { xs: 'calc(16px - 15mm)', sm: 0 },
        my: { xs: 'calc(16px - 15mm)', sm: 0 },
        '@media print': { m: 0 },
        color: 'text.primary',
      }}
    >
      <PrintStyles header={header} />
      <ReportToolbar
        week={range.week}
        prevWeek={shiftWeek(range.from, -1)}
        nextWeek={shiftWeek(range.from, 1)}
        author={data.review?.author ?? null}
        onDrafted={onDrafted}
      />
      {data.reviewError ? (
        <Alert severity="error">Could not load the review: {data.reviewError.message}</Alert>
      ) : m && data.days ? (
        <WeeklyReport
          week={range.week}
          from={range.from}
          to={range.to}
          review={data.review}
          metrics={m}
          days={data.days}
          trend={data.trend}
          history={data.history}
          nextPlan={data.nextPlan}
          nextStart={data.nextStart}
          fixed={fixed}
        />
      ) : data.ready ? (
        <Alert severity="error">Could not load this week. Check the connection and reload.</Alert>
      ) : (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 10 }}>
          <CircularProgress aria-label="Loading the report" />
        </Box>
      )}
    </Box>
  )
}
