<!-- Owns: the implementation plan for "the in-app AI can do everything in Train" and "the AI plans a whole-body week over Mon, Tue, Thu" (Aaron, 2026-10-14). Decisions here are copied into docs/PROGRESS.md when built. -->

# The AI runs Train, and plans a whole-body week on Mon, Tue, Thu — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use subagent-driven-development. Waves run in parallel; no file is shared inside a wave. Steps use checkbox (`- [ ]`) syntax.

**Aaron's request (2026-10-14):** "I want the inbuilt AI section to be able to manipulate the Train section freely. When I ask the AI to come up with exercises for the week, I want it to be able to create a whole week's plan that deals with my entire body (upper, lower, etc.), but I need it to be broken into 3 days: Monday, Tuesday and Thursday."

**Goal.** Ask "plan my week" in the AI tab (or tap one button on Train) and get one AI draft per training day — Mon **Upper A**, Tue **Lower A**, Thu **Full body** — that together train every major muscle twice a week. The AI can also create, edit, rename, reorder and delete templates, change training days, mark equipment and hide exercises, each behind one tap, and every applied change can be undone.

**Architecture.** The week is the recurring split (settings `training_days` → engine `splitSlots`), not a one-week `week_plans` row, so it never expires. The split engine learns a 3-day rule. The whole week is drafted by the existing `workout_template` job, one job per day running in parallel, so no single model reply has to hold a whole week (Ask AI replies are capped at 1,024 tokens). New Train writes for the AI go through one proposal kind, `train_change`, applied on a tap and undoable from a snapshot stored on the event.

**Tech stack.** Zod 4 schemas, the pure engine, Hono routes, D1 via Drizzle (`db.batch`, no transactions), React 19 + MUI 9 + TanStack Query, Vitest 4.1, Playwright 1.63.

**Spec.** `docs/SPEC.md` §7 (training), §8 (Ask AI), §9 (AI layer, safe list), §10 (tools). This plan changes §2, §7 and §10 as listed under Wave 4.

## Can it be done? (from mapping the code, 2026-10-14)

Yes, with no migration.

- **Nutrition doesn't move.** Calorie, protein, water and steps targets don't depend on training days. Only the `training_planned` flag on each day changes. The Log section doesn't read training at all.
- **What stood in the way:**
  - The split is hard-coded upper/lower: Mon/Tue/Thu would give Upper A / Lower A / Upper B.
  - Ask AI has no tool to create, edit, rename or delete templates, change training days or change equipment, and its prompt says so.
  - A one-week `week_plans` row lapses back to the old days the next week.
  - Three full-body days with Mon and Tue back to back would break the recovery rule ("no muscle as a primary target on consecutive days").

## Decisions ([A] = assumption made on Aaron's behalf)

1. **[A] "Whole body over 3 days" = Upper / Lower / Full body.** For three training days, `splitSlots` gives slot 1 Upper A, slot 2 Lower A, slot 3 Full body (Mon/Tue/Thu → Mon Upper A, Tue Lower A, Thu Full body). Every muscle gets two sessions a week, and Mon → Tue never repeats a primary muscle, so the recovery rule holds unchanged. Three full-body days were rejected because Mon and Tue are back to back.
2. **Split by day count** (refined by Amendment A2: two back-to-back days give Upper A / Lower A, and Full body goes on the most-rested of three days):
   - 1 day → Full body.
   - 2 days → Full body A, Full body B.
   - 3 days → Upper A, Lower A, Full body.
   - 4 or more → unchanged (Upper A, Lower A, Upper B, Lower B, …).
   - Names stay stable, so an existing "Upper A" / "Lower A" template still matches.
3. **The week is the split, not a `week_plans` row.** It repeats every week until he changes it. A coach week plan with sessions still takes over its own week, as today.
4. **Training days become Mon, Tue, Thu by his tap**: the day chips and Generate on Train (Amendment A1), Settings, or the AI's proposal. The seed default and CLAUDE.md's decided default change to Mon/Tue/Thu for fresh databases. No data migration writes his settings.
5. **"Plan my week" redrafts every training day now:** one `workout_template` job per slot at user priority, run at once while the request's fetch budget allows (8 per job), with the rest left for the next sweep. A slot with a job already queued or running is skipped.
6. **Keep on a draft named like an existing template replaces that template in place** (same id, so Start, Edit and history links stay). The old version is stored on the proposal, and **Undo** restores it.
7. **"Freely" means every Train action, still behind a tap.** `auto_apply_safe` is off for the first month (Aaron's decided default), so each AI change is a card with Apply/Dismiss. When he turns that setting on, only the SPEC §9 safe list applies at once, as today. MCP (Claude connector) applies at once, as today.
8. **New AI abilities:**
   - **Templates:** create, edit sets/reps/rest, reorder, rename, edit notes, delete. Plus `list_templates` and `get_training_week` to read them.
   - **Days and week:** change training days; plan the week, or redraft one day of it.
   - **Equipment and library:** mark a machine's status; hide an exercise.
   - **Sessions:** start a session (`log` access, as for `log_set`).
9. **Not given to the AI:**
   - **Un-hiding an exercise.** It could bring back a bodyweight exercise, which the exercise-set rail forbids.
   - **Editing or deleting logged sessions and sets.** What he logged is his record.
   - **Accepting, rejecting or reverting proposals.** Unchanged.
10. **Undo for Train changes.** `plan_versions` rows hold calorie and macro targets, so Train changes can't be stored there. Instead, each applied `train_change` (and a replacing Keep) stores a `before` snapshot on its event, and `POST /api/train-changes/:id/revert` restores it. Undo is refused for the AI; it works once (409 the second time); it puts back exactly the stored version, even over a later edit. A deleted template comes back with the same id, but past sessions stay unlinked, as `deleteTemplate` leaves them.
11. **Leftover drafts.** When the split changes, the cron dismisses pending split drafts whose names are no longer in the split. A name stays allowed while a pending `training_days` proposal includes it, so "Full body" survives while he hasn't yet tapped the days change.
12. **Ask AI tool choice stays within 16 tools.** New areas `templates` and `equipment` split the crowded `training` area. "Week", "split", "days" and weekday names bring in the week tools.

## Amendment (Aaron, 2026-10-14, during the build): "let me choose the days and hit generate"

> "Actually, let me choose the days and hit generate. For the days I select, the AI should ensure that exercises are generated that ultimately deal with each part (upper, lower, etc.) on the different days."

What changes:

- **A1. Pick days, then Generate, on Train.** The This week card gets seven day chips, preset to his training days. As he toggles them, it previews the split those days give ("Mon Upper A · Tue Lower A · Thu Full body"). **Generate** sends the chosen days.
  - `planTrainingWeek` saves the days first through settings `proposeTrainingDays`: applied at once for him or MCP, a proposal for Ask AI. Then it drafts every day.
  - This replaces the separate "Change days" button and the separate days step in the AI flow (the `plan_training_week` tool just calls `planTrainingWeek`).
- **A2. The split adapts to the chosen days so every part is covered without training a muscle two days running:**
  - **2 days:** back to back (counting Sun → Mon) gives Upper A, Lower A; otherwise Full body A, Full body B.
  - **3 days:** Full body goes on the day with the most rest around it (fewest consecutive neighbours; ties go to the latest day in the week); the other two take Upper A then Lower A in week order. Mon/Tue/Thu → Mon Upper A, Tue Lower A, Thu Full body.
  - **1 day:** Full body. **4 or more:** unchanged.
- **A3. "Each part" is checked, not hoped for.**
  - **Body groups** (engine): chest = chest; back = lats or middle back; shoulders = shoulders; arms = biceps or triceps; quads = quadriceps; hamstrings = hamstrings; glutes = glutes; calves = calves.
  - **Each focus has groups it must hit:** upper = chest, back, shoulders, arms; lower = quads, hamstrings, glutes, calves; full = chest, back, shoulders, quads, hamstrings, glutes.
  - **Per draft:** the prompt names the day's groups. When the reply misses one, the repair adds the best allowed candidate for it (3 sets, while the session stays at or under 28 sets).
  - **Per week:** `TrainingWeek.uncovered` lists the groups none of the week's templates train, and the card shows "Covers every major muscle group" or "Not covered yet: …".

Contract changes (Task 1, fix round):
- `BodyGroup = z.enum(['chest','back','shoulders','arms','quads','hamstrings','glutes','calves'])`
- Engine: `focusGroups(focus) → BodyGroup[]`, `bodyGroupsOf(muscles: readonly Muscle[]) → BodyGroup[]`, and `missingGroups(required: readonly BodyGroup[], muscles: readonly Muscle[]) → BodyGroup[]`.
- `TrainingWeek` gains `uncovered: BodyGroup[]`.
- `PlanWeekResult` gains `training_days: { status: 'applied'|'proposed'|'unchanged', proposal_id: string|null }`.

## Global constraints

- **Rails unchanged:** 12–28 sets per session (`guardWorkout`), allowed exercises only, machines and free weights only, kcal rails untouched, the AI never writes to the database directly (Zod, guards, then a proposal), privacy rail as is.
- **Writes:** one `db.batch` per change, no `db.transaction()`, no `ON DELETE CASCADE`, at most 100 bound parameters per statement.
- **Code conventions:**
  - Every file starts with an Owns comment.
  - Module interfaces are `(deps, input)` through `index.ts`; `pnpm lint:boundaries` must stay clean.
  - Types are inferred from Zod.
  - Colours come only from `theme.ts`; every chart has a `data-testid`.
- **Testing:** tests at the agreed seams only (engine public functions, `guards.ts`, each worker module's `index.ts`), with known-good literals. Typecheck the package you touch and run its targeted tests only. No `pnpm add`. Never deploy.
- **Copy:** "Upper A", "Lower A", "Full body", "Plan my week", "Keep all", "Change days", "Undo", "Replaces your Upper A".

## Review focus (failure modes no single task's tests own)

1. **He hasn't tapped the training-days change yet.** The AI's Mon/Tue/Thu drafts include "Full body". The cron must not dismiss it (pinned in Task 4).
2. **"Plan my week" pressed twice, or while the cron drafts.** He must end up with one pending draft per day, with no duplicate jobs (Task 4).
3. **Keep replaces a template he edited by hand, then he taps Undo.** His exact version comes back, with the same id (Task 2).
4. **The AI is asked to un-hide a bodyweight exercise or change a calorie rail.** There is no tool, and its prompt says where in the app to do it (Task 7).
5. **Days that aren't consecutive (Mon/Wed/Fri), or 4+ days.** The split is still correct, and Mon–Thu is unchanged (Task 1).

---

## Wave 1 — contracts and engine (one agent)

### Task 1: Split rule, schemas, endpoints

**Files:** `packages/shared/src/engine/lib/split.ts`, `packages/shared/src/engine/tests/split.test.ts`, `packages/shared/src/schemas/training.ts`, `packages/shared/src/schemas/plan.ts`, `packages/shared/src/schemas/jobs.ts`, `packages/shared/src/api/endpoints.ts` (+ `schemas/index.ts` exports if needed)

**Produces:**
- `SplitSlot.focus: z.enum(['upper','lower','full'])`.
- `splitSlots(training_days)` per decision 2.
- In `schemas/training.ts`:
  - `TemplateSnapshot = { id, name, notes: string|null, exercises: TemplateExerciseInput[] }`.
  - `TrainChange = z.discriminatedUnion('op', [...])` with these ops:
    - `{ op:'template_create', name, notes?: string|null, exercises }` (exercises: `TemplateExerciseInput[]` 1–20)
    - `{ op:'template_update', template_id, name?, notes?, exercises? }` (at least one field)
    - `{ op:'template_delete', template_id }`
    - `{ op:'equipment_status', equipment, status: EquipmentStatus }`
    - `{ op:'exercise_hide', exercise_id, reason }`
  - `TrainingWeekSlot = SplitSlot & { template: { id, name, exercise_count, sets, muscle_scores } | null, draft: { proposal_id, replaces_template_id: string|null } | null, drafting: boolean }`.
  - `TrainingWeek = { training_days: Weekday[], slots: TrainingWeekSlot[], week_plan_sessions: Partial<Record<Weekday, string|null>> | null }`.
  - `PlanWeekRequest = { training_days?: Weekday[] (1–7, unique), only?: string[] (slot names) }`.
  - `PlanWeekResult = { slots: SplitSlot[], job_ids: string[], skipped: string[] }`.
- In `ProposalBody`:
  - `{ kind:'train_change', change: TrainChange, before: TemplateSnapshot | { equipment, status } | null, reverted_at?: string }`
  - `{ kind:'training_days', training_days: Weekday[], before: Weekday[] }`
  - The `workout` body gains `replaced?: TemplateSnapshot` and `reverted_at?: string`.
- `workout_template` job payload: `{ slot: SplitSlot, replace?: boolean }`.
- New endpoints:
  - `endpoints.ai.planWeek` (`POST /api/ai/week`, body `PlanWeekRequest`, response `PlanWeekResult`)
  - `endpoints.ai.week` (`GET /api/ai/week`, response `TrainingWeek`)
  - `endpoints.training.revertChange` (`POST /api/train-changes/:id/revert`, response `{ ok: true }`)

**Steps:**
- [ ] **Step 1: Failing tests** in `split.test.ts`:
  - `splitSlots(['mon','tue','thu'])` → `[{weekday:'mon',name:'Upper A',focus:'upper'},{weekday:'tue',name:'Lower A',focus:'lower'},{weekday:'thu',name:'Full body',focus:'full'}]`
  - `splitSlots(['mon','wed','fri'])` names → `['Upper A','Lower A','Full body']`
  - `splitSlots(['tue','fri'])` names → `['Full body A','Full body B']`
  - `splitSlots(['sat'])` → `[{weekday:'sat',name:'Full body',focus:'full'}]`
  - `splitSlots(['mon','tue','wed','thu'])` names unchanged `['Upper A','Lower A','Upper B','Lower B']`
  - `splitSlot('thu', ['mon','tue','thu'])?.focus` → `'full'`
- [ ] **Step 2:** Run `npx vitest run --project engine packages/shared/src/engine/tests/split.test.ts`. It fails.
- [ ] **Step 3:** Implement the rule (update the formula comment) and the schemas and endpoints above.
- [ ] **Step 4:** Engine tests pass. Then `pnpm --filter @fitness/shared exec tsc --noEmit`, and `pnpm check`. Type errors in worker and web from `focus:'full'` are expected and belong to Wave 2; list them in the hand-back.
- [ ] **Step 5:** Commit "Contracts: a 3-day split (Upper, Lower, Full body), Train changes and the training week".

## Wave 2 — worker modules and web, in parallel (four agents, no shared files: Task 2; Tasks 3+4 in one agent, since 4 calls 3; Task 5; Task 6)

### Task 2: Train changes and Undo (training module)

**Files:**
- Create `apps/worker/src/modules/training/lib/changes.ts`.
- Modify `training/lib/swap.ts` (`acceptWorkout`) and `training/index.ts`.
- Modify `apps/worker/src/routes/training.ts` (revert route).
- Test: `apps/worker/test/train-changes.test.ts`.

**Produces (exported from `training/index.ts`):**
- `trainChange(deps, { change: TrainChange, reason: string }) → { status: 'applied'|'proposed', proposal_id: string, applied: { entity: 'template'|'equipment'|'exclusion', id: string } | null }`:
  - The change is validated first: templates go through `checkExercises` → `guardWorkout`, and the template and exercise must exist. Invalid → 422.
  - Actor `ai` → a pending `train_change` proposal; nothing is written.
  - `user` / `mcp` → applied now, plus an `auto_applied` `train_change` event carrying `before`.
- `registerProposalHandler('train_change', …)`: on accept, re-validate, apply, and write `before` into the event body.
- `revertTrainChange(deps, id) → { ok: true }`:
  - Works on `train_change` events and `workout` events with `replaced`.
  - 403 for actor `ai`; 409 `already_reverted`; sets `reverted_at`.
- `acceptWorkout`: when a template already has the draft's name (`splitNameKey`), it updates that template in place and stores `replaced: TemplateSnapshot` on the proposal body.

**Steps:**
- [ ] **Step 1: Failing tests** (fixture style as in `test/training.test.ts`):
  - As `ai`: `template_update` renaming "Upper A" → "Push" gives `status 'proposed'`, and the template is still "Upper A". After `acceptProposal` it reads "Push" and the event's `before.name` is "Upper A".
  - As `mcp`: `template_delete` gives `status 'applied'` and the template is gone. `revertTrainChange` as `user` brings back the same id with the same exercises. A second revert → 409 `already_reverted`.
  - As `ai`: `template_create` with 10 sets total → 422 (sets rail), and no proposal row.
  - With templates "Upper A" (id T, three exercises) and a pending `workout` draft named "Upper A": accept → still one "Upper A", id T, exercises = the draft's, `body.replaced.exercises.length === 3`. `revertTrainChange(draft id)` → T's three exercises are back.
- [ ] **Step 2:** Run `pnpm --filter @fitness/worker exec vitest run test/train-changes.test.ts`. It fails.
- [ ] **Step 3:** Implement. Each apply and revert is one `db.batch`; reuse `createTemplate` / `updateTemplate` / `deleteTemplate` statement logic and the equipment and exclusion writers.
- [ ] **Step 4:** The tests pass, plus `test/training.test.ts` and `test/split-drafts.test.ts`. Typecheck the worker.
- [ ] **Step 5:** Commit "Training: AI Train changes behind a tap, and Undo".

### Task 3: Training days as a proposal (settings module)

**Files:** `apps/worker/src/modules/settings/index.ts` (+ `settings/lib/training-days.ts`), test `apps/worker/test/training-days.test.ts`.

**Produces:**
- `proposeTrainingDays(deps, { training_days: Weekday[] }) → { status: 'applied'|'proposed'|'unchanged', proposal_id: string|null, training_days: Weekday[] }`:
  - Days are normalised to week order.
  - Actor `ai` → a pending `training_days` proposal with `before`.
  - `user` / `mcp` → `updateSettings` now.
- `registerProposalHandler('training_days', …)`: on accept, it calls `updateSettings` (which rebuilds `daily_targets` from today).

**Steps:**
- [ ] **Step 1: Failing tests:**
  - As `ai`, `['thu','mon','tue']` → `proposed`, with `training_days` `['mon','tue','thu']` and settings unchanged.
  - Accept → settings `['mon','tue','thu']`, and the next Wednesday's `daily_targets.training_planned` is `false`.
  - The same days as current → `unchanged`, with no proposal.
- [ ] **Steps 2–5:** Fail, implement, pass, typecheck. Commit "Settings: training days can be proposed by the AI".

### Task 4: Plan the week (workouts-ai)

**Files:**
- `apps/worker/src/modules/workouts-ai/index.ts`, `lib/split.ts`, `lib/plan.ts`, `lib/repair.ts`; create `lib/week.ts`.
- `apps/worker/src/routes/ai.ts`.
- Tests: `apps/worker/test/plan-week.test.ts`; extend `test/split-drafts.test.ts`.

**Produces:**
- `planTrainingWeek(deps, PlanWeekRequest) → PlanWeekResult`:
  - When `training_days` is given, it first calls settings `proposeTrainingDays` (Task 3): applied for user or MCP, proposed for Ask AI. The result goes in `PlanWeekResult.training_days`.
  - Slots come from `splitSlots(training_days ?? settings)`, filtered by `only`.
  - A slot with a `workout_template` job queued or running for that name goes in `skipped`.
  - It enqueues at `USER_PRIORITY` with `replace` set when a template of that name exists.
  - It calls `runSoon` for as many as the request's fetch tally allows (8 each).
  - When no model has a key, it answers 409 `no_model_key` and queues nothing.
- `trainingWeek(deps) → TrainingWeek`: slots with their template, pending draft (and `replaces_template_id`), `drafting`, the active week plan's session names when that plan has sessions, and `uncovered` = `missingGroups(all body groups, the primary muscles of every slot template's exercises)`.
- `ensureSplitDrafts` also dismisses pending split drafts whose name is not in `splitSlots(settings) ∪ splitSlots(pending training_days proposal)` (decision 11).
- `draftWorkout` for a `full` slot:
  - The prompt says "Full body: every major muscle group, 12–28 sets".
  - It lists every earlier slot's exercises, not only the same focus.
  - A `replace` draft lists his current version so the new one varies from it.
  - The prompt names the slot's `focusGroups`. `repairDraft` adds, for each group the draft misses, the best allowed candidate (3 sets, rep range and rest as the draft's other picks, only while the total stays ≤ 28 sets; A3).
- Routes: `POST /api/ai/week` → `planTrainingWeek`, `GET /api/ai/week` → `trainingWeek`.

**Steps:**
- [ ] **Step 1: Failing tests:**
  - As `ai`, with settings Mon–Thu and an "Upper A" template, `planTrainingWeek({ training_days: ['mon','tue','thu'] })` → `training_days.status 'proposed'` (settings still Mon–Thu), and three queued `workout_template` jobs with slot names `['Upper A','Lower A','Full body']`; only the "Upper A" job has `replace: true`.
  - As `user`, the same call → `training_days.status 'applied'`, and settings read `['mon','tue','thu']`.
  - A fake model reply for an "Upper A" slot with chest, back and shoulders picks but no biceps or triceps exercise → the stored draft gains one arms exercise with 3 sets.
  - Calling it again → `job_ids` empty, `skipped` holds all three.
  - With no model key → 409 `no_model_key`, and no job row.
  - With settings Mon–Thu, pending drafts "Upper B" and "Full body", and a pending `training_days` proposal `['mon','tue','thu']`: `ensureSplitDrafts` → "Upper B" rejected, "Full body" stays pending.
  - `trainingWeek` with Mon/Tue/Thu, an "Upper A" template and a pending "Lower A" draft → three slots; Mon's template is set, Tue's `draft.replaces_template_id` is null, Thu's template and draft are null. Its `uncovered` holds every lower-body group (quads, hamstrings, glutes, calves), plus any upper group the Upper A fixture lacks.
- [ ] **Steps 2–5:** Fail, implement, pass, typecheck. Commit "Workouts AI: plan the whole week, and a full-body day".

### Task 5: The week on Train (web)

**Files:**
- Create `apps/web/src/features/train/lib/WeekSplitCard.tsx`.
- Modify `train/lib/TrainPage.tsx`, `train/lib/useTrainData.ts` and `train/lib/DraftTemplateCard.tsx`.

**Produces:** a "This week" card on Train, from `GET /api/ai/week`:
- Seven day chips, Mon to Sun (preset to his training days; today marked). Toggling them previews the split for those days with the engine's `splitSlots` ("Mon Upper A · Tue Lower A · Thu Full body"). **Generate** → `POST /api/ai/week` with `{ training_days }`. Generate is disabled with no day chosen.
- Each training day shows its slot name and either its template, "Draft waiting", "Drafting…" or "No workout yet".
- One coverage line from `uncovered`: "Covers every major muscle group", or "Not covered yet: calves, arms".
- A combined muscle map of the week's templates (`data-testid="week-muscles"`).
- **Generate**, when templates exist, asks first: "Redraft all 3 days? Your templates stay until you keep the new drafts." (with the real number of days). A 409 `no_model_key` shows "Add a model key in Settings → AI first."
- **Keep all** → accepts every pending split draft in turn.
- When an active week plan has sessions: the line "This week follows your week plan".
- Draft cards show "Replaces your <name>" when they do, and after Keep an **Undo** (`endpoints.training.revertChange`).
- `useTrainData` no longer hides a draft whose name already has a template.
- Test ids: `week-split`, `week-day`, `day-chip`, `generate-week`, `week-uncovered`, `keep-all`, `draft-undo`.

**Steps:**
- [ ] Build with frontend-ui-engineering and the 2a kit (tokens only from `theme.ts`, 44 px touch targets).
- [ ] Typecheck the web package.
- [ ] Look at it at 390 px and 1,280 px against a local Worker with drafts injected.
- [ ] Commit "Train: pick the days, generate the week, keep all".

### Task 6: AI cards for Train changes (web)

**Files:** `apps/web/src/features/ai/lib/proposal-view.ts`, `ai/lib/ProposalItem.tsx`, `ai/lib/Chat.tsx` (one suggestion chip), `apps/web/src/features/today/lib/event-view.ts`.

**Produces:**
- **Titles and change lines** for `train_change` and `training_days`:
  - "New template: Push", "Rename Upper A → Push", "Delete template Upper B", "Upper A: 6 exercises, 20 sets"
  - "Training days: Mon, Tue, Wed, Thu → Mon, Tue, Thu", "Leg press → Don't have", "Hide Kettlebell Swing"
- **Undo** on an applied `train_change`, or on a `workout` that replaced a template, through `endpoints.training.revertChange`.
- **Follow-up links:** templates → `/train/builder/:id`; days and the week → `/train`.
- **Chip:** "Plan my week: Mon, Tue, Thu".

**Steps:**
- [ ] Implement. Typecheck the web package. Commit "AI tab and Today: cards and Undo for Train changes".

## Wave 3 — tools and Ask AI (one agent, after Wave 2: Task 7)

### Task 7: Tools, policy, selection, prompt

**Files:**
- `apps/worker/src/modules/tools/lib/define.ts` (`ToolArea` + `'templates'`, `'equipment'`), `tools/lib/sets/training.ts`, `tools/lib/sets/week-plans.ts` (description), `tools/lib/procedures.ts`.
- `apps/worker/src/modules/ask-ai/lib/{policy,select,prompt}.ts`.
- Tests: `apps/worker/test/ask-ai-train.test.ts`.

**Produces — tools (every input a Zod schema, `.strict()` as the others):**

| Tool | What it does |
| --- | --- |
| `get_training_week` | read: `trainingWeek` |
| `list_templates` | read: id, name, notes, exercises with name/sets/reps/rest, top muscles |
| `create_template` | now via `trainChange` `template_create` |
| `update_template` | `template_update` |
| `delete_template` | `template_delete` |
| `update_equipment` | one `equipment_status` change per row |
| `hide_exercise` | `exercise_hide` |
| `set_training_days` | `proposeTrainingDays` |
| `plan_training_week` | `{ training_days?, only? }` → `planTrainingWeek` (which proposes the days itself) |
| `revert_train_change` | MCP only: Ask AI never gets it |

**Policy and prompt:**
- **Policy:**
  - `create_template`, `update_template`, `delete_template`, `update_equipment`, `hide_exercise`, `set_training_days` and `plan_training_week` → `propose`.
  - `start_session` → `log`.
- **Selection:** "come up with exercises for the week" offers `plan_training_week` and `get_training_week`; "rename Upper A to Push" offers `update_template` and `list_templates`; "I don't have a leg press" offers `update_equipment`. Never more than `MAX_TOOLS` (16).
- **Prompt:**
  - Replace "cannot … change equipment, build or rename templates" with what it can now do (each a card he taps), and how to plan a week: `plan_training_week` with the days he names (it proposes the days and drafts every day so each body part is covered), and use `propose_week_plan` only for a one-off week.
  - Keep: it cannot accept, reject or revert proposals, un-hide exercises, edit logged sessions, plan fasts or scans, or touch the calorie rails.
- **Procedures** (`program_design`, `coach_review`) and the `replace_week_plan` description: read the split from `get_training_week`, not "Mon–Thu upper/lower".

**Steps:**
- [ ] **Step 1: Failing tests:**
  - `selectTools(['come up with exercises for the week'], false)` includes `plan_training_week`.
  - `accessOf('update_template', false) === 'propose'`.
  - A chat turn with a fake LLM calling `plan_training_week({ training_days:['mon','tue','thu'] })` leaves one pending `training_days` proposal and three queued jobs.
- [ ] **Steps 2–5:** Fail, implement, pass, typecheck, `pnpm lint:boundaries`. Commit "Ask AI and tools: everything in Train, behind a tap".

## Wave 4 — defaults, docs, e2e, verification (coordinator)

- [ ] **Seed default:** `apps/worker/scripts/build-seed.ts` `TRAINING_DAYS` → `['mon','tue','thu']`. Fix any e2e flow that assumed Wednesday is a training day.
- [ ] **E2e:** `e2e/train-week.spec.ts`. Train shows Mon Upper A, Tue Lower A, Thu Full body. Toggling Wed on previews four slots, and toggling it off restores three. **Generate** with no model key (the e2e Worker has none) shows "Add a model key in Settings → AI first."
- [ ] **Docs:**
  - SPEC §2 (3 sessions, Mon/Tue/Thu), §7 (split rule, week = split, Undo), §8 (what Ask AI may do in Train), §10 (new tools).
  - GLOSSARY: Split slot, Week plan, plus new terms Training week and Train change.
  - CLAUDE.md decided default: "Default weekly split: Upper A / Lower A / Full body, Mon, Tue, Thu."
  - PROGRESS: Done and Decisions.
- [ ] **Verify:** `pnpm check`, `pnpm test`, `CI=1 pnpm e2e`, and the running app with injected drafts at phone and desktop widths.
- [ ] **Review:** `code-review`, `code-review-and-quality` and `security-and-hardening` (AI write permissions). Fix the findings in one pass, then commit. Aaron pushes.

## Risks

- **Back-to-back lower days.** With Mon/Tue/Wed the Full body day follows Lower A, so the recovery notes (advisory) show on Wednesday.
- **No undo for in-app edits.** A template edited by Aaron in the builder still has no version history; Undo covers only AI and Claude changes.
- **Slow models.** "Plan my week" with a paid model could take a minute before all three drafts show; the card says "Drafting…" meanwhile.
