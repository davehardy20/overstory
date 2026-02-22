/**
 * Claude Code non-interactive AI operations.
 *
 * Provides AI call capabilities for merge resolution, triage, and automated tasks.
 */

import type { AICallConfig, AICallResult, IPlatformAI } from "../interface.ts";

export class ClaudeAI implements IPlatformAI {
	async call(config: AICallConfig): Promise<AICallResult> {
		const startTime = Date.now();

		try {
			const model = config.model ?? this.getDefaultModel();

			const response = await fetch("https://api.anthropic.com/v1/messages", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"anthropic-version": "2023-06-01",
					"x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
				},
				body: JSON.stringify({
					model,
					max_tokens: config.maxTokens ?? 1024,
					temperature: config.temperature ?? 0.7,
					system: config.systemPrompt,
					messages: [
						{
							role: "user",
							content: config.userPrompt,
						},
					],
				}),
			});

			if (!response.ok) {
				const error = await response.text();
				throw new Error(`Claude API error: ${response.status} ${error}`);
			}

			const data = (await response.json()) as Record<string, unknown>;

			const content = this.extractContent(data);
			const usage = this.extractUsage(data);
			const durationMs = Date.now() - startTime;

			return {
				content,
				modelUsed: model,
				tokens: usage,
				truncated: false,
				durationMs,
			};
		} catch (error) {
			throw new Error(`AI call failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	async stream(config: AICallConfig, onChunk: (chunk: string) => void): Promise<AICallResult> {
		const startTime = Date.now();

		try {
			const model = config.model ?? this.getDefaultModel();

			const response = await fetch("https://api.anthropic.com/v1/messages", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"anthropic-version": "2023-06-01",
					"x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
				},
				body: JSON.stringify({
					model,
					max_tokens: config.maxTokens ?? 1024,
					temperature: config.temperature ?? 0.7,
					system: config.systemPrompt,
					messages: [
						{
							role: "user",
							content: config.userPrompt,
						},
					],
					stream: true,
				}),
			});

			if (!response.ok) {
				const error = await response.text();
				throw new Error(`Claude API error: ${response.status} ${error}`);
			}

			let fullContent = "";
			let totalInputTokens = 0;
			let totalOutputTokens = 0;

			if (response.body) {
				const reader = response.body.getReader();
				const decoder = new TextDecoder();

				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done) {
							break;
						}

						const chunk = decoder.decode(value);
						const lines = chunk.split("\n");

						for (const line of lines) {
							if (line.startsWith("data: ")) {
								const data = JSON.parse(line.slice(6)) as Record<string, unknown>;
								if (
									data.type === "content_block_delta" &&
									typeof data.delta === "object" &&
									data.delta !== null
								) {
									const delta = data.delta as Record<string, unknown>;
									if (delta.type === "text_delta" && typeof delta.text === "string") {
										onChunk(delta.text);
										fullContent += delta.text;
									}
								} else if (data.type === "message_delta") {
									const usage = data.usage as Record<string, unknown>;
									if (typeof usage?.output_tokens === "number") {
										totalOutputTokens = usage.output_tokens;
									}
								} else if (data.type === "message_start") {
									const message = data.message as Record<string, unknown>;
									const usage = message?.usage as Record<string, unknown>;
									if (typeof usage?.input_tokens === "number") {
										totalInputTokens = usage.input_tokens;
									}
								}
							}
						}
					}
				} finally {
					reader.releaseLock();
				}
			}

			const durationMs = Date.now() - startTime;

			return {
				content: fullContent,
				modelUsed: model,
				tokens: {
					input: totalInputTokens,
					output: totalOutputTokens,
					cacheRead: 0,
					cacheCreation: 0,
				},
				truncated: false,
				durationMs,
			};
		} catch (error) {
			throw new Error(
				`AI stream failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	async isAvailable(): Promise<boolean> {
		return (process.env.ANTHROPIC_API_KEY ?? "").length > 0;
	}

	getDefaultModel(): string {
		return "claude-opus-4-1";
	}

	async listModels(): Promise<string[]> {
		return ["claude-opus-4-1", "claude-sonnet-4-20250514", "claude-haiku-4-5"];
	}

	private extractContent(data: Record<string, unknown>): string {
		const content = data.content as Array<Record<string, unknown>>;
		if (Array.isArray(content) && content.length > 0) {
			const firstBlock = content[0];
			if (firstBlock && typeof firstBlock === "object" && "text" in firstBlock) {
				return String(firstBlock.text ?? "");
			}
		}
		return "";
	}

	private extractUsage(data: Record<string, unknown>): {
		input: number;
		output: number;
		cacheRead: number;
		cacheCreation: number;
	} {
		const usage = data.usage as Record<string, unknown>;
		return {
			input: typeof usage?.input_tokens === "number" ? usage.input_tokens : 0,
			output: typeof usage?.output_tokens === "number" ? usage.output_tokens : 0,
			cacheRead: 0,
			cacheCreation: 0,
		};
	}
}

export function createClaudeAI(): IPlatformAI {
	return new ClaudeAI();
}
