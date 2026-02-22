/**
 * Tests for overstory hooks install/uninstall/status command.
 *
 * Uses real temp directories and real filesystem (no mocks needed).
 * Each test gets an isolated temp directory with minimal .overstory/
 * and platform-specific scaffolding.
 *
 * Tests use platform abstraction helpers to get correct paths for
 * the configured platform (Claude Code by default).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { ValidationError } from "../errors.ts";
import {
	cleanupTempDir,
	createTempGitRepo,
	getMockContextDir,
	getMockHooksConfigPath,
} from "../test-helpers.ts";
import { hooksCommand } from "./hooks.ts";

let tempDir: string;
const originalCwd = process.cwd();

/** Orchestrator hooks content for .overstory/hooks.json. */
const SAMPLE_HOOKS = {
	hooks: {
		SessionStart: [
			{
				matcher: "",
				hooks: [{ type: "command", command: "overstory prime --agent orchestrator" }],
			},
		],
		Stop: [
			{
				matcher: "",
				hooks: [{ type: "command", command: "overstory log session-end --agent orchestrator" }],
			},
		],
	},
};

/** Capture stdout.write output during a function call. */
async function captureStdout(fn: () => Promise<void>): Promise<string> {
	const chunks: string[] = [];
	const originalWrite = process.stdout.write;
	process.stdout.write = ((chunk: string) => {
		chunks.push(chunk);
		return true;
	}) as typeof process.stdout.write;
	try {
		await fn();
	} finally {
		process.stdout.write = originalWrite;
	}
	return chunks.join("");
}

/** Get the expected hooks config path for the test platform (Claude). */
function getExpectedHooksPath(projectRoot: string): string {
	return getMockHooksConfigPath(projectRoot, "claude");
}

/** Get the expected context directory for the test platform (Claude). */
function getExpectedContextDir(projectRoot: string): string {
	return getMockContextDir(projectRoot, "claude");
}

beforeEach(async () => {
	// Skip platform availability check for tests
	process.env.OVERSTORY_SKIP_PLATFORM_CHECK = "true";
	process.chdir(originalCwd);
	tempDir = await realpath(await createTempGitRepo());

	// Create minimal .overstory/ with config.yaml
	const overstoryDir = join(tempDir, ".overstory");
	await mkdir(overstoryDir, { recursive: true });
	await Bun.write(
		join(overstoryDir, "config.yaml"),
		[
			"project:",
			"  name: test-project",
			`  root: ${tempDir}`,
			"  canonicalBranch: main",
			"platform:",
			"  type: claude",
		].join("\n"),
	);
	process.chdir(tempDir);
});

afterEach(async () => {
	process.chdir(originalCwd);
	await cleanupTempDir(tempDir);
});

describe("hooksCommand help", () => {
	test("--help outputs help text", async () => {
		const output = await captureStdout(() => hooksCommand(["--help"]));
		expect(output).toContain("overstory hooks");
		expect(output).toContain("install");
		expect(output).toContain("uninstall");
		expect(output).toContain("status");
	});

	test("empty args outputs help text", async () => {
		const output = await captureStdout(() => hooksCommand([]));
		expect(output).toContain("overstory hooks");
	});

	test("unknown subcommand throws ValidationError", async () => {
		await expect(hooksCommand(["frobnicate"])).rejects.toThrow(ValidationError);
	});
});

describe("hooks install", () => {
	test("installs hooks from .overstory/hooks.json to platform settings", async () => {
		// Write source hooks
		await Bun.write(
			join(tempDir, ".overstory", "hooks.json"),
			`${JSON.stringify(SAMPLE_HOOKS, null, "\t")}\n`,
		);

		await captureStdout(() => hooksCommand(["install"]));

		// Verify target file was created using platform abstraction
		const targetPath = getExpectedHooksPath(tempDir);
		const content = await Bun.file(targetPath).text();
		const parsed = JSON.parse(content) as Record<string, unknown>;
		expect(parsed.hooks).toBeDefined();
		expect(content).toContain("overstory prime");
	});

	test("preserves existing non-hooks keys in platform settings", async () => {
		await Bun.write(
			join(tempDir, ".overstory", "hooks.json"),
			`${JSON.stringify(SAMPLE_HOOKS, null, "\t")}\n`,
		);

		// Write existing platform settings with non-hooks content
		const contextDir = getExpectedContextDir(tempDir);
		await mkdir(contextDir, { recursive: true });
		const settingsPath = getExpectedHooksPath(tempDir);
		await Bun.write(settingsPath, `${JSON.stringify({ env: { SOME_VAR: "1" } }, null, "\t")}\n`);

		await captureStdout(() => hooksCommand(["install"]));

		const content = await Bun.file(settingsPath).text();
		const parsed = JSON.parse(content) as Record<string, unknown>;
		expect(parsed.hooks).toBeDefined();
		expect(parsed.env).toEqual({ SOME_VAR: "1" });
	});

	test("warns when hooks already exist without --force", async () => {
		await Bun.write(
			join(tempDir, ".overstory", "hooks.json"),
			`${JSON.stringify(SAMPLE_HOOKS, null, "\t")}\n`,
		);

		const contextDir = getExpectedContextDir(tempDir);
		await mkdir(contextDir, { recursive: true });
		const settingsPath = getExpectedHooksPath(tempDir);
		await Bun.write(settingsPath, `${JSON.stringify({ hooks: { old: "hooks" } }, null, "\t")}\n`);

		const output = await captureStdout(() => hooksCommand(["install"]));
		expect(output).toContain("already present");
		expect(output).toContain("--force");

		// Verify hooks were NOT overwritten
		const content = await Bun.file(settingsPath).text();
		expect(content).toContain("old");
	});

	test("--force overwrites existing hooks", async () => {
		await Bun.write(
			join(tempDir, ".overstory", "hooks.json"),
			`${JSON.stringify(SAMPLE_HOOKS, null, "\t")}\n`,
		);

		const contextDir = getExpectedContextDir(tempDir);
		await mkdir(contextDir, { recursive: true });
		const settingsPath = getExpectedHooksPath(tempDir);
		await Bun.write(settingsPath, `${JSON.stringify({ hooks: { old: "hooks" } }, null, "\t")}\n`);

		await captureStdout(() => hooksCommand(["install", "--force"]));

		const content = await Bun.file(settingsPath).text();
		expect(content).not.toContain("old");
		expect(content).toContain("overstory prime");
	});

	test("throws when .overstory/hooks.json does not exist", async () => {
		await expect(hooksCommand(["install"])).rejects.toThrow(ValidationError);
	});

	test("writes JSON with trailing newline", async () => {
		await Bun.write(
			join(tempDir, ".overstory", "hooks.json"),
			`${JSON.stringify(SAMPLE_HOOKS, null, "\t")}\n`,
		);

		await captureStdout(() => hooksCommand(["install"]));

		const settingsPath = getExpectedHooksPath(tempDir);
		const content = await Bun.file(settingsPath).text();
		expect(content.endsWith("\n")).toBe(true);
	});
});

describe("hooks uninstall", () => {
	test("removes hooks-only settings file entirely", async () => {
		const contextDir = getExpectedContextDir(tempDir);
		await mkdir(contextDir, { recursive: true });
		const settingsPath = getExpectedHooksPath(tempDir);
		await Bun.write(settingsPath, `${JSON.stringify({ hooks: { some: "hooks" } }, null, "\t")}\n`);

		const output = await captureStdout(() => hooksCommand(["uninstall"]));
		expect(output).toContain("Removed");

		const exists = await Bun.file(settingsPath).exists();
		expect(exists).toBe(false);
	});

	test("preserves non-hooks keys when uninstalling", async () => {
		const contextDir = getExpectedContextDir(tempDir);
		await mkdir(contextDir, { recursive: true });
		const settingsPath = getExpectedHooksPath(tempDir);
		await Bun.write(
			settingsPath,
			`${JSON.stringify({ hooks: { some: "hooks" }, env: { KEY: "val" } }, null, "\t")}\n`,
		);

		const output = await captureStdout(() => hooksCommand(["uninstall"]));
		expect(output).toContain("preserved other settings");

		const content = await Bun.file(settingsPath).text();
		const parsed = JSON.parse(content) as Record<string, unknown>;
		expect(parsed.hooks).toBeUndefined();
		expect(parsed.env).toEqual({ KEY: "val" });
	});

	test("handles missing settings file gracefully", async () => {
		const output = await captureStdout(() => hooksCommand(["uninstall"]));
		expect(output).toContain("nothing to uninstall");
	});

	test("handles settings file with no hooks key", async () => {
		const contextDir = getExpectedContextDir(tempDir);
		await mkdir(contextDir, { recursive: true });
		const settingsPath = getExpectedHooksPath(tempDir);
		await Bun.write(settingsPath, `${JSON.stringify({ env: { KEY: "val" } }, null, "\t")}\n`);

		const output = await captureStdout(() => hooksCommand(["uninstall"]));
		expect(output).toContain("No hooks found");
	});
});

describe("hooks status", () => {
	test("reports source missing when .overstory/hooks.json does not exist", async () => {
		const output = await captureStdout(() => hooksCommand(["status"]));
		expect(output).toContain("missing");
	});

	test("reports installed:false when no hooks in platform context dir", async () => {
		await Bun.write(
			join(tempDir, ".overstory", "hooks.json"),
			`${JSON.stringify(SAMPLE_HOOKS, null, "\t")}\n`,
		);

		const output = await captureStdout(() => hooksCommand(["status"]));
		expect(output).toContain("present");
		expect(output).toContain("no");
		expect(output).toContain("overstory hooks install");
	});

	test("reports installed:true when hooks present in platform context dir", async () => {
		await Bun.write(
			join(tempDir, ".overstory", "hooks.json"),
			`${JSON.stringify(SAMPLE_HOOKS, null, "\t")}\n`,
		);

		const contextDir = getExpectedContextDir(tempDir);
		await mkdir(contextDir, { recursive: true });
		const settingsPath = getExpectedHooksPath(tempDir);
		await Bun.write(settingsPath, `${JSON.stringify({ hooks: {} }, null, "\t")}\n`);

		const output = await captureStdout(() => hooksCommand(["status"]));
		expect(output).toContain("yes");
	});

	test("--json outputs correct fields", async () => {
		await Bun.write(
			join(tempDir, ".overstory", "hooks.json"),
			`${JSON.stringify(SAMPLE_HOOKS, null, "\t")}\n`,
		);

		const output = await captureStdout(() => hooksCommand(["status", "--json"]));
		const parsed = JSON.parse(output) as Record<string, unknown>;
		expect(parsed.sourceExists).toBe(true);
		expect(parsed.installed).toBe(false);
	});
});
