/**
 * Claude Code metrics and transcript discovery.
 *
 * Discovers and parses Claude Code session transcripts for metrics extraction.
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { IPlatformMetrics, ParsedTranscript, TranscriptDiscovery } from "../interface.ts";

export class ClaudeMetrics implements IPlatformMetrics {
	getTranscriptsDir(): string {
		return join(homedir(), ".claude", "transcripts");
	}

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

		try {
			const entries = await Bun.file(transcriptsDir).entries?.();
			if (!entries) {
				return [];
			}

			for await (const entry of entries) {
				if (!entry.name.endsWith(".jsonl")) {
					continue;
				}

				const agentName = this.extractAgentNameFromPath(entry.name);
				if (options?.agentName && agentName !== options.agentName) {
					continue;
				}

				const path = join(transcriptsDir, entry.name);
				const stat = await Bun.file(path).size;

				results.push({
					path,
					agentName,
					sessionId: null,
					timestamp: new Date().toISOString(),
					sizeBytes: stat ?? 0,
				});

				if (options?.limit && results.length >= options.limit) {
					break;
				}
			}
		} catch {
			// Transcript discovery failed
		}

		return results;
	}

	async parseTranscript(path: string): Promise<ParsedTranscript> {
		const agentName = this.extractAgentNameFromPath(path);

		return {
			meta: {
				path,
				agentName,
				sessionId: null,
				timestamp: new Date().toISOString(),
			},
			tokens: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheCreation: 0,
			},
			estimatedCostUsd: null,
			modelUsed: null,
			toolStats: [],
		};
	}

	extractTokens(parsed: ParsedTranscript): {
		input: number;
		output: number;
		cacheRead: number;
		cacheCreation: number;
	} {
		return parsed.tokens;
	}

	calculateCost(
		tokens: {
			input: number;
			output: number;
			cacheRead: number;
			cacheCreation: number;
		},
		model: string,
	): number | null {
		const pricing = this.getModelPricing();
		const modelPricing = pricing.get(model);

		if (!modelPricing) {
			return null;
		}

		const inputCost = (tokens.input / 1_000_000) * modelPricing.inputPerMillion;
		const outputCost = (tokens.output / 1_000_000) * modelPricing.outputPerMillion;
		const cacheReadCost = (tokens.cacheRead / 1_000_000) * (modelPricing.cacheReadPerMillion ?? 0);

		return inputCost + outputCost + cacheReadCost;
	}

	getModelPricing(): Map<
		string,
		{ inputPerMillion: number; outputPerMillion: number; cacheReadPerMillion?: number }
	> {
		return new Map([
			[
				"claude-opus-4-1",
				{
					inputPerMillion: 15,
					outputPerMillion: 75,
					cacheReadPerMillion: 1.5,
				},
			],
			[
				"claude-sonnet-4-20250514",
				{
					inputPerMillion: 3,
					outputPerMillion: 15,
					cacheReadPerMillion: 0.3,
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
		]);
	}

	private extractAgentNameFromPath(path: string): string {
		const parts = path.split("/");
		const filename = parts[parts.length - 1] ?? "unknown";
		return filename.replace(".jsonl", "").replace(".json", "");
	}
}

export function createClaudeMetrics(): IPlatformMetrics {
	return new ClaudeMetrics();
}
