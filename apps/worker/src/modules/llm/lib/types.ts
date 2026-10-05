// Owns: the llm module's vocabulary — the provider-neutral conversation (Msg, ToolDef, ToolCall), the request and
// result shapes callers see, and the internal adapter seam (one Gemini adapter, one OpenAI-compatible adapter).
import type { JobType } from '@fitness/shared/schemas'
import type * as z from 'zod'
import type { ModelSpec, ProviderSpec } from './config'

/** User-facing work goes first and may use a provider's whole daily quota; background work stops at 80 %. */
export type Priority = 'user' | 'background'

/** A function call the model asked for. The caller runs the tool and replies with a `tool` message. */
export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

/**
 * A provider's own copy of an assistant turn, replayed verbatim to the same model on the next turn. Gemini 3 needs
 * this: its parts carry thought signatures that must come back unchanged. Treat it as opaque; store it with the turn.
 */
export interface NativeTurn {
  provider: string
  model: string
  content: unknown
}

export interface UserMsg {
  role: 'user'
  content: string
}
export interface AssistantMsg {
  role: 'assistant'
  content: string
  toolCalls?: ToolCall[]
  native?: NativeTurn
}
export interface ToolMsg {
  role: 'tool'
  toolCallId: string
  name: string
  /** The tool's result as JSON text (an object is best; anything else is wrapped as {result}). */
  content: string
}
/** One turn of a provider-neutral conversation. Any provider can continue a conversation another one started. */
export type Msg = UserMsg | AssistantMsg | ToolMsg

/**
 * A tool the model may call. `parameters` is a Zod schema (converted to JSON Schema once per isolate and cached) or
 * a JSON Schema already built elsewhere (the tools layer warms its own at isolate start-up).
 */
export interface ToolDef {
  name: string
  description: string
  parameters: z.ZodType | Record<string, unknown>
}

/** An image for a vision job: raw bytes or base64 (no data: prefix needed). Attached to the last user message. */
export interface ImageInput {
  mime: string
  data: ArrayBuffer | string
}

export interface ChatRequest<T = string> {
  /** The job kind, for the chain choice and logs. */
  job: JobType
  system: string
  messages: Msg[]
  /** Any image routes the call to the vision chain; text-only models are never tried. */
  images?: ImageInput[]
  /** Tools the model may call; only models with function calling are tried. */
  tools?: ToolDef[]
  /** When set, the reply must be JSON valid against it (one repair attempt per model, then failover). */
  schema?: z.ZodType<T>
  /** Output token cap (default 4,096). */
  maxTokens?: number
  priority: Priority
  /** Overall time for this call, all retries and failovers included (default 25,000 ms). */
  deadlineMs?: number
}

/** What happened on the call that succeeded. Token counts add up every attempt of this call. */
export interface CallMeta {
  provider: string
  model: string
  latency_ms: number
  tokens_in: number
  tokens_out: number
  /** HTTP calls made for this result, across retries, repairs and failovers. */
  attempts: number
}

export type ChatResult<T = string> = CallMeta & {
  /** The assistant turn to append to `messages` before the next chat() call. */
  message: AssistantMsg
} & ({ type: 'tool_calls'; toolCalls: ToolCall[] } | { type: 'reply'; data: T })

export type CompleteRequest<T> = Omit<ChatRequest<T>, 'tools' | 'schema'> & { schema: z.ZodType<T> }
export type CompleteResult<T> = CallMeta & { data: T }

// ── Internal adapter seam ──────────────────────────────────────────────────────────────────────────────────────

/** A request with images as base64 and every Zod schema already converted to JSON Schema. */
export interface PreparedCall {
  system: string
  messages: Msg[]
  images: { mime: string; base64: string }[]
  tools: { name: string; description: string; parameters: Record<string, unknown> }[]
  jsonSchema: Record<string, unknown> | null
  maxTokens: number
}

export interface WireRequest {
  url: string
  headers: Record<string, string>
  body: unknown
}

export type Finish = 'stop' | 'length' | 'tool_calls' | 'blocked' | 'other'

/** One model reply in neutral form. */
export interface ModelTurn {
  text: string
  toolCalls: ToolCall[]
  native?: NativeTurn
  finish: Finish
  tokensIn: number
  tokensOut: number
}

export interface Adapter {
  build(provider: ProviderSpec, spec: ModelSpec, key: string, call: PreparedCall): WireRequest
  /** Parse a 2xx JSON body. Throws AttemptFailure when the body is an error in disguise or unusable. */
  parse(spec: ModelSpec, body: unknown): ModelTurn
}
