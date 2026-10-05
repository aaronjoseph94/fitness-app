// Owns: the cheap text plumbing around model calls — Zod → JSON Schema (cached per isolate, so tools and job schemas
// are converted once), pulling a JSON value out of a model's text reply, and base64 for image bytes.
import * as z from 'zod'

const schemaCache = new WeakMap<z.ZodType, Record<string, unknown>>()

/** JSON Schema for what the model must write (the schema's input side), without the `$schema` key providers reject. */
export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  let out = schemaCache.get(schema)
  if (!out) {
    const { $schema: _drop, ...rest } = z.toJSONSchema(schema, {
      io: 'input',
      unrepresentable: 'any',
    }) as Record<string, unknown>
    out = rest
    schemaCache.set(schema, out)
  }
  return out
}

/**
 * Parse the JSON value in a model reply. Tolerates what free models add around it: a <think> block, ``` fences,
 * or a sentence before/after the object. Returns undefined when nothing parses.
 */
export function extractJson(text: string): unknown {
  let t = text.trim()
  const think = t.lastIndexOf('</think>')
  if (think !== -1) t = t.slice(think + 8).trim()
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t)
  if (fence) t = fence[1]!
  try {
    return JSON.parse(t)
  } catch {
    const start = t.search(/[[{]/)
    const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'))
    if (start === -1 || end <= start) return undefined
    try {
      return JSON.parse(t.slice(start, end + 1))
    } catch {
      return undefined
    }
  }
}

/** Base64 of image bytes; a string is taken as base64 already (a data: URL prefix is dropped). */
export function toBase64(data: ArrayBuffer | string): string {
  if (typeof data === 'string') {
    const comma = data.startsWith('data:') ? data.indexOf(',') : -1
    return comma === -1 ? data : data.slice(comma + 1)
  }
  const bytes = new Uint8Array(data)
  const native = (bytes as Uint8Array & { toBase64?: () => string }).toBase64
  if (typeof native === 'function') return native.call(bytes)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** Text appended to the system prompt when a provider cannot enforce the schema itself. */
export function schemaInstruction(schema: Record<string, unknown>): string {
  return `\n\nReply with only one JSON value (no prose, no code fences) that is valid against this JSON Schema:\n${JSON.stringify(schema)}`
}

/** The repair turn: the validation error goes back to the model, never the original prompt. */
export function repairInstruction(error: string): string {
  return `Your reply was not valid against the required JSON Schema:\n${error}\nReply again with only the corrected JSON value.`
}
