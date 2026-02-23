/**
 * Platform factory for creating platform instances.
 *
 * Provides platform detection and factory functions for instantiating
 * platform-specific implementations. Uses dynamic imports to avoid
 * circular dependencies and support optional platform installations.
 */

import type { IPlatform } from "./interface.ts";
import type { PlatformDetectionResult, PlatformType } from "./types.ts";
import { findPlatformBinary, isPlatformAvailable } from "./utils.ts";

/** Extended platform type that includes 'auto' for automatic detection. */
export type AutoPlatformType = PlatformType | "auto";

/** All valid platform type strings including 'auto'. */
export const AUTO_PLATFORM_TYPES: readonly AutoPlatformType[] = ["opencode", "auto"] as const;

/**
 * Detect which platforms are available in the current environment.
 *
 * @returns Map of platform type to its detection result
 *
 * @example
 * ```ts
 * const available = await detectAvailablePlatforms();
 * // Returns: Map { "opencode" => {...} }
 * ```
 */
export async function detectAvailablePlatforms(): Promise<
	Map<PlatformType, PlatformDetectionResult>
> {
	const results = new Map<PlatformType, PlatformDetectionResult>();

	const platformTypes: PlatformType[] = ["opencode"];

	await Promise.all(
		platformTypes.map(async (platform) => {
			const result = await detectPlatform(platform);
			results.set(platform, result);
		}),
	);

	return results;
}

/**
 * Detect a specific platform's availability.
 *
 * @param platform - The platform type to detect
 * @returns Detection result with binary info
 */
export async function detectPlatform(platform: PlatformType): Promise<PlatformDetectionResult> {
	const binaryPath = findPlatformBinary(platform);
	const binaryFound = binaryPath !== null;

	let version: string | null = null;
	if (binaryFound && binaryPath !== null) {
		version = await getPlatformVersion(platform, binaryPath);
	}

	return {
		platform,
		binaryFound,
		binaryPath,
		version,
	};
}

/**
 * Get the version of a platform binary.
 *
 * @param platform - The platform type
 * @param binaryPath - Path to the binary
 * @returns Version string or null if unavailable
 */
async function getPlatformVersion(
	_platform: PlatformType,
	binaryPath: string,
): Promise<string | null> {
	try {
		const proc = Bun.spawnSync([binaryPath, "--version"], {
			stdout: "pipe",
			stderr: "pipe",
		});

		if (proc.exitCode === 0) {
			const output = proc.stdout.toString().trim();
			// Extract version number from output
			const versionMatch = output.match(/(\d+\.\d+\.\d+)/);
			return versionMatch?.[1] ?? output.split("\n")[0] ?? null;
		}
	} catch {
		// Version detection failed
	}
	return null;
}

/**
 * Automatically detect the best available platform.
 *
 * Detection order:
 * 1. Always prefer 'opencode' on the opencode-port branch
 * 2. Throw error if opencode is not available
 *
 * @returns The detected platform type
 * @throws Error if no platform is available
 */
export async function detectBestPlatform(): Promise<PlatformType> {
	const available = await detectAvailablePlatforms();

	// On opencode-port branch: always prefer opencode
	const opencode = available.get("opencode");
	if (opencode?.binaryFound) {
		return "opencode";
	}

	// Opencode is the only platform supported
	throw new Error("No platform available. Install 'opencode' CLI to use Overstory.");
}

/**
 * Create a platform instance for the specified type.
 *
 * Uses dynamic imports to avoid bundling platform-specific code
 * when not needed. The caller must ensure the platform is available
 * before calling this function.
 *
 * @param platformType - The platform type or 'auto' for automatic detection
 * @returns Platform instance
 * @throws Error if the platform is not available or implementation not found
 *
 * @example
 * ```ts
 * // Auto detection - prefers opencode if both available
 * const platform = await createPlatform('auto');
 *
 * // Explicit platform
 * const opencode = await createPlatform('opencode');
 * ```
 */
export async function createPlatform(platformType: AutoPlatformType): Promise<IPlatform> {
	// Resolve 'auto' to actual platform type
	const resolvedType = platformType === "auto" ? await detectBestPlatform() : platformType;

	// Verify platform is available (skip in tests with OVERSTORY_SKIP_PLATFORM_CHECK)
	const skipCheck = process.env.OVERSTORY_SKIP_PLATFORM_CHECK === "true";
	if (!skipCheck && !isPlatformAvailable(resolvedType)) {
		throw new Error(
			`Platform '${resolvedType}' is not available. Install the ${resolvedType} CLI to use this platform.`,
		);
	}

	// Dynamic import to avoid circular dependencies
	return loadPlatformImplementation(resolvedType);
}

/**
 * Load the platform implementation via dynamic import.
 *
 * @param platform - The platform type
 * @returns Platform instance
 * @throws Error if implementation module not found
 */
async function loadPlatformImplementation(platform: PlatformType): Promise<IPlatform> {
	try {
		switch (platform) {
			case "opencode": {
				const module = await import("./opencode/index.ts");
				return module.createOpencodePlatform();
			}
			default: {
				// Exhaustive check
				const _exhaustive: never = platform;
				throw new Error(`Unknown platform: ${_exhaustive}`);
			}
		}
	} catch (error) {
		// Check if it's a module not found error
		if (error instanceof Error && error.message.includes("Cannot find module")) {
			throw new Error(
				`Platform implementation for '${platform}' not found. The module may not be implemented yet.`,
			);
		}
		throw error;
	}
}

/**
 * Check if a specific platform type is available.
 *
 * @param platformType - The platform type to check
 * @returns True if the platform binary is available
 */
export function isPlatformTypeAvailable(platformType: PlatformType): boolean {
	return isPlatformAvailable(platformType);
}

/**
 * Get a summary of platform availability.
 *
 * @returns Object with availability status for each platform
 */
export async function getPlatformSummary(): Promise<{
	available: PlatformType[];
	unavailable: PlatformType[];
	best: PlatformType | null;
}> {
	const available: PlatformType[] = [];
	const unavailable: PlatformType[] = [];

	const platformTypes: PlatformType[] = ["opencode"];

	for (const platform of platformTypes) {
		if (isPlatformAvailable(platform)) {
			available.push(platform);
		} else {
			unavailable.push(platform);
		}
	}

	let best: PlatformType | null = null;
	if (available.length > 0) {
		// On opencode-port branch: always prefer opencode
		best = available.includes("opencode") ? "opencode" : (available[0] ?? null);
	}

	return { available, unavailable, best };
}
