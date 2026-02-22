import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Git environment variables for test repos.
 * Using env vars instead of per-repo `git config` eliminates 2 subprocess
 * spawns per repo creation.
 */
const GIT_TEST_ENV = {
	GIT_AUTHOR_NAME: "Overstory Test",
	GIT_AUTHOR_EMAIL: "test@overstory.dev",
	GIT_COMMITTER_NAME: "Overstory Test",
	GIT_COMMITTER_EMAIL: "test@overstory.dev",
};

/** Cached template repo path. Created lazily on first call. */
let _templateDir: string | null = null;

/**
 * Get or create a template git repo with an initial commit.
 * All test repos clone from this template (1 subprocess instead of 5).
 */
async function getTemplateRepo(): Promise<string> {
	if (_templateDir) return _templateDir;

	const dir = await mkdtemp(join(tmpdir(), "overstory-template-"));
	await runGitInDir(dir, ["init", "-b", "main"]);
	await Bun.write(join(dir, ".gitkeep"), "");
	await runGitInDir(dir, ["add", ".gitkeep"]);
	await runGitInDir(dir, ["commit", "-m", "initial commit"]);

	_templateDir = dir;
	return dir;
}

/**
 * Create a temporary directory with a real git repo initialized.
 * Includes an initial commit so branches can be created immediately.
 *
 * Uses a cached template repo + `git clone --local` for speed:
 * 1 subprocess per call instead of 5.
 *
 * @returns The absolute path to the temp git repo.
 */
export async function createTempGitRepo(): Promise<string> {
	const template = await getTemplateRepo();
	const dir = await mkdtemp(join(tmpdir(), "overstory-test-"));
	// Clone into the empty dir. Avoid --local (hardlinks trigger EFAULT in Bun's rm).
	await runGitInDir(".", ["clone", template, dir]);
	// Set git identity at repo level so code that doesn't use GIT_TEST_ENV
	// (e.g., resolver's runGit) can still commit. Locally this is covered by
	// ~/.gitconfig, but CI runners have no global git identity.
	await runGitInDir(dir, ["config", "user.name", "Overstory Test"]);
	await runGitInDir(dir, ["config", "user.email", "test@overstory.dev"]);
	return dir;
}

/**
 * Add and commit a file to a git repo.
 *
 * @param repoDir - Absolute path to the git repo
 * @param filePath - Relative path within the repo (e.g. "src/foo.ts")
 * @param content - File content to write
 * @param message - Commit message (defaults to "add {filePath}")
 */
export async function commitFile(
	repoDir: string,
	filePath: string,
	content: string,
	message?: string,
): Promise<void> {
	const fullPath = join(repoDir, filePath);

	// Ensure parent directories exist
	const parentDir = join(fullPath, "..");
	const { mkdir } = await import("node:fs/promises");
	await mkdir(parentDir, { recursive: true });

	await Bun.write(fullPath, content);
	await runGitInDir(repoDir, ["add", filePath]);
	await runGitInDir(repoDir, ["commit", "-m", message ?? `add ${filePath}`]);
}

/**
 * Get the default branch name of a git repo (e.g., "main" or "master").
 * Uses `git symbolic-ref --short HEAD` to read the current branch.
 *
 * Useful in tests to avoid hardcoding "main" -- CI runners may default to "master".
 */
export async function getDefaultBranch(repoDir: string): Promise<string> {
	const stdout = await runGitInDir(repoDir, ["symbolic-ref", "--short", "HEAD"]);
	return stdout.trim();
}

/**
 * Remove a temp directory. Safe to call even if the directory doesn't exist.
 */
export async function cleanupTempDir(dir: string): Promise<void> {
	await rm(dir, { recursive: true, force: true });
}

/**
 * Run a git command in the given directory. Throws on non-zero exit.
 * Passes GIT_AUTHOR/COMMITTER env vars so repos don't need per-repo config.
 */
export async function runGitInDir(cwd: string, args: string[]): Promise<string> {
	const proc = Bun.spawn(["git", ...args], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env, ...GIT_TEST_ENV },
	});

	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);

	if (exitCode !== 0) {
		throw new Error(`git ${args.join(" ")} failed (exit ${exitCode}): ${stderr.trim()}`);
	}

	return stdout;
}

import type {
	AICallConfig,
	AICallResult,
	HooksConfiguration,
	IPlatform,
	IPlatformAI,
	IPlatformContext,
	IPlatformHooks,
	IPlatformMetrics,
	IPlatformSpawner,
	ParsedTranscript,
	SpawnConfig,
	SpawnResult,
	TranscriptDiscovery,
} from "./platform/interface.ts";
import type { PlatformType } from "./platform/types.ts";
import type { OverlayConfig } from "./types.ts";

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Mock platform configuration for Claude Code.
 */
export const MOCK_CLAUDE_CONFIG = {
	type: "claude" as const,
	name: "Mock Claude Code",
	configDir: "/tmp/mock-claude-config",
	sessionDir: "/tmp/mock-claude-sessions",
};

/**
 * Mock platform configuration for Opencode.
 */
export const MOCK_OPENCODE_CONFIG = {
	type: "opencode" as const,
	name: "Mock Opencode",
	configDir: "/tmp/mock-opencode-config",
	sessionDir: "/tmp/mock-opencode-sessions",
};

/**
 * Mock spawn result for testing agent spawning.
 */
export const MOCK_SPAWN_RESULT: SpawnResult = {
	pid: 12345,
	sessionId: "mock-session-123",
	spawnedAt: "2024-01-15T10:30:00.000Z",
	metadata: {
		tmuxSession: "mock-session-123",
		worktreePath: "/tmp/mock-worktree",
	},
};

/**
 * Mock context file content for testing.
 */
export const MOCK_CONTEXT_CONTENT = `# Mock Agent Context

This is a test context file for unit testing.

## Instructions
- Test instruction 1
- Test instruction 2

## Tools
- Read tool allowed
- Write tool allowed
`;

/**
 * Mock transcript discovery result for testing metrics.
 */
export const MOCK_TRANSCRIPT_DISCOVERY: TranscriptDiscovery = {
	path: "/tmp/mock-transcripts/test-session.jsonl",
	agentName: "mock-agent",
	sessionId: "mock-session-123",
	timestamp: "2024-01-15T10:30:00.000Z",
	sizeBytes: 1024,
};

/**
 * Mock parsed transcript for testing.
 */
export const MOCK_PARSED_TRANSCRIPT: ParsedTranscript = {
	meta: {
		path: "/tmp/mock-transcripts/test-session.jsonl",
		agentName: "mock-agent",
		sessionId: "mock-session-123",
		timestamp: "2024-01-15T10:30:00.000Z",
	},
	tokens: {
		input: 1000,
		output: 500,
		cacheRead: 200,
		cacheCreation: 100,
	},
	estimatedCostUsd: 0.015,
	modelUsed: "claude-3-sonnet",
	toolStats: [
		{ name: "Read", count: 10, totalDurationMs: 500 },
		{ name: "Write", count: 5, totalDurationMs: 250 },
	],
};

/**
 * Mock AI call result for testing.
 */
export const MOCK_AI_CALL_RESULT: AICallResult = {
	content: "Mock AI response content",
	modelUsed: "claude-3-sonnet",
	tokens: {
		input: 100,
		output: 50,
		cacheRead: 0,
		cacheCreation: 0,
	},
	truncated: false,
	durationMs: 500,
};

// =============================================================================
// Mock Sub-Interface Implementations
// =============================================================================

/**
 * Create a mock hooks interface for testing.
 */
function createMockHooks(configDir: string): IPlatformHooks {
	return {
		getConfigPath: () => `${configDir}/hooks.json`,
		load: async (): Promise<HooksConfiguration> => ({
			hooks: {
				SessionStart: [],
				UserPromptSubmit: [],
				PreToolUse: [],
				PostToolUse: [],
				Stop: [],
				PreCompact: [],
			},
		}),
		save: async () => {
			// Mock save - no-op
		},
		install: async () => {
			// Mock install - no-op
		},
		uninstall: async () => {
			// Mock uninstall - no-op
		},
		isInstalled: async () => false,
		formatCommand: (command: string, context: Record<string, string>) => {
			let result = command;
			for (const [key, value] of Object.entries(context)) {
				result = result.replace(`{{${key}}}`, value);
			}
			return result;
		},
	};
}

/**
 * Create a mock context interface for testing.
 */
function createMockContext(contextDir: string, contextFileName: string): IPlatformContext {
	return {
		getContextDir: () => contextDir,
		getContextFileName: () => contextFileName,
		generateContent: async (config: OverlayConfig) => {
			// Generate mock content based on overlay config
			return `# Mock Context for ${config.agentName}\n\nCapability: ${config.capability}\n`;
		},
		write: async () => {
			// Mock write - no-op
		},
		read: async () => MOCK_CONTEXT_CONTENT,
		remove: async () => {
			// Mock remove - no-op
		},
	};
}

/**
 * Create a mock spawner interface for testing.
 */
function createMockSpawner(): IPlatformSpawner {
	return {
		spawn: async (config: SpawnConfig): Promise<SpawnResult> => ({
			pid: 12345 + Math.floor(Math.random() * 1000),
			sessionId: `mock-session-${config.agentName}`,
			spawnedAt: new Date().toISOString(),
			metadata: {
				tmuxSession: `mock-session-${config.agentName}`,
				worktreePath: config.worktreePath,
				branchName: config.branchName,
			},
		}),
		terminate: async () => {
			// Mock terminate - no-op
		},
		isRunning: async () => false,
		getPid: async () => null,
		attach: async () => {
			// Mock attach - no-op
		},
		sendInput: async () => {
			// Mock sendInput - no-op
		},
	};
}

/**
 * Create a mock metrics interface for testing.
 */
function createMockMetrics(transcriptsDir: string): IPlatformMetrics {
	return {
		getTranscriptsDir: () => transcriptsDir,
		discoverTranscripts: async (options?: {
			agentName?: string;
			since?: string;
			limit?: number;
		}) => {
			const result = { ...MOCK_TRANSCRIPT_DISCOVERY };
			if (options?.agentName) {
				result.agentName = options.agentName;
			}
			return [result];
		},
		parseTranscript: async () => ({ ...MOCK_PARSED_TRANSCRIPT }),
		extractTokens: (parsed: ParsedTranscript) => ({ ...parsed.tokens }),
		calculateCost: (tokens, _model) => {
			// Simple mock calculation
			return tokens.input * 0.00001 + tokens.output * 0.00003;
		},
		getModelPricing: () => {
			const pricing = new Map();
			pricing.set("claude-3-sonnet", { inputPerMillion: 3, outputPerMillion: 15 });
			pricing.set("claude-3-opus", { inputPerMillion: 15, outputPerMillion: 75 });
			return pricing;
		},
	};
}

/**
 * Create a mock AI interface for testing.
 */
function createMockAI(): IPlatformAI {
	return {
		call: async (config: AICallConfig): Promise<AICallResult> => ({
			...MOCK_AI_CALL_RESULT,
			content: `Mock response to: ${config.userPrompt.substring(0, 50)}...`,
		}),
		stream: async (_config: AICallConfig, onChunk: (chunk: string) => void) => {
			// Mock streaming - emit chunks then return full result
			const chunks = ["Mock ", "stream ", "response"];
			for (const chunk of chunks) {
				onChunk(chunk);
			}
			return {
				...MOCK_AI_CALL_RESULT,
				content: "Mock stream response",
			};
		},
		isAvailable: async () => true,
		getDefaultModel: () => "claude-3-sonnet",
		listModels: async () => ["claude-3-sonnet", "claude-3-opus", "claude-3-haiku"],
	};
}

// =============================================================================
// Mock Platform Factory Functions
// =============================================================================

/**
 * Create a mock platform implementation for testing.
 *
 * @param type - The platform type to mock ('claude' or 'opencode')
 * @returns A mock IPlatform implementation
 */
export function createMockPlatform(type: PlatformType): IPlatform {
	const config = type === "claude" ? MOCK_CLAUDE_CONFIG : MOCK_OPENCODE_CONFIG;
	const contextFileName = type === "claude" ? "CLAUDE.md" : "AGENTS.md";
	const platformId = type === "claude" ? "claude-code" : "opencode";
	const displayName = type === "claude" ? "Mock Claude Code" : "Mock Opencode";

	const hooks = createMockHooks(config.configDir);
	const context = createMockContext(config.sessionDir, contextFileName);
	const spawner = createMockSpawner();
	const metrics = createMockMetrics(`${config.sessionDir}/transcripts`);
	const ai = createMockAI();

	return {
		id: platformId,
		displayName,
		version: "1.0.0-mock",
		hooks,
		context,
		spawner,
		metrics,
		ai,
		getConfigDir: () => config.configDir,
		getContextDir: (projectRoot: string) =>
			type === "claude" ? `${projectRoot}/.claude` : projectRoot,
		getHooksConfigPath: () => `${config.configDir}/hooks.json`,
		isAvailable: async () => true,
		getPlatformVersion: async () => "1.0.0-mock",
		validate: async () => {
			// Mock validation - always passes
		},
	};
}

/**
 * Create a mock Claude Code platform for testing.
 *
 * @returns A mock IPlatform implementation configured as Claude Code
 */
export function createMockClaudePlatform(): IPlatform {
	return createMockPlatform("claude");
}

/**
 * Create a mock Opencode platform for testing.
 *
 * @returns A mock IPlatform implementation configured as Opencode
 */
export function createMockOpencodePlatform(): IPlatform {
	return createMockPlatform("opencode");
}

/**
 * Mock platform helpers for testing.
 *
 * These provide platform-like interfaces without requiring the actual
 * CLI tools to be installed. Used for testing platform-agnostic code.
 */

// Note: join is already imported at the top of the file

/**
 * Get the platform-specific context directory for a project root.
 * For testing purposes, defaults to Claude Code's .claude/ directory.
 *
 * @param projectRoot - The project root path
 * @param platformType - The platform type ("claude" or "opencode")
 * @returns The context directory path
 */
export function getMockContextDir(
	projectRoot: string,
	platformType: "claude" | "opencode" = "claude",
): string {
	if (platformType === "opencode") {
		// Opencode uses AGENTS.md in the project root
		return projectRoot;
	}
	// Claude Code uses .claude/ subdirectory
	return join(projectRoot, ".claude");
}

/**
 * Get the platform-specific settings file name.
 *
 * @param platformType - The platform type
 * @returns The settings file name
 */
export function getMockSettingsFileName(platformType: "claude" | "opencode" = "claude"): string {
	// Claude Code uses settings.local.json, Opencode uses settings.json
	return platformType === "opencode" ? "settings.json" : "settings.local.json";
}

/**
 * Get the platform-specific hooks config path.
 *
 * @param projectRoot - The project root path
 * @param platformType - The platform type
 * @returns The hooks config file path
 */
export function getMockHooksConfigPath(
	projectRoot: string,
	platformType: "claude" | "opencode" = "claude",
): string {
	const contextDir = getMockContextDir(projectRoot, platformType);
	const settingsFileName = getMockSettingsFileName(platformType);
	return join(contextDir, settingsFileName);
}

/**
 * Get the platform-specific context file name (e.g., CLAUDE.md or AGENTS.md).
 *
 * @param platformType - The platform type
 * @returns The context file name
 */
export function getMockContextFileName(platformType: "claude" | "opencode" = "claude"): string {
	return platformType === "opencode" ? "AGENTS.md" : "CLAUDE.md";
}

/**
 * Get the full path to the context file in a worktree.
 *
 * @param worktreePath - The worktree path
 * @param platformType - The platform type
 * @returns The context file path
 */
export function getMockContextFilePath(
	worktreePath: string,
	platformType: "claude" | "opencode" = "claude",
): string {
	if (platformType === "opencode") {
		// Opencode uses AGENTS.md in project root
		return join(worktreePath, "AGENTS.md");
	}
	// Claude Code uses .claude/CLAUDE.md
	return join(worktreePath, ".claude", "CLAUDE.md");
}

/**
 * Get the spawn command for a platform.
 *
 * @param taskDescription - The task description
 * @param platformType - The platform type
 * @returns The spawn command string
 */
export function getMockSpawnCommand(
	taskDescription: string,
	platformType: "claude" | "opencode" = "claude",
): string {
	if (platformType === "opencode") {
		return `opencode --task '${taskDescription}'`;
	}
	return `claude --task '${taskDescription}'`;
}
