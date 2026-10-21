// Owns: the day's meals by slot — Breakfast, Lunch, Dinner, Snack — as 1d Summit cards: a 44 px tinted glyph tile, the
// slot's Outfit title over its time, planned kcal and how it was logged, and the status, kcal, menu and add on the right
// (wrapping under the title when narrow); a slot with one meal is that meal's card with the item table below, a slot
// with several lists each under its own time row, and an empty slot is a dashed card with "+ Add <slot>". Adding opens
// the meal form for that slot and day. Plus the meal dialogs (review, edit, delete, save as favourite).
import AddRounded from '@mui/icons-material/AddRounded'
import BakeryDiningRounded from '@mui/icons-material/BakeryDiningRounded'
import CookieOutlined from '@mui/icons-material/CookieOutlined'
import DinnerDiningRounded from '@mui/icons-material/DinnerDiningRounded'
import LunchDiningRounded from '@mui/icons-material/LunchDiningRounded'
import type { SvgIconComponent } from '@mui/icons-material'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Skeleton from '@mui/material/Skeleton'
import type { DayView, Favourite, MealSlot } from '@fitness/shared/schemas'
import { useState, type ReactNode } from 'react'
import {
  cardSurface,
  dashedSurface,
  displayTitle,
  formatClock,
  formatNumber,
  LoadProblem,
} from '../../../components'
import { tokens } from '../../../theme'
import { SLOT_LABEL, slotShare, visibleSlots } from '../../quick-log'
import { LoadingRows } from './LogCard'
import { KcalFigure, MEAL_CARD_PX, MealActions, MealBody, MealCard, roundIconSx } from './MealCard'
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

/** How a meal was logged, when it says something beyond the items (1d: "from a photo"). */
const LOGGED_FROM: Partial<Record<MealView['inputMethod'], string>> = {
  photo: 'from a photo',
  voice: 'by voice',
  barcode: 'from a barcode',
  favorite: 'from a favourite',
}

/** Each slot's glyph and its tile's tint (the mock: bakery amber, lunch coral, dinner violet, snack teal). */
const SLOT_LOOK: Record<MealSlot, { icon: SvgIconComponent; bg: string; fg: string }> = {
  breakfast: { icon: BakeryDiningRounded, bg: tokens.tone.warning.bg, fg: tokens.tone.warning.text },
  lunch: { icon: LunchDiningRounded, bg: tokens.tone.danger.bg, fg: tokens.tone.danger.text },
  dinner: { icon: DinnerDiningRounded, bg: tokens.accent.soft, fg: tokens.accent.deep },
  snack: { icon: CookieOutlined, bg: tokens.tone.success.bg, fg: tokens.tone.success.text },
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
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: `${tokens.summit.space.gap.tile}px`,
      }}
      data-testid="meal-slots"
    >
      {/* When the whole day failed the header already says so; one notice is enough. */}
      {day !== undefined && meals.error != null && meals.meals.length === 0 && !meals.isLoading && (
        <LoadProblem what="Meals" error={meals.error} onRetry={meals.refetch} />
      )}
      {slots.map((slot) => {
        const label = SLOT_LABEL[slot]
        const inSlot = meals.meals.filter((m) => m.slot === slot)
        const logged =
          day?.intake.by_slot[slot]?.kcal ?? inSlot.reduce((a, m) => a + (m.totals?.kcal ?? 0), 0)
        const planned =
          targetKcal !== null && !fastDay ? Math.round((targetKcal * slotShare(slot)) / 10) * 10 : null
        const plannedText = planned !== null ? `planned ${formatNumber(planned)} kcal` : null
        const add = (
          <IconButton
            aria-label={`Add to ${label.toLowerCase()}`}
            onClick={() => onAdd(slot)}
            sx={roundIconSx}
          >
            <AddRounded sx={{ fontSize: 22 }} />
          </IconButton>
        )

        if (meals.isLoading && inSlot.length === 0 && day?.intake.by_slot[slot]) {
          // The day already says this slot has a meal: hold a meal card's space while the meals load.
          return (
            <SlotShell
              key={slot}
              slot={slot}
              description={plannedText && capitalise(plannedText)}
              actions={add}
              testId={`slot-${slot}`}
            >
              <LoadingRows rows={1} height={MEAL_CARD_PX} />
            </SlotShell>
          )
        }

        if (inSlot.length === 0) {
          const note =
            meals.error != null
              ? "Didn't load. Anything you add still saves."
              : fastDay
                ? 'Fast day'
                : slot === 'snack'
                  ? 'optional'
                  : 'not logged yet'
          return (
            <SlotShell
              key={slot}
              slot={slot}
              empty
              description={
                meals.isLoading ? (
                  <Skeleton variant="text" width={160} aria-busy="true" />
                ) : (
                  capitalise([plannedText, note].filter(Boolean).join(' · '))
                )
              }
              actions={
                <Button variant="outlined" startIcon={<AddRounded />} onClick={() => onAdd(slot)}>
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
            <Box key={slot} data-testid={`slot-${slot}`} sx={{ minWidth: 0 }}>
              <SlotShell
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
              </SlotShell>
            </Box>
          )
        }

        return (
          <SlotShell
            key={slot}
            slot={slot}
            testId={`slot-${slot}`}
            description={capitalise([`${inSlot.length} meals`, plannedText].filter(Boolean).join(' · '))}
            actions={
              <>
                <KcalFigure kcal={logged} />
                {add}
              </>
            }
          >
            <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '14px' }}>
              {inSlot.map((meal) => (
                <MealCard key={meal.id} meal={meal} {...handlers(meal)} />
              ))}
            </Box>
          </SlotShell>
        )
      })}
      {open?.kind === 'review' && <MealReviewDialog meal={open.meal} onClose={() => setOpen(null)} />}
      {open?.kind === 'edit' && <MealEditor meal={open.meal} onClose={() => setOpen(null)} />}
      {open?.kind === 'delete' && <DeleteMealDialog meal={open.meal} onClose={() => setOpen(null)} />}
      {open?.kind === 'favourite' && (
        <SaveFavouriteDialog meal={open.meal} favourites={favourites} onClose={() => setOpen(null)} />
      )}
    </Box>
  )
}

/**
 * A slot's card: the glyph tile, the title over its description, the actions on the right. The title keeps a 160 px
 * basis, so on a phone the actions drop under it rather than squeezing it one word per line (the mock's 390 px flaw).
 * `empty`: the dashed slot with a muted title.
 */
function SlotShell({
  slot,
  description,
  actions,
  empty = false,
  testId,
  children,
}: {
  slot: MealSlot
  description: ReactNode
  actions: ReactNode
  empty?: boolean
  testId: string
  children?: ReactNode
}) {
  const look = SLOT_LOOK[slot]
  const Icon = look.icon
  return (
    <Box
      component="section"
      data-testid={testId}
      sx={{
        ...(empty ? dashedSurface : cardSurface),
        px: '26px',
        py: empty && !children ? '18px' : '22px',
        minWidth: 0,
        breakInside: 'avoid',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px', minWidth: 0 }}>
        <Box
          aria-hidden
          sx={{
            width: 44,
            height: 44,
            flex: 'none',
            display: 'grid',
            placeItems: 'center',
            borderRadius: `${tokens.summit.radius.wellSmall}px`,
            bgcolor: look.bg,
            color: look.fg,
          }}
        >
          <Icon sx={{ fontSize: 24 }} />
        </Box>
        <Box sx={{ flex: '1 1 160px', minWidth: 0 }}>
          <Box
            component="h2"
            sx={{
              m: 0,
              ...displayTitle('card'),
              color: empty ? tokens.ink.secondary : tokens.ink.text,
            }}
          >
            {SLOT_LABEL[slot]}
          </Box>
          {description && (
            <Box
              sx={{
                fontSize: tokens.font.size.small,
                fontWeight: tokens.font.weight.body,
                lineHeight: tokens.font.leading.small,
                color: tokens.ink.secondary,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {description}
            </Box>
          )}
        </Box>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '6px 10px',
            ml: 'auto',
            minWidth: 0,
          }}
        >
          {actions}
        </Box>
      </Box>
      {children && <Box sx={{ mt: '14px', minWidth: 0 }}>{children}</Box>}
    </Box>
  )
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
