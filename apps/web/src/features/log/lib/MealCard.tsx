// Owns: one meal on the Log tab — time, status (analysing / review / confirmed), items with grams and kcal, the text it
// was logged as, pending state — and its actions: confirm a meal in review, edit, save as favourite, delete.
import MoreHorizRounded from '@mui/icons-material/MoreHorizRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { endpoints } from '@fitness/shared/api'
import { useState } from 'react'
import { formatNumber, PendingBadge } from '../../../components'
import { tokens } from '../../../theme'
import { clockOf, problemText, useLogMutation } from '../../quick-log'
import type { MealView } from './meals'

interface MealCardProps {
  meal: MealView
  onEdit: () => void
  onFavourite: () => void
  onDelete: () => void
}

const STATUS_LABEL = { parsing: 'Waiting for analysis', review: 'Review', confirmed: null } as const

export function MealCard({ meal, onEdit, onFavourite, onDelete }: MealCardProps) {
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const confirm = useLogMutation(endpoints.nutrition.updateMeal)
  const status = STATUS_LABEL[meal.status]
  const canAct = meal.meal !== null && meal.pending !== 'create'

  return (
    <Box data-testid="meal-card" sx={{ py: 2, borderTop: 1, borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minHeight: tokens.tapTarget }}>
        <Box sx={{ fontSize: 14, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{clockOf(meal.eatenAt)}</Box>
        {status && <Chip size="small" variant="outlined" label={status} sx={{ color: 'text.secondary', borderColor: 'divider' }} />}
        {meal.pending && (meal.queued || meal.pending === 'create') && <PendingBadge label={meal.pending === 'edit' ? 'Edit pending' : 'Pending'} />}
        <Box sx={{ flex: 1 }} />
        <Box sx={{ fontSize: 15, fontWeight: tokens.font.weight.label, fontVariantNumeric: 'tabular-nums' }}>
          {meal.status === 'parsing' && meal.items.length === 0 ? '' : meal.totals ? `${formatNumber(meal.totals.kcal)} kcal` : '— kcal'}
        </Box>
        {canAct && (
          <IconButton aria-label="Meal actions" onClick={(e) => setMenu(e.currentTarget)} edge="end">
            <MoreHorizRounded />
          </IconButton>
        )}
      </Box>

      {meal.rawText && (meal.items.length === 0 || meal.status !== 'confirmed') && (
        <Box sx={{ fontSize: 14, lineHeight: 1.5, mb: 1 }}>
          “{meal.rawText}”
          {meal.status === 'parsing' && meal.items.length === 0 && (
            <Box sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5 }}>
              Saved as text. The AI analysis (phase 2) will add the items and kcal for you to check.
            </Box>
          )}
        </Box>
      )}

      {meal.items.length > 0 && (
        <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 0.75 }}>
          {meal.items.map((item) => (
            <Box component="li" key={item.id} sx={{ display: 'flex', gap: 2, fontSize: 14, alignItems: 'baseline' }}>
              <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.description}
                {item.estimated && (
                  <Box component="span" sx={{ color: 'text.secondary', fontSize: 12 }}>
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
        <Box sx={{ fontSize: 12, color: 'text.secondary', mt: 1, fontVariantNumeric: 'tabular-nums' }}>
          {formatNumber(meal.totals.protein_g)} g protein · {formatNumber(meal.totals.carbs_g)} g carbs · {formatNumber(meal.totals.fat_g)} g fat
        </Box>
      )}

      {meal.status === 'review' && canAct && (
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 2 }}>
          <Button variant="outlined" onClick={onEdit}>
            Edit items
          </Button>
          <Button variant="contained" disabled={confirm.isPending} onClick={() => confirm.mutate({ params: { id: meal.id }, body: { confirm: true } })}>
            {confirm.isPending ? 'Saving…' : 'Confirm'}
          </Button>
        </Box>
      )}
      {confirm.isError && (
        <Box role="alert" sx={{ color: 'error.main', fontSize: 14, mt: 1 }}>
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
