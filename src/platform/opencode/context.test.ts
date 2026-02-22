import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OverlayConfig } from "../../types.ts";
import { createOpencodeContext, OpencodeContext } from "./context.ts";

function createTestConfig(overrides: Partial<OverlayConfig> = {}): OverlayConfig {
	return {
		agentName: "test-agent",
		beadId: "beads-123",
		specPath: null,
		branchName: "agent/test-agent",
		worktreePath: "/worktrees/test-agent",
		fileScope: [],
		mulchDomains: [],
		parentAgent: null,
		depth: 1,
		canSpawn: true,
		capability: "builder",
		baseDefinition: "# Base Agent Definition\n\nThis is the base role definition.",
		...overrides,
	};
}

describe("OpencodeContext", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "opencode-context-test-"));
	});

	afterEach(() => {
		if (existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	describe("factory", () => {
		test("createOpencodeContext returns IPlatformContext instance", () => {
			const context = createOpencodeContext();
			expect(context).toBeDefined();
			expect(typeof context.getContextDir).toBe("function");
			expect(typeof context.getContextFileName).toBe("function");
			expect(typeof context.generateContent).toBe("function");
			expect(typeof context.write).toBe("function");
			expect(typeof context.read).toBe("function");
			expect(typeof context.remove).toBe("function");
		});
	});

	describe("getContextDir", () => {
		test("returns dot for project root", () => {
			const context = new OpencodeContext();
			expect(context.getContextDir()).toBe(".");
		});
	});

	describe("getContextFileName", () => {
		test("returns AGENTS.md", () => {
			const context = new OpencodeContext();
			expect(context.getContextFileName()).toBe("AGENTS.md");
		});
	});

	describe("generateContent", () => {
		test("includes base definition in content", async () => {
			const context = new OpencodeContext();
			const config = createTestConfig({
				baseDefinition: "# My Agent\n\nRole description.",
			});

			const content = await context.generateContent(config);
			expect(content).toContain("# My Agent");
			expect(content).toContain("Role description.");
		});

		test("includes agent identity in overlay header", async () => {
			const context = new OpencodeContext();
			const config = createTestConfig({
				agentName: "builder-1",
				capability: "builder",
				depth: 2,
				canSpawn: false,
			});

			const content = await context.generateContent(config);
			expect(content).toContain("**Name**: builder-1");
			expect(content).toContain("**Capability**: builder");
			expect(content).toContain("**Depth**: 2");
			expect(content).toContain("**Can Spawn**: No");
		});

		test("includes task scope in overlay header", async () => {
			const context = new OpencodeContext();
			const config = createTestConfig({
				beadId: "beads-456",
				specPath: ".beads/specs/beads-456.md",
				branchName: "feature/test",
				worktreePath: "/worktrees/builder-1",
			});

			const content = await context.generateContent(config);
			expect(content).toContain("**Bead ID**: beads-456");
			expect(content).toContain("**Spec Path**: .beads/specs/beads-456.md");
			expect(content).toContain("**Branch**: feature/test");
			expect(content).toContain("**Worktree**: /worktrees/builder-1");
		});

		test("omits spec path when null", async () => {
			const context = new OpencodeContext();
			const config = createTestConfig({
				specPath: null,
			});

			const content = await context.generateContent(config);
			expect(content).not.toContain("**Spec Path**:");
		});

		test("includes file scope when provided", async () => {
			const context = new OpencodeContext();
			const config = createTestConfig({
				fileScope: ["src/foo.ts", "src/bar.ts"],
			});

			const content = await context.generateContent(config);
			expect(content).toContain("## File Scope");
			expect(content).toContain("- src/foo.ts");
			expect(content).toContain("- src/bar.ts");
		});

		test("omits file scope when empty", async () => {
			const context = new OpencodeContext();
			const config = createTestConfig({
				fileScope: [],
			});

			const content = await context.generateContent(config);
			expect(content).not.toContain("## File Scope");
		});

		test("includes hierarchy context when parent agent exists", async () => {
			const context = new OpencodeContext();
			const config = createTestConfig({
				parentAgent: "coordinator",
			});

			const content = await context.generateContent(config);
			expect(content).toContain("## Hierarchy Context");
			expect(content).toContain("**Parent Agent**: coordinator");
		});

		test("omits hierarchy context when no parent", async () => {
			const context = new OpencodeContext();
			const config = createTestConfig({
				parentAgent: null,
			});

			const content = await context.generateContent(config);
			expect(content).not.toContain("## Hierarchy Context");
		});

		test("includes skip scout flag when enabled", async () => {
			const context = new OpencodeContext();
			const config = createTestConfig({
				skipScout: true,
			});

			const content = await context.generateContent(config);
			expect(content).toContain("## Special Flags");
			expect(content).toContain("**Skip Scout Phase**: Yes");
		});

		test("omits skip scout flag when not set", async () => {
			const context = new OpencodeContext();
			const config = createTestConfig({
				skipScout: false,
			});

			const content = await context.generateContent(config);
			expect(content).not.toContain("## Special Flags");
		});

		test("includes mulch domains when provided", async () => {
			const context = new OpencodeContext();
			const config = createTestConfig({
				mulchDomains: ["typescript", "testing"],
			});

			const content = await context.generateContent(config);
			expect(content).toContain("## Expertise Domains");
			expect(content).toContain("- typescript");
			expect(content).toContain("- testing");
		});

		test("omits mulch domains when empty", async () => {
			const context = new OpencodeContext();
			const config = createTestConfig({
				mulchDomains: [],
			});

			const content = await context.generateContent(config);
			expect(content).not.toContain("## Expertise Domains");
		});

		test("includes mulch expertise content when provided", async () => {
			const context = new OpencodeContext();
			const config = createTestConfig({
				mulchExpertise: "TypeScript patterns:\n- Use const assertions",
			});

			const content = await context.generateContent(config);
			expect(content).toContain("# Primed Expertise (Mulch)");
			expect(content).toContain("TypeScript patterns:");
		});

		test("omits mulch expertise when empty", async () => {
			const context = new OpencodeContext();
			const config = createTestConfig({
				mulchExpertise: "",
			});

			const content = await context.generateContent(config);
			expect(content).not.toContain("# Primed Expertise (Mulch)");
		});

		test("omits mulch expertise when whitespace only", async () => {
			const context = new OpencodeContext();
			const config = createTestConfig({
				mulchExpertise: "   \n   ",
			});

			const content = await context.generateContent(config);
			expect(content).not.toContain("# Primed Expertise (Mulch)");
		});

		test("separates sections with horizontal rules", async () => {
			const context = new OpencodeContext();
			const config = createTestConfig({
				baseDefinition: "# Base",
				mulchExpertise: "Some expertise",
			});

			const content = await context.generateContent(config);
			expect(content).toContain("\n\n---\n\n");
		});
	});

	describe("write", () => {
		test("creates context file in worktree root", async () => {
			const context = new OpencodeContext();
			const config = createTestConfig();

			await context.write(tempDir, config);

			const contextPath = join(tempDir, "AGENTS.md");
			expect(existsSync(contextPath)).toBe(true);
		});

		test("writes generated content to file", async () => {
			const context = new OpencodeContext();
			const config = createTestConfig({
				baseDefinition: "# Test Agent",
			});

			await context.write(tempDir, config);

			const contextPath = join(tempDir, "AGENTS.md");
			const file = Bun.file(contextPath);
			const content = await file.text();
			expect(content).toContain("# Test Agent");
		});

		test("throws when file exists and overwrite is false", async () => {
			const context = new OpencodeContext();
			const config = createTestConfig();

			await context.write(tempDir, config);

			await expect(
				context.write(tempDir, config, { overwrite: false, outputPath: "" }),
			).rejects.toThrow("Context file already exists");
		});

		test("overwrites existing file when overwrite is true", async () => {
			const context = new OpencodeContext();
			const config1 = createTestConfig({ baseDefinition: "# First" });
			const config2 = createTestConfig({ baseDefinition: "# Second" });

			await context.write(tempDir, config1);
			await context.write(tempDir, config2, { overwrite: true, outputPath: "" });

			const contextPath = join(tempDir, "AGENTS.md");
			const file = Bun.file(contextPath);
			const content = await file.text();
			expect(content).toContain("# Second");
			expect(content).not.toContain("# First");
		});

		test("overwrites by default", async () => {
			const context = new OpencodeContext();
			const config1 = createTestConfig({ baseDefinition: "# First" });
			const config2 = createTestConfig({ baseDefinition: "# Second" });

			await context.write(tempDir, config1);
			await context.write(tempDir, config2);

			const contextPath = join(tempDir, "AGENTS.md");
			const file = Bun.file(contextPath);
			const content = await file.text();
			expect(content).toContain("# Second");
		});
	});

	describe("read", () => {
		test("returns null when file does not exist", async () => {
			const context = new OpencodeContext();
			const content = await context.read(tempDir);
			expect(content).toBeNull();
		});

		test("returns file content when file exists", async () => {
			const context = new OpencodeContext();
			const config = createTestConfig({ baseDefinition: "# Test Content" });
			await context.write(tempDir, config);

			const content = await context.read(tempDir);
			expect(content).toContain("# Test Content");
		});
	});

	describe("remove", () => {
		test("removes existing context file", async () => {
			const context = new OpencodeContext();
			const config = createTestConfig();
			await context.write(tempDir, config);

			const contextPath = join(tempDir, "AGENTS.md");
			expect(existsSync(contextPath)).toBe(true);

			await context.remove(tempDir);
			expect(existsSync(contextPath)).toBe(false);
		});

		test("does not throw when file does not exist", async () => {
			const context = new OpencodeContext();
			await expect(context.remove(tempDir)).resolves.toBeUndefined();
		});
	});
});
