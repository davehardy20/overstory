# Doctor

Health check system — 9 modular check categories for validating overstory setup.

## Overview

Doctor runs comprehensive diagnostics on the overstory installation and project state. Each check category is self-contained and reports pass/fail with actionable remediation.

## Structure

| File | Category | Checks |
|------|----------|--------|
| `dependencies.ts` | dependencies | Bun, git, tmux, bd, mulch availability |
| `config-check.ts` | config | Config.yaml validity, required fields |
| `structure.ts` | structure | Directory structure, required files |
| `databases.ts` | databases | SQLite integrity, WAL mode, migrations |
| `consistency.ts` | consistency | Cross-database consistency checks |
| `agents.ts` | agents | Agent definitions, manifests, hooks |
| `merge-queue.ts` | merge | Merge queue state, conflicts |
| `logs.ts` | logs | Log directory health, rotation |
| `version.ts` | version | Version sync (package.json vs index.ts) |
| `types.ts` | — | Check result types and interfaces |

## Conventions

- **Export:** Each check module exports a `check()` function returning `CheckResult`
- **Independent:** Checks must not depend on other checks passing
- **Actionable:** Failed checks include remediation steps
- **Categorized:** Use `CheckCategory` enum for classification

## Pattern

```typescript
export async function check(config: OverstoryConfig): Promise<CheckResult> {
  const issues: string[] = [];
  
  // Run checks
  if (!await someCheck()) {
    issues.push('Description of what failed');
  }
  
  return {
    category: CheckCategory.Dependencies,
    passed: issues.length === 0,
    issues,
  };
}
```

## Usage

```bash
overstory doctor                        # Run all checks
overstory doctor --category config      # Run single category
overstory doctor --verbose              # Show passing checks too
overstory doctor --json                 # JSON output
```

## Anti-Patterns

- **Never** make checks dependent on each other
- **Never** fail silently — always report issues array
- **Always** include actionable remediation in issue messages
