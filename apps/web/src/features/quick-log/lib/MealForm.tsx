// Owns: the meal form — the slot (default by time of day), then one of three ways in: favourites and recents (one tap),
// foods (search or a new food, grams each, live kcal), or a free-text description saved as a text meal that phase 2's
// AI analyses. Every meal is POST /api/meals with a client id and eaten_at.
import CloseRounded from '@mui/icons-material/CloseRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { endpoints } from '@fitness/shared/api'
import type { MealCreate, MealSlot } from '@fitness/shared/schemas'
import { useEffect, useState } from 'react'
import { useApiQuery } from '../../../api'
import { formatNumber } from '../../../components'
import { tokens } from '../../../theme'
import { clockOf, instantAt, todayLocal } from './dates'
import { FavouritesPane, type QuickMeal } from './FavouritesPane'
import { FoodPicker, type PickedFood } from './FoodPicker'
import { defaultSlot, portion, SLOT_LABEL, SLOT_TIME, sum, visibleSlots } from './nutrition'
import { useLogSettings, useRecentFoods } from './reads'
import { NumberField, noticeFor, parseNumber, problemText, type LogNotice } from './ui'
import { useLogMutation } from './writes'

type Mode = 'favourites' | 'foods' | 'describe'

export function MealForm({ date, slot: initialSlot, onLogged }: { date: string; slot?: MealSlot; onLogged: (notice: LogNotice) => void }) {
  const { breakfastEnabled } = useLogSettings()
  const isToday = date === todayLocal()
  const [slot, setSlot] = useState<MealSlot>(initialSlot ?? (isToday ? defaultSlot(clockOf(Date.now()), breakfastEnabled) : 'lunch'))
  const favourites = useApiQuery(endpoints.nutrition.listFavourites, {})
  const recents = useRecentFoods(date)
  const hasQuick = (favourites.data?.length ?? 0) > 0 || recents.length > 0
  const [mode, setMode] = useState<Mode | null>(null)
  // Decide once favourites have loaded, then hold it, so a late answer never swaps the pane under Aaron's thumb.
  useEffect(() => {
    if (mode === null && !favourites.isLoading) setMode(hasQuick ? 'favourites' : 'describe')
  }, [mode, favourites.isLoading, hasQuick])
  const shown: Mode = mode ?? 'favourites'
  const create = useLogMutation(endpoints.nutrition.createMeal)

  const slots = visibleSlots(breakfastEnabled || slot === 'breakfast')
  const eatenAt = () => (isToday ? new Date().toISOString() : instantAt(date, SLOT_TIME[slot]))

  const save = (body: MealCreate, message: string) => {
    create.mutate({ body }, { onSuccess: (o) => onLogged(noticeFor(o, message)) })
  }

  const logQuick = (meal: QuickMeal) => {
    const base = { id: crypto.randomUUID(), slot, eaten_at: eatenAt() }
    const message = `${SLOT_LABEL[slot]}: ${meal.label} · ${formatNumber(meal.nutrients.kcal)} kcal`
    if (meal.kind === 'favourite') save({ ...base, input_method: 'favorite', favorite_id: meal.favouriteId, scale: meal.scale }, message)
    else save({ ...base, input_method: 'manual', items: [{ id: crypto.randomUUID(), food_id: meal.foodId, grams: meal.grams, description: meal.label }] }, message)
  }

  return (
    <Box sx={{ display: 'grid', gap: 4 }} data-testid="meal-form">
      <Box role="radiogroup" aria-label="Slot" sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {slots.map((s) => (
          <Chip
            key={s}
            role="radio"
            aria-checked={slot === s}
            label={SLOT_LABEL[s]}
            onClick={() => setSlot(s)}
            variant={slot === s ? 'filled' : 'outlined'}
            sx={{
              height: tokens.tapTarget,
              px: 1,
              borderRadius: tokens.radius.chip,
              ...(slot === s ? { bgcolor: tokens.ink.text, color: tokens.ink.card, '&:hover': { bgcolor: tokens.ink.text } } : {}),
            }}
          />
        ))}
      </Box>

      <ToggleButtonGroup
        value={shown}
        exclusive
        fullWidth
        onChange={(_, v: Mode | null) => v && setMode(v)}
        aria-label="How to log"
        sx={{ '& .MuiToggleButton-root': { minHeight: tokens.tapTarget, textTransform: 'none', fontWeight: tokens.font.weight.label } }}
      >
        <ToggleButton value="favourites">Favourites</ToggleButton>
        <ToggleButton value="foods">Foods</ToggleButton>
        <ToggleButton value="describe">Describe</ToggleButton>
      </ToggleButtonGroup>

      {shown === 'favourites' && <FavouritesPane date={date} onLog={logQuick} busy={create.isPending} />}
      {shown === 'foods' && (
        <FoodsPane
          date={date}
          busy={create.isPending}
          onSave={(items, kcal) =>
            save(
              { id: crypto.randomUUID(), slot, eaten_at: eatenAt(), input_method: 'manual', items },
              `${SLOT_LABEL[slot]}: ${items.length} ${items.length === 1 ? 'item' : 'items'} · ${formatNumber(kcal)} kcal`,
            )
          }
        />
      )}
      {shown === 'describe' && (
        <DescribePane
          busy={create.isPending}
          onSave={(text) =>
            save({ id: crypto.randomUUID(), slot, eaten_at: eatenAt(), input_method: 'text', raw_text: text }, `${SLOT_LABEL[slot]} saved as text`)
          }
        />
      )}

      {create.isError && (
        <Box role="alert" sx={{ color: 'error.main', fontSize: 14 }}>
          {problemText(create.error)}
        </Box>
      )}
    </Box>
  )
}

interface DraftItem {
  /** The meal item's client id. */
  id: string
  food: PickedFood
  grams: string
}

type ManualItem = { id: string; food_id: string; grams: number; description: string }

function FoodsPane({ date, busy, onSave }: { date: string; busy: boolean; onSave: (items: ManualItem[], kcal: number) => void }) {
  const [items, setItems] = useState<DraftItem[]>([])
  const recents = useRecentFoods(date)
  const lastGrams = new Map(recents.map((r) => [r.foodId, r.grams]))

  const add = (food: PickedFood) => {
    const grams = lastGrams.get(food.id) ?? food.servingG ?? 100
    setItems((list) => [...list, { id: crypto.randomUUID(), food, grams: String(Math.round(grams)) }])
  }
  const parsed = items.map((item) => ({ item, grams: parseNumber(item.grams) }))
  const valid = parsed.length > 0 && parsed.every(({ grams }) => grams !== null && grams > 0 && grams <= 5000)
  const total = sum(parsed.map(({ item, grams }) => portion(item.food.per100, grams ?? 0)))

  return (
    <Box sx={{ display: 'grid', gap: 4 }} data-testid="foods-pane">
      <FoodPicker onPick={add} autoFocus={items.length === 0} />
      {items.length > 0 && (
        <Box component="ul" aria-label="Items" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 2 }}>
          {parsed.map(({ item, grams }) => (
            <Box component="li" key={item.id} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.food.name}</Box>
                <Box sx={{ fontSize: 13, color: 'text.secondary' }}>
                  {grams !== null && grams > 0 ? `${formatNumber(portion(item.food.per100, grams).kcal)} kcal` : 'Enter grams'}
                </Box>
              </Box>
              <NumberField
                value={item.grams}
                onChange={(v) => setItems((list) => list.map((i) => (i.id === item.id ? { ...i, grams: v } : i)))}
                unit="g"
                size="small"
                sx={{ width: 104 }}
                slotProps={{ htmlInput: { 'aria-label': `Grams of ${item.food.name}` } }}
              />
              <IconButton aria-label={`Remove ${item.food.name}`} onClick={() => setItems((list) => list.filter((i) => i.id !== item.id))}>
                <CloseRounded />
              </IconButton>
            </Box>
          ))}
        </Box>
      )}
      <Button
        variant="contained"
        size="large"
        disabled={!valid || busy}
        onClick={() =>
          onSave(
            parsed.map(({ item, grams }) => ({ id: item.id, food_id: item.food.id, grams: grams ?? 0, description: item.food.name })),
            total.kcal,
          )
        }
        data-testid="meal-save-items"
      >
        {busy ? 'Saving…' : items.length === 0 ? 'Add foods to log' : `Log meal · ${formatNumber(total.kcal)} kcal · ${formatNumber(total.protein_g)} g protein`}
      </Button>
    </Box>
  )
}

function DescribePane({ busy, onSave }: { busy: boolean; onSave: (text: string) => void }) {
  const [text, setText] = useState('')
  const trimmed = text.trim()
  return (
    <Box
      component="form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (trimmed) onSave(trimmed)
      }}
      sx={{ display: 'grid', gap: 3 }}
      data-testid="describe-pane"
    >
      <TextField
        label="What did you eat?"
        placeholder="2 eggs, toast with butter, black coffee"
        value={text}
        onChange={(e) => setText(e.target.value)}
        multiline
        minRows={3}
        autoFocus
        slotProps={{ htmlInput: { maxLength: 2000 } }}
      />
      <Box sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.5 }}>
        Saved as written. From phase 2 the AI turns it into items with grams and kcal for you to check; until then it
        counts as a logged meal without numbers.
      </Box>
      <Button type="submit" variant="contained" size="large" disabled={!trimmed || busy} data-testid="meal-save-text">
        {busy ? 'Saving…' : 'Save meal'}
      </Button>
    </Box>
  )
}
