// Owns: the one OpenAI-compatible chat/completions adapter used for Z.ai, OpenRouter and Groq — image_url data
// URLs, function tools, and JSON by the model's mode: response_format json_schema, json_object (+ schema in the
// system prompt), or prompt only (Z.ai vision models reject response_format).
import type { ModelSpec, ProviderSpec } from './config'
import { AttemptFailure } from './errors'
import { schemaInstruction } from './json'
import type { Adapter, Finish, ModelTurn, PreparedCall, ToolCall, WireRequest } from './types'

type WireMsg = Record<string, unknown>

function messages(call: PreparedCall, system: string): WireMsg[] {
  const out: WireMsg[] = [{ role: 'system', content: system }]
  const lastUser = call.messages.findLastIndex((m) => m.role === 'user')
  call.messages.forEach((m, i) => {
    if (m.role === 'user') {
      out.push(
        i === lastUser && call.images.length
          ? {
              role: 'user',
              content: [
                ...call.images.map((img) => ({
                  type: 'image_url',
                  image_url: { url: `data:${img.mime};base64,${img.base64}` },
                })),
                { type: 'text', text: m.content },
              ],
            }
          : { role: 'user', content: m.content },
      )
    } else if (m.role === 'assistant') {
      const calls = m.toolCalls ?? []
      out.push({
        role: 'assistant',
        content: calls.length && !m.content ? null : m.content,
        ...(calls.length
          ? {
              tool_calls: calls.map((c) => ({
                id: c.id,
                type: 'function',
                function: { name: c.name, arguments: JSON.stringify(c.args) },
              })),
            }
          : {}),
      })
    } else {
      out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content })
    }
  })
  return out
}

function finishOf(reason: unknown, hasCalls: boolean): Finish {
  if (hasCalls || reason === 'tool_calls') return 'tool_calls'
  if (reason === 'stop') return 'stop'
  if (reason === 'length' || reason === 'model_context_window_exceeded') return 'length'
  if (reason === 'content_filter' || reason === 'sensitive') return 'blocked'
  return 'other'
}

/** Some gateways (OpenRouter) report upstream failures as HTTP 200 with an `error` body. */
function upstreamFailure(error: { code?: unknown; type?: unknown }): AttemptFailure {
  const code = typeof error.code === 'number' ? error.code : Number(error.code)
  const label = typeof error.type === 'string' ? error.type : undefined
  if (code === 429) return new AttemptFailure('rate_limited', 429, undefined, label)
  if (code === 408) return new AttemptFailure('timeout', 408, undefined, label)
  if (code >= 500 || !Number.isFinite(code))
    return new AttemptFailure('server', Number.isFinite(code) ? code : 502, undefined, label)
  return new AttemptFailure('client', code, undefined, label)
}

export const openaiAdapter: Adapter = {
  build(provider: ProviderSpec, spec: ModelSpec, key: string, call: PreparedCall): WireRequest {
    const schema = call.jsonSchema
    const inPrompt =
      schema && (spec.json === 'json_object' || spec.json === 'prompt' || spec.json === 'native')
    const body: Record<string, unknown> = {
      model: spec.model,
      messages: messages(call, inPrompt ? call.system + schemaInstruction(schema) : call.system),
      // `max_tokens`, or `max_completion_tokens` where the provider's reasoning models reject the old name (data).
      [provider.max_tokens_param]: call.maxTokens,
      ...spec.params,
    }
    if (schema && spec.json === 'json_schema')
      body.response_format = { type: 'json_schema', json_schema: { name: 'output', schema, strict: false } }
    else if (schema && spec.json === 'json_object') body.response_format = { type: 'json_object' }
    if (call.tools.length)
      body.tools = call.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }))
    return {
      url: `${provider.base_url}/chat/completions`,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, ...provider.headers },
      body,
    }
  },

  parse(_spec: ModelSpec, body: unknown): ModelTurn {
    const b = body as {
      error?: { code?: unknown; type?: unknown }
      choices?: {
        message?: {
          content?: unknown
          tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[]
        }
        finish_reason?: string
      }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    const choice = b.choices?.[0]
    if (!choice?.message)
      throw b.error ? upstreamFailure(b.error) : new AttemptFailure('server', 200, undefined, 'NO_CHOICE')
    const msg = choice.message
    const text =
      typeof msg.content === 'string'
        ? msg.content
        : Array.isArray(msg.content)
          ? msg.content.map((p: { text?: unknown }) => (typeof p.text === 'string' ? p.text : '')).join('')
          : ''
    const toolCalls: ToolCall[] = (msg.tool_calls ?? []).map((tc, i) => {
      const name = tc.function?.name
      let args: unknown = {}
      try {
        args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {}
      } catch {
        args = undefined
      }
      if (!name || args === null || typeof args !== 'object' || Array.isArray(args))
        throw new AttemptFailure('invalid_output', 200, undefined, 'BAD_TOOL_CALL')
      return { id: tc.id ?? `${name}_${i}`, name, args: args as Record<string, unknown> }
    })
    return {
      text,
      toolCalls,
      finish: finishOf(choice.finish_reason, toolCalls.length > 0),
      tokensIn: b.usage?.prompt_tokens ?? 0,
      tokensOut: b.usage?.completion_tokens ?? 0,
    }
  },
}
