// Owns: the weekly tape on the Log tab (SPEC §6; 1d Summit rail card) — the last value of each site (neck, chest, waist
// at navel, hips, both arms, both thighs, in cm) as a centred grid of Outfit figures, with the waist's change since the
// first tape and the waist-to-hip ratio, when the next tape is due (a week after the last), and "Measure now" opening
// the form: each site's last value greyed in as the placeholder; only the sites filled in are sent (POST
// /api/measurements, which replaces a site already logged that date).
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Collapse from '@mui/material/Collapse'
import { endpoints } from '@fitness/shared/api'
import type { MeasurementSite } from '@fitness/shared/schemas'
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { problemText, useApiQuery } from '../../../api'
import {
  formatDay,
  formatNumber,
  formatShortDate,
  formatSigned,
  formatWeekday,
  NumberField,
  parseNumber,
  PendingBadge,
  visuallyHidden,
} from '../../../components'
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
      ...(trend.data?.measurements ?? []).map((m) => ({
        site: m.site,
        cm: m.value_cm,
        date: m.date,
        pending: false,
      })),
      ...pending.flatMap((p) =>
        p.body.entries.map((e) => ({ site: e.site, cm: e.value_cm, date: p.body.date, pending: true })),
      ),
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
  const lastDate = [...last.values()].reduce<string | null>(
    (max, r) => (max === null || r.date > max ? r.date : max),
    null,
  )
  const anyPending = [...last.values()].some((r) => r.pending)

  // The waist's change since the first tape in the window (2a: "108.0 −1.5"), and the waist-to-hip ratio.
  const firstWaist = (trend.data?.measurements ?? [])
    .filter((m) => m.site === 'waist_navel' && m.date <= date)
    .reduce<{ cm: number; date: string } | null>(
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
      meta={
        <>
          {anyPending && <PendingBadge />}
          <CardMeta>
            {lastDate ? `${formatWeekday(lastDate)}, ${formatShortDate(lastDate)}` : 'Weekly tape, cm'}
          </CardMeta>
        </>
      }
      testId="log-measurements"
    >
      {trend.isError && !trend.data && (
        <Box sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.secondary, mb: 2 }}>
          Last values didn't load; you can still log today's.
        </Box>
      )}
      <Box
        component="dl"
        sx={{
          m: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: '12px 10px',
          textAlign: 'center',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <Site label="Neck">{cm('neck')}</Site>
        <Site label="Chest">{cm('chest')}</Site>
        <Site
          label="Waist"
          change={
            waistChange !== null && Math.abs(waistChange) >= 0.05 && firstWaist ? (
              <Box
                component="span"
                sx={{ color: waistChange < 0 ? tokens.tone.success.text : tokens.ink.label }}
              >
                {formatSigned(waistChange, 1)}
                <Box
                  component="span"
                  sx={visuallyHidden}
                >{` cm since ${formatShortDate(firstWaist.date)}`}</Box>
              </Box>
            ) : undefined
          }
        >
          {cm('waist_navel')}
        </Site>
        <Site label="Hips">{cm('hips')}</Site>
        <Site label="Arm L / R" wide>
          {cm('left_arm')} / {cm('right_arm')}
        </Site>
        <Site label="Thigh L / R" wide>
          {cm('left_thigh')} / {cm('right_thigh')}
        </Site>
      </Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0 6px',
          mt: '10px',
          fontSize: tokens.font.size.small,
          fontWeight: tokens.font.weight.body,
          color: tokens.ink.secondary,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span>
          Waist-to-hip {waist && hips && hips.cm > 0 ? formatNumber(waist.cm / hips.cm, 2) : '—'}
          {' ·'}
        </span>
        <Button
          variant="text"
          aria-expanded={open}
          aria-controls={formId}
          onClick={() => setOpen((o) => !o)}
          sx={{
            px: '6px',
            ml: '-6px',
            fontSize: tokens.font.size.small,
            fontWeight: tokens.font.weight.heading,
            '&:hover': { bgcolor: 'transparent', color: tokens.accent.deep },
          }}
        >
          {due === null
            ? 'Measure now'
            : `Measure now · ${due > date ? `due ${formatWeekday(due)}` : due === date ? 'due today' : 'overdue'}`}
        </Button>
      </Box>
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
              {
                body: {
                  date,
                  entries: entries.map((e) => ({
                    id: crypto.randomUUID(),
                    site: e.site,
                    value_cm: Math.round(e.cm * 10) / 10,
                  })),
                },
              },
              {
                onSuccess: (o) => {
                  setValues({})
                  setSaved(
                    `Saved ${entries.length} ${entries.length === 1 ? 'site' : 'sites'} for ${formatDay(date)}${o.status === 'queued' ? ' on this device' : ''}.`,
                  )
                },
              },
            )
          }}
          sx={{ display: 'grid', gap: 3, pt: 4 }}
        >
          {/* Row gap clears each field's helper line ("Last Oct 17") from the next row's label. */}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 2, rowGap: 4 }}>
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
                  helperText={
                    n !== null && (n <= 0 || n > 300)
                      ? 'Enter 1–300 cm'
                      : prev
                        ? `Last ${prev.date === todayLocal() ? 'today' : formatShortDate(prev.date)}`
                        : ' '
                  }
                  error={n !== null && (n <= 0 || n > 300)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              )
            })}
          </Box>
          <Box
            sx={{
              fontSize: tokens.font.size.caption,
              color: save.isError ? tokens.tone.danger.text : tokens.ink.secondary,
              minHeight: 18,
            }}
            aria-live="polite"
          >
            {save.isError
              ? problemText(save.error)
              : (saved ?? 'Fill in the sites you measured; the rest stay as they were.')}
          </Box>
          <Button
            type="submit"
            variant="contained"
            disabled={entries.length === 0 || !allValid || save.isPending}
          >
            {save.isPending
              ? 'Saving…'
              : entries.length > 0
                ? `Save ${entries.length} ${entries.length === 1 ? 'site' : 'sites'}`
                : 'Save'}
          </Button>
        </Box>
      </Collapse>
    </LogCard>
  )
}

/** One tape site: 12/600 muted label over its Outfit 17 value, and an optional change under it. */
function Site({
  label,
  change,
  wide = false,
  children,
}: {
  label: string
  change?: ReactNode
  /** Two columns: a left / right pair. */
  wide?: boolean
  children: ReactNode
}) {
  return (
    <Box sx={{ minWidth: 0, gridColumn: wide ? 'span 2' : undefined }}>
      <Box
        component="dt"
        sx={{
          fontSize: tokens.font.size.caption,
          fontWeight: tokens.font.weight.heading,
          color: tokens.ink.secondary,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Box>
      <Box
        component="dd"
        sx={{
          m: 0,
          fontFamily: tokens.font.display,
          fontSize: 17,
          fontWeight: tokens.font.weight.number,
          lineHeight: 1.35,
          overflowWrap: 'anywhere',
        }}
      >
        {children}
        {change && (
          <Box
            component="span"
            sx={{
              display: 'block',
              fontFamily: tokens.font.family,
              fontSize: tokens.font.size.caption,
              fontWeight: tokens.font.weight.heading,
              lineHeight: 1.3,
            }}
          >
            {change}
          </Box>
        )}
      </Box>
    </Box>
  )
}
