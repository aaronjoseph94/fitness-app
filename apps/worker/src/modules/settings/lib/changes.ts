// Owns: working out what a settings/profile edit actually changes — one FieldChange (path, from, to) per field whose
// JSON value differs — and the one-line summary the `change` event carries.
import type { FieldChange } from '@fitness/shared/schemas'

/** Fields of `patch` whose value differs from `current` (compared as JSON, so arrays and objects compare by value). */
export function fieldChanges(current: Record<string, unknown>, patch: Record<string, unknown> | undefined): FieldChange[] {
  if (!patch) return []
  return Object.entries(patch)
    .filter(([key, to]) => to !== undefined && JSON.stringify(current[key]) !== JSON.stringify(to))
    .map(([path, to]) => ({ path, from: (current[path] ?? null) as FieldChange['from'], to: to as FieldChange['to'] }))
}

/** "Settings changed: calorie_floor 1400 → 1450; training_days [mon,tue] → [mon,wed]". */
export function summarise(entity: string, changes: readonly FieldChange[]): string {
  const show = (v: unknown) => (Array.isArray(v) ? `[${v.join(',')}]` : typeof v === 'object' && v !== null ? 'edited' : String(v))
  return `${entity} changed: ${changes.map((c) => `${c.path} ${show(c.from)} → ${show(c.to)}`).join('; ')}`.slice(0, 500)
}

/** Object containing only the changed fields' new values (for the UPDATE). */
export function changedValues<T extends object>(changes: readonly FieldChange[]): Partial<T> {
  return Object.fromEntries(changes.map((c) => [c.path, c.to])) as Partial<T>
}
