// Owns: the finish screen's numbers for a working copy — the Worker's summary when finish was saved, otherwise the
// same engine function over the ticked sets (duration, total volume Σ reps × kg, volume per muscle with primary 1.0 /
// secondary 0.5, muscle scores) with the PRs the Worker stored (PR detection needs the full history, so a summary
// computed here waits for the sync to show PRs).
import { muscleLevels, sessionSummary } from '@fitness/shared/engine'
import type { Exercise, Muscle, SessionSummary } from '@fitness/shared/schemas'
import type { LoggerSession } from './logger-model'

export interface FinishView {
  summary: SessionSummary
  levels: ReturnType<typeof muscleLevels>
  /** Muscles by volume, highest first. */
  volume: { muscle: Muscle; kg: number }[]
  sets_done: number
  /** The summary was computed on this phone; PRs arrive once the finish syncs. */
  prs_pending: boolean
}

export function finishView(
  session: LoggerSession,
  byId: ReadonlyMap<string, Pick<Exercise, 'id' | 'primary_muscles' | 'secondary_muscles'>>,
): FinishView | null {
  const finished = session.finished
  if (!finished) return null
  const sets = session.exercises.flatMap((e) =>
    e.sets.map((s) => ({ exercise_id: e.exercise_id, reps: s.reps, load_kg: s.load_kg, completed: s.done })),
  )
  const summary: SessionSummary =
    finished.summary ??
    (() => {
      const totals = sessionSummary({
        date: session.date,
        started_at: session.started_at,
        ended_at: finished.ended_at,
        sets,
        exercises: session.exercises.flatMap((e) => {
          const x = byId.get(e.exercise_id)
          return x
            ? [{ id: x.id, primary_muscles: x.primary_muscles, secondary_muscles: x.secondary_muscles }]
            : []
        }),
        history: [],
      })
      return { ...totals, prs: session.prs ?? [] }
    })()
  const volume = (Object.entries(summary.volume_by_muscle) as [Muscle, number][])
    .filter(([, kg]) => kg > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([muscle, kg]) => ({ muscle, kg }))
  return {
    summary,
    levels: muscleLevels(summary.muscle_scores),
    volume,
    sets_done: sets.filter((s) => s.completed).length,
    prs_pending: finished.summary === null && session.prs === null,
  }
}
