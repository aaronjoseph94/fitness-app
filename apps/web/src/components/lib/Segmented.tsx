// Owns: the 1d segmented control, built on MUI's ToggleButtonGroup (so keyboard, `aria-pressed` and the exclusive
// choice come from MUI) in two looks:
//   • `default` — a soft violet pill track 4 px in; the selected segment deep ink with white text, as the theme's
//     ToggleButton draws it. In a page's hero (Dashboard's "30 / 90 / 180 days", Progress' "4 weeks / 12 weeks / All")
//     `PageHeader` turns it into a glass track with a white selected segment;
//   • `outline` — a white track inside a 1 px lilac frame (Photos' compare "Side by side / Slider"), the same deep ink
//     selection.
// Segments are 13/500 (12 small) and 44 px tall on a touch screen. A choice can never be cleared: clicking the
// selected segment again does nothing, as a segmented control should.
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import type { ReactNode } from 'react'
import { tokens } from '../../theme'

export interface SegmentedOption<T extends string | number> {
  value: T
  label: ReactNode
  /** Accessible name when `label` is an icon or an abbreviation. */
  ariaLabel?: string
  disabled?: boolean
  testId?: string
}

export interface SegmentedProps<T extends string | number> {
  value: T
  onChange: (value: T) => void
  options: readonly SegmentedOption<T>[]
  /** The group's accessible name, e.g. "Window". */
  ariaLabel: string
  tone?: 'default' | 'outline'
  size?: 'medium' | 'small'
  /** Stretch to the container, segments sharing the width (phones). */
  fullWidth?: boolean
  testId?: string
}

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  ariaLabel,
  tone = 'default',
  size = 'medium',
  fullWidth = false,
  testId,
}: SegmentedProps<T>) {
  const framed = tone === 'outline'
  return (
    <ToggleButtonGroup
      value={value}
      exclusive
      size={size}
      fullWidth={fullWidth}
      aria-label={ariaLabel}
      data-testid={testId}
      onChange={(_, next: T | null) => {
        if (next !== null && next !== value) onChange(next)
      }}
      sx={{
        ...(framed && { bgcolor: tokens.ink.card, border: `1px solid ${tokens.ink.border}` }),
        '& .MuiToggleButton-root': { ...(fullWidth && { flex: 1 }) },
      }}
    >
      {options.map((o) => (
        <ToggleButton
          key={String(o.value)}
          value={o.value}
          disabled={o.disabled}
          aria-label={o.ariaLabel}
          data-testid={o.testId}
        >
          {o.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  )
}
