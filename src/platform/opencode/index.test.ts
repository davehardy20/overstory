import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOpencodePlatform, OpencodePlatform } from "./index.ts";

describe("OpencodePlatform", () => {
	let tempDir: string;
	let originalHome: string | undefined;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "opencode-platform-test-"));
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
		test("createOpencodePlatform returns IPlatform instance", () => {
			const platform = createOpencodePlatform();
			expect(platform).toBeDefined();
			expect(platform.id).toBe("opencode");
			expect(platform.displayName).toBe("Opencode");
			expect(typeof platform.version).toBe("string");
		});
	});

	describe("properties", () => {
		test("id is opencode", () => {
			const platform = new OpencodePlatform();
			expect(platform.id).toBe("opencode");
		});

		test("displayName is Opencode", () => {
			const platform = new OpencodePlatform();
			expect(platform.displayName).toBe("Opencode");
		});

		test("version is defined", () => {
			const platform = new OpencodePlatform();
			expect(platform.version).toBe("1.0.0");
		});
	});

	describe("getConfigDir", () => {
		test("returns opencode config directory", () => {
			const platform = new OpencodePlatform();
			const dir = platform.getConfigDir();
			expect(dir).toContain(".config/opencode");
		});
	});

	describe("getContextDir", () => {
		test("returns project root unchanged", () => {
			const platform = new OpencodePlatform();
			const projectRoot = "/my/project";
			const dir = platform.getContextDir(projectRoot);
			expect(dir).toBe(projectRoot);
		});
	});

	describe("getHooksConfigPath", () => {
		test("returns hooks.json in config directory", () => {
			const platform = new OpencodePlatform();
			const path = platform.getHooksConfigPath();
			expect(path).toContain(".config/opencode");
			expect(path).toContain("hooks.json");
		});
	});

	describe("sub-interfaces", () => {
		test("hooks is lazily initialized", () => {
			const platform = new OpencodePlatform();
			const hooks1 = platform.hooks;
			const hooks2 = platform.hooks;
			expect(hooks1).toBe(hooks2);
		});

		test("context is lazily initialized", () => {
			const platform = new OpencodePlatform();
			const context1 = platform.context;
			const context2 = platform.context;
			expect(context1).toBe(context2);
		});

		test("spawner is lazily initialized", () => {
			const platform = new OpencodePlatform();
			const spawner1 = platform.spawner;
			const spawner2 = platform.spawner;
			expect(spawner1).toBe(spawner2);
		});

		test("metrics is lazily initialized", () => {
			const platform = new OpencodePlatform();
			const metrics1 = platform.metrics;
			const metrics2 = platform.metrics;
			expect(metrics1).toBe(metrics2);
		});

		test("ai is lazily initialized", () => {
			const platform = new OpencodePlatform();
			const ai1 = platform.ai;
			const ai2 = platform.ai;
			expect(ai1).toBe(ai2);
		});

		test("hooks implements IPlatformHooks", () => {
			const platform = new OpencodePlatform();
			expect(typeof platform.hooks.getConfigPath).toBe("function");
			expect(typeof platform.hooks.load).toBe("function");
			expect(typeof platform.hooks.save).toBe("function");
			expect(typeof platform.hooks.install).toBe("function");
			expect(typeof platform.hooks.uninstall).toBe("function");
			expect(typeof platform.hooks.isInstalled).toBe("function");
			expect(typeof platform.hooks.formatCommand).toBe("function");
		});

		test("context implements IPlatformContext", () => {
			const platform = new OpencodePlatform();
			expect(typeof platform.context.getContextDir).toBe("function");
			expect(typeof platform.context.getContextFileName).toBe("function");
			expect(typeof platform.context.generateContent).toBe("function");
			expect(typeof platform.context.write).toBe("function");
			expect(typeof platform.context.read).toBe("function");
			expect(typeof platform.context.remove).toBe("function");
		});

		test("spawner implements IPlatformSpawner", () => {
			const platform = new OpencodePlatform();
			expect(typeof platform.spawner.spawn).toBe("function");
			expect(typeof platform.spawner.terminate).toBe("function");
			expect(typeof platform.spawner.isRunning).toBe("function");
			expect(typeof platform.spawner.getPid).toBe("function");
			expect(typeof platform.spawner.attach).toBe("function");
			expect(typeof platform.spawner.sendInput).toBe("function");
		});

		test("metrics implements IPlatformMetrics", () => {
			const platform = new OpencodePlatform();
			expect(typeof platform.metrics.getTranscriptsDir).toBe("function");
			expect(typeof platform.metrics.discoverTranscripts).toBe("function");
			expect(typeof platform.metrics.parseTranscript).toBe("function");
			expect(typeof platform.metrics.extractTokens).toBe("function");
			expect(typeof platform.metrics.calculateCost).toBe("function");
			expect(typeof platform.metrics.getModelPricing).toBe("function");
		});

		test("ai implements IPlatformAI", () => {
			const platform = new OpencodePlatform();
			expect(platform.ai).toBeDefined();
			expect(typeof platform.ai?.call).toBe("function");
			expect(typeof platform.ai?.stream).toBe("function");
			expect(typeof platform.ai?.isAvailable).toBe("function");
			expect(typeof platform.ai?.getDefaultModel).toBe("function");
			expect(typeof platform.ai?.listModels).toBe("function");
		});
	});

	describe("isAvailable", () => {
		test("returns boolean", async () => {
			const platform = new OpencodePlatform();
			const result = await platform.isAvailable();
			expect(typeof result).toBe("boolean");
		});
	});

	describe("getPlatformVersion", () => {
		test("returns string or null", async () => {
			const platform = new OpencodePlatform();
			const result = await platform.getPlatformVersion();
			expect(result === null || typeof result === "string").toBe(true);
		});
	});

	describe("validate", () => {
		test("throws when opencode is not available", async () => {
			const platform = new OpencodePlatform();

			const originalSpawnSync = Bun.spawnSync;
			(Bun as Record<string, unknown>).spawnSync = () => ({ exitCode: 1, stdout: "", stderr: "" });

			try {
				await expect(platform.validate()).rejects.toThrow("Opencode CLI not found");
			} finally {
				(Bun as Record<string, unknown>).spawnSync = originalSpawnSync;
			}
		});

		test("creates config directory if needed", async () => {
			const platform = new OpencodePlatform();

			const originalSpawnSync = Bun.spawnSync;
			(Bun as Record<string, unknown>).spawnSync = () => ({ exitCode: 0, stdout: "", stderr: "" });

			try {
				const configDir = platform.getConfigDir();
				expect(existsSync(configDir)).toBe(false);

				await platform.validate();

				expect(existsSync(configDir)).toBe(true);
			} finally {
				(Bun as Record<string, unknown>).spawnSync = originalSpawnSync;
			}
		});
	});
});
