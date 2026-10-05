// Owns: the day's meals by slot — Lunch, Dinner, Snack (Breakfast when enabled or used) — each card with planned vs
// logged kcal, its meals, and "Add" opening the meal form for that slot and day; plus the meal dialogs (review, edit,
// delete, save as favourite).
import AddRounded from '@mui/icons-material/AddRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import type { DayView, Favourite, MealSlot } from '@fitness/shared/schemas'
import { useState } from 'react'
import { formatNumber, LoadProblem } from '../../../components'
import { tokens } from '../../../theme'
import { SLOT_LABEL, slotShare, visibleSlots } from '../../quick-log'
import { LoadingRows, LogCard } from './LogCard'
import { MEAL_CARD_PX, MealCard } from './MealCard'
import { DeleteMealDialog, MealEditor, SaveFavouriteDialog } from './MealDialogs'
import { MealReviewDialog } from './MealReviewDialog'
import type { DayMeals, MealView } from './meals'

interface MealsSectionProps {
  day: DayView | undefined
  meals: DayMeals
  favourites: readonly Favourite[]
  breakfastEnabled: boolean
  onAdd: (slot: MealSlot) => void
}

type Open = { kind: 'review' | 'edit' | 'delete' | 'favourite'; meal: MealView } | null

export function MealsSection({ day, meals, favourites, breakfastEnabled, onAdd }: MealsSectionProps) {
  const [open, setOpen] = useState<Open>(null)
  const used = new Set(meals.meals.map((m) => m.slot))
  const slots = visibleSlots(breakfastEnabled || used.has('breakfast'))
  const targetKcal = day?.targets?.kcal ?? null
  const fastDay = day?.fast.is_fast_day === true

  return (
    <Box sx={{ display: 'grid', gap: 3 }} data-testid="meal-slots">
      {/* When the whole day failed the header already says so; one notice is enough. */}
      {day !== undefined && meals.error != null && meals.meals.length === 0 && !meals.isLoading && <LoadProblem what="Meals" error={meals.error} onRetry={meals.refetch} />}
      {slots.map((slot) => {
        const inSlot = meals.meals.filter((m) => m.slot === slot)
        const logged = day?.intake.by_slot[slot]?.kcal ?? inSlot.reduce((a, m) => a + (m.totals?.kcal ?? 0), 0)
        const planned = targetKcal !== null && !fastDay ? Math.round((targetKcal * slotShare(slot, breakfastEnabled)) / 10) * 10 : null
        return (
          <LogCard
            key={slot}
            title={SLOT_LABEL[slot]}
            color={tokens.metric.calories}
            subtitle={
              <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatNumber(logged)} kcal logged
                {planned !== null && ` · about ${formatNumber(planned)} planned`}
              </Box>
            }
            action={
              <Button variant="text" startIcon={<AddRounded />} onClick={() => onAdd(slot)} aria-label={`Add to ${SLOT_LABEL[slot].toLowerCase()}`}>
                Add
              </Button>
            }
            testId={`slot-${slot}`}
          >
            {meals.isLoading && inSlot.length === 0 ? (
              // The day already says which slots have a meal: hold a meal card's space there, an empty line elsewhere.
              day?.intake.by_slot[slot] ? (
                <LoadingRows rows={1} height={MEAL_CARD_PX} />
              ) : (
                <Box sx={{ fontSize: tokens.font.size.small, pb: 1 }} aria-busy="true">
                  <Skeleton variant="text" width={120} />
                </Box>
              )
            ) : inSlot.length === 0 ? (
              <Box sx={{ fontSize: tokens.font.size.small, color: 'text.secondary', pb: 1 }}>
                {meals.error != null ? "Didn't load. Anything you add still saves." : fastDay ? 'Fast day.' : 'Nothing logged.'}
              </Box>
            ) : (
              inSlot.map((meal) => (
                <MealCard
                  key={meal.id}
                  meal={meal}
                  onReview={() => setOpen({ kind: 'review', meal })}
                  onEdit={() => setOpen({ kind: 'edit', meal })}
                  onDelete={() => setOpen({ kind: 'delete', meal })}
                  onFavourite={() => setOpen({ kind: 'favourite', meal })}
                />
              ))
            )}
          </LogCard>
        )
      })}
      {open?.kind === 'review' && <MealReviewDialog meal={open.meal} onClose={() => setOpen(null)} />}
      {open?.kind === 'edit' && <MealEditor meal={open.meal} breakfastEnabled={breakfastEnabled} onClose={() => setOpen(null)} />}
      {open?.kind === 'delete' && <DeleteMealDialog meal={open.meal} onClose={() => setOpen(null)} />}
      {open?.kind === 'favourite' && <SaveFavouriteDialog meal={open.meal} favourites={favourites} onClose={() => setOpen(null)} />}
    </Box>
  )
}
