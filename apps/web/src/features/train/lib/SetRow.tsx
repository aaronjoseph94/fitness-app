// Owns: one set row in the session logger (1d Summit) — set number, last session's set greyed (tap to copy), kg and
// reps fields with greyed hints (what a tick logs when they are left empty), optional RPE 6–10, and the done tick. Each
// row is a radius-14 well: a done row teal with a solid teal check, the active row (the next set to log) white with a
// 2 px violet inset ring, the rest white on a hairline. The grid is README §4's `36px 1.3fr 1fr 1fr .8fr 44px` from `sm`
// (fluid, never wrapped); on a phone 24 / flex / 62 / 54 / 44 / 44 px with 44 px inputs at 16 px (no iOS zoom) and
// 44 px taps, and no Previous column under 375 px (SET_GRID_SX), so the done tick stays inside the card.
// A problem (a tick with no load, a load or reps out of range) is said in words under the row, not only in red. Text
// that isn't a valid value stays as typed (never swapped back silently) and keeps the tick disabled, and the logger's
// Finish waits for it (logger-store `invalid`), so a tick never logs a value or a hint that isn't on screen.
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
import { loggerState } from './logger-store'

/**
 * The set table's grid, shared with the column header strip so the two line up. From `sm` it is README §4's
 * `36px 1.3fr 1fr 1fr .8fr 44px` with 10 px gaps. On a phone, a row's content is the viewport − 76 px (page gutters,
 * card gutters and the row's padding); the columns need 228 px + Previous (≥ 44) + 5 px gaps, which fit from 375 px;
 * under 375 px the Previous column goes, and the kg / reps hints still show last session.
 */
export const SET_GRID_SX = {
  display: 'grid',
  gridTemplateColumns: {
    xs: '24px minmax(44px, 1fr) 62px 54px 44px 44px',
    sm: '36px minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 0.8fr) 44px',
  },
  columnGap: { xs: '5px', sm: '10px' },
  '@media (max-width: 374.95px)': {
    gridTemplateColumns: '24px minmax(64px, 1.2fr) minmax(50px, 1fr) 44px 44px',
    '& > [data-col="previous"]': { display: 'none' },
  },
} as const

/** The exercise card's side gutters (README: 24 px; 14 on a phone): the set wells and the header strip sit inside them. */
export const SET_GUTTER_SX = { px: { xs: '14px', sm: '24px' } } as const

/** A set row's own padding inside its well (and the header strip's), so the columns line up. */
export const SET_ROW_PAD_SX = { px: { xs: '8px', sm: '12px' } } as const

/**
 * A 34 px set-row field (44 px at 16 px text on a touch screen): radius 10, the value 15/600. On an open row its outline
 * is the ≥3:1 control grey rather than a light hairline: these fields have no label of their own beside them (WCAG
 * 1.4.11); on a done row it is drawn only on hover and focus, so the logged values read as the teal well's text.
 */
const FIELD_SX = {
  // 44 px on a phone whatever the pointer (a 34 px field there was too small a target); 34 from `sm` with a mouse.
  height: { xs: tokens.tapTarget, sm: 34 },
  minWidth: 0,
  boxSizing: 'border-box',
  borderRadius: `${tokens.radius.inner}px`,
  border: `1px solid ${tokens.ink.control}`,
  bgcolor: tokens.ink.card,
  fontSize: tokens.font.size.emphasis,
  fontWeight: tokens.font.weight.heading,
  fontVariantNumeric: 'tabular-nums',
  transition: transitionOf(['border-color', 'box-shadow', 'background-color'], 160),
  [COARSE_POINTER_QUERY]: { height: tokens.tapTarget, fontSize: 16 },
} as const

/** A field on a done row: no box until hovered or focused. */
const DONE_FIELD_SX = {
  borderColor: 'transparent',
  bgcolor: 'transparent',
  '&:hover': { borderColor: tokens.ink.control },
} as const

const RPE_STEPS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const

export interface SetRowProps {
  position: number
  set: LoggerSet
  /** The next set to log (the first open set of the exercise in hand): the violet ring. */
  active?: boolean
  previous: LastSet | null
  hint: { reps: number; load_kg: number | null }
  onValues: (values: Partial<Pick<LoggerSet, 'reps' | 'load_kg' | 'rpe'>>) => void
  onCopyPrevious: () => void
  onToggle: () => 'ok' | 'need-load'
}

const kg = (n: number | null) => (n === null ? '' : String(Math.round(n * 100) / 100))

export function SetRow({
  position,
  set,
  active = false,
  previous,
  hint,
  onValues,
  onCopyPrevious,
  onToggle,
}: SetRowProps) {
  const loadRef = useRef<HTMLInputElement>(null)
  const repsRef = useRef<HTMLInputElement>(null)
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

  // Out-of-range text blocks the tick here and Finish in the logger; the flags go with the row (a folded card).
  useEffect(() => {
    const store = loggerState()
    store.setInvalid(`${set.id}:load`, loadInvalid)
    store.setInvalid(`${set.id}:reps`, repsInvalid)
  }, [set.id, loadInvalid, repsInvalid])
  useEffect(
    () => () => {
      const store = loggerState()
      store.setInvalid(`${set.id}:load`, false)
      store.setInvalid(`${set.id}:reps`, false)
    },
    [set.id],
  )
  const blocked = loadInvalid || repsInvalid

  const toggle = () => {
    if (blocked) {
      ;(loadInvalid ? loadRef : repsRef).current?.focus()
      return
    }
    if (onToggle() === 'need-load') {
      setNeedLoad(true)
      loadRef.current?.focus()
    }
  }

  return (
    <Box
      data-testid="set-row"
      data-done={set.done || undefined}
      data-active={active || undefined}
      sx={{
        ...SET_GRID_SX,
        ...SET_ROW_PAD_SX,
        alignItems: 'center',
        rowGap: '4px',
        py: '7px',
        borderRadius: `${tokens.summit.radius.wellSmall}px`,
        fontSize: tokens.font.size.emphasis,
        bgcolor: set.done ? tokens.tone.success.bg : tokens.ink.card,
        boxShadow: set.done
          ? 'none'
          : active
            ? `inset 0 0 0 2px ${tokens.accent.main}`
            : `inset 0 0 0 1px ${tokens.ink.hairline}`,
        transition: transitionOf(['background-color', 'box-shadow'], 160),
      }}
    >
      <Box
        sx={{
          fontFamily: tokens.font.display,
          fontSize: 14,
          fontWeight: tokens.font.weight.number,
          color: tokens.ink.text,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {n}
      </Box>
      <ButtonBase
        data-col="previous"
        onClick={onCopyPrevious}
        disabled={!previous}
        aria-label={
          previous ? `Copy last session's set ${n}: ${liftText(previous)}` : `No set ${n} last session`
        }
        sx={{
          justifyContent: 'flex-start',
          height: 34,
          px: '6px',
          mx: '-6px',
          borderRadius: `${tokens.radius.inner}px`,
          fontSize: tokens.font.size.emphasis,
          // Muted on the teal well is under 4.5:1; the body ink reads there.
          color: set.done ? tokens.ink.label : tokens.ink.muted,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          '&:hover': { bgcolor: set.done ? tokens.tone.success.border : tokens.ink.fill },
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
        done={set.done}
        testId="set-load"
      />
      <NumberCell
        integer
        inputRef={repsRef}
        label={`Set ${n} reps`}
        value={set.reps}
        placeholder={String(hint.reps)}
        max={100}
        onChange={(reps) => onValues({ reps })}
        onValidity={(ok) => setRepsInvalid(!ok)}
        describedBy={problem && repsInvalid && !needLoad && !loadInvalid ? problemId : undefined}
        done={set.done}
        testId="set-reps"
      />
      <ButtonBase
        onClick={(e) => setRpeAnchor(e.currentTarget)}
        aria-label={set.rpe === null ? `Set ${n} RPE (optional)` : `Set ${n} RPE ${set.rpe}`}
        sx={{
          ...FIELD_SX,
          ...(set.done && DONE_FIELD_SX),
          justifyContent: { xs: 'center', sm: 'flex-start' },
          px: { xs: 0, sm: '10px' },
          color: set.rpe === null ? (set.done ? tokens.ink.label : tokens.ink.muted) : tokens.ink.text,
          '&:hover': { borderColor: tokens.ink.label },
        }}
      >
        {set.rpe ?? '—'}
      </ButtonBase>
      <IconButton
        onClick={toggle}
        aria-label={set.done ? `Set ${n} done, tap to undo` : `Mark set ${n} done`}
        aria-pressed={set.done}
        aria-disabled={blocked || undefined}
        aria-describedby={blocked ? problemId : undefined}
        data-testid="set-done"
        sx={{
          justifySelf: 'center',
          ...(blocked && { opacity: 0.4, cursor: 'not-allowed' }),
          '&:hover': { bgcolor: 'transparent' },
          '&:hover > span': set.done ? {} : { borderColor: tokens.tone.success.solid },
        }}
      >
        <Box
          component="span"
          sx={{
            width: 26,
            height: 26,
            boxSizing: 'border-box',
            borderRadius: '9px',
            display: 'grid',
            placeItems: 'center',
            transition: transitionOf(['border-color', 'background-color'], 160),
            ...(set.done
              ? { bgcolor: tokens.tone.success.solid, color: tokens.ink.card }
              : { bgcolor: tokens.ink.card, border: `2px solid ${tokens.ink.control}` }),
          }}
        >
          {set.done && <CheckRounded sx={{ fontSize: 18, stroke: 'currentColor', strokeWidth: 1.5 }} />}
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
          sx={{
            gridColumn: '1 / -1',
            fontSize: tokens.font.size.caption,
            color: tokens.status.flag,
            lineHeight: 1.4,
          }}
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
  const load =
    set.load_kg === null
      ? '–'
      : `${formatNumber(set.load_kg, set.load_kg % 1 ? 1 : 0)}${withUnit ? ' kg' : ''}`
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
  /** Told whether the typed text is a valid value (false while it is out of range; it stays so after blur). */
  onValidity?: (ok: boolean) => void
  /** Id of the message that explains the field's problem. */
  describedBy?: string
  /** On a done row: no box until hovered or focused. */
  done?: boolean
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
  done = false,
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
    if (focused.current) return
    setText(kg(value))
    if (invalid) setInvalid(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new value from elsewhere replaces the text
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
        // Invalid text stays on screen with its message until it is fixed (never swapped back to an old value).
        if (!invalid) setText(kg(value))
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
        ...(done && DONE_FIELD_SX),
        // Red when its value is the problem; the violet border and 3 px ring when focused.
        ...(invalid || error ? { borderColor: tokens.status.flag } : {}),
        px: { xs: '6px', sm: '10px' },
        '& input': { p: 0, height: '100%' },
        '&.Mui-focused': {
          borderColor: invalid || error ? tokens.status.flag : tokens.accent.main,
          boxShadow: `0 0 0 ${tokens.focusRing.inputRing}px ${invalid || error ? tokens.tone.danger.bg : tokens.accent.ring}`,
        },
      }}
    />
  )
}
