// Owns: how progress photos are arranged — grouped by month for the grid, one per month per pose for the monthly
// strip, and the default pair to compare (the first and the latest photo of a pose).
import type { Pose, ProgressPhoto } from '@fitness/shared/schemas'

const monthName = new Intl.DateTimeFormat('en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const monthShort = new Intl.DateTimeFormat('en-CA', { month: 'short', year: '2-digit', timeZone: 'UTC' })

/** "2026-10-04" → "2026-10". */
export const monthOf = (date: string) => date.slice(0, 7)

/** "2026-10" → "October 2026" (long) or "Oct 26" (short). */
export function monthLabel(month: string, style: 'long' | 'short' = 'long'): string {
  const at = Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1)
  return (style === 'long' ? monthName : monthShort).format(at)
}

export interface MonthGroup {
  month: string
  photos: ProgressPhoto[]
}

const POSE_ORDER: Record<Pose, number> = { front: 0, side: 1, back: 2 }

/**
 * Photos grouped by the month of their local date, newest month first; within a month newest day first, and one day's
 * photos in pose order (front, side, back), the way they were taken.
 */
export function groupByMonth(photos: readonly ProgressPhoto[]): MonthGroup[] {
  const sorted = [...photos].sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? 1 : -1) : POSE_ORDER[a.pose] - POSE_ORDER[b.pose] || b.taken_at.localeCompare(a.taken_at),
  )
  const groups: MonthGroup[] = []
  for (const photo of sorted) {
    const month = monthOf(photo.date)
    const last = groups[groups.length - 1]
    if (last?.month === month) last.photos.push(photo)
    else groups.push({ month, photos: [photo] })
  }
  return groups
}

export interface StripRow {
  pose: Pose
  /** One cell per month (oldest first); null when that pose has no photo that month. */
  cells: { month: string; photo: ProgressPhoto | null }[]
}

/** Every month from the first to the last photo, oldest first ("2026-08" … "2026-10"). */
function monthSpan(photos: readonly ProgressPhoto[]): string[] {
  if (photos.length === 0) return []
  const months = photos.map((p) => monthOf(p.date)).sort()
  const out: string[] = []
  let [y, m] = months[0]!.split('-').map(Number) as [number, number]
  const last = months[months.length - 1]!
  for (;;) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    out.push(key)
    if (key >= last) return out
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
}

/** The monthly strip: for each pose, the latest photo of each month (a month without one stays an empty cell). */
export function monthlyStrip(photos: readonly ProgressPhoto[], poses: readonly Pose[]): StripRow[] {
  const months = monthSpan(photos)
  return poses.map((pose) => {
    const latest = new Map<string, ProgressPhoto>()
    for (const photo of photos) {
      if (photo.pose !== pose) continue
      const month = monthOf(photo.date)
      const current = latest.get(month)
      if (!current || photo.taken_at > current.taken_at) latest.set(month, photo)
    }
    return { pose, cells: months.map((month) => ({ month, photo: latest.get(month) ?? null })) }
  })
}

/** The default comparison for a pose: its first photo against its latest (null when it has fewer than two). */
export function defaultPair(photos: readonly ProgressPhoto[], pose: Pose): [ProgressPhoto, ProgressPhoto] | null {
  const ofPose = photos.filter((p) => p.pose === pose)
  if (ofPose.length < 2) return null
  // The list is newest first.
  return [ofPose[ofPose.length - 1]!, ofPose[0]!]
}
