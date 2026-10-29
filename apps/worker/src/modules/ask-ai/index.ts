// Owns: Ask AI, the in-app chat (SPEC §8 "Ask AI (in-app)", §9 ask_ai): free-tier function calling over the shared
// tools layer, answered inside the request, history in chat_messages. "Dump or ask": one message may log several facts
// at once (each with a receipt and its Undo), then gets its questions answered and its requests proposed.
// Interface:
//   chatTurn(deps, llm, ChatSend)          → ChatSent       POST /api/ai/chat. Replaying a message id returns the stored
//        turn (no second run): still running → its receipts so far and error 'turn_running'; cut off (running > 2 min)
//        → those receipts, "the answer was cut off — ask again" and 'ai_unavailable'. Days are read against sent_at
//        (clamped to the last 14 days, never after now). First the dump step: one extraction call (DumpExtraction, with the message's
//        screenshots; skipped for a plain one-clause question) whose stated facts are logged at once through the log
//        tools as actor 'ai' (the message is the request, so asksToLog does not gate them), each leaving a receipt
//        (chat_receipts: the row written and that day's row before it); attached meal photos and scan sheets are
//        receipts too; equipment and a goal become pending proposals. A screenshot's fact logs only when his own text
//        asks to log (never a fast or a body note); the receipts and a running placeholder reply are stored together
//        before the coach pass. A log that moves the forecast reforecasts and the
//        reply's `forecast` says how it moved. A failed extraction just means no dump. Then the coach
//        pass (told what was logged, as data): offers at most MAX_TOOLS tools picked by intent (not a log tool the dump
//        already ran); runs calls as actor 'ai' for ≤ 5 model calls. Logging tools apply at once (Aaron asked); targets, workouts, week plans and every Train change
//        (templates, equipment statuses, hidden exercises, training days; plan_training_week's days) become proposals
//        that wait for a tap (the modules' guards decide; auto_apply_safe only ever covers safe-list kinds, never
//        targets); Undo (revert_train_change) and coach-only tools are never offered. Stores user, one tool row per
//        call, and the assistant reply; the reply's tool_calls are the calls made and its proposals what waits for a
//        tap. A router failure is a calm stored reply with error 'ai_unavailable' (or 'too_many_steps'), not an HTTP
//        error. The model never sees the user's name.
//   chatHistory(deps, { thread_id? })      → ChatMessage[]  GET /api/ai/chat: a thread oldest first, proposals at their
//        status now, each reply's receipts and forecast move; without thread_id, each thread's opening question, most
//        recently active first
//   chatDelete(deps, { thread_id })        → Ok             DELETE /api/ai/chat: forget one chat — every chat_messages
//        row and receipt of that thread and its screenshots (what it logged stays logged); an id that was never stored
//        is a no-op
//   undoReceipt(deps, id)                  → Receipt        POST /api/ai/receipts/:id/undo: the logged row goes, or that
//        day's earlier row comes back (weight, tape, sleep, steps; a renewed body note its earlier words); a fast start
//        is unstarted, a fast end reopened; then a best-effort reforecast. 404 unknown, 409 already_undone (once per
//        receipt), 409 not_undoable (a scan sheet: Scans), 409 superseded (logged or edited again since; nothing
//        changes), 409 planned_start_passed / fast_active (a fast undo that is no longer safe)
//   selectTools(texts, autoApplySafe)      → OfferedTool[]  the tools a turn would offer (for tests and tuning)
//   MAX_TOOLS                              the most tools one turn offers (16)
export { chatDelete } from './lib/forget'
export { chatHistory } from './lib/history'
export { MAX_TOOLS, selectTools, type OfferedTool } from './lib/select'
export { undoReceipt } from './lib/receipts'
export { chatTurn, type ChatTurnInput } from './lib/turn'
