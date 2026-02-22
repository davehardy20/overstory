/**
 * Claude Code agent spawning implementation.
 *
 * Manages agent process lifecycle via tmux sessions.
 */

import type { IPlatformSpawner, SpawnConfig, SpawnResult } from "../interface.ts";

export class ClaudeSpawner implements IPlatformSpawner {
	async spawn(config: SpawnConfig): Promise<SpawnResult> {
		const sessionName = config.sessionName ?? config.agentName;
		const timestamp = new Date().toISOString();
		const command = config.command ?? "claude";

		try {
			// Build tmux command args
			const args = ["new-session", "-d", "-s", sessionName, "-c", config.worktreePath, command];

			const proc = Bun.spawnSync(["tmux", ...args], {
				stdout: "pipe",
				stderr: "pipe",
				env: config.env ? { ...process.env, ...config.env } : process.env,
			});

			if (proc.exitCode !== 0) {
				const stderr = new TextDecoder().decode(proc.stderr);
				throw new Error(`Failed to spawn tmux session: ${stderr}`);
			}

			const pidProc = Bun.spawnSync(
				["tmux", "list-panes", "-t", sessionName, "-F", "#{pane_pid}"],
				{
					stdout: "pipe",
					stderr: "pipe",
				},
			);

			let pid: number | null = null;
			if (pidProc.exitCode === 0) {
				const output = new TextDecoder().decode(pidProc.stdout).trim();
				const pidStr = output.split("\n")[0];
				if (pidStr !== undefined && pidStr !== "") {
					pid = parseInt(pidStr, 10);
					if (Number.isNaN(pid)) {
						pid = null;
					}
				}
			}

			return {
				pid,
				sessionId: sessionName,
				spawnedAt: timestamp,
				metadata: {
					tmuxSession: sessionName,
					worktreePath: config.worktreePath,
					capability: config.capability,
					command,
				},
			};
		} catch (error) {
			throw new Error(
				`Failed to spawn agent ${config.agentName}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	async terminate(agentName: string, options?: { force?: boolean }): Promise<void> {
		try {
			const _signal = options?.force ? "-9" : "-15";
			Bun.spawnSync(["tmux", "kill-session", "-t", agentName], {
				stdout: "pipe",
				stderr: "pipe",
			});
		} catch (error) {
			throw new Error(
				`Failed to terminate agent ${agentName}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	async isRunning(agentName: string): Promise<boolean> {
		try {
			const proc = Bun.spawnSync(["tmux", "list-sessions", "-t", agentName], {
				stdout: "pipe",
				stderr: "pipe",
			});
			return proc.exitCode === 0;
		} catch {
			return false;
		}
	}

	async getPid(agentName: string): Promise<number | null> {
		try {
			const proc = Bun.spawnSync(["tmux", "list-panes", "-t", agentName, "-F", "#{pane_pid}"], {
				stdout: "pipe",
				stderr: "pipe",
			});

			if (proc.exitCode === 0) {
				const output = new TextDecoder().decode(proc.stdout).trim();
				const pid = parseInt(output.split("\n")[0] ?? "", 10);
				return Number.isNaN(pid) ? null : pid;
			}
		} catch {
			// PID retrieval failed
		}
		return null;
	}

	async attach(agentName: string): Promise<void> {
		try {
			const running = await this.isRunning(agentName);
			if (!running) {
				throw new Error(`Agent ${agentName} is not running`);
			}

			Bun.spawnSync(["tmux", "attach-session", "-t", agentName], {
				stdin: "inherit",
				stdout: "inherit",
				stderr: "inherit",
			});
		} catch (error) {
			throw new Error(
				`Failed to attach to agent ${agentName}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	async sendInput(agentName: string, input: string): Promise<void> {
		try {
			Bun.spawnSync(["tmux", "send-keys", "-t", agentName, input, "Enter"], {
				stdout: "pipe",
				stderr: "pipe",
			});
		} catch (error) {
			throw new Error(
				`Failed to send input to agent ${agentName}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
}

export function createClaudeSpawner(): IPlatformSpawner {
	return new ClaudeSpawner();
}
