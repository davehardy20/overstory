/**
 * Parser for transcript JSONL files from multiple platforms.
 *
 * Supports both Claude Code and Opencode transcript formats:
 *
 * Claude format (from ~/.claude/projects/):
 * {
 *   "type": "assistant",
 *   "message": {
 *     "model": "claude-opus-4-6",
 *     "usage": {
 *       "input_tokens": 3,
 *       "output_tokens": 9,
 *       "cache_read_input_tokens": 19401,
 *       "cache_creation_input_tokens": 9918
 *     }
 *   }
 * }
 *
 * Opencode format (from ~/.config/opencode/sessions/):
 * {
 *   "input": 100,
 *   "output": 50,
 *   "cacheRead": 1000,
 *   "cacheCreation": 500,
 *   "model": "claude-sonnet-4-20250514"
 * }
 */

export interface TranscriptUsage {
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheCreationTokens: number;
	modelUsed: string | null;
}

/** Detected transcript format type. */
export type TranscriptFormat = "claude" | "opencode" | "unknown";

/** Pricing per million tokens (USD). */
interface ModelPricing {
	inputPerMTok: number;
	outputPerMTok: number;
	cacheReadPerMTok: number;
	cacheCreationPerMTok: number;
}

/** Hardcoded pricing for known Claude models. */
const MODEL_PRICING: Record<string, ModelPricing> = {
	opus: {
		inputPerMTok: 15,
		outputPerMTok: 75,
		cacheReadPerMTok: 1.5, // 10% of input
		cacheCreationPerMTok: 3.75, // 25% of input
	},
	sonnet: {
		inputPerMTok: 3,
		outputPerMTok: 15,
		cacheReadPerMTok: 0.3, // 10% of input
		cacheCreationPerMTok: 0.75, // 25% of input
	},
	haiku: {
		inputPerMTok: 0.8,
		outputPerMTok: 4,
		cacheReadPerMTok: 0.08, // 10% of input
		cacheCreationPerMTok: 0.2, // 25% of input
	},
};

/**
 * Determine the pricing tier for a given model string.
 * Matches on substring: "opus" -> opus pricing, "sonnet" -> sonnet, "haiku" -> haiku.
 * Returns null if unrecognized.
 */
function getPricingForModel(model: string): ModelPricing | null {
	const lower = model.toLowerCase();
	if (lower.includes("opus")) return MODEL_PRICING.opus ?? null;
	if (lower.includes("sonnet")) return MODEL_PRICING.sonnet ?? null;
	if (lower.includes("haiku")) return MODEL_PRICING.haiku ?? null;
	return null;
}

/**
 * Calculate the estimated cost in USD for a given usage and model.
 * Returns null if the model is unrecognized.
 */
export function estimateCost(usage: TranscriptUsage): number | null {
	if (usage.modelUsed === null) return null;

	const pricing = getPricingForModel(usage.modelUsed);
	if (pricing === null) return null;

	const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputPerMTok;
	const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputPerMTok;
	const cacheReadCost = (usage.cacheReadTokens / 1_000_000) * pricing.cacheReadPerMTok;
	const cacheCreationCost = (usage.cacheCreationTokens / 1_000_000) * pricing.cacheCreationPerMTok;

	return inputCost + outputCost + cacheReadCost + cacheCreationCost;
}

/**
 * Detect the format of a transcript entry.
 * Returns "claude" for Claude-style entries, "opencode" for Opencode-style, "unknown" otherwise.
 */
export function detectEntryFormat(entry: unknown): TranscriptFormat {
	if (typeof entry !== "object" || entry === null) return "unknown";

	const obj = entry as Record<string, unknown>;

	// Claude format: has type: "assistant" with nested message.usage
	if (obj.type === "assistant" && typeof obj.message === "object" && obj.message !== null) {
		const msg = obj.message as Record<string, unknown>;
		if (typeof msg.usage === "object" && msg.usage !== null) {
			return "claude";
		}
	}

	// Opencode format: has flat input/output fields
	if (typeof obj.input === "number" || typeof obj.output === "number") {
		return "opencode";
	}

	return "unknown";
}

/**
 * Extract usage from a Claude format entry.
 * Returns the usage fields if valid, or null otherwise.
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

/**
 * Extract usage from an Opencode format entry.
 * Returns the usage fields if valid, or null otherwise.
 */
function extractOpencodeUsage(entry: unknown): {
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheCreationTokens: number;
	model: string | undefined;
} | null {
	if (typeof entry !== "object" || entry === null) return null;

	const obj = entry as Record<string, unknown>;

	// Opencode format has flat fields
	const hasInputOrOutput = typeof obj.input === "number" || typeof obj.output === "number";
	if (!hasInputOrOutput) return null;

	return {
		inputTokens: typeof obj.input === "number" ? obj.input : 0,
		outputTokens: typeof obj.output === "number" ? obj.output : 0,
		cacheReadTokens: typeof obj.cacheRead === "number" ? obj.cacheRead : 0,
		cacheCreationTokens: typeof obj.cacheCreation === "number" ? obj.cacheCreation : 0,
		model: typeof obj.model === "string" ? obj.model : undefined,
	};
}

/**
 * Extract usage from a transcript entry, auto-detecting the format.
 * Returns the usage fields if valid, or null otherwise.
 */
function extractUsageFromEntry(entry: unknown): {
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheCreationTokens: number;
	model: string | undefined;
} | null {
	const format = detectEntryFormat(entry);

	if (format === "claude") {
		return extractClaudeUsage(entry);
	}

	if (format === "opencode") {
		return extractOpencodeUsage(entry);
	}

	return null;
}

/**
 * Parse a transcript JSONL file and aggregate token usage.
 *
 * Supports both Claude and Opencode transcript formats, auto-detecting
 * the format from the file contents. Reads the file line by line,
 * extracting usage data from each entry.
 *
 * @param transcriptPath - Absolute path to the transcript JSONL file
 * @returns Aggregated usage data across all entries
 */
export async function parseTranscriptUsage(transcriptPath: string): Promise<TranscriptUsage> {
	const file = Bun.file(transcriptPath);
	const text = await file.text();
	const lines = text.split("\n");

	const result: TranscriptUsage = {
		inputTokens: 0,
		outputTokens: 0,
		cacheReadTokens: 0,
		cacheCreationTokens: 0,
		modelUsed: null,
	};

	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.length === 0) continue;

		let parsed: unknown;
		try {
			parsed = JSON.parse(trimmed);
		} catch {
			// Skip malformed lines
			continue;
		}

		const usage = extractUsageFromEntry(parsed);
		if (usage === null) continue;

		result.inputTokens += usage.inputTokens;
		result.outputTokens += usage.outputTokens;
		result.cacheReadTokens += usage.cacheReadTokens;
		result.cacheCreationTokens += usage.cacheCreationTokens;

		// Capture model from first valid entry
		if (result.modelUsed === null && usage.model !== undefined) {
			result.modelUsed = usage.model;
		}
	}

	return result;
}

/**
 * Detect the dominant format of a transcript file.
 * Samples entries to determine whether the file is Claude or Opencode format.
 *
 * @param transcriptPath - Absolute path to the transcript JSONL file
 * @returns The detected format, or "unknown" if indeterminate
 */
export async function detectTranscriptFormat(transcriptPath: string): Promise<TranscriptFormat> {
	const file = Bun.file(transcriptPath);
	const text = await file.text();
	const lines = text.split("\n");

	let claudeCount = 0;
	let opencodeCount = 0;

	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.length === 0) continue;

		let parsed: unknown;
		try {
			parsed = JSON.parse(trimmed);
		} catch {
			continue;
		}

		const format = detectEntryFormat(parsed);
		if (format === "claude") claudeCount++;
		else if (format === "opencode") opencodeCount++;

		// Stop after sampling 10 entries
		if (claudeCount + opencodeCount >= 10) break;
	}

	if (claudeCount > opencodeCount) return "claude";
	if (opencodeCount > claudeCount) return "opencode";
	if (claudeCount > 0 && claudeCount === opencodeCount) return "claude"; // Tie-breaker: prefer Claude
	return "unknown";
}
