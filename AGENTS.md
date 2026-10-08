<!-- Owns: the entry point for non-Claude agents (Cursor, Codex, DeepSeek and others that read AGENTS.md). It points at the same rules Claude Code follows, so every harness works the same way. -->

# Agent instructions

1. **Project rules:** read [`CLAUDE.md`](CLAUDE.md) first. It is the rules file for every agent, not just Claude: stack, rails that must never break, conventions, commands.
2. **Workflow and prompts:** follow [`docs/ENGINEERING-WORKFLOW.md`](docs/ENGINEERING-WORKFLOW.md). Name the scenario you are following before you start, and use its steps.
3. **Skills:** the named skills live in `.claude/skills/` (mirrored for Cursor in `.agents/skills/`). If your tool cannot load them, follow the steps as written.
4. **Source of truth:** [`docs/SPEC.md`](docs/SPEC.md). Progress and decisions: [`docs/PROGRESS.md`](docs/PROGRESS.md).
