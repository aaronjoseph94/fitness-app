// Owns: the small UI pieces the logging forms share — the "logged" notice (saved vs on this phone), calm wording for a
// failed read or write, a number field preset (decimal keypad, unit, 44 px), and the inline "couldn't load" row.
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import InputAdornment from '@mui/material/InputAdornment'
import TextField, { type TextFieldProps } from '@mui/material/TextField'
import type { ReactNode } from 'react'
import { isApiError } from '../../../api'

/** What a form reports after a write, for the sheet's snackbar. */
export interface LogNotice {
  message: string
  /** Kept on this phone; it syncs when the Worker is reachable. */
  queued: boolean
}

export function noticeFor(outcome: { status: 'saved' | 'queued' }, message: string): LogNotice {
  return outcome.status === 'queued'
    ? { message: `${message} · saved on this phone, syncs when you're back online`, queued: true }
    : { message, queued: false }
}

/** A failed write or read in plain words (never a stack of codes). */
export function problemText(error: unknown): string {
  if (!isApiError(error)) return 'Something went wrong. Try again.'
  switch (error.kind) {
    case 'network':
      return navigator.onLine ? "Couldn't reach the server. Try again in a moment." : "You're offline."
    case 'auth-expired':
      return 'Your sign-in expired. Sign in again from the banner at the top.'
    case 'invalid-request':
      return `Check the values: ${error.message}.`
    case 'invalid-response':
      return 'The app and the server are out of step. Reload the app.'
    case 'http':
      if (error.transient) return 'The server is having a moment. Try again shortly.'
      if (error.status === 404) return "The server doesn't have that (yet)."
      return error.message || `The server said no (HTTP ${error.status ?? '?'}).`
  }
}

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
      {offline ? `${what} isn't on this phone yet. It loads when you're back online.` : `${what} didn't load. ${problemText(error)}`}
    </Alert>
  )
}

type NumberFieldProps = Omit<TextFieldProps, 'type' | 'onChange' | 'value'> & {
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
