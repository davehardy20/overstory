# Commands

CLI command implementations — 30+ commands for agent orchestration.

## Overview

Each file exports a command handler matching the CLI interface. Commands follow consistent patterns: argument parsing → config loading → store initialization → execution → output formatting.

## Structure

| File | Command | Purpose |
|------|---------|---------|
| `agents.ts` | `agents discover` | Query agents by capability/state/parent |
| `init.ts` | `init` | Initialize .overstory/ in project |
| `sling.ts` | `sling <task>` | Spawn worker agents |
| `prime.ts` | `prime` | Load orchestrator context |
| `status.ts` | `status` | Fleet status overview |
| `dashboard.ts` | `dashboard` | Live TUI dashboard |
| `inspect.ts` | `inspect <agent>` | Deep agent inspection |
| `coordinator.ts` | `coordinator start/stop/status` | Persistent orchestrator |
| `supervisor.ts` | `supervisor start/stop/status` | Per-project supervisor |
| `hooks.ts` | `hooks install/uninstall/status` | Orchestrator hooks |
| `mail.ts` | `mail send/check/list/read/reply/purge` | Inter-agent messaging |
| `nudge.ts` | `nudge <agent>` | Text nudge via tmux |
| `merge.ts` | `merge` | Branch merging with conflict resolution |
| `spec.ts` | `spec write` | Task spec management |
| `group.ts` | `group create/status/add/remove/list` | Task group tracking |
| `clean.ts` | `clean` | Nuclear cleanup of runtime state |
| `doctor.ts` | `doctor` | Health check runner |
| `worktree.ts` | `worktree list/clean` | Worktree management |
| `log.ts` | `log <event>` | Hook event logging |
| `logs.ts` | `logs` | NDJSON log query |
| `feed.ts` | `feed` | Unified event stream |
| `watch.ts` | `watch` | Watchdog daemon |
| `monitor.ts` | `monitor start/stop/status` | Tier 2 monitor agent |
| `trace.ts` | `trace <target>` | Event timeline |
| `errors.ts` | `errors` | Aggregated error view |
| `replay.ts` | `replay` | Multi-agent replay |
| `run.ts` | `run list/show/complete` | Run lifecycle |
| `stop.ts` | `stop <agent>` | Terminate agent |
| `costs.ts` | `costs` | Token/cost analysis |
| `metrics.ts` | `metrics` | Session metrics |
| `completions.ts` | `--completions` | Shell completion generation |

## Conventions

- **Args:** Parse manually with `getFlag()`, `hasFlag()` helpers (no arg parsing library)
- **Config:** Always call `loadConfig()` after parsing global flags
- **Stores:** Use `{Store}Store` classes for state persistence
- **Output:** Support `--json` flag for programmatic consumption
- **Errors:** Throw typed errors extending `OverstoryError`

## Pattern

```typescript
export async function myCommand(args: string[]): Promise<void> {
  // 1. Parse args
  const json = hasFlag(args, '--json');
  const name = getFlag(args, '--name');
  
  // 2. Load config
  const config = await loadConfig();
  
  // 3. Initialize stores
  const store = new SessionStore(config);
  
  // 4. Execute
  const result = await doWork(config, store);
  
  // 5. Output
  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(formatForHumans(result));
  }
}
```

## Anti-Patterns

- **Never** use a CLI arg parsing library — manual parsing only
- **Never** print directly without checking `--json` flag
- **Always** handle `--quiet` / `-q` flag when present
