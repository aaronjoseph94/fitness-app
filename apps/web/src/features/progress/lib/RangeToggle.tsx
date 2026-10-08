// Owns: the 4 weeks / 12 weeks / All segmented control in the Progress title row (the kit's Segmented; full width on a
// phone, where it wraps under the title).
import type { Theme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import { Segmented } from '../../../components'
import { RANGES, type RangeKey } from './range'

export function RangeToggle({ value, onChange }: { value: RangeKey; onChange: (range: RangeKey) => void }) {
  const phone = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'))
  return (
    <Segmented
      ariaLabel="Range"
      value={value}
      onChange={onChange}
      options={RANGES.map((r) => ({ value: r.key, label: r.label }))}
      fullWidth={phone}
      testId="progress-range"
    />
  )
}
