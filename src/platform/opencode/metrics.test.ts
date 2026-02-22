import { beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOpencodeMetrics, OpencodeMetrics } from "./metrics.ts";

describe("OpencodeMetrics", () => {
	describe("factory", () => {
		test("createOpencodeMetrics returns IPlatformMetrics instance", () => {
			const metrics = createOpencodeMetrics();
			expect(metrics).toBeDefined();
			expect(typeof metrics.getTranscriptsDir).toBe("function");
			expect(typeof metrics.discoverTranscripts).toBe("function");
			expect(typeof metrics.parseTranscript).toBe("function");
			expect(typeof metrics.calculateCost).toBe("function");
		});
	});

	describe("getTranscriptsDir", () => {
		test("returns Opencode sessions directory", () => {
			const metrics = new OpencodeMetrics();
			const dir = metrics.getTranscriptsDir();
			expect(dir).toContain(".config/opencode/sessions");
		});
	});

	describe("discoverTranscripts", () => {
		test("returns empty array when sessions directory does not exist", async () => {
			const metrics = new OpencodeMetrics();
			const transcripts = await metrics.discoverTranscripts();
			// The sessions directory won't exist in test environment
			expect(Array.isArray(transcripts)).toBe(true);
		});
	});

	describe("parseTranscript", () => {
		let tempDir: string;

		beforeEach(async () => {
			tempDir = await mkdtemp(join(tmpdir(), "opencode-metrics-test-"));
		});

		test("parses empty transcript file", async () => {
			const metrics = new OpencodeMetrics();
			const transcriptPath = join(tempDir, "empty.jsonl");
			await writeFile(transcriptPath, "");

			const parsed = await metrics.parseTranscript(transcriptPath);
			expect(parsed.tokens.input).toBe(0);
			expect(parsed.tokens.output).toBe(0);
			expect(parsed.tokens.cacheRead).toBe(0);
			expect(parsed.tokens.cacheCreation).toBe(0);
			expect(parsed.modelUsed).toBeNull();
			expect(parsed.toolStats).toEqual([]);
		});

		test("extracts token counts from entry fields", async () => {
			const metrics = new OpencodeMetrics();
			const transcriptPath = join(tempDir, "transcript.jsonl");
			const content = [
				JSON.stringify({ input: 100, output: 50, cacheRead: 25, cacheCreation: 10 }),
				JSON.stringify({ input: 50, output: 25 }),
			].join("\n");
			await writeFile(transcriptPath, content);

			const parsed = await metrics.parseTranscript(transcriptPath);
			expect(parsed.tokens.input).toBe(150);
			expect(parsed.tokens.output).toBe(75);
			expect(parsed.tokens.cacheRead).toBe(25);
			expect(parsed.tokens.cacheCreation).toBe(10);
		});

		test("extracts token counts from snake_case fields", async () => {
			const metrics = new OpencodeMetrics();
			const transcriptPath = join(tempDir, "transcript.jsonl");
			const content = [
				JSON.stringify({ input_tokens: 100, output_tokens: 50 }),
				JSON.stringify({ cache_read_tokens: 25, cache_creation_tokens: 10 }),
			].join("\n");
			await writeFile(transcriptPath, content);

			const parsed = await metrics.parseTranscript(transcriptPath);
			expect(parsed.tokens.input).toBe(100);
			expect(parsed.tokens.output).toBe(50);
			expect(parsed.tokens.cacheRead).toBe(25);
			expect(parsed.tokens.cacheCreation).toBe(10);
		});

		test("extracts token counts from usage object", async () => {
			const metrics = new OpencodeMetrics();
			const transcriptPath = join(tempDir, "transcript.jsonl");
			const content = JSON.stringify({
				usage: {
					input_tokens: 200,
					output_tokens: 100,
					cache_read_tokens: 50,
					cache_creation_tokens: 20,
				},
			});
			await writeFile(transcriptPath, content);

			const parsed = await metrics.parseTranscript(transcriptPath);
			expect(parsed.tokens.input).toBe(200);
			expect(parsed.tokens.output).toBe(100);
			expect(parsed.tokens.cacheRead).toBe(50);
			expect(parsed.tokens.cacheCreation).toBe(20);
		});

		test("extracts model information", async () => {
			const metrics = new OpencodeMetrics();
			const transcriptPath = join(tempDir, "transcript.jsonl");
			const content = JSON.stringify({ model: "claude-sonnet-4-20250514" });
			await writeFile(transcriptPath, content);

			const parsed = await metrics.parseTranscript(transcriptPath);
			expect(parsed.modelUsed).toBe("claude-sonnet-4-20250514");
		});

		test("extracts tool statistics", async () => {
			const metrics = new OpencodeMetrics();
			const transcriptPath = join(tempDir, "transcript.jsonl");
			const content = [
				JSON.stringify({ tool: { name: "read_file", durationMs: 100 } }),
				JSON.stringify({ tool: { name: "read_file", durationMs: 150 } }),
				JSON.stringify({ tool: { name: "write_file", durationMs: 200 } }),
			].join("\n");
			await writeFile(transcriptPath, content);

			const parsed = await metrics.parseTranscript(transcriptPath);
			expect(parsed.toolStats).toHaveLength(2);
			const readFileStats = parsed.toolStats.find((s) => s.name === "read_file");
			expect(readFileStats?.count).toBe(2);
			expect(readFileStats?.totalDurationMs).toBe(250);
		});

		test("skips malformed lines", async () => {
			const metrics = new OpencodeMetrics();
			const transcriptPath = join(tempDir, "transcript.jsonl");
			const content = [
				JSON.stringify({ input: 100 }),
				"not valid json",
				JSON.stringify({ output: 50 }),
			].join("\n");
			await writeFile(transcriptPath, content);

			const parsed = await metrics.parseTranscript(transcriptPath);
			expect(parsed.tokens.input).toBe(100);
			expect(parsed.tokens.output).toBe(50);
		});

		test("calculates estimated cost", async () => {
			const metrics = new OpencodeMetrics();
			const transcriptPath = join(tempDir, "transcript.jsonl");
			const content = JSON.stringify({
				model: "claude-sonnet-4-20250514",
				input: 1_000_000,
				output: 1_000_000,
			});
			await writeFile(transcriptPath, content);

			const parsed = await metrics.parseTranscript(transcriptPath);
			expect(parsed.estimatedCostUsd).toBe(18); // $3 + $15 = $18
		});

		test("extracts agent name from path", async () => {
			const metrics = new OpencodeMetrics();
			const transcriptPath = join(tempDir, "sessions", "my-agent", "session.jsonl");
			await mkdir(join(tempDir, "sessions", "my-agent"), { recursive: true });
			await writeFile(transcriptPath, "{}\n");

			const parsed = await metrics.parseTranscript(transcriptPath);
			expect(parsed.meta.agentName).toBe("my-agent");
			expect(parsed.meta.sessionId).toBe("session");
		});
	});

	describe("extractTokens", () => {
		test("returns token counts from parsed transcript", () => {
			const metrics = new OpencodeMetrics();
			const parsed = {
				meta: { path: "", agentName: "", sessionId: null, timestamp: "" },
				tokens: { input: 100, output: 50, cacheRead: 25, cacheCreation: 10 },
				estimatedCostUsd: null,
				modelUsed: null,
				toolStats: [],
			};

			const tokens = metrics.extractTokens(parsed);
			expect(tokens.input).toBe(100);
			expect(tokens.output).toBe(50);
			expect(tokens.cacheRead).toBe(25);
			expect(tokens.cacheCreation).toBe(10);
		});
	});

	describe("calculateCost", () => {
		test("returns null for unknown model", () => {
			const metrics = new OpencodeMetrics();
			const tokens = { input: 1_000_000, output: 1_000_000, cacheRead: 0, cacheCreation: 0 };
			const cost = metrics.calculateCost(tokens, "unknown-model");
			expect(cost).toBeNull();
		});

		test("calculates cost for claude-sonnet", () => {
			const metrics = new OpencodeMetrics();
			const tokens = { input: 2_000_000, output: 1_000_000, cacheRead: 0, cacheCreation: 0 };
			const cost = metrics.calculateCost(tokens, "claude-sonnet-4-20250514");
			expect(cost).toBe(21); // $6 + $15 = $21
		});

		test("calculates cost with cache read", () => {
			const metrics = new OpencodeMetrics();
			const tokens = { input: 1_000_000, output: 0, cacheRead: 1_000_000, cacheCreation: 0 };
			const cost = metrics.calculateCost(tokens, "claude-sonnet-4-20250514");
			expect(cost).toBe(3.3); // $3 + $0.30 = $3.30
		});

		test("calculates cost for gpt-4o", () => {
			const metrics = new OpencodeMetrics();
			const tokens = { input: 1_000_000, output: 1_000_000, cacheRead: 0, cacheCreation: 0 };
			const cost = metrics.calculateCost(tokens, "gpt-4o");
			expect(cost).toBe(12.5); // $2.50 + $10 = $12.50
		});
	});

	describe("getModelPricing", () => {
		test("returns pricing for Claude models", () => {
			const metrics = new OpencodeMetrics();
			const pricing = metrics.getModelPricing();
			expect(pricing.has("claude-sonnet-4-20250514")).toBe(true);
			expect(pricing.has("claude-3-5-sonnet-20241022")).toBe(true);
			expect(pricing.has("claude-3-opus-20240229")).toBe(true);
			expect(pricing.has("claude-opus-4-1")).toBe(true);
			expect(pricing.has("claude-haiku-4-5")).toBe(true);
		});

		test("returns pricing for OpenAI models", () => {
			const metrics = new OpencodeMetrics();
			const pricing = metrics.getModelPricing();
			expect(pricing.has("gpt-4o")).toBe(true);
			expect(pricing.has("gpt-4-turbo")).toBe(true);
			expect(pricing.has("gpt-4o-mini")).toBe(true);
		});

		test("pricing includes required fields", () => {
			const metrics = new OpencodeMetrics();
			const pricing = metrics.getModelPricing();
			for (const [model, modelPricing] of pricing) {
				expect(typeof modelPricing.inputPerMillion).toBe("number");
				expect(typeof modelPricing.outputPerMillion).toBe("number");
				if (modelPricing.cacheReadPerMillion !== undefined) {
					expect(typeof modelPricing.cacheReadPerMillion).toBe("number");
				}
			}
		});
	});
});
