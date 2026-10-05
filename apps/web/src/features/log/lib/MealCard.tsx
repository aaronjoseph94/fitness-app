// Owns: one meal on the Log tab — time, status (analysing / review / confirmed), its photos, items with grams and kcal,
// the text it was logged as, pending state — and its actions: open the review (while analysing, or to check items),
// confirm a meal in review as it is, edit, save as favourite, delete. A failed analysis reads calmly with "Add items".
import MoreHorizRounded from '@mui/icons-material/MoreHorizRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { endpoints } from '@fitness/shared/api'
import { useState } from 'react'
import { formatNumber, PendingBadge } from '../../../components'
import { tokens } from '../../../theme'
import { clockOf, useLogMutation } from '../../quick-log'
import type { MealView } from './meals'
import { problemText } from '../../../api'

interface MealCardProps {
  meal: MealView
  /** Open the review (analysis progress, then the item list and Confirm). */
  onReview: () => void
  onEdit: () => void
  onFavourite: () => void
  onDelete: () => void
}

const STATUS_LABEL = { parsing: 'Analysing', review: 'To review', confirmed: null } as const

/** Height of a confirmed meal's card with one line of items at phone width: what a slot holds while its meals load. */
export const MEAL_CARD_PX = 104

export function MealCard({ meal, onReview, onEdit, onFavourite, onDelete }: MealCardProps) {
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const confirm = useLogMutation(endpoints.nutrition.updateMeal)
  const status = STATUS_LABEL[meal.status]
  const canAct = meal.meal !== null && meal.pending !== 'create'
  const analysed = meal.inputMethod === 'text' || meal.inputMethod === 'voice' || meal.inputMethod === 'photo'
  const failed = meal.status === 'review' && analysed && meal.items.length === 0

  return (
    <Box data-testid="meal-card" sx={{ py: 2, borderTop: 1, borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minHeight: tokens.tapTarget }}>
        <Box sx={{ fontSize: tokens.font.size.small, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{clockOf(meal.eatenAt)}</Box>
        {status && <Chip size="small" variant="outlined" label={status} sx={{ color: 'text.secondary', borderColor: 'divider' }} />}
        {meal.pending && (meal.queued || meal.pending === 'create') && <PendingBadge label={meal.pending === 'edit' ? 'Edit pending' : 'Pending'} />}
        <Box sx={{ flex: 1 }} />
        <Box sx={{ fontSize: tokens.font.size.emphasis, fontWeight: tokens.font.weight.label, fontVariantNumeric: 'tabular-nums' }}>
          {(meal.status === 'parsing' || failed) && meal.items.length === 0 ? '' : meal.totals ? `${formatNumber(meal.totals.kcal)} kcal` : '— kcal'}
        </Box>
        {canAct && (
          <IconButton aria-label="Meal actions" onClick={(e) => setMenu(e.currentTarget)} edge="end">
            <MoreHorizRounded />
          </IconButton>
        )}
      </Box>

      {meal.photos.length > 0 && (
        <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5 }} aria-label="Meal photos">
          {meal.photos.map((src) => (
            <Box key={src} component="img" src={src} alt="" sx={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 2, border: 1, borderColor: 'divider' }} />
          ))}
        </Box>
      )}

      {meal.rawText && (meal.items.length === 0 || meal.status !== 'confirmed') && (
        <Box sx={{ fontSize: tokens.font.size.small, lineHeight: 1.5, mb: 1 }}>“{meal.rawText}”</Box>
      )}

      {meal.status === 'parsing' && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }} data-testid="meal-analysing-row">
          <Box sx={{ flex: 1 }}>
            {canAct ? (
              <>
                <LinearProgress sx={{ height: 4, borderRadius: tokens.radius.chip, bgcolor: tokens.ink.border, '& .MuiLinearProgress-bar': { bgcolor: tokens.metric.calories } }} />
                <Box sx={{ fontSize: tokens.font.size.label, color: 'text.secondary', mt: 1 }}>The AI is working out the items.</Box>
              </>
            ) : (
              <Box sx={{ fontSize: tokens.font.size.label, color: 'text.secondary' }}>Saved on this phone. It's analysed once it syncs.</Box>
            )}
          </Box>
          {canAct && (
            <Button variant="text" onClick={onReview}>
              Open
            </Button>
          )}
        </Box>
      )}

      {failed && canAct && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }} data-testid="meal-analysis-failed">
          <Box sx={{ flex: 1, fontSize: tokens.font.size.label, color: 'text.secondary', lineHeight: 1.5 }}>The AI couldn't read this one. Add the items yourself.</Box>
          <Button variant="contained" onClick={onReview}>
            Add items
          </Button>
        </Box>
      )}

      {meal.items.length > 0 && (
        // minmax(0, 1fr): a long name must not widen the column past the card. It wraps to two lines, then ellipsis;
        // grams and kcal stay on its first line, kcal right-aligned.
        <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.75 }}>
          {meal.items.map((item) => (
            <Box component="li" key={item.id} sx={{ display: 'flex', gap: 2, fontSize: tokens.font.size.small, alignItems: 'baseline' }}>
              <Box
                sx={{
                  flex: 1,
                  minWidth: 0,
                  lineHeight: 1.4,
                  overflowWrap: 'anywhere',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {item.description}
                {item.estimated && (
                  <Box component="span" sx={{ color: 'text.secondary', fontSize: tokens.font.size.caption }}>
                    {' '}
                    · estimated
                  </Box>
                )}
              </Box>
              {item.grams > 0 && (
                <Box sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums', flex: 'none' }}>{formatNumber(item.grams)} g</Box>
              )}
              <Box sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums', flex: 'none', minWidth: 64, textAlign: 'right' }}>
                {item.nutrients ? `${formatNumber(item.nutrients.kcal)} kcal` : '—'}
              </Box>
            </Box>
          ))}
        </Box>
      )}
      {meal.totals && meal.totals.kcal > 0 && (
        <Box sx={{ fontSize: tokens.font.size.caption, color: 'text.secondary', mt: 1, fontVariantNumeric: 'tabular-nums' }}>
          {formatNumber(meal.totals.protein_g)} g protein · {formatNumber(meal.totals.carbs_g)} g carbs · {formatNumber(meal.totals.fat_g)} g fat
        </Box>
      )}

      {meal.status === 'review' && canAct && !failed && (
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 2 }}>
          <Button variant="outlined" onClick={onReview} data-testid="meal-review-open">
            Review
          </Button>
          <Button variant="contained" disabled={confirm.isPending} onClick={() => confirm.mutate({ params: { id: meal.id }, body: { confirm: true } })}>
            {confirm.isPending ? 'Saving…' : 'Confirm'}
          </Button>
        </Box>
      )}
      {confirm.isError && (
        <Box role="alert" sx={{ color: 'error.main', fontSize: tokens.font.size.small, mt: 1 }}>
          {problemText(confirm.error)}
        </Box>
      )}

      <Menu anchorEl={menu} open={menu !== null} onClose={() => setMenu(null)}>
        <MenuItem
          sx={{ minHeight: tokens.tapTarget }}
          onClick={() => {
            setMenu(null)
            onEdit()
          }}
        >
          Edit
        </MenuItem>
        <MenuItem
          sx={{ minHeight: tokens.tapTarget }}
          disabled={!meal.items.some((i) => i.foodId)}
          onClick={() => {
            setMenu(null)
            onFavourite()
          }}
        >
          Save as favourite
        </MenuItem>
        <MenuItem
          sx={{ minHeight: tokens.tapTarget, color: 'error.main' }}
          onClick={() => {
            setMenu(null)
            onDelete()
          }}
        >
          Delete
        </MenuItem>
      </Menu>
    </Box>
  )
}
