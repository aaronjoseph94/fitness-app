// Owns: the library's search and filter controls — 2a's toolbar: a 36 px search box (the header search's height;
// clearable, no autocorrect) and, on the same line when there is room, one 36 px filter chip per filter (muscle,
// equipment, category, level) that opens a menu of values; a set chip shows its value in the info tint and clears with
// ×. On a touch screen both grow to 44 px.
import CloseRounded from '@mui/icons-material/CloseRounded'
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded'
import SearchRounded from '@mui/icons-material/SearchRounded'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import { ExerciseCategory, Muscle } from '@fitness/shared/schemas'
import { useState, type ReactNode } from 'react'
import { MUSCLE_LABELS } from '../../../muscle-map'
import { COARSE_POINTER_QUERY, tokens } from '../../../theme'
import type { ExerciseFilter } from './filter'
import { categoryLabel, equipmentLabel, LEVELS, sentence } from './labels'

type Key = keyof ExerciseFilter

/** The toolbar's one control height: 2a's 36 px (the header search, a default outline button); 44 on touch. */
const TOOLBAR_HEIGHT = 36

/** A filter chip sized like an outline button (36 px, radius 8, 13 px) so it lines up with the search box. */
export const FILTER_CHIP = {
  minHeight: TOOLBAR_HEIGHT,
  px: '10px',
  borderRadius: `${tokens.radius.control}px`,
  fontSize: tokens.font.size.small,
  [COARSE_POINTER_QUERY]: { minHeight: tokens.tapTarget },
} as const

interface Option {
  value: string
  label: string
}

export interface FilterBarProps {
  q: string
  onQ: (q: string) => void
  filter: ExerciseFilter
  onFilter: (next: ExerciseFilter) => void
  /** Equipment values to offer (the library's, most common first). */
  equipment: readonly string[]
  /** Filters not offered (e.g. muscle while swapping within the same muscle). */
  hide?: readonly Key[]
  /** Extra chips after the filters (e.g. "Show hidden"). */
  extra?: ReactNode
  autoFocus?: boolean
}

export function FilterBar({ q, onQ, filter, onFilter, equipment, hide = [], extra, autoFocus = false }: FilterBarProps) {
  const [menu, setMenu] = useState<{ key: Key; anchor: HTMLElement } | null>(null)

  const options: Record<Key, { label: string; options: Option[]; display: (v: string) => string }> = {
    muscle: {
      label: 'Muscle',
      options: Muscle.options.map((m) => ({ value: m, label: MUSCLE_LABELS[m] })),
      display: (v) => MUSCLE_LABELS[v as Muscle] ?? v,
    },
    equipment: {
      label: 'Equipment',
      options: equipment.map((e) => ({ value: e, label: equipmentLabel(e) })),
      display: (v) => equipmentLabel(v),
    },
    category: {
      label: 'Category',
      options: ExerciseCategory.options.map((c) => ({ value: c, label: categoryLabel(c) })),
      display: (v) => sentence(v),
    },
    level: { label: 'Level', options: LEVELS.map((l) => ({ value: l, label: sentence(l) })), display: (v) => sentence(v) },
  }

  const set = (key: Key, value: string | undefined) => {
    const next = { ...filter } as Record<Key, string | undefined>
    if (value === undefined) delete next[key]
    else next[key] = value
    onFilter(next as ExerciseFilter)
  }

  const keys = (['muscle', 'equipment', 'category', 'level'] as const).filter((k) => !hide.includes(k))
  const open = menu ? options[menu.key] : null

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
      <TextField
        value={q}
        onChange={(e) => onQ(e.target.value)}
        placeholder="Search exercises"
        autoFocus={autoFocus}
        type="search"
        size="small"
        sx={{
          flex: '1 1 240px',
          minWidth: 0,
          '& .MuiInputBase-root': { height: TOOLBAR_HEIGHT },
          // The input fills the box's height, so the whole 36 / 44 px is the tap target.
          '& .MuiInputBase-input': { height: 'auto', alignSelf: 'stretch', py: 0 },
          [COARSE_POINTER_QUERY]: { '& .MuiInputBase-root': { height: tokens.tapTarget } },
        }}
        slotProps={{
          htmlInput: { 'aria-label': 'Search exercises', autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false, enterKeyHint: 'search' },
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchRounded sx={{ fontSize: 18, color: tokens.ink.muted }} />
              </InputAdornment>
            ),
            endAdornment: q ? (
              <InputAdornment position="end">
                <IconButton aria-label="Clear search" edge="end" size="small" onClick={() => onQ('')}>
                  <CloseRounded sx={{ fontSize: 18 }} />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          },
        }}
      />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {keys.map((key) => {
          const value = filter[key]
          const spec = options[key]
          return (
            <Chip
              key={key}
              data-testid={`filter-${key}`}
              label={value ? spec.display(value) : spec.label}
              color={value ? 'primary' : 'default'}
              variant={value ? 'filled' : 'outlined'}
              onClick={(e) => setMenu({ key, anchor: e.currentTarget })}
              onDelete={value ? () => set(key, undefined) : (e) => setMenu({ key, anchor: (e.currentTarget as HTMLElement).parentElement! })}
              deleteIcon={value ? <CloseRounded /> : <ExpandMoreRounded />}
              sx={FILTER_CHIP}
            />
          )
        })}
        {extra}
      </Box>
      <Menu
        anchorEl={menu?.anchor}
        open={menu !== null}
        onClose={() => setMenu(null)}
        slotProps={{ paper: { sx: { maxHeight: 360 } } }}
      >
        {open && menu && [
          <MenuItem
            key="__any"
            selected={filter[menu.key] === undefined}
            onClick={() => {
              set(menu.key, undefined)
              setMenu(null)
            }}
          >
            Any {open.label.toLowerCase()}
          </MenuItem>,
          ...open.options.map((o) => (
            <MenuItem
              key={o.value}
              selected={filter[menu.key] === o.value}
              onClick={() => {
                set(menu.key, o.value)
                setMenu(null)
              }}
            >
              {o.label}
            </MenuItem>
          )),
        ]}
      </Menu>
    </Box>
  )
}
