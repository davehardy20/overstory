# Port Overstory to Opencode

## TL;DR

> **Full port of Overstory from Claude Code to Opencode.**
>
> This plan creates a platform abstraction layer that allows Overstory to work with either Claude Code or Opencode, with Opencode as the primary target. The port involves creating platform-specific adapters for hooks, CLI spawning, context files, and transcript discovery.
>
> **Estimated Effort:** Large (~150-200 hours)
> **Parallel Execution:** YES - 8 waves
> **Critical Path:** Platform Interface → Opencode Implementation → Migration → Testing

---

## Context

### Original Request
Port the entire Overstory codebase to work within Opencode instead of Claude Code.

### Current State Analysis

**Claude Code Dependencies Found:**
- **Hook System:** Uses `.claude/settings.local.json` with lifecycle hooks (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, PreCompact)
- **CLI Spawning:** Spawns `claude --model {model} --dangerously-skip-permissions` in tmux sessions
- **Context Files:** Agents read task context from `.claude/CLAUDE.md`
- **Transcript Discovery:** Reads session metrics from `~/.claude/projects/{project-key}/*.jsonl`
- **AI Calls:** Uses `claude --print -p` for non-interactive AI operations (merge resolution, triage)

**Opencode Equivalents:**
- **Hook System:** Uses `~/.config/opencode/` configuration directory with different hook mechanism
- **CLI Spawning:** Opencode has its own CLI but different invocation pattern
- **Context Files:** Opencode uses `AGENTS.md` files in project directories
- **Transcript Discovery:** Opencode stores session data in `~/.config/opencode/logs/`

### Architecture Decision

Create a **platform abstraction layer** in `src/platform/` that defines interfaces for:
1. Platform detection and configuration
2. Hook deployment and management
3. Agent CLI spawning
4. Context file generation
5. Transcript/metrics discovery

This allows Overstory to support both platforms simultaneously, with platform selection via configuration.

---

## Work Objectives

### Core Objective
Create a fully functional Overstory port that runs on Opencode with feature parity to the Claude Code version.

### Concrete Deliverables
1. **Platform Abstraction Layer** (`src/platform/`)
   - `interface.ts` - Core platform interface definitions
   - `factory.ts` - Platform detection and instantiation
   - `claude.ts` - Claude Code platform implementation
   - `opencode.ts` - Opencode platform implementation
   - `types.ts` - Shared platform types

2. **Hook System Port** (`src/hooks/`)
   - `interface.ts` - Hook system interface
   - `claude-hooks.ts` - Claude Code hook format
   - `opencode-hooks.ts` - Opencode hook format
   - `deployer.ts` - Platform-agnostic hook deployment

3. **Context File Port** (`src/context/`)
   - `interface.ts` - Context file interface
   - `claude-context.ts` - `.claude/CLAUDE.md` generation
   - `opencode-context.ts` - `AGENTS.md` generation

4. **Agent Spawning Port** (`src/spawn/`)
   - `interface.ts` - Spawning interface
   - `claude-spawn.ts` - Claude CLI spawning
   - `opencode-spawn.ts` - Opencode CLI spawning

5. **Metrics/Transcript Port** (`src/metrics/`)
   - `interface.ts` - Metrics discovery interface
   - `claude-metrics.ts` - Claude transcript discovery
   - `opencode-metrics.ts` - Opencode transcript discovery

6. **Updated Commands**
   - Modified `src/commands/hooks.ts` for platform-aware hook management
   - Modified `src/commands/sling.ts` for platform-aware spawning
   - Modified `src/commands/coordinator.ts`, `supervisor.ts`, `monitor.ts`
   - Modified `src/agents/overlay.ts` for platform-aware context generation
   - Modified `src/agents/hooks-deployer.ts` for platform-aware hook deployment
   - Modified `src/merge/resolver.ts` for platform-aware AI resolution
   - Modified `src/watchdog/triage.ts` for platform-aware triage

7. **Configuration Updates**
   - Updated `src/config.ts` with platform selection
   - Updated `src/types.ts` with platform configuration types

8. **Template Updates**
   - `templates/overlay.md.tmpl` - Platform-aware overlay template
   - `templates/hooks.json.tmpl` - Platform-aware hooks template
   - New `templates/opencode-hooks.json.tmpl` - Opencode-specific hooks

9. **Test Suite**
   - Platform-specific test adapters
   - Updated existing tests for platform abstraction
   - New tests for Opencode platform implementation

10. **Documentation**
    - Updated `CLAUDE.md` → `AGENTS.md` with Opencode instructions
    - Migration guide for existing users
    - Platform-specific configuration guide

### Definition of Done
- [ ] All 30 CLI commands work with Opencode
- [ ] Agent spawning works in Opencode environment
- [ ] Hook system deploys to Opencode correctly
- [ ] Context files (AGENTS.md) are generated properly
- [ ] SQLite mail system works unchanged
- [ ] Git worktree isolation works unchanged
- [ ] All 2000+ tests pass
- [ ] Documentation is complete and accurate

### Must Have
- Platform abstraction layer supporting both Claude Code and Opencode
- Full feature parity with original Claude Code version
- Backward compatibility for existing Claude Code users
- Clear migration path documentation

### Must NOT Have (Guardrails)
- Breaking changes to core architecture (mail, worktrees, sessions)
- Removal of Claude Code support (must support both)
- Changes to SQLite database schemas
- Changes to agent definition format (agents/*.md)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists:** YES (bun test)
- **Automated tests:** YES (TDD for new platform code, then integration)
- **Framework:** bun test

### QA Policy
Every task MUST include agent-executed QA scenarios:
- **CLI commands:** Bash execution with output verification
- **File generation:** File existence and content verification
- **Spawning:** Process verification via tmux/pid checks
- **Hooks:** Configuration file verification

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - Platform Abstraction):
├── Task 1: Create platform interface definitions
├── Task 2: Create platform factory and detection
├── Task 3: Create platform types and utilities
└── Task 4: Update config.ts with platform selection

Wave 2 (Claude Platform Implementation - reference):
├── Task 5: Implement Claude platform adapter
├── Task 6: Implement Claude hook system
├── Task 7: Implement Claude context generation
└── Task 8: Implement Claude agent spawning

Wave 3 (Opencode Platform Implementation):
├── Task 9: Implement Opencode platform adapter
├── Task 10: Implement Opencode hook system
├── Task 11: Implement Opencode context generation
└── Task 12: Implement Opencode agent spawning

Wave 4 (Metrics and AI Features):
├── Task 13: Implement Opencode metrics discovery
├── Task 14: Update merge resolver for Opencode AI
├── Task 15: Update watchdog triage for Opencode AI
└── Task 16: Update transcript parser for Opencode format

Wave 5 (Command Migration - parallel by command):
├── Task 17: Update hooks.ts command
├── Task 18: Update sling.ts command
├── Task 19: Update coordinator.ts command
├── Task 20: Update supervisor.ts command
├── Task 21: Update monitor.ts command
└── Task 22: Update costs.ts command

Wave 6 (Agent System Migration):
├── Task 23: Update agents/overlay.ts
├── Task 24: Update agents/hooks-deployer.ts
├── Task 25: Update agent manifest loading
└── Task 26: Create Opencode agent base definitions

Wave 7 (Templates and Documentation):
├── Task 27: Update overlay.md.tmpl
├── Task 28: Create opencode-hooks.json.tmpl
├── Task 29: Update CLAUDE.md → AGENTS.md
└── Task 30: Create migration guide

Wave 8 (Testing and Verification):
├── Task 31: Create platform test utilities
├── Task 32: Update existing tests for abstraction
├── Task 33: Write Opencode platform tests
├── Task 34: Write integration tests
└── Task 35: Final verification and bug fixes

Wave FINAL (Review):
├── Task F1: Code review (oracle)
├── Task F2: Test coverage review
├── Task F3: Documentation review
└── Task F4: Performance review
```

---

## TODOs

- [x] 1. Create Platform Interface Definitions

  **What to do**:
  - Create `src/platform/interface.ts` with core platform interface
  - Define `IPlatform` interface with methods: getName(), getConfigDir(), getContextDir(), getHooksConfigPath(), spawnAgent(), generateContextFile(), discoverTranscripts(), callAI()
  - Define `IPlatformHooks` interface for hook system abstraction
  - Define `IPlatformContext` interface for context file generation
  - Define `IPlatformSpawner` interface for agent spawning
  - Define `IPlatformMetrics` interface for transcript/metrics discovery

  **Must NOT do**:
  - Do NOT implement any platform-specific logic in this file (keep it interfaces only)
  - Do NOT add dependencies on existing code

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 2, 5, 9
  - **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] `src/platform/interface.ts` exists with all interface definitions
  - [ ] All interfaces are properly typed with TypeScript
  - [ ] bun run typecheck passes with no errors

  **QA Scenarios**:
  ```
  Scenario: Interface compilation
    Tool: Bash
    Steps:
      1. Run `bun run typecheck`
    Expected Result: No TypeScript errors in src/platform/interface.ts
    Evidence: Terminal output showing success
  ```

  **Commit**: YES
  - Message: `feat(platform): add core platform interface definitions`
  - Files: `src/platform/interface.ts`

- [x] 2. Create Platform Factory and Detection

  **What to do**:
  - Create `src/platform/factory.ts` with platform detection logic
  - Implement `detectPlatform()` that checks for Claude vs Opencode availability
  - Implement `createPlatform(platformType)` factory function
  - Support 'auto' detection mode
  - Add platform configuration to OverstoryConfig type

  **Must NOT do**:
  - Do NOT hardcode platform paths (use detection)
  - Do NOT import platform implementations (use dynamic imports)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 1)
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 5, 9
  - **Blocked By**: Task 1 (interfaces)

  **Acceptance Criteria**:
  - [ ] `src/platform/factory.ts` exists with detection logic
  - [ ] `detectPlatform()` returns correct platform type
  - [ ] Factory can instantiate both Claude and Opencode platforms

  **QA Scenarios**:
  ```
  Scenario: Platform detection
    Tool: Bash
    Steps:
      1. Create test file src/platform/factory.test.ts
      2. Test detection when Claude is available
      3. Test detection when Opencode is available
      4. Test 'auto' mode selection
    Expected Result: Correct platform detected in each scenario
    Evidence: Test output showing PASS
  ```

  **Commit**: YES
  - Message: `feat(platform): add platform factory and detection`
  - Files: `src/platform/factory.ts`, `src/platform/factory.test.ts`

- [x] 3. Create Platform Types and Utilities

  **What to do**:
  - Create `src/platform/types.ts` with shared platform types
  - Define `PlatformType = 'claude' | 'opencode'`
  - Define `PlatformConfig` interface
  - Create `src/platform/utils.ts` with shared utilities (path resolution, etc.)

  **Must NOT do**:
  - Do NOT add platform-specific types here (keep shared only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 1, 2)
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 5, 9
  - **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] `src/platform/types.ts` exists with shared types
  - [ ] `src/platform/utils.ts` exists with utilities
  - [ ] Types are properly exported

  **Commit**: YES
  - Message: `feat(platform): add shared types and utilities`
  - Files: `src/platform/types.ts`, `src/platform/utils.ts`

- [x] 4. Update Config.ts with Platform Selection

  **What to do**:
  - Add `platform` field to `OverstoryConfig` type in `src/types.ts`
  - Add platform configuration to `DEFAULT_CONFIG` in `src/config.ts`
  - Update config.yaml parsing to support platform selection
  - Add validation for platform configuration

  **Must NOT do**:
  - Do NOT change existing config structure (add, don't replace)
  - Do NOT make platform selection required (default to 'auto')

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: NO (must wait for types)
  - **Parallel Group**: Wave 1
  - **Blocks**: Wave 2, 3, 4, 5, 6
  - **Blocked By**: Task 3 (types)

  **Acceptance Criteria**:
  - [ ] `src/types.ts` updated with platform configuration
  - [ ] `src/config.ts` updated with platform default
  - [ ] Config parsing supports platform field
  - [ ] Existing tests still pass

  **QA Scenarios**:
  ```
  Scenario: Config loading with platform
    Tool: Bash
    Steps:
      1. Create test config with platform: opencode
      2. Run config loading test
      3. Verify platform is parsed correctly
    Expected Result: Config loads with platform=opencode
    Evidence: Test output showing correct config
  ```

  **Commit**: YES
  - Message: `feat(config): add platform selection configuration`
  - Files: `src/types.ts`, `src/config.ts`, `src/config.test.ts`

---

**Wave 1 Complete:** Platform abstraction foundation ready

---

- [x] 5. Implement Claude Platform Adapter

  **What to do**:
  - Create `src/platform/claude.ts` implementing IPlatform
  - Implement all required methods with Claude-specific logic
  - Use existing code patterns from current implementation
  - Extract and refactor existing Claude-specific code

  **Must NOT do**:
  - Do NOT change existing behavior (extract, don't modify)
  - Do NOT remove existing code yet (copy to adapter first)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 6, 7, 8)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 32 (tests)
  - **Blocked By**: Tasks 1, 2, 3, 4

  **Acceptance Criteria**:
  - [ ] `src/platform/claude.ts` implements all IPlatform methods
  - [ ] All methods have Claude-specific implementations
  - [ ] Code compiles without errors

  **QA Scenarios**:
  ```
  Scenario: Claude platform instantiation
    Tool: Bash
    Steps:
      1. Import and create ClaudePlatform instance
      2. Verify all methods are implemented
    Expected Result: Instance created with all methods callable
    Evidence: Test output
  ```

  **Commit**: YES
  - Message: `feat(platform): implement Claude Code platform adapter`
  - Files: `src/platform/claude.ts`

- [x] 6. Implement Claude Hook System

  **What to do**:
  - Create `src/platform/claude-hooks.ts` implementing IPlatformHooks
  - Extract hook deployment logic from existing `src/agents/hooks-deployer.ts`
  - Support Claude's settings.local.json format
  - Implement all lifecycle hooks (SessionStart, UserPromptSubmit, etc.)

  **Must NOT do**:
  - Do NOT modify existing hook deployer yet (create new file)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 5, 7, 8)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 32
  - **Blocked By**: Tasks 1, 2

  **Acceptance Criteria**:
  - [ ] `src/platform/claude-hooks.ts` implements IPlatformHooks
  - [ ] All Claude lifecycle hooks supported
  - [ ] Hook format matches existing implementation

  **QA Scenarios**:
  ```
  Scenario: Claude hooks deployment
    Tool: Bash
    Steps:
      1. Create test worktree
      2. Deploy hooks via ClaudeHooks.deploy()
      3. Verify .claude/settings.local.json created
    Expected Result: Hooks file exists with correct format
    Evidence: File content verification
  ```

  **Commit**: YES
  - Message: `feat(platform): implement Claude Code hook system`
  - Files: `src/platform/claude-hooks.ts`

- [x] 7. Implement Claude Context Generation

  **What to do**:
  - Create `src/platform/claude-context.ts` implementing IPlatformContext
  - Extract context generation from `src/agents/overlay.ts`
  - Generate `.claude/CLAUDE.md` format
  - Support all existing overlay features

  **Must NOT do**:
  - Do NOT change overlay template format

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 5, 6, 8)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 32
  - **Blocked By**: Tasks 1, 2

  **Acceptance Criteria**:
  - [ ] `src/platform/claude-context.ts` implements IPlatformContext
  - [ ] Generates correct .claude/CLAUDE.md format
  - [ ] All overlay fields supported

  **Commit**: YES
  - Message: `feat(platform): implement Claude Code context generation`
  - Files: `src/platform/claude-context.ts`

- [x] 8. Implement Claude Agent Spawning

  **What to do**:
  - Create `src/platform/claude-spawn.ts` implementing IPlatformSpawner
  - Extract spawning logic from `src/commands/sling.ts`, `coordinator.ts`, etc.
  - Support `claude --model {model} --dangerously-skip-permissions`
  - Handle tmux session creation

  **Must NOT do**:
  - Do NOT change existing spawn command format

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 5, 6, 7)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 32
  - **Blocked By**: Tasks 1, 2

  **Acceptance Criteria**:
  - [ ] `src/platform/claude-spawn.ts` implements IPlatformSpawner
  - [ ] Generates correct Claude CLI command
  - [ ] Supports all existing flags and options

  **Commit**: YES
  - Message: `feat(platform): implement Claude Code agent spawning`
  - Files: `src/platform/claude-spawn.ts`

---

**Wave 2 Complete:** Claude platform abstraction ready

---

- [x] 9. Implement Opencode Platform Adapter

  **What to do**:
  - Create `src/platform/opencode.ts` implementing IPlatform
  - Research Opencode's CLI and configuration structure
  - Implement all required methods with Opencode-specific logic

  **Must NOT do**:
  - Do NOT assume Opencode works like Claude (research first)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 10, 11, 12)
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 13, 14, 15, 16, 33
  - **Blocked By**: Tasks 1, 2, 3, 4

  **Acceptance Criteria**:
  - [ ] `src/platform/opencode.ts` implements all IPlatform methods
  - [ ] All methods have Opencode-specific implementations
  - [ ] Code compiles without errors

  **QA Scenarios**:
  ```
  Scenario: Opencode platform instantiation
    Tool: Bash
    Steps:
      1. Import and create OpencodePlatform instance
      2. Verify getName() returns 'opencode'
      3. Verify getConfigDir() returns correct path
    Expected Result: Instance created with correct configuration
    Evidence: Test output
  ```

  **Commit**: YES
  - Message: `feat(platform): implement Opencode platform adapter`
  - Files: `src/platform/opencode.ts`

- [x] 10. Implement Opencode Hook System

  **What to do**:
  - Create `src/platform/opencode-hooks.ts` implementing IPlatformHooks
  - Research Opencode's hook mechanism
  - Implement hook deployment to Opencode's config directory
  - Map Claude lifecycle hooks to Opencode equivalents

  **Must NOT do**:
  - Do NOT assume hook format is same as Claude

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 9, 11, 12)
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 17, 23, 24, 33
  - **Blocked By**: Tasks 1, 2, 9

  **Acceptance Criteria**:
  - [ ] `src/platform/opencode-hooks.ts` implements IPlatformHooks
  - [ ] Opencode hook format determined and implemented
  - [ ] All lifecycle hooks mapped appropriately

  **QA Scenarios**:
  ```
  Scenario: Opencode hooks deployment
    Tool: Bash
    Steps:
      1. Create test worktree
      2. Deploy hooks via OpencodeHooks.deploy()
      3. Verify hooks installed in Opencode config
    Expected Result: Hooks configured in Opencode
    Evidence: Config file verification
  ```

  **Commit**: YES
  - Message: `feat(platform): implement Opencode hook system`
  - Files: `src/platform/opencode-hooks.ts`

- [x] 11. Implement Opencode Context Generation

  **What to do**:
  - Create `src/platform/opencode-context.ts` implementing IPlatformContext
  - Generate `AGENTS.md` format for Opencode
  - Adapt overlay template for Opencode's context format
  - Support all existing overlay features

  **Must NOT do**:
  - Do NOT use Claude's CLAUDE.md format

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 9, 10, 12)
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 23, 27, 33
  - **Blocked By**: Tasks 1, 2, 9

  **Acceptance Criteria**:
  - [ ] `src/platform/opencode-context.ts` implements IPlatformContext
  - [ ] Generates correct AGENTS.md format
  - [ ] Opencode can read and use the generated context

  **QA Scenarios**:
  ```
  Scenario: Opencode context generation
    Tool: Bash
    Steps:
      1. Generate context for test agent
      2. Verify AGENTS.md created in worktree
      3. Verify format is valid Opencode format
    Expected Result: AGENTS.md exists with correct format
    Evidence: File content verification
  ```

  **Commit**: YES
  - Message: `feat(platform): implement Opencode context generation`
  - Files: `src/platform/opencode-context.ts`

- [x] 12. Implement Opencode Agent Spawning

  **What to do**:
  - Create `src/platform/opencode-spawn.ts` implementing IPlatformSpawner
  - Research Opencode CLI invocation pattern
  - Implement Opencode agent spawning with correct flags
  - Handle tmux session creation for Opencode

  **Must NOT do**:
  - Do NOT use Claude's CLI flags

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 9, 10, 11)
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 18, 19, 20, 21, 33
  - **Blocked By**: Tasks 1, 2, 9

  **Acceptance Criteria**:
  - [ ] `src/platform/opencode-spawn.ts` implements IPlatformSpawner
  - [ ] Generates correct Opencode CLI command
  - [ ] Spawns agent successfully in tmux

  **QA Scenarios**:
  ```
  Scenario: Opencode agent spawning
    Tool: Bash
    Steps:
      1. Call spawn() with test configuration
      2. Verify tmux session created
      3. Verify Opencode process running
    Expected Result: Agent spawned and running
    Evidence: tmux list-sessions output
  ```

  **Commit**: YES
  - Message: `feat(platform): implement Opencode agent spawning`
  - Files: `src/platform/opencode-spawn.ts`

---

**Wave 3 Complete:** Opencode platform implementation ready

---

- [x] 13. Implement Opencode Metrics Discovery

  **What to do**:
  - Create `src/platform/opencode-metrics.ts` implementing IPlatformMetrics
  - Research Opencode's session log format and location
  - Implement transcript discovery in `~/.config/opencode/logs/`
  - Parse Opencode's token usage and cost data
  - Update cost calculation for Opencode pricing

  **Must NOT do**:
  - Do NOT assume same format as Claude transcripts
  - Do NOT break Claude metrics discovery

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 14, 15, 16)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 22 (costs command)
  - **Blocked By**: Tasks 1, 2, 9

  **Acceptance Criteria**:
  - [ ] `src/platform/opencode-metrics.ts` implements IPlatformMetrics
  - [ ] Discovers Opencode session logs
  - [ ] Parses token usage correctly
  - [ ] Cost calculation works for Opencode

  **QA Scenarios**:
  ```
  Scenario: Opencode metrics discovery
    Tool: Bash
    Steps:
      1. Create mock Opencode log file
      2. Call discoverTranscripts()
      3. Verify logs found and parsed
    Expected Result: Transcripts discovered with correct metrics
    Evidence: Parsed data verification
  ```

  **Commit**: YES
  - Message: `feat(platform): implement Opencode metrics discovery`
  - Files: `src/platform/opencode-metrics.ts`

- [x] 14. Update Merge Resolver for Opencode AI

  **What to do**:
  - Modify `src/merge/resolver.ts` to use platform abstraction
  - Replace direct `claude --print` calls with platform.callAI()
  - Support both Claude and Opencode AI resolution
  - Maintain existing 4-tier conflict resolution logic

  **Must NOT do**:
  - Do NOT change conflict resolution algorithm
  - Do NOT remove Claude AI support

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 13, 15, 16)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 33
  - **Blocked By**: Tasks 9, 10

  **Acceptance Criteria**:
  - [ ] `src/merge/resolver.ts` uses platform abstraction
  - [ ] AI resolution works with Claude platform
  - [ ] AI resolution works with Opencode platform
  - [ ] All existing tests pass

  **QA Scenarios**:
  ```
  Scenario: AI merge resolution
    Tool: Bash
    Steps:
      1. Create test merge conflict
      2. Run resolver with Opencode platform
      3. Verify AI called to resolve conflict
    Expected Result: Conflict resolved via AI
    Evidence: Resolved file content
  ```

  **Commit**: YES
  - Message: `feat(merge): use platform abstraction for AI resolution`
  - Files: `src/merge/resolver.ts`, `src/merge/resolver.test.ts`

- [x] 15. Update Watchdog Triage for Opencode AI

  **What to do**:
  - Modify `src/watchdog/triage.ts` to use platform abstraction
  - Replace direct `claude --print` calls with platform.callAI()
  - Support both Claude and Opencode for triage analysis
  - Maintain existing triage classification logic

  **Must NOT do**:
  - Do NOT change triage logic or classifications
  - Do NOT remove Claude triage support

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 13, 14, 16)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 33
  - **Blocked By**: Tasks 9, 10

  **Acceptance Criteria**:
  - [ ] `src/watchdog/triage.ts` uses platform abstraction
  - [ ] Triage works with Claude platform
  - [ ] Triage works with Opencode platform
  - [ ] All existing tests pass

  **QA Scenarios**:
  ```
  Scenario: AI triage analysis
    Tool: Bash
    Steps:
      1. Create test agent log with stall pattern
      2. Run triage with Opencode platform
      3. Verify AI classifies the situation
    Expected Result: Correct triage classification returned
    Evidence: Classification output
  ```

  **Commit**: YES
  - Message: `feat(watchdog): use platform abstraction for triage`
  - Files: `src/watchdog/triage.ts`, `src/watchdog/triage.test.ts`

- [x] 16. Update Transcript Parser for Opencode Format

  **What to do**:
  - Modify `src/metrics/transcript.ts` to support multiple formats
  - Add Opencode transcript format parser
  - Maintain backward compatibility with Claude format
  - Update token usage extraction for Opencode

  **Must NOT do**:
  - Do NOT remove Claude format support
  - Do NOT break existing transcript parsing

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 13, 14, 15)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 22 (costs command)
  - **Blocked By**: Tasks 9, 13

  **Acceptance Criteria**:
  - [ ] `src/metrics/transcript.ts` supports Opencode format
  - [ ] Claude format still works
  - [ ] Token usage correctly extracted for both

  **QA Scenarios**:
  ```
  Scenario: Dual format parsing
    Tool: Bash
    Steps:
      1. Parse Claude format transcript
      2. Parse Opencode format transcript
      3. Verify both extract correct metrics
    Expected Result: Both formats parsed correctly
    Evidence: Parsed metrics comparison
  ```

  **Commit**: YES
  - Message: `feat(metrics): add Opencode transcript format support`
  - Files: `src/metrics/transcript.ts`, `src/metrics/transcript.test.ts`

---

**Wave 4 Complete:** Metrics and AI features ported

---

- [x] 17. Update Hooks.ts Command

  **What to do**:
  - Modify `src/commands/hooks.ts` to use platform abstraction
  - Replace direct `.claude/settings.local.json` references
  - Use platform.getHooksConfigPath() for target path
  - Support both Claude and Opencode hook installation

  **Must NOT do**:
  - Do NOT change CLI interface
  - Do NOT remove Claude hook support

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 18, 19, 20, 21, 22)
  - **Parallel Group**: Wave 5
  - **Blocks**: Task 33
  - **Blocked By**: Tasks 4, 10

  **Acceptance Criteria**:
  - [ ] `src/commands/hooks.ts` uses platform abstraction
  - [ ] Hooks install to correct location for each platform
  - [ ] Existing tests pass

  **QA Scenarios**:
  ```
  Scenario: Platform-aware hooks command
    Tool: Bash
    Steps:
      1. Run `overstory hooks install` with Opencode platform
      2. Verify hooks installed to Opencode config
      3. Run with Claude platform
      4. Verify hooks installed to .claude/
    Expected Result: Correct installation per platform
    Evidence: File system verification
  ```

  **Commit**: YES
  - Message: `feat(commands): update hooks command for platform abstraction`
  - Files: `src/commands/hooks.ts`, `src/commands/hooks.test.ts`

- [x] 18. Update Sling.ts Command

  **What to do**:
  - Modify `src/commands/sling.ts` to use platform abstraction
  - Replace direct Claude CLI spawning with platform.spawnAgent()
  - Use platform.generateContextFile() for overlay generation
  - Support both Claude and Opencode agent spawning

  **Must NOT do**:
  - Do NOT change CLI interface or spawn options
  - Do NOT remove Claude spawning support

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 17, 19, 20, 21, 22)
  - **Parallel Group**: Wave 5
  - **Blocks**: Task 33
  - **Blocked By**: Tasks 4, 11, 12

  **Acceptance Criteria**:
  - [ ] `src/commands/sling.ts` uses platform abstraction
  - [ ] Spawns Claude agents correctly
  - [ ] Spawns Opencode agents correctly
  - [ ] All existing tests pass

  **QA Scenarios**:
  ```
  Scenario: Platform-aware sling command
    Tool: Bash
    Steps:
      1. Run `overstory sling` with Opencode platform
      2. Verify Opencode agent spawned
      3. Verify AGENTS.md generated
      4. Run with Claude platform
      5. Verify Claude agent spawned
    Expected Result: Correct spawning per platform
    Evidence: Process and file verification
  ```

  **Commit**: YES
  - Message: `feat(commands): update sling command for platform abstraction`
  - Files: `src/commands/sling.ts`, `src/commands/sling.test.ts`

- [x] 19. Update Coordinator.ts Command

  **What to do**:
  - Modify `src/commands/coordinator.ts` to use platform abstraction
  - Replace direct Claude CLI spawning with platform.spawnAgent()
  - Use platform hooks deployment
  - Support both Claude and Opencode coordinator

  **Must NOT do**:
  - Do NOT change coordinator behavior
  - Do NOT remove Claude coordinator support

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 17, 18, 20, 21, 22)
  - **Parallel Group**: Wave 5
  - **Blocks**: Task 33
  - **Blocked By**: Tasks 4, 11, 12

  **Acceptance Criteria**:
  - [ ] `src/commands/coordinator.ts` uses platform abstraction
  - [ ] Coordinator spawns correctly with Claude
  - [ ] Coordinator spawns correctly with Opencode

  **QA Scenarios**:
  ```
  Scenario: Platform-aware coordinator
    Tool: Bash
    Steps:
      1. Run `overstory coordinator start` with Opencode
      2. Verify coordinator spawned
      3. Check correct hooks deployed
    Expected Result: Coordinator running with Opencode
    Evidence: tmux and config verification
  ```

  **Commit**: YES
  - Message: `feat(commands): update coordinator for platform abstraction`
  - Files: `src/commands/coordinator.ts`, `src/commands/coordinator.test.ts`

- [x] 20. Update Supervisor.ts Command

  **What to do**:
  - Modify `src/commands/supervisor.ts` to use platform abstraction
  - Replace direct Claude CLI spawning with platform.spawnAgent()
  - Use platform hooks deployment
  - Support both Claude and Opencode supervisor

  **Must NOT do**:
  - Do NOT change supervisor behavior
  - Do NOT remove Claude supervisor support

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 17, 18, 19, 21, 22)
  - **Parallel Group**: Wave 5
  - **Blocks**: Task 33
  - **Blocked By**: Tasks 4, 11, 12

  **Acceptance Criteria**:
  - [ ] `src/commands/supervisor.ts` uses platform abstraction
  - [ ] Supervisor spawns correctly with both platforms

  **Commit**: YES
  - Message: `feat(commands): update supervisor for platform abstraction`
  - Files: `src/commands/supervisor.ts`, `src/commands/supervisor.test.ts`

- [x] 21. Update Monitor.ts Command

  **What to do**:
  - Modify `src/commands/monitor.ts` to use platform abstraction
  - Replace direct Claude CLI spawning with platform.spawnAgent()
  - Use platform hooks deployment
  - Support both Claude and Opencode monitor

  **Must NOT do**:
  - Do NOT change monitor behavior
  - Do NOT remove Claude monitor support

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 17, 18, 19, 20, 22)
  - **Parallel Group**: Wave 5
  - **Blocks**: Task 33
  - **Blocked By**: Tasks 4, 11, 12

  **Acceptance Criteria**:
  - [ ] `src/commands/monitor.ts` uses platform abstraction
  - [ ] Monitor spawns correctly with both platforms

  **Commit**: YES
  - Message: `feat(commands): update monitor for platform abstraction`
  - Files: `src/commands/monitor.ts`, `src/commands/monitor.test.ts`

- [x] 22. Update Costs.ts Command

  **What to do**:
  - Modify `src/commands/costs.ts` to use platform abstraction
  - Use platform.discoverTranscripts() for log discovery
  - Support both Claude and Opencode transcript formats
  - Update cost calculation for platform-specific pricing

  **Must NOT do**:
  - Do NOT change CLI interface
  - Do NOT remove Claude cost calculation

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 17, 18, 19, 20, 21)
  - **Parallel Group**: Wave 5
  - **Blocks**: Task 33
  - **Blocked By**: Tasks 4, 13, 16

  **Acceptance Criteria**:
  - [ ] `src/commands/costs.ts` uses platform abstraction
  - [ ] Costs calculated correctly for Claude
  - [ ] Costs calculated correctly for Opencode

  **QA Scenarios**:
  ```
  Scenario: Platform-aware costs command
    Tool: Bash
    Steps:
      1. Run `overstory costs` with Opencode platform
      2. Verify Opencode transcripts discovered
      3. Verify costs calculated with Opencode pricing
    Expected Result: Accurate cost reporting per platform
    Evidence: Output verification
  ```

  **Commit**: YES
  - Message: `feat(commands): update costs command for platform abstraction`
  - Files: `src/commands/costs.ts`, `src/commands/costs.test.ts`

---

**Wave 5 Complete:** Command migration finished

---

- [x] 23. Update Agents/overlay.ts

  **What to do**:
  - Modify `src/agents/overlay.ts` to use platform abstraction
  - Use platform.generateContextFile() instead of direct file writing
  - Support both Claude and Opencode overlay generation
  - Maintain backward compatibility

  **Must NOT do**:
  - Do NOT change overlay generation logic
  - Do NOT remove Claude overlay support

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 24, 25, 26)
  - **Parallel Group**: Wave 6
  - **Blocks**: Task 33
  - **Blocked By**: Tasks 4, 11

  **Acceptance Criteria**:
  - [ ] `src/agents/overlay.ts` uses platform abstraction
  - [ ] Generates correct overlay for Claude
  - [ ] Generates correct overlay for Opencode
  - [ ] All existing tests pass

  **Commit**: YES
  - Message: `feat(agents): update overlay generation for platform abstraction`
  - Files: `src/agents/overlay.ts`, `src/agents/overlay.test.ts`

- [x] 24. Update Agents/hooks-deployer.ts

  **What to do**:
  - Modify `src/agents/hooks-deployer.ts` to use platform abstraction
  - Use platform hook deployment instead of direct file writing
  - Support both Claude and Opencode hook deployment
  - Maintain backward compatibility

  **Must NOT do**:
  - Do NOT change hook deployment logic
  - Do NOT remove Claude hook support

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 23, 25, 26)
  - **Parallel Group**: Wave 6
  - **Blocks**: Task 33
  - **Blocked By**: Tasks 4, 10

  **Acceptance Criteria**:
  - [ ] `src/agents/hooks-deployer.ts` uses platform abstraction
  - [ ] Deploys hooks correctly for Claude
  - [ ] Deploys hooks correctly for Opencode

  **Commit**: YES
  - Message: `feat(agents): update hooks deployer for platform abstraction`
  - Files: `src/agents/hooks-deployer.ts`, `src/agents/hooks-deployer.test.ts`

- [x] 25. Update Agent Manifest Loading

  **What to do**:
  - Modify `src/agents/manifest.ts` to support platform-specific agent definitions
  - Add platform field to agent definitions
  - Support loading platform-specific capabilities

  **Must NOT do**:
  - Do NOT break existing agent manifest format

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 23, 24, 26)
  - **Parallel Group**: Wave 6
  - **Blocks**: Task 33
  - **Blocked By**: Task 4

  **Acceptance Criteria**:
  - [ ] `src/agents/manifest.ts` supports platform-specific agents
  - [ ] Existing agent manifests still work

  **Commit**: YES
  - Message: `feat(agents): add platform support to agent manifest`
  - Files: `src/agents/manifest.ts`, `src/agents/manifest.test.ts`

- [x] 26. Create Opencode Agent Base Definitions

  **What to do**:
  - Create Opencode-specific agent definitions in `agents/opencode/`
  - Port scout, builder, reviewer, lead, merger, coordinator, supervisor, monitor
  - Adapt agent capabilities for Opencode
  - Maintain same role semantics

  **Must NOT do**:
  - Do NOT change agent role purposes
  - Do NOT remove Claude agent definitions

  **Recommended Agent Profile**:
  - **Category**: `artistry`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 23, 24, 25)
  - **Parallel Group**: Wave 6
  - **Blocks**: Task 33
  - **Blocked By**: None (content creation)

  **Acceptance Criteria**:
  - [ ] All 8 agent types have Opencode versions
  - [ ] Agents are compatible with Opencode context format

  **Commit**: YES
  - Message: `feat(agents): add Opencode agent base definitions`
  - Files: `agents/opencode/*.md`

---

**Wave 6 Complete:** Agent system migration finished

---

 [x] 27. Update overlay.md.tmpl

  **What to do**:
  - Modify `templates/overlay.md.tmpl` to be platform-aware
  - Add conditional sections for Claude vs Opencode
  - Support both `.claude/CLAUDE.md` and `AGENTS.md` references
  - Use platform-specific instructions

  **Must NOT do**:
  - Do NOT break existing template structure

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 28, 29, 30)
  - **Parallel Group**: Wave 7
  - **Blocks**: Task 33
  - **Blocked By**: Tasks 11, 26

  **Acceptance Criteria**:
  - [ ] Template generates correct output for Claude
  - [ ] Template generates correct output for Opencode

  **Commit**: YES
  - Message: `feat(templates): make overlay template platform-aware`
  - Files: `templates/overlay.md.tmpl`

 [x] 28. Create opencode-hooks.json.tmpl

  **What to do**:
  - Create `templates/opencode-hooks.json.tmpl` for Opencode hook configuration
  - Map Claude lifecycle hooks to Opencode equivalents
  - Use Opencode's hook format and configuration structure

  **Must NOT do**:
  - Do NOT use Claude's settings.local.json format

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 27, 29, 30)
  - **Parallel Group**: Wave 7
  - **Blocks**: Task 33
  - **Blocked By**: Task 10

  **Acceptance Criteria**:
  - [ ] `templates/opencode-hooks.json.tmpl` created
  - [ ] Contains Opencode-compatible hooks

  **Commit**: YES
  - Message: `feat(templates): add Opencode hooks template`
  - Files: `templates/opencode-hooks.json.tmpl`

 [x] 29. Update CLAUDE.md → AGENTS.md

  **What to do**:
  - Update root `CLAUDE.md` with Opencode instructions
  - Add platform-specific setup instructions
  - Include both Claude Code and Opencode quick start guides

  **Must NOT do**:
  - Do NOT remove Claude Code documentation

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 27, 28, 30)
  - **Parallel Group**: Wave 7
  - **Blocks**: None
  - **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] `CLAUDE.md` updated with Opencode section
  - [ ] Both platforms documented

  **Commit**: YES
  - Message: `docs: add Opencode instructions to CLAUDE.md`
  - Files: `CLAUDE.md`

 [x] 30. Create Migration Guide

  **What to do**:
  - Create `MIGRATION.md` with migration instructions
  - Document config changes needed
  - Provide step-by-step migration from Claude to Opencode
  - Include troubleshooting section

  **Must NOT do**:
  - Do NOT require migration (both platforms supported)

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 27, 28, 29)
  - **Parallel Group**: Wave 7
  - **Blocks**: None
  - **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] `MIGRATION.md` created with complete guide
  - [ ] Guide is clear and actionable

  **Commit**: YES
  - Message: `docs: add migration guide for Opencode`
  - Files: `MIGRATION.md`

---

**Wave 7 Complete:** Templates and documentation finished

---

- [ ] 31. Create Platform Test Utilities

  **What to do**:
  - Create `src/test-helpers.ts` additions for platform testing
  - Create mock platform implementations for testing
  - Add platform-specific test fixtures

  **Must NOT do**:
  - Do NOT break existing test helpers

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 32, 33, 34, 35)
  - **Parallel Group**: Wave 8
  - **Blocks**: Tasks 32, 33, 34
  - **Blocked By**: Tasks 1, 2, 3

  **Acceptance Criteria**:
  - [ ] Test utilities created for platform testing
  - [ ] Mock platforms work for unit tests

  **Commit**: YES
  - Message: `test: add platform test utilities`
  - Files: `src/test-helpers.ts`

- [ ] 32. Update Existing Tests for Abstraction

  **What to do**:
  - Update all existing tests to use platform abstraction
  - Replace direct Claude references with platform mocks
  - Ensure all tests pass with both platforms

  **Must NOT do**:
  - Do NOT remove existing test coverage

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 31, 33, 34, 35)
  - **Parallel Group**: Wave 8
  - **Blocks**: Task 35
  - **Blocked By**: Tasks 5, 6, 7, 8, 17, 18, 19, 20, 21, 22, 23, 24, 31

  **Acceptance Criteria**:
  - [ ] All existing tests updated
  - [ ] All tests pass with `bun test`

  **QA Scenarios**:
  ```
  Scenario: Full test suite
    Tool: Bash
    Steps:
      1. Run `bun test`
      2. Verify all tests pass
    Expected Result: 0 failures
    Evidence: Test output
  ```

  **Commit**: YES
  - Message: `test: update existing tests for platform abstraction`
  - Files: `src/**/*.test.ts`

- [ ] 33. Write Opencode Platform Tests

  **What to do**:
  - Create comprehensive tests for Opencode platform
  - Test all IPlatform methods
  - Test hook deployment, context generation, spawning
  - Add integration tests

  **Must NOT do**:
  - Do NOT skip any platform methods

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 31, 32, 34, 35)
  - **Parallel Group**: Wave 8
  - **Blocks**: Task 35
  - **Blocked By**: Tasks 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 31

  **Acceptance Criteria**:
  - [ ] All Opencode platform methods tested
  - [ ] Test coverage > 80%

  **Commit**: YES
  - Message: `test: add Opencode platform tests`
  - Files: `src/platform/opencode.test.ts`, `src/platform/opencode-*.test.ts`

- [ ] 34. Write Integration Tests

  **What to do**:
  - Create end-to-end integration tests
  - Test full workflow: init → spawn → work → merge
  - Test both Claude and Opencode platforms
  - Verify cross-platform compatibility

  **Must NOT do**:
  - Do NOT mock core systems (use real worktrees, etc.)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 31, 32, 33, 35)
  - **Parallel Group**: Wave 8
  - **Blocks**: Task 35
  - **Blocked By**: Tasks 17, 18, 19, 20, 21, 22, 31

  **Acceptance Criteria**:
  - [ ] Integration tests cover main workflows
  - [ ] Tests pass for both platforms

  **Commit**: YES
  - Message: `test: add platform integration tests`
  - Files: `src/e2e/platform-integration.test.ts`

- [ ] 35. Final Verification and Bug Fixes

  **What to do**:
  - Run full test suite and fix any failures
  - Perform manual testing of key workflows
  - Fix any bugs discovered
  - Verify documentation accuracy

  **Must NOT do**:
  - Do NOT skip failing tests (fix them)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 8
  - **Blocks**: Wave FINAL
  - **Blocked By**: Tasks 31, 32, 33, 34

  **Acceptance Criteria**:
  - [ ] All tests pass
  - [ ] Manual testing successful
  - [ ] No known bugs

  **QA Scenarios**:
  ```
  Scenario: Final verification
    Tool: Bash
    Steps:
      1. Run `bun test`
      2. Run `bun run lint`
      3. Run `bun run typecheck`
      4. Manual test: init → spawn → merge workflow
    Expected Result: All checks pass
    Evidence: Command outputs
  ```

  **Commit**: YES (ongoing bug fixes)
  - Message: `fix: address bugs from final verification`
  - Files: Various

---

**Wave 8 Complete:** Testing and verification finished

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
  
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist. Compare deliverables against plan.
  
  Output: `Must Have [10/10] | Must NOT Have [4/4] | Tasks [35/35] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  
  Run `tsc --noEmit` + `biome check .` + `bun test`. Review all changed files for: `as any`, empty catches, console.log in prod, commented-out code. Check AI slop patterns.
  
  Output: `Build [PASS] | Lint [PASS] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Platform Parity Verification** — `deep`
  
  Test feature parity between Claude and Opencode platforms:
  - Agent spawning works on both
  - Hooks deploy on both
  - Context files generated for both
  - Metrics discovered for both
  - AI calls work on both
  
  Output: `Claude Features [N/N] | Opencode Features [N/N] | Parity [YES/NO] | VERDICT`

- [ ] F4. **Documentation Review** — `writing`
  
  Verify documentation completeness:
  - AGENTS.md updated for both platforms
  - Migration guide is clear
  - All new APIs documented
  - Examples provided
  
  Output: `Docs [N/N complete] | Examples [N/N] | Migration [CLEAR/UNCLEAR] | VERDICT`

---

## Commit Strategy

- **Wave 1-3 commits**: One commit per task
- **Wave 4-6 commits**: One commit per task
- **Wave 7 commits**: One commit per task
- **Wave 8 commits**: Test commits can be batched
- **Bug fixes**: Individual commits with `fix:` prefix

---

## Success Criteria

### Verification Commands
```bash
# Type checking
bun run typecheck

# Linting
bun run lint

# Testing
bun test

# Platform-specific tests
bun test src/platform/

# Integration tests
bun test src/e2e/
```

### Final Checklist
- [ ] All 35 tasks completed
- [ ] All "Must Have" items present
- [ ] All "Must NOT Have" items absent
- [ ] All 2000+ tests passing
- [ ] Both Claude and Opencode platforms working
- [ ] Documentation complete
- [ ] Migration guide available
- [ ] Code quality gates passing

---

## Plan Metadata

**Created**: 2026-02-21
**Estimated Duration**: 150-200 hours
**Team Size**: 1-3 developers (parallel waves allow multiple contributors)
**Risk Level**: Medium (complexity in hook system mapping and transcript format differences)
**Dependencies**: None external (all Opencode research done during implementation)
