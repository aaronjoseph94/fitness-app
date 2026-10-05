// Owns: the day adjustment card (SPEC §6: after a meal is confirmed, and on Today) — what is left of the day's kcal and
// macros (the day's own numbers, so it shows even when no AI answered), protein status, the AI's two or three
// next-meal suggestions (a favourite logs in one tap at the suggested grams) and its one-line note. A card, never a nag:
// no red, no alarms, nothing that must be dismissed.
import AddRounded from '@mui/icons-material/AddRounded'
import CheckRounded from '@mui/icons-material/CheckRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CircularProgress from '@mui/material/CircularProgress'
import { endpoints } from '@fitness/shared/api'
import type { Remaining } from '@fitness/shared/schemas'
import { useState } from 'react'
import { useApiQuery } from '../../../../api'
import { formatNumber } from '../../../../components'
import { tokens } from '../../../../theme'
import { clockOf, instantAt, todayLocal } from '../dates'
import { defaultSlot, SLOT_LABEL, SLOT_TIME } from '../nutrition'
import { useDay, useLogSettings } from '../reads'
import { noticeFor, problemText, type LogNotice } from '../ui'
import { useLogMutation } from '../writes'
import { suggestionScale, type AdjustmentEvent } from './adjustment'
import { FoodIcon } from './food-icons'

type Status = AdjustmentEvent['body']['status']

const STATUS: Record<Status, { label: string; color: string }> = {
  ok: { label: 'On track', color: tokens.status.good },
  over: { label: 'A little over', color: tokens.status.warning },
  protein_short: { label: 'Protein short', color: tokens.status.warning },
}

const MACROS = [
  { key: 'protein_g', label: 'Protein', color: tokens.metric.protein },
  { key: 'carbs_g', label: 'Carbs', color: tokens.metric.carbs },
  { key: 'fat_g', label: 'Fat', color: tokens.metric.fat },
] as const

export interface DayAdjustmentCardProps {
  date: string
  /** The newest adjustment event for `date`, if the AI has answered. */
  adjustment: AdjustmentEvent | null
  /** An adjustment for the meal just confirmed is on its way. */
  waiting?: boolean
  onLogged?: (notice: LogNotice) => void
}

export function DayAdjustmentCard({ date, adjustment, waiting = false, onLogged }: DayAdjustmentCardProps) {
  const day = useDay(date)
  const remaining: Remaining | null = day.data?.remaining ?? adjustment?.body.remaining ?? null
  if (!remaining && !adjustment) return null
  const status: Status = adjustment?.body.status ?? (remaining && remaining.kcal < 0 ? 'over' : 'ok')
  const kcal = remaining?.kcal ?? null
  const protein = remaining?.protein_g ?? null
  const suggestions = adjustment?.body.suggestions ?? []

  return (
    <Card data-testid="day-adjustment" data-status={status} sx={{ p: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ flex: 1, fontSize: tokens.font.size.label, fontWeight: tokens.font.weight.label, color: tokens.ink.secondary }}>
          Rest of {date === todayLocal() ? 'today' : date}
        </Box>
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.5, fontSize: 13, fontWeight: tokens.font.weight.label, color: tokens.ink.text }}>
          <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: tokens.radius.chip, bgcolor: STATUS[status].color }} />
          {STATUS[status].label}
        </Box>
      </Box>

      {kcal !== null && (
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, mt: 2 }}>
          <Box sx={{ fontSize: tokens.font.size.bigNumberSmall, fontWeight: tokens.font.weight.number, fontVariantNumeric: 'tabular-nums', color: tokens.metric.calories, lineHeight: 1.1 }}>
            {formatNumber(Math.abs(kcal))}
          </Box>
          <Box sx={{ fontSize: 15, color: tokens.ink.secondary }}>{kcal >= 0 ? 'kcal left' : 'kcal over'}</Box>
        </Box>
      )}

      {remaining && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, mt: 2, fontSize: 13, color: tokens.ink.secondary, fontVariantNumeric: 'tabular-nums' }}>
          {MACROS.map(({ key, label, color }) => (
            <Box key={key} component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.5 }}>
              <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: tokens.radius.chip, bgcolor: color }} />
              {label} {remaining[key] >= 0 ? `${formatNumber(remaining[key])} g left` : `${formatNumber(-remaining[key])} g over`}
            </Box>
          ))}
        </Box>
      )}

      {/* Protein status in words, unless the AI's note already says it. */}
      {protein !== null && !adjustment?.body.note && (
        <Box sx={{ mt: 2, fontSize: 14, color: tokens.ink.text }}>
          {protein > 0 ? `${formatNumber(protein)} g protein still to go today.` : 'Protein target met for today.'}
        </Box>
      )}

      {adjustment?.body.note && <Box sx={{ mt: 2, fontSize: 14, color: tokens.ink.text, lineHeight: 1.5 }}>{adjustment.body.note}</Box>}

      {suggestions.length > 0 && (
        <Box sx={{ mt: 3, pt: 2, borderTop: `1px solid ${tokens.ink.border}` }}>
          <Box sx={{ fontSize: tokens.font.size.label, fontWeight: tokens.font.weight.label, color: tokens.ink.secondary, mb: 1 }}>Next meal ideas</Box>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
            {suggestions.map((s, i) => (
              <Suggestion key={`${s.favorite_id ?? s.description}-${i}`} date={date} suggestion={s} onLogged={onLogged} />
            ))}
          </Box>
        </Box>
      )}

      {waiting && (
        <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 3, fontSize: 13, color: tokens.ink.secondary }}>
          <CircularProgress size={14} aria-hidden />
          Working out next-meal ideas…
        </Box>
      )}
    </Card>
  )
}

type SuggestionData = AdjustmentEvent['body']['suggestions'][number]

function Suggestion({ date, suggestion, onLogged }: { date: string; suggestion: SuggestionData; onLogged?: (notice: LogNotice) => void }) {
  const favourites = useApiQuery(endpoints.nutrition.listFavourites, {}, { staleTime: 5 * 60_000, enabled: suggestion.favorite_id !== null })
  const { breakfastEnabled } = useLogSettings()
  const create = useLogMutation(endpoints.nutrition.createMeal)
  const [logged, setLogged] = useState(false)
  const favourite = suggestion.favorite_id ? favourites.data?.find((f) => f.id === suggestion.favorite_id) : undefined
  const label = favourite?.label ?? suggestion.description ?? 'A favourite'
  const scale = favourite ? suggestionScale(favourite, suggestion.grams) : null

  const log = () => {
    if (!favourite || scale === null) return
    const isToday = date === todayLocal()
    const slot = defaultSlot(isToday ? clockOf(Date.now()) : SLOT_TIME.dinner, breakfastEnabled)
    create.mutate(
      {
        body: {
          id: crypto.randomUUID(),
          slot,
          eaten_at: isToday ? new Date().toISOString() : instantAt(date, SLOT_TIME[slot]),
          input_method: 'favorite',
          favorite_id: favourite.id,
          scale,
        },
      },
      {
        onSuccess: (outcome) => {
          setLogged(true)
          onLogged?.(noticeFor(outcome, `${SLOT_LABEL[slot]}: ${label} · ${formatNumber(favourite.totals.kcal * scale)} kcal`))
        },
      },
    )
  }

  return (
    <Box component="li" data-testid="adjustment-suggestion" sx={{ display: 'flex', alignItems: 'center', gap: 3, minHeight: tokens.tapTarget }}>
      <FoodIcon name={label} size={32} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ fontSize: 15, lineHeight: 1.35 }}>
          {label}
          <Box component="span" sx={{ color: tokens.ink.secondary, fontVariantNumeric: 'tabular-nums' }}>
            {' '}
            · {formatNumber(suggestion.grams)} g
          </Box>
        </Box>
        {suggestion.why && <Box sx={{ fontSize: 12, color: tokens.ink.secondary, lineHeight: 1.4 }}>{suggestion.why}</Box>}
        {create.isError && (
          <Box role="alert" sx={{ fontSize: 12, color: 'error.main' }}>
            {problemText(create.error)}
          </Box>
        )}
      </Box>
      {favourite && scale !== null && (
        <Button
          size="small"
          variant={logged ? 'text' : 'outlined'}
          startIcon={logged ? <CheckRounded /> : <AddRounded />}
          disabled={logged || create.isPending}
          onClick={log}
          aria-label={logged ? `${label} logged` : `Log ${label}`}
          sx={{ flex: 'none', minWidth: 72 }}
        >
          {logged ? 'Logged' : 'Log'}
        </Button>
      )}
    </Box>
  )
}
