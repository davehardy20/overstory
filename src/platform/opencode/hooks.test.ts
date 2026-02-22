import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOpencodeHooks, OpencodeHooks } from "./hooks.ts";

describe("OpencodeHooks", () => {
	let tempDir: string;
	let originalHome: string | undefined;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "opencode-hooks-test-"));
		originalHome = process.env.HOME;
		process.env.HOME = tempDir;
	});

	afterEach(() => {
		if (originalHome !== undefined) {
			process.env.HOME = originalHome;
		}
		if (existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	describe("factory", () => {
		test("createOpencodeHooks returns IPlatformHooks instance", () => {
			const hooks = createOpencodeHooks();
			expect(hooks).toBeDefined();
			expect(typeof hooks.getConfigPath).toBe("function");
			expect(typeof hooks.load).toBe("function");
			expect(typeof hooks.save).toBe("function");
			expect(typeof hooks.install).toBe("function");
			expect(typeof hooks.uninstall).toBe("function");
			expect(typeof hooks.isInstalled).toBe("function");
			expect(typeof hooks.formatCommand).toBe("function");
		});
	});

	describe("getConfigPath", () => {
		test("returns path in opencode config directory", () => {
			const hooks = new OpencodeHooks();
			const path = hooks.getConfigPath();
			expect(path).toContain(".config/opencode");
			expect(path).toContain("hooks.json");
		});
	});

	describe("load", () => {
		test("returns empty hooks configuration when file does not exist", async () => {
			const hooks = new OpencodeHooks();
			const config = await hooks.load();
			expect(config).toEqual({ hooks: {} });
		});

		test("loads existing hooks configuration", async () => {
			const hooks = new OpencodeHooks();
			const configPath = hooks.getConfigPath();
			const configDir = join(configPath, "..");

			mkdirSync(configDir, { recursive: true });

			const testConfig = {
				hooks: {
					SessionStart: [{ matcher: "", hooks: [{ type: "command", command: "echo hello" }] }],
				},
			};
			await Bun.write(configPath, JSON.stringify(testConfig));

			const loaded = await hooks.load();
			expect(loaded.hooks.SessionStart).toBeDefined();
			expect(loaded.hooks.SessionStart).toHaveLength(1);
		});

		test("throws on malformed JSON", async () => {
			const hooks = new OpencodeHooks();
			const configPath = hooks.getConfigPath();
			const configDir = join(configPath, "..");

			mkdirSync(configDir, { recursive: true });
			await Bun.write(configPath, "not valid json");

			await expect(hooks.load()).rejects.toThrow("Failed to load hooks configuration");
		});

		test("validates and returns empty config for invalid structure", async () => {
			const hooks = new OpencodeHooks();
			const configPath = hooks.getConfigPath();
			const configDir = join(configPath, "..");

			mkdirSync(configDir, { recursive: true });
			await Bun.write(configPath, JSON.stringify({ notHooks: true }));

			const loaded = await hooks.load();
			expect(loaded).toEqual({ hooks: {} });
		});

		test("validates config with hooks object", async () => {
			const hooks = new OpencodeHooks();
			const configPath = hooks.getConfigPath();
			const configDir = join(configPath, "..");

			mkdirSync(configDir, { recursive: true });
			await Bun.write(configPath, JSON.stringify({ hooks: { SessionStart: [] } }));

			const loaded = await hooks.load();
			expect(loaded.hooks.SessionStart).toEqual([]);
		});
	});

	describe("save", () => {
		test("creates config directory if it does not exist", async () => {
			const hooks = new OpencodeHooks();
			const configPath = hooks.getConfigPath();
			expect(existsSync(join(configPath, ".."))).toBe(false);

			await hooks.save({ hooks: {} });

			expect(existsSync(join(configPath, ".."))).toBe(true);
			expect(existsSync(configPath)).toBe(true);
		});

		test("writes valid JSON to config file", async () => {
			const hooks = new OpencodeHooks();
			const config = {
				hooks: {
					SessionStart: [{ matcher: "", hooks: [{ type: "command", command: "test" }] }],
				},
			};

			await hooks.save(config);

			const configPath = hooks.getConfigPath();
			const file = Bun.file(configPath);
			const content = await file.text();
			const parsed = JSON.parse(content);

			expect(parsed).toEqual(config);
		});

		test("formats JSON with proper indentation", async () => {
			const hooks = new OpencodeHooks();
			await hooks.save({ hooks: {} });

			const configPath = hooks.getConfigPath();
			const file = Bun.file(configPath);
			const content = await file.text();
			expect(content).toContain('{\n  "hooks"');
		});
	});

	describe("install", () => {
		test("creates default hooks configuration", async () => {
			const hooks = new OpencodeHooks();
			await hooks.install();

			const config = await hooks.load();
			expect(config.hooks.SessionStart).toEqual([]);
			expect(config.hooks.UserPromptSubmit).toEqual([]);
			expect(config.hooks.PreToolUse).toEqual([]);
			expect(config.hooks.PostToolUse).toEqual([]);
			expect(config.hooks.Stop).toEqual([]);
			expect(config.hooks.PreCompact).toEqual([]);
		});

		test("throws when already installed without force", async () => {
			const hooks = new OpencodeHooks();
			await hooks.install();

			await expect(hooks.install()).rejects.toThrow("Hooks already installed");
		});

		test("overwrites existing config with force option", async () => {
			const hooks = new OpencodeHooks();
			await hooks.install();

			await expect(hooks.install({ force: true })).resolves.toBeUndefined();
		});
	});

	describe("uninstall", () => {
		test("removes hooks configuration file", async () => {
			const hooks = new OpencodeHooks();
			await hooks.install();

			expect(existsSync(hooks.getConfigPath())).toBe(true);

			await hooks.uninstall();

			expect(existsSync(hooks.getConfigPath())).toBe(false);
		});

		test("does not throw when file does not exist", async () => {
			const hooks = new OpencodeHooks();
			await expect(hooks.uninstall()).resolves.toBeUndefined();
		});
	});

	describe("isInstalled", () => {
		test("returns false when config file does not exist", async () => {
			const hooks = new OpencodeHooks();
			const installed = await hooks.isInstalled();
			expect(installed).toBe(false);
		});

		test("returns false when config has no hooks", async () => {
			const hooks = new OpencodeHooks();
			await hooks.save({ hooks: {} });

			const installed = await hooks.isInstalled();
			expect(installed).toBe(false);
		});

		test("returns true when config has hooks", async () => {
			const hooks = new OpencodeHooks();
			await hooks.install();

			const installed = await hooks.isInstalled();
			expect(installed).toBe(true);
		});

		test("returns false on load error", async () => {
			const hooks = new OpencodeHooks();
			const configPath = hooks.getConfigPath();
			const configDir = join(configPath, "..");

			mkdirSync(configDir, { recursive: true });
			await Bun.write(configPath, "invalid json");

			const installed = await hooks.isInstalled();
			expect(installed).toBe(false);
		});
	});

	describe("formatCommand", () => {
		test("replaces placeholders with context values", () => {
			const hooks = new OpencodeHooks();
			const command = "overstory nudge {agentName} --from {sender}";
			const context = { agentName: "builder-1", sender: "coordinator" };

			const result = hooks.formatCommand(command, context);
			expect(result).toBe("overstory nudge builder-1 --from coordinator");
		});

		test("replaces multiple occurrences of same placeholder", () => {
			const hooks = new OpencodeHooks();
			const command = "echo {name} {name}";
			const context = { name: "test" };

			const result = hooks.formatCommand(command, context);
			expect(result).toBe("echo test test");
		});

		test("preserves unmatched placeholders", () => {
			const hooks = new OpencodeHooks();
			const command = "echo {unknown} {name}";
			const context = { name: "test" };

			const result = hooks.formatCommand(command, context);
			expect(result).toBe("echo {unknown} test");
		});

		test("handles empty context", () => {
			const hooks = new OpencodeHooks();
			const command = "overstory status";

			const result = hooks.formatCommand(command, {});
			expect(result).toBe("overstory status");
		});

		test("handles special characters in values", () => {
			const hooks = new OpencodeHooks();
			const command = "echo {msg}";
			const context = { msg: "hello-world_123" };

			const result = hooks.formatCommand(command, context);
			expect(result).toBe("echo hello-world_123");
		});
	});
});
