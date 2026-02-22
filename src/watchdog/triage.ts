/**
 * Tier 1 AI-assisted failure classification for stalled agents.
 *
 * When an agent is detected as stalled, triage reads recent log entries and
 * uses the configured platform (Claude or Opencode) to classify the situation
 * as recoverable, fatal, or long-running.
 * Falls back to "extend" if platform AI is unavailable.
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { AgentError } from "../errors.ts";
import type { AutoPlatformType } from "../platform/factory.ts";
import { createPlatform } from "../platform/factory.ts";

/**
 * Triage a stalled agent by analyzing its recent log output with AI.
 *
 * Steps:
 * 1. Find the most recent session log directory for the agent
 * 2. Read the last 50 lines of session.log
 * 3. Ask the configured platform AI to classify the situation
 * 4. Parse the response to determine action
 *
 * @param options.agentName - Name of the agent to triage
 * @param options.root - Project root directory (contains .overstory/)
 * @param options.lastActivity - ISO timestamp of the agent's last recorded activity
 * @param options.platformType - Platform to use (defaults to 'auto')
 * @returns "retry" if recoverable, "terminate" if fatal, "extend" if likely long-running
 */
export async function triageAgent(options: {
	agentName: string;
	root: string;
	lastActivity: string;
	/** Timeout in ms for the AI call. Defaults to 30_000 (30s). */
	timeoutMs?: number;
	/** Platform type to use for AI calls. Defaults to 'auto'. */
	platformType?: AutoPlatformType;
}): Promise<"retry" | "terminate" | "extend"> {
	const { agentName, root, lastActivity, platformType = "auto" } = options;
	const logsDir = join(root, ".overstory", "logs", agentName);

	let logContent: string;
	try {
		logContent = await readRecentLog(logsDir);
	} catch {
		// No logs available — assume long-running operation
		return "extend";
	}

	const prompt = buildTriagePrompt(agentName, lastActivity, logContent);

	try {
		const platform = await createPlatform(platformType);
		if (!platform.ai) {
			// Platform doesn't support AI calls — default to extend
			return "extend";
		}

		const result = await platform.ai.call({
			userPrompt: prompt,
			maxTokens: 100, // Short response expected
		});
		return classifyResponse(result.content);
	} catch {
		// Platform AI not available or call failed — default to extend (safe fallback)
		return "extend";
	}
}

/**
 * Read the last 50 lines of the most recent session.log for an agent.
 *
 * @param logsDir - Path to the agent's logs directory (e.g., .overstory/logs/{agent}/)
 * @returns The last 50 lines of the session log as a string
 * @throws AgentError if no log directories or session.log are found
 */
async function readRecentLog(logsDir: string): Promise<string> {
	let entries: string[];
	try {
		entries = await readdir(logsDir);
	} catch {
		throw new AgentError(`No log directory found at ${logsDir}`);
	}

	if (entries.length === 0) {
		throw new AgentError(`No session directories in ${logsDir}`);
	}

	// Session directories are named with timestamps — sort descending to get most recent
	const sorted = entries.sort().reverse();
	const mostRecent = sorted[0];
	if (mostRecent === undefined) {
		throw new AgentError(`No session directories in ${logsDir}`);
	}

	const logPath = join(logsDir, mostRecent, "session.log");
	const file = Bun.file(logPath);
	const exists = await file.exists();

	if (!exists) {
		throw new AgentError(`No session.log found at ${logPath}`);
	}

	const content = await file.text();
	const lines = content.split("\n");

	// Take the last 50 non-empty lines
	const tail = lines.slice(-50).join("\n");
	return tail;
}

/**
 * Build the triage prompt for AI analysis.
 */
export function buildTriagePrompt(
	agentName: string,
	lastActivity: string,
	logContent: string,
): string {
	return [
		"Analyze this agent log and classify the situation.",
		`Agent: ${agentName}`,
		`Last activity: ${lastActivity}`,
		"",
		"Respond with exactly one word: 'retry' if the error is recoverable,",
		"'terminate' if the error is fatal or the agent has failed,",
		"or 'extend' if this looks like a long-running operation.",
		"",
		"Log content:",
		"```",
		logContent,
		"```",
	].join("\n");
}

/** Default timeout for AI calls: 30 seconds */
const DEFAULT_TRIAGE_TIMEOUT_MS = 30_000;

/**
 * @deprecated Use platform.ai.call() directly via triageAgent().
 * This function is kept for backward compatibility but will be removed.
 *
 * Spawn Claude in non-interactive mode to analyze the log.
 *
 * @param prompt - The analysis prompt
 * @param timeoutMs - Timeout in ms for the subprocess (default 30s)
 * @returns Claude's response text
 * @throws Error if claude is not installed, the process fails, or the timeout is reached
 */
export async function spawnClaude(prompt: string, timeoutMs?: number): Promise<string> {
	const timeout = timeoutMs ?? DEFAULT_TRIAGE_TIMEOUT_MS;

	const proc = Bun.spawn(["claude", "--print", "-p", prompt], {
		stdout: "pipe",
		stderr: "pipe",
	});

	const timer = setTimeout(() => {
		proc.kill();
	}, timeout);

	try {
		const exitCode = await proc.exited;
		const stdout = await new Response(proc.stdout).text();

		if (exitCode !== 0) {
			const stderr = await new Response(proc.stderr).text();
			throw new AgentError(`Claude triage failed (exit ${exitCode}): ${stderr.trim()}`);
		}

		return stdout.trim();
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Classify AI's response into a triage action.
 *
 * @param response - AI's raw response text
 * @returns "retry" | "terminate" | "extend"
 */
export function classifyResponse(response: string): "retry" | "terminate" | "extend" {
	const lower = response.toLowerCase();

	if (lower.includes("retry") || lower.includes("recoverable")) {
		return "retry";
	}

	if (lower.includes("terminate") || lower.includes("fatal") || lower.includes("failed")) {
		return "terminate";
	}

	// Default: assume long-running operation
	return "extend";
}
