// Owns: the name redaction at the edge where text leaves for a model the Worker doesn't control (SPEC §9 privacy: the
// LLM never sees the name). Descriptions and procedures may name the user for readers of the code; what a model reads
// says "the user" instead.

/** The one user's first name, as a whole word, with or without the possessive. */
const NAME = /\baaron('s)?\b/gi

/** Text as a model may read it: the user's name replaced. */
export function redactName(text: string): string {
  return text.replace(NAME, (_m, possessive: string | undefined) => (possessive ? "the user's" : 'the user'))
}

/** A JSON value with the name replaced in every string (keys included). */
export function redactNameDeep<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(redactName(JSON.stringify(value))) as T)
}
