// Owns: the Anthropic Messages API adapter (POST {base_url}/messages) — x-api-key + anthropic-version headers, a
// string system prompt, base64 image blocks, tools as input_schema, tool_result blocks grouped into one user turn,
// and the native replay: a turn this model produced goes back verbatim (thinking blocks included) on the next call.
// JSON is prompt-mode only, whatever the model's `json` says: Anthropic's native structured outputs reject the
// schema keywords Zod emits (minimum, maximum, minLength…), and prompt mode is what extractJson and the router's
// repair turn already handle. Never sends `thinking` or `tool_choice`: Opus 5.5 rejects disabled thinking and a
// forced tool choice, so the effort level comes from the model's `params` (output_config.effort).
import type { ModelSpec, ProviderSpec } from './config'
import { AttemptFailure } from './errors'
import { schemaInstruction } from './json'
import type { Adapter, Finish, Msg, ModelTurn, PreparedCall, ToolCall, WireRequest } from './types'

type Block = Record<string, unknown>
interface Content {
  role: 'user' | 'assistant'
  content: Block[]
}

function messages(spec: ModelSpec, call: PreparedCall): Content[] {
  const out: Content[] = []
  const lastUser = call.messages.findLastIndex((m) => m.role === 'user')
  call.messages.forEach((m: Msg, i) => {
    if (m.role === 'user') {
      const blocks: Block[] =
        i === lastUser
          ? call.images.map((img) => ({
              type: 'image',
              source: { type: 'base64', media_type: img.mime, data: img.base64 },
            }))
          : []
      // Anthropic rejects an empty text block, so one is only ever added when it has text or stands alone.
      if (m.content || !blocks.length) blocks.push({ type: 'text', text: m.content || '(no text)' })
      out.push({ role: 'user', content: blocks })
    } else if (m.role === 'assistant') {
      if (m.native?.provider === 'anthropic' && m.native.model === spec.model) {
        out.push({ role: 'assistant', content: m.native.content as Block[] })
        return
      }
      const blocks: Block[] = m.content ? [{ type: 'text', text: m.content }] : []
      for (const c of m.toolCalls ?? [])
        blocks.push({ type: 'tool_use', id: c.id, name: c.name, input: c.args })
      out.push({ role: 'assistant', content: blocks.length ? blocks : [{ type: 'text', text: '(no text)' }] })
    } else {
      const block: Block = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content }
      const prev = out.at(-1)
      // Every tool_result for one assistant turn must travel together in the next user message.
      if (prev?.role === 'user' && prev.content.every((b) => b.type === 'tool_result'))
        prev.content.push(block)
      else out.push({ role: 'user', content: [block] })
    }
  })
  if (out[0]?.role !== 'user') out.unshift({ role: 'user', content: [{ type: 'text', text: '(continued)' }] })
  return out
}

function finishOf(reason: unknown, hasCalls: boolean): Finish {
  if (hasCalls || reason === 'tool_use') return 'tool_calls'
  switch (reason) {
    case 'end_turn':
      return 'stop'
    case 'max_tokens':
      return 'length'
    case 'refusal':
      return 'blocked'
    default:
      return 'other'
  }
}

export const anthropicAdapter: Adapter = {
  build(provider: ProviderSpec, spec: ModelSpec, key: string, call: PreparedCall): WireRequest {
    const body: Record<string, unknown> = {
      model: spec.model,
      max_tokens: call.maxTokens,
      system: call.jsonSchema ? call.system + schemaInstruction(call.jsonSchema) : call.system,
      messages: messages(spec, call),
      ...(call.tools.length
        ? {
            tools: call.tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.parameters,
            })),
          }
        : {}),
      ...spec.params,
    }
    return {
      url: `${provider.base_url}/messages`,
      headers: { 'content-type': 'application/json', 'x-api-key': key, ...provider.headers },
      body,
    }
  },

  parse(spec: ModelSpec, body: unknown): ModelTurn {
    const b = body as {
      type?: string
      error?: { type?: unknown; message?: unknown }
      content?: Block[]
      stop_reason?: string
      usage?: {
        input_tokens?: number
        output_tokens?: number
        cache_creation_input_tokens?: number
        cache_read_input_tokens?: number
      }
    }
    // An error body on a 2xx (transport maps real non-2xx statuses, reading `error.type` as the code).
    if (b.type === 'error')
      throw new AttemptFailure(
        'server',
        200,
        undefined,
        typeof b.error?.type === 'string' ? b.error.type : 'error',
      )
    if (!Array.isArray(b.content)) throw new AttemptFailure('server', 200, undefined, 'NO_CONTENT')
    let text = ''
    const toolCalls: ToolCall[] = []
    for (const block of b.content) {
      if (block.type === 'text' && typeof block.text === 'string') text += block.text
      else if (block.type === 'tool_use') {
        const name = block.name
        const input = block.input
        if (typeof name !== 'string' || input === null || typeof input !== 'object' || Array.isArray(input))
          throw new AttemptFailure('invalid_output', 200, undefined, 'BAD_TOOL_CALL')
        toolCalls.push({
          id: typeof block.id === 'string' ? block.id : `${name}_${toolCalls.length}`,
          name,
          args: input as Record<string, unknown>,
        })
      }
    }
    const usage = b.usage ?? {}
    return {
      text,
      toolCalls,
      native: { provider: 'anthropic', model: spec.model, content: b.content },
      finish: finishOf(b.stop_reason, toolCalls.length > 0),
      tokensIn:
        (usage.input_tokens ?? 0) +
        (usage.cache_creation_input_tokens ?? 0) +
        (usage.cache_read_input_tokens ?? 0),
      tokensOut: usage.output_tokens ?? 0,
    }
  },
}
