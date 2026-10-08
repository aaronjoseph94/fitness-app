// Owns: finding a food for a meal item — search over GET /api/foods/search (debounced, cached) and the quick "new
// food" form with per-100 g macros (POST /api/foods, client id, so it works offline). Hands back a PickedFood.
import AddRounded from '@mui/icons-material/AddRounded'
import SearchRounded from '@mui/icons-material/SearchRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import InputAdornment from '@mui/material/InputAdornment'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import TextField from '@mui/material/TextField'
import { endpoints } from '@fitness/shared/api'
import type { Food } from '@fitness/shared/schemas'
import { useEffect, useState } from 'react'
import { problemText, useApiQuery } from '../../../api'
import { formatNumber, NumberField, parseNumber } from '../../../components'
import { tokens } from '../../../theme'
import type { Per100g } from './nutrition'
import { noticeFor, type LogNotice } from './ui'
import { useLogMutation } from './writes'

/** A food chosen for a meal item: its id, how it reads, and its per-100 g values for live totals. */
export interface PickedFood {
  id: string
  name: string
  per100: Per100g
  /** One serving in grams, when the source gives one. */
  servingG: number | null
}

export function pickedFromFood(food: Food): PickedFood {
  return {
    id: food.id,
    name: food.brand ? `${food.name} (${food.brand})` : food.name,
    per100: { kcal_per_100g: food.kcal_per_100g, protein_g: food.protein_g, carbs_g: food.carbs_g, fat_g: food.fat_g, fibre_g: food.fibre_g },
    servingG: food.serving_g,
  }
}

const RESULTS_MAX = 8

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

export function FoodPicker({ onPick, autoFocus = false }: { onPick: (food: PickedFood, notice?: LogNotice) => void; autoFocus?: boolean }) {
  const [text, setText] = useState('')
  const [creating, setCreating] = useState(false)
  const q = useDebounced(text.trim(), 250)
  const search = useApiQuery(endpoints.nutrition.searchFoods, { query: { q } }, { enabled: q.length >= 2, staleTime: 5 * 60_000 })
  const results = (search.data ?? []).slice(0, RESULTS_MAX)

  if (creating) {
    return (
      <NewFoodForm
        initialName={text.trim()}
        onCancel={() => setCreating(false)}
        onCreated={(food, notice) => {
          setCreating(false)
          setText('')
          onPick(food, notice)
        }}
      />
    )
  }

  return (
    // minmax(0, 1fr): long food names ellipsize instead of widening the sheet or dialog.
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }} data-testid="food-picker">
      <TextField
        label="Search foods"
        placeholder="chicken breast, greek yogurt…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus={autoFocus}
        autoComplete="off"
        slotProps={{
          htmlInput: { enterKeyHint: 'search', 'aria-label': 'Search foods' },
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchRounded sx={{ fontSize: 18, color: 'text.secondary' }} />
              </InputAdornment>
            ),
            endAdornment: search.isFetching ? (
              <InputAdornment position="end">
                <CircularProgress size={18} aria-label="Searching" />
              </InputAdornment>
            ) : undefined,
          },
        }}
      />
      {q.length >= 2 && search.isError && (
        <Box sx={{ fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: 'text.secondary' }}>
          {problemText(search.error)} You can add it as a new food, or describe the meal instead.
        </Box>
      )}
      {q.length >= 2 && search.isSuccess && results.length === 0 && (
        <Box sx={{ fontSize: tokens.font.size.small, color: 'text.secondary' }}>No foods match “{q}”. Add it as a new food.</Box>
      )}
      {results.length > 0 && (
        <List
          dense
          disablePadding
          aria-label="Search results"
          sx={{ border: `1px solid ${tokens.ink.border}`, borderRadius: `${tokens.radius.control}px`, overflow: 'hidden' }}
        >
          {results.map((food) => (
            // Each button sits in a list item: a list may hold only list items.
            <ListItem key={food.id} disablePadding sx={{ '& + &': { borderTop: `1px solid ${tokens.ink.hairline}` } }}>
              <ListItemButton
                onClick={() => onPick(pickedFromFood(food))}
                sx={{ minHeight: tokens.tapTarget, px: 3, borderRadius: 0, '&:hover': { bgcolor: tokens.ink.panel } }}
              >
                <ListItemText
                  primary={food.brand ? `${food.name} · ${food.brand}` : food.name}
                  secondary={`${formatNumber(food.kcal_per_100g)} kcal · ${formatNumber(food.protein_g, 1)} g protein per 100 g`}
                  slotProps={{
                    primary: { noWrap: true, sx: { color: 'text.primary', fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.label } },
                    secondary: { sx: { fontSize: tokens.font.size.caption, fontVariantNumeric: 'tabular-nums' } },
                  }}
                />
                <AddRounded aria-hidden sx={{ fontSize: 18, color: tokens.ink.label, ml: 2 }} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      )}
      <Button variant="text" startIcon={<AddRounded />} onClick={() => setCreating(true)} sx={{ justifySelf: 'start' }}>
        New food
      </Button>
    </Box>
  )
}

const MACROS = [
  { key: 'kcal', label: 'kcal', unit: 'kcal' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
  { key: 'fibre', label: 'Fibre (optional)', unit: 'g' },
] as const

type MacroKey = (typeof MACROS)[number]['key']

function NewFoodForm({
  initialName,
  onCancel,
  onCreated,
}: {
  initialName: string
  onCancel: () => void
  onCreated: (food: PickedFood, notice: LogNotice) => void
}) {
  const [name, setName] = useState(initialName)
  const [values, setValues] = useState<Record<MacroKey, string>>({ kcal: '', protein: '', carbs: '', fat: '', fibre: '' })
  const create = useLogMutation(endpoints.nutrition.createFood)
  const n = Object.fromEntries(MACROS.map(({ key }) => [key, parseNumber(values[key])])) as Record<MacroKey, number | null>
  const required: MacroKey[] = ['kcal', 'protein', 'carbs', 'fat']
  const valid =
    name.trim().length > 0 && required.every((k) => n[k] !== null && n[k] >= 0) && (n.fibre === null || n.fibre >= 0) && (n.kcal ?? 0) <= 900

  const submit = () => {
    if (!valid) return
    const id = crypto.randomUUID()
    const per100: Per100g = { kcal_per_100g: n.kcal ?? 0, protein_g: n.protein ?? 0, carbs_g: n.carbs ?? 0, fat_g: n.fat ?? 0, fibre_g: n.fibre }
    create.mutate(
      {
        body: {
          id,
          name: name.trim(),
          kcal_per_100g: per100.kcal_per_100g,
          protein_g: per100.protein_g,
          carbs_g: per100.carbs_g,
          fat_g: per100.fat_g,
          fibre_g: n.fibre ?? undefined,
        },
      },
      { onSuccess: (o) => onCreated({ id, name: name.trim(), per100, servingG: null }, noticeFor(o, `Saved ${name.trim()}`)) },
    )
  }

  return (
    <Box
      component="form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      sx={{ display: 'grid', gap: 3 }}
      data-testid="new-food-form"
    >
      <Box sx={{ fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: 'text.secondary' }}>New food. Values per 100 g, as on the label.</Box>
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus slotProps={{ htmlInput: { maxLength: 200 } }} />
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        {MACROS.map(({ key, label, unit }) => (
          <NumberField
            key={key}
            label={label}
            value={values[key]}
            onChange={(v) => setValues((s) => ({ ...s, [key]: v }))}
            unit={unit}
            sx={key === 'fibre' ? { gridColumn: '1 / -1' } : undefined}
          />
        ))}
      </Box>
      {create.isError && (
        <Box role="alert" sx={{ color: tokens.tone.danger.text, fontSize: tokens.font.size.small }}>
          {problemText(create.error)}
        </Box>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 2 }}>
        <Button variant="outlined" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" disabled={!valid || create.isPending}>
          {create.isPending ? 'Saving…' : 'Save and add'}
        </Button>
      </Box>
    </Box>
  )
}
