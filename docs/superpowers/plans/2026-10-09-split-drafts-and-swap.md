<!-- Owns: the implementation plan for AI drafts of the upper/lower split and swap everywhere (Aaron, 2026-10-09). Decisions here are copied into docs/PROGRESS.md when built. -->

# AI drafts for the split, and swap everywhere — implementation plan

> **For agentic workers:** use subagent-driven-development; waves run in parallel with no file shared inside a wave.

**Aaron's request (2026-10-09):** "I want the exercises for Upper and lower parts of my body to be generated already by AI... with a swap feature available so I can swap out exercises/equipment... while still exercising the particular part of the body/muscle."

**Goal.** Open Train and find one AI draft waiting for each day of the split (default Upper A, Lower A, Upper B, Lower B). One tap keeps a draft as a template. Swap any exercise for another with the same primary muscle: on a draft, in the builder, and mid-session when a machine is busy. No migration; every rail holds.

## What the code showed (before building)

- **Names.** Week-plan sessions use names like "Upper A". `dayFocus` (workouts-ai/lib/plan.ts) already alternates upper/lower by training-day position.
- **Templates.** None are seeded, so Train's Templates section starts empty.
- **Swap.** Swap exists in the builder and the AI preview; there is none mid-session. The swap picker already filters by equipment.
- **Sessions.** A session stores its start plan once in `workout_sessions.plan`. Each `session_sets` row carries its own `exercise_id` and a client UUID, so a mid-session swap needs no Worker change. Add and Remove already work this way.
- **Bug: swap ranking.** For Leg Press, stationary bikes and treadmills ranked above Barbell Squat, because cardio shares the muscle tags.
- **Bug: duplicates.** The AI preview's swap could pick an exercise that is already in the draft, and the logger then dropped the duplicate silently.

## Decisions ([A] = assumption made on Aaron's behalf)

1. **Drafts, not silent templates.** Each split day gets a pending `workout` proposal with a name. Keep accepts it and creates the template, using the proposal id as the template id so a double tap is harmless. `auto_apply_safe` is off, so the AI never creates a template without a tap.
2. **One draft per training day.** `splitSlots(training_days)` names them "Upper"/"Lower" by position, with a letter A, B, C… every two days. Mon–Thu gives Upper A, Lower A, Upper B, Lower B.
3. **[A] A day's draft is matched by template name** (trimmed, case-insensitive). Deleting or renaming a template brings a fresh draft for that name.
4. **New job type `workout_template`**, payload `{ slot }`, output `WorkoutDraft`, using the same handler and 8 fetches.
5. **Cron.** `ensureSplitDrafts(deps)` runs last in each 5-minute tick. It queues at most one job, and only when none is queued or running, for the first day in split order that has no template and no pending draft. The whole split is ready in about 25 minutes, and B is written after A so it can differ.
6. **Background priority.** One job at a time; the router's 80 % background share applies.
7. **[A] Dismiss** rejects the draft and blocks that day for 28 days. There is no Regenerate button in this build.
8. **No LLM key.** The job fails without any external call, and the next draft waits 24 hours after a failed one.
9. **A draft is a reusable template, not a plan for one day.** It skips the readiness, fast-day, deload and neighbouring-day recovery cuts. The prompt carries the template name and "Already in Upper A" so B varies from A. Recovery is still checked when a session starts.
10. **Today uses the split template.** `planNextTrainingDay` skips a day whose split template exists, and Train's today card shows it as "Planned · your split". This is a small change to SPEC §9.
11. **Starting a named draft from the preview** saves it as a template first, so that day isn't drafted again.
12. **[A] A mid-session swap stays on the phone.** Sets already done stay on the old exercise. Open sets move to the new one as placeholders with the same reps and rest and no load. The Worker's start plan is not rewritten, as with Remove.
13. **Swap rule.** Shares a primary muscle *and* is the same kind of lift: strength and powerlifting together; cardio and Olympic lifts only with themselves (engine `swapCandidates`).
14. **Ranking.** 10 × shared primary + 4 if same mechanic + 3 if same equipment + 1 per shared secondary muscle, then by name. In swap mode the picker leaves out exercises already present, offers only equipment that appears among the candidates, and hides the category chip.
15. **Cut from this build:** the swap button on Train's template cards (the builder already swaps), and its REST route.

## Waves

| Wave | Agent | Files |
|---|---|---|
| 1 | Engine | `packages/shared/src/engine/lib/split.ts` (new), `lib/swap.ts` (new), `index.ts`, `tests/split.test.ts`, `tests/swap.test.ts` |
| 1 | Contracts | `packages/shared/src/schemas/training.ts`, `schemas/jobs.ts` |
| 1 | Mid-session swap | `apps/web/src/features/train/lib/logger-model.ts`, `actions.ts`, `ExerciseLogCard.tsx`, `SessionLogger.tsx`, `logger-model.test.ts` (new) |
| 2 | Worker drafts | `apps/worker/src/modules/workouts-ai/lib/split.ts` (new), `lib/plan.ts`, `index.ts`, `apps/worker/src/cron.ts`, `training/lib/swap.ts`, `apps/worker/test/split-drafts.test.ts` (new) |
| 2 | Picker | `apps/web/src/features/library/lib/filter.ts`, `ExercisePicker.tsx` |
| 2 | Draft card + labels | `apps/web/src/features/train/lib/DraftTemplateCard.tsx` (new), `builder/lib/AiWorkoutPage.tsx`, `builder/lib/AiWorkoutPreview.tsx`, `today/lib/event-view.ts`, `ai/lib/proposal-view.ts` |
| 3 | Train wiring | `train/lib/useTrainData.ts`, `TrainPage.tsx`, `TodayCard.tsx` |
| 3 | Docs (coordinator) | `GLOSSARY.md`, `docs/PROGRESS.md`, `docs/SPEC.md` §7 and §9 |

Then `pnpm check`, the new and touched tests, the cron and training tests, the e2e flows, a look at the running app, and `code-review` + `code-review-and-quality` before the push.

## Tests (known-good values)

- **Engine, split:**
  - `splitSlots(['mon','tue','wed','thu'])` names → `['Upper A','Lower A','Upper B','Lower B']`
  - `splitSlots(['fri','mon','wed'])` → mon Upper A, wed Lower A, fri Upper B
  - `splitSlot('sat', Mon–Thu)` → `null`
- **Engine, swap:**
  - Leg Press → `['Hack Squat','Barbell Squat','Leg Extensions']` (scores 20, 17, 13).
  - Excluded: stationary bike (cardio), Lying Leg Curls (hamstrings), and any exercise not allowed.
- **Worker, split drafts:**
  - No templates → queues `{ slot: { name: 'Upper A', focus: 'upper' } }`.
  - A second call → no new job ("a split draft is being written").
  - A failed job 2 h ago → waits; 25 h later → queues.
  - `planNextTrainingDay` on a Monday with an "Upper A" template → skip.
- **Web, logger model:**
  - [A: done, open, open; B: open ×3], swap A → C → order `[A, C, B]`. A keeps 1 set; C gets 2 placeholders numbered 1 and 2 with A's reps and rest and no load.
  - A → B (already present) → `null`.

## Risks

- **A draft can go stale after an equipment change.** Keep then answers 422 naming the exercise; the way out is Preview → swap → Save.
- **A swap made on one phone isn't seen on another** (the same as Remove today).
- **Up to four drafts show as proposals** on Today and the AI tab until kept or dismissed.
