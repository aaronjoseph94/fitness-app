// Owns: the one-tap part of the meal form — favourites (a food with default grams, or a recipe) and recent foods, each
// logged with one tap on "+", with the grams (or recipe portion) adjustable first. Favourites log through
// input_method 'favorite' with a scale; a recent food logs as a one-item manual meal.
import AddRounded from '@mui/icons-material/AddRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Skeleton from '@mui/material/Skeleton'
import { endpoints } from '@fitness/shared/api'
import type { Favourite, Nutrients } from '@fitness/shared/schemas'
import { useState, type ReactNode } from 'react'
import { problemText, useApiQuery } from '../../../api'
import { formatNumber, NumberField, outlinedIconButton, parseNumber, SectionHeader, tabularNums } from '../../../components'
import { tokens } from '../../../theme'
import { scaled } from './nutrition'
import { useRecentFoods, type RecentFood } from './reads'

/** A meal the pane asks the form to log. */
export type QuickMeal =
  | { kind: 'favourite'; favouriteId: string; scale: number; label: string; nutrients: Nutrients }
  | { kind: 'food'; foodId: string; grams: number; label: string; nutrients: Nutrients }

const PORTIONS = [1, 1.5, 2, 0.5] as const
const MAX_SCALE = 10

export function FavouritesPane({ date, onLog, busy }: { date: string; onLog: (meal: QuickMeal) => void; busy: boolean }) {
  const favourites = useApiQuery(endpoints.nutrition.listFavourites, {})
  const recents = useRecentFoods(date)
  const favs = [...(favourites.data ?? [])].sort((a, b) => a.sort_order - b.sort_order)
  const favFoodIds = new Set(favs.flatMap((f) => (f.kind === 'food' ? [f.food_id] : [])))
  const recentRows = recents.filter((r) => !favFoodIds.has(r.foodId))

  return (
    <Box sx={{ display: 'grid', gap: 4 }} data-testid="favourites-pane">
      <Box>
        <SectionHeader title="Favourites" />
        {favourites.isLoading ? (
          <Box sx={{ display: 'grid', gap: 2 }}>
            <Skeleton variant="rounded" height={52} />
            <Skeleton variant="rounded" height={52} />
          </Box>
        ) : favourites.isError && favs.length === 0 ? (
          <Box sx={{ fontSize: tokens.font.size.small, color: 'text.secondary' }}>{problemText(favourites.error)}</Box>
        ) : favs.length === 0 ? (
          <Box sx={{ fontSize: tokens.font.size.small, color: 'text.secondary' }}>
            None yet. Save a logged meal as a favourite from the Log tab and it becomes one tap here.
          </Box>
        ) : (
          <Box>
            {favs.map((fav) => (
              <FavouriteRow key={fav.id} favourite={fav} onLog={onLog} busy={busy} />
            ))}
          </Box>
        )}
      </Box>
      {recentRows.length > 0 && (
        <Box>
          <SectionHeader title="Recent" subtitle="Foods from the last three days, at the grams you last had." />
          <Box>
            {recentRows.map((food) => (
              <RecentRow key={food.foodId} food={food} onLog={onLog} busy={busy} />
            ))}
          </Box>
        </Box>
      )}
    </Box>
  )
}

function FavouriteRow({ favourite, onLog, busy }: { favourite: Favourite; onLog: (meal: QuickMeal) => void; busy: boolean }) {
  const [portion, setPortion] = useState(0)
  const [gramsText, setGramsText] = useState(favourite.kind === 'food' ? String(favourite.default_grams) : '')
  const [editing, setEditing] = useState(false)
  const grams = parseNumber(gramsText)

  const scale =
    favourite.kind === 'food'
      ? grams !== null && grams > 0
        ? Math.min(MAX_SCALE, grams / favourite.default_grams)
        : null
      : (PORTIONS[portion] ?? 1)
  const nutrients = scale === null ? null : scaled(favourite.totals, scale)
  const detail =
    favourite.kind === 'food'
      ? `${formatNumber(grams ?? favourite.default_grams)} g`
      : `Recipe · ${favourite.recipe.length} ${favourite.recipe.length === 1 ? 'food' : 'foods'}`

  return (
    <Row
      label={favourite.label}
      detail={nutrients ? `${detail} · ${formatNumber(nutrients.kcal)} kcal · ${formatNumber(nutrients.protein_g)} g protein` : detail}
      adjust={
        favourite.kind === 'food' ? (
          editing ? (
            <NumberField
              value={gramsText}
              onChange={setGramsText}
              unit="g"
              size="small"
              autoFocus
              onBlur={() => setEditing(false)}
              slotProps={{ htmlInput: { 'aria-label': `Grams of ${favourite.label}` } }}
              sx={{ width: 104 }}
            />
          ) : (
            <AdjustButton label={`${formatNumber(grams ?? favourite.default_grams)} g`} onClick={() => setEditing(true)} aria={`Change grams of ${favourite.label}`} />
          )
        ) : (
          <AdjustButton
            label={`×${PORTIONS[portion] ?? 1}`}
            onClick={() => setPortion((p) => (p + 1) % PORTIONS.length)}
            aria={`Portion of ${favourite.label}, tap to change`}
          />
        )
      }
      disabled={busy || scale === null}
      onLog={() => {
        if (scale === null || !nutrients) return
        onLog({ kind: 'favourite', favouriteId: favourite.id, scale: Math.round(scale * 1000) / 1000, label: favourite.label, nutrients })
      }}
      testId="favourite-row"
    />
  )
}

function RecentRow({ food, onLog, busy }: { food: RecentFood; onLog: (meal: QuickMeal) => void; busy: boolean }) {
  const [gramsText, setGramsText] = useState(String(Math.round(food.grams)))
  const [editing, setEditing] = useState(false)
  const grams = parseNumber(gramsText)
  const valid = grams !== null && grams > 0 && grams <= 5000
  const nutrients = valid ? scaled(food.nutrients, grams / food.grams) : null
  return (
    <Row
      label={food.description}
      detail={nutrients ? `${formatNumber(grams)} g · ${formatNumber(nutrients.kcal)} kcal · ${formatNumber(nutrients.protein_g)} g protein` : 'Enter grams'}
      adjust={
        editing ? (
          <NumberField
            value={gramsText}
            onChange={setGramsText}
            unit="g"
            size="small"
            autoFocus
            onBlur={() => setEditing(false)}
            slotProps={{ htmlInput: { 'aria-label': `Grams of ${food.description}` } }}
            sx={{ width: 104 }}
          />
        ) : (
          <AdjustButton label={`${formatNumber(grams)} g`} onClick={() => setEditing(true)} aria={`Change grams of ${food.description}`} />
        )
      }
      disabled={busy || !valid}
      onLog={() => {
        if (!valid || !nutrients || grams === null) return
        onLog({ kind: 'food', foodId: food.foodId, grams, label: food.description, nutrients })
      }}
      testId="recent-row"
    />
  )
}

function AdjustButton({ label, onClick, aria }: { label: string; onClick: () => void; aria: string }) {
  return (
    <Button variant="outlined" size="small" onClick={onClick} aria-label={aria} sx={{ minWidth: 64, ...tabularNums }}>
      {label}
    </Button>
  )
}

function Row({
  label,
  detail,
  adjust,
  onLog,
  disabled,
  testId,
}: {
  label: string
  detail: string
  adjust: ReactNode
  onLog: () => void
  disabled: boolean
  testId: string
}) {
  return (
    <Box
      data-testid={testId}
      sx={{ display: 'flex', alignItems: 'center', gap: 2, py: '10px', '& + &': { borderTop: `1px solid ${tokens.ink.hairline}` } }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.label, lineHeight: tokens.font.leading.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</Box>
        <Box sx={{ fontSize: tokens.font.size.caption, lineHeight: tokens.font.leading.caption, color: 'text.secondary', ...tabularNums, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detail}</Box>
      </Box>
      {adjust}
      <IconButton aria-label={`Log ${label}`} onClick={onLog} disabled={disabled} size="small" sx={outlinedIconButton}>
        <AddRounded fontSize="small" />
      </IconButton>
    </Box>
  )
}
