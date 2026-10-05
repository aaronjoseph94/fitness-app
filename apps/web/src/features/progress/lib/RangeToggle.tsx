// Owns: the 4 w / 12 w / all segmented control at the top of Progress (44 px segments, full width on a phone).
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { tokens } from '../../../theme'
import { RANGES, type RangeKey } from './range'

export function RangeToggle({ value, onChange }: { value: RangeKey; onChange: (range: RangeKey) => void }) {
  return (
    <ToggleButtonGroup
      value={value}
      exclusive
      onChange={(_, next: RangeKey | null) => next && onChange(next)}
      aria-label="Range"
      data-testid="progress-range"
      sx={{
        width: { xs: '100%', sm: 'auto' },
        '& .MuiToggleButton-root': {
          flex: { xs: 1, sm: 'none' },
          minHeight: tokens.tapTarget,
          px: 5,
          textTransform: 'none',
          fontWeight: tokens.font.weight.label,
          fontSize: 15,
        },
      }}
    >
      {RANGES.map((r) => (
        <ToggleButton key={r.key} value={r.key}>
          {r.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  )
}
