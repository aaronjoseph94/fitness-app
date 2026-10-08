<!-- Owns: the engineering workflow every agent follows in this repo — the order skills are used in, and a ready prompt for each common scenario. Harness-agnostic: works in Claude Code, Cursor, Codex, DeepSeek or any other agent; copy this file into another project as is. -->

# Engineering workflow and prompts

A professional sequence for building software with an AI agent, and a copy-paste prompt for each common job.

**Works in any tool.** Each step names a *skill* (Superpowers, Matt Pocock, Addy Osmani, Karpathy and others) and also says what to do.

- **If your tool supports skills,** it loads them.
- **If it doesn't,** the agent follows the words instead.

**Rules file.** `CLAUDE.md` / `AGENTS.md` below means whatever project-rules file your tool reads (Cursor: `.cursor/rules` or `AGENTS.md`).

---

## Part 1 — The sequence

| # | Phase | Skills | What it means |
|---|---|---|---|
| 0 | Start | `using-superpowers` | Read the rules file and progress notes; check for a matching skill before acting. |
| 1 | Understand | `brainstorming`, `domain-modeling` | Goal, constraints, "done" criteria; agree on terms; record big decisions (ADR). |
| 2 | Design | `codebase-design`, `security-and-hardening`*, `claude-api`†, `dataviz`‡ | Where it lives, its interface, seams and adapters. *Keys/auth/user data/money. †LLM features. ‡Charts. |
| 3 | Plan | `writing-plans`, `using-git-worktrees` | Small tasks, exact files, one test each; isolate big work. |
| 4 | Build | `subagent-driven-development` / `dispatching-parallel-agents` / `executing-plans`, `tdd`, `test-driven-development`, `karpathy-guidelines`, `frontend-ui-engineering` | Failing test first, smallest change, parallel agents where work splits cleanly. |
| 5 | Debug (any time) | `systematic-debugging`, `diagnosing-bugs` | Reproduce, find the root cause with evidence, then fix. |
| 6 | Verify | `verification-before-completion`, `run`, `browser-testing-with-devtools`, `e2e` | Show real output: typecheck, tests, the running app. |
| 7 | Review | `requesting-code-review`, `code-review`, `code-review-and-quality`, `security-review`, `receiving-code-review`, `simplify` | Standards + spec review, five-axis quality review, security; judge each finding; clean up. |
| 8 | Audit (web) | `web-quality-audit`, `accessibility`, `performance`, `core-web-vitals`, `best-practices`, `seo` | Before a release; `seo` only for public sites. |
| 9 | Ship | `finishing-a-development-branch`, `shipping-and-launch` | Merge and verify; launch checklist, monitoring, rollback. |

**How much to use:**
- **Typo or copy change:** 6.
- **Bug:** 5 → 6 → 7.
- **Small feature:** 2 → 4 → 6 → 7.
- **Big feature:** everything.

---

## Part 2 — Standing rules (paste once into the rules file, or above any prompt)

```
Working rules:
- Before acting, name the scenario from docs/ENGINEERING-WORKFLOW.md you are following and load its skills. If this tool has no skills, follow the steps as written.
- Read the project rules file and progress notes first. They override this file where they differ.
- Don't ask me questions mid-task unless a safety rule, a spec decision or money is at stake: state your assumption, pick, and record it in the progress notes.
- Simplest change that works; every changed line traces to the task. No new dependencies without asking.
- Never claim something works without evidence: paste the command and its real output.
- Never put a secret in code, a commit, a log or the chat.
- Finish with a plain-English summary: what changed, what you decided for me, what I need to do, and what you could not verify.
```

---

## Part 3 — Prompts by scenario

Fill in the `<…>` parts and paste. Each prompt assumes the standing rules above.

### 1. New feature

```
Feature: <what, in one or two sentences>
Why: <the outcome I care about>

1. Restate goal, constraints and "done" in ≤5 lines (brainstorming). Record assumptions.
2. Design with codebase-design: which module owns it, its interface, the seam tests use. If it touches keys, auth, user data or money, apply security-and-hardening now.
3. Plan with writing-plans: exact files, one test per task, parallel groups with no file shared within a group.
4. Build test-first (tdd + test-driven-development), following karpathy-guidelines. Use frontend-ui-engineering for any UI. Use parallel agents where the work splits cleanly.
5. Verify (verification-before-completion): typecheck, relevant tests, the running app; paste results.
6. Review with code-review and code-review-and-quality; fix real findings; run simplify.
7. Update docs and progress notes, commit, push, summarise.
```

### 2. Bug fix

```
Bug: <what I saw, where, when; steps if known>

Use systematic-debugging (or diagnosing-bugs):
1. Reproduce it and show the evidence.
2. Find the root cause before changing anything; explain it in two sentences.
3. Write a test that fails because of the bug.
4. Fix with the smallest change; the test now passes.
5. Run related tests and check nearby code for the same mistake.
6. code-review on the diff, commit, push, tell me in plain words what was wrong.
```

### 3. Small change or tweak (copy, colour, label, setting)

```
Change: <exactly what should be different>

Make the smallest change that does it (karpathy-guidelines). Keep every test id and accessible name. Typecheck the package, run the one relevant test, show me a screenshot if it's visible, commit and push.
```

### 4. UI or design change

```
Design change: <what, and a link/image/mockup if I have one>

1. Use frontend-ui-engineering. Use only the project's design tokens and component kit; no hard-coded colours.
2. Plan the screens and components touched; keep data hooks, routes and test ids as they are (presentation only unless I say otherwise).
3. Build, then check at phone (390 px) and desktop (1440 px) widths with screenshots.
4. Run accessibility checks (contrast, focus, labels, 320 px reflow) and the e2e flows for those screens.
5. code-review-and-quality, commit, push, show me before/after screenshots.
```

### 5. Refactor or cleanup (no behaviour change)

```
Refactor: <what is messy and why it matters>

1. Use codebase-design: say what the module's interface should become and why it's deeper/simpler.
2. Make sure tests cover the current behaviour first; add a test at the seam if not.
3. Refactor in small steps, running the tests after each.
4. Behaviour must not change: same tests pass, same API, same UI.
5. simplify, code-review, commit, push, summarise what got simpler.
```

### 6. Add or improve tests

```
Test: <the area, or "find the riskiest untested code">

Use tdd to pick the agreed seams (public entry points, not internals). Write a few high-value tests that assert known-good values from the spec, not values recomputed the way the code does. Make sure each fails when the behaviour breaks (break it briefly to prove it). Commit and push.
```

### 7. Performance problem

```
Slow: <what is slow, where, how slow>

Use performance-optimization (and core-web-vitals for web pages):
1. Measure first: real numbers (trace, Lighthouse, timings), not guesses.
2. Find the biggest cost; explain it.
3. Fix that one thing; measure again and show before/after.
4. Stop when the target is met or the next fix isn't worth it. Commit, push, report the numbers.
```

### 8. Security review

```
Security review: <whole app, or the area/feature>

Use security-and-hardening and security-review:
- Inputs and validation, auth and sessions, secrets handling, data stored and sent, third-party calls, dependency audit.
- Each finding: severity, where (file:line), how it could be exploited, the fix.
- Verify each finding is real before reporting it. Fix the high/critical ones; list the rest for my decision.
```

### 9. Code review (of recent work)

```
Review: <the commits, branch, or "everything since <commit>">

1. requesting-code-review, then run in parallel:
   - code-review (project standards + the spec)
   - code-review-and-quality (correctness, readability, architecture, security, performance)
2. receiving-code-review: verify each finding. Drop false ones and say why.
3. Fix the confirmed ones, re-run checks, commit, push. Give me the list: fixed / not fixed and why.
```

### 10. Dependency upgrade

```
Upgrade: <a package, or "check everything">

1. List every dependency: current version, latest version, release date, major/minor/patch.
2. Check what blocks each one: peer dependencies, runtime version, breaking changes in the release notes, security advisories.
3. Group into safe now / later one by one / leave, with reasons.
4. With my go: upgrade the safe group in one commit using the lockfile tooling (never hand-edit the lockfile), then run the typecheck, all tests and the e2e flows. Push only if everything is green.
```

### 11. Database or schema change

```
Data change: <new table/column/index, or a data fix>

1. Design the schema change with codebase-design; prefer additive changes (add column) over table rebuilds.
2. Generate the migration with the project's tool; never apply schema by hand or with a "push" command.
3. Read the generated SQL; flag anything that rebuilds a table or could lose data.
4. Apply locally, run the seed and the tests that touch it.
5. Write the deploy step and the rollback for me. Don't run it against production.
```

### 12. AI / LLM feature

```
AI feature: <what the model should do>

1. Load claude-api (for Claude) or the provider's docs; check current model ids and prices, not from memory.
2. Every model output is validated against a schema before use; the model never writes to the database directly.
3. Keep keys in server secrets only. Never send personal data the privacy rules exclude.
4. Bound cost: deadlines, retry limits, daily caps.
5. Test with a fake model at the adapter seam; then one real call with my key if I provide it.
```

### 13. Plan only (no code)

```
Plan: <the feature or change>

Use brainstorming, then writing-plans. Don't write product code. Deliver: goal and non-goals, decisions made for me, files touched, data changes, tests, risks, and tasks grouped so parallel agents never share a file. Save it in docs/ and wait for my go.
```

### 14. Research or question (no changes)

```
Question: <what I want to know>

Answer from the code and real sources: file:line for code facts, links for outside facts. Don't change any files. Plain words first, details after. Say what you couldn't verify.
```

### 15. Understand an unfamiliar codebase

```
Explain this codebase to me: <the whole thing, or an area>

Read the rules file, the spec and the module entry points. Give me: what it does, the main parts and how they talk, where data lives, how to run and test it, and the three things most likely to bite a newcomer. Use domain-modeling terms from the glossary. No code changes.
```

### 16. Production incident

```
Incident: <what's broken in production, since when, who's affected>

1. Stabilise first: say whether a rollback to the last good version is the fastest fix, and give me the exact command. Don't run it without my go.
2. Then systematic-debugging: logs, recent deploys and changes; find the root cause with evidence.
3. Fix it with a test that would have caught it; verify locally.
4. Write a short incident note: what happened, impact, cause, fix, how we prevent it.
```

### 17. Deploy or release

```
Release: <what's going out>

Use shipping-and-launch:
1. Pre-flight: typecheck, all tests, e2e, audit, migrations reviewed.
2. Write the exact deploy steps, the smoke checks after, and the rollback.
3. Only deploy if I've said so and the tools are authorised; otherwise give me the steps.
4. After deploy: run the smoke checks and report results with the version id.
```

### 18. Web quality / accessibility audit

```
Audit: <the site or pages>

Use web-quality-audit, then accessibility, performance, core-web-vitals and best-practices as needed. Measure at phone and desktop sizes. Each finding: impact, evidence, fix. Fix the high-impact ones, re-measure, and report before/after.
```

### 19. Documentation

```
Docs: <what needs documenting, for whom>

Write for the reader named above, in plain words. Check every command and path against the repo before writing it down. Short sections, real examples, no filler. Commit and push.
```

### 20. Hand off to another agent or tool

```
Handoff: <what the other agent should do>

Write a self-contained runbook: the rules it must follow (copied, not referenced), the exact steps with the command, what to expect and what to do if it fails, which steps need me, and how to report back. It must work for an agent that has never seen this conversation. Save it in docs/.
```

---

## Using this file in other tools

- **Claude Code:** keep it at `docs/ENGINEERING-WORKFLOW.md` and point `CLAUDE.md` at it (this repo does).
- **Cursor, Codex, DeepSeek or other harnesses:**
  1. Copy this file into the project.
  2. Add the Part 2 standing rules to that tool's rules file (`AGENTS.md`, `.cursor/rules/*.md`, or the system prompt).
  3. Copy the skills folders (`.claude/skills/` → `.agents/skills/`) so the named skills exist there.
  4. If the tool has no skills at all, the prompts still work, because each step says what to do.
- **Built into Claude Code, not in the skills folder:** `claude-api`, `dataviz`, `run`, `simplify`, `security-review`. Other tools follow those steps as written. For `claude-api`, read the provider's current docs instead of relying on memory.
- **Chat-only models (no repo access):** paste the Part 2 rules and the scenario prompt. Then paste the relevant code with it.
