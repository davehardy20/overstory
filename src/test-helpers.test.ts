import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
	cleanupTempDir,
	commitFile,
	createMockClaudePlatform,
	createMockOpencodePlatform,
	createMockPlatform,
	createTempGitRepo,
	MOCK_CLAUDE_CONFIG,
	MOCK_CONTEXT_CONTENT,
	MOCK_OPENCODE_CONFIG,
	MOCK_SPAWN_RESULT,
} from "./test-helpers.ts";

describe("createTempGitRepo", () => {
	let repoDir: string | undefined;

	afterEach(async () => {
		if (repoDir) {
			await cleanupTempDir(repoDir);
			repoDir = undefined;
		}
	});

	test("creates a directory with an initialized git repo", async () => {
		repoDir = await createTempGitRepo();

		expect(existsSync(join(repoDir, ".git"))).toBe(true);
	});

	test("repo has at least one commit (HEAD exists)", async () => {
		repoDir = await createTempGitRepo();

		const proc = Bun.spawn(["git", "rev-parse", "HEAD"], {
			cwd: repoDir,
			stdout: "pipe",
			stderr: "pipe",
		});
		const exitCode = await proc.exited;

		expect(exitCode).toBe(0);
	});

	test("repo is on a branch (not detached HEAD)", async () => {
		repoDir = await createTempGitRepo();

		const proc = Bun.spawn(["git", "symbolic-ref", "HEAD"], {
			cwd: repoDir,
			stdout: "pipe",
			stderr: "pipe",
		});
		const stdout = await new Response(proc.stdout).text();
		const exitCode = await proc.exited;

		expect(exitCode).toBe(0);
		expect(stdout.trim()).toMatch(/^refs\/heads\//);
	});
});

describe("commitFile", () => {
	let repoDir: string | undefined;

	afterEach(async () => {
		if (repoDir) {
			await cleanupTempDir(repoDir);
			repoDir = undefined;
		}
	});

	test("creates file and commits it", async () => {
		repoDir = await createTempGitRepo();

		await commitFile(repoDir, "hello.txt", "world");

		// File exists with correct content
		const content = await readFile(join(repoDir, "hello.txt"), "utf-8");
		expect(content).toBe("world");

		// Git log shows the commit
		const proc = Bun.spawn(["git", "log", "--oneline"], {
			cwd: repoDir,
			stdout: "pipe",
			stderr: "pipe",
		});
		const stdout = await new Response(proc.stdout).text();
		await proc.exited;

		expect(stdout).toContain("add hello.txt");
	});

	test("creates nested directories as needed", async () => {
		repoDir = await createTempGitRepo();

		await commitFile(repoDir, "src/deep/nested/file.ts", "export const x = 1;");

		expect(existsSync(join(repoDir, "src/deep/nested/file.ts"))).toBe(true);
	});

	test("uses custom commit message when provided", async () => {
		repoDir = await createTempGitRepo();

		await commitFile(repoDir, "readme.md", "# Hi", "docs: add readme");

		const proc = Bun.spawn(["git", "log", "--oneline", "-1"], {
			cwd: repoDir,
			stdout: "pipe",
			stderr: "pipe",
		});
		const stdout = await new Response(proc.stdout).text();
		await proc.exited;

		expect(stdout).toContain("docs: add readme");
	});
});

describe("cleanupTempDir", () => {
	test("removes directory and all contents", async () => {
		const repoDir = await createTempGitRepo();
		await commitFile(repoDir, "file.txt", "data");

		expect(existsSync(repoDir)).toBe(true);

		await cleanupTempDir(repoDir);

		expect(existsSync(repoDir)).toBe(false);
	});

	test("does not throw when directory does not exist", async () => {
		await cleanupTempDir("/tmp/overstory-nonexistent-test-dir-12345");
		// No error thrown = pass
	});
});

describe("createMockPlatform", () => {
	test("creates Claude platform with correct id", () => {
		const platform = createMockPlatform("claude");
		expect(platform.id).toBe("claude-code");
		expect(platform.displayName).toBe("Mock Claude Code");
	});

	test("creates Opencode platform with correct id", () => {
		const platform = createMockPlatform("opencode");
		expect(platform.id).toBe("opencode");
		expect(platform.displayName).toBe("Mock Opencode");
	});

	test("Claude platform has correct context dir", () => {
		const platform = createMockPlatform("claude");
		expect(platform.getContextDir("/project")).toBe("/project/.claude");
	});

	test("Opencode platform has correct context dir", () => {
		const platform = createMockPlatform("opencode");
		expect(platform.getContextDir("/project")).toBe("/project");
	});

	test("platform isAvailable returns true", async () => {
		const platform = createMockPlatform("claude");
		expect(await platform.isAvailable()).toBe(true);
	});

	test("platform validate does not throw", async () => {
		const platform = createMockPlatform("claude");
		await expect(platform.validate()).resolves.toBeUndefined();
	});
});

describe("createMockClaudePlatform", () => {
	test("returns Claude platform", () => {
		const platform = createMockClaudePlatform();
		expect(platform.id).toBe("claude-code");
	});

	test("hooks interface works", async () => {
		const platform = createMockClaudePlatform();
		expect(platform.hooks.getConfigPath()).toContain("mock-claude-config");
		expect(await platform.hooks.isInstalled()).toBe(false);
	});

	test("context interface works", async () => {
		const platform = createMockClaudePlatform();
		expect(platform.context.getContextFileName()).toBe("CLAUDE.md");
		const content = await platform.context.read("/any/path");
		expect(content).toBe(MOCK_CONTEXT_CONTENT);
	});

	test("spawner interface works", async () => {
		const platform = createMockClaudePlatform();
		const result = await platform.spawner.spawn({
			agentName: "test-agent",
			capability: "builder",
			worktreePath: "/tmp/test",
			branchName: "test-branch",
			beadId: "test-123",
			parentAgent: null,
			depth: 0,
		});
		expect(result.sessionId).toBe("mock-session-test-agent");
		expect(result.pid).toBeGreaterThan(10000);
	});

	test("metrics interface works", async () => {
		const platform = createMockClaudePlatform();
		expect(platform.metrics.getTranscriptsDir()).toContain("transcripts");
		const transcripts = await platform.metrics.discoverTranscripts();
		expect(transcripts.length).toBe(1);
	});

	test("AI interface works", async () => {
		const platform = createMockClaudePlatform();
		expect(platform.ai).toBeDefined();
		expect(await platform.ai?.isAvailable()).toBe(true);
		expect(platform.ai?.getDefaultModel()).toBe("claude-3-sonnet");
	});
});

describe("createMockOpencodePlatform", () => {
	test("returns Opencode platform", () => {
		const platform = createMockOpencodePlatform();
		expect(platform.id).toBe("opencode");
	});

	test("context interface uses AGENTS.md", async () => {
		const platform = createMockOpencodePlatform();
		expect(platform.context.getContextFileName()).toBe("AGENTS.md");
	});

	test("context dir is project root for opencode", () => {
		const platform = createMockOpencodePlatform();
		expect(platform.getContextDir("/my-project")).toBe("/my-project");
	});
});

describe("Mock test fixtures", () => {
	test("MOCK_CLAUDE_CONFIG has correct structure", () => {
		expect(MOCK_CLAUDE_CONFIG.type).toBe("claude");
		expect(MOCK_CLAUDE_CONFIG.name).toBe("Mock Claude Code");
		expect(MOCK_CLAUDE_CONFIG.configDir).toContain("mock-claude");
	});

	test("MOCK_OPENCODE_CONFIG has correct structure", () => {
		expect(MOCK_OPENCODE_CONFIG.type).toBe("opencode");
		expect(MOCK_OPENCODE_CONFIG.name).toBe("Mock Opencode");
		expect(MOCK_OPENCODE_CONFIG.configDir).toContain("mock-opencode");
	});

	test("MOCK_SPAWN_RESULT has required fields", () => {
		expect(MOCK_SPAWN_RESULT.pid).toBe(12345);
		expect(MOCK_SPAWN_RESULT.sessionId).toBe("mock-session-123");
		expect(MOCK_SPAWN_RESULT.metadata).toHaveProperty("tmuxSession");
	});

	test("MOCK_CONTEXT_CONTENT contains expected sections", () => {
		expect(MOCK_CONTEXT_CONTENT).toContain("Mock Agent Context");
		expect(MOCK_CONTEXT_CONTENT).toContain("## Instructions");
		expect(MOCK_CONTEXT_CONTENT).toContain("## Tools");
	});
});
