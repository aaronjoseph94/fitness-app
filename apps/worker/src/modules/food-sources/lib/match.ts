// Owns: how a meal item's name is compared with a food — normalised tokens, the FTS5 query for the local cache,
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

/** Stems that name the same thing: CNF says "prepared" where USDA says "cooked", "boiled" for steamed; spellings. */
const SYNONYM: Record<string, string> = { prepar: 'cook', steam: 'boil', yogourt: 'yogurt', flavor: 'flavour' }
const canon = (t: string) => SYNONYM[t] ?? t

/** Default forms: when the item does not say otherwise, "egg" means a whole egg and "banana" a raw one. */
const DEFAULT_FORM = new Set(['whole', 'raw', 'plain', 'regular'].map((w) => canon(stem(w))))
/** Processed or partial forms that are rarely what a plain item name means ("egg" is not dried egg or yolk). */
const UNLIKELY_FORM = new Set(
  [
    'dehydrated', 'powder', 'powdered', 'mix', 'concentrate', 'instant', 'flakes', 'flour', 'yolk', 'substitute',
    'imitation', 'meatless', 'babyfood', 'unprepared', 'dry', 'evaporated', 'condensed', 'undiluted',
  ].map((w) => canon(stem(w))),
)
/**
 * Qualifiers that make a different product or an unusual variety of the plain food: "milk" is not chocolate milk or
 * buttermilk, "oatmeal" is not an oatmeal cookie, "almonds" are not almond butter, "orange" is not orange juice,
 * "eggs" are not duck eggs. Penalised only when the item does not say them.
 */
const QUALIFIER = new Set(
  [
    'chocolate', 'cocoa', 'cookie', 'butter', 'buttermilk', 'flavour', 'flavor', 'cake', 'pie', 'bar', 'candy', 'candies',
    'sauce', 'soup', 'syrup', 'milkshake', 'shake', 'pudding', 'dessert', 'pastry', 'muffin', 'cracker', 'granola',
    'paste', 'spread', 'oil', 'meal', 'beverage', 'drink', 'smoothie', 'juice', 'nectar', 'jam', 'jelly', 'sweetened',
    'honey', 'salt', 'vanilla', 'strawberry', 'latte', 'whitener', 'creamer', 'peel', 'producer', 'goat', 'sheep',
    'human', 'buffalo', 'duck', 'goose', 'quail', 'turkey',
  ].map((w) => canon(stem(w))),
)

/**
 * Normalised tokens of a name, unique and in order: accents stripped, lower case, "2%" → "2pct", quantities
 * ("120", "120g") and STOP words dropped, each word stemmed and synonyms folded ("prepared" → "cook").
 */
export function tokens(text: string): string[] {
  const out: string[] = []
  for (const word of words(text)) {
    const t = canon(stem(word))
    if (!out.includes(t)) out.push(t)
  }
  return out
}

/** The meaningful words of a name, unstemmed: accents stripped, lower case, "2%" → "2pct", quantities and STOP dropped. */
function words(text: string): string[] {
  const s = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/(\d+(?:\.\d+)?)\s*%/g, (_, n: string) => ` ${n.replace('.', 'p')}pct `)
  return s.split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !STOP.has(w) && !/^\d+(\.\d+)?(g|kg|ml|l|oz|lb)?$/.test(w))
}

/** Words searched with their synonyms (the FTS index holds the words as written). */
const FTS_ALSO: Record<string, string[]> = { cook: ['cooked', 'prepared'], boil: ['boiled', 'steamed'], yogurt: ['yogourt'] }

/**
 * The FTS5 MATCH expression for the local cache (foods_fts uses the porter tokenizer, so "almonds", "cooked" and
 * "berries" find "almond", "cook", "berry"; "cookie" stays "cooki"). Up to six words, any of them (OR), and each of the
 * first two again as the name's first word (^"milk"), so bm25 ranks foods matching more words, and foods named after
 * the item ("Milk, …" before "Cheese, … with whole milk"), first. "2%" → the number 2. Null when nothing is left.
 */
export function ftsQuery(text: string): string | null {
  const terms = new Set<string>()
  for (const [i, w] of words(text).slice(0, 6).entries()) {
    const pct = w.match(/^(\d+)(?:p(\d+))?pct$/)
    const phrase = pct ? (pct[2] ? `"${pct[1]} ${pct[2]}"` : `"${pct[1]}"`) : `"${w}"`
    terms.add(phrase)
    if (i < 2 && !pct) terms.add(`name : ^${phrase}`)
    for (const also of FTS_ALSO[canon(stem(w))] ?? []) terms.add(`"${also}"`)
  }
  return terms.size ? [...terms].join(' OR ') : null
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
 *         − 0.12 if N has a processed/partial form word Q lacks (powder, flour, yolk, instant, dry, …)
 *         − 0.15 if N has a qualifier Q lacks (chocolate, cookie, butter, flavoured, juice, goat, …), − 0.05 more for a
 *                second one                    the plainest food wins: "milk" → milk, not chocolate milk
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
      const qualifiers = name.filter((t) => QUALIFIER.has(t) && !q.has(t)).length
      if (qualifiers > 0) s -= qualifiers > 1 ? 0.2 : 0.15
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
