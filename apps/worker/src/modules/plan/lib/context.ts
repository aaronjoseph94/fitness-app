// Owns: loading what every plan operation reads first — the rails (settings), the profile, the active plan version and
// the highest version number — in one batched round trip; plus row ↔ contract mapping for plan versions.
import type { PlanVersion } from '@fitness/shared/schemas'
import { eq, max } from 'drizzle-orm'
import { plan_versions, profile, settings, type Row } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { HttpError } from '../../../lib/http-error'

export type PlanVersionRow = Row<typeof plan_versions>
export type SettingsRow = Row<typeof settings>
export type ProfileRow = Row<typeof profile>

export interface PlanContext {
  settings: SettingsRow
  profile: ProfileRow | null
  active: PlanVersionRow
  max_version: number
}

export async function loadPlanContext(deps: Deps): Promise<PlanContext> {
  const [s, p, a, m] = await deps.db.batch([
    deps.db.select().from(settings).limit(1),
    deps.db.select().from(profile).limit(1),
    deps.db.select().from(plan_versions).where(eq(plan_versions.active, true)).limit(1),
    deps.db.select({ v: max(plan_versions.version) }).from(plan_versions),
  ])
  if (!s[0] || !a[0])
    throw new HttpError(503, 'not_seeded', 'No settings or active plan version; seed the database (pnpm --filter @fitness/worker setup:local)')
  return { settings: s[0], profile: p[0] ?? null, active: a[0], max_version: m[0]?.v ?? a[0].version }
}

export function toPlanVersion(row: PlanVersionRow): PlanVersion {
  return {
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    version: row.version,
    active: row.active,
    created_by: row.created_by,
    reason: row.reason,
    diff: row.diff,
    targets: row.targets,
    forecast: row.forecast ?? null,
  }
}
