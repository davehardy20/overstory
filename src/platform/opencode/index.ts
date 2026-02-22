/**
 * Opencode platform implementation.
 *
 * Provides the concrete IPlatform implementation for Opencode,
 * including:
 * - Context file generation (AGENTS.md)
 * - Hook management for ~/.config/opencode/hooks.json
 * - Agent spawning via tmux
 * - Transcript discovery and metrics parsing
 * - Non-interactive AI calls
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { OverlayConfig } from "../../types.ts";
import type {
	AICallConfig,
	AICallResult,
	ContextGenOptions,
	HooksConfiguration,
	IPlatform,
	IPlatformAI,
	IPlatformContext,
	IPlatformHooks,
	IPlatformMetrics,
	IPlatformSpawner,
	PlatformId,
	SpawnConfig,
	SpawnResult,
} from "../interface.ts";
import { getDefaultConfigDir } from "../utils.ts";
import { createOpencodeMetrics } from "./metrics.ts";

// === Hooks Implementation ===

/**
 * Opencode platform hooks management.
 *
 * Manages hooks configuration in ~/.config/opencode/hooks.json for orchestrator features.
 */
class OpencodeHooks implements IPlatformHooks {
	getConfigPath(): string {
		const configDir = getDefaultConfigDir("opencode");
		return join(configDir, "hooks.json");
	}

	async load(): Promise<HooksConfiguration> {
		const configPath = this.getConfigPath();

		if (!existsSync(configPath)) {
			return { hooks: {} };
		}

		try {
			const file = Bun.file(configPath);
			const content = await file.text();
			const parsed = JSON.parse(content) as Record<string, unknown>;
			return this.validateHooksConfig(parsed);
		} catch (error) {
			throw new Error(
				`Failed to load hooks configuration from ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	async save(config: HooksConfiguration): Promise<void> {
		const configPath = this.getConfigPath();
		const configDir = dirname(configPath);

		if (!existsSync(configDir)) {
			mkdirSync(configDir, { recursive: true });
		}

		try {
			await Bun.write(configPath, JSON.stringify(config, null, 2));
		} catch (error) {
			throw new Error(
				`Failed to save hooks configuration to ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	async install(options?: { force?: boolean }): Promise<void> {
		const isInstalled = await this.isInstalled();

		if (isInstalled && !options?.force) {
			throw new Error("Hooks already installed. Set force: true to overwrite.");
		}

		const config = this.generateDefaultHooksConfig();
		await this.save(config);
	}

	async uninstall(): Promise<void> {
		const configPath = this.getConfigPath();

		if (existsSync(configPath)) {
			try {
				await Bun.file(configPath).delete?.();
			} catch (error) {
				throw new Error(
					`Failed to remove hooks configuration: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	}

	async isInstalled(): Promise<boolean> {
		const configPath = this.getConfigPath();
		if (!existsSync(configPath)) {
			return false;
		}

		try {
			const config = await this.load();
			return Object.keys(config.hooks).length > 0;
		} catch {
			return false;
		}
	}

	formatCommand(command: string, context: Record<string, string>): string {
		let result = command;
		for (const [key, value] of Object.entries(context)) {
			result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value);
		}
		return result;
	}

	private validateHooksConfig(obj: unknown): HooksConfiguration {
		if (
			typeof obj === "object" &&
			obj !== null &&
			"hooks" in obj &&
			typeof (obj as Record<string, unknown>).hooks === "object"
		) {
			return obj as HooksConfiguration;
		}
		return { hooks: {} };
	}

	private generateDefaultHooksConfig(): HooksConfiguration {
		return {
			hooks: {
				SessionStart: [],
				UserPromptSubmit: [],
				PreToolUse: [],
				PostToolUse: [],
				Stop: [],
				PreCompact: [],
			},
		};
	}
}

// === Context Implementation ===

/**
 * Opencode platform context file generation implementation.
 *
 * Generates AGENTS.md files for agent worktrees by combining:
 * 1. Base agent definition (Layer 1: role-specific HOW)
 * 2. Task-specific overlay (Layer 2: task-specific WHAT)
 * 3. Optional mulch expertise priming
 *
 * The context file is stored in the project root and loaded by Opencode
 * via hooks to prime each agent session.
 */
class OpencodeContext implements IPlatformContext {
	/**
	 * Get the directory where context files are stored.
	 * For Opencode, this is typically the project root (no subdirectory).
	 *
	 * @returns Relative path to the context directory
	 */
	getContextDir(): string {
		return ".";
	}

	/**
	 * Get the expected filename for a context file.
	 * Opencode looks for AGENTS.md by default.
	 *
	 * @returns The context file name
	 */
	getContextFileName(): string {
		return "AGENTS.md";
	}

	/**
	 * Generate context content from an overlay configuration.
	 *
	 * @param config - The overlay configuration containing agent definition and task info
	 * @returns The generated context content as a string
	 */
	async generateContent(config: OverlayConfig): Promise<string> {
		const sections: string[] = [];

		// Layer 1: Base Agent Definition
		sections.push(config.baseDefinition);

		// Layer 2: Task Overlay Header
		sections.push(this.generateOverlayHeader(config));

		// Optional: Mulch Expertise
		if (config.mulchExpertise && config.mulchExpertise.trim().length > 0) {
			sections.push(this.wrapExpertiseSection(config.mulchExpertise));
		}

		return sections.filter((s) => s.trim().length > 0).join("\n\n---\n\n");
	}

	/**
	 * Generate the overlay header (Layer 2: task-specific scope).
	 */
	private generateOverlayHeader(config: OverlayConfig): string {
		const lines: string[] = [];

		lines.push("# Task Overlay (Layer 2)");
		lines.push("");
		lines.push("## Agent Identity");
		lines.push(`- **Name**: ${config.agentName}`);
		lines.push(`- **Capability**: ${config.capability}`);
		lines.push(`- **Depth**: ${config.depth}`);
		lines.push(`- **Can Spawn**: ${config.canSpawn ? "Yes" : "No"}`);

		lines.push("");
		lines.push("## Task Scope");
		lines.push(`- **Bead ID**: ${config.beadId}`);

		if (config.specPath !== null) {
			lines.push(`- **Spec Path**: ${config.specPath}`);
		}

		lines.push(`- **Branch**: ${config.branchName}`);
		lines.push(`- **Worktree**: ${config.worktreePath}`);

		if (config.fileScope.length > 0) {
			lines.push("");
			lines.push("## File Scope");
			lines.push("Exclusive scope (if set, only modify these files):");
			for (const file of config.fileScope) {
				lines.push(`- ${file}`);
			}
		}

		if (config.parentAgent !== null) {
			lines.push("");
			lines.push("## Hierarchy Context");
			lines.push(`- **Parent Agent**: ${config.parentAgent}`);
		}

		if (config.skipScout === true) {
			lines.push("");
			lines.push("## Special Flags");
			lines.push("- **Skip Scout Phase**: Yes (go straight to Phase 2: Build)");
		}

		if (config.mulchDomains.length > 0) {
			lines.push("");
			lines.push("## Expertise Domains");
			lines.push("Mulch expertise loaded for:");
			for (const domain of config.mulchDomains) {
				lines.push(`- ${domain}`);
			}
		}

		return lines.join("\n");
	}

	/**
	 * Wrap expertise content in a markdown section.
	 */
	private wrapExpertiseSection(expertise: string): string {
		const lines: string[] = [];
		lines.push("# Primed Expertise (Mulch)");
		lines.push("");
		lines.push("Project-specific expertise loaded from mulch domains:");
		lines.push("");
		lines.push(expertise);
		return lines.join("\n");
	}

	/**
	 * Write a context file to a worktree.
	 */
	async write(
		worktreePath: string,
		config: OverlayConfig,
		options?: ContextGenOptions,
	): Promise<void> {
		const contextFile = join(worktreePath, this.getContextFileName());

		if (existsSync(contextFile) && options?.overwrite === false) {
			throw new Error(
				`Context file already exists at ${contextFile}. Set overwrite: true to replace.`,
			);
		}

		const content = await this.generateContent(config);
		await Bun.write(contextFile, content);
	}

	/**
	 * Read an existing context file from a worktree.
	 */
	async read(worktreePath: string): Promise<string | null> {
		const contextFile = join(worktreePath, this.getContextFileName());

		if (!existsSync(contextFile)) {
			return null;
		}

		try {
			const file = Bun.file(contextFile);
			return await file.text();
		} catch {
			return null;
		}
	}

	/**
	 * Remove a context file from a worktree.
	 */
	async remove(worktreePath: string): Promise<void> {
		const contextFile = join(worktreePath, this.getContextFileName());

		if (existsSync(contextFile)) {
			try {
				await Bun.file(contextFile).delete?.();
			} catch (error) {
				throw new Error(
					`Failed to remove context file at ${contextFile}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	}
}

// === Spawner Implementation ===

/**
 * Opencode platform agent spawning implementation.
 *
 * Handles spawning agent processes via tmux sessions.
 */
class OpencodeSpawner implements IPlatformSpawner {
	async spawn(config: SpawnConfig): Promise<SpawnResult> {
		const sessionId = config.sessionName ?? `opencode-${config.agentName}`;
		const spawnedAt = new Date().toISOString();
		const command = config.command ?? "opencode";

		// Build tmux args with custom command
		// Use bash -c to handle complex command strings with special characters
		const args = [
			"new-session",
			"-d",
			"-s",
			sessionId,
			"-c",
			config.worktreePath,
			"bash",
			"-c",
			command,
		];

		const proc = Bun.spawnSync(["tmux", ...args], {
			stdout: "pipe",
			stderr: "pipe",
			env: config.env ? { ...process.env, ...config.env } : process.env,
		});

		if (proc.exitCode !== 0) {
			throw new Error(
				`Failed to spawn opencode agent: ${proc.stderr.toString() || "Unknown error"}`,
			);
		}

		// Get the PID from tmux
		const pidProc = Bun.spawnSync(["tmux", "list-panes", "-t", sessionId, "-F", "#{pane_pid}"], {
			stdout: "pipe",
			stderr: "pipe",
		});

		let pid: number | null = null;
		if (pidProc.exitCode === 0) {
			const pidStr = pidProc.stdout.toString().trim().split("\n")[0];
			if (pidStr !== undefined && pidStr !== "") {
				pid = Number.parseInt(pidStr, 10);
			}
		}

		return {
			pid,
			sessionId,
			spawnedAt,
			metadata: {
				capability: config.capability,
				beadId: config.beadId,
				parentAgent: config.parentAgent,
				depth: config.depth,
				command,
			},
		};
	}

	async terminate(agentName: string, options?: { force?: boolean }): Promise<void> {
		const sessionId = `opencode-${agentName}`;

		const killCmd = options?.force ? "kill-session" : "kill-session";
		const proc = Bun.spawnSync(["tmux", killCmd, "-t", sessionId], {
			stdout: "pipe",
			stderr: "pipe",
		});

		if (proc.exitCode !== 0) {
			// Session may not exist, which is fine
			const output = proc.stderr.toString();
			if (!output.includes("can't find session")) {
				throw new Error(`Failed to terminate agent ${agentName}: ${output}`);
			}
		}
	}

	async isRunning(agentName: string): Promise<boolean> {
		const sessionId = `opencode-${agentName}`;
		const proc = Bun.spawnSync(["tmux", "has-session", "-t", sessionId], {
			stdout: "pipe",
			stderr: "pipe",
		});
		return proc.exitCode === 0;
	}

	async getPid(agentName: string): Promise<number | null> {
		const sessionId = `opencode-${agentName}`;

		const proc = Bun.spawnSync(["tmux", "list-panes", "-t", sessionId, "-F", "#{pane_pid}"], {
			stdout: "pipe",
			stderr: "pipe",
		});

		if (proc.exitCode !== 0) {
			return null;
		}

		const pidStr = proc.stdout.toString().trim().split("\n")[0];
		if (pidStr !== undefined && pidStr !== "") {
			return Number.parseInt(pidStr, 10);
		}

		return null;
	}

	async attach(agentName: string): Promise<void> {
		const sessionId = `opencode-${agentName}`;
		const proc = Bun.spawnSync(["tmux", "attach", "-t", sessionId], {
			stdout: "inherit",
			stderr: "inherit",
			stdin: "inherit",
		});

		if (proc.exitCode !== 0) {
			throw new Error(`Failed to attach to agent ${agentName}`);
		}
	}

	async sendInput(agentName: string, input: string): Promise<void> {
		const sessionId = `opencode-${agentName}`;
		const proc = Bun.spawnSync(["tmux", "send-keys", "-t", sessionId, input, "Enter"], {
			stdout: "pipe",
			stderr: "pipe",
		});

		if (proc.exitCode !== 0) {
			throw new Error(`Failed to send input to agent ${agentName}: ${proc.stderr.toString()}`);
		}
	}
}

// === AI Implementation ===

/**
 * Opencode platform AI operations implementation.
 *
 * Provides non-interactive AI call capability for merge resolution, triage, etc.
 */
class OpencodeAI implements IPlatformAI {
	async call(config: AICallConfig): Promise<AICallResult> {
		const startTime = Date.now();
		const model = config.model ?? this.getDefaultModel();

		// Build opencode command for non-interactive call
		const args = ["--print", "--model", model];

		if (config.maxTokens !== undefined) {
			args.push("--max-tokens", config.maxTokens.toString());
		}

		// Build the prompt
		const fullPrompt = config.systemPrompt
			? `${config.systemPrompt}\n\n${config.userPrompt}`
			: config.userPrompt;

		const proc = Bun.spawnSync(["opencode", ...args], {
			input: fullPrompt,
			stdout: "pipe",
			stderr: "pipe",
		});

		if (proc.exitCode !== 0) {
			throw new Error(`Opencode AI call failed: ${proc.stderr.toString()}`);
		}

		const content = proc.stdout.toString();
		const durationMs = Date.now() - startTime;

		return {
			content,
			modelUsed: model,
			tokens: {
				input: 0, // Opencode doesn't return token counts in print mode
				output: 0,
				cacheRead: 0,
				cacheCreation: 0,
			},
			truncated: false,
			durationMs,
		};
	}

	async stream(config: AICallConfig, onChunk: (chunk: string) => void): Promise<AICallResult> {
		const startTime = Date.now();
		const model = config.model ?? this.getDefaultModel();

		// Build opencode command for streaming
		const args = ["--print", "--model", model, "--stream"];

		if (config.maxTokens !== undefined) {
			args.push("--max-tokens", config.maxTokens.toString());
		}

		const fullPrompt = config.systemPrompt
			? `${config.systemPrompt}\n\n${config.userPrompt}`
			: config.userPrompt;

		const proc = Bun.spawn(["opencode", ...args], {
			stdin: "pipe",
			stdout: "pipe",
			stderr: "pipe",
		});

		// Write prompt to stdin
		proc.stdin.write(fullPrompt);
		proc.stdin.end();

		let content = "";
		const reader = proc.stdout.getReader();

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			const chunk = new TextDecoder().decode(value);
			content += chunk;
			onChunk(chunk);
		}

		await proc.exited;
		const durationMs = Date.now() - startTime;

		return {
			content,
			modelUsed: model,
			tokens: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheCreation: 0,
			},
			truncated: false,
			durationMs,
		};
	}

	async isAvailable(): Promise<boolean> {
		try {
			const proc = Bun.spawnSync(["which", "opencode"], {
				stdout: "pipe",
				stderr: "pipe",
			});
			return proc.exitCode === 0;
		} catch {
			return false;
		}
	}

	getDefaultModel(): string {
		return "claude-sonnet-4-20250514";
	}

	async listModels(): Promise<string[]> {
		// Return commonly available models
		return [
			"claude-sonnet-4-20250514",
			"claude-3-5-sonnet-20241022",
			"claude-3-opus-20240229",
			"gpt-4o",
			"gpt-4-turbo",
		];
	}
}

// === Factory Functions ===

function createOpencodeHooks(): IPlatformHooks {
	return new OpencodeHooks();
}

function createOpencodeContext(): IPlatformContext {
	return new OpencodeContext();
}

function createOpencodeSpawner(): IPlatformSpawner {
	return new OpencodeSpawner();
}

function createOpencodeAI(): IPlatformAI {
	return new OpencodeAI();
}

// === Main Platform Class ===

/**
 * Opencode platform implementation.
 *
 * This class aggregates all sub-interfaces (hooks, context, spawner, metrics, ai)
 * and provides platform identification and configuration methods.
 */
export class OpencodePlatform implements IPlatform {
	readonly id: PlatformId = "opencode";
	readonly displayName = "Opencode";
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
			this._hooks = createOpencodeHooks();
		}
		return this._hooks;
	}

	/**
	 * Get the context generation interface.
	 * Lazily initialized on first access.
	 */
	get context(): IPlatformContext {
		if (this._context === null) {
			this._context = createOpencodeContext();
		}
		return this._context;
	}

	/**
	 * Get the agent spawning interface.
	 * Lazily initialized on first access.
	 */
	get spawner(): IPlatformSpawner {
		if (this._spawner === null) {
			this._spawner = createOpencodeSpawner();
		}
		return this._spawner;
	}

	/**
	 * Get the metrics discovery interface.
	 * Lazily initialized on first access.
	 */
	get metrics(): IPlatformMetrics {
		if (this._metrics === null) {
			this._metrics = createOpencodeMetrics();
		}
		return this._metrics;
	}

	/**
	 * Get the AI operations interface.
	 * Lazily initialized on first access.
	 */
	get ai(): IPlatformAI | undefined {
		if (this._ai === null) {
			this._ai = createOpencodeAI();
		}
		return this._ai;
	}

	/**
	 * Get the platform's configuration directory.
	 * For Opencode, this is ~/.config/opencode
	 *
	 * @returns Absolute path to the config directory
	 */
	getConfigDir(): string {
		return getDefaultConfigDir("opencode");
	}

	/**
	 * Get the context directory for generated files.
	 * For Opencode, this is the project root (AGENTS.md is at root).
	 *
	 * @param projectRoot - The project root path
	 * @returns Absolute path to the context directory
	 */
	getContextDir(projectRoot: string): string {
		return projectRoot;
	}

	/**
	 * Get the path to the hooks configuration file.
	 * For Opencode, this is ~/.config/opencode/hooks.json
	 *
	 * @returns Absolute path to the hooks config file
	 */
	getHooksConfigPath(): string {
		return join(this.getConfigDir(), "hooks.json");
	}

	/**
	 * Check if Opencode is available in the current environment.
	 *
	 * @returns true if opencode CLI is found and available
	 */
	async isAvailable(): Promise<boolean> {
		try {
			const proc = Bun.spawnSync(["which", "opencode"], {
				stdout: "pipe",
				stderr: "pipe",
			});
			return proc.exitCode === 0;
		} catch {
			return false;
		}
	}

	/**
	 * Get the Opencode platform version.
	 *
	 * @returns Version string, or null if unavailable
	 */
	async getPlatformVersion(): Promise<string | null> {
		try {
			const proc = Bun.spawnSync(["opencode", "--version"], {
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
			// opencode command not found or failed
		}
		return null;
	}

	/**
	 * Validate the Opencode platform configuration.
	 * Ensures all required directories and files are in place.
	 *
	 * @throws Error if configuration is invalid
	 */
	async validate(): Promise<void> {
		const isAvailable = await this.isAvailable();
		if (!isAvailable) {
			throw new Error("Opencode CLI not found. Install it to use this platform.");
		}

		// Check that config directory exists or can be created
		const configDir = this.getConfigDir();
		if (!existsSync(configDir)) {
			try {
				mkdirSync(configDir, { recursive: true });
			} catch (error) {
				throw new Error(
					`Cannot create Opencode config directory at ${configDir}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}

		// Validate hooks installation (may be optional)
		try {
			const hooksInstalled = await this.hooks.isInstalled();
			if (!hooksInstalled) {
				console.warn(
					"Opencode hooks not installed. Run 'overstory hooks install' to enable orchestrator features.",
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
 * Factory function to create an Opencode platform instance.
 *
 * @returns A new OpencodePlatform instance
 */
export function createOpencodePlatform(): IPlatform {
	return new OpencodePlatform();
}
