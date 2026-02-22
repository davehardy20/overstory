import { dirname, join } from "node:path";

/**
 * Template file names used by overstory.
 * These are embedded at build time for compiled binary support.
 */
export const TEMPLATE_FILES = {
	HOOKS: "templates/hooks.json.tmpl",
	OVERLAY: "templates/overlay.md.tmpl",
} as const;

/**
 * Load a template file content.
 *
 * Works in both development mode (bun src/index.ts) and compiled binary mode.
 * In compiled mode, templates are embedded via --embed flag at build time.
 * In development mode, templates are read from the filesystem.
 *
 * @param templateName - The template file path relative to repo root (e.g., "templates/hooks.json.tmpl")
 * @returns The template content as a string
 * @throws {Error} If the template cannot be found or read
 */
export async function loadTemplate(templateName: string): Promise<string> {
	// Try embedded file first (works in compiled binary)
	// Bun.file() with a relative path resolves from the binary location for embedded files
	try {
		const embeddedFile = Bun.file(templateName);
		const exists = await embeddedFile.exists();
		if (exists) {
			return await embeddedFile.text();
		}
	} catch {
		// Fall through to filesystem lookup
	}

	// Fall back to filesystem (works in development mode)
	// import.meta.dir points to src/ in dev, so we go up one level to reach repo root
	const filesystemPath = join(dirname(import.meta.dir), "..", templateName);
	const file = Bun.file(filesystemPath);
	const exists = await file.exists();

	if (!exists) {
		throw new Error(
			`Template not found: ${templateName}. Tried embedded path and filesystem path: ${filesystemPath}`,
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
export function getTemplatePath(templateName: string): string {
	return join(dirname(import.meta.dir), "..", templateName);
}

/**
 * Check if a template exists.
 *
 * Checks both embedded (compiled binary) and filesystem (development) locations.
 *
 * @param templateName - The template file path relative to repo root
 * @returns true if the template exists in either location
 */
export async function templateExists(templateName: string): Promise<boolean> {
	// Check embedded first
	try {
		const embeddedFile = Bun.file(templateName);
		if (await embeddedFile.exists()) {
			return true;
		}
	} catch {
		// Fall through to filesystem check
	}

	// Check filesystem
	const filesystemPath = join(dirname(import.meta.dir), "..", templateName);
	const file = Bun.file(filesystemPath);
	return await file.exists();
}
