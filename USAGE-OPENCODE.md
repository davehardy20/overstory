# Overstory Usage Guide for Opencode

Complete guide for using Overstory's multi-agent orchestration with the Opencode platform.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Installation & Setup](#installation--setup)
4. [Configuration](#configuration)
5. [Basic Workflow](#basic-workflow)
6. [Platform-Specific Features](#platform-specific-features)
7. [Advanced Usage](#advanced-usage)
8. [Troubleshooting](#troubleshooting)
9. [Comparison with Claude Code](#comparison-with-claude-code)

---

## Overview

Overstory on Opencode provides the same multi-agent orchestration capabilities as Claude Code, but with Opencode's native integration:

- **Context in Project Root**: Uses `AGENTS.md` instead of `.claude/CLAUDE.md`
- **Global Hooks**: Hooks managed in `~/.config/opencode/hooks.json`
- **Native Bun Support**: Optimized for Bun runtime
- **Same Commands**: All `overstory` commands work identically

### Key Differences from Claude Code

| Aspect | Claude Code | Opencode |
|--------|-------------|----------|
| Context File | `.claude/CLAUDE.md` | `AGENTS.md` (project root) |
| Hooks Location | `.claude/settings.local.json` | `~/.config/opencode/hooks.json` |
| Config Format | JSON | JSON |
| Agent Spawning | `claude` CLI | `opencode` CLI |

---

## Prerequisites

### Required Software

1. **Bun** (v1.1.0 or higher)
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

2. **Opencode CLI**
   ```bash
   # Install via npm
   npm install -g @opencode/cli
   
   # Or via bun
   bun install -g @opencode/cli
   ```

3. **Git** (v2.30 or higher)

4. **tmux** (for agent session management)
   ```bash
   # macOS
   brew install tmux
   
   # Ubuntu/Debian
   sudo apt-get install tmux
   ```

### Verify Installation

```bash
# Check all prerequisites
bun --version           # Should show 1.1.0+
opencode --version      # Should show version
git --version          # Should show 2.30+
tmux -V                # Should show version
```

---

## Installation & Setup

### Step 1: Install Overstory

```bash
# Clone the repository
git clone https://github.com/yourusername/overstory.git
cd overstory

# Install dependencies
bun install

# Verify installation
bun src/index.ts --version
```

### Step 2: Initialize Your Project

```bash
# Navigate to your project
cd /path/to/your/project

# Initialize Overstory
overstory init

# This creates:
# .overstory/
# ├── config.yaml          # Main configuration
# ├── hooks.json.tmpl      # Hook template
# ├── mail.db              # SQLite message database
# └── agents/              # Agent definitions
```

### Step 3: Configure for Opencode

Edit `.overstory/config.yaml`:

```yaml
# Platform configuration
platform:
  type: opencode          # Use Opencode platform
  # or 'auto' to auto-detect, 'claude' for Claude Code

# Project settings
project:
  name: my-project
  canonicalBranch: main

# Agent hierarchy limits
limits:
  maxDepth: 2             # Coordinator → Supervisor → Workers
  maxWorkers: 8           # Maximum concurrent workers

# Feature toggles
features:
  autoMerge: true         # Enable automatic merging
  watchdog: true          # Enable health monitoring
  metrics: true           # Enable cost tracking
```

### Step 4: Install Hooks

```bash
# Install Overstory hooks into Opencode
overstory hooks install

# Verify installation
overstory hooks status
```

This creates/updates `~/.config/opencode/hooks.json` with:
- **SessionStart**: Auto-prime orchestrator context
- **UserPromptSubmit**: Check agent mail
- **PreToolUse**: Log tool starts, block dangerous git ops
- **PostToolUse**: Log tool ends, check for messages
- **Stop**: Cleanup and learning capture
- **PreCompact**: Refresh context before compaction

---

## Configuration

### Platform Selection

Overstory automatically detects available platforms, but you can explicitly configure:

```yaml
# .overstory/config.yaml
platform:
  type: opencode          # Force Opencode
  # Options: 'opencode', 'claude', 'auto'
```

### Hook Configuration

Hooks are managed globally for Opencode:

```bash
# View current hooks
overstory hooks status --json

# Force reinstallation
overstory hooks install --force

# Remove hooks
overstory hooks uninstall
```

### Agent Capabilities

Define agent types in `.overstory/agents/`:

```yaml
# .overstory/agents/builder.yaml
name: builder
capability: build
description: |
  Expert software engineer focused on implementation.
  Writes clean, tested code following project conventions.

constraints:
  - Can write and modify code
  - Can run tests
  - Cannot push to canonical branch
  - Cannot spawn sub-agents

tools:
  - Read
  - Write
  - Bash
  - Search
```

---

## Basic Workflow

### 1. Start a Task (Coordinator Pattern)

```bash
# Spawn a coordinator for high-level orchestration
overstory coordinator start my-feature

# The coordinator:
# - Analyzes the task
# - Spawns specialized workers
# - Manages workflow
# - Reports progress
```

### 2. Direct Worker Spawning

```bash
# Spawn a single worker agent
overstory sling bead-123 \
  --capability builder \
  --name feature-worker \
  --spec "path/to/spec.md"

# This creates:
# - Git worktree at .worktrees/feature-worker/
# - AGENTS.md in worktree root
# - Tmux session: "feature-worker"
# - Database entry for mail routing
```

### 3. Monitor Agents

```bash
# Check all active agents
overstory status

# Watch live activity
overstory dashboard

# Check specific agent
overstory inspect feature-worker

# View mail queue
overstory mail list

# Read agent messages
overstory mail read feature-worker
```

### 4. Send Messages

```bash
# Send a message to an agent
overstory mail send feature-worker "Priority update: focus on tests first"

# Quick nudge (text popup in agent's tmux)
overstory nudge feature-worker "Check line 42 in auth.ts"
```

### 5. Merge Work

```bash
# When agent completes work
overstory merge

# This:
# - Queues agent branches for merge
# - Runs conflict resolution (4-tier)
# - Merges to canonical branch
# - Cleans up worktrees
```

### 6. Cleanup

```bash
# Stop a specific agent
overstory stop feature-worker

# Stop coordinator
overstory coordinator stop my-feature

# Nuclear option: wipe all state
overstory clean
```

---

## Platform-Specific Features

### AGENTS.md Context

Unlike Claude Code's hidden `.claude/CLAUDE.md`, Opencode uses visible `AGENTS.md`:

```markdown
<!-- Located at: .worktrees/agent-name/AGENTS.md -->

# Agent: feature-worker
## Task: Implement user authentication

### Instructions
- Build OAuth2 login flow
- Add JWT token handling
- Write comprehensive tests

### Context
- Based on: main branch
- Worktree: /path/to/project/.worktrees/feature-worker
- Parent: coordinator (my-feature)

### Constraints
- Can modify: src/auth/**, tests/auth/**
- Cannot push to main
- Must run tests before completing
```

### Benefits of AGENTS.md

1. **Visible in Project Root**: Easy to check agent context
2. **Standard Markdown**: Viewable in any editor
3. **Git Ignored**: Automatically excluded from commits
4. **Project Documentation**: Can serve as implementation notes

### Hook Integration

Opencode hooks provide tighter integration:

```json
{
  "hooks": {
    "SessionStart": [
      "overstory prime --agent {{AGENT_NAME}}"
    ],
    "UserPromptSubmit": [
      "overstory mail check --inject --agent {{AGENT_NAME}}"
    ],
    "PreToolUse": [
      "overstory log tool-start --agent {{AGENT_NAME}} --stdin"
    ],
    "PostToolUse": [
      "overstory log tool-end --agent {{AGENT_NAME}} --stdin",
      "overstory mail check --debounce 500 --agent {{AGENT_NAME}}"
    ],
    "Stop": [
      "overstory log session-end --agent {{AGENT_NAME}} --stdin",
      "mulch learn"
    ],
    "PreCompact": [
      "overstory prime --agent {{AGENT_NAME}} --compact"
    ]
  }
}
```

These hooks ensure:
- **Context Priming**: Agent always has latest context
- **Mail Delivery**: Messages reach agents automatically
- **Tool Logging**: All tool usage tracked
- **Safety**: Dangerous git operations blocked

---

## Advanced Usage

### Task Groups

Organize related agents into groups:

```bash
# Create a group for feature work
overstory group create auth-feature --description "Authentication system overhaul"

# Add agents to group
overstory group add auth-feature feature-worker-1
overstory group add auth-feature feature-worker-2

# Check group status
overstory group status auth-feature
```

### Health Monitoring

```bash
# Start watchdog (monitors agent health)
overstory watch

# Run health check manually
overstory doctor

# Check specific categories
overstory doctor --category agents
overstory doctor --category worktrees
overstory doctor --category mail
```

### Cost Tracking

```bash
# View token usage
overstory costs

# Live monitoring
overstory costs --live

# Export report
overstory costs --format json --output costs.json
```

### Event Timeline

```bash
# Trace agent activity
overstory trace feature-worker

# Replay session
overstory replay --agent feature-worker

# View all events
overstory feed
```

---

## Troubleshooting

### Common Issues

#### 1. Hooks Not Firing

**Symptoms**: Agents don't receive messages, no automatic context priming

**Solution**:
```bash
# Check hook installation
overstory hooks status

# Reinstall hooks
overstory hooks install --force

# Verify Opencode config
cat ~/.config/opencode/hooks.json
```

#### 2. Agent Spawn Fails

**Symptoms**: `overstory sling` fails with spawn error

**Solution**:
```bash
# Check Opencode availability
opencode --version

# Check platform detection
overstory doctor --category platform

# Verify config
cat .overstory/config.yaml | grep platform
```

#### 3. Context File Not Generated

**Symptoms**: No AGENTS.md in worktree

**Solution**:
```bash
# Check overlay generation manually
overstory prime --agent test-agent --dry-run

# Verify permissions
ls -la .worktrees/

# Check for errors
overstory logs --level error
```

#### 4. Mail Not Delivering

**Symptoms**: Messages sent but not received

**Solution**:
```bash
# Check mail database
overstory mail list --pending

# Verify agent session
overstory status

# Check tmux session
tmux list-sessions | grep agent-name

# Force mail check
overstory mail check --agent agent-name
```

#### 5. Merge Conflicts

**Symptoms**: `overstory merge` fails with conflicts

**Solution**:
```bash
# Check merge queue
overstory merge --status

# View conflict details
overstory merge --show-conflicts

# Abort merge
overstory merge --abort

# Manual resolution (if needed)
cd .worktrees/agent-name
git merge main  # Resolve manually
overstory merge --continue
```

### Debug Mode

```bash
# Enable verbose logging
export OVERSTORY_LOG_LEVEL=debug

# Run command with debug output
overstory --verbose sling my-task

# View debug logs
overstory logs --level debug --tail 100
```

### Getting Help

```bash
# Command help
overstory --help
overstory sling --help
overstory coordinator --help

# Doctor checks
overstory doctor --verbose

# Version info
overstory --version
```

---

## Comparison with Claude Code

### Workflow Differences

| Task | Claude Code | Opencode |
|------|-------------|----------|
| **Initialize** | `overstory init` + edit config | Same |
| **Install Hooks** | Modifies `.claude/settings.local.json` | Modifies `~/.config/opencode/hooks.json` |
| **Spawn Agent** | `overstory sling` (creates `.claude/CLAUDE.md`) | `overstory sling` (creates `AGENTS.md`) |
| **View Context** | Hidden in `.claude/` | Visible `AGENTS.md` in worktree |
| **Check Status** | `overstory status` | Same |
| **Send Message** | `overstory mail send` | Same |
| **Merge Work** | `overstory merge` | Same |

### When to Use Each Platform

**Choose Opencode when:**
- You want context files visible in project root
- You prefer global hook management
- You're using Bun runtime
- You want cleaner project structure (no `.claude/` directory)

**Choose Claude Code when:**
- Your team is standardized on Claude CLI
- You prefer hidden context files
- You have existing custom hooks in `.claude/`
- You need specific Claude-only features

### Migration Path

Switching is easy:

```bash
# Claude → Opencode
echo 'platform: { type: opencode }' > .overstory/config.yaml
overstory hooks install --force

# Opencode → Claude
echo 'platform: { type: claude }' > .overstory/config.yaml
overstory hooks install --force
```

All agents, worktrees, and mail history remain intact.

---

## Best Practices

### 1. Project Structure

```
my-project/
├── .overstory/           # Overstory configuration
│   ├── config.yaml
│   ├── hooks.json.tmpl
│   └── mail.db
├── .worktrees/           # Agent worktrees (gitignored)
│   ├── agent-1/
│   │   └── AGENTS.md     # Opencode context
│   └── agent-2/
│       └── AGENTS.md
├── src/                  # Your source code
├── AGENTS.md             # Root context (optional)
└── .gitignore            # Ignore .overstory/ and .worktrees/
```

### 2. Configuration Management

```yaml
# .overstory/config.yaml
platform:
  type: opencode

# Use 'auto' for mixed teams
# Use explicit type for consistency
```

### 3. Agent Naming

```bash
# Descriptive names
overstory sling bead-123 --name auth-login-builder
overstory sling bead-124 --name auth-oauth-builder

# Include capability
overstory sling bead-125 --name tests-auth-reviewer
```

### 4. Monitoring

```bash
# Always watch for stalls
overstory watch &

# Regular health checks
overstory doctor

# Monitor costs
overstory costs --live
```

### 5. Cleanup

```bash
# Stop agents when done
overstory stop agent-name

# Clean up regularly
overstory worktree clean

# Full cleanup (careful!)
overstory clean
```

---

## Resources

- **Main Documentation**: `CLAUDE.md`
- **Migration Guide**: `MIGRATION.md`
- **Project Context**: `AGENTS.md`
- **CLI Help**: `overstory --help`
- **Repository**: https://github.com/yourusername/overstory

---

## Summary

Overstory on Opencode provides the same powerful multi-agent orchestration as Claude Code, with:

- ✅ **Same commands** - `sling`, `status`, `merge`, etc.
- ✅ **Same workflow** - Spawn, monitor, message, merge
- ✅ **Better visibility** - AGENTS.md in project root
- ✅ **Global hooks** - Managed in `~/.config/opencode/`
- ✅ **Full compatibility** - Switch between platforms anytime

The platform abstraction ensures your workflow remains consistent regardless of which AI execution environment you choose.

---

*Generated for Overstory v0.5.9 - Opencode Platform*
