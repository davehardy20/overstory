import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { createManifestLoader } from "../agents/manifest.ts";
import { hooksCommand } from "../commands/hooks.ts";
import { initCommand } from "../commands/init.ts";
import { mergeCommand } from "../commands/merge.ts";
import { loadConfig } from "../config.ts";
import {
	createPlatform,
	detectAvailablePlatforms,
	detectBestPlatform,
	getPlatformSummary,
} from "../platform/factory.ts";
import type { PlatformType } from "../platform/types.ts";
import { cleanupTempDir, commitFile, createTempGitRepo, runGitInDir } from "../test-helpers.ts";

async function withSuppressedStdout<T>(fn: () => Promise<T>): Promise<T> {
	const originalWrite = process.stdout.write;
	process.stdout.write = (() => true) as typeof process.stdout.write;
	try {
		return await fn();
	} finally {
		process.stdout.write = originalWrite;
	}
}

async function isCommandAvailable(command: string): Promise<boolean> {
	try {
		const proc = Bun.spawn(["which", command], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const exitCode = await proc.exited;
		return exitCode === 0;
	} catch {
		return false;
	}
}

function getExpectedSettingsPath(platform: PlatformType): string {
	return platform === "claude" ? ".claude/settings.local.json" : "settings.json";
}

describe("E2E: Platform Integration Workflows", () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(async () => {
		tempDir = await createTempGitRepo();
		originalCwd = process.cwd();
		process.chdir(tempDir);
	});

	afterEach(async () => {
		process.chdir(originalCwd);
		await cleanupTempDir(tempDir);
	});

	describe("Platform Detection", () => {
		test("detects available platforms", async () => {
			const available = await detectAvailablePlatforms();

			expect(available).toBeDefined();
			expect(available.has("claude")).toBe(true);
			expect(available.has("opencode")).toBe(true);

			for (const [platform, result] of available) {
				expect(result.platform).toBe(platform);
				expect(typeof result.binaryFound).toBe("boolean");
				expect(result.binaryPath === null || typeof result.binaryPath === "string").toBe(true);
				expect(result.version === null || typeof result.version === "string").toBe(true);
			}
		});

		test("getPlatformSummary returns valid structure", async () => {
			const summary = await getPlatformSummary();

			expect(summary).toBeDefined();
			expect(Array.isArray(summary.available)).toBe(true);
			expect(Array.isArray(summary.unavailable)).toBe(true);
			expect(
				summary.best === null || summary.best === "claude" || summary.best === "opencode",
			).toBe(true);
		});

		test("detectBestPlatform returns a valid platform", async () => {
			const summary = await getPlatformSummary();

			if (summary.available.length === 0) {
				return;
			}

			const best = await detectBestPlatform();
			expect(best).toBeDefined();
			expect(["claude", "opencode"]).toContain(best);
			expect(summary.available).toContain(best);
		});
	});

	describe("Claude Platform Workflow", () => {
		test("full lifecycle: init → hooks → verify context files", async () => {
			const claudeAvailable = await isCommandAvailable("claude");
			if (!claudeAvailable) {
				// Skip test if Claude not available
				return;
			}

			await withSuppressedStdout(async () => {
				await initCommand([]);
			});

			const overstoryDir = join(tempDir, ".overstory");
			const configFile = Bun.file(join(overstoryDir, "config.yaml"));
			expect(await configFile.exists()).toBe(true);

			// Update config to explicitly use Claude platform for this test
			await Bun.write(
				join(overstoryDir, "config.yaml"),
				`project:\n  name: test\n  root: ${tempDir}\n  canonicalBranch: main\nplatform:\n  type: claude\n`,
			);

			const config = await loadConfig(tempDir);
			expect(config.platform.type).toBe("claude");

			const platform = await createPlatform("claude");
			expect(platform.id).toBe("claude-code");
			expect(platform.displayName).toBeDefined();

			const contextDir = platform.getContextDir(tempDir);
			expect(contextDir).toBe(join(tempDir, ".claude"));

			const platformForHooks = await createPlatform("claude");
			const hooksTargetDir = platformForHooks.getContextDir(tempDir);
			const hooksSettingsPath = join(hooksTargetDir, "settings.local.json");

			await withSuppressedStdout(async () => {
				await hooksCommand(["install"]);
			});

			const settingsFile = Bun.file(hooksSettingsPath);
			expect(await settingsFile.exists()).toBe(true);

			const settings = JSON.parse(await settingsFile.text());
			expect(settings.hooks).toBeDefined();
			expect(Object.keys(settings.hooks).length).toBeGreaterThan(0);
		});

		test("context file generation for worktrees", async () => {
			const claudeAvailable = await isCommandAvailable("claude");
			if (!claudeAvailable) {
				// Skip test if Claude not available
				return;
			}

			await withSuppressedStdout(async () => {
				await initCommand([]);
			});

			const worktreePath = join(tempDir, ".overstory", "worktrees", "test-agent");
			await mkdir(worktreePath, { recursive: true });

			const platform = await createPlatform("claude");

			const agentDefsDir = join(tempDir, ".overstory", "agent-defs");
			const baseDefinition = await Bun.file(join(agentDefsDir, "builder.md")).text();

			const content = await platform.context.generateContent({
				agentName: "test-claude-agent",
				beadId: "test-bead-001",
				specPath: null,
				branchName: "overstory/test-claude-agent/test-bead-001",
				worktreePath,
				fileScope: ["src/main.ts"],
				mulchDomains: ["typescript"],
				parentAgent: null,
				depth: 0,
				canSpawn: false,
				capability: "builder",
				baseDefinition,
			});

			expect(content).toContain("test-claude-agent");
			expect(content).toContain("test-bead-001");
			expect(content).toContain("builder");
			expect(content).not.toContain("{{AGENT_NAME}}");
			expect(content).not.toContain("{{BEAD_ID}}");
		});
	});

	describe("Opencode Platform Workflow", () => {
		test("full lifecycle: init → hooks → verify context files", async () => {
			const opencodeAvailable = await isCommandAvailable("opencode");
			if (!opencodeAvailable) {
				// Skip test if Opencode not available
				return;
			}

			await withSuppressedStdout(async () => {
				await initCommand([]);
			});

			const overstoryDir = join(tempDir, ".overstory");
			const configFile = Bun.file(join(overstoryDir, "config.yaml"));
			expect(await configFile.exists()).toBe(true);

			const config = await loadConfig(tempDir);
			expect(config.platform.type).toBeDefined();

			const platform = await createPlatform("opencode");
			expect(platform.id).toBe("opencode");
			expect(platform.displayName).toBeDefined();

			const contextDir = platform.getContextDir(tempDir);
			expect(contextDir).toBe(tempDir);

			const platformForHooks = await createPlatform("opencode");
			const hooksTargetDir = platformForHooks.getContextDir(tempDir);
			const hooksSettingsPath = join(hooksTargetDir, "settings.json");

			await withSuppressedStdout(async () => {
				await hooksCommand(["install"]);
			});

			const settingsFile = Bun.file(hooksSettingsPath);
			expect(await settingsFile.exists()).toBe(true);

			const settings = JSON.parse(await settingsFile.text());
			expect(settings.hooks).toBeDefined();
			expect(Object.keys(settings.hooks).length).toBeGreaterThan(0);
		});

		test("context file generation for worktrees", async () => {
			const opencodeAvailable = await isCommandAvailable("opencode");
			if (!opencodeAvailable) {
				// Skip test if Opencode not available
				return;
			}

			await withSuppressedStdout(async () => {
				await initCommand([]);
			});

			const worktreePath = join(tempDir, ".overstory", "worktrees", "test-agent");
			await mkdir(worktreePath, { recursive: true });

			const platform = await createPlatform("opencode");

			const agentDefsDir = join(tempDir, ".overstory", "agent-defs");
			const baseDefinition = await Bun.file(join(agentDefsDir, "builder.md")).text();

			const content = await platform.context.generateContent({
				agentName: "test-opencode-agent",
				beadId: "test-bead-002",
				specPath: null,
				branchName: "overstory/test-opencode-agent/test-bead-002",
				worktreePath,
				fileScope: ["src/main.ts"],
				mulchDomains: ["typescript"],
				parentAgent: null,
				depth: 0,
				canSpawn: false,
				capability: "builder",
				baseDefinition,
			});

			expect(content).toContain("test-opencode-agent");
			expect(content).toContain("test-bead-002");
			expect(content).toContain("builder");
			expect(content).not.toContain("{{AGENT_NAME}}");
			expect(content).not.toContain("{{BEAD_ID}}");
		});
	});

	describe("Cross-Platform Compatibility", () => {
		test("platform instances have consistent interface", async () => {
			const platforms: PlatformType[] = ["claude", "opencode"];

			for (const platformType of platforms) {
				const isAvailable = await isCommandAvailable(platformType);
				if (!isAvailable) {
					continue;
				}

				const platform = await createPlatform(platformType);

				expect(platform.id).toBeDefined();
				expect(platform.displayName).toBeDefined();
				expect(platform.version).toBeDefined();

				expect(typeof platform.getConfigDir).toBe("function");
				expect(typeof platform.getContextDir).toBe("function");
				expect(typeof platform.getHooksConfigPath).toBe("function");
				expect(typeof platform.isAvailable).toBe("function");
				expect(typeof platform.getPlatformVersion).toBe("function");
				expect(typeof platform.validate).toBe("function");

				expect(platform.context).toBeDefined();
				expect(platform.spawner).toBeDefined();
				expect(platform.metrics).toBeDefined();
				expect(platform.hooks).toBeDefined();

				expect(typeof platform.context.getContextDir).toBe("function");
				expect(typeof platform.context.getContextFileName).toBe("function");
				expect(typeof platform.context.generateContent).toBe("function");
				expect(typeof platform.context.write).toBe("function");
				expect(typeof platform.context.read).toBe("function");
				expect(typeof platform.context.remove).toBe("function");

				expect(typeof platform.spawner.spawn).toBe("function");
				expect(typeof platform.spawner.terminate).toBe("function");
				expect(typeof platform.spawner.isRunning).toBe("function");
				expect(typeof platform.spawner.getPid).toBe("function");
				expect(typeof platform.spawner.attach).toBe("function");
				expect(typeof platform.spawner.sendInput).toBe("function");

				expect(typeof platform.metrics.getTranscriptsDir).toBe("function");
				expect(typeof platform.metrics.discoverTranscripts).toBe("function");
				expect(typeof platform.metrics.parseTranscript).toBe("function");
				expect(typeof platform.metrics.extractTokens).toBe("function");
				expect(typeof platform.metrics.calculateCost).toBe("function");
			}
		});

		test("context files have different names per platform", async () => {
			await withSuppressedStdout(async () => {
				await initCommand([]);
			});

			const claudePlatform = await createPlatform("claude");
			const opencodePlatform = await createPlatform("opencode");

			expect(claudePlatform.context.getContextFileName()).toBe("CLAUDE.md");
			expect(opencodePlatform.context.getContextFileName()).toBe("AGENTS.md");
		});

		test("context directories are platform-specific", async () => {
			await withSuppressedStdout(async () => {
				await initCommand([]);
			});

			const claudePlatform = await createPlatform("claude");
			const opencodePlatform = await createPlatform("opencode");

			const claudeContextDir = claudePlatform.getContextDir(tempDir);
			const opencodeContextDir = opencodePlatform.getContextDir(tempDir);

			expect(claudeContextDir).toBe(join(tempDir, ".claude"));
			expect(opencodeContextDir).toBe(tempDir);
		});

		test("hooks install to correct platform-specific locations", async () => {
			await withSuppressedStdout(async () => {
				await initCommand([]);
			});

			await withSuppressedStdout(async () => {
				await hooksCommand(["install"]);
			});

			const hooksSourcePath = join(tempDir, ".overstory", "hooks.json");
			expect(await Bun.file(hooksSourcePath).exists()).toBe(true);

			const config = await loadConfig(tempDir);
			const platformType =
				config.platform.type === "auto" ? await detectBestPlatform() : config.platform.type;

			const expectedSettingsPath = join(tempDir, getExpectedSettingsPath(platformType));
			expect(await Bun.file(expectedSettingsPath).exists()).toBe(true);
		});
	});

	describe("Platform-Specific Context Content", () => {
		test("Claude context includes CLAUDE-specific sections", async () => {
			await withSuppressedStdout(async () => {
				await initCommand([]);
			});

			const platform = await createPlatform("claude");
			const agentDefsDir = join(tempDir, ".overstory", "agent-defs");
			const baseDefinition = await Bun.file(join(agentDefsDir, "builder.md")).text();

			const content = await platform.context.generateContent({
				agentName: "claude-test",
				beadId: "bead-001",
				specPath: null,
				branchName: "overstory/claude-test/bead-001",
				worktreePath: join(tempDir, "worktree"),
				fileScope: [],
				mulchDomains: [],
				parentAgent: null,
				depth: 0,
				canSpawn: false,
				capability: "builder",
				baseDefinition,
			});

			expect(content.length).toBeGreaterThan(0);
			expect(content).toContain("claude-test");
			expect(content).toContain("bead-001");
		});

		test("Opencode context includes AGENTS-specific sections", async () => {
			await withSuppressedStdout(async () => {
				await initCommand([]);
			});

			const platform = await createPlatform("opencode");
			const agentDefsDir = join(tempDir, ".overstory", "agent-defs");
			const baseDefinition = await Bun.file(join(agentDefsDir, "builder.md")).text();

			const content = await platform.context.generateContent({
				agentName: "opencode-test",
				beadId: "bead-002",
				specPath: null,
				branchName: "overstory/opencode-test/bead-002",
				worktreePath: join(tempDir, "worktree"),
				fileScope: [],
				mulchDomains: [],
				parentAgent: null,
				depth: 0,
				canSpawn: false,
				capability: "builder",
				baseDefinition,
			});

			expect(content.length).toBeGreaterThan(0);
			expect(content).toContain("opencode-test");
			expect(content).toContain("bead-002");
		});
	});

	describe("Platform Configuration Persistence", () => {
		test("config.yaml stores platform type", async () => {
			await withSuppressedStdout(async () => {
				await initCommand([]);
			});

			const config = await loadConfig(tempDir);
			expect(config.platform).toBeDefined();
			expect(config.platform.type).toBeDefined();
		});

		test("platform type is preserved in config", async () => {
			await withSuppressedStdout(async () => {
				await initCommand([]);
			});

			const configPath = join(tempDir, ".overstory", "config.yaml");
			const configContent = await Bun.file(configPath).text();

			expect(configContent).toContain("platform:");
		});
	});

	describe("Platform Hooks Compatibility", () => {
		test("hooks can be installed and uninstalled", async () => {
			await withSuppressedStdout(async () => {
				await initCommand([]);
			});

			await withSuppressedStdout(async () => {
				await hooksCommand(["install"]);
			});

			const config = await loadConfig(tempDir);
			const platformType =
				config.platform.type === "auto" ? await detectBestPlatform() : config.platform.type;

			const settingsPath = join(tempDir, getExpectedSettingsPath(platformType));
			expect(await Bun.file(settingsPath).exists()).toBe(true);

			let statusOutput = "";
			const originalWrite = process.stdout.write;
			process.stdout.write = ((str: string) => {
				statusOutput += str;
				return true;
			}) as typeof process.stdout.write;

			await hooksCommand(["status"]);
			process.stdout.write = originalWrite;

			expect(statusOutput).toContain("installed");

			await withSuppressedStdout(async () => {
				await hooksCommand(["uninstall"]);
			});

			const settingsExists = await Bun.file(settingsPath).exists();
			if (settingsExists) {
				const settings = JSON.parse(await Bun.file(settingsPath).text());
				expect(settings.hooks).toBeUndefined();
			}
		});

		test("hooks status shows correct state", async () => {
			await withSuppressedStdout(async () => {
				await initCommand([]);
			});

			let statusOutput = "";
			const originalWrite = process.stdout.write;
			process.stdout.write = ((str: string) => {
				statusOutput += str;
				return true;
			}) as typeof process.stdout.write;

			await hooksCommand(["status"]);
			process.stdout.write = originalWrite;

			expect(statusOutput).toContain("source");
			expect(statusOutput).toContain("installed");
		});
	});

	describe("Merge Integration", () => {
		test("merge detects platform-agnostic branch patterns", async () => {
			await withSuppressedStdout(async () => {
				await initCommand([]);
			});

			await runGitInDir(tempDir, ["checkout", "-b", "overstory/test-agent/test-bead-123"]);

			await commitFile(tempDir, "feature.txt", "New feature content", "Add feature");

			await runGitInDir(tempDir, ["checkout", "main"]);

			let mergeOutput = "";
			const originalWrite = process.stdout.write;
			process.stdout.write = ((str: string) => {
				mergeOutput += str;
				return true;
			}) as typeof process.stdout.write;

			try {
				await mergeCommand(["--branch", "overstory/test-agent/test-bead-123", "--dry-run"]);
			} catch {
				// Dry-run may fail if no actual diff
			}

			process.stdout.write = originalWrite;

			expect(mergeOutput).toContain("overstory/test-agent/test-bead-123");
		});
	});

	describe("Error Handling", () => {
		test("handles invalid platform type gracefully", async () => {
			await withSuppressedStdout(async () => {
				await initCommand([]);
			});

			try {
				// @ts-expect-error Testing invalid platform type
				await createPlatform("invalid-platform");
				expect(false).toBe(true);
			} catch (error) {
				expect(error).toBeDefined();
				expect(error instanceof Error).toBe(true);
			}
		});

		test("handles missing hooks.json gracefully", async () => {
			await withSuppressedStdout(async () => {
				await initCommand([]);
			});

			const hooksPath = join(tempDir, ".overstory", "hooks.json");
			await rm(hooksPath);

			try {
				await withSuppressedStdout(async () => {
					await hooksCommand(["install"]);
				});
				expect(false).toBe(true);
			} catch (error) {
				expect(error).toBeDefined();
				expect(error instanceof Error).toBe(true);
			}
		});
	});

	describe("Agent Manifest Integration", () => {
		test("manifest loads correctly for all platforms", async () => {
			await withSuppressedStdout(async () => {
				await initCommand([]);
			});

			const manifestPath = join(tempDir, ".overstory", "agent-manifest.json");
			const agentDefsDir = join(tempDir, ".overstory", "agent-defs");
			const loader = createManifestLoader(manifestPath, agentDefsDir);

			const manifest = await loader.load();

			const expectedAgents = [
				"builder",
				"coordinator",
				"lead",
				"merger",
				"monitor",
				"reviewer",
				"scout",
				"supervisor",
			];

			for (const agentName of expectedAgents) {
				expect(manifest.agents[agentName]).toBeDefined();
			}

			const errors = loader.validate();
			expect(errors).toEqual([]);
		});
	});
});
