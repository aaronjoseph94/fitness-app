// Owns: the 4 weeks / 12 weeks / All segmented control in the Progress hero (the kit's Segmented, which the hero draws
// as glass with a white selected segment; it wraps under the title on a phone).
import { Segmented } from '../../../components'
import { RANGES, type RangeKey } from './range'

export function RangeToggle({ value, onChange }: { value: RangeKey; onChange: (range: RangeKey) => void }) {
  return (
    <Segmented
      ariaLabel="Range"
      value={value}
      onChange={onChange}
      options={RANGES.map((r) => ({ value: r.key, label: r.label }))}
      testId="progress-range"
    />
  )
}
