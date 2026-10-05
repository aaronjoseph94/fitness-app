// Owns: one day_adjustment run (after a meal is confirmed or a fast starts) — the day's numbers from the day view
// (remaining, protein status), favourites that fit what is left, the LLM's short wording (optional: without a provider
// the card is written with plain text), and the 'adjustment' event the Today tab shows. Never fails for the LLM.
import { DayAdjustmentOutput, DayAdjustmentWording } from '@fitness/shared/schemas'
import { and, eq } from 'drizzle-orm'
import { ai_events } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { getDay } from '../../day'
import { recordEvent } from '../../events'
import type { FetchBudget } from '../../../lib/deps'
import type { JobContext, JobMeta } from '../../jobs'
import { BudgetError, DeadlineError, ProvidersExhaustedError, type LlmRouter } from '../../llm'
import { listFavourites } from '../../nutrition'
import { adjustmentSummary, dayStatus, fallbackNote, fallbackWhy, pickSuggestions, remainingOf } from './numbers'
import { DAY_ADJUSTMENT_SYSTEM, dayAdjustmentMessage } from './prompts'

/** Subrequests one run may make (the router only). */
export const DAY_ADJUSTMENT_FETCHES = 6
const LLM_DEADLINE_MS = 10_000

export interface AdjustAdapters {
  router: (deps: Deps, budget: FetchBudget) => Pick<LlmRouter, 'complete'>
}

type Output = { output: DayAdjustmentOutput; meta?: JobMeta }

export async function adjustDay(deps: Deps, adapters: AdjustAdapters, job: JobContext<'day_adjustment'>): Promise<Output> {
  const { date, trigger } = job.payload
  // A rerun of a job whose card was already written (e.g. after a lease expired) returns that card.
  const [written] = await deps.db
    .select({ body: ai_events.body })
    .from(ai_events)
    .where(and(eq(ai_events.job_id, job.id), eq(ai_events.kind, 'adjustment')))
    .limit(1)
  const again = DayAdjustmentOutput.safeParse(written?.body)
  if (again.success) return { output: again.data }

  const day = await getDay(deps, date)
  const fast_day = trigger === 'fast_started' || day.fast.state === 'active' || (day.targets?.is_fast_day ?? false)
  const remaining = remainingOf(day)
  const status = dayStatus(remaining)
  const picks = fast_day ? [] : pickSuggestions(await listFavourites(deps), remaining, status)
  const water_target_ml = day.targets?.water_ml ?? null

  let wording: DayAdjustmentWording | null = null
  let meta: JobMeta | undefined
  try {
    const res = await adapters.router(deps, { limit: DAY_ADJUSTMENT_FETCHES, used: 0 }).complete({
      job: 'day_adjustment',
      system: DAY_ADJUSTMENT_SYSTEM,
      messages: [
        {
          role: 'user',
          content: dayAdjustmentMessage({
            date,
            fast_day,
            status,
            remaining,
            eaten: { kcal: day.intake.total.kcal, protein_g: day.intake.total.protein_g },
            targets: day.targets && { kcal: day.targets.kcal, protein_g: day.targets.protein_g },
            water_target_ml,
            suggestions: picks.map((p) => ({ label: p.label, grams: p.grams, kcal: p.kcal, protein_g: p.protein_g })),
          }),
        },
      ],
      schema: DayAdjustmentWording,
      priority: 'user',
      deadlineMs: LLM_DEADLINE_MS,
      maxTokens: 512,
    })
    wording = res.data
    meta = { provider: res.provider, model: res.model, tokens_in: res.tokens_in, tokens_out: res.tokens_out }
  } catch (e) {
    if (!(e instanceof ProvidersExhaustedError || e instanceof DeadlineError || e instanceof BudgetError)) throw e
    console.warn(JSON.stringify({ at: 'day_adjustment', job: job.id, event: 'written_without_llm', error: e.name }))
  }

  const output = DayAdjustmentOutput.parse({
    remaining,
    status,
    suggestions: picks.map((p, i) => ({
      favorite_id: p.favourite_id,
      description: p.label.slice(0, 200),
      grams: p.grams,
      why: wording?.why[i]?.trim() || fallbackWhy(p, remaining),
    })),
    note: wording?.note.trim() || fallbackNote(status, remaining, { fast_day, water_target_ml }),
  })
  await recordEvent(deps, {
    kind: 'adjustment',
    summary: adjustmentSummary(status, remaining, fast_day),
    body: { ...output, date },
    date,
    job_id: job.id,
  })
  return meta ? { output, meta } : { output }
}
