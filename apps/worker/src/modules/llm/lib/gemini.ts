// Owns: the Gemini REST adapter (models/{model}:generateContent) — systemInstruction, inline image parts,
// responseMimeType + responseJsonSchema, functionDeclarations with parametersJsonSchema, and thought signatures:
// a turn this model produced is replayed verbatim from `native`; a turn from another provider gets the documented
// dummy signature so Gemini 3 accepts the function call history.
import type { ModelSpec, ProviderSpec } from './config'
import { AttemptFailure } from './errors'
import type { Adapter, Finish, Msg, ModelTurn, PreparedCall, ToolCall, WireRequest } from './types'

/** Google's documented value for function calls Gemini 3 did not produce (another model's turn). */
const FOREIGN_SIGNATURE = 'skip_thought_signature_validator'

type Part = Record<string, unknown>
interface Content {
  role: 'user' | 'model'
  parts: Part[]
}

function toolResponse(content: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(content)
    return v !== null && typeof v === 'object' && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : { result: v }
  } catch {
    return { result: content }
  }
}

function contents(spec: ModelSpec, call: PreparedCall): Content[] {
  const out: Content[] = []
  const lastUser = call.messages.findLastIndex((m) => m.role === 'user')
  call.messages.forEach((m: Msg, i) => {
    if (m.role === 'user') {
      const parts: Part[] =
        i === lastUser
          ? call.images.map((img) => ({ inlineData: { mimeType: img.mime, data: img.base64 } }))
          : []
      parts.push({ text: m.content })
      out.push({ role: 'user', parts })
    } else if (m.role === 'assistant') {
      if (m.native?.provider === 'gemini' && m.native.model === spec.model) {
        out.push(m.native.content as Content)
        return
      }
      const parts: Part[] = m.content ? [{ text: m.content }] : []
      ;(m.toolCalls ?? []).forEach((c, n) =>
        parts.push({
          functionCall: { id: c.id, name: c.name, args: c.args },
          ...(n === 0 ? { thoughtSignature: FOREIGN_SIGNATURE } : {}),
        }),
      )
      out.push({ role: 'model', parts: parts.length ? parts : [{ text: '' }] })
    } else {
      const part = { functionResponse: { id: m.toolCallId, name: m.name, response: toolResponse(m.content) } }
      const prev = out.at(-1)
      // All responses to one model turn travel together in a single user turn.
      if (prev?.role === 'user' && prev.parts.every((p) => 'functionResponse' in p)) prev.parts.push(part)
      else out.push({ role: 'user', parts: [part] })
    }
  })
  if (lastUser === -1 && call.images.length)
    out.push({
      role: 'user',
      parts: call.images.map((img) => ({ inlineData: { mimeType: img.mime, data: img.base64 } })),
    })
  return out
}

function finishOf(reason: unknown, hasCalls: boolean): Finish {
  if (hasCalls) return 'tool_calls'
  switch (reason) {
    case 'STOP':
      return 'stop'
    case 'MAX_TOKENS':
      return 'length'
    case 'SAFETY':
    case 'PROHIBITED_CONTENT':
    case 'BLOCKLIST':
    case 'SPII':
    case 'RECITATION':
    case 'IMAGE_SAFETY':
      return 'blocked'
    default:
      return 'other'
  }
}

export const geminiAdapter: Adapter = {
  build(provider: ProviderSpec, spec: ModelSpec, key: string, call: PreparedCall): WireRequest {
    const generationConfig: Record<string, unknown> = { maxOutputTokens: call.maxTokens, ...spec.params }
    if (call.jsonSchema) {
      generationConfig.responseMimeType = 'application/json'
      generationConfig.responseJsonSchema = call.jsonSchema
    }
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: call.system }] },
      contents: contents(spec, call),
      generationConfig,
    }
    if (call.tools.length)
      body.tools = [
        {
          functionDeclarations: call.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parametersJsonSchema: t.parameters,
          })),
        },
      ]
    return {
      url: `${provider.base_url}/models/${encodeURIComponent(spec.model)}:generateContent`,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key, ...provider.headers },
      body,
    }
  },

  parse(spec: ModelSpec, body: unknown): ModelTurn {
    const b = body as {
      candidates?: { content?: Content; finishReason?: string }[]
      promptFeedback?: { blockReason?: string }
      usageMetadata?: {
        promptTokenCount?: number
        candidatesTokenCount?: number
        thoughtsTokenCount?: number
      }
    }
    const usage = b.usageMetadata ?? {}
    const tokensIn = usage.promptTokenCount ?? 0
    const tokensOut = (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0)
    const cand = b.candidates?.[0]
    if (!cand) {
      if (b.promptFeedback?.blockReason)
        return { text: '', toolCalls: [], finish: 'blocked', tokensIn, tokensOut }
      throw new AttemptFailure('server', 200, undefined, 'NO_CANDIDATE')
    }
    const parts = cand.content?.parts ?? []
    let text = ''
    const toolCalls: ToolCall[] = []
    for (const p of parts) {
      if (typeof p.text === 'string' && p.thought !== true) text += p.text
      const fc = p.functionCall as { id?: string; name?: string; args?: Record<string, unknown> } | undefined
      if (fc?.name)
        toolCalls.push({ id: fc.id ?? `${fc.name}_${toolCalls.length}`, name: fc.name, args: fc.args ?? {} })
    }
    return {
      text,
      toolCalls,
      native: cand.content ? { provider: 'gemini', model: spec.model, content: cand.content } : undefined,
      finish: finishOf(cand.finishReason, toolCalls.length > 0),
      tokensIn,
      tokensOut,
    }
  },
}
