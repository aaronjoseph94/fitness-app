// Owns: the /api ai route group — job status, AI workouts (generate / fill), the training week (read it, or plan it:
// one draft per split day), and Ask AI chat (answered in the request, with its own LLM router and a fetch budget that
// leaves room for the tools' own fetches under the 50-subrequest cap), plus forgetting one chat and undoing one thing a
// message logged.
import { endpoints } from '@fitness/shared/api'
import type { App } from '../env'
import { route } from '../lib/route'
import { chatDelete, chatHistory, chatTurn, undoReceipt } from '../modules/ask-ai'
import { getJob } from '../modules/jobs'
import { createLlmRouter } from '../modules/llm'
import { planTrainingWeek, requestWorkout, trainingWeek } from '../modules/workouts-ai'

/**
 * External fetches the Ask AI router may make in one request: the dump's extraction call and 5 model calls, with a
 * retry or failover each, plus slack.
 */
const ASK_AI_FETCH_BUDGET = 28

export function mountAiRoutes(app: App): void {
  route(app, endpoints.ai.job, ({ params }, deps) => getJob(deps, params.id))
  route(app, endpoints.ai.workout, ({ body }, deps) => requestWorkout(deps, body), { status: 201 })
  route(app, endpoints.ai.planWeek, ({ body }, deps) => planTrainingWeek(deps, body), { status: 201 })
  route(app, endpoints.ai.week, (_, deps) => trainingWeek(deps))
  route(app, endpoints.ai.chat, ({ body }, deps) =>
    chatTurn(deps, createLlmRouter(deps, { budget: { limit: ASK_AI_FETCH_BUDGET, used: 0 } }), body),
  )
  route(app, endpoints.ai.chatHistory, ({ query }, deps) => chatHistory(deps, query))
  route(app, endpoints.ai.chatDelete, ({ query }, deps) => chatDelete(deps, query))
  route(app, endpoints.ai.undoReceipt, ({ params }, deps) => undoReceipt(deps, params.id))
}
