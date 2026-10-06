// Owns: the food-sources module's interface — barcode lookup, food search and meal-item matching over the local `foods`
// cache (Canadian Nutrient File seed + everything fetched before) and Open Food Facts, plus the portion maths for
// meal_items. SPEC §6 "Nutrition logging" pipeline; §9 meal_analysis writes meal_items after matching.
//
// Canadian food data comes from the Canadian Nutrient File, seeded locally, and is what the cache answers with. Open
// Food Facts is the only remote source, for packaged goods and barcodes. USDA FoodData Central is deliberately never
// queried (Aaron's direction: Canadian food data, not American); USDA rows cached while it was a live source stay in
// `foods` and keep ranking below CNF.
//
// Order of a match: barcode → the cache by name (FTS5 index foods_fts) together with the LLM's suggested foods → Open
// Food Facts when the cache had nothing strong. The cache is always read before any external call; whatever the source
// returns is upserted into `foods` by (source, source_id) so the next lookup is local. Score and thresholds:
// lib/match.ts (the plainest food wins: "milk" is milk, not chocolate milk).
//
// Budget: one instance (create one per request or job run) makes at most `maxExternalCalls` external calls (default 12;
// OFF ≤ 8), so a 30-item meal stays inside the free plan's 50 subrequests with room for the LLM router.
// When the budget is spent, matching continues from the cache only and unmatched items fall back to the LLM estimate.
// A job passes the router's FetchBudget as `budget` so both draw on one subrequest limit, and `until` to stop asking
// the remote source before its deadline; every call also counts in the invocation's tally (deps.budget).
import type { FoodSource, Nutrients } from '@fitness/shared/schemas'
import type { Deps, FetchBudget } from '../../lib/deps'
import { HttpError } from '../../lib/http-error'
import { findByBarcode, findBySourceIds, recordUsage, remember, searchLocal, type FoodRow } from './lib/cache'
import { createGate, SourceUnavailable, type Fetch } from './lib/gate'
import { ACCEPT, ftsQuery, rank, STRONG, tokens } from './lib/match'
import { nutritionFor, type FoodDraft, type Per100g } from './lib/normalise'
import { createRemote } from './lib/remote'

export { nutritionFor, type FoodRow, type Fetch, type Per100g }

export interface FoodSourcesOptions {
  /** Injected so tests use fakes; defaults to the Worker's global fetch. */
  fetch?: Fetch
  /** External calls this instance may make (default 12). */
  maxExternalCalls?: number
  /**
   * A fetch budget shared with other fetching adapters of the same invocation (the LLM router's `budget`): every
   * external call counts against it too, so a job's LLM call and its food lookups stay inside one subrequest limit.
   */
  budget?: FetchBudget
  /** No external call starts after this instant (epoch ms); matching continues from the cache. Keeps a job in its deadline. */
  until?: number
}

/** One item from meal_analysis (MealAnalysisOutput item) or a scanned product. */
export interface MatchItem {
  name: string
  grams: number
  barcode?: string | null
  /**
   * Foods the LLM suggested; used only when already in the cache or fetchable by id (an OFF source id is its barcode).
   * A legacy `usda` suggestion is looked up in the cache and never fetched.
   */
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
  /** Ask Open Food Facts when the cache has fewer than `limit` good results (default true). */
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

/** Results asked of Open Food Facts per search (keep the parsing inside the Worker's 10 ms CPU budget). */
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
    perSource: { off: Math.min(8, maxCalls) },
    timeoutMs: 6000,
    shared: [opts.budget, deps.budget].flatMap((b) => (b ? [b] : [])),
    ...(opts.until !== undefined ? { until: opts.until, now: () => deps.now().getTime() } : {}),
    onCall: (source) => deps.waitUntil(recordUsage(deps.db, source, deps.now()).catch(() => undefined)),
  })
  const remote = createRemote(gate)

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

  /** Cached foods the full-text index finds for the text (best bm25 first in SQL, then scored by rank()). */
  async function localEntries(text: string): Promise<Entry[]> {
    const match = ftsQuery(text)
    return match ? (await searchLocal(deps.db, match)).map((food) => ({ food })) : []
  }

  /** The LLM's suggested foods: from the cache, plus at most one fetched by id (its ids are guesses; each costs a call). */
  async function suggestedEntries(refs: MatchItem['candidates'] = []): Promise<Entry[]> {
    const wanted = refs.filter((r) => r.source !== 'llm').slice(0, 5)
    const cached = await findBySourceIds(deps.db, wanted)
    // Only an Open Food Facts suggestion can still be fetched (its source id is the barcode). A `usda` suggestion from
    // an older turn is left to the cache below: that database is no longer queried.
    const missing = wanted.find((r) => r.source === 'off' && !cached.some((c) => keyOf(c) === keyOf(r)))
    const fetched = missing ? await tryRemote(() => remote.offProduct(missing.source_id), null) : null
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
    let pool = merge(await suggestedEntries(item.candidates), await localEntries(item.name))
    let top = rank(query, pool)[0]

    // The cache had nothing strong, so ask Open Food Facts — the only remote source. A generic item the Canadian
    // Nutrient File does not carry is left unmatched (the LLM estimate stands) rather than fetched from a database
    // outside Canada.
    if (!top || top.score < STRONG) {
      pool = merge(pool, (await tryRemote(() => remote.offSearch(query.join(' '), REMOTE_PAGE), [])).map((food) => ({ food })))
      top = rank(query, pool)[0]
    }
    if (!top || top.score < ACCEPT) return null
    const [food] = await store([top.food])
    return { food: food!, confidence: top.score, estimated: false, nutrients: nutritionFor(food!, item.grams) }
  }

  async function search(text: string, o: FoodSearchOptions = {}): Promise<FoodRow[]> {
    const limit = Math.max(1, Math.min(25, o.limit ?? 10))
    const query = tokens(text)
    if (query.length === 0) return []
    let pool = await localEntries(text)
    if (o.remote !== false && rank(query, pool).filter((r) => r.score >= ACCEPT).length < limit) {
      const off = await tryRemote(() => remote.offSearch(query.join(' '), Math.min(limit, 10)), [])
      pool = merge(pool, off.map((food) => ({ food })))
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
