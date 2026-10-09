// Owns: the small form and read-state pieces every screen shares — a number field preset (decimal keypad, unit, 44 px),
// the typed-number parser behind it, and the inline "couldn't load" row for a failed read.
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import InputAdornment from '@mui/material/InputAdornment'
import TextField, { type TextFieldProps } from '@mui/material/TextField'
import type { ReactNode } from 'react'
import { isApiError, problemText } from '../../api'

/** A read that failed: what was missing, why, and a retry. Offline with nothing cached reads calmly. */
export function LoadProblem({ what, error, onRetry }: { what: string; error: unknown; onRetry?: () => void }) {
  const offline = isApiError(error) && error.kind === 'network' && !navigator.onLine
  return (
    <Alert
      severity={offline ? 'info' : 'warning'}
      variant="outlined"
      action={
        onRetry ? (
          <Button color="inherit" onClick={onRetry}>
            Retry
          </Button>
        ) : undefined
      }
      sx={{ alignItems: 'center' }}
    >
      {offline ? `${what} isn't on this device yet. It loads when you're back online.` : `${what} didn't load. ${problemText(error)}`}
    </Alert>
  )
}

export type NumberFieldProps = Omit<TextFieldProps, 'type' | 'onChange' | 'value'> & {
  value: string
  onChange: (value: string) => void
  unit: ReactNode
  /** Whole numbers only (numeric keypad instead of decimal). */
  integer?: boolean
}

/** A number input with the phone's number keypad and its unit (kg, ml, g, cm, kcal). Value stays a string while typed. */
export function NumberField({ value, onChange, unit, integer = false, slotProps, ...rest }: NumberFieldProps) {
  return (
    <TextField
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(',', '.'))}
      onFocus={(e) => e.target.select()}
      autoComplete="off"
      slotProps={{
        ...slotProps,
        htmlInput: { inputMode: integer ? 'numeric' : 'decimal', pattern: integer ? '[0-9]*' : '[0-9]*[.,]?[0-9]*', ...(slotProps?.htmlInput as object) },
        input: { endAdornment: <InputAdornment position="end">{unit}</InputAdornment>, ...(slotProps?.input as object) },
      }}
    />
  )
}

/** Parse a typed number ("91.4", "91,4"); null when empty or not a number. */
export function parseNumber(text: string): number | null {
  const trimmed = text.trim().replace(',', '.')
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}
