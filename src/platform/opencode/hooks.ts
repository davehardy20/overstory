/**
 * Opencode platform hooks management.
 *
 * Manages hooks configuration in ~/.config/opencode/hooks.json for orchestrator features.
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
	HookDefinition,
	HookEventType,
	HookMatcher,
	HooksConfiguration,
	IPlatformHooks,
} from "../interface.ts";
import { expandTilde, getDefaultConfigDir } from "../utils.ts";

export class OpencodeHooks implements IPlatformHooks {
	getConfigPath(): string {
		const configDir = getDefaultConfigDir("opencode");
		return join(configDir, "hooks.json");
	}

	async load(): Promise<HooksConfiguration> {
		const configPath = this.getConfigPath();

		if (!existsSync(configPath)) {
			return { hooks: {} };
		}

		try {
			const file = Bun.file(configPath);
			const content = await file.text();
			const parsed = JSON.parse(content) as Record<string, unknown>;
			return this.validateHooksConfig(parsed);
		} catch (error) {
			throw new Error(
				`Failed to load hooks configuration from ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	async save(config: HooksConfiguration): Promise<void> {
		const configPath = this.getConfigPath();
		const configDir = dirname(configPath);

		if (!existsSync(configDir)) {
			mkdirSync(configDir, { recursive: true });
		}

		try {
			await Bun.write(configPath, JSON.stringify(config, null, 2));
		} catch (error) {
			throw new Error(
				`Failed to save hooks configuration to ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	async install(options?: { force?: boolean }): Promise<void> {
		const isInstalled = await this.isInstalled();

		if (isInstalled && !options?.force) {
			throw new Error("Hooks already installed. Set force: true to overwrite.");
		}

		const config = this.generateDefaultHooksConfig();
		await this.save(config);
	}

	async uninstall(): Promise<void> {
		const configPath = this.getConfigPath();

		if (existsSync(configPath)) {
			try {
				await Bun.file(configPath).delete?.();
			} catch (error) {
				throw new Error(
					`Failed to remove hooks configuration: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	}

	async isInstalled(): Promise<boolean> {
		const configPath = this.getConfigPath();
		if (!existsSync(configPath)) {
			return false;
		}

		try {
			const config = await this.load();
			return Object.keys(config.hooks).length > 0;
		} catch {
			return false;
		}
	}

	formatCommand(command: string, context: Record<string, string>): string {
		let result = command;
		for (const [key, value] of Object.entries(context)) {
			result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value);
		}
		return result;
	}

	private validateHooksConfig(obj: unknown): HooksConfiguration {
		if (
			typeof obj === "object" &&
			obj !== null &&
			"hooks" in obj &&
			typeof (obj as Record<string, unknown>).hooks === "object"
		) {
			return obj as HooksConfiguration;
		}
		return { hooks: {} };
	}

	private generateDefaultHooksConfig(): HooksConfiguration {
		return {
			hooks: {
				SessionStart: [],
				UserPromptSubmit: [],
				PreToolUse: [],
				PostToolUse: [],
				Stop: [],
				PreCompact: [],
			},
		};
	}
}

export function createOpencodeHooks(): IPlatformHooks {
	return new OpencodeHooks();
}
