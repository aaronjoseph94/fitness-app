// Owns: how a meal item's name is compared with a food — normalised tokens, the SQL LIKE stems for the local cache,
// the branded-item guess, and the match score (0–1) that becomes meal_items.confidence. Pure; no I/O.
import type { FoodSource } from '@fitness/shared/schemas'

/** A score at or above this is a match; below it the item stays unmatched and the LLM estimate is used (estimated = true). */
export const ACCEPT = 0.55
/** A score at or above this is good enough to stop asking further sources. */
export const STRONG = 0.75

/** Words that say nothing about which food it is (articles, portion words, units). */
const STOP = new Set([
  'a', 'an', 'the', 'of', 'with', 'and', 'or', 'in', 'on', 'to', 'for', 'from', 'some', 'my',
  'g', 'gram', 'kg', 'ml', 'oz', 'lb', 'cup', 'tbsp', 'tsp', 'slice', 'piece', 'serving', 'portion', 'bowl', 'glass',
  'large', 'medium', 'small', 'fresh', 'approx', 'about',
])
/**
 * Singular-ish stem, applied to both sides so "eggs"/"Egg", "berries"/"berry", "tomatoes"/"tomato" and
 * "toasted"/"toast" agree. A stem is never shorter than four letters ("baked", "dried" stay whole).
 */
function stem(t: string): string {
  if (t.length > 4 && t.endsWith('ies')) return `${t.slice(0, -3)}y`
  if (t.length > 4 && /(ches|shes|xes|oes)$/.test(t)) return t.slice(0, -2)
  if (t.length > 3 && t.endsWith('s') && !/(ss|us|is)$/.test(t)) return t.slice(0, -1)
  if (t.length > 5 && t.endsWith('ed')) return t.slice(0, -2)
  return t
}

/** Default forms: when the item does not say otherwise, "egg" means a whole egg and "banana" a raw one. */
const DEFAULT_FORM = new Set(['whole', 'raw', 'plain', 'regular'].map(stem))
/** Processed or partial forms that are rarely what a plain item name means ("egg" is not dried egg or yolk). */
const UNLIKELY_FORM = new Set(
  [
    'dehydrated', 'powder', 'powdered', 'mix', 'concentrate', 'instant', 'flakes', 'flour', 'yolk', 'substitute',
    'imitation', 'meatless', 'babyfood', 'unprepared',
  ].map(stem),
)

/**
 * Normalised tokens of a name, unique and in order: accents stripped, lower case, "2%" → "2pct", quantities
 * ("120", "120g") and STOP words dropped, each word stemmed.
 */
export function tokens(text: string): string[] {
  const s = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/(\d+(?:\.\d+)?)\s*%/g, (_, n: string) => ` ${n.replace('.', 'p')}pct `)
  const out: string[] = []
  for (const word of s.split(/[^a-z0-9]+/)) {
    if (word.length < 2 || STOP.has(word) || /^\d+(\.\d+)?(g|kg|ml|l|oz|lb)?$/.test(word)) continue
    const t = stem(word)
    if (!out.includes(t)) out.push(t)
  }
  return out
}

/**
 * Up to four substrings for SQL `LIKE '%…%'`, longest (most specific) first, written as they appear in food names:
 * "berry" → "berr" (so "berries" matches), "2pct" → "2%", "3p25pct" → "3.25%".
 */
export function likeStems(query: string[]): string[] {
  return [...query]
    .sort((a, b) => b.length - a.length)
    .slice(0, 4)
    .map((t) => {
      const pct = t.match(/^(\d+)(?:p(\d+))?pct$/)
      if (pct) return pct[2] ? `${pct[1]}.${pct[2]}%` : `${pct[1]}%`
      return t.length > 3 && t.endsWith('y') ? t.slice(0, -1) : t
    })
}

/**
 * The item probably names a product rather than a generic food: a brand-style capital after the first letter
 * ("Oikos Pro yogurt", "greek yogurt Oikos"), or ® / ™. Generic names are lower case ("banana", "white rice").
 */
export function looksBranded(name: string): boolean {
  return /[®™]/.test(name) || /[A-Z]/.test(name.trim().slice(1))
}

export interface Scorable {
  name: string
  brand: string | null
  source: FoodSource
}

/** CNF/USDA names that open with a category ("Fish, tuna, …", "Nuts, almonds, …"): the next word is the lead noun. */
const CATEGORY_LEAD = new Set(['fish', 'nut', 'grain', 'cereal', 'crustacean', 'mollusk', 'vegetable', 'beverage', 'spice'])
/** The food's lead noun: its first name token, or the second when the first is a category. */
const leadOf = (name: string[]) => (CATEGORY_LEAD.has(name[0]!) && name[1] ? name[1] : name[0]!)

/** Small source preference: Aaron's own foods first, then Canadian (CNF), then USDA, then Open Food Facts. */
const SOURCE_BONUS: Record<FoodSource, number> = { user: 0.1, cnf: 0.05, usda: 0.03, off: 0, llm: 0 }

export interface Ranked<T extends Scorable> {
  food: T
  score: number
}

/**
 * Score every food in a pool against the query tokens Q and sort best first. With N = a food's name tokens, B = its
 * brand tokens, and rarity(t) = 1 − (df(t) − 1) / (n − 1), the share of the other n − 1 foods in the pool whose name
 * lacks t (0.5 when the pool has one food):
 *   score = 0.60 × |Q ∩ (N ∪ B)| / |Q|              recall: how much of the item the food covers
 *         + 0.25 × (1 − mean rarity of N \ Q)        typicality: what else the name says is common among the
 *                                                   candidates ("chicken" among eggs) rather than unusual ("duck")
 *         + 0.10 × [lead noun ∈ Q]                  CNF/USDA lead with it: "Banana, raw", "Fish, tuna, …"
 *         + 0.15 if every brand token is in Q       brand hit
 *         − 0.20 if branded and the brand is not in Q  generic items prefer generic foods
 *         + 0.04 per default-form word in N (max 2) whole, raw, plain, regular
 *         − 0.12 if N has a processed/partial form word Q lacks (powder, flour, yolk, instant, …)
 *         + source bonus (user 0.10, cnf 0.05, usda 0.03, off 0) + the entry's own bonus (LLM-suggested candidates)
 * clamped to 0–1 and rounded to 0.001. It becomes meal_items.confidence.
 */
export function rank<T extends Scorable>(query: string[], pool: { food: T; bonus?: number }[]): Ranked<T>[] {
  const q = new Set(query)
  const names = pool.map((p) => tokens(p.food.name))
  const df = new Map<string, number>()
  for (const name of names) for (const t of name) df.set(t, (df.get(t) ?? 0) + 1)
  const n = pool.length
  const rarity = (t: string) => (n < 2 ? 0.5 : 1 - ((df.get(t) ?? 1) - 1) / (n - 1))

  return pool
    .map(({ food, bonus = 0 }, i) => {
      const name = names[i]!
      if (q.size === 0 || name.length === 0) return { food, score: 0 }
      const brand = food.brand ? tokens(food.brand) : []
      const covered = query.filter((t) => name.includes(t) || brand.includes(t)).length
      const extra = name.filter((t) => !q.has(t))
      const typical = extra.length === 0 ? 1 : 1 - extra.reduce((sum, t) => sum + rarity(t), 0) / extra.length
      let s = 0.6 * (covered / q.size) + 0.25 * typical + (q.has(leadOf(name)) ? 0.1 : 0)

      if (brand.length > 0 && brand.every((t) => q.has(t))) s += 0.15
      else if (brand.length > 0 || food.source === 'off') s -= 0.2
      s += 0.04 * Math.min(2, name.filter((t) => DEFAULT_FORM.has(t)).length)
      if (name.some((t) => UNLIKELY_FORM.has(t) && !q.has(t))) s -= 0.12
      s += SOURCE_BONUS[food.source] + bonus
      return { food, score: Math.max(0, Math.min(1, Math.round(s * 1000) / 1000)) }
    })
    .sort(byRank)
}

const SOURCE_ORDER: FoodSource[] = ['user', 'cnf', 'usda', 'off', 'llm']

/** Best first: higher score, then the preferred source, then the shorter (plainer) name. */
function byRank<T extends { score: number; food: Scorable }>(a: T, b: T): number {
  return (
    b.score - a.score ||
    SOURCE_ORDER.indexOf(a.food.source) - SOURCE_ORDER.indexOf(b.food.source) ||
    a.food.name.length - b.food.name.length
  )
}
