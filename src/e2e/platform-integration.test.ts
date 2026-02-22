import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPlatform } from "../platform/factory.ts";

describe("Platform Integration", () => {
	describe("Platform Initialization", () => {
		test("should create Claude platform instance", async () => {
			const platform = await createPlatform("claude");
			expect(platform).toBeDefined();
			expect(platform.id).toBe("claude-code");
			expect(platform.displayName).toContain("Claude");
		});

		test("should create Opencode platform instance", async () => {
			const platform = await createPlatform("opencode");
			expect(platform).toBeDefined();
			expect(platform.displayName).toContain("Opencode");
		});
	});

	describe("Context File Generation", () => {
		let tempDir: string;

		beforeEach(async () => {
			tempDir = await mkdtemp(join(tmpdir(), "platform-integration-"));
		});

		afterEach(async () => {
			await rm(tempDir, { recursive: true, force: true });
		});

		test("Claude platform generates CLAUDE.md", async () => {
			const platform = await createPlatform("claude");

			const overlayConfig = {
				agentName: "test-agent",
				capability: "builder" as const,
				beadId: "test-bead-123",
				specPath: null,
				branchName: "test-branch",
				worktreePath: tempDir,
				parentAgent: null,
				depth: 0,
				canSpawn: false,
				fileScope: [],
				mulchDomains: [],
				mulchExpertise: "",
				skipScout: false,
				baseDefinition: "# Test Agent\n\nTest definition",
			};

			await platform.context.write(tempDir, overlayConfig, { overwrite: true });

			const contextFile = join(tempDir, ".claude", "CLAUDE.md");
			expect(existsSync(contextFile)).toBe(true);

			const content = await platform.context.read(tempDir);
			expect(content).toContain("test-agent");
			expect(content).toContain("builder");
		});

		test("Opencode platform generates AGENTS.md", async () => {
			const platform = await createPlatform("opencode");

			const overlayConfig = {
				agentName: "test-agent",
				capability: "builder" as const,
				beadId: "test-bead-123",
				specPath: null,
				branchName: "test-branch",
				worktreePath: tempDir,
				parentAgent: null,
				depth: 0,
				canSpawn: false,
				fileScope: [],
				mulchDomains: [],
				mulchExpertise: "",
				skipScout: false,
				baseDefinition: "# Test Agent\n\nTest definition",
			};

			await platform.context.write(tempDir, overlayConfig, { overwrite: true });

			const contextFile = join(tempDir, "AGENTS.md");
			expect(existsSync(contextFile)).toBe(true);

			const content = await platform.context.read(tempDir);
			expect(content).toContain("test-agent");
			expect(content).toContain("builder");
		});
	});

	describe("Hook Configuration", () => {
		let tempDir: string;
		let originalHome: string | undefined;

		beforeEach(async () => {
			tempDir = await mkdtemp(join(tmpdir(), "hooks-integration-"));
			originalHome = process.env.HOME;
			process.env.HOME = tempDir;
		});

		afterEach(async () => {
			if (originalHome !== undefined) {
				process.env.HOME = originalHome;
			}
			await rm(tempDir, { recursive: true, force: true });
		});

		test("Claude platform returns correct hooks path", async () => {
			const platform = await createPlatform("claude");
			const hooksPath = platform.getHooksConfigPath();
			expect(hooksPath).toContain(".claude");
			expect(hooksPath).toContain("settings.local.json");
		});

		test("Opencode platform returns correct hooks path", async () => {
			const platform = await createPlatform("opencode");
			const hooksPath = platform.getHooksConfigPath();
			expect(hooksPath).toContain(".config");
			expect(hooksPath).toContain("opencode");
			expect(hooksPath).toContain("hooks.json");
		});
	});

	describe("Cross-Platform Compatibility", () => {
		test("platforms have consistent interface", async () => {
			const claude = await createPlatform("claude");
			const opencode = await createPlatform("opencode");

			expect(typeof claude.id).toBe("string");
			expect(typeof opencode.id).toBe("string");

			expect(typeof claude.displayName).toBe("string");
			expect(typeof opencode.displayName).toBe("string");

			expect(typeof claude.getConfigDir).toBe("function");
			expect(typeof opencode.getConfigDir).toBe("function");

			expect(typeof claude.getContextDir).toBe("function");
			expect(typeof opencode.getContextDir).toBe("function");

			expect(typeof claude.getHooksConfigPath).toBe("function");
			expect(typeof opencode.getHooksConfigPath).toBe("function");

			expect(typeof claude.isAvailable).toBe("function");
			expect(typeof opencode.isAvailable).toBe("function");
		});

		test("platforms return different config paths", async () => {
			const claude = await createPlatform("claude");
			const opencode = await createPlatform("opencode");

			expect(claude.getConfigDir()).not.toBe(opencode.getConfigDir());
			expect(claude.getHooksConfigPath()).not.toBe(opencode.getHooksConfigPath());
		});
	});
});
