# Wave 7: Templates and Documentation - Notepad

## Accumulated Context

### Platform Architecture
- **Claude Code**: Uses `.claude/CLAUDE.md` for context, `.claude/settings.local.json` for hooks
- **Opencode**: Uses `AGENTS.md` for context (project root), `~/.config/opencode/hooks.json` for hooks

### Source Files
- `templates/overlay.md.tmpl` - Current overlay template (Claude-focused)
- `templates/hooks.json.tmpl` - Claude hooks template
- `CLAUDE.md` - Root documentation file
- `src/platform/opencode/index.ts` - Opencode platform implementation with hooks structure
- `src/platform/opencode/context.ts` - Opencode context generation (AGENTS.md format)

### Opencode Hooks Structure
From `src/platform/opencode/index.ts`, Opencode uses:
```json
{
  "hooks": {
    "SessionStart": [],
    "UserPromptSubmit": [],
    "PreToolUse": [],
    "PostToolUse": [],
    "Stop": [],
    "PreCompact": []
  }
}
```

Hooks are stored in `~/.config/opencode/hooks.json`.

### Opencode Context Format
From `src/platform/opencode/context.ts`:
- File name: `AGENTS.md` (in project root)
- Similar structure to CLAUDE.md but tailored for Opencode

### Claude Hooks for Reference
From `templates/hooks.json.tmpl`:
- SessionStart: `overstory prime --agent {{AGENT_NAME}}`
- UserPromptSubmit: `overstory mail check --inject --agent {{AGENT_NAME}}`
- PreToolUse: `overstory log tool-start` + git push blocking
- PostToolUse: `overstory log tool-end`, `overstory mail check`, git commit mulch
- Stop: `overstory log session-end`, `mulch learn`
- PreCompact: `overstory prime --agent {{AGENT_NAME}} --compact`

## Task Dependencies
- Task 27 (overlay.md.tmpl) depends on: Task 11 (Opencode context generation) - DONE
- Task 28 (opencode-hooks.json.tmpl) depends on: Task 10 (Opencode hook system) - DONE
- Task 29 (CLAUDE.md) can run independently
- Task 30 (MIGRATION.md) can run independently

All dependencies are complete. All 4 tasks can run in parallel.

## Wave 7 Tasks
1. Task 27: Update overlay.md.tmpl to be platform-aware
2. Task 28: Create opencode-hooks.json.tmpl
3. Task 29: Update CLAUDE.md with Opencode documentation
4. Task 30: Create MIGRATION.md migration guide
Created MIGRATION.md with comprehensive instructions for moving from Claude Code to Opencode. The guide emphasizes that migration is optional and documents key changes in configuration, hook locations, and context file naming (AGENTS.md).

## Test Platform Abstraction (Task 32)

### Key Changes
- Added `OVERSTORY_SKIP_PLATFORM_CHECK` environment variable to `src/platform/factory.ts`
- This allows tests to create platform instances without the CLI being installed
- Test files set this in their `beforeEach` hook

### Pattern for Platform-Aware Tests
Tests that call `createPlatform()` should:
1. Set `process.env.OVERSTORY_SKIP_PLATFORM_CHECK = "true"` in beforeEach
2. Use `getMockContextDir()` and `getMockHooksConfigPath()` from test-helpers.ts
3. These helpers return correct paths for the platform being tested

### Test Files Updated
- `src/commands/hooks.test.ts` - Uses platform abstraction helpers
- `src/platform/factory.ts` - Added skip check for tests

### Remaining Failing Tests
12 tests still fail due to:
- AI resolver tests need actual AI mocking
- E2E platform tests need actual CLI binaries
- costs --self tests need transcript files
- mulch search tests need actual mulch CLI

These are pre-existing issues not related to platform abstraction.
