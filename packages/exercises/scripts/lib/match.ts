// Owns: the deterministic media matcher — free-exercise-db exercise → best ExerciseDB GIF by normalised name,
// equipment agreement and target-muscle agreement. Pure: same inputs, same map (ties break on ExerciseDB id).
//
// score = 0.6 · tokenSort(a, b) + 0.4 · tokenSet(a, b)
//         − 20 · [equipment disagrees] − 10 · [both name a movement, none shared] − 8 · [no target muscle in common]
//         − 6 · [both name a body position, none shared] − 4 · |variant modifiers on one side only|
//   a, b      = names after parseName(): lower-case, synonyms folded, plurals stemmed, equipment words and stop words dropped
//   ratio     = 100 · 2·LCS(x, y) / (|x| + |y|)  (character indel similarity, as rapidfuzz's fuzz.ratio)
//   tokenSort = ratio(sorted tokens of a, sorted tokens of b)
//   tokenSet  = 100 when one token set contains the other, else max of the three ratios over intersection ∪ differences
//   equipment = free-exercise-db: its equipment field narrowed by equipment words in its name ('Smith Machine …' → smith
//               only; words that contradict the field, as in 'Deadlift with Bands', widen it instead; only the words when
//               the field is null/'other'; anything when neither says). ExerciseDB: the words in its name, else its
//               equipment field (its names are canonical, its field is sometimes wrong). Agree = the sets intersect.
//   movement  = press, curl, row, raise, … (MOVEMENTS); position = standing, seated, lying; modifiers = incline, reverse,
//               one-arm, close/wide grip, palms up/down, sumo, … (MODIFIERS)
// Each ExerciseDB entry is scored on its name and every alias; the best wins. An equipment mismatch can never reach 85.
// Only matches with score ≥ minScore are kept.

/** One entry of data/exercisedb-index.json (ExerciseDB v1 ids whose GIF resolves, with legacy-name aliases). */
export type ExerciseDbEntry = {
  id: string
  name: string
  aliases: readonly string[]
  equipment: readonly string[]
  target: readonly string[]
}

/** The free-exercise-db fields the matcher reads (a raw record from data/free-exercise-db.json fits). */
export type MatchableExercise = {
  id: string
  name: string
  equipment: string | null
  primaryMuscles: readonly string[]
}

/** One row of data/media-map.json, keyed by free-exercise-db id. */
export type MediaMatch = {
  source: 'exercisedb'
  source_id: string
  /** The ExerciseDB name that matched (for reviewing the committed map). */
  matched_name: string
  url: string
  /** 0–100, one decimal. */
  score: number
}
export type MediaMap = Record<string, MediaMatch>

export const MIN_SCORE = 85
const exerciseDbGifUrl = (id: string) => `https://static.exercisedb.dev/media/${id}.gif`

/** Best ExerciseDB GIF per exercise, for matches scoring ≥ minScore. Keys keep the input order. */
export function matchMedia(
  exercises: readonly MatchableExercise[],
  index: readonly ExerciseDbEntry[],
  minScore = MIN_SCORE,
): MediaMap {
  const candidates = index.map(prepareCandidate)
  const map: MediaMap = {}
  for (const exercise of exercises) {
    const best = bestMatch(exercise, candidates)
    if (best && best.score >= minScore) {
      map[exercise.id] = {
        source: 'exercisedb',
        source_id: best.entry.id,
        matched_name: best.name,
        url: exerciseDbGifUrl(best.entry.id),
        score: Math.round(best.score * 10) / 10,
      }
    }
  }
  return map
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

type ParsedName = {
  raw: string
  tokens: string[]
  movements: Set<string>
  positions: Set<string>
  modifiers: Set<string>
  equipment: Set<string>
}
type Candidate = { entry: ExerciseDbEntry; names: ParsedName[] }
type Best = { entry: ExerciseDbEntry; name: string; score: number }

function prepareCandidate(entry: ExerciseDbEntry): Candidate {
  const field = new Set(entry.equipment.map((e) => e.toLowerCase()))
  const names = [entry.name, ...entry.aliases].map((raw) => {
    const parsed = parseName(raw)
    return parsed.equipment.size > 0 ? parsed : { ...parsed, equipment: field }
  })
  return { entry, names }
}

/** The ExerciseDB equipment values this exercise agrees with; null = anything. */
function exerciseEquipment(exercise: MatchableExercise, fromName: Set<string>): Set<string> | null {
  const field = exercise.equipment ? EQUIPMENT[exercise.equipment] : undefined
  if (!field) return fromName.size > 0 ? fromName : null
  // A plain 'machine' exercise is a selectorised or plate-loaded machine, not the Smith machine.
  if (fromName.size === 0) return new Set(field.filter((e) => e !== 'smith machine'))
  const narrowed = field.filter((e) => fromName.has(e))
  return new Set(narrowed.length > 0 ? narrowed : [...field, ...fromName])
}

function bestMatch(exercise: MatchableExercise, candidates: readonly Candidate[]): Best | null {
  // free-exercise-db's 'sled' is the push/drag sled (equipment 'other'); ExerciseDB's is the plate-loaded sled machine.
  const name = parseName(exercise.name.replace(/\bsled\b/gi, 'prowler'))
  if (name.tokens.length === 0) return null
  const tokenSet = new Set(name.tokens)
  const equipment = exerciseEquipment(exercise, name.equipment)
  const targets = new Set(exercise.primaryMuscles.flatMap((m) => MUSCLES[m] ?? []))

  let best: Best | null = null
  for (const c of candidates) {
    const musclesOk = c.entry.target.some((t) => targets.has(t))
    for (const other of c.names) {
      // Cheap gate: no shared token means no plausible match (keeps the full run to a few seconds).
      if (!other.tokens.some((t) => tokenSet.has(t))) continue
      const equipmentOk = !equipment || [...other.equipment].some((e) => equipment.has(e))
      const score =
        0.6 * tokenSortRatio(name.tokens, other.tokens) +
        0.4 * tokenSetRatio(name.tokens, other.tokens) -
        (equipmentOk ? 0 : 20) -
        (conflicts(name.movements, other.movements) ? 10 : 0) -
        (musclesOk ? 0 : 8) -
        (conflicts(name.positions, other.positions) ? 6 : 0) -
        4 * symmetricDifference(name.modifiers, other.modifiers)
      if (!best || score > best.score || (score === best.score && c.entry.id < best.entry.id)) {
        best = { entry: c.entry, name: other.raw, score }
      }
    }
  }
  return best
}

/** Both sides say something and they share nothing. */
const conflicts = (a: Set<string>, b: Set<string>) =>
  a.size > 0 && b.size > 0 && ![...a].some((x) => b.has(x))

const symmetricDifference = (a: Set<string>, b: Set<string>) =>
  [...a].filter((x) => !b.has(x)).length + [...b].filter((x) => !a.has(x)).length

/** 100 · 2·LCS / (|a| + |b|). */
function ratio(a: string, b: string): number {
  if (a.length + b.length === 0) return 100
  let prev = new Array<number>(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i++) {
    const row = new Array<number>(b.length + 1).fill(0)
    for (let j = 1; j <= b.length; j++) {
      row[j] = a[i - 1] === b[j - 1] ? prev[j - 1]! + 1 : Math.max(prev[j]!, row[j - 1]!)
    }
    prev = row
  }
  return (200 * prev[b.length]!) / (a.length + b.length)
}

const tokenSortRatio = (a: readonly string[], b: readonly string[]) =>
  ratio([...a].sort().join(' '), [...b].sort().join(' '))

function tokenSetRatio(a: readonly string[], b: readonly string[]): number {
  const sa = new Set(a)
  const sb = new Set(b)
  const common = [...sa].filter((t) => sb.has(t)).sort()
  const onlyA = [...sa].filter((t) => !sb.has(t)).sort()
  const onlyB = [...sb].filter((t) => !sa.has(t)).sort()
  if (common.length > 0 && (onlyA.length === 0 || onlyB.length === 0)) return 100
  const sect = common.join(' ')
  const withA = [sect, ...onlyA].filter(Boolean).join(' ')
  const withB = [sect, ...onlyB].filter(Boolean).join(' ')
  return Math.max(ratio(sect, withA), ratio(sect, withB), ratio(withA, withB))
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/** Phrase-level rewrites, applied in order to the lower-cased, punctuation-free name. */
const SYNONYMS: readonly [RegExp, string][] = [
  [/\bpull ?ups?\b/g, 'pullup'],
  [/\bchin ?ups?\b/g, 'chinup'],
  [/\bpush ?ups?\b/g, 'pushup'],
  [/\bsit ?ups?\b/g, 'situp'],
  [/\bstep ?ups?\b/g, 'stepup'],
  [/\bpull ?downs?\b/g, 'pulldown'],
  [/\bpush ?downs?\b/g, 'pushdown'],
  [/\bcross ?overs?\b/g, 'crossover'],
  [/\bkick ?backs?\b/g, 'kickback'],
  [/\bflye?s?\b|\bflies\b/g, 'fly'],
  [/\bdb\b/g, 'dumbbell'],
  [/\bbb\b/g, 'barbell'],
  [/\be ?z (curl )?bar(bell)?\b/g, 'ezbar'],
  [/\bez\b/g, 'ezbar'],
  [/\bleverage\b/g, 'lever'],
  [/\bcalves\b/g, 'calf'],
  [/\b(single|one) (arm|hand)(ed)?\b/g, 'onearm'],
  [/\b(single|one) leg(ged)?\b/g, 'oneleg'],
  [/\balternat(e|ing)\b/g, 'alternate'],
  [/\bpalms? up\b/g, 'palmsup'],
  [/\bpalms? down\b/g, 'palmsdown'],
  [/\bmedium grip\b/g, ''], // free-exercise-db's default grip; ExerciseDB leaves it unsaid
  [/\b(v|version) \d\b/g, ''],
  [/\btwo (arm|dumbbell|kettlebell)s?\b/g, ''],
  [/\bbent over (.*\b)?rows?\b/g, '$1row'], // a row is bent over unless it says otherwise
  [/\b(tri|bi)ceps?\b/g, ''], // the muscle is checked through target muscles instead
  [/\b(lat|lats) pulldown\b/g, 'pulldown'],
]

/** Equipment words in a name → the ExerciseDB equipment values they mean. 'smith' wins over 'machine'. */
const NAME_EQUIPMENT: Readonly<Record<string, readonly string[]>> = {
  barbell: ['barbell', 'olympic barbell', 'trap bar'],
  ezbar: ['ez bar'],
  dumbbell: ['dumbbell'],
  cable: ['cable', 'rope'],
  kettlebell: ['kettlebell'],
  band: ['resistance band'],
  smith: ['smith machine'],
  sled: ['sled machine'],
  machine: ['leverage machine', 'sled machine'],
  lever: ['leverage machine', 'sled machine'],
}

/** Stop words and the words of NAME_EQUIPMENT (compared as equipment instead), dropped from name tokens. */
const DROPPED_WORDS = new Set([
  ...Object.keys(NAME_EQUIPMENT),
  'resistance',
  'with',
  'the',
  'on',
  'and',
  'a',
  'to',
  'of',
  'in',
  'for',
  'variation',
  'attachment',
])

/** Words that make a different variant of a movement (present on one side only → −4 each). Body position
 *  (standing, seated, lying) is left out: both sources often leave the default position unsaid. */
const MODIFIERS = new Set([
  'incline',
  'decline',
  'reverse',
  'onearm',
  'oneleg',
  'close',
  'wide',
  'kneeling',
  'alternate',
  'hammer',
  'preacher',
  'front',
  'rear',
  'behind',
  'overhead',
  'lateral',
  'sumo',
  'romanian',
  'stiff',
  'pistol',
  'jump',
  'split',
  'neutral',
  'underhand',
  'palmsup',
  'palmsdown',
])

/** The movement a name describes; two names that each state one and share none are different exercises. */
const MOVEMENTS = new Set([
  'press',
  'raise',
  'curl',
  'row',
  'fly',
  'squat',
  'deadlift',
  'lunge',
  'extension',
  'pulldown',
  'pushdown',
  'crunch',
  'shrug',
  'pullover',
  'kickback',
  'dip',
  'pushup',
  'pullup',
  'chinup',
  'situp',
  'bridge',
  'thrust',
  'swing',
  'snatch',
  'clean',
  'jerk',
  'twist',
  'stretch',
  'rollout',
  'stepup',
])

const POSITIONS = new Set(['standing', 'seated', 'lying'])

/** Plural → singular, applied per token to both sides ('curls' → 'curl', 'presses' → 'press'). */
function stem(token: string): string {
  if (token.length <= 3 || !token.endsWith('s') || token.endsWith('ss') || token.endsWith('us')) return token
  if (token.endsWith('sses') || token.endsWith('shes') || token.endsWith('ches')) return token.slice(0, -2)
  return token.slice(0, -1)
}

/** 'Barbell Bench Press - Medium Grip' → tokens ['bench', 'press'], equipment {barbell, olympic barbell, trap bar}. */
function parseName(raw: string): ParsedName {
  let s = raw
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
  for (const [pattern, replacement] of SYNONYMS) s = s.replace(pattern, replacement)
  const words = s.split(' ').filter(Boolean).map(stem)
  const equipmentWords = words.filter((w) => NAME_EQUIPMENT[w])
  const named = equipmentWords.includes('smith') ? ['smith'] : equipmentWords
  const tokens = words.filter((w) => !DROPPED_WORDS.has(w))
  return {
    raw,
    tokens,
    movements: new Set(tokens.filter((t) => MOVEMENTS.has(t))),
    positions: new Set(tokens.filter((t) => POSITIONS.has(t))),
    modifiers: new Set(tokens.filter((t) => MODIFIERS.has(t))),
    equipment: new Set(named.flatMap((w) => NAME_EQUIPMENT[w] ?? [])),
  }
}

/** free-exercise-db equipment → the ExerciseDB equipment values (lower-cased) that agree with it. 'other'/null agree with all. */
const EQUIPMENT: Readonly<Record<string, readonly string[]>> = {
  barbell: ['barbell', 'olympic barbell', 'trap bar', 'ez bar'],
  dumbbell: ['dumbbell'],
  cable: ['cable', 'rope'],
  machine: [
    'leverage machine',
    'smith machine', // only when the name says so (exerciseEquipment)
    'sled machine',
    'assisted',
    'stationary bike',
    'elliptical machine',
    'stepmill machine',
    'upper body ergometer',
    'ski ergometer',
  ],
  kettlebells: ['kettlebell'],
  bands: ['resistance band'],
  'e-z curl bar': ['ez bar'],
  'medicine ball': ['medicine ball'],
  'exercise ball': ['stability ball', 'bosu ball'],
  'body only': ['bodyweight', 'assisted', 'weighted'],
  'foam roll': ['roller'],
}

/** free-exercise-db muscle key → ExerciseDB target muscles that count as agreeing. */
const MUSCLES: Readonly<Record<string, readonly string[]>> = {
  abdominals: ['abdominals'],
  chest: ['pectorals', 'serratus anterior'],
  shoulders: ['deltoids'],
  lats: ['latissimus dorsi', 'upper back'],
  'middle back': ['upper back', 'latissimus dorsi', 'trapezius'],
  'lower back': ['erector spinae'],
  traps: ['trapezius', 'upper back'],
  quadriceps: ['quadriceps', 'glutes'],
  hamstrings: ['hamstrings', 'glutes'],
  glutes: ['glutes', 'hamstrings', 'quadriceps'],
  calves: ['calves'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  forearms: ['forearms', 'biceps'],
  abductors: ['abductors', 'glutes'],
  adductors: ['adductors'],
  neck: ['levator scapulae', 'trapezius'],
}
