// Owns: the food-sources module's interface — barcode lookup, food search and meal-item matching over the local `foods`
// cache (Canadian Nutrient File seed + everything fetched before), Open Food Facts and USDA FoodData Central, plus the
// portion maths for meal_items. SPEC §6 "Nutrition logging" pipeline; §9 meal_analysis writes meal_items after matching.
//
// Order of a match: barcode → the cache by name together with the LLM's suggested foods → USDA (generic items) or
// OFF (branded items) → the other one. The cache is always read before any external call; whatever a source returns is upserted into
// `foods` by (source, source_id) so the next lookup is local. Score and thresholds: lib/match.ts.
//
// Budget: one instance (create one per request or job run) makes at most `maxExternalCalls` external calls (default 12;
// OFF ≤ 6, USDA ≤ 8), so a 30-item meal stays inside the free plan's 50 subrequests with room for the LLM router.
// When the budget is spent, matching continues from the cache only and unmatched items fall back to the LLM estimate.
import type { FoodSource, Nutrients } from '@fitness/shared/schemas'
import type { Deps } from '../../lib/deps'
import { HttpError } from '../../lib/http-error'
import { findByBarcode, findBySourceIds, recordUsage, remember, searchByStems, type FoodRow } from './lib/cache'
import { createGate, SourceUnavailable, type Fetch } from './lib/gate'
import { ACCEPT, likeStems, looksBranded, rank, STRONG, tokens } from './lib/match'
import { nutritionFor, type FoodDraft, type Per100g } from './lib/normalise'
import { createRemote } from './lib/remote'

export { nutritionFor, type FoodRow, type Fetch, type Per100g }

export interface FoodSourcesOptions {
  /** Injected so tests use fakes; defaults to the Worker's global fetch. */
  fetch?: Fetch
  /** External calls this instance may make (default 12). */
  maxExternalCalls?: number
}

/** One item from meal_analysis (MealAnalysisOutput item) or a scanned product. */
export interface MatchItem {
  name: string
  grams: number
  barcode?: string | null
  /** Foods the LLM suggested; used only when found in the cache or fetchable by id (USDA fdcId, OFF barcode). */
  candidates?: { source: FoodSource; source_id: string }[]
}

/** A database match for a meal item: the food, how sure the match is (0–1) and the item's nutrition at its grams. */
export interface FoodMatch {
  food: FoodRow
  confidence: number
  estimated: false
  nutrients: Nutrients
}

export interface FoodSearchOptions {
  /** Most results returned (default 10, max 25). */
  limit?: number
  /** Ask OFF and USDA when the cache has fewer than `limit` good results (default true). */
  remote?: boolean
}

export interface FoodSources {
  /**
   * The cached food for a barcode (Aaron's own first), else the Open Food Facts product, cached. Null when unknown or
   * without nutrition. Throws HttpError 400 for a malformed code, 503 when OFF is unreachable and nothing is cached.
   */
  byBarcode(code: string): Promise<FoodRow | null>
  /** Foods for a text query, best first (cached rows; remote hits are cached so every result has an id). */
  search(q: string, opts?: FoodSearchOptions): Promise<FoodRow[]>
  /** The best database food for a meal item, or null (the caller then keeps the LLM estimate, estimated = true). */
  matchItem(item: MatchItem): Promise<FoodMatch | null>
  /** Nutrition of `grams` of a food (per-100 g × grams / 100, 0.1 precision). */
  nutritionFor(food: Per100g, grams: number): Nutrients
}

/** A food in the pool rank() scores; `bonus` lifts foods the LLM suggested. */
type Entry = { food: FoodRow | FoodDraft; bonus?: number }

/** Results asked of a source per search (USDA search answers are ~25 KB per food; keep parsing inside 10 ms CPU). */
const REMOTE_PAGE = 3
const SUGGESTED_BONUS = 0.05
const MIN_SEARCH_SCORE = 0.3
const isRow = (f: FoodRow | FoodDraft): f is FoodRow => 'id' in f
const keyOf = (f: { source: string; source_id: string | null }) => `${f.source}:${f.source_id}`
/** Concatenate pools, keeping the first entry per (source, source_id). */
function merge(...pools: Entry[][]): Entry[] {
  const out = new Map<string, Entry>()
  for (const e of pools.flat()) if (!out.has(keyOf(e.food))) out.set(keyOf(e.food), e)
  return [...out.values()]
}

export function createFoodSources(deps: Deps, opts: FoodSourcesOptions = {}): FoodSources {
  const maxCalls = opts.maxExternalCalls ?? 12
  const gate = createGate({
    fetch: opts.fetch ?? ((input, init) => fetch(input, init)),
    maxCalls,
    perSource: { off: Math.min(6, maxCalls), usda: Math.min(8, maxCalls) },
    timeoutMs: 6000,
    onCall: (source) => deps.waitUntil(recordUsage(deps.db, source, deps.now()).catch(() => undefined)),
  })
  const remote = createRemote(gate, deps.env.USDA_FDC_API_KEY)

  /** Remote results, or [] when the source cannot answer (budget, rate limit, outage). */
  async function tryRemote<T>(call: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await call()
    } catch (e) {
      if (e instanceof SourceUnavailable) return fallback
      throw e
    }
  }

  /** The same foods as rows, in order: drafts are upserted into the cache (one batch), rows pass through. */
  async function store(list: (FoodRow | FoodDraft)[]): Promise<FoodRow[]> {
    const saved = new Map((await remember(deps.db, list.filter((f): f is FoodDraft => !isRow(f)), deps.now())).map((r) => [keyOf(r), r]))
    return list.map((f) => (isRow(f) ? f : saved.get(keyOf(f))!))
  }

  async function byBarcode(input: string): Promise<FoodRow | null> {
    const code = input.replace(/\D/g, '')
    if (!/^\d{8,14}$/.test(code)) throw new HttpError(400, 'invalid_barcode', 'A barcode has 8 to 14 digits')
    const cached = await findByBarcode(deps.db, code)
    if (cached) return cached
    try {
      const draft = await remote.offProduct(code)
      return draft ? ((await store([draft]))[0] ?? null) : null
    } catch (e) {
      if (e instanceof SourceUnavailable)
        throw new HttpError(503, 'food_source_unavailable', 'Open Food Facts is not answering; try again shortly')
      throw e
    }
  }

  /** Cached foods whose name or brand shares a stem with the query (ranked in SQL, scored by rank()). */
  async function localEntries(query: string[]): Promise<Entry[]> {
    return (await searchByStems(deps.db, likeStems(query))).map((food) => ({ food }))
  }

  /** The LLM's suggested foods: from the cache, plus at most one fetched by id (its ids are guesses; each costs a call). */
  async function suggestedEntries(refs: MatchItem['candidates'] = []): Promise<Entry[]> {
    const wanted = refs.filter((r) => r.source !== 'llm').slice(0, 5)
    const cached = await findBySourceIds(deps.db, wanted)
    const missing = wanted.find((r) => (r.source === 'usda' || r.source === 'off') && !cached.some((c) => keyOf(c) === keyOf(r)))
    const fetched = missing
      ? await tryRemote(() => (missing.source === 'usda' ? remote.usdaFood(missing.source_id) : remote.offProduct(missing.source_id)), null)
      : null
    return [...cached, ...(fetched ? [fetched] : [])].map((food) => ({ food, bonus: SUGGESTED_BONUS }))
  }

  async function matchItem(item: MatchItem): Promise<FoodMatch | null> {
    if (item.barcode) {
      // A malformed or unreachable barcode is not fatal here: the item is still matched by name below.
      const food = await byBarcode(item.barcode).catch((e: unknown) => {
        if (e instanceof HttpError) return null
        throw e
      })
      if (food) return { food, confidence: 1, estimated: false, nutrients: nutritionFor(food, item.grams) }
    }

    const query = tokens(item.name)
    if (query.length === 0) return null
    let pool = merge(await suggestedEntries(item.candidates), await localEntries(query))
    let top = rank(query, pool)[0]

    // Generic foods ask USDA (Foundation / SR Legacy) first and products ask Open Food Facts first, only when the cache
    // had nothing strong; the other source is asked only when nothing acceptable was found yet.
    if (!top || top.score < STRONG) {
      const branded = looksBranded(item.name) || (item.candidates ?? []).some((c) => c.source === 'off')
      const q = query.join(' ')
      const asks = [() => remote.usdaSearch(q, REMOTE_PAGE), () => remote.offSearch(q, REMOTE_PAGE)]
      if (branded) asks.reverse()
      for (const [i, ask] of asks.entries()) {
        if (i > 0 && top && top.score >= ACCEPT) break
        pool = merge(pool, (await tryRemote(ask, [])).map((food) => ({ food })))
        top = rank(query, pool)[0]
      }
    }
    if (!top || top.score < ACCEPT) return null
    const [food] = await store([top.food])
    return { food: food!, confidence: top.score, estimated: false, nutrients: nutritionFor(food!, item.grams) }
  }

  async function search(text: string, o: FoodSearchOptions = {}): Promise<FoodRow[]> {
    const limit = Math.max(1, Math.min(25, o.limit ?? 10))
    const query = tokens(text)
    if (query.length === 0) return []
    let pool = await localEntries(query)
    if (o.remote !== false && rank(query, pool).filter((r) => r.score >= ACCEPT).length < limit) {
      const q = query.join(' ')
      const [usda, off] = await Promise.all([
        tryRemote(() => remote.usdaSearch(q, REMOTE_PAGE), []),
        tryRemote(() => remote.offSearch(q, Math.min(limit, 10)), []),
      ])
      pool = merge(pool, [...usda, ...off].map((food) => ({ food })))
    }
    // Only the foods actually returned are cached, so every result has an id.
    return store(
      rank(query, pool)
        .filter((r) => r.score >= MIN_SEARCH_SCORE)
        .slice(0, limit)
        .map((r) => r.food),
    )
  }

  return { byBarcode, search, matchItem, nutritionFor }
}
