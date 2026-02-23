/**
 * Shared platform types for multi-platform support.
 *
 * Platform-specific implementations should extend these base types
 * with their own configuration and state interfaces.
 */

// === Platform Identification ===

/** Supported AI agent platforms. */
export type PlatformType = "opencode";

/** All valid platform type strings as a runtime array. */
export const PLATFORM_TYPES: readonly PlatformType[] = ["opencode"] as const;

// === Platform Configuration ===

/**
 * Base configuration interface for a platform.
 * Platform-specific configs should extend this interface.
 */
export interface PlatformConfig {
	/** The platform type identifier. */
	type: PlatformType;
	/** Human-readable name for the platform. */
	name: string;
	/** Path to the platform's configuration directory. */
	configDir: string;
	/** Path to the platform's session/history storage. */
	sessionDir: string;
}

// === Platform Detection ===

/** Result of platform detection. */
export interface PlatformDetectionResult {
	/** The detected platform type. */
	platform: PlatformType;
	/** Whether the platform binary was found in PATH. */
	binaryFound: boolean;
	/** The detected binary path, if found. */
	binaryPath: string | null;
	/** The detected version string, if available. */
	version: string | null;
}

// === Platform Paths ===

/**
 * Resolved paths for a platform installation.
 * Used for locating config files, session data, and other resources.
 */
export interface PlatformPaths {
	/** Home directory of the current user. */
	homeDir: string;
	/** Platform-specific config directory (e.g., ~/.config/opencode). */
	configDir: string;
	/** Platform-specific session/project directory. */
	sessionDir: string;
	/** Path to the platform binary, if found. */
	binaryPath: string | null;
}
