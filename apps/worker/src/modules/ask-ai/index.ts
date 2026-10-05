// Owns: Ask AI, the in-app chat (SPEC §8 "Ask AI (in-app)", §9 ask_ai): free-tier function calling over the shared
// tools layer, answered inside the request, history in chat_messages.
// Interface:
//   chatTurn(deps, llm, ChatSend)          → ChatSent       POST /api/ai/chat. Replaying a message id returns the stored
//        turn (no second run). Offers ≈15 tools picked by intent; runs calls as actor 'ai' for ≤ 5 model calls.
//        Logging tools apply at once (Aaron asked); targets, workouts and week plans become proposals that wait for a
//        tap (the modules' guards decide; auto_apply_safe only ever covers safe-list kinds, never targets); coach-only
//        tools are never offered. Stores user, one tool row per call, and the assistant reply; the reply's tool_calls
//        are the calls made and its proposals what waits for a tap. A router failure is a calm stored reply with
//        error 'ai_unavailable' (or 'too_many_steps'), not an HTTP error. The model never sees the user's name.
//   chatHistory(deps, { thread_id? })      → ChatMessage[]  GET /api/ai/chat: a thread oldest first, proposals at their
//        status now; without thread_id, each thread's opening question, most recently active first
//   selectTools(texts, autoApplySafe)      → OfferedTool[]  the tools a turn would offer (for tests and tuning)
export { chatHistory } from './lib/history'
export { MAX_TOOLS, selectTools, type OfferedTool } from './lib/select'
export { chatTurn, MAX_ROUNDS } from './lib/turn'
