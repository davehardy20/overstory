/**
 * Opencode agent spawning implementation.
 *
 * Implements IPlatformSpawner for Opencode, leveraging the existing
 * tmux infrastructure for robust session management.
 *
 * Features:
 * - Session naming: overstory-{projectName}-{agentName}
 * - PATH injection for hook access to overstory CLI
 * - Process tree cleanup on termination
 * - Graceful shutdown with SIGTERM before SIGKILL
 * - Model selection: -m provider/model format
 */

import { dirname, resolve } from "node:path";
import { AgentError } from "../../errors.ts";
import type { IPlatformSpawner, SpawnConfig, SpawnResult } from "../interface.ts";

/**
 * Run a shell command and capture its output.
 */
async function runCommand(
	cmd: string[],
	cwd?: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	const proc = Bun.spawn(cmd, {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
	});
	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;
	return { stdout, stderr, exitCode };
}

/**
 * Detect the directory containing the overstory binary.
 *
 * Checks `which overstory` to find it on the current PATH.
 * Returns null if detection fails.
 */
async function detectOverstoryBinDir(): Promise<string | null> {
	try {
		const proc = Bun.spawn(["which", "overstory"], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const exitCode = await proc.exited;
		if (exitCode === 0) {
			const binPath = (await new Response(proc.stdout).text()).trim();
			if (binPath.length > 0) {
				return dirname(resolve(binPath));
			}
		}
	} catch {
		// which not available or overstory not on PATH
	}

	// Fallback: if process.argv[1] points to overstory's own entry point
	const scriptPath = process.argv[1];
	if (scriptPath?.includes("overstory")) {
		const bunPath = process.argv[0];
		if (bunPath) {
			return dirname(resolve(bunPath));
		}
	}

	return null;
}

/**
 * Grace period (ms) between SIGTERM and SIGKILL during process cleanup.
 */
const KILL_GRACE_PERIOD_MS = 2000;

/**
 * Recursively collect all descendant PIDs of a given process.
 *
 * Uses `pgrep -P <pid>` to find direct children, then recurses.
 * Returns PIDs in depth-first order (deepest descendants first).
 */
async function getDescendantPids(pid: number): Promise<number[]> {
	const { exitCode, stdout } = await runCommand(["pgrep", "-P", String(pid)]);

	if (exitCode !== 0 || stdout.trim().length === 0) {
		return [];
	}

	const childPids: number[] = [];
	for (const line of stdout.trim().split("\n")) {
		const childPid = Number.parseInt(line.trim(), 10);
		if (!Number.isNaN(childPid)) {
			childPids.push(childPid);
		}
	}

	// Recurse into each child to get their descendants first (depth-first)
	const allDescendants: number[] = [];
	for (const childPid of childPids) {
		const grandchildren = await getDescendantPids(childPid);
		allDescendants.push(...grandchildren);
	}

	// Append the direct children after their descendants (deepest-first order)
	allDescendants.push(...childPids);

	return allDescendants;
}

/**
 * Check if a process is still alive.
 */
function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/**
 * Send a signal to a process, ignoring errors for already-dead or inaccessible processes.
 */
function sendSignal(pid: number, signal: "SIGTERM" | "SIGKILL"): void {
	try {
		process.kill(pid, signal);
	} catch {
		// Process already dead (ESRCH), permission denied (EPERM), or invalid PID — all OK
	}
}

/**
 * Kill a process tree: SIGTERM deepest-first, wait grace period, SIGKILL survivors.
 */
async function killProcessTree(
	rootPid: number,
	gracePeriodMs: number = KILL_GRACE_PERIOD_MS,
): Promise<void> {
	const descendants = await getDescendantPids(rootPid);

	if (descendants.length === 0) {
		sendSignal(rootPid, "SIGTERM");
		return;
	}

	// Phase 1: SIGTERM all descendants (deepest-first, then root)
	for (const pid of descendants) {
		sendSignal(pid, "SIGTERM");
	}
	sendSignal(rootPid, "SIGTERM");

	// Phase 2: Wait grace period for processes to clean up
	await Bun.sleep(gracePeriodMs);

	// Phase 3: SIGKILL any survivors (same order: deepest-first, then root)
	for (const pid of descendants) {
		if (isProcessAlive(pid)) {
			sendSignal(pid, "SIGKILL");
		}
	}
	if (isProcessAlive(rootPid)) {
		sendSignal(rootPid, "SIGKILL");
	}
}

/**
 * Get the pane PID for a tmux session.
 */
async function getPanePid(name: string): Promise<number | null> {
	const { exitCode, stdout } = await runCommand([
		"tmux",
		"display-message",
		"-p",
		"-t",
		name,
		"#{pane_pid}",
	]);

	if (exitCode !== 0) {
		return null;
	}

	const pidStr = stdout.trim();
	if (pidStr.length === 0) {
		return null;
	}

	const pid = Number.parseInt(pidStr, 10);
	return Number.isNaN(pid) ? null : pid;
}

/**
 * Opencode implementation of IPlatformSpawner.
 *
 * Provides agent lifecycle management through tmux sessions with:
 * - Session naming convention: overstory-{projectName}-{agentName}
 * - PATH injection for hook access
 * - Graceful process tree cleanup
 * - Opencode-specific model format: -m provider/model
 */
export class OpencodeSpawner implements IPlatformSpawner {
	private projectName: string;

	constructor(projectName: string = "default") {
		this.projectName = projectName;
	}

	/**
	 * Set the project name for session naming.
	 */
	setProjectName(name: string): void {
		this.projectName = name;
	}

	/**
	 * Build the full tmux session name.
	 */
	private buildSessionName(agentName: string): string {
		return `overstory-${this.projectName}-${agentName}`;
	}

	/**
	 * Spawn a new Opencode agent process in a tmux session.
	 *
	 * Creates a detached tmux session running `opencode` with:
	 * - Working directory set to the worktree path
	 * - PATH updated to include overstory binary directory
	 * - Optional environment variables injected
	 * - Model selection in provider/model format
	 */
	async spawn(config: SpawnConfig): Promise<SpawnResult> {
		const sessionName = this.buildSessionName(config.agentName);
		const timestamp = new Date().toISOString();

		// Build environment exports for the tmux session
		const exports: string[] = [];

		// Ensure PATH includes the overstory binary directory
		const overstoryBinDir = await detectOverstoryBinDir();
		if (overstoryBinDir) {
			exports.push(`export PATH="${overstoryBinDir}:$PATH"`);
		}

		// Add any additional environment variables from extra config
		const extraEnv = config.extra?.env as Record<string, string> | undefined;
		if (extraEnv) {
			for (const [key, value] of Object.entries(extraEnv)) {
				exports.push(`export ${key}="${value}"`);
			}
		}

		// Build the opencode command with optional flags
		const opencodeArgs = this.buildOpencodeArgs(config);
		const opencodeCommand = `opencode ${opencodeArgs.join(" ")}`;

		const wrappedCommand =
			exports.length > 0 ? `${exports.join(" && ")} && ${opencodeCommand}` : opencodeCommand;

		const { exitCode, stderr } = await runCommand(
			["tmux", "new-session", "-d", "-s", sessionName, "-c", config.worktreePath, wrappedCommand],
			config.worktreePath,
		);

		if (exitCode !== 0) {
			throw new AgentError(`Failed to create tmux session "${sessionName}": ${stderr.trim()}`, {
				agentName: config.agentName,
			});
		}

		// Retrieve the actual PID of the process running inside the tmux pane
		const pid = await getPanePid(sessionName);

		return {
			pid,
			sessionId: sessionName,
			spawnedAt: timestamp,
			metadata: {
				tmuxSession: sessionName,
				worktreePath: config.worktreePath,
				capability: config.capability,
				beadId: config.beadId,
				branchName: config.branchName,
				depth: config.depth,
				parentAgent: config.parentAgent,
			},
		};
	}

	/**
	 * Build Opencode CLI arguments based on spawn configuration.
	 *
	 * Opencode uses:
	 * - `-m provider/model` for model selection (not --model)
	 * - No permission skip flag needed (different permission model)
	 */
	private buildOpencodeArgs(config: SpawnConfig): string[] {
		const args: string[] = [];

		// Add model if specified in extra config (format: provider/model)
		const model = config.extra?.model as string | undefined;
		if (model) {
			args.push("-m", model);
		}

		// Add agent if specified
		const agent = config.extra?.agent as string | undefined;
		if (agent) {
			args.push("--agent", agent);
		}

		// Add prompt if specified (for non-interactive startup)
		const prompt = config.extra?.prompt as string | undefined;
		if (prompt) {
			args.push("--prompt", `"${prompt.replace(/"/g, '\\"')}"`);
		}

		return args;
	}

	/**
	 * Terminate a running agent with proper process tree cleanup.
	 *
	 * Before killing the tmux session, walks the descendant process tree,
	 * sends SIGTERM to all descendants (deepest-first), waits a grace period,
	 * then sends SIGKILL to survivors.
	 */
	async terminate(agentName: string, options?: { force?: boolean }): Promise<void> {
		const sessionName = this.buildSessionName(agentName);

		// Get the pane PID before killing the tmux session
		const panePid = await getPanePid(sessionName);

		// If we have a pane PID and not forcing immediate kill, do graceful shutdown
		if (panePid !== null && !options?.force) {
			await killProcessTree(panePid);
		} else if (panePid !== null && options?.force) {
			// Force kill - skip grace period
			await killProcessTree(panePid, 0);
		}

		// Kill the tmux session itself
		const { exitCode, stderr } = await runCommand(["tmux", "kill-session", "-t", sessionName]);

		if (exitCode !== 0) {
			// If the session is already gone, that's fine
			if (stderr.includes("session not found") || stderr.includes("can't find session")) {
				return;
			}
			throw new AgentError(`Failed to kill tmux session "${sessionName}": ${stderr.trim()}`, {
				agentName,
			});
		}
	}

	/**
	 * Check if an agent process is running.
	 */
	async isRunning(agentName: string): Promise<boolean> {
		const sessionName = this.buildSessionName(agentName);
		const { exitCode } = await runCommand(["tmux", "has-session", "-t", sessionName]);
		return exitCode === 0;
	}

	/**
	 * Get the PID of a running agent's main process.
	 */
	async getPid(agentName: string): Promise<number | null> {
		const sessionName = this.buildSessionName(agentName);
		return getPanePid(sessionName);
	}

	/**
	 * Attach to an agent's tmux session.
	 *
	 * Uses Bun.spawnSync with inherited stdio to allow interactive attachment.
	 */
	async attach(agentName: string): Promise<void> {
		const sessionName = this.buildSessionName(agentName);

		const running = await this.isRunning(agentName);
		if (!running) {
			throw new AgentError(`Agent ${agentName} is not running`, { agentName });
		}

		Bun.spawnSync(["tmux", "attach-session", "-t", sessionName], {
			stdin: "inherit",
			stdout: "inherit",
			stderr: "inherit",
		});
	}

	/**
	 * Send input to an agent's tmux session.
	 *
	 * Flattens newlines to spaces to prevent embedded Enter keystrokes
	 * from interfering with message submission.
	 */
	async sendInput(agentName: string, input: string): Promise<void> {
		const sessionName = this.buildSessionName(agentName);

		// Flatten newlines to spaces
		const flatInput = input.replace(/\n/g, " ");

		const { exitCode, stderr } = await runCommand([
			"tmux",
			"send-keys",
			"-t",
			sessionName,
			flatInput,
			"Enter",
		]);

		if (exitCode !== 0) {
			const trimmedStderr = stderr.trim();

			if (trimmedStderr.includes("no server running")) {
				throw new AgentError(`Tmux server is not running (cannot reach session "${sessionName}")`, {
					agentName,
				});
			}

			if (
				trimmedStderr.includes("session not found") ||
				trimmedStderr.includes("can't find session")
			) {
				throw new AgentError(
					`Tmux session "${sessionName}" does not exist. The agent may have crashed or been killed.`,
					{ agentName },
				);
			}

			throw new AgentError(
				`Failed to send input to tmux session "${sessionName}": ${trimmedStderr}`,
				{
					agentName,
				},
			);
		}
	}
}

/**
 * Factory function to create an Opencode spawner instance.
 *
 * @param projectName - Optional project name for session naming
 * @returns A new OpencodeSpawner instance
 */
export function createOpencodeSpawner(projectName?: string): IPlatformSpawner {
	return new OpencodeSpawner(projectName);
}
