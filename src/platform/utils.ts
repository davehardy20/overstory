/**
 * Shared platform utilities for path resolution and common operations.
 *
 * Platform-specific implementations should use these utilities for
 * consistent path handling across the codebase.
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { PlatformPaths, PlatformType } from "./types.ts";

/**
 * Expand a path that may contain a tilde (~) prefix to an absolute path.
 *
 * @param path - Path that may start with ~
 * @returns Absolute path with ~ expanded to home directory
 *
 * @example
 * ```ts
 * expandTilde("~/.claude/config.json")
 * // Returns: "/home/user/.claude/config.json"
 * ```
 */
export function expandTilde(path: string): string {
	if (path.startsWith("~")) {
		const home = homedir();
		if (home === null || home === undefined) {
			return path;
		}
		return path === "~" ? home : join(home, path.slice(1));
	}
	return path;
}

/**
 * Get the home directory of the current user.
 * Falls back to the USERPROFILE or HOME environment variable if os.homedir() fails.
 *
 * @returns The home directory path, or "/" as a last resort
 */
export function getHomeDir(): string {
	const home = homedir();
	if (home !== null && home !== undefined && home !== "") {
		return home;
	}
	// Fallback to environment variables
	const envHome = process.env.HOME ?? process.env.USERPROFILE;
	if (envHome !== undefined && envHome !== "") {
		return envHome;
	}
	// Last resort
	return "/";
}

/**
 * Get the default config directory for a platform.
 *
 * @param platform - The platform type
 * @returns The default config directory path (with ~ expanded)
 *
 * @example
 * ```ts
 * getDefaultConfigDir("claude")
 * // Returns: "/home/user/.claude"
 * ```
 */
export function getDefaultConfigDir(platform: PlatformType): string {
	const home = getHomeDir();
	switch (platform) {
		case "claude":
			return join(home, ".claude");
		case "opencode":
			return join(home, ".config", "opencode");
		default: {
			// Exhaustive check
			const _exhaustive: never = platform;
			throw new Error(`Unknown platform: ${_exhaustive}`);
		}
	}
}

/**
 * Get the default session directory for a platform.
 *
 * @param platform - The platform type
 * @returns The default session directory path (with ~ expanded)
 *
 * @example
 * ```ts
 * getDefaultSessionDir("claude")
 * // Returns: "/home/user/.claude/projects"
 * ```
 */
export function getDefaultSessionDir(platform: PlatformType): string {
	const configDir = getDefaultConfigDir(platform);
	switch (platform) {
		case "claude":
			return join(configDir, "projects");
		case "opencode":
			return join(configDir, "sessions");
		default: {
			// Exhaustive check
			const _exhaustive: never = platform;
			throw new Error(`Unknown platform: ${_exhaustive}`);
		}
	}
}

/**
 * Resolve all paths for a platform installation.
 *
 * @param platform - The platform type
 * @returns Resolved paths for the platform
 *
 * @example
 * ```ts
 * const paths = resolvePlatformPaths("claude")
 * // Returns: { homeDir, configDir, sessionDir, binaryPath }
 * ```
 */
export function resolvePlatformPaths(platform: PlatformType): PlatformPaths {
	const homeDir = getHomeDir();
	const configDir = getDefaultConfigDir(platform);
	const sessionDir = getDefaultSessionDir(platform);
	const binaryPath = findPlatformBinary(platform);

	return {
		homeDir,
		configDir,
		sessionDir,
		binaryPath,
	};
}

/**
 * Find the binary path for a platform by checking common locations.
 *
 * @param platform - The platform type
 * @returns The binary path if found, or null
 */
export function findPlatformBinary(platform: PlatformType): string | null {
	const binaryName = getBinaryName(platform);

	// Check PATH using `which` (Unix) or `where` (Windows)
	const command = process.platform === "win32" ? "where" : "which";

	try {
		const proc = Bun.spawnSync([command, binaryName], {
			stdout: "pipe",
			stderr: "pipe",
		});

		if (proc.exitCode === 0) {
			const output = proc.stdout.toString().trim();
			// Take first result (in case of multiple matches)
			const firstMatch = output.split("\n")[0];
			if (firstMatch !== undefined && firstMatch !== "") {
				return firstMatch;
			}
		}
	} catch {
		// Command failed, fall through to check common paths
	}

	// Check common installation locations
	const commonPaths = getCommonBinaryPaths(platform);
	for (const path of commonPaths) {
		if (existsSync(path)) {
			return path;
		}
	}

	return null;
}

/**
 * Get the binary name for a platform.
 *
 * @param platform - The platform type
 * @returns The binary name (e.g., "claude", "opencode")
 */
export function getBinaryName(platform: PlatformType): string {
	switch (platform) {
		case "claude":
			return "claude";
		case "opencode":
			return "opencode";
		default: {
			// Exhaustive check
			const _exhaustive: never = platform;
			throw new Error(`Unknown platform: ${_exhaustive}`);
		}
	}
}

/**
 * Get common binary installation paths for a platform.
 *
 * @param platform - The platform type
 * @returns Array of common paths to check
 */
function getCommonBinaryPaths(platform: PlatformType): string[] {
	const home = getHomeDir();
	const binaryName = getBinaryName(platform);

	const paths: string[] = [];

	switch (platform) {
		case "claude":
			// Common Claude Code installation locations
			paths.push(
				join(home, ".local", "bin", binaryName),
				join(home, "bin", binaryName),
				join("/usr", "local", "bin", binaryName),
				join("/usr", "bin", binaryName),
			);
			break;
		case "opencode":
			// Common OpenCode installation locations
			paths.push(
				join(home, ".local", "bin", binaryName),
				join(home, "bin", binaryName),
				join("/usr", "local", "bin", binaryName),
				join("/usr", "bin", binaryName),
			);
			break;
		default: {
			// Exhaustive check
			const _exhaustive: never = platform;
			throw new Error(`Unknown platform: ${_exhaustive}`);
		}
	}

	return paths;
}

/**
 * Check if a platform binary is available in PATH.
 *
 * @param platform - The platform type
 * @returns True if the binary was found, false otherwise
 */
export function isPlatformAvailable(platform: PlatformType): boolean {
	return findPlatformBinary(platform) !== null;
}

/**
 * Resolve a path relative to a base directory, handling tilde expansion.
 *
 * @param basePath - The base directory (may contain ~)
 * @param relativePath - The path relative to base
 * @returns The resolved absolute path
 */
export function resolvePath(basePath: string, relativePath: string): string {
	const expandedBase = expandTilde(basePath);
	return resolve(expandedBase, relativePath);
}

/**
 * Check if a directory exists at the given path.
 *
 * @param dirPath - Path to check (may contain ~)
 * @returns True if the directory exists, false otherwise
 */
export function directoryExists(dirPath: string): boolean {
	const expanded = expandTilde(dirPath);
	try {
		return existsSync(expanded);
	} catch {
		return false;
	}
}
