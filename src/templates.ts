import { dirname, join } from "node:path";
import { EMBEDDED_TEMPLATES } from "./templates-embedded.ts";

/**
 * Template file names used by overstory.
 * These are embedded at build time via templates-embedded.ts
 */
export const TEMPLATE_FILES = {
	HOOKS: "templates/hooks.json.tmpl",
	OVERLAY: "templates/overlay.md.tmpl",
} as const;

/**
 * Map template file paths to embedded template names
 */
const TEMPLATE_PATH_TO_NAME: Record<string, keyof typeof EMBEDDED_TEMPLATES> = {
	"templates/hooks.json.tmpl": "HOOKS",
	"templates/overlay.md.tmpl": "OVERLAY",
	"templates/opencode-hooks.json.tmpl": "OPENCODE_HOOKS",
};

/**
 * Cached repo root path for template resolution.
 * Computed once and reused to avoid repeated filesystem traversal.
 */
let cachedRepoRoot: string | null = null;

/**
 * Find the repository root by looking for templates directory.
 * Searches upward from this file's location until it finds templates/.
 */
async function findRepoRoot(): Promise<string> {
	if (cachedRepoRoot) {
		return cachedRepoRoot;
	}

	// Start from this file's directory and search upward
	let currentDir = dirname(import.meta.dir);
	const maxDepth = 5; // Prevent infinite loops

	for (let i = 0; i < maxDepth; i++) {
		// Check if templates directory exists here
		const templatesHooks = Bun.file(join(currentDir, "templates", "hooks.json.tmpl"));
		const exists = await templatesHooks.exists();
		if (exists) {
			cachedRepoRoot = currentDir;
			return currentDir;
		}

		// Not found here, go up one level
		const parentDir = dirname(currentDir);
		if (parentDir === currentDir) {
			// Reached filesystem root
			break;
		}
		currentDir = parentDir;
	}

	// Fallback: assume we're in src/ and repo root is one level up
	cachedRepoRoot = dirname(import.meta.dir);
	return cachedRepoRoot;
}

/**
 * Load a template file content.
 *
 * Works in both development mode (bun src/index.ts) and compiled binary mode.
 * Templates are embedded as TypeScript strings in templates-embedded.ts at build time.
 * In development mode, templates are also available from the filesystem.
 *
 * @param templateName - The template file path relative to repo root (e.g., "templates/hooks.json.tmpl")
 * @returns The template content as a string
 * @throws {Error} If the template cannot be found or read
 */
export async function loadTemplate(templateName: string): Promise<string> {
	// Try embedded template first (works in compiled binary and development)
	const embeddedName = TEMPLATE_PATH_TO_NAME[templateName];
	if (embeddedName && embeddedName in EMBEDDED_TEMPLATES) {
		return EMBEDDED_TEMPLATES[embeddedName];
	}

	// Fall back to filesystem (works in development and test modes)
	const repoRoot = await findRepoRoot();
	const filesystemPath = join(repoRoot, templateName);
	const file = Bun.file(filesystemPath);
	const exists = await file.exists();

	if (!exists) {
		throw new Error(
			`Template not found: ${templateName}. Tried embedded templates and filesystem path: ${filesystemPath}`,
		);
	}

	return await file.text();
}

/**
 * Get the absolute path to a template file (filesystem mode only).
 *
 * Use this when you need the path rather than the content.
 * Note: This only works in development mode. For compiled binaries,
 * use loadTemplate() instead to get the content directly.
 *
 * @param templateName - The template file path relative to repo root
 * @returns The absolute filesystem path to the template
 */
export async function getTemplatePath(templateName: string): Promise<string> {
	const repoRoot = await findRepoRoot();
	return join(repoRoot, templateName);
}

/**
 * Check if a template exists.
 *
 * Checks both embedded templates and filesystem locations.
 *
 * @param templateName - The template file path relative to repo root
 * @returns true if the template exists in either location
 */
export async function templateExists(templateName: string): Promise<boolean> {
	// Check embedded first
	const embeddedName = TEMPLATE_PATH_TO_NAME[templateName];
	if (embeddedName && embeddedName in EMBEDDED_TEMPLATES) {
		return true;
	}

	// Check filesystem using robust repo root detection
	const repoRoot = await findRepoRoot();
	const filesystemPath = join(repoRoot, templateName);
	const file = Bun.file(filesystemPath);
	return await file.exists();
}
