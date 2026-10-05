// Owns: the builder's editable state — name, notes, origin and the ordered exercise list (each with a stable key for
// drag and drop) — loaded once from a template being edited or duplicated, with dirty tracking and validation (the
// rails a template must keep, which the Worker also enforces: the allowed exercise set and 12–28 sets).
import { SESSION_SETS } from '@fitness/shared/engine'
import type { ExerciseSummary, Template, TemplateExerciseInput, TemplateOrigin } from '@fitness/shared/schemas'
import { useCallback, useState } from 'react'
import type { BuilderItem } from './ExerciseCard'

export interface BuilderState {
  name: string
  notes: string
  origin: TemplateOrigin
  items: BuilderItem[]
}

const EMPTY: BuilderState = { name: '', notes: '', origin: 'custom', items: [] }

function keyed(list: readonly TemplateExerciseInput[]): BuilderItem[] {
  return list.map(({ exercise_id, sets, rep_min, rep_max, target_load_kg, rest_sec, note }) => ({
    key: crypto.randomUUID(),
    exercise_id,
    sets,
    rep_min,
    rep_max,
    target_load_kg,
    rest_sec,
    note,
  }))
}

/** The template's fields as the builder edits them; a duplicate gets " copy" and keeps the origin. */
export function fromTemplate(t: Template, duplicate: boolean): BuilderState {
  return { name: duplicate ? `${t.name} copy`.slice(0, 100) : t.name, notes: t.notes ?? '', origin: t.origin, items: keyed(t.exercises) }
}

/** The exercise list as the API takes it (no keys, empty notes as null). */
export function toExercises(items: readonly BuilderItem[]): TemplateExerciseInput[] {
  return items.map(({ key: _key, note, ...rest }) => ({ ...rest, note: note?.trim() ? note.trim() : null }))
}

/** What stops a save, in words; `byId` (the cached library) finds exercises outside the allowed set. */
export function problems(s: BuilderState, byId?: ReadonlyMap<string, Pick<ExerciseSummary, 'name' | 'allowed'>>): string[] {
  const out: string[] = []
  if (!s.name.trim()) out.push('Give the template a name.')
  if (s.items.length === 0) out.push('Add at least one exercise.')
  if (s.items.length > 20) out.push('A template holds at most 20 exercises.')
  if (s.items.some((i) => i.rep_min > i.rep_max)) out.push('A rep range has its minimum above its maximum.')
  const hidden = s.items.flatMap((i) => {
    const x = byId?.get(i.exercise_id)
    return x && !x.allowed ? [x.name] : []
  })
  if (hidden.length) out.push(`${hidden.join(', ')} ${hidden.length > 1 ? 'are' : 'is'} outside your allowed exercises: swap or remove ${hidden.length > 1 ? 'them' : 'it'}.`)
  const sets = s.items.reduce((n, i) => n + i.sets, 0)
  if (s.items.length && (sets < SESSION_SETS.min || sets > SESSION_SETS.max))
    out.push(`A session has ${SESSION_SETS.min}–${SESSION_SETS.max} sets; this template has ${sets}.`)
  return out
}

export function useBuilder() {
  const [state, setState] = useState<BuilderState>(EMPTY)
  const [dirty, setDirty] = useState(false)

  const edit = useCallback((fn: (s: BuilderState) => BuilderState) => {
    setState(fn)
    setDirty(true)
  }, [])

  return {
    state,
    dirty,
    /** Replace everything (loading a template) without marking it dirty. */
    load: useCallback((s: BuilderState) => {
      setState(s)
      setDirty(false)
    }, []),
    markSaved: useCallback(() => setDirty(false), []),
    setName: (name: string) => edit((s) => ({ ...s, name })),
    setNotes: (notes: string) => edit((s) => ({ ...s, notes })),
    add: (item: TemplateExerciseInput): string => {
      const key = crypto.randomUUID()
      edit((s) => ({ ...s, items: [...s.items, { ...item, key }] }))
      return key
    },
    update: (key: string, patch: Partial<TemplateExerciseInput>) =>
      edit((s) => ({ ...s, items: s.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) })),
    remove: (key: string) => edit((s) => ({ ...s, items: s.items.filter((i) => i.key !== key) })),
    move: (from: number, to: number) =>
      edit((s) => {
        const items = [...s.items]
        const [moved] = items.splice(from, 1)
        if (moved) items.splice(to, 0, moved)
        return { ...s, items }
      }),
    /** Take a whole exercise list (e.g. an AI fill), with an optional note. */
    replaceAll: (list: readonly TemplateExerciseInput[], patch: Partial<Omit<BuilderState, 'items'>> = {}) =>
      edit((s) => ({ ...s, ...patch, items: keyed(list) })),
  }
}
