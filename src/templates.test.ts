import { describe, expect, test } from "bun:test";
import { getTemplatePath, loadTemplate, TEMPLATE_FILES, templateExists } from "./templates.ts";

describe("templates", () => {
	describe("TEMPLATE_FILES", () => {
		test("defines expected template paths", () => {
			expect(TEMPLATE_FILES.HOOKS).toBe("templates/hooks.json.tmpl");
			expect(TEMPLATE_FILES.OVERLAY).toBe("templates/overlay.md.tmpl");
		});
	});

	describe("loadTemplate", () => {
		test("loads hooks template successfully", async () => {
			const content = await loadTemplate(TEMPLATE_FILES.HOOKS);
			expect(content).toContain("{{AGENT_NAME}}");
			expect(content).toContain("PreToolUse");
		});

		test("loads overlay template successfully", async () => {
			const content = await loadTemplate(TEMPLATE_FILES.OVERLAY);
			expect(content).toContain("{{AGENT_NAME}}");
			expect(content).toContain("{{BEAD_ID}}");
		});

		test("throws for non-existent template", async () => {
			await expect(loadTemplate("nonexistent.tmpl")).rejects.toThrow("Template not found");
		});
	});

	describe("templateExists", () => {
		test("returns true for hooks template", async () => {
			const exists = await templateExists(TEMPLATE_FILES.HOOKS);
			expect(exists).toBe(true);
		});

		test("returns true for overlay template", async () => {
			const exists = await templateExists(TEMPLATE_FILES.OVERLAY);
			expect(exists).toBe(true);
		});

		test("returns false for non-existent template", async () => {
			const exists = await templateExists("nonexistent.tmpl");
			expect(exists).toBe(false);
		});
	});

	describe("getTemplatePath", () => {
		test("returns absolute path for hooks template", async () => {
			const path = await getTemplatePath(TEMPLATE_FILES.HOOKS);
			expect(path).toContain("templates/hooks.json.tmpl");
		});

		test("returns absolute path for overlay template", async () => {
			const path = await getTemplatePath(TEMPLATE_FILES.OVERLAY);
			expect(path).toContain("templates/overlay.md.tmpl");
		});
	});
});
