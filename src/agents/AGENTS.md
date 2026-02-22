# Agents

Agent lifecycle management — manifest, identity, overlay generation, checkpointing.

## Overview

Manages agent definitions, spawning preparation, and session persistence. Agent definitions are two-layer: base `.md` files define HOW, dynamic overlays define WHAT.

## Structure

| File | Purpose |
|------|---------|
| `manifest.ts` | Agent registry — load base definitions, query capabilities |
| `overlay.ts` | Dynamic CLAUDE.md overlay generator (task-specific context) |
| `identity.ts` | Persistent agent identity (CVs stored in `.overstory/agents/`) |
| `lifecycle.ts` | Session handoff — checkpoint/resume/complete |
| `checkpoint.ts` | Session checkpoint save/load/clear |
| `hooks-deployer.ts` | Deploy hooks config + tool enforcement to worktree |

## Concepts

### Agent Types (from `agents/`)

| Type | Depth | Can Spawn | Access |
|------|-------|-----------|--------|
| `coordinator` | 0 | Leads only | Read-only |
| `supervisor` | 1 | Workers | Read-only |
| `lead` | 1 | Workers | Read-write |
| `scout` | 2 | No | Read-only |
| `builder` | 2 | No | Read-write |
| `reviewer` | 2 | No | Read-only |
| `merger` | 2 | No | Read-write |
| `monitor` | — | No | Read-only (tier 2 patrol) |

### Overlay Generation

When spawning an agent, `overlay.ts` generates a task-specific CLAUDE.md containing:
- Agent name and task ID
- File scope (exclusive file ownership)
- Spec path
- Branch name and worktree path
- Parent agent reference
- Hierarchy depth

### Identity Persistence

Agent CVs live in `.overstory/agents/{name}/identity.yaml`:
- Capability type
- Spawn count (total, successful, failed)
- File scope patterns
- Historical performance

### Checkpointing

Session state for compaction recovery:
- Active todos
- Recent tool calls
- Mail thread context
- Partial results

Stored in `.overstory/agents/{name}/checkpoint.json`

## Anti-Patterns

- **Never** spawn beyond max hierarchy depth
- **Never** allow read-only agents file write access
- **Always** validate capability exists before spawning
- **Always** clean up checkpoint after successful completion

## Where to Look

| Task | Location |
|------|----------|
| Add agent type | `agents/*.md` (base definitions) |
| Modify overlay format | `agents/overlay.ts` |
| Query agent capabilities | `agents/manifest.ts` |
| Session recovery | `agents/checkpoint.ts` |
| Identity persistence | `agents/identity.ts` |
