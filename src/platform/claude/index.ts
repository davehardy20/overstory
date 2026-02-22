/**
 * Claude Code platform implementation.
 *
 * Provides the concrete IPlatform implementation for Claude Code,
 * including:
 * - Context file generation (CLAUDE.md)
 * - Hook management for .claude/settings.local.json
 * - Agent spawning via tmux
 * - Transcript discovery and metrics parsing
 * - Non-interactive AI calls
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
	IPlatform,
	IPlatformAI,
	IPlatformContext,
	IPlatformHooks,
	IPlatformMetrics,
	IPlatformSpawner,
	PlatformId,
} from "../interface.ts";
import { getDefaultConfigDir, getHomeDir } from "../utils.ts";
import { ClaudeAI, createClaudeAI } from "./ai.ts";
import { ClaudeContext, createClaudeContext } from "./context.ts";
import { ClaudeHooks, createClaudeHooks } from "./hooks.ts";
import { ClaudeMetrics, createClaudeMetrics } from "./metrics.ts";
import { ClaudeSpawner, createClaudeSpawner } from "./spawner.ts";

/**
 * Claude Code platform implementation.
 *
 * This class aggregates all sub-interfaces (hooks, context, spawner, metrics, ai)
 * and provides platform identification and configuration methods.
 */
export class ClaudePlatform implements IPlatform {
	readonly id: PlatformId = "claude-code";
	readonly displayName = "Claude Code";
	readonly version = "1.0.0";

	private _hooks: IPlatformHooks | null = null;
	private _context: IPlatformContext | null = null;
	private _spawner: IPlatformSpawner | null = null;
	private _metrics: IPlatformMetrics | null = null;
	private _ai: IPlatformAI | null = null;

	/**
	 * Get the hooks management interface.
	 * Lazily initialized on first access.
	 */
	get hooks(): IPlatformHooks {
		if (this._hooks === null) {
			this._hooks = createClaudeHooks();
		}
		return this._hooks;
	}

	/**
	 * Get the context generation interface.
	 * Lazily initialized on first access.
	 */
	get context(): IPlatformContext {
		if (this._context === null) {
			this._context = createClaudeContext();
		}
		return this._context;
	}

	/**
	 * Get the agent spawning interface.
	 * Lazily initialized on first access.
	 */
	get spawner(): IPlatformSpawner {
		if (this._spawner === null) {
			this._spawner = createClaudeSpawner();
		}
		return this._spawner;
	}

	/**
	 * Get the metrics discovery interface.
	 * Lazily initialized on first access.
	 */
	get metrics(): IPlatformMetrics {
		if (this._metrics === null) {
			this._metrics = createClaudeMetrics();
		}
		return this._metrics;
	}

	/**
	 * Get the AI operations interface.
	 * Lazily initialized on first access.
	 */
	get ai(): IPlatformAI | undefined {
		if (this._ai === null) {
			this._ai = createClaudeAI();
		}
		return this._ai;
	}

	/**
	 * Get the platform's configuration directory.
	 * For Claude Code, this is ~/.claude
	 *
	 * @returns Absolute path to the config directory
	 */
	getConfigDir(): string {
		return getDefaultConfigDir("claude");
	}

	/**
	 * Get the context directory for generated files.
	 * For Claude Code, this is .claude/ in the project root.
	 *
	 * @param projectRoot - The project root path
	 * @returns Absolute path to the context directory
	 */
	getContextDir(projectRoot: string): string {
		return join(projectRoot, ".claude");
	}

	/**
	 * Get the path to the hooks configuration file.
	 * For Claude Code, this is ~/.claude/settings.local.json
	 *
	 * @returns Absolute path to the hooks config file
	 */
	getHooksConfigPath(): string {
		return join(this.getConfigDir(), "settings.local.json");
	}

	/**
	 * Check if Claude Code is available in the current environment.
	 *
	 * @returns true if claude CLI is found and available
	 */
	async isAvailable(): Promise<boolean> {
		try {
			// Try to find the claude binary
			const proc = Bun.spawnSync(["which", "claude"], {
				stdout: "pipe",
				stderr: "pipe",
			});
			return proc.exitCode === 0;
		} catch {
			return false;
		}
	}

	/**
	 * Get the Claude Code platform version.
	 *
	 * @returns Version string, or null if unavailable
	 */
	async getPlatformVersion(): Promise<string | null> {
		try {
			const proc = Bun.spawnSync(["claude", "--version"], {
				stdout: "pipe",
				stderr: "pipe",
			});

			if (proc.exitCode === 0) {
				const output = proc.stdout.toString().trim();
				// Try to extract version number
				const versionMatch = output.match(/(\d+\.\d+\.\d+)/);
				return versionMatch?.[1] ?? output.split("\n")[0] ?? null;
			}
		} catch {
			// claude command not found or failed
		}
		return null;
	}

	/**
	 * Validate the Claude Code platform configuration.
	 * Ensures all required directories and files are in place.
	 *
	 * @throws Error if configuration is invalid
	 */
	async validate(): Promise<void> {
		const isAvailable = await this.isAvailable();
		if (!isAvailable) {
			throw new Error("Claude Code CLI not found. Install it to use this platform.");
		}

		// Check that config directory exists or can be created
		const configDir = this.getConfigDir();
		if (!existsSync(configDir)) {
			try {
				mkdirSync(configDir, { recursive: true });
			} catch (error) {
				throw new Error(
					`Cannot create Claude config directory at ${configDir}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}

		// Validate hooks installation (may be optional)
		try {
			const hooksInstalled = await this.hooks.isInstalled();
			if (!hooksInstalled) {
				console.warn(
					"Claude hooks not installed. Run 'overstory hooks install' to enable orchestrator features.",
				);
			}
		} catch (error) {
			console.warn(
				`Warning: Could not check hooks installation: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
}

/**
 * Factory function to create a Claude Code platform instance.
 *
 * @returns A new ClaudePlatform instance
 */
export function createClaudePlatform(): IPlatform {
	return new ClaudePlatform();
}
