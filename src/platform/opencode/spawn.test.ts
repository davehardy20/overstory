import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import type { SpawnConfig } from "../interface.ts";
import { createOpencodeSpawner, OpencodeSpawner } from "./spawn.ts";

/**
 * Helper to create a mock Bun.spawn return value.
 */
function mockSpawnResult(
	stdout: string,
	stderr: string,
	exitCode: number,
): {
	stdout: ReadableStream<Uint8Array>;
	stderr: ReadableStream<Uint8Array>;
	exited: Promise<number>;
	pid: number;
} {
	return {
		stdout: new Response(stdout).body as ReadableStream<Uint8Array>,
		stderr: new Response(stderr).body as ReadableStream<Uint8Array>,
		exited: Promise.resolve(exitCode),
		pid: 12345,
	};
}

describe("OpencodeSpawner", () => {
	let spawnSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		spawnSpy = spyOn(Bun, "spawn");
	});

	afterEach(() => {
		spawnSpy.mockRestore();
	});

	describe("spawn", () => {
		test("creates tmux session and returns SpawnResult", async () => {
			let callCount = 0;
			spawnSpy.mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// which overstory
					return mockSpawnResult("/usr/local/bin/overstory\n", "", 0);
				}
				if (callCount === 2) {
					// tmux new-session
					return mockSpawnResult("", "", 0);
				}
				// tmux display-message for pane_pid
				return mockSpawnResult("12345\n", "", 0);
			});

			const spawner = new OpencodeSpawner("testproject");
			const config: SpawnConfig = {
				agentName: "my-agent",
				capability: "builder",
				worktreePath: "/repo/worktrees/my-agent",
				branchName: "agent/my-agent",
				beadId: "beads-123",
				parentAgent: null,
				depth: 1,
			};

			const result = await spawner.spawn(config);

			expect(result.pid).toBe(12345);
			expect(result.sessionId).toBe("overstory-testproject-my-agent");
			expect(result.metadata.tmuxSession).toBe("overstory-testproject-my-agent");
			expect(result.metadata.capability).toBe("builder");
		});

		test("includes PATH export in tmux command", async () => {
			let callCount = 0;
			let capturedCmd: string[] = [];

			spawnSpy.mockImplementation((cmd: string[]) => {
				callCount++;
				if (callCount === 1) {
					return mockSpawnResult("/usr/local/bin/overstory\n", "", 0);
				}
				if (callCount === 2) {
					capturedCmd = cmd;
					return mockSpawnResult("", "", 0);
				}
				return mockSpawnResult("999\n", "", 0);
			});

			const spawner = new OpencodeSpawner("myproject");
			await spawner.spawn({
				agentName: "agent",
				capability: "scout",
				worktreePath: "/worktree",
				branchName: "branch",
				beadId: "bead-1",
				parentAgent: "lead-1",
				depth: 2,
			});

			// The wrapped command should include PATH export
			const wrappedCommand = capturedCmd[capturedCmd.length - 1];
			expect(wrappedCommand).toContain("export PATH=");
			expect(wrappedCommand).toContain("opencode");
		});

		test("throws AgentError on tmux failure", async () => {
			spawnSpy.mockImplementation(() => {
				return mockSpawnResult("", "session already exists", 1);
			});

			const spawner = new OpencodeSpawner("project");
			const config: SpawnConfig = {
				agentName: "agent",
				capability: "builder",
				worktreePath: "/path",
				branchName: "branch",
				beadId: "bead-1",
				parentAgent: null,
				depth: 1,
			};

			await expect(spawner.spawn(config)).rejects.toThrow("Failed to create tmux session");
		});

		test("adds model flag with -m format when specified in extra config", async () => {
			let callCount = 0;
			let capturedCmd: string[] = [];

			spawnSpy.mockImplementation((cmd: string[]) => {
				callCount++;
				if (callCount === 1) {
					return mockSpawnResult("/usr/local/bin/overstory\n", "", 0);
				}
				if (callCount === 2) {
					capturedCmd = cmd;
					return mockSpawnResult("", "", 0);
				}
				return mockSpawnResult("1\n", "", 0);
			});

			const spawner = new OpencodeSpawner("project");
			await spawner.spawn({
				agentName: "agent",
				capability: "builder",
				worktreePath: "/path",
				branchName: "branch",
				beadId: "bead-1",
				parentAgent: null,
				depth: 1,
				extra: { model: "anthropic/claude-3-opus" },
			});

			const wrappedCommand = capturedCmd[capturedCmd.length - 1];
			expect(wrappedCommand).toContain("-m");
			expect(wrappedCommand).toContain("anthropic/claude-3-opus");
		});

		test("adds agent flag when specified", async () => {
			let callCount = 0;
			let capturedCmd: string[] = [];

			spawnSpy.mockImplementation((cmd: string[]) => {
				callCount++;
				if (callCount === 1) {
					return mockSpawnResult("/usr/local/bin/overstory\n", "", 0);
				}
				if (callCount === 2) {
					capturedCmd = cmd;
					return mockSpawnResult("", "", 0);
				}
				return mockSpawnResult("1\n", "", 0);
			});

			const spawner = new OpencodeSpawner("project");
			await spawner.spawn({
				agentName: "agent",
				capability: "builder",
				worktreePath: "/path",
				branchName: "branch",
				beadId: "bead-1",
				parentAgent: null,
				depth: 1,
				extra: { agent: "sisyphus" },
			});

			const wrappedCommand = capturedCmd[capturedCmd.length - 1];
			expect(wrappedCommand).toContain("--agent");
			expect(wrappedCommand).toContain("sisyphus");
		});

		test("adds prompt flag when specified", async () => {
			let callCount = 0;
			let capturedCmd: string[] = [];

			spawnSpy.mockImplementation((cmd: string[]) => {
				callCount++;
				if (callCount === 1) {
					return mockSpawnResult("/usr/local/bin/overstory\n", "", 0);
				}
				if (callCount === 2) {
					capturedCmd = cmd;
					return mockSpawnResult("", "", 0);
				}
				return mockSpawnResult("1\n", "", 0);
			});

			const spawner = new OpencodeSpawner("project");
			await spawner.spawn({
				agentName: "agent",
				capability: "builder",
				worktreePath: "/path",
				branchName: "branch",
				beadId: "bead-1",
				parentAgent: null,
				depth: 1,
				extra: { prompt: "Start working on task" },
			});

			const wrappedCommand = capturedCmd[capturedCmd.length - 1];
			expect(wrappedCommand).toContain("--prompt");
			expect(wrappedCommand).toContain("Start working on task");
		});
	});

	describe("terminate", () => {
		test("kills tmux session gracefully", async () => {
			let callCount = 0;
			spawnSpy.mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// tmux display-message for pane_pid
					return mockSpawnResult("100\n", "", 0);
				}
				if (callCount === 2) {
					// pgrep -P 100 (no descendants)
					return mockSpawnResult("", "", 1);
				}
				// tmux kill-session
				return mockSpawnResult("", "", 0);
			});

			const spawner = new OpencodeSpawner("project");
			await spawner.terminate("agent");

			expect(callCount).toBeGreaterThanOrEqual(3);
		});

		test("handles already-killed session gracefully", async () => {
			spawnSpy.mockImplementation(() => {
				// First call: getPanePid fails (session gone)
				return mockSpawnResult("", "session not found", 1);
			});

			const spawner = new OpencodeSpawner("project");
			// Should not throw - session already gone is OK
			await expect(spawner.terminate("agent")).resolves.toBeUndefined();
		});
	});

	describe("isRunning", () => {
		test("returns true when session exists", async () => {
			spawnSpy.mockImplementation(() => {
				return mockSpawnResult("", "", 0);
			});

			const spawner = new OpencodeSpawner("project");
			const running = await spawner.isRunning("agent");

			expect(running).toBe(true);
		});

		test("returns false when session does not exist", async () => {
			spawnSpy.mockImplementation(() => {
				return mockSpawnResult("", "no session", 1);
			});

			const spawner = new OpencodeSpawner("project");
			const running = await spawner.isRunning("agent");

			expect(running).toBe(false);
		});
	});

	describe("getPid", () => {
		test("returns pane PID when session exists", async () => {
			spawnSpy.mockImplementation(() => {
				return mockSpawnResult("54321\n", "", 0);
			});

			const spawner = new OpencodeSpawner("project");
			const pid = await spawner.getPid("agent");

			expect(pid).toBe(54321);
		});

		test("returns null when session does not exist", async () => {
			spawnSpy.mockImplementation(() => {
				return mockSpawnResult("", "session not found", 1);
			});

			const spawner = new OpencodeSpawner("project");
			const pid = await spawner.getPid("agent");

			expect(pid).toBeNull();
		});
	});

	describe("sendInput", () => {
		test("flattens newlines in input", async () => {
			let capturedCmd: string[] = [];
			spawnSpy.mockImplementation((cmd: string[]) => {
				capturedCmd = cmd;
				return mockSpawnResult("", "", 0);
			});

			const spawner = new OpencodeSpawner("project");
			await spawner.sendInput("agent", "line1\nline2\nline3");

			// Check that the input was flattened
			const inputArg = capturedCmd[capturedCmd.indexOf("-t") + 2];
			expect(inputArg).toBe("line1 line2 line3");
		});

		test("throws on tmux error", async () => {
			spawnSpy.mockImplementation(() => {
				return mockSpawnResult("", "session not found", 1);
			});

			const spawner = new OpencodeSpawner("project");
			await expect(spawner.sendInput("agent", "hello")).rejects.toThrow();
		});
	});

	describe("session naming", () => {
		test("uses project name in session ID", async () => {
			spawnSpy.mockImplementation(() => mockSpawnResult("", "", 0));

			const spawner = new OpencodeSpawner("myapp");
			const config: SpawnConfig = {
				agentName: "builder-1",
				capability: "builder",
				worktreePath: "/path",
				branchName: "branch",
				beadId: "bead-1",
				parentAgent: null,
				depth: 1,
			};

			// Need to mock all the spawn calls
			let callCount = 0;
			spawnSpy.mockImplementation(() => {
				callCount++;
				if (callCount === 1) return mockSpawnResult("/bin/overstory\n", "", 0);
				if (callCount === 2) return mockSpawnResult("", "", 0);
				return mockSpawnResult("1\n", "", 0);
			});

			const result = await spawner.spawn(config);

			expect(result.sessionId).toBe("overstory-myapp-builder-1");
		});

		test("setProjectName updates session naming", async () => {
			spawnSpy.mockImplementation(() => mockSpawnResult("", "", 0));

			const spawner = new OpencodeSpawner("oldproject");
			spawner.setProjectName("newproject");

			expect(await spawner.isRunning("agent")).toBe(true);
			// Verify the session name uses new project
			const callArgs = spawnSpy.mock.calls[0] as unknown[];
			const cmd = callArgs[0] as string[];
			expect(cmd[3]).toBe("overstory-newproject-agent");
		});
	});

	describe("attach", () => {
		test("throws when agent not running", async () => {
			spawnSpy.mockImplementation(() => {
				return mockSpawnResult("", "no session", 1);
			});

			const spawner = new OpencodeSpawner("project");
			await expect(spawner.attach("agent")).rejects.toThrow("is not running");
		});
	});
});

describe("createOpencodeSpawner factory", () => {
	test("creates spawner with default project name", () => {
		const spawner = createOpencodeSpawner();
		expect(spawner).toBeInstanceOf(OpencodeSpawner);
	});

	test("creates spawner with custom project name", () => {
		const spawner = createOpencodeSpawner("customproject");
		expect(spawner).toBeInstanceOf(OpencodeSpawner);
	});
});
