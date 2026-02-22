/**
 * Opencode platform metrics and transcript discovery.
 *
 * Discovers and parses Opencode session logs for metrics extraction.
 * Session logs are stored in ~/.config/opencode/sessions/ as JSONL files.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { IPlatformMetrics, ParsedTranscript, TranscriptDiscovery } from "../interface.ts";
import { getDefaultSessionDir } from "../utils.ts";

/**
 * Opencode platform metrics implementation.
 *
 * Handles transcript discovery and parsing from ~/.config/opencode/sessions/.
 * Transcripts are stored as JSONL files with one JSON object per line.
 */
export class OpencodeMetrics implements IPlatformMetrics {
	/**
	 * Get the directory where Opencode transcripts are stored.
	 * @returns Absolute path to the transcripts directory
	 */
	getTranscriptsDir(): string {
		return getDefaultSessionDir("opencode");
	}

	/**
	 * Discover all available Opencode transcripts.
	 *
	 * Searches the transcripts directory for JSONL files and returns
	 * metadata for each discovered transcript.
	 *
	 * @param options - Discovery options
	 * @param options.agentName - Filter by agent name
	 * @param options.since - Only transcripts after this timestamp (ISO format)
	 * @param options.limit - Maximum number to return
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

		// Use glob to find transcript files
		const glob = new Bun.Glob("**/*.jsonl");
		const files = [...glob.scanSync({ cwd: transcriptsDir })];

		for (const file of files) {
			if (results.length >= limit) break;

			const fullPath = join(transcriptsDir, file);
			const stat = await Bun.file(fullPath).stat();

			if (stat === null) continue;

			// Extract agent name from path (first directory component)
			const pathParts = file.split("/");
			const agentName = pathParts[0] ?? "unknown";

			// Filter by agent name if specified
			if (options?.agentName !== undefined && agentName !== options.agentName) {
				continue;
			}

			const timestamp = stat.mtime.toISOString();

			// Filter by timestamp if specified
			if (options?.since !== undefined && timestamp < options.since) {
				continue;
			}

			results.push({
				path: fullPath,
				agentName,
				sessionId: pathParts[1]?.replace(".jsonl", "") ?? null,
				timestamp,
				sizeBytes: stat.size,
			});
		}

		// Sort by timestamp descending (most recent first)
		results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

		return results.slice(0, limit);
	}

	/**
	 * Discover the orchestrator's transcript for a specific project.
	 *
	 * Opencode stores transcripts in ~/.config/opencode/sessions/{agent}/{session}.jsonl
	 * The orchestrator is identified by the "coordinator" agent name.
	 *
	 * @param _projectRoot - The project root path (not used for opencode)
	 * @returns The most recently modified coordinator transcript, or null if none found
	 */
	async discoverOrchestratorTranscript(_projectRoot: string): Promise<TranscriptDiscovery | null> {
		// For opencode, look for coordinator transcripts in the sessions directory
		const transcripts = await this.discoverTranscripts({ agentName: "coordinator", limit: 1 });
		return transcripts[0] ?? null;
	}

	/**
	 * Parse a transcript file and extract metrics.
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
		const agentName = pathParts[pathParts.length - 2] ?? "unknown";
		const sessionId = filename.replace(".jsonl", "");

		const meta = {
			path,
			agentName,
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
				const entry = JSON.parse(line) as Record<string, unknown>;

				// Extract token usage from various possible field names
				// Opencode may use different field names than Claude
				if (typeof entry.input === "number") {
					input += entry.input;
				} else if (typeof entry.input_tokens === "number") {
					input += entry.input_tokens;
				}

				if (typeof entry.output === "number") {
					output += entry.output;
				} else if (typeof entry.output_tokens === "number") {
					output += entry.output_tokens;
				}

				if (typeof entry.cacheRead === "number") {
					cacheRead += entry.cacheRead;
				} else if (typeof entry.cache_read_tokens === "number") {
					cacheRead += entry.cache_read_tokens;
				}

				if (typeof entry.cacheCreation === "number") {
					cacheCreation += entry.cacheCreation;
				} else if (typeof entry.cache_creation_tokens === "number") {
					cacheCreation += entry.cache_creation_tokens;
				}

				// Extract model information
				if (typeof entry.model === "string" && modelUsed === null) {
					modelUsed = entry.model;
				}

				// Extract tool stats
				if (entry.tool !== null && typeof entry.tool === "object") {
					const tool = entry.tool as Record<string, unknown>;
					const toolName = typeof tool.name === "string" ? tool.name : "unknown";
					const existing = toolStats.get(toolName) ?? { count: 0, totalDurationMs: 0 };
					existing.count++;
					if (typeof tool.durationMs === "number") {
						existing.totalDurationMs += tool.durationMs;
					}
					toolStats.set(toolName, existing);
				}

				// Also check for usage object (common in OpenAI-style APIs)
				if (typeof entry.usage === "object" && entry.usage !== null) {
					const usage = entry.usage as Record<string, unknown>;
					if (typeof usage.input_tokens === "number") {
						input += usage.input_tokens;
					}
					if (typeof usage.output_tokens === "number") {
						output += usage.output_tokens;
					}
					if (typeof usage.cache_read_tokens === "number") {
						cacheRead += usage.cache_read_tokens;
					}
					if (typeof usage.cache_creation_tokens === "number") {
						cacheCreation += usage.cache_creation_tokens;
					}
				}
			} catch {
				// Skip malformed lines
			}
		}

		const tokens = { input, output, cacheRead, cacheCreation };

		return {
			meta,
			tokens,
			estimatedCostUsd: this.calculateCost(tokens, modelUsed ?? "unknown"),
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
	 * Uses Opencode/Anthropic pricing models. Returns null if the model
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
		const pricing = this.getModelPricing().get(model);
		if (pricing === undefined) return null;

		const inputCost = (tokens.input / 1_000_000) * pricing.inputPerMillion;
		const outputCost = (tokens.output / 1_000_000) * pricing.outputPerMillion;
		const cacheReadCost =
			pricing.cacheReadPerMillion !== undefined
				? (tokens.cacheRead / 1_000_000) * pricing.cacheReadPerMillion
				: 0;

		return inputCost + outputCost + cacheReadCost;
	}

	/**
	 * Get the default model pricing configuration.
	 *
	 * Returns pricing per 1M tokens for supported models.
	 * Opencode supports various Claude and OpenAI models.
	 *
	 * @returns Map of model IDs to their pricing
	 */
	getModelPricing(): Map<
		string,
		{ inputPerMillion: number; outputPerMillion: number; cacheReadPerMillion?: number }
	> {
		return new Map([
			// Claude models (via Opencode)
			[
				"claude-sonnet-4-20250514",
				{ inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3 },
			],
			["claude-3-5-sonnet-20241022", { inputPerMillion: 3, outputPerMillion: 15 }],
			["claude-3-opus-20240229", { inputPerMillion: 15, outputPerMillion: 75 }],
			[
				"claude-opus-4-1",
				{
					inputPerMillion: 15,
					outputPerMillion: 75,
					cacheReadPerMillion: 1.5,
				},
			],
			[
				"claude-haiku-4-5",
				{
					inputPerMillion: 0.8,
					outputPerMillion: 4,
					cacheReadPerMillion: 0.08,
				},
			],
			// OpenAI models (via Opencode)
			["gpt-4o", { inputPerMillion: 2.5, outputPerMillion: 10 }],
			["gpt-4-turbo", { inputPerMillion: 10, outputPerMillion: 30 }],
			["gpt-4o-mini", { inputPerMillion: 0.15, outputPerMillion: 0.6 }],
			// Generic fallback
			["unknown", { inputPerMillion: 3, outputPerMillion: 15 }],
		]);
	}
}

/**
 * Factory function to create an Opencode metrics instance.
 *
 * @returns A new OpencodeMetrics instance implementing IPlatformMetrics
 */
export function createOpencodeMetrics(): IPlatformMetrics {
	return new OpencodeMetrics();
}
