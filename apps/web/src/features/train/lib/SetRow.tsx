// Owns: one set row in the session logger — set number, last session's set greyed (tap to copy), kg and reps
// fields with greyed hints (what a tick logs when they are left empty), optional RPE 6–10, and the done tick.
// Sized for a 390 px phone: 28 / flex / 68 / 52 / 40 / 44 px columns, 16 px inputs (no iOS zoom), 44 px taps.
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded'
import RadioButtonUncheckedRounded from '@mui/icons-material/RadioButtonUncheckedRounded'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import IconButton from '@mui/material/IconButton'
import InputBase from '@mui/material/InputBase'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { useEffect, useRef, useState, type Ref } from 'react'
import { formatNumber, parseNumber } from '../../../components'
import { tokens, withAlpha } from '../../../theme'
import type { LastSet, LoggerSet } from './logger-model'

/** Shared with the column header row so the two line up. */
export const SET_GRID = '28px minmax(48px, 1fr) 68px 52px 44px 44px'

const RPE_STEPS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const

export interface SetRowProps {
  position: number
  set: LoggerSet
  previous: LastSet | null
  hint: { reps: number; load_kg: number | null }
  onValues: (values: Partial<Pick<LoggerSet, 'reps' | 'load_kg' | 'rpe'>>) => void
  onCopyPrevious: () => void
  onToggle: () => 'ok' | 'need-load'
}

const kg = (n: number | null) => (n === null ? '' : String(Math.round(n * 100) / 100))

export function formatSet(reps: number | null, load: number | null): string {
  if (reps === null && load === null) return '—'
  return `${reps ?? '–'} × ${load === null ? '–' : formatNumber(load, load % 1 ? 1 : 0)}`
}

export function SetRow({ position, set, previous, hint, onValues, onCopyPrevious, onToggle }: SetRowProps) {
  const loadRef = useRef<HTMLInputElement>(null)
  const [needLoad, setNeedLoad] = useState(false)
  const [rpeAnchor, setRpeAnchor] = useState<HTMLElement | null>(null)
  const n = position + 1

  useEffect(() => {
    if (!needLoad) return
    const t = setTimeout(() => setNeedLoad(false), 2500)
    return () => clearTimeout(t)
  }, [needLoad])

  const toggle = () => {
    if (onToggle() === 'need-load') {
      setNeedLoad(true)
      loadRef.current?.focus()
    }
  }

  return (
    <Box
      data-testid="set-row"
      data-done={set.done || undefined}
      sx={{
        display: 'grid',
        gridTemplateColumns: SET_GRID,
        gap: 1.5,
        alignItems: 'center',
        mx: -1.5,
        px: 1.5,
        py: 0.5,
        borderRadius: `${tokens.radius.control}px`,
        bgcolor: set.done ? withAlpha(tokens.status.good, 0.08) : 'transparent',
        transition: 'background-color 160ms',
      }}
    >
      <Box
        sx={{
          width: 26,
          height: 26,
          borderRadius: tokens.radius.chip,
          display: 'grid',
          placeItems: 'center',
          fontSize: tokens.font.size.label,
          fontWeight: tokens.font.weight.heading,
          color: set.done ? tokens.ink.card : tokens.ink.secondary,
          bgcolor: set.done ? tokens.status.good : tokens.chart.grid,
        }}
      >
        {n}
      </Box>
      <ButtonBase
        onClick={onCopyPrevious}
        disabled={!previous}
        aria-label={
          previous
            ? `Copy last session's set ${n}: ${formatSet(previous.reps, previous.load_kg)} kg`
            : `No set ${n} last session`
        }
        sx={{
          justifyContent: 'flex-start',
          height: 44,
          px: 1,
          borderRadius: `${tokens.radius.control}px`,
          fontSize: tokens.font.size.small,
          color: tokens.ink.secondary,
          opacity: previous ? 0.85 : 0.5,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
      >
        {previous ? formatSet(previous.reps, previous.load_kg) : '—'}
      </ButtonBase>
      <NumberCell
        inputRef={loadRef}
        label={`Set ${n} load in kg`}
        value={set.load_kg}
        placeholder={hint.load_kg === null ? 'kg' : kg(hint.load_kg)}
        error={needLoad}
        max={1000}
        onChange={(load_kg) => onValues({ load_kg })}
        testId="set-load"
      />
      <NumberCell
        integer
        label={`Set ${n} reps`}
        value={set.reps}
        placeholder={String(hint.reps)}
        max={100}
        onChange={(reps) => onValues({ reps })}
        testId="set-reps"
      />
      <ButtonBase
        onClick={(e) => setRpeAnchor(e.currentTarget)}
        aria-label={set.rpe === null ? `Set ${n} RPE (optional)` : `Set ${n} RPE ${set.rpe}`}
        sx={{
          height: 44,
          borderRadius: `${tokens.radius.control}px`,
          fontSize: set.rpe === null ? 11 : 15,
          fontWeight: set.rpe === null ? tokens.font.weight.label : tokens.font.weight.heading,
          color: set.rpe === null ? tokens.ink.secondary : tokens.ink.text,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {set.rpe ?? 'RPE'}
      </ButtonBase>
      <IconButton
        onClick={toggle}
        aria-label={set.done ? `Set ${n} done, tap to undo` : `Mark set ${n} done`}
        aria-pressed={set.done}
        data-testid="set-done"
        sx={{ color: set.done ? tokens.status.good : tokens.ink.secondary }}
      >
        {set.done ? (
          <CheckCircleRounded sx={{ fontSize: 30 }} />
        ) : (
          <RadioButtonUncheckedRounded sx={{ fontSize: 30 }} />
        )}
      </IconButton>
      <Menu
        anchorEl={rpeAnchor}
        open={rpeAnchor !== null}
        onClose={() => setRpeAnchor(null)}
        slotProps={{ list: { dense: true, 'aria-label': 'RPE' } }}
      >
        {RPE_STEPS.map((rpe) => (
          <MenuItem
            key={rpe}
            selected={set.rpe === rpe}
            onClick={() => {
              onValues({ rpe })
              setRpeAnchor(null)
            }}
            sx={{ minHeight: tokens.tapTarget, fontVariantNumeric: 'tabular-nums' }}
          >
            RPE {rpe}
          </MenuItem>
        ))}
        <MenuItem
          onClick={() => {
            onValues({ rpe: null })
            setRpeAnchor(null)
          }}
          sx={{ minHeight: tokens.tapTarget, color: tokens.ink.secondary }}
        >
          No RPE
        </MenuItem>
      </Menu>
    </Box>
  )
}

interface NumberCellProps {
  value: number | null
  placeholder: string
  label: string
  onChange: (value: number | null) => void
  integer?: boolean
  max: number
  error?: boolean
  inputRef?: Ref<HTMLInputElement>
  testId: string
}

/** A compact number field: text while typing ("42."), a number in the store once it parses; empty clears it. */
function NumberCell({
  value,
  placeholder,
  label,
  onChange,
  integer = false,
  max,
  error = false,
  inputRef,
  testId,
}: NumberCellProps) {
  const [text, setText] = useState(kg(value))
  const [invalid, setInvalid] = useState(false)
  const focused = useRef(false)

  // Values set elsewhere (copy previous, a tick filling the hint) show unless the field is being typed in.
  useEffect(() => {
    if (!focused.current) setText(kg(value))
  }, [value])

  return (
    <InputBase
      inputRef={inputRef}
      value={text}
      placeholder={placeholder}
      onFocus={(e) => {
        focused.current = true
        e.target.select()
      }}
      onBlur={() => {
        focused.current = false
        setInvalid(false)
        setText(kg(value))
      }}
      onChange={(e) => {
        const next = e.target.value.replace(',', '.')
        setText(next)
        if (next.trim() === '') {
          setInvalid(false)
          onChange(null)
          return
        }
        const n = parseNumber(next)
        const ok = n !== null && n >= 0 && n <= max && (!integer || Number.isInteger(n))
        setInvalid(!ok)
        if (ok) onChange(integer ? n : Math.round(n * 100) / 100)
      }}
      inputProps={{
        inputMode: integer ? 'numeric' : 'decimal',
        pattern: integer ? '[0-9]*' : '[0-9]*[.,]?[0-9]*',
        'aria-label': label,
        'aria-invalid': invalid || error || undefined,
        autoComplete: 'off',
        enterKeyHint: 'done',
        'data-testid': testId,
      }}
      sx={{
        height: tokens.tapTarget,
        borderRadius: '10px',
        border: `1px solid ${invalid || error ? tokens.status.flag : tokens.ink.border}`,
        bgcolor: tokens.ink.card,
        fontSize: tokens.font.size.body,
        fontWeight: tokens.font.weight.label,
        fontVariantNumeric: 'tabular-nums',
        '& input': { textAlign: 'center', p: 0, height: '100%' },
        '& input::placeholder': { color: tokens.ink.secondary, opacity: 0.75 },
        '&.Mui-focused': { borderColor: tokens.metric.weight },
      }}
    />
  )
}
