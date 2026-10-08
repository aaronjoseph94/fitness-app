// Owns: the weekly tape on the Log tab (SPEC §6) — the last value of each site (neck, chest, waist at navel, hips, both
// arms, both thighs, in cm) with the waist's change since the first tape and the waist-to-hip ratio, when the next tape
// is due (a week after the last), and "Measure now" opening the form: each site's last value greyed in as the
// placeholder; only the sites filled in are sent (POST /api/measurements, which replaces a site already logged that date).
import StraightenRounded from '@mui/icons-material/StraightenRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Collapse from '@mui/material/Collapse'
import { endpoints } from '@fitness/shared/api'
import type { MeasurementSite } from '@fitness/shared/schemas'
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { problemText, useApiQuery } from '../../../api'
import { formatNumber, formatShortDate, formatSigned, formatWeekday, NumberField, parseNumber, PendingBadge, visuallyHidden } from '../../../components'
import { tokens } from '../../../theme'
import { shiftDate, todayLocal, useLogMutation, usePendingLogs } from '../../quick-log'
import { CardMeta, LogCard } from './LogCard'

const SITES: { site: MeasurementSite; label: string }[] = [
  { site: 'neck', label: 'Neck' },
  { site: 'chest', label: 'Chest' },
  { site: 'waist_navel', label: 'Waist at navel' },
  { site: 'hips', label: 'Hips' },
  { site: 'left_arm', label: 'Left arm' },
  { site: 'right_arm', label: 'Right arm' },
  { site: 'left_thigh', label: 'Left thigh' },
  { site: 'right_thigh', label: 'Right thigh' },
]

type Values = Partial<Record<MeasurementSite, string>>

export function MeasurementsCard({ date }: { date: string }) {
  const trend = useApiQuery(endpoints.body.trend, { query: { from: shiftDate(date, -365), to: date } })
  const pending = usePendingLogs(endpoints.body.createMeasurements)
  const save = useLogMutation(endpoints.body.createMeasurements)
  const [values, setValues] = useState<Values>({})
  const [saved, setSaved] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const formId = useId()

  /** Latest value per site on or before `date` (synced or pending), and the date it was taken. */
  const last = useMemo(() => {
    const out = new Map<MeasurementSite, { cm: number; date: string; pending: boolean }>()
    const rows = [
      ...(trend.data?.measurements ?? []).map((m) => ({ site: m.site, cm: m.value_cm, date: m.date, pending: false })),
      ...pending.flatMap((p) => p.body.entries.map((e) => ({ site: e.site, cm: e.value_cm, date: p.body.date, pending: true }))),
    ].filter((r) => r.date <= date)
    rows.sort((a, b) => a.date.localeCompare(b.date))
    for (const r of rows) out.set(r.site, r)
    return out
  }, [trend.data, pending, date])

  useEffect(() => {
    setValues({})
    setSaved(null)
  }, [date])

  const entries = SITES.flatMap(({ site }) => {
    const n = parseNumber(values[site] ?? '')
    return n === null ? [] : [{ site, cm: n }]
  })
  const allValid = entries.every((e) => e.cm > 0 && e.cm <= 300)
  const lastDate = [...last.values()].reduce<string | null>((max, r) => (max === null || r.date > max ? r.date : max), null)
  const anyPending = [...last.values()].some((r) => r.pending)

  // The waist's change since the first tape in the window (2a: "108.0 −1.5"), and the waist-to-hip ratio.
  const firstWaist = (trend.data?.measurements ?? []).filter((m) => m.site === 'waist_navel' && m.date <= date).reduce<{ cm: number; date: string } | null>(
    (first, m) => (first === null || m.date < first.date ? { cm: m.value_cm, date: m.date } : first),
    null,
  )
  const waist = last.get('waist_navel')
  const hips = last.get('hips')
  const waistChange = waist && firstWaist && firstWaist.date < waist.date ? waist.cm - firstWaist.cm : null
  const due = lastDate ? shiftDate(lastDate, 7) : null
  const cm = (site: MeasurementSite) => formatNumber(last.get(site)?.cm, 1)

  return (
    <LogCard
      title="Measurements"
      icon={StraightenRounded}
      meta={
        <>
          {anyPending && <PendingBadge />}
          <CardMeta>{lastDate ? `Weekly tape · last ${formatWeekday(lastDate)}, ${formatShortDate(lastDate)}` : 'Weekly tape, cm'}</CardMeta>
        </>
      }
      testId="log-measurements"
    >
      {trend.isError && !trend.data && (
        <Box sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.secondary, mb: 2 }}>Last values didn't load; you can still log today's.</Box>
      )}
      <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px 8px', fontSize: tokens.font.size.caption }}>
        <Site label="Neck">{cm('neck')}</Site>
        <Site label="Chest">{cm('chest')}</Site>
        <Site label="Waist">
          {cm('waist_navel')}
          {waistChange !== null && Math.abs(waistChange) >= 0.05 && firstWaist && (
            <Box component="span" sx={{ color: waistChange < 0 ? tokens.tone.success.text : tokens.ink.label }}>
              {' '}
              {formatSigned(waistChange, 1)}
              <Box component="span" sx={visuallyHidden}>{` cm since ${formatShortDate(firstWaist.date)}`}</Box>
            </Box>
          )}
        </Site>
        <Site label="Hips">{cm('hips')}</Site>
        <Site label="Arm L / R">
          {cm('left_arm')} / {cm('right_arm')}
        </Site>
        <Site label="Thigh L / R">
          {cm('left_thigh')} / {cm('right_thigh')}
        </Site>
        <Site label="Waist-to-hip" wide>
          {waist && hips && hips.cm > 0 ? formatNumber(waist.cm / hips.cm, 2) : '—'}
        </Site>
      </Box>
      <Button variant="outlined" size="tiny" aria-expanded={open} aria-controls={formId} onClick={() => setOpen((o) => !o)} sx={{ mt: 3 }}>
        {due === null ? 'Measure now' : `Measure now · ${due > date ? `due ${formatWeekday(due)}` : due === date ? 'due today' : 'overdue'}`}
      </Button>
      <Collapse in={open} unmountOnExit>
        <Box
          component="form"
          id={formId}
          noValidate
          aria-label="Weekly tape"
          onSubmit={(e) => {
            e.preventDefault()
            if (entries.length === 0 || !allValid) return
            save.mutate(
              { body: { date, entries: entries.map((e) => ({ id: crypto.randomUUID(), site: e.site, value_cm: Math.round(e.cm * 10) / 10 })) } },
              {
                onSuccess: (o) => {
                  setValues({})
                  setSaved(`Saved ${entries.length} ${entries.length === 1 ? 'site' : 'sites'} for ${date}${o.status === 'queued' ? ' on this phone' : ''}.`)
                },
              },
            )
          }}
          sx={{ display: 'grid', gap: 3, pt: 4 }}
        >
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            {SITES.map(({ site, label }) => {
              const prev = last.get(site)
              const n = parseNumber(values[site] ?? '')
              return (
                <NumberField
                  key={site}
                  label={label}
                  value={values[site] ?? ''}
                  onChange={(v) => setValues((s) => ({ ...s, [site]: v }))}
                  unit="cm"
                  placeholder={prev ? formatNumber(prev.cm, 1) : undefined}
                  helperText={prev ? `last ${prev.date === todayLocal() ? 'today' : prev.date}` : ' '}
                  error={n !== null && (n <= 0 || n > 300)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              )
            })}
          </Box>
          <Box sx={{ fontSize: tokens.font.size.caption, color: save.isError ? tokens.tone.danger.text : tokens.ink.secondary, minHeight: 18 }} aria-live="polite">
            {save.isError ? problemText(save.error) : saved ?? 'Fill in the sites you measured; the rest stay as they were.'}
          </Box>
          <Button type="submit" variant="contained" disabled={entries.length === 0 || !allValid || save.isPending}>
            {save.isPending ? 'Saving…' : entries.length > 0 ? `Save ${entries.length} ${entries.length === 1 ? 'site' : 'sites'}` : 'Save'}
          </Button>
        </Box>
      </Collapse>
    </LogCard>
  )
}

/** One tape site: 12 px muted label over its 600 value. */
function Site({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <Box sx={{ minWidth: 0, gridColumn: wide ? 'span 2' : undefined, alignSelf: 'end' }}>
      <Box component="dt" sx={{ color: tokens.ink.secondary }}>
        {label}
      </Box>
      <Box component="dd" sx={{ m: 0, fontWeight: tokens.font.weight.heading, fontVariantNumeric: 'tabular-nums' }}>
        {children}
      </Box>
    </Box>
  )
}
