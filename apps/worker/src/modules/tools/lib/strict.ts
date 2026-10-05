// Owns: finding the arguments a tool does not take — keys of an input that its input JSON Schema does not name, at any
// depth (object `properties`, array `items`, and the matching branch of an anyOf/oneOf union). Zod objects strip
// unknown keys silently, so without this a misspelled optional argument (`dat` for `date`, REST's `logged_at` for
// log_water's `at`, `week_day` for `weekday`) would run the tool with its default instead: today's weigh-in replaced,
// a Saturday kcal change applied to every day. Records and loose objects (additionalProperties) take any key.
type Schema = Record<string, unknown>

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The schema's union members (anyOf / oneOf, flattened), or the schema itself when it is not a union. */
function members(schema: Schema): Schema[] {
  const list = [schema.anyOf, schema.oneOf].find(Array.isArray) as unknown[] | undefined
  return list ? list.filter(isObject).flatMap(members) : [schema]
}

/** An object member `value` could be: every required key present and every `const` property equal. */
function fits(member: Schema, value: Record<string, unknown>): boolean {
  if (!isObject(member.properties)) return false
  const required = Array.isArray(member.required) ? (member.required as string[]) : []
  if (!required.every((k) => k in value)) return false
  return Object.entries(member.properties).every(([k, p]) => !isObject(p) || !('const' in p) || !(k in value) || value[k] === p.const)
}

/**
 * Paths of keys in `value` that `schema` does not name, e.g. ["dat", "changes[0].week_day"]. Empty when every key is
 * known, and when no union member fits (Zod then reports the real problem).
 */
export function unknownKeys(schema: Schema, value: unknown, path = ''): string[] {
  const options = members(schema)
  if (Array.isArray(value)) {
    const items = options.map((m) => m.items).find(isObject)
    return items ? value.flatMap((v, i) => unknownKeys(items, v, `${path}[${i}]`)) : []
  }
  if (!isObject(value)) return []
  if (options.some((m) => m.additionalProperties !== undefined && m.additionalProperties !== false)) return []
  const objects = options.filter((m) => isObject(m.properties))
  const fitting = objects.length > 1 ? objects.filter((m) => fits(m, value)) : objects
  if (fitting.length === 0) return []
  return Object.keys(value).flatMap((key) => {
    const at = path ? `${path}.${key}` : key
    const property = fitting.map((m) => (m.properties as Schema)[key]).find(isObject)
    return property ? unknownKeys(property, value[key], at) : [at]
  })
}
