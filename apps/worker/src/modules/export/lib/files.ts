// Owns: the stored files an export carries — every R2 key the tables reference (meal photos, progress photos, scan
// sheets, report PDFs; never the monthly backups) — and writing one restored file back under its key with a content
// type read from its extension (the zip keeps no metadata).
import { FileKey } from '@fitness/shared/schemas'
import { sql } from 'drizzle-orm'
import type { Db } from '../../../db'

/** Keys referenced by rows, deduplicated, in a stable order. Values that are not valid FileKeys are skipped. */
export async function referencedKeys(db: Db): Promise<FileKey[]> {
  const rows = await db.all<{ key: string }>(sql`
    SELECT storage_path AS key FROM meal_photos
    UNION SELECT storage_path FROM progress_photos
    UNION SELECT storage_path FROM scans WHERE storage_path IS NOT NULL
    UNION SELECT pdf_path FROM weekly_reviews WHERE pdf_path IS NOT NULL
    ORDER BY key`)
  return rows.flatMap((r) => {
    const key = FileKey.safeParse(r.key)
    return key.success ? [key.data] : []
  })
}

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  png: 'image/png',
  pdf: 'application/pdf',
  json: 'application/json',
}

/** Content type of a stored file by its key's extension; octet-stream when unknown. */
export function contentTypeOf(key: string): string {
  const ext = key.slice(key.lastIndexOf('.') + 1).toLowerCase()
  return CONTENT_TYPES[ext] ?? 'application/octet-stream'
}
