// Owns: reviewing one analysed meal (SPEC §6 pipeline, §12 acceptance) — while 'parsing', progress with the photos or
// text being read (and, past 30 s, the offer to add items by hand); in 'review', the editable item list and Confirm
// (PATCH {items, confirm: true}); a failed analysis said calmly, with the raw text kept and manual items open; after
// confirming, the day adjustment card. Used right after capture (quick-log sheet) and from the Log tab.
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import LinearProgress from '@mui/material/LinearProgress'
import Skeleton from '@mui/material/Skeleton'
import { endpoints } from '@fitness/shared/api'
import type { Meal } from '@fitness/shared/schemas'
import { useMemo, useState } from 'react'
import { formatNumber, PendingBadge, tabularNums, wellSurface } from '../../../../components'
import { tokens } from '../../../../theme'
import { useNow } from '../fasts'
import { SLOT_LABEL } from '../nutrition'
import { useRecentFoods } from '../reads'
import { noticeFor, type LogNotice } from '../ui'
import { useLogMutation } from '../writes'
import { useDayAdjustment } from './adjustment'
import { DayAdjustmentCard } from './DayAdjustmentCard'
import { ItemsEditor } from './ItemsEditor'
import { draftTotals, fromMealItem, toItemInputs, type DraftItem } from './items'
import { analysisState, useLiveMeal } from './meal-live'
import { problemText } from '../../../../api'

export interface MealReviewProps {
  date: string
  mealId: string
  /** Thumbnails prepared on this phone, shown until the meal's own photos arrive. */
  localPreviews?: readonly string[]
  /** Leave the review (the meal stays as it is on the Log tab). */
  onClose: () => void
  /** A notice for the caller's snackbar (confirm saved or queued, a suggestion logged). */
  onLogged?: (notice: LogNotice) => void
}

export function MealReview({ date, mealId, localPreviews = [], onClose, onLogged }: MealReviewProps) {
  const { meal, isLoading, error, refetch } = useLiveMeal(date, mealId)
  const [draft, setDraft] = useState<DraftItem[] | null>(null)
  const [manual, setManual] = useState(false)
  /** After a confirm here: the server's updated_at (an adjustment newer than it is the one for this meal), or 'queued'. */
  const [confirmed, setConfirmed] = useState<{ since: string | null } | null>(null)
  const update = useLogMutation(endpoints.nutrition.updateMeal)
  const recents = useRecentFoods(date)
  const lastGrams = useMemo(() => new Map(recents.map((r) => [r.foodId, r.grams])), [recents])

  if (confirmed) return <ConfirmedView date={date} meal={meal} since={confirmed.since} onClose={onClose} onLogged={onLogged} />

  if (!meal) {
    if (isLoading) return <Skeleton variant="rounded" height={160} aria-label="Loading the meal" />
    return (
      <Box sx={{ display: 'grid', gap: 3 }}>
        <Alert severity="info">
          {error ? `The meal didn't load. ${problemText(error)}` : "This meal isn't on the server yet. If you're offline it syncs, and its analysis starts, when you're back."}
        </Alert>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button variant="outlined" onClick={() => void refetch()}>
            Try again
          </Button>
          <Button variant="contained" onClick={onClose}>
            Close
          </Button>
        </Box>
      </Box>
    )
  }

  const state = analysisState(meal)
  if (state === 'confirmed') return <ConfirmedView date={date} meal={meal} since={null} onClose={onClose} onLogged={onLogged} />
  if ((state === 'analysing' || state === 'slow') && !manual) {
    return <AnalysingView meal={meal} slow={state === 'slow'} localPreviews={localPreviews} onManual={() => setManual(true)} onClose={onClose} />
  }

  const failed = state === 'failed' || (manual && meal.status === 'parsing')
  const items = draft ?? (meal.status === 'review' ? meal.items.map(fromMealItem) : [])
  const { totals, complete } = draftTotals(items)
  const inputs = toItemInputs(items)

  const confirm = () => {
    if (!inputs || inputs.length === 0) return
    update.mutate(
      { params: { id: meal.id }, body: { items: inputs, confirm: true } },
      {
        onSuccess: (outcome) => {
          onLogged?.(noticeFor(outcome, `${SLOT_LABEL[meal.slot]} confirmed · ${formatNumber(totals.kcal)} kcal`))
          setConfirmed({ since: outcome.status === 'saved' ? outcome.data.updated_at : null })
        },
      },
    )
  }

  return (
    <Box sx={{ display: 'grid', gap: 4 }} data-testid="meal-review" data-state={failed ? 'failed' : 'ready'}>
      {failed ? (
        <Alert severity="info" data-testid="analysis-failed">
          {manual && meal.status === 'parsing'
            ? 'Add what you ate below. If the analysis finishes first, your items still win.'
            : "The AI couldn't read this one just now. Add what you ate below; what you wrote is kept."}
        </Alert>
      ) : (
        <Box sx={{ fontSize: tokens.font.size.small, color: tokens.ink.secondary, lineHeight: tokens.font.leading.small }}>
          Check the items and grams, then confirm. Tap a name's Swap to pick the right food.
        </Box>
      )}
      <MealSource meal={meal} localPreviews={localPreviews} />
      <ItemsEditor items={items} onChange={setDraft} disabled={update.isPending} startAdding={failed} lastGrams={lastGrams} />

      <Box
        sx={{
          position: 'sticky',
          bottom: 0,
          bgcolor: tokens.ink.card,
          pt: 2,
          pb: 1,
          borderTop: `1px solid ${tokens.ink.border}`,
          display: 'grid',
          gap: 3,
          zIndex: 1,
        }}
      >
        <Box sx={{ fontSize: tokens.font.size.small, color: tokens.ink.secondary, ...tabularNums }} data-testid="review-totals">
          {items.length === 0
            ? 'No items yet.'
            : `${formatNumber(totals.kcal)} kcal${complete ? '' : '+'} · ${formatNumber(totals.protein_g)} g protein · ${formatNumber(totals.carbs_g)} g carbs · ${formatNumber(totals.fat_g)} g fat`}
        </Box>
        {update.isError && (
          <Box role="alert" sx={{ color: tokens.tone.danger.text, fontSize: tokens.font.size.small }}>
            {problemText(update.error)}
          </Box>
        )}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 2 }}>
          <Button variant="outlined" size="large" onClick={onClose} disabled={update.isPending}>
            Later
          </Button>
          <Button variant="contained" size="large" onClick={confirm} disabled={!inputs || inputs.length === 0 || update.isPending} data-testid="review-confirm">
            {update.isPending ? 'Saving…' : items.length === 0 ? 'Add an item to confirm' : `Confirm · ${formatNumber(totals.kcal)} kcal`}
          </Button>
        </Box>
      </Box>
    </Box>
  )
}

/** The photos and words the meal was logged with. */
function MealSource({ meal, localPreviews }: { meal: Meal; localPreviews: readonly string[] }) {
  const photos = meal.photos.length > 0 ? meal.photos.map((p) => p.url) : localPreviews
  if (photos.length === 0 && !meal.raw_text) return null
  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      {photos.length > 0 && (
        <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 1 }} aria-label="Meal photos">
          {photos.map((src) => (
            <Box
              key={src}
              component="img"
              src={src}
              alt=""
              sx={{ width: 88, height: 88, objectFit: 'cover', borderRadius: `${tokens.radius.control}px`, border: `1px solid ${tokens.ink.border}`, bgcolor: tokens.ink.fill, flex: 'none' }}
            />
          ))}
        </Box>
      )}
      {meal.raw_text && (
        <Box sx={{ ...wellSurface, px: 3, py: '10px', fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.body }} data-testid="meal-raw-text">
          “{meal.raw_text}”
        </Box>
      )}
    </Box>
  )
}

function AnalysingView({
  meal,
  slow,
  localPreviews,
  onManual,
  onClose,
}: {
  meal: Meal
  slow: boolean
  localPreviews: readonly string[]
  onManual: () => void
  onClose: () => void
}) {
  const now = useNow(1000)
  const seconds = Math.max(0, Math.round((now - Date.parse(meal.created_at)) / 1000))
  const what = meal.input_method === 'photo' ? (meal.photos.length > 1 || localPreviews.length > 1 ? 'your photos' : 'your photo') : 'what you wrote'
  return (
    <Box sx={{ display: 'grid', gap: 4 }} data-testid="meal-analysing" role="status" aria-live="polite">
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, mb: 3 }}>
          <Box sx={{ flex: 1, fontSize: tokens.font.size.cardTitle, fontWeight: tokens.font.weight.heading, lineHeight: tokens.font.leading.cardTitle }}>Analysing {what}…</Box>
          <Box sx={{ fontSize: tokens.font.size.small, color: tokens.ink.secondary, ...tabularNums }}>{seconds} s</Box>
        </Box>
        <LinearProgress aria-label={`Analysing ${what}`} />
        <Box sx={{ mt: 2, fontSize: tokens.font.size.small, color: tokens.ink.secondary, lineHeight: tokens.font.leading.small }}>
          {slow
            ? 'Taking longer than usual; the AI services may be busy. Keep waiting, or add the items yourself.'
            : 'Usually under 20 seconds. You can close this; the meal waits for you in the Log tab.'}
        </Box>
      </Box>
      <MealSource meal={meal} localPreviews={localPreviews} />
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        <Button variant="outlined" onClick={onClose}>
          Close
        </Button>
        <Button variant={slow ? 'contained' : 'outlined'} onClick={onManual} data-testid="add-items-myself">
          Add items myself
        </Button>
      </Box>
    </Box>
  )
}

function ConfirmedView({
  date,
  meal,
  since,
  onClose,
  onLogged,
}: {
  date: string
  meal: Meal | null
  since: string | null
  onClose: () => void
  onLogged?: (notice: LogNotice) => void
}) {
  const { adjustment, fresh, waiting } = useDayAdjustment(date, since)
  return (
    <Box sx={{ display: 'grid', gap: 4 }} data-testid="meal-confirmed">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ flex: 1, fontSize: tokens.font.size.cardTitle, fontWeight: tokens.font.weight.heading, lineHeight: tokens.font.leading.cardTitle }}>
          {meal ? `${SLOT_LABEL[meal.slot]} logged` : 'Meal logged'}
          {meal && meal.totals.kcal > 0 && (
            <Box component="span" sx={{ fontWeight: tokens.font.weight.body, color: tokens.ink.secondary }}>
              {' '}
              · {formatNumber(meal.totals.kcal)} kcal
            </Box>
          )}
        </Box>
        {since === null && meal?.status !== 'confirmed' && <PendingBadge label="Syncing" />}
      </Box>
      {/* An older adjustment's ideas would be about the day before this meal: show only this meal's (or the numbers). */}
      <DayAdjustmentCard date={date} adjustment={fresh ? adjustment : null} waiting={waiting} onLogged={onLogged} />
      <Button variant="contained" size="large" onClick={onClose} data-testid="review-done">
        Done
      </Button>
    </Box>
  )
}
