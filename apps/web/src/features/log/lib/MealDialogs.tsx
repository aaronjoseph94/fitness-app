// Owns: the meal dialogs on the Log tab — edit a meal (slot, time, and its items in the shared item editor: grams
// stepper, swap, remove, add; confirms a meal in review) with PATCH /api/meals/:id, delete it with DELETE, and save it
// as a favourite (one food → a food favourite with its grams; several → a recipe) with POST /api/favorites.
import CloseRounded from '@mui/icons-material/CloseRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import useMediaQuery from '@mui/material/useMediaQuery'
import type { Theme } from '@mui/material/styles'
import { endpoints } from '@fitness/shared/api'
import type { Favourite, MealSlot } from '@fitness/shared/schemas'
import { useState } from 'react'
import { formatNumber } from '../../../components'
import { tokens } from '../../../theme'
import {
  clockOf,
  dateOf,
  draftTotals,
  instantAt,
  ItemsEditor,
  problemText,
  SLOT_LABEL,
  toItemInputs,
  useLogMutation,
  visibleSlots,
  type DraftItem,
} from '../../quick-log'
import { draftFromView, type MealView } from './meals'

export function MealEditor({ meal, breakfastEnabled, onClose }: { meal: MealView; breakfastEnabled: boolean; onClose: () => void }) {
  const fullScreen = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'))
  const [slot, setSlot] = useState<MealSlot>(meal.slot)
  const [time, setTime] = useState(clockOf(meal.eatenAt))
  const [items, setItems] = useState<DraftItem[]>(() => meal.items.map(draftFromView))
  const update = useLogMutation(endpoints.nutrition.updateMeal)

  const inputs = toItemInputs(items)
  const valid = inputs !== null && /^\d{2}:\d{2}$/.test(time)
  const { totals, complete } = draftTotals(items)
  const slots = visibleSlots(breakfastEnabled || meal.slot === 'breakfast')

  const save = (confirm: boolean) => {
    if (!valid || !inputs) return
    const eatenAt = time === clockOf(meal.eatenAt) ? undefined : instantAt(dateOf(meal.eatenAt), time)
    update.mutate(
      {
        params: { id: meal.id },
        body: {
          slot: slot === meal.slot ? undefined : slot,
          eaten_at: eatenAt,
          items: inputs,
          confirm: confirm ? true : undefined,
        },
      },
      { onSuccess: onClose },
    )
  }

  return (
    <Dialog open onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm" aria-labelledby="meal-editor-title">
      <DialogTitle id="meal-editor-title" sx={{ display: 'flex', alignItems: 'center', gap: 2, pr: 2 }}>
        <Box sx={{ flex: 1 }}>Edit {SLOT_LABEL[meal.slot].toLowerCase()}</Box>
        <IconButton aria-label="Close" onClick={onClose}>
          <CloseRounded />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 4, alignContent: 'start' }}>
        <Box role="radiogroup" aria-label="Slot" sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {slots.map((s) => (
            <Chip
              key={s}
              role="radio"
              aria-checked={slot === s}
              label={SLOT_LABEL[s]}
              onClick={() => setSlot(s)}
              variant={slot === s ? 'filled' : 'outlined'}
              sx={{ height: tokens.tapTarget, px: 1, ...(slot === s ? { bgcolor: tokens.ink.text, color: tokens.ink.card, '&:hover': { bgcolor: tokens.ink.text } } : {}) }}
            />
          ))}
        </Box>
        <TextField label="Time" type="time" value={time} onChange={(e) => e.target.value && setTime(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} sx={{ maxWidth: 180 }} />

        {meal.rawText && <Box sx={{ fontSize: 14, color: 'text.secondary' }}>Logged as “{meal.rawText}”</Box>}

        <ItemsEditor items={items} onChange={setItems} disabled={update.isPending} />
        {items.length === 0 && <Box sx={{ fontSize: 14, color: 'text.secondary' }}>No items. Add one, or delete the meal from its menu.</Box>}
        {update.isError && (
          <Box role="alert" sx={{ color: 'error.main', fontSize: 14 }}>
            {problemText(update.error)}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 6, pb: `calc(${tokens.space(4)}px + env(safe-area-inset-bottom, 0px))`, gap: 2 }}>
        <Box sx={{ flex: 1, fontSize: 14, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
          {items.length > 0 ? `${formatNumber(totals.kcal)}${complete ? '' : '+'} kcal` : ''}
        </Box>
        {meal.status === 'review' ? (
          <>
            <Button onClick={() => save(false)} disabled={!valid || update.isPending}>
              Save
            </Button>
            <Button variant="contained" onClick={() => save(true)} disabled={!valid || update.isPending || items.length === 0}>
              {update.isPending ? 'Saving…' : 'Save and confirm'}
            </Button>
          </>
        ) : (
          <Button variant="contained" onClick={() => save(false)} disabled={!valid || update.isPending}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}

export function DeleteMealDialog({ meal, onClose }: { meal: MealView; onClose: () => void }) {
  const remove = useLogMutation(endpoints.nutrition.deleteMeal)
  return (
    <Dialog open onClose={onClose} aria-labelledby="delete-meal-title" maxWidth="xs" fullWidth>
      <DialogTitle id="delete-meal-title">Delete this {SLOT_LABEL[meal.slot].toLowerCase()}?</DialogTitle>
      <DialogContent sx={{ fontSize: 15, color: 'text.secondary' }}>
        {clockOf(meal.eatenAt)} · {meal.items.length > 0 ? meal.items.map((i) => i.description).join(', ') : (meal.rawText ?? 'No items')}
        {meal.totals ? ` · ${formatNumber(meal.totals.kcal)} kcal` : ''}
        {remove.isError && (
          <Box role="alert" sx={{ color: 'error.main', fontSize: 14, mt: 2 }}>
            {problemText(remove.error)}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 6, pb: 4, gap: 2 }}>
        <Button onClick={onClose}>Keep it</Button>
        <Button variant="contained" color="error" disabled={remove.isPending} onClick={() => remove.mutate({ params: { id: meal.id } }, { onSuccess: onClose })}>
          {remove.isPending ? 'Deleting…' : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export function SaveFavouriteDialog({ meal, favourites, onClose }: { meal: MealView; favourites: readonly Favourite[]; onClose: () => void }) {
  const foods = meal.items.filter((i) => i.foodId && i.grams > 0)
  const skipped = meal.items.length - foods.length
  const [label, setLabel] = useState(() => foods.map((i) => i.description).join(', ').slice(0, 100))
  const create = useLogMutation(endpoints.nutrition.createFavourite)
  const nextOrder = favourites.reduce((max, f) => Math.max(max, f.sort_order), 0) + 10
  const valid = label.trim().length > 0 && foods.length > 0

  const save = () => {
    if (!valid) return
    const base = { id: crypto.randomUUID(), label: label.trim(), sort_order: nextOrder }
    const single = foods.length === 1 ? foods[0] : undefined
    const body = single?.foodId
      ? { ...base, kind: 'food' as const, food_id: single.foodId, default_grams: single.grams }
      : { ...base, kind: 'recipe' as const, recipe: foods.map((i) => ({ food_id: i.foodId as string, grams: i.grams })) }
    create.mutate({ body }, { onSuccess: onClose })
  }

  return (
    <Dialog open onClose={onClose} aria-labelledby="save-favourite-title" maxWidth="xs" fullWidth>
      <DialogTitle id="save-favourite-title">Save as favourite</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 3 }}>
        <Box sx={{ fontSize: 14, color: 'text.secondary', lineHeight: 1.5 }}>
          {foods.length === 1
            ? `One tap logs ${formatNumber(foods[0]?.grams ?? 0)} g of it, adjustable.`
            : `A recipe of ${foods.length} foods with their grams; one tap logs it all.`}
          {skipped > 0 && ` ${skipped} ${skipped === 1 ? 'item has' : 'items have'} no food match and ${skipped === 1 ? 'is' : 'are'} left out.`}
        </Box>
        <TextField label="Name" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus slotProps={{ htmlInput: { maxLength: 100 } }} sx={{ mt: 1 }} />
        {create.isError && (
          <Box role="alert" sx={{ color: 'error.main', fontSize: 14 }}>
            {problemText(create.error)}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 6, pb: 4, gap: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={!valid || create.isPending}>
          {create.isPending ? 'Saving…' : 'Save favourite'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
