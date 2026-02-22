/**
 * Claude Code platform context file generation implementation.
 *
 * Generates CLAUDE.md files for agent worktrees by combining:
 * 1. Base agent definition (Layer 1: role-specific HOW)
 * 2. Task-specific overlay (Layer 2: task-specific WHAT)
 * 3. Optional mulch expertise priming
 *
 * The context file is stored in the project root (.claude/CLAUDE.md by default)
 * and loaded by Claude Code via hooks to prime each agent session.
 */

import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { OverlayConfig } from "../../types.ts";
import type { ContextGenOptions, IPlatformContext } from "../interface.ts";
import { expandTilde } from "../utils.ts";

/**
 * Claude Code platform context implementation.
 *
 * Provides methods for generating, writing, reading, and removing
 * context files (CLAUDE.md) for agent worktrees.
 */
export class ClaudeContext implements IPlatformContext {
	/**
	 * Get the directory where context files are stored.
	 * For Claude Code, this is typically `.claude/` in the project root.
	 *
	 * @returns Absolute path to the context directory
	 */
	getContextDir(): string {
		return ".claude";
	}

	/**
	 * Get the expected filename for a context file.
	 * Claude Code looks for CLAUDE.md by default.
	 *
	 * @returns The context file name
	 */
	getContextFileName(): string {
		return "CLAUDE.md";
	}

	/**
	 * Generate context content from an overlay configuration.
	 *
	 * Combines:
	 * 1. The base agent definition (Layer 1: role-specific workflow)
	 * 2. The task-specific overlay header (Layer 2: task-specific scope)
	 * 3. Optional mulch expertise priming
	 *
	 * @param config - The overlay configuration containing agent definition and task info
	 * @returns The generated context content as a string
	 */
	async generateContent(config: OverlayConfig): Promise<string> {
		const sections: string[] = [];

		// Layer 1: Base Agent Definition
		// Contains the role-specific HOW (workflow, patterns, constraints)
		sections.push(config.baseDefinition);

		// Layer 2: Task Overlay Header
		// Contains the task-specific WHAT (scope, dependencies, acceptance criteria)
		sections.push(this.generateOverlayHeader(config));

		// Optional: Mulch Expertise
		// Pre-fetched expertise from mulch domains
		if (config.mulchExpertise && config.mulchExpertise.trim().length > 0) {
			sections.push(this.wrapExpertiseSection(config.mulchExpertise));
		}

		return sections.filter((s) => s.trim().length > 0).join("\n\n---\n\n");
	}

	/**
	 * Generate the overlay header (Layer 2: task-specific scope).
	 *
	 * Includes:
	 * - Agent identity (name, capability, depth)
	 * - Task information (bead ID, spec path)
	 * - Scope constraints (file scope, branch)
	 * - Hierarchy context (parent agent)
	 * - Special flags (canSpawn, skipScout)
	 *
	 * @param config - The overlay configuration
	 * @returns The generated overlay header as markdown
	 */
	private generateOverlayHeader(config: OverlayConfig): string {
		const lines: string[] = [];

		lines.push("# Task Overlay (Layer 2)");
		lines.push("");
		lines.push("## Agent Identity");
		lines.push(`- **Name**: ${config.agentName}`);
		lines.push(`- **Capability**: ${config.capability}`);
		lines.push(`- **Depth**: ${config.depth}`);
		lines.push(`- **Can Spawn**: ${config.canSpawn ? "Yes" : "No"}`);

		lines.push("");
		lines.push("## Task Scope");
		lines.push(`- **Bead ID**: ${config.beadId}`);

		if (config.specPath !== null) {
			lines.push(`- **Spec Path**: ${config.specPath}`);
		}

		lines.push(`- **Branch**: ${config.branchName}`);
		lines.push(`- **Worktree**: ${config.worktreePath}`);

		if (config.fileScope.length > 0) {
			lines.push("");
			lines.push("## File Scope");
			lines.push("Exclusive scope (if set, only modify these files):");
			for (const file of config.fileScope) {
				lines.push(`- ${file}`);
			}
		}

		if (config.parentAgent !== null) {
			lines.push("");
			lines.push("## Hierarchy Context");
			lines.push(`- **Parent Agent**: ${config.parentAgent}`);
		}

		if (config.skipScout === true) {
			lines.push("");
			lines.push("## Special Flags");
			lines.push("- **Skip Scout Phase**: Yes (go straight to Phase 2: Build)");
		}

		if (config.mulchDomains.length > 0) {
			lines.push("");
			lines.push("## Expertise Domains");
			lines.push("Mulch expertise loaded for:");
			for (const domain of config.mulchDomains) {
				lines.push(`- ${domain}`);
			}
		}

		return lines.join("\n");
	}

	/**
	 * Wrap expertise content in a markdown section.
	 *
	 * @param expertise - The expertise content
	 * @returns The wrapped expertise section
	 */
	private wrapExpertiseSection(expertise: string): string {
		const lines: string[] = [];
		lines.push("# Primed Expertise (Mulch)");
		lines.push("");
		lines.push("Project-specific expertise loaded from mulch domains:");
		lines.push("");
		lines.push(expertise);
		return lines.join("\n");
	}

	/**
	 * Write a context file to a worktree.
	 *
	 * Creates the context directory if it doesn't exist,
	 * then writes the generated content to the context file.
	 *
	 * @param worktreePath - Path to the worktree root
	 * @param config - The overlay configuration
	 * @param options - Generation options
	 * @throws Error if write fails (e.g., permission denied)
	 */
	async write(
		worktreePath: string,
		config: OverlayConfig,
		options?: ContextGenOptions,
	): Promise<void> {
		const contextDir = this.resolveContextPath(worktreePath);
		const contextFile = join(contextDir, this.getContextFileName());

		if (existsSync(contextFile) && options?.overwrite === false) {
			throw new Error(
				`Context file already exists at ${contextFile}. Set overwrite: true to replace.`,
			);
		}

		const content = await this.generateContent(config);

		if (!existsSync(contextDir)) {
			mkdirSync(contextDir, { recursive: true });
		}

		await Bun.write(contextFile, content);
	}

	/**
	 * Read an existing context file from a worktree.
	 *
	 * @param worktreePath - Path to the worktree root
	 * @returns The context file content, or null if not found
	 */
	async read(worktreePath: string): Promise<string | null> {
		const contextDir = this.resolveContextPath(worktreePath);
		const contextFile = join(contextDir, this.getContextFileName());

		if (!existsSync(contextFile)) {
			return null;
		}

		try {
			const file = Bun.file(contextFile);
			return await file.text();
		} catch {
			return null;
		}
	}

	/**
	 * Remove a context file from a worktree.
	 *
	 * @param worktreePath - Path to the worktree root
	 * @throws Error if the file exists but cannot be deleted
	 */
	async remove(worktreePath: string): Promise<void> {
		const contextDir = this.resolveContextPath(worktreePath);
		const contextFile = join(contextDir, this.getContextFileName());

		if (existsSync(contextFile)) {
			try {
				unlinkSync(contextFile);
			} catch (error) {
				throw new Error(
					`Failed to remove context file at ${contextFile}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	}

	/**
	 * Resolve the context directory path for a worktree.
	 *
	 * @param worktreePath - Path to the worktree root
	 * @returns Absolute path to the context directory
	 */
	private resolveContextPath(worktreePath: string): string {
		const expanded = expandTilde(worktreePath);
		return join(expanded, this.getContextDir());
	}
}

/**
 * Create a Claude Code context instance.
 * Factory function for creating platform context implementations.
 *
 * @returns A new ClaudeContext instance
 */
export function createClaudeContext(): IPlatformContext {
	return new ClaudeContext();
}
