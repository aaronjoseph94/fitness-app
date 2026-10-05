// Owns: the weekly tape form (SPEC §6) — neck, chest, waist at navel, hips, both arms, both thighs, in cm — with each
// site's last value greyed in as the placeholder; only the sites filled in are sent (POST /api/measurements, which
// replaces a site already logged that date).
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { endpoints } from '@fitness/shared/api'
import type { MeasurementSite } from '@fitness/shared/schemas'
import { useEffect, useMemo, useState } from 'react'
import { problemText, useApiQuery } from '../../../api'
import { formatNumber, NumberField, parseNumber, PendingBadge } from '../../../components'
import { tokens } from '../../../theme'
import { shiftDate, useLogMutation, usePendingLogs } from '../../quick-log'
import { LogCard } from './LogCard'

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

  return (
    <LogCard
      title="Measurements"
      color={tokens.metric.weight}
      subtitle={lastDate ? `Weekly tape, cm · last ${lastDate}` : 'Weekly tape, cm'}
      badge={anyPending ? <PendingBadge /> : undefined}
      collapsible
      testId="log-measurements"
    >
      <Box
        component="form"
        noValidate
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
        sx={{ display: 'grid', gap: 3 }}
      >
        {trend.isError && !trend.data && (
          <Box sx={{ fontSize: tokens.font.size.label, color: 'text.secondary' }}>Last values didn't load; you can still log today's.</Box>
        )}
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
                helperText={prev ? `last ${prev.date === date ? 'today' : prev.date}` : ' '}
                error={n !== null && (n <= 0 || n > 300)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            )
          })}
        </Box>
        <Box sx={{ fontSize: tokens.font.size.label, color: save.isError ? 'error.main' : 'text.secondary', minHeight: 20 }} aria-live="polite">
          {save.isError ? problemText(save.error) : saved ?? 'Fill in the sites you measured; the rest stay as they were.'}
        </Box>
        <Button type="submit" variant="contained" disabled={entries.length === 0 || !allValid || save.isPending}>
          {save.isPending ? 'Saving…' : entries.length > 0 ? `Save ${entries.length} ${entries.length === 1 ? 'site' : 'sites'}` : 'Save'}
        </Button>
      </Box>
    </LogCard>
  )
}
