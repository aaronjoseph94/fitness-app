// Owns: which range the Progress tab shows for the URL (?range=, default 4 w). A second entry point of the progress
// module: light, no UI.
import { isRangeKey, type RangeKey } from './lib/range'

/** The range `?range=` asks for; 4 w when absent or unknown. */
export function progressRange(raw: string | null): RangeKey {
  return isRangeKey(raw) ? raw : '4w'
}
