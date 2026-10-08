// Owns: the day adjustment card (SPEC §6: after a meal is confirmed, and on Today) — what is left of the day's kcal and
// macros (the day's own numbers, so it shows even when no AI answered), protein status, the AI's two or three
// next-meal suggestions (a favourite logs in one tap at the suggested grams) and its one-line note. A card, never a nag:
// no red, no alarms, nothing that must be dismissed.
import AddRounded from '@mui/icons-material/AddRounded'
import CheckRounded from '@mui/icons-material/CheckRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import { endpoints } from '@fitness/shared/api'
import type { Remaining } from '@fitness/shared/schemas'
import { useState } from 'react'
import { problemText, useApiQuery } from '../../../../api'
import { cardSurface, formatNumber, statValue, StatusChip, tabularNums } from '../../../../components'
import { tokens } from '../../../../theme'
import { clockOf, instantAt, todayLocal } from '../dates'
import { defaultSlot, SLOT_LABEL, SLOT_TIME } from '../nutrition'
import { useDay } from '../reads'
import { noticeFor, type LogNotice } from '../ui'
import { useLogMutation } from '../writes'
import { suggestionScale, type AdjustmentEvent } from './adjustment'
import { FoodIcon } from './food-icons'

type Status = AdjustmentEvent['body']['status']

const STATUS: Record<Status, { label: string; tone: 'success' | 'warning' }> = {
  ok: { label: 'On track', tone: 'success' },
  over: { label: 'A little over', tone: 'warning' },
  protein_short: { label: 'Protein short', tone: 'warning' },
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
    <Box data-testid="day-adjustment" data-status={status} sx={{ ...cardSurface, px: `${tokens.pad.card.x}px`, py: `${tokens.pad.card.y}px`, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0, fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.heading, lineHeight: tokens.font.leading.cardTitle, color: tokens.ink.text }}>
          Rest of {date === todayLocal() ? 'today' : date}
        </Box>
        <StatusChip tone={STATUS[status].tone} label={STATUS[status].label} />
      </Box>

      {kcal !== null && (
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '6px', mt: 2 }}>
          <Box sx={{ ...statValue('standard'), color: tokens.ink.text, lineHeight: 1.1 }}>
            {formatNumber(Math.abs(kcal))}
          </Box>
          <Box sx={{ fontSize: tokens.font.size.small, color: tokens.ink.secondary }}>{kcal >= 0 ? 'kcal left' : 'kcal over'}</Box>
        </Box>
      )}

      {remaining && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: '14px', rowGap: 1, mt: 2, fontSize: tokens.font.size.caption, color: tokens.ink.secondary, ...tabularNums }}>
          {MACROS.map(({ key, label, color }) => (
            <Box key={key} component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: `${tokens.radius.bar}px`, bgcolor: color }} />
              {label} {remaining[key] >= 0 ? `${formatNumber(remaining[key])} g left` : `${formatNumber(-remaining[key])} g over`}
            </Box>
          ))}
        </Box>
      )}

      {/* Protein status in words, unless the AI's note already says it. */}
      {protein !== null && !adjustment?.body.note && (
        <Box sx={{ mt: 3, fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.emphasis, color: tokens.ink.body }}>
          {protein > 0 ? `${formatNumber(protein)} g protein still to go today.` : 'Protein target met for today.'}
        </Box>
      )}

      {adjustment?.body.note && <Box sx={{ mt: 3, fontSize: tokens.font.size.small, color: tokens.ink.body, lineHeight: tokens.font.leading.emphasis }}>{adjustment.body.note}</Box>}

      {suggestions.length > 0 && (
        <Box sx={{ mt: 4, pt: 3, borderTop: `1px solid ${tokens.ink.hairline}` }}>
          <Box sx={{ fontSize: tokens.font.size.micro, fontWeight: tokens.font.weight.label, letterSpacing: tokens.font.em.micro, textTransform: 'uppercase', color: tokens.ink.secondary, mb: 1 }}>
            Next meal ideas
          </Box>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid' }}>
            {suggestions.map((s, i) => (
              <Suggestion key={`${s.favorite_id ?? s.description}-${i}`} date={date} suggestion={s} onLogged={onLogged} />
            ))}
          </Box>
        </Box>
      )}

      {waiting && (
        <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 3, fontSize: tokens.font.size.small, color: tokens.ink.secondary }}>
          <CircularProgress size={14} aria-hidden />
          Working out next-meal ideas…
        </Box>
      )}
    </Box>
  )
}

type SuggestionData = AdjustmentEvent['body']['suggestions'][number]

function Suggestion({ date, suggestion, onLogged }: { date: string; suggestion: SuggestionData; onLogged?: (notice: LogNotice) => void }) {
  const favourites = useApiQuery(endpoints.nutrition.listFavourites, {}, { staleTime: 5 * 60_000, enabled: suggestion.favorite_id !== null })
  const create = useLogMutation(endpoints.nutrition.createMeal)
  const [logged, setLogged] = useState(false)
  const favourite = suggestion.favorite_id ? favourites.data?.find((f) => f.id === suggestion.favorite_id) : undefined
  const label = favourite?.label ?? suggestion.description ?? 'A favourite'
  const scale = favourite ? suggestionScale(favourite, suggestion.grams) : null

  const log = () => {
    if (!favourite || scale === null) return
    const isToday = date === todayLocal()
    const slot = defaultSlot(isToday ? clockOf(Date.now()) : SLOT_TIME.dinner)
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
    <Box
      component="li"
      data-testid="adjustment-suggestion"
      sx={{ display: 'flex', alignItems: 'center', gap: 3, minHeight: tokens.tapTarget, py: 2, '& + &': { borderTop: `1px solid ${tokens.ink.hairline}` } }}
    >
      <FoodIcon name={label} size={32} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.label, lineHeight: tokens.font.leading.itemTitle }}>
          {label}
          <Box component="span" sx={{ fontWeight: tokens.font.weight.body, color: tokens.ink.secondary, ...tabularNums }}>
            {' '}
            · {formatNumber(suggestion.grams)} g
          </Box>
        </Box>
        {suggestion.why && <Box sx={{ mt: '2px', fontSize: tokens.font.size.caption, color: tokens.ink.secondary, lineHeight: tokens.font.leading.caption }}>{suggestion.why}</Box>}
        {create.isError && (
          <Box role="alert" sx={{ fontSize: tokens.font.size.caption, color: tokens.tone.danger.text }}>
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
