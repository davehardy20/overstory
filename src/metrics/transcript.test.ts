/**
 * Tests for dual-format transcript JSONL parser (Claude + Opencode).
 *
 * Uses temp files with real-format JSONL data. No mocks.
 * Philosophy: "never mock what you can use for real" (mx-252b16).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanupTempDir } from "../test-helpers.ts";
import {
	detectEntryFormat,
	detectTranscriptFormat,
	estimateCost,
	parseTranscriptUsage,
	type TranscriptFormat,
} from "./transcript.ts";

let tempDir: string;

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "overstory-transcript-test-"));
});

afterEach(async () => {
	await cleanupTempDir(tempDir);
});

/** Write a JSONL file with the given lines. */
async function writeJsonl(filename: string, lines: unknown[]): Promise<string> {
	const path = join(tempDir, filename);
	const content = `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`;
	await Bun.write(path, content);
	return path;
}

// === detectEntryFormat ===

describe("detectEntryFormat", () => {
	test("detects Claude format entry", () => {
		const entry = {
			type: "assistant",
			message: {
				model: "claude-opus-4-6",
				usage: { input_tokens: 100, output_tokens: 50 },
			},
		};
		expect(detectEntryFormat(entry)).toBe("claude");
	});

	test("detects Opencode format entry", () => {
		const entry = { input: 100, output: 50, model: "claude-sonnet-4-20250514" };
		expect(detectEntryFormat(entry)).toBe("opencode");
	});

	test("detects Opencode format with only input field", () => {
		const entry = { input: 100, model: "claude-sonnet-4-20250514" };
		expect(detectEntryFormat(entry)).toBe("opencode");
	});

	test("detects Opencode format with only output field", () => {
		const entry = { output: 50, model: "claude-sonnet-4-20250514" };
		expect(detectEntryFormat(entry)).toBe("opencode");
	});

	test("returns unknown for non-matching entry", () => {
		const entry = { type: "human", message: { content: "hello" } };
		expect(detectEntryFormat(entry)).toBe("unknown");
	});

	test("returns unknown for null", () => {
		expect(detectEntryFormat(null)).toBe("unknown");
	});

	test("returns unknown for primitive", () => {
		expect(detectEntryFormat("string")).toBe("unknown");
		expect(detectEntryFormat(123)).toBe("unknown");
	});
});

// === detectTranscriptFormat ===

describe("detectTranscriptFormat", () => {
	test("detects Claude format file", async () => {
		const path = await writeJsonl("claude.jsonl", [
			{
				type: "assistant",
				message: { model: "claude-opus-4-6", usage: { input_tokens: 100, output_tokens: 50 } },
			},
			{ type: "human", message: { content: "hello" } },
			{
				type: "assistant",
				message: { model: "claude-opus-4-6", usage: { input_tokens: 200, output_tokens: 75 } },
			},
		]);
		expect(await detectTranscriptFormat(path)).toBe("claude");
	});

	test("detects Opencode format file", async () => {
		const path = await writeJsonl("opencode.jsonl", [
			{ input: 100, output: 50, model: "claude-sonnet-4-20250514" },
			{ input: 200, output: 75, model: "claude-sonnet-4-20250514" },
		]);
		expect(await detectTranscriptFormat(path)).toBe("opencode");
	});

	test("returns unknown for empty file", async () => {
		const path = join(tempDir, "empty.jsonl");
		await Bun.write(path, "");
		expect(await detectTranscriptFormat(path)).toBe("unknown");
	});

	test("returns unknown for file with no recognizable entries", async () => {
		const path = await writeJsonl("unknown.jsonl", [
			{ type: "human", message: { content: "hello" } },
			{ type: "system", content: "system prompt" },
		]);
		expect(await detectTranscriptFormat(path)).toBe("unknown");
	});

	test("prefers Claude on tie", async () => {
		const path = await writeJsonl("tie.jsonl", [
			{
				type: "assistant",
				message: { model: "claude-opus-4-6", usage: { input_tokens: 100, output_tokens: 50 } },
			},
			{ input: 100, output: 50, model: "claude-sonnet-4-20250514" },
		]);
		expect(await detectTranscriptFormat(path)).toBe("claude");
	});
});

// === parseTranscriptUsage (Claude format) ===

describe("parseTranscriptUsage - Claude format", () => {
	test("parses a single assistant entry with all usage fields", async () => {
		const path = await writeJsonl("single.jsonl", [
			{
				type: "assistant",
				message: {
					model: "claude-opus-4-6",
					usage: {
						input_tokens: 100,
						output_tokens: 50,
						cache_read_input_tokens: 1000,
						cache_creation_input_tokens: 500,
					},
				},
			},
		]);

		const usage = await parseTranscriptUsage(path);

		expect(usage.inputTokens).toBe(100);
		expect(usage.outputTokens).toBe(50);
		expect(usage.cacheReadTokens).toBe(1000);
		expect(usage.cacheCreationTokens).toBe(500);
		expect(usage.modelUsed).toBe("claude-opus-4-6");
	});

	test("aggregates usage across multiple assistant turns", async () => {
		const path = await writeJsonl("multi.jsonl", [
			{
				type: "assistant",
				message: {
					model: "claude-sonnet-4-20250514",
					usage: {
						input_tokens: 100,
						output_tokens: 50,
						cache_read_input_tokens: 1000,
						cache_creation_input_tokens: 500,
					},
				},
			},
			{
				type: "human",
				message: { content: "follow-up question" },
			},
			{
				type: "assistant",
				message: {
					model: "claude-sonnet-4-20250514",
					usage: {
						input_tokens: 200,
						output_tokens: 75,
						cache_read_input_tokens: 2000,
						cache_creation_input_tokens: 0,
					},
				},
			},
		]);

		const usage = await parseTranscriptUsage(path);

		expect(usage.inputTokens).toBe(300);
		expect(usage.outputTokens).toBe(125);
		expect(usage.cacheReadTokens).toBe(3000);
		expect(usage.cacheCreationTokens).toBe(500);
		expect(usage.modelUsed).toBe("claude-sonnet-4-20250514");
	});

	test("skips non-assistant entries (human, system, tool_use, etc.)", async () => {
		const path = await writeJsonl("mixed.jsonl", [
			{ type: "system", content: "system prompt" },
			{
				type: "assistant",
				message: {
					model: "claude-opus-4-6",
					usage: {
						input_tokens: 100,
						output_tokens: 50,
						cache_read_input_tokens: 0,
						cache_creation_input_tokens: 0,
					},
				},
			},
			{ type: "human", message: { content: "hello" } },
			{ type: "tool_result", content: "result" },
		]);

		const usage = await parseTranscriptUsage(path);

		expect(usage.inputTokens).toBe(100);
		expect(usage.outputTokens).toBe(50);
	});

	test("returns zeros for empty file", async () => {
		const path = join(tempDir, "empty.jsonl");
		await Bun.write(path, "");

		const usage = await parseTranscriptUsage(path);

		expect(usage.inputTokens).toBe(0);
		expect(usage.outputTokens).toBe(0);
		expect(usage.cacheReadTokens).toBe(0);
		expect(usage.cacheCreationTokens).toBe(0);
		expect(usage.modelUsed).toBeNull();
	});

	test("returns zeros for file with no assistant entries", async () => {
		const path = await writeJsonl("no-assistant.jsonl", [
			{ type: "human", message: { content: "hello" } },
			{ type: "system", content: "system prompt" },
		]);

		const usage = await parseTranscriptUsage(path);

		expect(usage.inputTokens).toBe(0);
		expect(usage.outputTokens).toBe(0);
		expect(usage.modelUsed).toBeNull();
	});

	test("gracefully handles malformed JSON lines", async () => {
		const path = join(tempDir, "malformed.jsonl");
		const content = [
			'{"type":"assistant","message":{"model":"claude-opus-4-6","usage":{"input_tokens":100,"output_tokens":50,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}}}',
			"this is not valid json",
			"",
			'{"type":"assistant","message":{"model":"claude-opus-4-6","usage":{"input_tokens":200,"output_tokens":75,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}}}',
		].join("\n");
		await Bun.write(path, content);

		const usage = await parseTranscriptUsage(path);

		expect(usage.inputTokens).toBe(300);
		expect(usage.outputTokens).toBe(125);
	});

	test("handles assistant entries with missing usage fields (defaults to 0)", async () => {
		const path = await writeJsonl("partial.jsonl", [
			{
				type: "assistant",
				message: {
					model: "claude-haiku-3-5-20241022",
					usage: {
						input_tokens: 100,
						output_tokens: 50,
					},
				},
			},
		]);

		const usage = await parseTranscriptUsage(path);

		expect(usage.inputTokens).toBe(100);
		expect(usage.outputTokens).toBe(50);
		expect(usage.cacheReadTokens).toBe(0);
		expect(usage.cacheCreationTokens).toBe(0);
	});

	test("handles assistant entries with no usage object", async () => {
		const path = await writeJsonl("no-usage.jsonl", [
			{
				type: "assistant",
				message: {
					model: "claude-opus-4-6",
					content: "response without usage",
				},
			},
		]);

		const usage = await parseTranscriptUsage(path);

		expect(usage.inputTokens).toBe(0);
		expect(usage.outputTokens).toBe(0);
		expect(usage.modelUsed).toBeNull();
	});

	test("captures model from first assistant turn only", async () => {
		const path = await writeJsonl("model-change.jsonl", [
			{
				type: "assistant",
				message: {
					model: "claude-sonnet-4-20250514",
					usage: {
						input_tokens: 10,
						output_tokens: 5,
						cache_read_input_tokens: 0,
						cache_creation_input_tokens: 0,
					},
				},
			},
			{
				type: "assistant",
				message: {
					model: "claude-opus-4-6",
					usage: {
						input_tokens: 20,
						output_tokens: 10,
						cache_read_input_tokens: 0,
						cache_creation_input_tokens: 0,
					},
				},
			},
		]);

		const usage = await parseTranscriptUsage(path);

		expect(usage.modelUsed).toBe("claude-sonnet-4-20250514");
		expect(usage.inputTokens).toBe(30);
	});

	test("handles real-world transcript format with trailing newlines", async () => {
		const path = join(tempDir, "trailing.jsonl");
		const content =
			'{"type":"assistant","message":{"model":"claude-opus-4-6","usage":{"input_tokens":3,"output_tokens":9,"cache_read_input_tokens":19401,"cache_creation_input_tokens":9918}}}\n\n\n';
		await Bun.write(path, content);

		const usage = await parseTranscriptUsage(path);

		expect(usage.inputTokens).toBe(3);
		expect(usage.outputTokens).toBe(9);
		expect(usage.cacheReadTokens).toBe(19401);
		expect(usage.cacheCreationTokens).toBe(9918);
	});
});

// === parseTranscriptUsage (Opencode format) ===

describe("parseTranscriptUsage - Opencode format", () => {
	test("parses a single Opencode entry with all usage fields", async () => {
		const path = await writeJsonl("opencode-single.jsonl", [
			{
				input: 100,
				output: 50,
				cacheRead: 1000,
				cacheCreation: 500,
				model: "claude-sonnet-4-20250514",
			},
		]);

		const usage = await parseTranscriptUsage(path);

		expect(usage.inputTokens).toBe(100);
		expect(usage.outputTokens).toBe(50);
		expect(usage.cacheReadTokens).toBe(1000);
		expect(usage.cacheCreationTokens).toBe(500);
		expect(usage.modelUsed).toBe("claude-sonnet-4-20250514");
	});

	test("aggregates usage across multiple Opencode entries", async () => {
		const path = await writeJsonl("opencode-multi.jsonl", [
			{
				input: 100,
				output: 50,
				cacheRead: 1000,
				cacheCreation: 500,
				model: "claude-sonnet-4-20250514",
			},
			{
				input: 200,
				output: 75,
				cacheRead: 2000,
				cacheCreation: 0,
				model: "claude-sonnet-4-20250514",
			},
			{
				input: 300,
				output: 100,
				cacheRead: 3000,
				cacheCreation: 250,
				model: "claude-sonnet-4-20250514",
			},
		]);

		const usage = await parseTranscriptUsage(path);

		expect(usage.inputTokens).toBe(600);
		expect(usage.outputTokens).toBe(225);
		expect(usage.cacheReadTokens).toBe(6000);
		expect(usage.cacheCreationTokens).toBe(750);
	});

	test("handles Opencode entries with missing cache fields", async () => {
		const path = await writeJsonl("opencode-partial.jsonl", [
			{ input: 100, output: 50, model: "claude-sonnet-4-20250514" },
		]);

		const usage = await parseTranscriptUsage(path);

		expect(usage.inputTokens).toBe(100);
		expect(usage.outputTokens).toBe(50);
		expect(usage.cacheReadTokens).toBe(0);
		expect(usage.cacheCreationTokens).toBe(0);
	});

	test("handles Opencode entries with only input field", async () => {
		const path = await writeJsonl("opencode-input-only.jsonl", [
			{ input: 100, model: "claude-sonnet-4-20250514" },
		]);

		const usage = await parseTranscriptUsage(path);

		expect(usage.inputTokens).toBe(100);
		expect(usage.outputTokens).toBe(0);
	});

	test("handles Opencode entries with only output field", async () => {
		const path = await writeJsonl("opencode-output-only.jsonl", [
			{ output: 50, model: "claude-sonnet-4-20250514" },
		]);

		const usage = await parseTranscriptUsage(path);

		expect(usage.inputTokens).toBe(0);
		expect(usage.outputTokens).toBe(50);
	});

	test("captures model from first Opencode entry", async () => {
		const path = await writeJsonl("opencode-model.jsonl", [
			{ input: 100, output: 50, model: "claude-sonnet-4-20250514" },
			{ input: 200, output: 75, model: "claude-opus-4-6" },
		]);

		const usage = await parseTranscriptUsage(path);

		expect(usage.modelUsed).toBe("claude-sonnet-4-20250514");
	});

	test("handles Opencode entries without model field", async () => {
		const path = await writeJsonl("opencode-no-model.jsonl", [
			{ input: 100, output: 50, cacheRead: 1000 },
		]);

		const usage = await parseTranscriptUsage(path);

		expect(usage.inputTokens).toBe(100);
		expect(usage.outputTokens).toBe(50);
		expect(usage.cacheReadTokens).toBe(1000);
		expect(usage.modelUsed).toBeNull();
	});
});

// === parseTranscriptUsage (mixed format) ===

describe("parseTranscriptUsage - mixed format support", () => {
	test("parses file with both Claude and Opencode entries", async () => {
		const path = await writeJsonl("mixed-format.jsonl", [
			{
				type: "assistant",
				message: { model: "claude-opus-4-6", usage: { input_tokens: 100, output_tokens: 50 } },
			},
			{ input: 200, output: 75, model: "claude-sonnet-4-20250514" },
			{
				type: "assistant",
				message: { model: "claude-opus-4-6", usage: { input_tokens: 150, output_tokens: 60 } },
			},
		]);

		const usage = await parseTranscriptUsage(path);

		expect(usage.inputTokens).toBe(450); // 100 + 200 + 150
		expect(usage.outputTokens).toBe(185); // 50 + 75 + 60
		expect(usage.modelUsed).toBe("claude-opus-4-6"); // First entry
	});
});

// === estimateCost ===

describe("estimateCost", () => {
	test("calculates cost for opus model", () => {
		const cost = estimateCost({
			inputTokens: 1_000_000,
			outputTokens: 1_000_000,
			cacheReadTokens: 1_000_000,
			cacheCreationTokens: 1_000_000,
			modelUsed: "claude-opus-4-6",
		});

		expect(cost).toBeCloseTo(95.25, 2);
	});

	test("calculates cost for sonnet model", () => {
		const cost = estimateCost({
			inputTokens: 1_000_000,
			outputTokens: 1_000_000,
			cacheReadTokens: 1_000_000,
			cacheCreationTokens: 1_000_000,
			modelUsed: "claude-sonnet-4-20250514",
		});

		expect(cost).toBeCloseTo(19.05, 2);
	});

	test("calculates cost for haiku model", () => {
		const cost = estimateCost({
			inputTokens: 1_000_000,
			outputTokens: 1_000_000,
			cacheReadTokens: 1_000_000,
			cacheCreationTokens: 1_000_000,
			modelUsed: "claude-haiku-3-5-20241022",
		});

		expect(cost).toBeCloseTo(5.08, 2);
	});

	test("returns null for unknown model", () => {
		const cost = estimateCost({
			inputTokens: 1_000_000,
			outputTokens: 1_000_000,
			cacheReadTokens: 0,
			cacheCreationTokens: 0,
			modelUsed: "gpt-4o",
		});

		expect(cost).toBeNull();
	});

	test("returns null when modelUsed is null", () => {
		const cost = estimateCost({
			inputTokens: 1_000_000,
			outputTokens: 1_000_000,
			cacheReadTokens: 0,
			cacheCreationTokens: 0,
			modelUsed: null,
		});

		expect(cost).toBeNull();
	});

	test("zero tokens yields zero cost", () => {
		const cost = estimateCost({
			inputTokens: 0,
			outputTokens: 0,
			cacheReadTokens: 0,
			cacheCreationTokens: 0,
			modelUsed: "claude-opus-4-6",
		});

		expect(cost).toBe(0);
	});

	test("realistic session cost calculation", () => {
		const cost = estimateCost({
			inputTokens: 20_000,
			outputTokens: 5_000,
			cacheReadTokens: 100_000,
			cacheCreationTokens: 15_000,
			modelUsed: "claude-sonnet-4-20250514",
		});

		expect(cost).not.toBeNull();
		if (cost !== null) {
			expect(cost).toBeGreaterThan(0.1);
			expect(cost).toBeLessThan(1.0);
		}
	});
});
