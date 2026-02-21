/**
 * Core platform interface definitions for the Overstory platform abstraction layer.
 *
 * These interfaces provide an abstraction over platform-specific implementations,
 * allowing Overstory to work with different AI orchestration platforms.
 *
 * All interfaces are pure contracts with no implementation dependencies.
 */

import type { OverlayConfig } from "../types.ts";

// === Platform Types ===

/** Unique identifier for supported platforms. */
export type PlatformId = "claude-code" | "cursor" | "aider" | (string & {});

/** Result of spawning an agent process. */
export interface SpawnResult {
	/** Platform-specific process identifier. */
	pid: number | null;
	/** Platform session identifier (e.g., tmux session name). */
	sessionId: string;
	/** Time when the agent was spawned (ISO timestamp). */
	spawnedAt: string;
	/** Platform-specific metadata. */
	metadata: Record<string, unknown>;
}

/** Configuration for spawning an agent. */
export interface SpawnConfig {
	/** Agent name for identification. */
	agentName: string;
	/** Capability type of the agent. */
	capability: string;
	/** Path to the worktree where the agent will work. */
	worktreePath: string;
	/** Branch name for the agent's work. */
	branchName: string;
	/** Task identifier (bead ID). */
	beadId: string;
	/** Parent agent name (null for top-level agents). */
	parentAgent: string | null;
	/** Hierarchy depth of this agent. */
	depth: number;
	/** Whether to attach to the agent session after spawn. */
	attach?: boolean;
	/** Additional platform-specific options. */
	extra?: Record<string, unknown>;
}

/** Configuration for hook event types. */
export type HookEventType =
	| "SessionStart"
	| "UserPromptSubmit"
	| "PreToolUse"
	| "PostToolUse"
	| "Stop"
	| "PreCompact"
	| (string & {});

/** Result of discovering transcripts. */
export interface TranscriptDiscovery {
	/** Path to the transcript file. */
	path: string;
	/** Agent name extracted from the transcript. */
	agentName: string;
	/** Session ID from the transcript. */
	sessionId: string | null;
	/** Timestamp of the transcript (ISO format). */
	timestamp: string;
	/** File size in bytes. */
	sizeBytes: number;
}

/** Parsed transcript data with extracted metrics. */
export interface ParsedTranscript {
	/** Raw transcript metadata. */
	meta: {
		path: string;
		agentName: string;
		sessionId: string | null;
		timestamp: string;
	};
	/** Extracted token usage metrics. */
	tokens: {
		input: number;
		output: number;
		cacheRead: number;
		cacheCreation: number;
	};
	/** Estimated cost in USD. */
	estimatedCostUsd: number | null;
	/** Model identifier used. */
	modelUsed: string | null;
	/** Tool call statistics. */
	toolStats: Array<{
		name: string;
		count: number;
		totalDurationMs: number;
	}>;
}

/** Configuration for AI calls (non-interactive). */
export interface AICallConfig {
	/** System prompt for the AI. */
	systemPrompt: string;
	/** User prompt/question. */
	userPrompt: string;
	/** Model to use (platform-specific or alias). */
	model?: string;
	/** Maximum tokens in response. */
	maxTokens?: number;
	/** Temperature for response generation. */
	temperature?: number;
	/** Additional platform-specific options. */
	extra?: Record<string, unknown>;
}

/** Result of a non-interactive AI call. */
export interface AICallResult {
	/** Generated response text. */
	content: string;
	/** Model used for generation. */
	modelUsed: string;
	/** Token usage statistics. */
	tokens: {
		input: number;
		output: number;
		cacheRead: number;
		cacheCreation: number;
	};
	/** Whether the response was truncated. */
	truncated: boolean;
	/** Time taken in milliseconds. */
	durationMs: number;
}

/** Context file generation options. */
export interface ContextGenOptions {
	/** Target path for the generated context file. */
	outputPath: string;
	/** Whether to overwrite existing files. */
	overwrite?: boolean;
	/** Additional platform-specific options. */
	extra?: Record<string, unknown>;
}

/** Hook definition for platform hook configuration. */
export interface HookDefinition {
	/** Type of hook (e.g., "command"). */
	type: string;
	/** Command to execute for the hook. */
	command?: string;
	/** Additional hook configuration. */
	[key: string]: unknown;
}

/** Hook matcher configuration. */
export interface HookMatcher {
	/** Pattern to match (empty string matches all). */
	matcher: string;
	/** Hooks to execute when matched. */
	hooks: HookDefinition[];
}

/** Full hooks configuration for a platform. */
export interface HooksConfiguration {
	/** Map of event types to their hook matchers. */
	hooks: Record<HookEventType, HookMatcher[]>;
}

// === Sub-Interfaces ===

/**
 * Interface for platform hook system abstraction.
 * Manages hook configuration, installation, and event handling.
 */
export interface IPlatformHooks {
	/**
	 * Get the path to the hooks configuration file.
	 * @returns Absolute path to the hooks config
	 */
	getConfigPath(): string;

	/**
	 * Load the current hooks configuration.
	 * @returns The parsed hooks configuration
	 */
	load(): Promise<HooksConfiguration>;

	/**
	 * Save hooks configuration to the platform config file.
	 * @param config - The hooks configuration to save
	 */
	save(config: HooksConfiguration): Promise<void>;

	/**
	 * Install hooks into the platform's settings.
	 * @param options - Installation options
	 * @param options.force - Overwrite existing hooks if present
	 */
	install(options?: { force?: boolean }): Promise<void>;

	/**
	 * Remove hooks from the platform's settings.
	 */
	uninstall(): Promise<void>;

	/**
	 * Check if hooks are currently installed.
	 * @returns true if hooks are installed
	 */
	isInstalled(): Promise<boolean>;

	/**
	 * Generate a hook command string for the platform.
	 * @param command - The command template with placeholders
	 * @param context - Context values for placeholder replacement
	 * @returns The formatted command string
	 */
	formatCommand(command: string, context: Record<string, string>): string;
}

/**
 * Interface for context file generation.
 * Handles creation and management of context files (e.g., CLAUDE.md) for agents.
 */
export interface IPlatformContext {
	/**
	 * Get the directory where context files are stored.
	 * @returns Absolute path to the context directory
	 */
	getContextDir(): string;

	/**
	 * Get the expected filename for a context file.
	 * @returns The context file name (e.g., "CLAUDE.md")
	 */
	getContextFileName(): string;

	/**
	 * Generate context content from an overlay configuration.
	 * @param config - The overlay configuration
	 * @returns The generated context content as a string
	 */
	generateContent(config: OverlayConfig): Promise<string>;

	/**
	 * Write a context file to the specified location.
	 * @param worktreePath - Path to the worktree root
	 * @param config - The overlay configuration
	 * @param options - Generation options
	 */
	write(worktreePath: string, config: OverlayConfig, options?: ContextGenOptions): Promise<void>;

	/**
	 * Read an existing context file.
	 * @param worktreePath - Path to the worktree root
	 * @returns The context file content, or null if not found
	 */
	read(worktreePath: string): Promise<string | null>;

	/**
	 * Remove a context file from a worktree.
	 * @param worktreePath - Path to the worktree root
	 */
	remove(worktreePath: string): Promise<void>;
}

/**
 * Interface for agent spawning.
 * Handles the creation and lifecycle of agent processes.
 */
export interface IPlatformSpawner {
	/**
	 * Spawn a new agent process.
	 * @param config - Spawn configuration
	 * @returns Result containing process info and session ID
	 */
	spawn(config: SpawnConfig): Promise<SpawnResult>;

	/**
	 * Terminate a running agent.
	 * @param agentName - Name of the agent to terminate
	 * @param options - Termination options
	 * @param options.force - Force kill if graceful shutdown fails
	 */
	terminate(agentName: string, options?: { force?: boolean }): Promise<void>;

	/**
	 * Check if an agent process is running.
	 * @param agentName - Name of the agent to check
	 * @returns true if the agent is running
	 */
	isRunning(agentName: string): Promise<boolean>;

	/**
	 * Get the PID of a running agent.
	 * @param agentName - Name of the agent
	 * @returns The process ID, or null if not running
	 */
	getPid(agentName: string): Promise<number | null>;

	/**
	 * Attach to an agent's session (e.g., tmux attach).
	 * @param agentName - Name of the agent to attach to
	 */
	attach(agentName: string): Promise<void>;

	/**
	 * Send input to an agent's session.
	 * @param agentName - Name of the agent
	 * @param input - The input to send
	 */
	sendInput(agentName: string, input: string): Promise<void>;
}

/**
 * Interface for transcript and metrics discovery.
 * Handles finding, parsing, and extracting metrics from session transcripts.
 */
export interface IPlatformMetrics {
	/**
	 * Get the directory where transcripts are stored.
	 * @returns Absolute path to the transcripts directory
	 */
	getTranscriptsDir(): string;

	/**
	 * Discover all available transcripts.
	 * @param options - Discovery options
	 * @param options.agentName - Filter by agent name
	 * @param options.since - Only transcripts after this timestamp
	 * @param options.limit - Maximum number to return
	 * @returns Array of discovered transcript metadata
	 */
	discoverTranscripts(options?: {
		agentName?: string;
		since?: string;
		limit?: number;
	}): Promise<TranscriptDiscovery[]>;

	/**
	 * Parse a transcript file and extract metrics.
	 * @param path - Path to the transcript file
	 * @returns Parsed transcript data with metrics
	 */
	parseTranscript(path: string): Promise<ParsedTranscript>;

	/**
	 * Extract token usage from a parsed transcript.
	 * @param parsed - The parsed transcript data
	 * @returns Token usage summary
	 */
	extractTokens(parsed: ParsedTranscript): {
		input: number;
		output: number;
		cacheRead: number;
		cacheCreation: number;
	};

	/**
	 * Calculate estimated cost from token usage.
	 * @param tokens - Token usage counts
	 * @param model - Model identifier
	 * @returns Estimated cost in USD, or null if unknown model
	 */
	calculateCost(
		tokens: { input: number; output: number; cacheRead: number; cacheCreation: number },
		model: string,
	): number | null;

	/**
	 * Get the default model pricing configuration.
	 * @returns Map of model IDs to their pricing (per 1M tokens)
	 */
	getModelPricing(): Map<
		string,
		{ inputPerMillion: number; outputPerMillion: number; cacheReadPerMillion?: number }
	>;
}

/**
 * Interface for non-interactive AI operations.
 * Used for merge resolution, triage, and other automated AI tasks.
 */
export interface IPlatformAI {
	/**
	 * Make a non-interactive AI call.
	 * @param config - AI call configuration
	 * @returns The AI response with metadata
	 */
	call(config: AICallConfig): Promise<AICallResult>;

	/**
	 * Stream an AI response.
	 * @param config - AI call configuration
	 * @param onChunk - Callback for each chunk of the response
	 */
	stream(config: AICallConfig, onChunk: (chunk: string) => void): Promise<AICallResult>;

	/**
	 * Check if AI calls are available.
	 * @returns true if the platform supports AI calls
	 */
	isAvailable(): Promise<boolean>;

	/**
	 * Get the default model for AI calls.
	 * @returns The default model identifier
	 */
	getDefaultModel(): string;

	/**
	 * List available models for AI calls.
	 * @returns Array of available model identifiers
	 */
	listModels(): Promise<string[]>;
}

// === Main Platform Interface ===

/**
 * Main platform abstraction interface.
 * Aggregates all sub-interfaces and provides platform identification.
 *
 * This is the primary entry point for platform-specific functionality.
 * Implementations should provide concrete behavior for a specific
 * AI orchestration platform (Claude Code, Cursor, Aider, etc.).
 */
export interface IPlatform {
	/** Unique identifier for this platform. */
	readonly id: PlatformId;

	/** Human-readable display name. */
	readonly displayName: string;

	/** Version of the platform implementation. */
	readonly version: string;

	// === Path Methods ===

	/**
	 * Get the platform's configuration directory.
	 * This is where platform settings and hooks are stored.
	 * @returns Absolute path to the config directory
	 */
	getConfigDir(): string;

	/**
	 * Get the context directory for generated files.
	 * This is typically `.claude/` in the project root.
	 * @param projectRoot - The project root path
	 * @returns Absolute path to the context directory
	 */
	getContextDir(projectRoot: string): string;

	/**
	 * Get the path to the hooks configuration file.
	 * @returns Absolute path to the hooks config file
	 */
	getHooksConfigPath(): string;

	// === Sub-Interface Accessors ===

	/**
	 * Get the hooks management interface.
	 */
	readonly hooks: IPlatformHooks;

	/**
	 * Get the context generation interface.
	 */
	readonly context: IPlatformContext;

	/**
	 * Get the agent spawning interface.
	 */
	readonly spawner: IPlatformSpawner;

	/**
	 * Get the metrics discovery interface.
	 */
	readonly metrics: IPlatformMetrics;

	/**
	 * Get the AI operations interface.
	 * May be undefined if the platform doesn't support direct AI calls.
	 */
	readonly ai: IPlatformAI | undefined;

	// === Utility Methods ===

	/**
	 * Check if this platform is available in the current environment.
	 * @returns true if the platform is installed and configured
	 */
	isAvailable(): Promise<boolean>;

	/**
	 * Get the platform's version string.
	 * @returns The platform version, or null if unavailable
	 */
	getPlatformVersion(): Promise<string | null>;

	/**
	 * Validate the platform configuration.
	 * @throws Error if configuration is invalid
	 */
	validate(): Promise<void>;
}
