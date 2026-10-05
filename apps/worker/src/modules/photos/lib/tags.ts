// Owns: what a progress photo is tagged with and how a row becomes the API shape — the day's trend weight (from the
// body module's trend series) and the nearest confirmed scan — plus the short-lived signed URL.
import type { FileKey, ImageType, LocalDate, PhotoScan, ProgressPhoto } from '@fitness/shared/schemas'
import { eq } from 'drizzle-orm'
import { progress_photos, scans, type Row } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { getTrend } from '../../body'
import { signFileUrl } from '../../files'

type PhotoRow = Row<typeof progress_photos>
type ScanStub = PhotoScan & { scanned_at: string }

/** Signed photo links are short-lived (30 min): long enough to look through the grid, short enough to go stale fast. */
export const PHOTO_URL_TTL_SECONDS = 30 * 60

const EXTENSION: Record<ImageType, string> = { 'image/jpeg': 'jpg', 'image/webp': 'webp' }

/** R2 key: progress-photos/<id>.<jpg|webp>. */
export const photoKey = (id: string, type: ImageType): FileKey => `progress-photos/${id}.${EXTENSION[type]}`

/** Everything needed to tag photos: the trend weight per local date, and the confirmed scans. */
export interface Tags {
  trendKg: Map<LocalDate, number>
  scans: ScanStub[]
}

/** trend rounded to 0.01 kg (the UI shows 0.1). */
const round2 = (x: number) => Math.round(x * 100) / 100

/** Trend weights for the span of `dates` (one trend series, all history to the last date) and every confirmed scan. */
export async function loadTags(deps: Deps, dates: readonly LocalDate[]): Promise<Tags> {
  if (dates.length === 0) return { trendKg: new Map(), scans: [] }
  const sorted = [...dates].sort()
  const [trend, confirmed] = await Promise.all([
    getTrend(deps, { from: sorted[0]!, to: sorted[sorted.length - 1]! }),
    deps.db
      .select({ id: scans.id, scanned_at: scans.scanned_at, date: scans.date, body_fat_pct: scans.body_fat_pct, weight_kg: scans.weight_kg })
      .from(scans)
      .where(eq(scans.confirmed, true)),
  ])
  const trendKg = new Map<LocalDate, number>()
  for (const p of trend.points) if (p.trend_kg !== null) trendKg.set(p.date, round2(p.trend_kg))
  return { trendKg, scans: confirmed }
}

/** The confirmed scan with the smallest |scanned_at − taken_at| (before or after the photo); a tie goes to the earlier scan. */
export function nearestScan(tags: Tags, takenAt: string): PhotoScan | null {
  const at = Date.parse(takenAt)
  let best: ScanStub | null = null
  let bestGap = Infinity
  for (const s of tags.scans) {
    const gap = Math.abs(Date.parse(s.scanned_at) - at)
    if (gap < bestGap || (gap === bestGap && best !== null && s.scanned_at < best.scanned_at)) {
      best = s
      bestGap = gap
    }
  }
  return best && { id: best.id, date: best.date, body_fat_pct: best.body_fat_pct, weight_kg: best.weight_kg }
}

/**
 * A row as the API returns it. The tags are read live (a weigh-in logged after the photo on the same day, or a scan
 * confirmed later, shows up); the stored weight_kg is the fallback when the trend has no value for that day.
 */
export async function toPhoto(deps: Deps, row: PhotoRow, tags: Tags): Promise<ProgressPhoto> {
  const signed = await signFileUrl(deps.env, row.storage_path as FileKey, PHOTO_URL_TTL_SECONDS, deps.now())
  return {
    id: row.id,
    taken_at: row.taken_at,
    date: row.date,
    pose: row.pose,
    url: signed.url,
    url_expires_at: signed.expires_at,
    weight_kg: tags.trendKg.get(row.date) ?? row.weight_kg,
    nearest_scan: nearestScan(tags, row.taken_at),
    note: row.note,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}
