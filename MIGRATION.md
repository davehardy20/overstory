# Migration Guide: Claude Code to Opencode

This guide provides instructions for users moving their Overstory orchestration from **Claude Code** to **Opencode**.

## Overview

Overstory now supports both Claude Code and Opencode as execution platforms. While Claude Code is the original platform, Opencode offers a more integrated experience with project-root context files and global hook management.

**Migration is completely optional.** Both platforms are first-class citizens in the Overstory ecosystem. You can continue using Claude Code, move to Opencode, or even switch back and forth between them as needed.

## Should I Migrate?

### Benefits of Opencode
- **Project Root Context**: Opencode uses `AGENTS.md` in the project root instead of `.claude/CLAUDE.md`.
- **Global Hooks**: Hooks are managed in `~/.config/opencode/hooks.json`, reducing project-level clutter.
- **Improved Tool Integration**: Tailored support for Opencode-specific features.
- **Native Bun Support**: Faster execution and better compatibility with Overstory's runtime.

### Why you might stay on Claude Code
- You have existing custom hooks in `.claude/settings.local.json`.
- Your team is standardized on the `claude` CLI.
- You prefer context files to be hidden in the `.claude/` directory.

---

## Prerequisites

1. **Opencode CLI installed**: Ensure the `opencode` command is available in your PATH.
   ```bash
   opencode --version
   ```
2. **Overstory CLI updated**: Ensure you are running the latest version of Overstory.

---

## Step-by-Step Migration

Follow these steps to migrate your project to the Opencode platform.

### 1. Update Project Configuration
Edit your `.overstory/config.yaml` file to set the platform to `opencode`.

```yaml
# .overstory/config.yaml
platform:
  type: opencode
```

### 2. Install Opencode Hooks
Run the following command to install the required hooks into Opencode's global configuration.

```bash
overstory hooks install
```

### 3. Verify Context File Change
Overstory will now generate `AGENTS.md` in your project root instead of `.claude/CLAUDE.md`. You can verify this by spawning a scout agent:

```bash
overstory sling test-task --capability scout --name scout-test
```

Check your project root for the `AGENTS.md` file (note: this file is only present in agent worktrees, not your main project root unless you are running a coordinator there).

### 4. Test Agent Spawning
Ensure you can still spawn agents and they can communicate back to the orchestrator.

```bash
overstory status
overstory mail check --inject
```

---

## Configuration Reference

| Feature | Claude Code | Opencode |
|---------|-------------|----------|
| **Config Key** | `platform: { type: "claude" }` | `platform: { type: "opencode" }` |
| **Hook Location** | `.claude/settings.local.json` | `~/.config/opencode/hooks.json` |
| **Context File** | `.claude/CLAUDE.md` | `AGENTS.md` (Project Root) |
| **Agent PID** | Managed by Claude | Managed by tmux/Opencode |

---

## Rollback Instructions

If you decide Opencode isn't for you, rolling back is easy:

1. Update `.overstory/config.yaml` to set `type: claude` (or `auto`).
2. Re-install Claude hooks:
   ```bash
   overstory hooks install --force
   ```
3. (Optional) Remove the Opencode hooks:
   ```bash
   # Manual removal from ~/.config/opencode/hooks.json
   ```

---

## Troubleshooting

### `opencode` command not found
Ensure Opencode is installed and the binary is in your system's PATH. If you just installed it, you may need to restart your terminal.

### Hooks not triggering
Verify that `overstory hooks status` shows `Installed`. If not, run `overstory hooks install --force`.

### Context files missing
In Opencode, context files (`AGENTS.md`) are placed in the project root of the **agent's worktree**. They are not placed in your primary working directory unless you are running a `coordinator` or `monitor` agent there.

---

## FAQ

**Q: Will I lose my history or active sessions?**
A: No. All SQLite databases (`mail.db`, `sessions.db`, etc.) are platform-independent. Your existing worktrees and sessions remain compatible.

**Q: Can I use both at the same time?**
A: Not recommended for a single project. The `platform` setting in `config.yaml` determines how Overstory generates context and manages hooks. Switching mid-session may cause confusion regarding hook execution.

**Q: Does Opencode support all Overstory agents?**
A: Yes. All 8 agent roles (Scout, Builder, Reviewer, Lead, etc.) are fully supported on Opencode.
