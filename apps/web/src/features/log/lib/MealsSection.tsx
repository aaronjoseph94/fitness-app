// Owns: the day's meals by slot — Breakfast, Lunch, Dinner, Snack — as 2a cards: a slot with one meal is that meal's
// card (time, planned kcal and how it was logged under the title; status, kcal, add and the meal's menu on the right;
// the item table below), a slot with several lists each under its own time row, and an empty slot is a dashed card with
// "+ Add <slot>". Adding opens the meal form for that slot and day. Plus the meal dialogs (review, edit, delete, save as
// favourite).
import AddRounded from '@mui/icons-material/AddRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Skeleton from '@mui/material/Skeleton'
import type { DayView, Favourite, MealSlot } from '@fitness/shared/schemas'
import { useState, type ReactNode } from 'react'
import { formatClock, formatNumber, LoadProblem, Panel } from '../../../components'
import { tokens } from '../../../theme'
import { SLOT_LABEL, slotShare, visibleSlots } from '../../quick-log'
import { LoadingRows } from './LogCard'
import { MEAL_CARD_PX, MealActions, MealBody, MealCard } from './MealCard'
import { DeleteMealDialog, MealEditor, SaveFavouriteDialog } from './MealDialogs'
import { MealReviewDialog } from './MealReviewDialog'
import type { DayMeals, MealView } from './meals'

interface MealsSectionProps {
  day: DayView | undefined
  meals: DayMeals
  favourites: readonly Favourite[]
  onAdd: (slot: MealSlot) => void
}

type Open = { kind: 'review' | 'edit' | 'delete' | 'favourite'; meal: MealView } | null

/** How a meal was logged, when it says something beyond the items (2a: "from a photo"). */
const LOGGED_FROM: Partial<Record<MealView['inputMethod'], string>> = {
  photo: 'from a photo',
  voice: 'by voice',
  barcode: 'from a barcode',
  favorite: 'from a favourite',
}

export function MealsSection({ day, meals, favourites, onAdd }: MealsSectionProps) {
  const [open, setOpen] = useState<Open>(null)
  const slots = visibleSlots()
  const targetKcal = day?.targets?.kcal ?? null
  const fastDay = day?.fast.is_fast_day === true
  const handlers = (meal: MealView) => ({
    onReview: () => setOpen({ kind: 'review', meal }),
    onEdit: () => setOpen({ kind: 'edit', meal }),
    onDelete: () => setOpen({ kind: 'delete', meal }),
    onFavourite: () => setOpen({ kind: 'favourite', meal }),
  })

  return (
    <Box sx={{ display: 'grid', gap: 4 }} data-testid="meal-slots">
      {/* When the whole day failed the header already says so; one notice is enough. */}
      {day !== undefined && meals.error != null && meals.meals.length === 0 && !meals.isLoading && <LoadProblem what="Meals" error={meals.error} onRetry={meals.refetch} />}
      {slots.map((slot) => {
        const label = SLOT_LABEL[slot]
        const inSlot = meals.meals.filter((m) => m.slot === slot)
        const logged = day?.intake.by_slot[slot]?.kcal ?? inSlot.reduce((a, m) => a + (m.totals?.kcal ?? 0), 0)
        const planned = targetKcal !== null && !fastDay ? Math.round((targetKcal * slotShare(slot)) / 10) * 10 : null
        const plannedText = planned !== null ? `planned ${formatNumber(planned)} kcal` : null
        const add = (
          <IconButton size="small" aria-label={`Add to ${label.toLowerCase()}`} onClick={() => onAdd(slot)} sx={{ color: tokens.ink.secondary }}>
            <AddRounded sx={{ fontSize: 18 }} />
          </IconButton>
        )

        if (meals.isLoading && inSlot.length === 0 && day?.intake.by_slot[slot]) {
          // The day already says this slot has a meal: hold a meal card's space while the meals load.
          return (
            <Panel key={slot} title={label} description={plannedText && capitalise(plannedText)} actions={add} testId={`slot-${slot}`}>
              <LoadingRows rows={1} height={MEAL_CARD_PX} />
            </Panel>
          )
        }

        if (inSlot.length === 0) {
          const loading = meals.isLoading
          const note =
            meals.error != null ? "Didn't load. Anything you add still saves." : fastDay ? 'Fast day' : slot === 'snack' ? 'optional' : 'nothing logged yet'
          return (
            <Panel
              key={slot}
              tone="dashed"
              title={label}
              description={loading ? <Skeleton variant="text" width={160} aria-busy="true" /> : capitalise([plannedText, note].filter(Boolean).join(' · '))}
              actions={
                <Button variant="outlined" size="dense" startIcon={<AddRounded />} onClick={() => onAdd(slot)}>
                  Add {label.toLowerCase()}
                </Button>
              }
              testId={`slot-${slot}`}
            />
          )
        }

        const only = inSlot.length === 1 ? inSlot[0] : undefined
        if (only) {
          const from = LOGGED_FROM[only.inputMethod]
          return (
            // The slot's id on a wrapper and the meal's on the card, so `meal-card` holds the meal's status, kcal and menu
            // (in the header) as well as its items, and still sits inside `slot-<slot>`.
            <Box key={slot} data-testid={`slot-${slot}`}>
              <SlotCard
                slot={slot}
                description={[formatClock(only.eatenAt), plannedText, from].filter(Boolean).join(' · ')}
                actions={
                  <>
                    <MealActions meal={only} {...handlers(only)} />
                    {add}
                  </>
                }
                testId="meal-card"
              >
                <MealBody meal={only} onReview={handlers(only).onReview} />
              </SlotCard>
            </Box>
          )
        }

        return (
          <SlotCard
            key={slot}
            slot={slot}
            testId={`slot-${slot}`}
            description={capitalise([`${inSlot.length} meals`, plannedText].filter(Boolean).join(' · '))}
            actions={
              <>
                <Box sx={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.heading, fontVariantNumeric: 'tabular-nums' }}>{formatNumber(logged)} kcal</Box>
                {add}
              </>
            }
          >
            {inSlot.map((meal) => (
              <MealCard key={meal.id} meal={meal} {...handlers(meal)} />
            ))}
          </SlotCard>
        )
      })}
      {open?.kind === 'review' && <MealReviewDialog meal={open.meal} onClose={() => setOpen(null)} />}
      {open?.kind === 'edit' && <MealEditor meal={open.meal} onClose={() => setOpen(null)} />}
      {open?.kind === 'delete' && <DeleteMealDialog meal={open.meal} onClose={() => setOpen(null)} />}
      {open?.kind === 'favourite' && <SaveFavouriteDialog meal={open.meal} favourites={favourites} onClose={() => setOpen(null)} />}
    </Box>
  )
}

/** A slot with meals: the 2a card, its body flush so the item table runs edge to edge. */
function SlotCard({ slot, description, actions, testId, children }: { slot: MealSlot; description: ReactNode; actions: ReactNode; testId: string; children: ReactNode }) {
  return (
    <Panel title={SLOT_LABEL[slot]} description={description} actions={actions} padding="none" testId={testId}>
      {children}
    </Panel>
  )
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
