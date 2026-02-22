# Overstory

Multi-agent orchestration system for Claude Code — spawn workers in git worktrees, coordinate via SQLite mail, merge with tiered conflict resolution.

## Overview

- **Runtime:** Bun (TypeScript, no build step)
- **Dependencies:** Zero runtime — only Bun built-in APIs
- **Architecture:** Hierarchical delegation (Coordinator → Supervisor → Workers)
- **Messaging:** SQLite-based mail system with typed protocol

## Structure

```
.
├── src/
│   ├── index.ts           # CLI entry (30 commands)
│   ├── types.ts           # Shared types
│   ├── errors.ts          # Error types (extend OverstoryError)
│   ├── commands/          # CLI subcommands
│   ├── agents/            # Agent lifecycle
│   ├── worktree/          # Git worktree + tmux
│   ├── mail/              # SQLite messaging
│   ├── merge/             # FIFO queue + conflict resolution
│   ├── watchdog/          # Health monitoring (tiered)
│   ├── logging/           # Multi-format logger
│   ├── metrics/           # Token/cost tracking
│   ├── sessions/          # Agent session store
│   ├── events/            # Event timeline
│   ├── beads/             # bd CLI wrapper
│   ├── mulch/             # mulch CLI wrapper
│   ├── doctor/            # Health checks (9 categories)
│   └── insights/          # Session analysis
├── agents/                # Base agent definitions (.md)
└── templates/             # Overlay templates
```

## Where to Look

| Task | Location |
|------|----------|
| Add CLI command | `src/commands/*.ts` |
| Agent lifecycle | `src/agents/` |
| Spawn mechanics | `src/worktree/` |
| Inter-agent messaging | `src/mail/` |
| Branch merging | `src/merge/` |
| Health monitoring | `src/watchdog/` |
| Cost tracking | `src/metrics/` |
| Error handling | `src/errors.ts` |

## Conventions

- **Formatting:** Tab indent, 100 char line width (Biome)
- **Types:** Strict mode, `noUncheckedIndexedAccess`, no `any`
- **Dependencies:** Zero runtime deps — Bun APIs only
- **Tests:** Colocated with source (`{module}.test.ts`)
- **SQLite:** Always WAL mode + busy timeout
- **Subprocess:** All via `Bun.spawn`, capture stdout/stderr

## Commands

```bash
bun test              # Run all tests
bun run lint          # biome check .
bun run typecheck     # tsc --noEmit
```

## Anti-Patterns

- **Never** use `as any` or `@ts-ignore` — fix types properly
- **Never** add runtime npm dependencies — use Bun built-ins
- **Never** push to canonical branch from agent worktrees
- **Never** mock unless real impl has unacceptable side effects
- **Always** handle `undefined` from index access (noUncheckedIndexedAccess)
- **Always** extend `OverstoryError` for custom errors

## Notes

- Agent definitions: Layer 1 (base .md in `agents/`) + Layer 2 (per-task overlay)
- Hierarchy limit: Default depth 2 (configurable in `.overstory/config.yaml`)
- Hooks: PreToolUse blocks file writes for read-only agents, dangerous git ops for all
- Session completion: Run quality gates → commit → `bd close` → push

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
