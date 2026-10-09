// Owns: one meal on the Log tab (2a) — its status chip (analysing / to review / confirmed), pending state, kcal and
// actions menu (edit, save as favourite, delete), which sit in the slot card's header when the meal is the slot's only
// one; and its body: photos, the text it was logged as, the analysis progress (open the review), a failed analysis that
// reads calmly with "Add items", the item table (icon and name with an "Estimated" chip, grams, kcal, protein, where
// the item came from), and Review / Confirm for a meal in review (confirm as it is). `MealCard` is the meal with its
// own time row, for a slot holding several meals.
import MoreHorizRounded from '@mui/icons-material/MoreHorizRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import { endpoints } from '@fitness/shared/api'
import { useState } from 'react'
import { formatClock, formatNumber, PendingBadge, StatusChip, type StatusChipTone } from '../../../components'
import { tokens } from '../../../theme'
import { useLogMutation } from '../../quick-log'
import { FoodGlyph } from './FoodGlyph'
import type { ItemView, MealView } from './meals'
import { problemText } from '../../../api'

interface MealActionsProps {
  meal: MealView
  onEdit: () => void
  onFavourite: () => void
  onDelete: () => void
}

interface MealBodyProps {
  meal: MealView
  /** Open the review (analysis progress, then the item list and Confirm). */
  onReview: () => void
}

const STATUS: Record<MealView['status'], { label: string; tone: StatusChipTone }> = {
  parsing: { label: 'Analysing', tone: 'info' },
  review: { label: 'To review', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'success' },
}

/** What a slot holds while its meals load: a meal's header row, table head and two item rows. */
export const MEAL_CARD_PX = 120

/** The meal's row padding: the card's 20 px gutter (the item table brings its own). */
const gutter = { px: `${tokens.pad.card.x}px` } as const

const canActOn = (meal: MealView) => meal.meal !== null && meal.pending !== 'create'
const aiAnalysed = (meal: MealView) => meal.inputMethod === 'text' || meal.inputMethod === 'voice' || meal.inputMethod === 'photo'
const analysisFailed = (meal: MealView) => meal.status === 'review' && aiAnalysed(meal) && meal.items.length === 0

/** The meal's kcal as its header shows it: nothing while analysing or after a failed analysis with no items yet. */
export function mealKcal(meal: MealView): string {
  if ((meal.status === 'parsing' || analysisFailed(meal)) && meal.items.length === 0) return ''
  return meal.totals ? `${formatNumber(meal.totals.kcal)} kcal` : '— kcal'
}

/** Status chip, pending badge, kcal (14/600) and the actions menu. */
export function MealActions({ meal, onEdit, onFavourite, onDelete }: MealActionsProps) {
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const status = STATUS[meal.status]
  const kcal = mealKcal(meal)
  const pick = (action: () => void) => () => {
    setMenu(null)
    action()
  }
  return (
    <>
      {meal.pending && (meal.queued || meal.pending === 'create') && <PendingBadge label={meal.pending === 'edit' ? 'Edit pending' : 'Pending'} />}
      <StatusChip tone={status.tone} label={status.label} />
      {kcal && (
        <Box sx={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.heading, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{kcal}</Box>
      )}
      {canActOn(meal) && (
        <IconButton size="small" aria-label="Meal actions" onClick={(e) => setMenu(e.currentTarget)} sx={{ color: tokens.ink.secondary }}>
          <MoreHorizRounded sx={{ fontSize: 18 }} />
        </IconButton>
      )}
      <Menu anchorEl={menu} open={menu !== null} onClose={() => setMenu(null)}>
        <MenuItem onClick={pick(onEdit)}>Edit</MenuItem>
        <MenuItem disabled={!meal.items.some((i) => i.foodId)} onClick={pick(onFavourite)}>
          Save as favourite
        </MenuItem>
        <MenuItem onClick={pick(onDelete)} sx={{ color: 'error.main' }}>
          Delete
        </MenuItem>
      </Menu>
    </>
  )
}

/** Everything under the meal's header, flush to the card's edges (the table runs edge to edge). */
export function MealBody({ meal, onReview }: MealBodyProps) {
  const confirm = useLogMutation(endpoints.nutrition.updateMeal)
  const canAct = canActOn(meal)
  const failed = analysisFailed(meal)

  return (
    <>
      {meal.photos.length > 0 && (
        <Box sx={{ ...gutter, pb: 3, display: 'flex', gap: 1.5 }} aria-label="Meal photos">
          {meal.photos.map((src) => (
            <Box
              key={src}
              component="img"
              src={src}
              alt=""
              sx={{ width: 48, height: 48, objectFit: 'cover', borderRadius: `${tokens.radius.control}px`, border: `1px solid ${tokens.ink.border}` }}
            />
          ))}
        </Box>
      )}

      {meal.rawText && (meal.items.length === 0 || meal.status !== 'confirmed') && (
        <Box sx={{ ...gutter, pb: 3, fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.body }}>“{meal.rawText}”</Box>
      )}

      {meal.status === 'parsing' && (
        <Box sx={{ ...gutter, pb: 4, display: 'flex', alignItems: 'center', gap: 3 }} data-testid="meal-analysing-row">
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {canAct ? (
              <>
                <LinearProgress
                  aria-label="Analysing"
                  sx={{ height: 6, borderRadius: `${tokens.radius.pill}px`, bgcolor: tokens.ink.fill, '& .MuiLinearProgress-bar': { bgcolor: tokens.metric.calories } }}
                />
                <Box sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.secondary, mt: 2 }}>The AI is working out the items.</Box>
              </>
            ) : (
              <Box sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.secondary }}>Saved on this device. It's analysed once it syncs.</Box>
            )}
          </Box>
          {canAct && (
            <Button variant="outlined" size="dense" onClick={onReview}>
              Open
            </Button>
          )}
        </Box>
      )}

      {failed && canAct && (
        <Box sx={{ ...gutter, pb: 4, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 3 }} data-testid="meal-analysis-failed">
          <Box sx={{ flex: '1 1 200px', fontSize: tokens.font.size.small, color: tokens.ink.secondary, lineHeight: tokens.font.leading.small }}>
            The AI couldn't read this one. Add the items yourself.
          </Box>
          <Button variant="contained" size="dense" onClick={onReview}>
            Add items
          </Button>
        </Box>
      )}

      {meal.items.length > 0 && <ItemTable meal={meal} />}

      {meal.status === 'review' && canAct && !failed && (
        <Box sx={{ ...gutter, py: 3, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, borderTop: `1px solid ${tokens.ink.hairline}` }}>
          <Button variant="outlined" onClick={onReview} data-testid="meal-review-open">
            Review
          </Button>
          <Button
            variant="contained"
            disabled={confirm.isPending || meal.items.length === 0}
            onClick={() => confirm.mutate({ params: { id: meal.id }, body: { confirm: true } })}
          >
            {confirm.isPending ? 'Saving…' : 'Confirm'}
          </Button>
        </Box>
      )}
      {confirm.isError && (
        <Box role="alert" sx={{ ...gutter, pb: 3, color: tokens.tone.danger.text, fontSize: tokens.font.size.small }}>
          {problemText(confirm.error)}
        </Box>
      )}
    </>
  )
}

/** A meal in a slot holding several: its own time row (time, status, kcal, menu) over its body. */
export function MealCard({ meal, ...actions }: MealActionsProps & MealBodyProps) {
  return (
    <Box data-testid="meal-card" sx={{ borderTop: `1px solid ${tokens.ink.border}` }}>
      <Box sx={{ ...gutter, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 10px', py: '10px' }}>
        <Box sx={{ flex: 1, fontSize: tokens.font.size.small, color: tokens.ink.secondary, fontVariantNumeric: 'tabular-nums' }}>{formatClock(meal.eatenAt)}</Box>
        <MealActions meal={meal} onEdit={actions.onEdit} onFavourite={actions.onFavourite} onDelete={actions.onDelete} />
      </Box>
      <MealBody meal={meal} onReview={actions.onReview} />
    </Box>
  )
}

/**
 * Where an item came from, as far as the meal knows. An item carries no food source (2a's "CNF"), only whether it links
 * to a food in the database, so such an item reads "Database".
 */
function sourceOf(meal: MealView, item: ItemView): { label: string; tone: StatusChipTone } {
  if (meal.inputMethod === 'favorite') return { label: 'Favourite', tone: 'outline' }
  if (item.estimated || aiAnalysed(meal)) return { label: 'AI', tone: 'info' }
  if (meal.inputMethod === 'barcode') return { label: 'Barcode', tone: 'outline' }
  return { label: item.foodId ? 'Database' : 'By hand', tone: 'outline' }
}

/** Below this card width the Source column goes (a phone, the half-width column at `md`). */
const NARROW = '@container (max-width: 479px)'

/** 2a's item table: Item (icon, name, "Estimated") · Grams · kcal · Protein · Source. */
function ItemTable({ meal }: { meal: MealView }) {
  return (
    <Box sx={{ containerType: 'inline-size' }}>
      <Table
        aria-label="Items"
        sx={{
          [NARROW]: {
            '& .item-source': { display: 'none' },
            '& .item-protein': { pr: `${tokens.pad.card.x}px` },
          },
        }}
      >
        <TableHead>
          <TableRow>
            {/* Half the card for the name, as 2a's table gives it; the numbers share the rest. */}
            <TableCell sx={{ width: '50%' }}>Item</TableCell>
            <TableCell align="right">Grams</TableCell>
            <TableCell align="right">kcal</TableCell>
            <TableCell align="right" className="item-protein">
              Protein
            </TableCell>
            <TableCell align="right" className="item-source">
              Source
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {meal.items.map((item) => {
            const source = sourceOf(meal, item)
            return (
              <TableRow key={item.id}>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <FoodGlyph name={item.description} />
                    {/* The chip drops under the name rather than splitting it, when the column is narrow. */}
                    <Box sx={{ minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px 6px' }}>
                      <Box component="span" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                        {item.description}
                      </Box>
                      {item.estimated && <StatusChip tone="warning" size="small" label="Estimated" />}
                    </Box>
                  </Box>
                </TableCell>
                <TableCell align="right" sx={{ color: tokens.ink.label, whiteSpace: 'nowrap' }}>
                  {item.grams > 0 ? `${formatNumber(item.grams)} g` : '—'}
                </TableCell>
                <TableCell align="right">{item.nutrients ? formatNumber(item.nutrients.kcal) : '—'}</TableCell>
                <TableCell align="right" className="item-protein" sx={{ whiteSpace: 'nowrap' }}>
                  {item.nutrients ? `${formatNumber(item.nutrients.protein_g)} g` : '—'}
                </TableCell>
                <TableCell align="right" className="item-source">
                  <StatusChip tone={source.tone} size="small" label={source.label} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </Box>
  )
}
