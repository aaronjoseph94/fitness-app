// Owns: one exercise in the builder — drag handle (touch-friendly, the only drag target so the page still scrolls),
// thumbnail, name and a one-line prescription; expanded, the editors: sets stepper, rep range min–max, target load kg,
// rest seconds (one-tap presets), note; and the row menu (about, swap, remove). An exercise outside the allowed set
// (hidden, or its equipment marked since the template was saved) says so in place of its prescription.
// 2a: the session logger's exercise card — a 44 px thumb tile, "1 · Name" 15/600 with the 13 px muted prescription, an
// expand glyph and an outlined ⋯ button; open, it takes the blue border + ring and its editors sit on a #FAFAFA strip.
import AddRounded from '@mui/icons-material/AddRounded'
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded'
import DragIndicatorRounded from '@mui/icons-material/DragIndicatorRounded'
import InfoOutlined from '@mui/icons-material/InfoOutlined'
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded'
import MoreHorizRounded from '@mui/icons-material/MoreHorizRounded'
import RemoveRounded from '@mui/icons-material/RemoveRounded'
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
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
import { cardSurface, formatNumber, highlightSurface, outlinedIconButton } from '../../../components'
import { COARSE_POINTER_QUERY, tokens, transitionOf } from '../../../theme'
import { ExerciseThumb } from '../../library'

export type BuilderItem = TemplateExerciseInput & { key: string }

const REST_PRESETS = [60, 90, 120, 180] as const

/** A rest preset is at least a 44 px square on touch ("90 s" alone is narrower). */
const PRESET_CHIP = { [COARSE_POINTER_QUERY]: { minWidth: tokens.tapTarget } } as const

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
      sx={{ width, flex: 'none', '& input': { textAlign: 'center', fontVariantNumeric: 'tabular-nums' } }}
      slotProps={{
        htmlInput: { inputMode: integer ? 'numeric' : 'decimal', pattern: integer ? '[0-9]*' : '[0-9]*[.,]?[0-9]*', 'aria-label': ariaLabel ?? label, enterKeyHint: 'done' },
        input: unit ? { endAdornment: <Box sx={{ fontSize: tokens.font.size.small, color: tokens.ink.secondary, ml: 0.5 }}>{unit}</Box> } : undefined,
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
  const hidden = exercise !== undefined && !exercise.allowed

  return (
    <Box
      ref={setNodeRef}
      data-testid="builder-exercise"
      sx={{
        ...(expanded ? highlightSurface : cardSurface),
        transform: CSS.Translate.toString(transform),
        transition,
        position: 'relative',
        zIndex: isDragging ? 2 : 'auto',
        ...(isDragging && { boxShadow: tokens.elevation.overlay, borderColor: tokens.accent.main }),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: '10px', pl: 1, pr: '12px' }}>
        <IconButton
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          size="small"
          aria-label={`Reorder ${name} (position ${index + 1})`}
          // The glyph alone identifies the control, so it takes the 3:1 control grey, not the faint glyph grey.
          sx={{ touchAction: 'none', cursor: isDragging ? 'grabbing' : 'grab', color: tokens.ink.control, flex: 'none' }}
        >
          <DragIndicatorRounded sx={{ fontSize: 18 }} />
        </IconButton>
        <ButtonBase
          onClick={onToggle}
          aria-expanded={expanded}
          sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '12px', p: '2px', justifyContent: 'flex-start', textAlign: 'left', borderRadius: `${tokens.radius.control}px`, font: 'inherit', color: 'inherit' }}
        >
          <ExerciseThumb exercise={exercise} size={44} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box
              sx={{
                fontSize: tokens.font.size.itemTitle,
                fontWeight: tokens.font.weight.heading,
                lineHeight: tokens.font.leading.itemTitle,
                color: tokens.ink.text,
                // Two lines before it clips: a phone row is narrow beside the handle, the thumb and the buttons.
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {index + 1} · {name}
            </Box>
            <Box sx={{ fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: repsInvalid || hidden ? tokens.status.flag : tokens.ink.secondary, mt: '2px', fontVariantNumeric: 'tabular-nums' }}>
              {hidden ? 'Hidden now: swap or remove it' : repsInvalid ? 'Rep min is above max' : prescription(item)}
            </Box>
          </Box>
          <ExpandMoreRounded
            aria-hidden
            sx={{ fontSize: 18, color: tokens.ink.faint, flex: 'none', transform: expanded ? 'rotate(180deg)' : 'none', transition: transitionOf('transform', tokens.motion.duration.fast) }}
          />
        </ButtonBase>
        <IconButton size="small" aria-label={`More for ${name}`} onClick={(e) => setMenu(e.currentTarget)} sx={{ ...outlinedIconButton, flex: 'none' }}>
          <MoreHorizRounded sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>

      {expanded && (
        // The editors on a #FAFAFA strip under the header, like the logger's column-header strip.
        <Box
          sx={{
            px: `${tokens.pad.card.x}px`,
            py: `${tokens.pad.dense.y}px`,
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            bgcolor: tokens.ink.panel,
            borderTop: `1px solid ${tokens.ink.border}`,
            borderRadius: `0 0 ${tokens.radius.card - 1}px ${tokens.radius.card - 1}px`,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', columnGap: 4, rowGap: 3, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <IconButton size="small" aria-label="One set fewer" disabled={item.sets <= 1} onClick={() => onChange({ sets: item.sets - 1 })} sx={outlinedIconButton}>
                <RemoveRounded sx={{ fontSize: 18 }} />
              </IconButton>
              <Box sx={{ width: 44, textAlign: 'center' }}>
                <Box sx={{ fontSize: tokens.font.size.sectionTitle, fontWeight: tokens.font.weight.number, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }} aria-live="polite">
                  {item.sets}
                </Box>
                <Box sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.secondary }}>sets</Box>
              </Box>
              <IconButton size="small" aria-label="One more set" disabled={item.sets >= 10} onClick={() => onChange({ sets: item.sets + 1 })} sx={outlinedIconButton}>
                <AddRounded sx={{ fontSize: 18 }} />
              </IconButton>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <NumberBox label="Min" ariaLabel="Minimum reps" value={item.rep_min} width={64} onChange={(v) => v !== null && v >= 1 && v <= 50 && onChange({ rep_min: v })} />
              <Box sx={{ color: tokens.ink.secondary }}>–</Box>
              <NumberBox label="Max" ariaLabel="Maximum reps" value={item.rep_max} width={64} onChange={(v) => v !== null && v >= 1 && v <= 50 && onChange({ rep_max: v })} />
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <NumberBox label="Load" unit="kg" integer={false} width={108} value={item.target_load_kg} onChange={(v) => (v === null || v <= 1000) && onChange({ target_load_kg: v })} />
              <NumberBox label="Rest" unit="s" width={88} value={item.rest_sec} onChange={(v) => v !== null && v <= 600 && onChange({ rest_sec: v })} />
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            {REST_PRESETS.map((s) => (
              <Chip
                key={s}
                label={s < 120 ? `${s} s` : `${s / 60} min`}
                variant={item.rest_sec === s ? 'filled' : 'outlined'}
                color={item.rest_sec === s ? 'primary' : 'default'}
                onClick={() => onChange({ rest_sec: s })}
                sx={PRESET_CHIP}
              />
            ))}
            {!noteOpen && <Chip label="+ Note" variant="outlined" onClick={() => setNoteOpen(true)} />}
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
        <MenuItem onClick={() => (setMenu(null), onInfo())}>
          <ListItemIcon>
            <InfoOutlined fontSize="small" />
          </ListItemIcon>
          About this exercise
        </MenuItem>
        <MenuItem onClick={() => (setMenu(null), onSwap())}>
          <ListItemIcon>
            <SwapHorizRounded fontSize="small" />
          </ListItemIcon>
          Swap (same muscle)
        </MenuItem>
        <MenuItem onClick={() => (setMenu(null), onRemove())} sx={{ color: 'error.main' }}>
          <ListItemIcon sx={{ color: 'inherit' }}>
            <DeleteOutlineRounded fontSize="small" />
          </ListItemIcon>
          Remove
        </MenuItem>
      </Menu>
    </Box>
  )
}
