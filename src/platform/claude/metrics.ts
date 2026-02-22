/**
 * Claude Code metrics and transcript discovery.
 *
 * Discovers and parses Claude Code session transcripts for metrics extraction.
 * Transcripts are stored in ~/.claude/projects/{project-key}/ as JSONL files.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { IPlatformMetrics, ParsedTranscript, TranscriptDiscovery } from "../interface.ts";
import { getHomeDir } from "../utils.ts";

/** Pricing per million tokens (USD) for Claude models. */
interface ModelPricing {
	inputPerMillion: number;
	outputPerMillion: number;
	cacheReadPerMillion: number;
	cacheCreationPerMillion: number;
}

/** Hardcoded pricing for known Claude models. */
const MODEL_PRICING: Record<string, ModelPricing> = {
	opus: {
		inputPerMillion: 15,
		outputPerMillion: 75,
		cacheReadPerMillion: 1.5, // 10% of input
		cacheCreationPerMillion: 3.75, // 25% of input
	},
	sonnet: {
		inputPerMillion: 3,
		outputPerMillion: 15,
		cacheReadPerMillion: 0.3, // 10% of input
		cacheCreationPerMillion: 0.75, // 25% of input
	},
	haiku: {
		inputPerMillion: 0.8,
		outputPerMillion: 4,
		cacheReadPerMillion: 0.08, // 10% of input
		cacheCreationPerMillion: 0.2, // 25% of input
	},
};

/**
 * Determine the pricing tier for a given model string.
 * Matches on substring: "opus" -> opus pricing, "sonnet" -> sonnet, "haiku" -> haiku.
 */
function getPricingForModel(model: string): ModelPricing | null {
	const lower = model.toLowerCase();
	if (lower.includes("opus")) return MODEL_PRICING.opus ?? null;
	if (lower.includes("sonnet")) return MODEL_PRICING.sonnet ?? null;
	if (lower.includes("haiku")) return MODEL_PRICING.haiku ?? null;
	return null;
}

/**
 * Extract usage from a Claude format entry.
 * Claude format: { "type": "assistant", "message": { "model": "...", "usage": { ... } } }
 */
function extractClaudeUsage(entry: unknown): {
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheCreationTokens: number;
	model: string | undefined;
} | null {
	if (typeof entry !== "object" || entry === null) return null;

	const obj = entry as Record<string, unknown>;
	if (obj.type !== "assistant") return null;

	const message = obj.message;
	if (typeof message !== "object" || message === null) return null;

	const msg = message as Record<string, unknown>;
	const usage = msg.usage;
	if (typeof usage !== "object" || usage === null) return null;

	const u = usage as Record<string, unknown>;

	return {
		inputTokens: typeof u.input_tokens === "number" ? u.input_tokens : 0,
		outputTokens: typeof u.output_tokens === "number" ? u.output_tokens : 0,
		cacheReadTokens: typeof u.cache_read_input_tokens === "number" ? u.cache_read_input_tokens : 0,
		cacheCreationTokens:
			typeof u.cache_creation_input_tokens === "number" ? u.cache_creation_input_tokens : 0,
		model: typeof msg.model === "string" ? msg.model : undefined,
	};
}

export class ClaudeMetrics implements IPlatformMetrics {
	/**
	 * Get the directory where Claude Code transcripts are stored.
	 * @returns Absolute path to the transcripts directory
	 */
	getTranscriptsDir(): string {
		return join(getHomeDir(), ".claude", "projects");
	}

	/**
	 * Discover the orchestrator's transcript for a specific project.
	 *
	 * Claude Code stores transcripts in ~/.claude/projects/{project-key}/*.jsonl
	 * where project-key is the project path with slashes replaced by dashes.
	 *
	 * @param projectRoot - The project root path
	 * @returns The most recently modified transcript, or null if none found
	 */
	async discoverOrchestratorTranscript(projectRoot: string): Promise<TranscriptDiscovery | null> {
		const homeDir = getHomeDir();
		const projectKey = projectRoot.replace(/\//g, "-");
		const projectDir = join(homeDir, ".claude", "projects", projectKey);

		if (!existsSync(projectDir)) {
			return null;
		}

		try {
			const entries = readdirSync(projectDir);
			const jsonlFiles = entries.filter((e) => e.endsWith(".jsonl"));

			if (jsonlFiles.length === 0) {
				return null;
			}

			// Find the most recently modified file
			let bestFile: string | null = null;
			let bestMtime = 0;

			for (const file of jsonlFiles) {
				const filePath = join(projectDir, file);
				try {
					const fileStat = statSync(filePath);
					if (fileStat.mtimeMs > bestMtime) {
						bestMtime = fileStat.mtimeMs;
						bestFile = file;
					}
				} catch {
					// Skip files we cannot stat
				}
			}

			if (bestFile === null) {
				return null;
			}

			const path = join(projectDir, bestFile);
			const stat = statSync(path);

			return {
				path,
				agentName: "orchestrator",
				sessionId: bestFile.replace(".jsonl", ""),
				timestamp: new Date(stat.mtime).toISOString(),
				sizeBytes: stat.size,
			};
		} catch {
			return null;
		}
	}

	/**
	 * Discover all available Claude transcripts.
	 *
	 * @param options - Discovery options
	 * @returns Array of discovered transcript metadata
	 */
	async discoverTranscripts(options?: {
		agentName?: string;
		since?: string;
		limit?: number;
	}): Promise<TranscriptDiscovery[]> {
		const transcriptsDir = this.getTranscriptsDir();

		if (!existsSync(transcriptsDir)) {
			return [];
		}

		const results: TranscriptDiscovery[] = [];
		const limit = options?.limit ?? 100;

		try {
			const projectDirs = readdirSync(transcriptsDir);

			for (const projectDir of projectDirs) {
				if (results.length >= limit) break;

				const fullProjectDir = join(transcriptsDir, projectDir);
				try {
					const stat = statSync(fullProjectDir);
					if (!stat.isDirectory()) continue;

					const files = readdirSync(fullProjectDir);
					for (const file of files) {
						if (results.length >= limit) break;
						if (!file.endsWith(".jsonl")) continue;

						const fullPath = join(fullProjectDir, file);
						const fileStat = statSync(fullPath);
						const timestamp = new Date(fileStat.mtime).toISOString();

						// Filter by timestamp if specified
						if (options?.since !== undefined && timestamp < options.since) {
							continue;
						}

						results.push({
							path: fullPath,
							agentName: projectDir, // Use project key as agent name
							sessionId: file.replace(".jsonl", ""),
							timestamp,
							sizeBytes: fileStat.size,
						});
					}
				} catch {
					// Skip directories we cannot read
				}
			}
		} catch {
			// Transcript discovery failed
		}

		// Sort by timestamp descending (most recent first)
		results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

		return results.slice(0, limit);
	}

	/**
	 * Parse a Claude transcript file and extract metrics.
	 *
	 * Parses JSONL format transcript files and extracts:
	 * - Token usage (input, output, cache read, cache creation)
	 * - Model information
	 * - Tool call statistics
	 *
	 * @param path - Path to the transcript file
	 * @returns Parsed transcript data with metrics
	 */
	async parseTranscript(path: string): Promise<ParsedTranscript> {
		const file = Bun.file(path);
		const content = await file.text();
		const lines = content.trim().split("\n");

		// Extract metadata from file path
		const pathParts = path.split("/");
		const filename = pathParts[pathParts.length - 1] ?? "unknown";
		const projectKey = pathParts[pathParts.length - 2] ?? "unknown";
		const sessionId = filename.replace(".jsonl", "");

		const meta = {
			path,
			agentName: projectKey,
			sessionId,
			timestamp: new Date().toISOString(),
		};

		// Initialize token counters
		let input = 0;
		let output = 0;
		let cacheRead = 0;
		let cacheCreation = 0;
		let modelUsed: string | null = null;
		const toolStats: Map<string, { count: number; totalDurationMs: number }> = new Map();

		// Parse each line as JSON
		for (const line of lines) {
			if (line.trim() === "") continue;

			try {
				const entry = JSON.parse(line) as unknown;

				// Extract token usage from Claude format
				const usage = extractClaudeUsage(entry);
				if (usage !== null) {
					input += usage.inputTokens;
					output += usage.outputTokens;
					cacheRead += usage.cacheReadTokens;
					cacheCreation += usage.cacheCreationTokens;

					// Capture model from first valid entry
					if (modelUsed === null && usage.model !== undefined) {
						modelUsed = usage.model;
					}
				}

				// Extract tool stats from tool_use entries
				if (typeof entry === "object" && entry !== null) {
					const obj = entry as Record<string, unknown>;
					if (obj.type === "tool_use" && typeof obj.name === "string") {
						const toolName = obj.name;
						const existing = toolStats.get(toolName) ?? { count: 0, totalDurationMs: 0 };
						existing.count++;
						toolStats.set(toolName, existing);
					}
				}
			} catch {
				// Skip malformed lines
			}
		}

		const tokens = { input, output, cacheRead, cacheCreation };
		const estimatedCostUsd = modelUsed !== null ? this.calculateCost(tokens, modelUsed) : null;

		return {
			meta,
			tokens,
			estimatedCostUsd,
			modelUsed,
			toolStats: Array.from(toolStats.entries()).map(([name, stats]) => ({
				name,
				count: stats.count,
				totalDurationMs: stats.totalDurationMs,
			})),
		};
	}

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
	} {
		return parsed.tokens;
	}

	/**
	 * Calculate estimated cost from token usage.
	 *
	 * Uses Claude pricing models. Returns null if the model
	 * pricing is unknown.
	 *
	 * @param tokens - Token usage counts
	 * @param model - Model identifier
	 * @returns Estimated cost in USD, or null if unknown model
	 */
	calculateCost(
		tokens: { input: number; output: number; cacheRead: number; cacheCreation: number },
		model: string,
	): number | null {
		const pricing = getPricingForModel(model);
		if (pricing === null) return null;

		const inputCost = (tokens.input / 1_000_000) * pricing.inputPerMillion;
		const outputCost = (tokens.output / 1_000_000) * pricing.outputPerMillion;
		const cacheReadCost = (tokens.cacheRead / 1_000_000) * pricing.cacheReadPerMillion;
		const cacheCreationCost = (tokens.cacheCreation / 1_000_000) * pricing.cacheCreationPerMillion;

		return inputCost + outputCost + cacheReadCost + cacheCreationCost;
	}

	/**
	 * Get the default model pricing configuration.
	 *
	 * Returns pricing per 1M tokens for supported models.
	 *
	 * @returns Map of model IDs to their pricing
	 */
	getModelPricing(): Map<
		string,
		{ inputPerMillion: number; outputPerMillion: number; cacheReadPerMillion?: number }
	> {
		return new Map([
			["claude-opus-4-1", { inputPerMillion: 15, outputPerMillion: 75, cacheReadPerMillion: 1.5 }],
			[
				"claude-sonnet-4-20250514",
				{ inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3 },
			],
			[
				"claude-haiku-4-5",
				{ inputPerMillion: 0.8, outputPerMillion: 4, cacheReadPerMillion: 0.08 },
			],
		]);
	}
}

export function createClaudeMetrics(): IPlatformMetrics {
	return new ClaudeMetrics();
}
