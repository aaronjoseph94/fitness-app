// Owns: one meal on the Log tab (1d Summit) — its status chip (analysing / to review / confirmed), pending state, kcal
// (Outfit, with its unit) and actions menu (edit, save as favourite, delete), which sit in the slot card's header when
// the meal is the slot's only one; and its body: photos, the text it was logged as, the analysis progress (open the
// review), a failed analysis that reads calmly with "Add items", the item table in a sideways-scrolling wrapper (icon
// and name with an "Estimated" chip, grams, kcal, protein, where the item came from as a chip), and Review / Confirm for
// a meal in review (confirm as it is). `MealCard` is the meal with its own time row, for a slot holding several meals.
import CheckRounded from '@mui/icons-material/CheckRounded'
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
import type { SvgIconComponent } from '@mui/icons-material'
import { endpoints } from '@fitness/shared/api'
import { useState } from 'react'
import {
  formatClock,
  formatNumber,
  PendingBadge,
  StatusChip,
  TableScroll,
  type StatusChipTone,
} from '../../../components'
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

const STATUS: Record<MealView['status'], { label: string; tone: StatusChipTone; icon?: SvgIconComponent }> = {
  parsing: { label: 'Analysing', tone: 'info' },
  review: { label: 'To review', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'success', icon: CheckRounded },
}

/** What a slot holds while its meals load: a meal's header row, table head and two item rows. */
export const MEAL_CARD_PX = 120

const canActOn = (meal: MealView) => meal.meal !== null && meal.pending !== 'create'
const aiAnalysed = (meal: MealView) =>
  meal.inputMethod === 'text' || meal.inputMethod === 'voice' || meal.inputMethod === 'photo'
const analysisFailed = (meal: MealView) =>
  meal.status === 'review' && aiAnalysed(meal) && meal.items.length === 0

/** The meal's kcal as its header shows it: nothing while analysing or after a failed analysis with no items yet. */
export function mealKcal(meal: MealView): string {
  if ((meal.status === 'parsing' || analysisFailed(meal)) && meal.items.length === 0) return ''
  return meal.totals ? `${formatNumber(meal.totals.kcal)} kcal` : '— kcal'
}

/** A kcal figure in Outfit 400 with its unit in DM Sans 12/500 muted ("320 kcal"). */
export function KcalFigure({ kcal }: { kcal: number | null }) {
  return (
    <Box
      component="span"
      sx={{
        fontFamily: tokens.font.display,
        fontSize: 18,
        fontWeight: tokens.font.weight.number,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}
    >
      {kcal === null ? '—' : formatNumber(kcal)}{' '}
      <Box
        component="span"
        sx={{
          fontFamily: tokens.font.family,
          fontSize: tokens.font.size.caption,
          fontWeight: tokens.font.weight.body,
          color: tokens.ink.secondary,
        }}
      >
        kcal
      </Box>
    </Box>
  )
}

/** A round 36 px ghost icon button (44 on touch, from the theme): a meal's menu, a slot's add. */
export const roundIconSx = {
  width: 36,
  height: 36,
  borderRadius: '50%',
  color: tokens.ink.secondary,
} as const

/** Status chip, pending badge, kcal and the actions menu. */
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
      {meal.pending && (meal.queued || meal.pending === 'create') && (
        <PendingBadge label={meal.pending === 'edit' ? 'Edit pending' : 'Pending'} />
      )}
      <StatusChip tone={status.tone} icon={status.icon} label={status.label} />
      {kcal && <KcalFigure kcal={meal.totals?.kcal ?? null} />}
      {canActOn(meal) && (
        <IconButton aria-label="Meal actions" onClick={(e) => setMenu(e.currentTarget)} sx={roundIconSx}>
          <MoreHorizRounded sx={{ fontSize: 22 }} />
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

const noteSx = {
  fontSize: tokens.font.size.small,
  lineHeight: tokens.font.leading.small,
  color: tokens.ink.secondary,
} as const

/** Everything under the meal's header, inside the slot card's padding. */
export function MealBody({ meal, onReview }: MealBodyProps) {
  const confirm = useLogMutation(endpoints.nutrition.updateMeal)
  const canAct = canActOn(meal)
  const failed = analysisFailed(meal)

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '12px', minWidth: 0 }}>
      {meal.photos.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }} aria-label="Meal photos">
          {meal.photos.map((src) => (
            <Box
              key={src}
              component="img"
              src={src}
              alt=""
              sx={{
                width: 52,
                height: 52,
                objectFit: 'cover',
                borderRadius: `${tokens.summit.radius.wellSmall}px`,
              }}
            />
          ))}
        </Box>
      )}

      {meal.rawText && (meal.items.length === 0 || meal.status !== 'confirmed') && (
        <Box
          sx={{
            px: '14px',
            py: '10px',
            borderRadius: `${tokens.summit.radius.wellSmall}px`,
            bgcolor: tokens.ink.panel,
            fontSize: tokens.font.size.body,
            lineHeight: tokens.font.leading.small,
            color: tokens.ink.body,
          }}
        >
          “{meal.rawText}”
        </Box>
      )}

      {meal.status === 'parsing' && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }} data-testid="meal-analysing-row">
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {canAct ? (
              <>
                <LinearProgress
                  aria-label="Analysing"
                  sx={{
                    height: 6,
                    borderRadius: `${tokens.radius.pill}px`,
                    bgcolor: tokens.summit.ramp.calories.track,
                    '& .MuiLinearProgress-bar': { bgcolor: tokens.metric.calories },
                  }}
                />
                <Box sx={{ ...noteSx, fontSize: tokens.font.size.caption, mt: 2 }}>
                  The AI is working out the items.
                </Box>
              </>
            ) : (
              <Box sx={{ ...noteSx, fontSize: tokens.font.size.caption }}>
                Saved on this device. It's analysed once it syncs.
              </Box>
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
        <Box
          sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 3 }}
          data-testid="meal-analysis-failed"
        >
          <Box sx={{ ...noteSx, flex: '1 1 200px' }}>
            The AI couldn't read this one. Add the items yourself.
          </Box>
          <Button variant="contained" size="dense" onClick={onReview}>
            Add items
          </Button>
        </Box>
      )}

      {meal.items.length > 0 && <ItemTable meal={meal} />}

      {meal.status === 'review' && canAct && !failed && (
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          <Button variant="outlined" onClick={onReview} data-testid="meal-review-open">
            Review
          </Button>
          <Button
            variant="contained"
            color="dark"
            disabled={confirm.isPending || meal.items.length === 0}
            onClick={() => confirm.mutate({ params: { id: meal.id }, body: { confirm: true } })}
          >
            {confirm.isPending ? 'Saving…' : 'Confirm'}
          </Button>
        </Box>
      )}
      {confirm.isError && (
        <Box role="alert" sx={{ color: tokens.tone.danger.text, fontSize: tokens.font.size.small }}>
          {problemText(confirm.error)}
        </Box>
      )}
    </Box>
  )
}

/** A meal in a slot holding several: its own time row (time, status, kcal, menu) over its body. */
export function MealCard({ meal, ...actions }: MealActionsProps & MealBodyProps) {
  return (
    <Box data-testid="meal-card" sx={{ pt: '12px', borderTop: `1px solid ${tokens.ink.hairline}` }}>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 10px', pb: '10px' }}>
        <Box
          sx={{
            flex: '1 1 auto',
            fontSize: tokens.font.size.small,
            fontWeight: tokens.font.weight.label,
            color: tokens.ink.secondary,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatClock(meal.eatenAt)}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 10px' }}>
          <MealActions
            meal={meal}
            onEdit={actions.onEdit}
            onFavourite={actions.onFavourite}
            onDelete={actions.onDelete}
          />
        </Box>
      </Box>
      <MealBody meal={meal} onReview={actions.onReview} />
    </Box>
  )
}

/**
 * Where an item came from, as far as the meal knows. An item carries no food source (the mock's "CNF"), only whether it
 * links to a food in the database, so such an item reads "Database".
 */
function sourceOf(meal: MealView, item: ItemView): { label: string; tone: StatusChipTone } {
  if (meal.inputMethod === 'favorite') return { label: 'Favourite', tone: 'neutral' }
  if (item.estimated || aiAnalysed(meal)) return { label: 'AI', tone: 'info' }
  if (meal.inputMethod === 'barcode') return { label: 'Barcode', tone: 'neutral' }
  return { label: item.foodId ? 'Database' : 'By hand', tone: 'neutral' }
}

/**
 * 1d's item table: Item (icon, name, "Estimated") · Grams · kcal · Protein · Source, flush with the card's padding; at
 * least 520 px wide inside its wrapper, so on a phone it scrolls sideways within the card (README §4).
 */
function ItemTable({ meal }: { meal: MealView }) {
  return (
    <TableScroll ariaLabel={`Items, ${formatClock(meal.eatenAt)}`}>
      <Table
        aria-label="Items"
        sx={{
          '& .MuiTableCell-root': { fontSize: tokens.font.size.body, px: '8px', py: '9px' },
          '& .MuiTableCell-root:first-of-type': { pl: 0 },
          '& .MuiTableCell-root:last-of-type': { pr: 0 },
          '& .MuiTableCell-head': {
            fontSize: tokens.font.size.caption,
            pt: '6px',
            pb: '8px',
            borderBottom: `1px solid ${tokens.ink.hairline}`,
          },
        }}
      >
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: '50%' }}>Item</TableCell>
            <TableCell align="right">Grams</TableCell>
            <TableCell align="right">kcal</TableCell>
            <TableCell align="right">Protein</TableCell>
            <TableCell align="right" sx={{ pl: '20px !important' }}>
              Source
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {meal.items.map((item) => {
            const source = sourceOf(meal, item)
            return (
              <TableRow key={item.id}>
                <TableCell sx={{ fontWeight: tokens.font.weight.label }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <FoodGlyph name={item.description} />
                    <Box
                      sx={{
                        minWidth: 0,
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '2px 6px',
                      }}
                    >
                      <Box component="span" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                        {item.description}
                      </Box>
                      {item.estimated && <StatusChip tone="warning" size="small" label="Estimated" />}
                    </Box>
                  </Box>
                </TableCell>
                <TableCell align="right" sx={{ color: tokens.ink.secondary, whiteSpace: 'nowrap' }}>
                  {item.grams > 0 ? formatNumber(item.grams) : '—'}
                </TableCell>
                <TableCell align="right">
                  {item.nutrients ? formatNumber(item.nutrients.kcal) : '—'}
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  {item.nutrients ? `${formatNumber(item.nutrients.protein_g)} g` : '—'}
                </TableCell>
                <TableCell align="right" sx={{ pl: '20px !important' }}>
                  <StatusChip tone={source.tone} size="small" label={source.label} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableScroll>
  )
}
