// Owns: the LLM router's interface (the Router in GLOSSARY.md). One call goes down a chain of free-tier providers
// (text: Gemini Flash → GLM → OpenRouter :free → Groq; vision: Gemini Flash → GLM-4.6V-Flash) and returns data
// validated against the caller's Zod schema, or the tool calls the model asked for.
//
// Interface facts callers rely on:
// - complete() resolves only with schema-valid data. chat() also returns tool calls; the caller runs the tools,
//   appends `result.message` and one `tool` message per call, and calls chat() again (any provider can continue).
// - Errors: DeadlineError (overall deadline, default 25 s) and BudgetError (external fetch budget, default 40 per
//   router) mean "requeue the job"; ProvidersExhaustedError lists why each model was skipped or failed
//   (`quotaOnly`: retry after the quota day resets).
// - Background calls stop at 80 % of a provider's daily quota (provider_usage); user calls may use all of it.
// - Limits, model ids and chains are data in ./providers.json. Providers without a key in env are skipped.
// - Create one router per invocation (the fetch budget is per router unless you pass a shared `budget`).
import type { Deps } from '../../lib/deps'
import { createRouter, type RouterOptions } from './lib/router'
import type { ChatRequest, ChatResult, CompleteRequest, CompleteResult } from './lib/types'

export type {
  AssistantMsg,
  CallMeta,
  ChatRequest,
  ChatResult,
  CompleteRequest,
  CompleteResult,
  ImageInput,
  Msg,
  NativeTurn,
  Priority,
  ToolCall,
  ToolDef,
  ToolMsg,
  UserMsg,
} from './lib/types'
export {
  BudgetError,
  DeadlineError,
  ProvidersExhaustedError,
  type FailureReason,
  type ProviderFailure,
} from './lib/errors'
export type { FetchBudget, FetchFn } from './lib/transport'
export type { ProvidersConfigInput as ProvidersConfig } from './lib/config'
export type { RouterOptions as LlmRouterOptions } from './lib/router'

export interface LlmRouter {
  /** One schema-validated JSON result (one repair per model, then failover). */
  complete<T>(req: CompleteRequest<T>): Promise<CompleteResult<T>>
  /** One model turn: tool calls for the caller to run, or a reply (validated data when `schema` is set, else text). */
  chat<T = string>(req: ChatRequest<T>): Promise<ChatResult<T>>
}

export function createLlmRouter(deps: Deps, opts?: RouterOptions): LlmRouter {
  return createRouter(deps, opts)
}
