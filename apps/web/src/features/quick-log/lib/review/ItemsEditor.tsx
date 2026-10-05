// Owns: the editable item list of a meal (SPEC §6 review) — per item its food icon, name, confidence chip and
// "estimated" flag, a grams stepper, live kcal and macros; swap the food (food search), remove it, and add an item
// (search, or a new food). Controlled: the caller holds the DraftItem list and saves it.
import AddRounded from '@mui/icons-material/AddRounded'
import CloseRounded from '@mui/icons-material/CloseRounded'
import RemoveRounded from '@mui/icons-material/RemoveRounded'
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import { useState } from 'react'
import { formatNumber, NumberField, parseNumber } from '../../../../components'
import { tokens } from '../../../../theme'
import { FoodPicker, type PickedFood } from '../FoodPicker'
import { FoodIcon } from './food-icons'
import { confidenceLevel, fromFood, gramsOf, itemNutrients, MAX_ITEMS, stepGrams, swapFood, type ConfidenceLevel, type DraftItem } from './items'

const CONFIDENCE: Record<ConfidenceLevel, { label: string; color: string }> = {
  high: { label: 'Sure', color: tokens.status.good },
  medium: { label: 'Fairly sure', color: tokens.status.warning },
  low: { label: 'Unsure', color: tokens.status.flag },
}

interface ItemsEditorProps {
  items: readonly DraftItem[]
  onChange: (items: DraftItem[]) => void
  disabled?: boolean
  /** Open the food search for a first item at once (manual entry after a failed analysis). */
  startAdding?: boolean
  /** Grams a food was last logged at, for a sensible default when it is added. */
  lastGrams?: ReadonlyMap<string, number>
}

export function ItemsEditor({ items, onChange, disabled = false, startAdding = false, lastGrams }: ItemsEditorProps) {
  const [adding, setAdding] = useState(startAdding && items.length === 0)
  const [swapping, setSwapping] = useState<string | null>(null)
  const update = (id: string, change: (item: DraftItem) => DraftItem) => onChange(items.map((i) => (i.id === id ? change(i) : i)))

  return (
    <Box sx={{ display: 'grid', gap: 3 }} data-testid="items-editor">
      {items.length > 0 && (
        <Box component="ul" aria-label="Items" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid' }}>
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              disabled={disabled}
              swapping={swapping === item.id}
              onGrams={(grams) => update(item.id, (i) => ({ ...i, grams }))}
              onSwap={() => setSwapping((s) => (s === item.id ? null : item.id))}
              onSwapped={(food) => {
                setSwapping(null)
                update(item.id, (i) => swapFood(i, food))
              }}
              onRemove={() => onChange(items.filter((i) => i.id !== item.id))}
            />
          ))}
        </Box>
      )}
      {adding ? (
        <Box sx={{ display: 'grid', gap: 1, p: 3, borderRadius: `${tokens.radius.control}px`, border: `1px solid ${tokens.ink.border}` }}>
          <FoodPicker
            autoFocus
            onPick={(food) => {
              setAdding(false)
              onChange([...items, fromFood(food, lastGrams?.get(food.id))])
            }}
          />
          <Button variant="text" onClick={() => setAdding(false)} sx={{ justifySelf: 'end' }}>
            Cancel
          </Button>
        </Box>
      ) : (
        items.length < MAX_ITEMS && (
          <Button variant="outlined" startIcon={<AddRounded />} disabled={disabled} onClick={() => setAdding(true)} sx={{ justifySelf: 'start' }} data-testid="add-item">
            Add an item
          </Button>
        )
      )}
    </Box>
  )
}

interface ItemRowProps {
  item: DraftItem
  disabled: boolean
  swapping: boolean
  onGrams: (grams: string) => void
  onSwap: () => void
  onSwapped: (food: PickedFood) => void
  onRemove: () => void
}

function ItemRow({ item, disabled, swapping, onGrams, onSwap, onSwapped, onRemove }: ItemRowProps) {
  const grams = gramsOf(item)
  const n = itemNutrients(item)
  const level = confidenceLevel(item.confidence)
  const typed = parseNumber(item.grams)
  const step = (direction: 1 | -1) => onGrams(String(stepGrams(typed !== null && typed > 0 ? typed : 0, direction)))

  return (
    <Box component="li" data-testid="review-item" sx={{ py: 3, borderTop: `1px solid ${tokens.ink.border}`, '&:first-of-type': { borderTop: 0, pt: 1 } }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 3 }}>
        <FoodIcon name={item.description} size={36} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ fontSize: tokens.font.size.emphasis, fontWeight: tokens.font.weight.label, lineHeight: 1.35, overflowWrap: 'anywhere' }}>{item.description}</Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 0.75 }}>
            {level && (
              <Chip
                size="small"
                variant="outlined"
                label={CONFIDENCE[level].label}
                title={`Confidence ${formatNumber((item.confidence ?? 0) * 100)} %`}
                sx={{ height: 22, fontSize: tokens.font.size.caption, color: CONFIDENCE[level].color, borderColor: CONFIDENCE[level].color }}
              />
            )}
            {item.estimated && (
              <Chip size="small" label="Estimated" title="No database match; the AI estimated the nutrition" sx={{ height: 22, fontSize: tokens.font.size.caption, bgcolor: tokens.ink.page, color: tokens.ink.secondary }} />
            )}
            <Button size="small" variant="text" startIcon={<SwapHorizRounded />} onClick={onSwap} disabled={disabled} sx={{ minHeight: tokens.tapTarget, px: 1, fontSize: tokens.font.size.label }} aria-expanded={swapping}>
              {swapping ? 'Keep' : 'Swap'}
            </Button>
          </Box>
        </Box>
        <IconButton aria-label={`Remove ${item.description}`} onClick={onRemove} disabled={disabled} sx={{ mt: -1, mr: -1 }}>
          <CloseRounded />
        </IconButton>
      </Box>

      {swapping && (
        <Box sx={{ mt: 2, ml: { xs: 0, sm: 12 } }}>
          <FoodPicker autoFocus onPick={onSwapped} />
        </Box>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2, ml: 12 }}>
        <IconButton aria-label={`Less ${item.description}`} onClick={() => step(-1)} disabled={disabled} size="small" sx={{ border: `1px solid ${tokens.ink.border}` }}>
          <RemoveRounded fontSize="small" />
        </IconButton>
        <NumberField
          value={item.grams}
          onChange={onGrams}
          unit="g"
          size="small"
          disabled={disabled}
          error={grams === null}
          sx={{ width: 96 }}
          slotProps={{ htmlInput: { 'aria-label': `Grams of ${item.description}`, style: { textAlign: 'right' } } }}
        />
        <IconButton aria-label={`More ${item.description}`} onClick={() => step(1)} disabled={disabled} size="small" sx={{ border: `1px solid ${tokens.ink.border}` }}>
          <AddRounded fontSize="small" />
        </IconButton>
        <Box sx={{ flex: 1 }} />
        <Box sx={{ fontSize: tokens.font.size.emphasis, fontWeight: tokens.font.weight.label, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {n ? `${formatNumber(n.kcal)} kcal` : grams === null ? 'Grams?' : '—'}
        </Box>
      </Box>
      {n && (
        <Box sx={{ ml: 12, mt: 1, fontSize: tokens.font.size.caption, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
          {formatNumber(n.protein_g)} g protein · {formatNumber(n.carbs_g)} g carbs · {formatNumber(n.fat_g)} g fat
        </Box>
      )}
    </Box>
  )
}
