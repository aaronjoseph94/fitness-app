// Owns: the 2a segmented control, built on MUI's ToggleButtonGroup (so keyboard, `aria-pressed` and the exclusive
// choice come from MUI) in three looks:
//   • `default` — a #F4F4F5 track 3 px in, radius 9; the selected segment white with the segment shadow (page title
//     rows: "Today / 7 days / 30 days", "30 / 90 / 180 days");
//   • `outline` — a 1 px #E4E4E7 frame with no fill, 12 px segments, the selected one on #F4F4F5 (a card header's
//     "12 days / 8 weeks / Journey");
//   • `dark` — the outline frame with the selected segment #09090B and white (the Log's date switcher).
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
  tone?: 'default' | 'outline' | 'dark'
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
  const framed = tone !== 'default'
  const selected =
    tone === 'dark'
      ? { bgcolor: tokens.dark.bg, color: tokens.dark.text, boxShadow: 'none' }
      : tone === 'outline'
        ? { bgcolor: tokens.ink.fill, color: tokens.ink.text, boxShadow: 'none' }
        : {}
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
        ...(framed && {
          bgcolor: 'transparent',
          border: `1px solid ${tokens.ink.border}`,
          borderRadius: `${tone === 'outline' ? tokens.radius.control : tokens.radius.segmentTrack}px`,
        }),
        '& .MuiToggleButton-root': {
          ...(framed && { borderRadius: `${tokens.radius.inner}px` }),
          ...(fullWidth && { flex: 1 }),
          '&.Mui-selected, &.Mui-selected:hover': selected,
        },
      }}
    >
      {options.map((o) => (
        <ToggleButton key={String(o.value)} value={o.value} disabled={o.disabled} aria-label={o.ariaLabel} data-testid={o.testId}>
          {o.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  )
}
