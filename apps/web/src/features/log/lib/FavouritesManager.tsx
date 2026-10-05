// Owns: the favourites manager — the one-tap list in its order, moved up or down (PATCH sort_order), renamed, a food's
// default grams or a recipe's grams per food edited (PATCH /api/favorites/:id). New favourites come from a logged meal
// ("Save as favourite" on a meal). Edits waiting to sync show as pending.
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded'
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded'
import CloseRounded from '@mui/icons-material/CloseRounded'
import EditOutlined from '@mui/icons-material/EditOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import { endpoints } from '@fitness/shared/api'
import type { Favourite, Food, Meal } from '@fitness/shared/schemas'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { apiQueryKey, problemText } from '../../../api'
import { formatNumber, LoadProblem, NumberField, parseNumber, PendingBadge } from '../../../components'
import { tokens } from '../../../theme'
import { useLogMutation, usePendingLogs } from '../../quick-log'
import { LoadingRows, LogCard } from './LogCard'

interface FavouriteRow {
  favourite: Favourite
  pending: boolean
}

/** Favourites in their order with creates and edits not yet synced applied. */
function useFavouriteRows(favourites: readonly Favourite[]): FavouriteRow[] {
  const creates = usePendingLogs(endpoints.nutrition.createFavourite)
  const updates = usePendingLogs(endpoints.nutrition.updateFavourite)
  return useMemo(() => {
    const rows = new Map<string, FavouriteRow>(favourites.map((f) => [f.id, { favourite: f, pending: false }]))
    const now = new Date().toISOString()
    for (const p of creates) {
      if (rows.has(p.body.id)) continue
      const base = { id: p.body.id, label: p.body.label, sort_order: p.body.sort_order ?? 0, created_at: now, updated_at: now }
      // Totals arrive from the server; zero until then.
      const totals = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fibre_g: 0 }
      const favourite: Favourite =
        p.body.kind === 'food'
          ? { ...base, totals, kind: 'food', food_id: p.body.food_id, default_grams: p.body.default_grams }
          : { ...base, totals, kind: 'recipe', recipe: p.body.recipe }
      rows.set(p.body.id, { favourite, pending: true })
    }
    for (const p of updates) {
      const id = p.path.split('/')[3]
      const row = id ? rows.get(id) : undefined
      if (!row) continue
      const f = row.favourite
      const patched: Favourite =
        f.kind === 'food'
          ? { ...f, label: p.body.label ?? f.label, sort_order: p.body.sort_order ?? f.sort_order, default_grams: p.body.default_grams ?? f.default_grams }
          : { ...f, label: p.body.label ?? f.label, sort_order: p.body.sort_order ?? f.sort_order, recipe: p.body.recipe ?? f.recipe }
      rows.set(f.id, { favourite: patched, pending: true })
    }
    return [...rows.values()].sort((a, b) => a.favourite.sort_order - b.favourite.sort_order || a.favourite.label.localeCompare(b.favourite.label))
  }, [favourites, creates, updates])
}

/** Food names this phone has seen (meals and searches already loaded), for recipe lines. */
function useFoodNames(): Map<string, string> {
  const queryClient = useQueryClient()
  const names = new Map<string, string>()
  for (const [, meals] of queryClient.getQueriesData<Meal[]>({ queryKey: apiQueryKey(endpoints.nutrition.listMeals) })) {
    for (const meal of meals ?? []) for (const item of meal.items) if (item.food_id) names.set(item.food_id, item.description)
  }
  for (const [, foods] of queryClient.getQueriesData<Food[]>({ queryKey: apiQueryKey(endpoints.nutrition.searchFoods) })) {
    for (const food of foods ?? []) names.set(food.id, food.name)
  }
  return names
}

interface FavouritesManagerProps {
  favourites: readonly Favourite[]
  isLoading: boolean
  error: unknown
  onRetry: () => void
}

export function FavouritesManager({ favourites, isLoading, error, onRetry }: FavouritesManagerProps) {
  const rows = useFavouriteRows(favourites)
  const update = useLogMutation(endpoints.nutrition.updateFavourite)
  const [editing, setEditing] = useState<Favourite | null>(null)

  /** Move one place up or down: renumber everything 10, 20, 30… and PATCH only the rows whose order changed. */
  const move = (index: number, delta: -1 | 1) => {
    const order = rows.map((r) => r.favourite)
    const target = index + delta
    if (target < 0 || target >= order.length) return
    ;[order[index], order[target]] = [order[target] as Favourite, order[index] as Favourite]
    order.forEach((f, i) => {
      const sortOrder = (i + 1) * 10
      if (f.sort_order !== sortOrder) update.mutate({ params: { id: f.id }, body: { sort_order: sortOrder } })
    })
  }

  return (
    <LogCard title="Favourites" subtitle="One-tap meals in the meal form, in this order" collapsible testId="log-favourites">
      {isLoading && rows.length === 0 ? (
        <LoadingRows rows={2} />
      ) : error != null && rows.length === 0 ? (
        <LoadProblem what="Favourites" error={error} onRetry={onRetry} />
      ) : rows.length === 0 ? (
        <Box sx={{ fontSize: tokens.font.size.small, color: 'text.secondary' }}>
          None yet. On any logged meal, open its menu and choose “Save as favourite”; a meal with several foods becomes a recipe.
        </Box>
      ) : (
        <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {rows.map(({ favourite: f, pending }, i) => (
            <Box component="li" key={f.id} data-testid="favourite-manager-row" sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1, borderTop: i === 0 ? 0 : 1, borderColor: 'divider' }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ fontSize: tokens.font.size.emphasis, fontWeight: tokens.font.weight.label, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.label}</Box>
                <Box sx={{ fontSize: tokens.font.size.label, color: 'text.secondary', display: 'flex', gap: 2, alignItems: 'center' }}>
                  <span>
                    {f.kind === 'food' ? `${formatNumber(f.default_grams)} g` : `Recipe · ${f.recipe.length} ${f.recipe.length === 1 ? 'food' : 'foods'}`}
                    {f.totals.kcal > 0 && ` · ${formatNumber(f.totals.kcal)} kcal`}
                  </span>
                  {pending && <PendingBadge />}
                </Box>
              </Box>
              <IconButton aria-label={`Move ${f.label} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUpwardRounded fontSize="small" />
              </IconButton>
              <IconButton aria-label={`Move ${f.label} down`} disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                <ArrowDownwardRounded fontSize="small" />
              </IconButton>
              <IconButton aria-label={`Edit ${f.label}`} onClick={() => setEditing(f)}>
                <EditOutlined fontSize="small" />
              </IconButton>
            </Box>
          ))}
        </Box>
      )}
      {update.isError && (
        <Box role="alert" sx={{ color: 'error.main', fontSize: tokens.font.size.small, mt: 2 }}>
          {problemText(update.error)}
        </Box>
      )}
      {editing && <EditFavouriteDialog favourite={editing} onClose={() => setEditing(null)} />}
    </LogCard>
  )
}

function EditFavouriteDialog({ favourite, onClose }: { favourite: Favourite; onClose: () => void }) {
  const names = useFoodNames()
  const update = useLogMutation(endpoints.nutrition.updateFavourite)
  const [label, setLabel] = useState(favourite.label)
  const [grams, setGrams] = useState(favourite.kind === 'food' ? String(favourite.default_grams) : '')
  const [recipe, setRecipe] = useState(favourite.kind === 'recipe' ? favourite.recipe.map((r) => ({ ...r, text: String(r.grams) })) : [])

  const gramsN = parseNumber(grams)
  const recipeParsed = recipe.map((r) => ({ food_id: r.food_id, grams: parseNumber(r.text) }))
  const valid =
    label.trim().length > 0 &&
    (favourite.kind === 'food'
      ? gramsN !== null && gramsN > 0 && gramsN <= 5000
      : recipeParsed.length > 0 && recipeParsed.every((r) => r.grams !== null && r.grams > 0 && r.grams <= 5000))

  const save = () => {
    if (!valid) return
    update.mutate(
      {
        params: { id: favourite.id },
        body: {
          label: label.trim() === favourite.label ? undefined : label.trim(),
          default_grams: favourite.kind === 'food' && gramsN !== null && gramsN !== favourite.default_grams ? gramsN : undefined,
          recipe: favourite.kind === 'recipe' ? recipeParsed.map((r) => ({ food_id: r.food_id, grams: r.grams ?? 0 })) : undefined,
        },
      },
      { onSuccess: onClose },
    )
  }

  return (
    <Dialog open onClose={onClose} aria-labelledby="edit-favourite-title" maxWidth="xs" fullWidth>
      <DialogTitle id="edit-favourite-title">Edit favourite</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 3, pt: '8px !important' }}>
        <TextField label="Name" value={label} onChange={(e) => setLabel(e.target.value)} slotProps={{ htmlInput: { maxLength: 100 } }} />
        {favourite.kind === 'food' ? (
          <NumberField label="Default grams" value={grams} onChange={setGrams} unit="g" />
        ) : (
          <Box component="ul" aria-label="Recipe" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 2 }}>
            {recipe.map((r, i) => (
              <Box component="li" key={`${r.food_id}-${i}`} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ flex: 1, minWidth: 0, fontSize: tokens.font.size.small, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {names.get(r.food_id) ?? `Food ${i + 1}`}
                </Box>
                <NumberField
                  value={r.text}
                  onChange={(v) => setRecipe((list) => list.map((x, j) => (j === i ? { ...x, text: v } : x)))}
                  unit="g"
                  size="small"
                  sx={{ width: 104 }}
                  slotProps={{ htmlInput: { 'aria-label': `Grams of ${names.get(r.food_id) ?? `food ${i + 1}`}` } }}
                />
                <IconButton aria-label="Remove from recipe" disabled={recipe.length === 1} onClick={() => setRecipe((list) => list.filter((_, j) => j !== i))}>
                  <CloseRounded />
                </IconButton>
              </Box>
            ))}
          </Box>
        )}
        {update.isError && (
          <Box role="alert" sx={{ color: 'error.main', fontSize: tokens.font.size.small }}>
            {problemText(update.error)}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 6, pb: 4, gap: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={!valid || update.isPending}>
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
