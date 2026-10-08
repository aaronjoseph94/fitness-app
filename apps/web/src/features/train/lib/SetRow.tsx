// Owns: one set row in the session logger — set number, last session's set greyed (tap to copy), kg and reps
// fields with greyed hints (what a tick logs when they are left empty), optional RPE 6–10, and the done tick.
// 2a's row from `sm` up: 48 / 110 / 1fr / 1fr / 90 / 56 px columns, 34 px inputs, a 22 px check tile; done rows tint
// green. On a phone: 28 / flex / 68 / 52 / 44 / 44 px columns, 44 px inputs at 16 px (no iOS zoom), 44 px taps; tighter
// gaps under 375 px, and no Previous column under 360 px (SET_GRID_SX), so the done tick stays inside the card.
// A problem (a tick with no load, a load or reps out of range) is said in words under the row, not only in red.
import CheckRounded from '@mui/icons-material/CheckRounded'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import IconButton from '@mui/material/IconButton'
import InputBase from '@mui/material/InputBase'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { useEffect, useId, useRef, useState, type Ref } from 'react'
import { formatNumber, parseNumber } from '../../../components'
import { COARSE_POINTER_QUERY, tokens, transitionOf } from '../../../theme'
import type { LastSet, LoggerSet } from './logger-model'

/**
 * The set table's grid, shared with the column header row so the two line up. From `sm` it is 2a's
 * `48px 110px 1fr 1fr 90px 56px` with 10 px gaps. On a phone, content width = viewport − 58 px (page gutters, card
 * border and row padding); the columns need 236 px + Previous (≥ 48) + gaps: 6 px gaps fit from 375 px, 4 px gaps
 * from 360 px, and under 360 px (a 320 px phone) the Previous column goes; the kg / reps hints still show last session.
 */
export const SET_GRID_SX = {
  display: 'grid',
  gridTemplateColumns: {
    xs: '28px minmax(48px, 1fr) 68px 52px 44px 44px',
    sm: '48px 110px minmax(0, 1fr) minmax(0, 1fr) 90px 56px',
  },
  gap: { xs: '6px', sm: '10px' },
  '@media (max-width: 374.95px)': { gap: '4px' },
  '@media (max-width: 359.95px)': {
    gridTemplateColumns: '28px 68px 52px 44px 44px',
    '& > [data-col="previous"]': { display: 'none' },
  },
} as const

/** The set table's side gutters: 2a's 18 px from `sm`, 12 px on a phone. */
export const SET_GUTTER_SX = { px: { xs: '12px', sm: '18px' } } as const

/**
 * A 34 px set-row field (44 px at 16 px text on a touch screen): white, radius 7. Its outline is the ≥3:1 control
 * grey rather than 2a's light card border: these fields have no label of their own beside them (WCAG 1.4.11).
 */
const FIELD_SX = {
  height: 34,
  boxSizing: 'border-box',
  borderRadius: `${tokens.radius.segment}px`,
  border: `1px solid ${tokens.ink.control}`,
  bgcolor: tokens.ink.card,
  fontSize: tokens.font.size.small,
  fontVariantNumeric: 'tabular-nums',
  transition: transitionOf(['border-color', 'box-shadow'], 160),
  [COARSE_POINTER_QUERY]: { height: tokens.tapTarget, fontSize: 16 },
} as const

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

export function SetRow({ position, set, previous, hint, onValues, onCopyPrevious, onToggle }: SetRowProps) {
  const loadRef = useRef<HTMLInputElement>(null)
  const [needLoad, setNeedLoad] = useState(false)
  const [loadInvalid, setLoadInvalid] = useState(false)
  const [repsInvalid, setRepsInvalid] = useState(false)
  const [rpeAnchor, setRpeAnchor] = useState<HTMLElement | null>(null)
  const n = position + 1
  const problemId = useId()

  // "Load needed" stays until a load is entered (a message that vanishes on a timer can be missed).
  useEffect(() => {
    if (set.load_kg !== null) setNeedLoad(false)
  }, [set.load_kg])

  const problem = loadInvalid
    ? 'Load must be a number from 0 to 1,000 kg'
    : needLoad
      ? `Enter the load in kg to log set ${n}`
      : repsInvalid
        ? 'Reps must be a whole number up to 100'
        : null

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
        ...SET_GRID_SX,
        ...SET_GUTTER_SX,
        alignItems: 'center',
        py: '8px',
        fontSize: tokens.font.size.small,
        bgcolor: set.done ? tokens.tone.success.soft : 'transparent',
        transition: transitionOf('background-color', 160),
        '& + &': { borderTop: `1px solid ${tokens.ink.hairline}` },
      }}
    >
      <Box sx={{ fontWeight: tokens.font.weight.heading, color: tokens.ink.text, fontVariantNumeric: 'tabular-nums' }}>{n}</Box>
      <ButtonBase
        data-col="previous"
        onClick={onCopyPrevious}
        disabled={!previous}
        aria-label={
          previous
            ? `Copy last session's set ${n}: ${liftText(previous)}`
            : `No set ${n} last session`
        }
        sx={{
          justifyContent: 'flex-start',
          height: 34,
          px: '6px',
          mx: '-6px',
          borderRadius: `${tokens.radius.inner}px`,
          fontSize: tokens.font.size.small,
          color: tokens.ink.muted,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          '&:hover': { bgcolor: tokens.ink.fill },
          [COARSE_POINTER_QUERY]: { height: tokens.tapTarget },
        }}
      >
        {previous ? liftText(previous, false) : '—'}
      </ButtonBase>
      <NumberCell
        inputRef={loadRef}
        label={`Set ${n} load in kg`}
        value={set.load_kg}
        placeholder={hint.load_kg === null ? 'kg' : kg(hint.load_kg)}
        error={needLoad}
        max={1000}
        onChange={(load_kg) => onValues({ load_kg })}
        onValidity={(ok) => setLoadInvalid(!ok)}
        describedBy={problem && (needLoad || loadInvalid) ? problemId : undefined}
        testId="set-load"
      />
      <NumberCell
        integer
        label={`Set ${n} reps`}
        value={set.reps}
        placeholder={String(hint.reps)}
        max={100}
        onChange={(reps) => onValues({ reps })}
        onValidity={(ok) => setRepsInvalid(!ok)}
        describedBy={problem && repsInvalid && !needLoad && !loadInvalid ? problemId : undefined}
        testId="set-reps"
      />
      <ButtonBase
        onClick={(e) => setRpeAnchor(e.currentTarget)}
        aria-label={set.rpe === null ? `Set ${n} RPE (optional)` : `Set ${n} RPE ${set.rpe}`}
        sx={{
          ...FIELD_SX,
          justifyContent: { xs: 'center', sm: 'flex-start' },
          px: { xs: 0, sm: '10px' },
          color: set.rpe === null ? tokens.ink.muted : tokens.ink.text,
          '&:hover': { borderColor: tokens.ink.label },
        }}
      >
        {set.rpe ?? '—'}
      </ButtonBase>
      <IconButton
        onClick={toggle}
        aria-label={set.done ? `Set ${n} done, tap to undo` : `Mark set ${n} done`}
        aria-pressed={set.done}
        data-testid="set-done"
        sx={{
          justifySelf: 'center',
          '&:hover': { bgcolor: 'transparent' },
          '&:hover > span': set.done ? {} : { borderColor: tokens.tone.success.solid },
        }}
      >
        <Box
          component="span"
          sx={{
            width: 22,
            height: 22,
            boxSizing: 'border-box',
            borderRadius: `${tokens.radius.inner}px`,
            display: 'grid',
            placeItems: 'center',
            transition: transitionOf(['border-color', 'background-color'], 160),
            ...(set.done
              ? { bgcolor: tokens.tone.success.solid, color: tokens.ink.card }
              : { bgcolor: tokens.ink.card, border: `1.5px solid ${tokens.ink.control}` }),
          }}
        >
          {set.done && <CheckRounded sx={{ fontSize: 16, stroke: 'currentColor', strokeWidth: 1.5 }} />}
        </Box>
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
            sx={{ fontVariantNumeric: 'tabular-nums' }}
          >
            RPE {rpe}
          </MenuItem>
        ))}
        <MenuItem
          onClick={() => {
            onValues({ rpe: null })
            setRpeAnchor(null)
          }}
          sx={{ color: tokens.ink.secondary }}
        >
          No RPE
        </MenuItem>
      </Menu>
      {problem && (
        <Box
          id={problemId}
          role="alert"
          data-testid="set-problem"
          sx={{ gridColumn: '1 / -1', fontSize: tokens.font.size.caption, color: tokens.status.flag, lineHeight: 1.4 }}
        >
          {problem}
        </Box>
      )}
    </Box>
  )
}

/**
 * A set as 2a writes it, load first: "45 kg × 12" (the finish summary, a screen reader), or "45 × 12" under the
 * Previous column's heading.
 */
export function liftText(set: Pick<LastSet, 'reps' | 'load_kg'>, withUnit = true): string {
  const load = set.load_kg === null ? '–' : `${formatNumber(set.load_kg, set.load_kg % 1 ? 1 : 0)}${withUnit ? ' kg' : ''}`
  return `${load} × ${set.reps ?? '–'}`
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
  /** Told whether the typed text is a valid value (false while it is out of range); true again on blur. */
  onValidity?: (ok: boolean) => void
  /** Id of the message that explains the field's problem. */
  describedBy?: string
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
  onValidity,
  describedBy,
  testId,
}: NumberCellProps) {
  const [text, setText] = useState(kg(value))
  const [invalid, setInvalidState] = useState(false)
  const setInvalid = (next: boolean) => {
    setInvalidState(next)
    onValidity?.(!next)
  }
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
        'aria-describedby': describedBy,
        autoComplete: 'off',
        enterKeyHint: 'done',
        'data-testid': testId,
      }}
      sx={{
        ...FIELD_SX,
        // Red when its value is the problem; 2a's blue border and 3 px ring when focused.
        ...(invalid || error ? { borderColor: tokens.status.flag } : {}),
        px: '10px',
        '& input': { p: 0, height: '100%' },
        '&.Mui-focused': {
          borderColor: invalid || error ? tokens.status.flag : tokens.accent.main,
          boxShadow: `0 0 0 ${tokens.focusRing.inputRing}px ${invalid || error ? tokens.tone.danger.bg : tokens.accent.ring}`,
        },
      }}
    />
  )
}
