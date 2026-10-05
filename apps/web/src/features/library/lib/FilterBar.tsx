// Owns: the library's search and filter controls — a search box (clearable, no autocorrect) and one chip per filter
// (muscle, equipment, category, level) that opens a menu of values; a set chip shows its value and clears with ×.
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
import type { ExerciseFilter } from './filter'
import { categoryLabel, equipmentLabel, LEVELS, sentence } from './labels'

type Key = keyof ExerciseFilter

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
    <Box>
      <TextField
        value={q}
        onChange={(e) => onQ(e.target.value)}
        placeholder="Search exercises"
        autoFocus={autoFocus}
        type="search"
        slotProps={{
          htmlInput: { 'aria-label': 'Search exercises', autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false, enterKeyHint: 'search' },
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchRounded />
              </InputAdornment>
            ),
            endAdornment: q ? (
              <InputAdornment position="end">
                <IconButton aria-label="Clear search" edge="end" onClick={() => onQ('')}>
                  <CloseRounded />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          },
        }}
      />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 3 }}>
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
              sx={{ borderRadius: 999 }}
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
            sx={{ minHeight: 44 }}
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
              sx={{ minHeight: 44 }}
            >
              {o.label}
            </MenuItem>
          )),
        ]}
      </Menu>
    </Box>
  )
}
