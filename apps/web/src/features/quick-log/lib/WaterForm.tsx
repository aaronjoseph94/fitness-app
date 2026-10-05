// Owns: the water quick-add — the day's total against its target, one-tap 250 / 500 / 750 ml chips and a custom
// amount (POST /api/water with a client id and the time it was drunk), and Undo for the last tap (DELETE /api/water/:id,
// queued like the add when offline). The sheet stays open so taps can repeat.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import { endpoints } from '@fitness/shared/api'
import { useState } from 'react'
import { formatNumber, MetricRing, NumberField, parseNumber, PendingBadge } from '../../../components'
import { tokens } from '../../../theme'
import { instantOnDate, todayLocal } from './dates'
import { useWater } from './reads'
import { type LogNotice } from './ui'
import { useLogMutation } from './writes'
import { problemText } from '../../../api'

const QUICK_ML = [250, 500, 750] as const

export function WaterForm({ date, onLogged }: { date: string; onLogged?: (notice: LogNotice) => void }) {
  const water = useWater(date)
  const add = useLogMutation(endpoints.water.create)
  const remove = useLogMutation(endpoints.water.delete)
  const [customOpen, setCustomOpen] = useState(false)
  const [custom, setCustom] = useState('')
  const [last, setLast] = useState<{ id: string; ml: number; queued: boolean } | null>(null)

  const log = (ml: number) => {
    const id = crypto.randomUUID()
    add.mutate(
      { body: { id, amount_ml: ml, logged_at: instantOnDate(date) } },
      {
        onSuccess: (outcome) => {
          setLast({ id, ml, queued: outcome.status === 'queued' })
          onLogged?.({ message: `Added ${formatNumber(ml)} ml`, queued: outcome.status === 'queued' })
        },
      },
    )
  }

  /** Take back the last tap (a mis-tap on 750 ml): the entry is deleted, or its delete queued behind it offline. */
  const undo = () => {
    if (!last) return
    const { id, ml } = last
    remove.mutate(
      { params: { id } },
      {
        onSuccess: (outcome) => {
          setLast(null)
          onLogged?.({ message: `Removed ${formatNumber(ml)} ml`, queued: outcome.status === 'queued' })
        },
      },
    )
  }

  const customMl = parseNumber(custom)
  const customValid = customMl !== null && Number.isInteger(customMl) && customMl >= 1 && customMl <= 5000
  const left = Math.max(0, water.targetMl - water.totalMl)

  return (
    <Box sx={{ display: 'grid', gap: 4 }} data-testid="water-form">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <MetricRing value={water.totalMl} target={water.targetMl} metric="water" size={72} label="Water" unit="ml" centre={water.known ? `${Math.round((water.totalMl / Math.max(1, water.targetMl)) * 100)}%` : '—'} />
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ fontSize: 28, fontWeight: tokens.font.weight.number, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
            {water.known ? formatNumber(water.totalMl) : '—'}
            <Box component="span" sx={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.label, color: 'text.secondary' }}>
              {' '}
              / {formatNumber(water.targetMl)} ml
            </Box>
          </Box>
          <Box sx={{ fontSize: tokens.font.size.small, color: 'text.secondary', mt: 0.5 }}>
            {date === todayLocal() ? 'Today' : date}
            {' · '}
            {!water.known
              ? water.isLoading
                ? 'Loading the total…'
                : "Total didn't load; taps still log"
              : left > 0
                ? `${formatNumber(left)} ml to go`
                : 'Target reached'}
          </Box>
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2 }}>
        {QUICK_ML.map((ml) => (
          <Chip
            key={ml}
            label={`${ml} ml`}
            variant="outlined"
            onClick={() => log(ml)}
            data-testid={`water-${ml}`}
            sx={{
              height: tokens.tapTarget,
              borderRadius: tokens.radius.chip,
              fontVariantNumeric: 'tabular-nums',
              '& .MuiChip-label': { px: 1 },
            }}
          />
        ))}
        <Chip
          label="Custom"
          variant={customOpen ? 'filled' : 'outlined'}
          onClick={() => setCustomOpen((o) => !o)}
          sx={{ height: tokens.tapTarget, borderRadius: tokens.radius.chip, '& .MuiChip-label': { px: 1 } }}
        />
      </Box>

      {customOpen && (
        <Box
          component="form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            if (customValid && customMl !== null) {
              log(customMl)
              setCustom('')
            }
          }}
          sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 2, alignItems: 'center' }}
        >
          <NumberField label="Amount" value={custom} onChange={setCustom} unit="ml" integer autoFocus />
          <Button type="submit" variant="contained" disabled={!customValid}>
            Add
          </Button>
        </Box>
      )}

      <Box sx={{ minHeight: 24, display: 'flex', alignItems: 'center', gap: 2, fontSize: tokens.font.size.small, color: 'text.secondary' }} aria-live="polite">
        {add.isError || remove.isError ? (
          <Box component="span" sx={{ color: 'error.main' }}>
            {problemText(add.error ?? remove.error)}
          </Box>
        ) : last ? (
          <>
            Added {formatNumber(last.ml)} ml
            {last.queued && <PendingBadge />}
            <Button size="small" onClick={undo} disabled={remove.isPending} sx={{ minHeight: tokens.tapTarget, ml: 'auto' }} data-testid="water-undo">
              Undo
            </Button>
          </>
        ) : water.pending.some((p) => p.queued) ? (
          <PendingBadge count={water.pending.filter((p) => p.queued).length} />
        ) : (
          'One tap logs it.'
        )}
      </Box>
    </Box>
  )
}
