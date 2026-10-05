// Owns: one exercise in the builder — drag handle (touch-friendly, the only drag target so the page still scrolls),
// thumbnail, name and a one-line prescription; expanded, the editors: sets stepper, rep range min–max, target load kg,
// rest seconds (one-tap presets), note; and the row menu (about, swap, remove).
import AddRounded from '@mui/icons-material/AddRounded'
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded'
import DragIndicatorRounded from '@mui/icons-material/DragIndicatorRounded'
import InfoOutlined from '@mui/icons-material/InfoOutlined'
import MoreVertRounded from '@mui/icons-material/MoreVertRounded'
import RemoveRounded from '@mui/icons-material/RemoveRounded'
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ExerciseSummary, TemplateExerciseInput } from '@fitness/shared/schemas'
import { useEffect, useState } from 'react'
import { formatNumber } from '../../../components'
import { tokens, withAlpha } from '../../../theme'
import { ExerciseThumb } from '../../library'

export type BuilderItem = TemplateExerciseInput & { key: string }

const REST_PRESETS = [60, 90, 120, 180] as const

/** "3 × 8–12 · 40 kg · 90 s rest". */
export function prescription(e: Pick<TemplateExerciseInput, 'sets' | 'rep_min' | 'rep_max' | 'target_load_kg' | 'rest_sec'>): string {
  const reps = e.rep_min === e.rep_max ? `${e.rep_min}` : `${e.rep_min}–${e.rep_max}`
  const load = e.target_load_kg !== null ? ` · ${formatNumber(e.target_load_kg, 1)} kg` : ''
  return `${e.sets} × ${reps}${load} · ${e.rest_sec} s rest`
}

/** A small number box that keeps what is typed and reports a parsed value (null when empty). */
function NumberBox({
  label,
  value,
  onChange,
  integer = true,
  unit,
  width = 72,
  ariaLabel,
}: {
  label: string
  ariaLabel?: string
  value: number | null
  onChange: (value: number | null) => void
  integer?: boolean
  unit?: string
  width?: number
}) {
  const [text, setText] = useState(value === null ? '' : String(value))
  useEffect(() => {
    setText((t) => (Number(t.replace(',', '.')) === value && t !== '' ? t : value === null ? '' : String(value)))
  }, [value])
  return (
    <TextField
      label={label}
      size="small"
      value={text}
      onChange={(e) => {
        const raw = e.target.value.replace(',', '.')
        if (raw !== '' && !(integer ? /^\d*$/ : /^\d*\.?\d*$/).test(raw)) return
        setText(raw)
        const n = raw === '' ? null : Number(raw)
        if (n === null || Number.isFinite(n)) onChange(n)
      }}
      onFocus={(e) => e.target.select()}
      sx={{ width, flex: 'none', '& input': { textAlign: 'center', fontVariantNumeric: 'tabular-nums', py: 1.5, minHeight: 28 } }}
      slotProps={{
        htmlInput: { inputMode: integer ? 'numeric' : 'decimal', pattern: integer ? '[0-9]*' : '[0-9]*[.,]?[0-9]*', 'aria-label': ariaLabel ?? label, enterKeyHint: 'done' },
        input: unit ? { endAdornment: <Box sx={{ fontSize: tokens.font.size.label, color: tokens.ink.secondary, ml: 0.5 }}>{unit}</Box> } : undefined,
      }}
    />
  )
}

export interface ExerciseCardProps {
  item: BuilderItem
  exercise: ExerciseSummary | undefined
  index: number
  expanded: boolean
  onToggle: () => void
  onChange: (patch: Partial<TemplateExerciseInput>) => void
  onRemove: () => void
  onSwap: () => void
  onInfo: () => void
}

export function ExerciseCard({ item, exercise, index, expanded, onToggle, onChange, onRemove, onSwap, onInfo }: ExerciseCardProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.key })
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const [noteOpen, setNoteOpen] = useState(item.note !== null && item.note !== '')
  const name = exercise?.name ?? 'Unknown exercise'
  const repsInvalid = item.rep_min > item.rep_max

  return (
    <Card
      ref={setNodeRef}
      data-testid="builder-exercise"
      sx={{
        transform: CSS.Translate.toString(transform),
        transition,
        position: 'relative',
        zIndex: isDragging ? 2 : 'auto',
        boxShadow: isDragging ? `0 8px 24px ${withAlpha(tokens.ink.text, 0.16)}` : 'none',
        borderColor: isDragging ? 'primary.main' : undefined,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', pr: 1 }}>
        <IconButton
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${name} (position ${index + 1})`}
          sx={{ touchAction: 'none', cursor: isDragging ? 'grabbing' : 'grab', color: tokens.ink.secondary, borderRadius: 0, alignSelf: 'stretch', width: 40 }}
        >
          <DragIndicatorRounded />
        </IconButton>
        <ButtonBase
          onClick={onToggle}
          aria-expanded={expanded}
          sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 3, py: 2.5, justifyContent: 'flex-start', textAlign: 'left', borderRadius: 2, font: 'inherit', color: 'inherit' }}
        >
          <ExerciseThumb exercise={exercise} size={44} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ fontSize: tokens.font.size.emphasis, fontWeight: tokens.font.weight.label, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name}
            </Box>
            <Box sx={{ fontSize: tokens.font.size.label, color: repsInvalid ? tokens.status.flag : tokens.ink.secondary, mt: 0.25, fontVariantNumeric: 'tabular-nums' }}>
              {repsInvalid ? 'Rep min is above max' : prescription(item)}
            </Box>
          </Box>
        </ButtonBase>
        <IconButton aria-label={`More for ${name}`} onClick={(e) => setMenu(e.currentTarget)}>
          <MoreVertRounded />
        </IconButton>
      </Box>

      {expanded && (
        <Box sx={{ px: 4, pb: 4, pt: 1, display: 'flex', flexDirection: 'column', gap: 3, borderTop: `1px solid ${tokens.ink.border}` }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap', pt: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <IconButton aria-label="One set fewer" disabled={item.sets <= 1} onClick={() => onChange({ sets: item.sets - 1 })} sx={{ border: `1px solid ${tokens.ink.border}` }}>
                <RemoveRounded />
              </IconButton>
              <Box sx={{ width: 52, textAlign: 'center' }}>
                <Box sx={{ fontSize: tokens.font.size.sectionTitle, fontWeight: tokens.font.weight.number, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }} aria-live="polite">
                  {item.sets}
                </Box>
                <Box sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.secondary }}>sets</Box>
              </Box>
              <IconButton aria-label="One more set" disabled={item.sets >= 10} onClick={() => onChange({ sets: item.sets + 1 })} sx={{ border: `1px solid ${tokens.ink.border}` }}>
                <AddRounded />
              </IconButton>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <NumberBox label="Min" ariaLabel="Minimum reps" value={item.rep_min} width={64} onChange={(v) => v !== null && v >= 1 && v <= 50 && onChange({ rep_min: v })} />
              <Box sx={{ color: tokens.ink.secondary }}>–</Box>
              <NumberBox label="Max" ariaLabel="Maximum reps" value={item.rep_max} width={64} onChange={(v) => v !== null && v >= 1 && v <= 50 && onChange({ rep_max: v })} />
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
            <NumberBox label="Load" unit="kg" integer={false} width={108} value={item.target_load_kg} onChange={(v) => (v === null || v <= 1000) && onChange({ target_load_kg: v })} />
            <NumberBox label="Rest" unit="s" width={88} value={item.rest_sec} onChange={(v) => v !== null && v <= 600 && onChange({ rest_sec: v })} />
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            {REST_PRESETS.map((s) => (
              <Chip
                key={s}
                label={s < 120 ? `${s} s` : `${s / 60} min`}
                size="small"
                variant={item.rest_sec === s ? 'filled' : 'outlined'}
                color={item.rest_sec === s ? 'primary' : 'default'}
                onClick={() => onChange({ rest_sec: s })}
                sx={{ minHeight: tokens.tapTarget, minWidth: 56 }}
              />
            ))}
            {!noteOpen && <Chip label="+ Note" size="small" variant="outlined" onClick={() => setNoteOpen(true)} sx={{ minHeight: tokens.tapTarget }} />}
          </Box>
          {noteOpen && (
            <TextField
              size="small"
              label="Note"
              value={item.note ?? ''}
              onChange={(e) => onChange({ note: e.target.value === '' ? null : e.target.value })}
              placeholder="e.g. seat 4, slow eccentric"
              slotProps={{ htmlInput: { maxLength: 200 } }}
            />
          )}
        </Box>
      )}

      <Menu anchorEl={menu} open={menu !== null} onClose={() => setMenu(null)}>
        <MenuItem onClick={() => (setMenu(null), onInfo())} sx={{ minHeight: 44 }}>
          <ListItemIcon>
            <InfoOutlined fontSize="small" />
          </ListItemIcon>
          About this exercise
        </MenuItem>
        <MenuItem onClick={() => (setMenu(null), onSwap())} sx={{ minHeight: 44 }}>
          <ListItemIcon>
            <SwapHorizRounded fontSize="small" />
          </ListItemIcon>
          Swap (same muscle)
        </MenuItem>
        <MenuItem onClick={() => (setMenu(null), onRemove())} sx={{ minHeight: 44, color: 'error.main' }}>
          <ListItemIcon sx={{ color: 'inherit' }}>
            <DeleteOutlineRounded fontSize="small" />
          </ListItemIcon>
          Remove
        </MenuItem>
      </Menu>
    </Card>
  )
}
