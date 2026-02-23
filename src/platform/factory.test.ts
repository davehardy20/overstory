import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
	AUTO_PLATFORM_TYPES,
	createPlatform,
	detectAvailablePlatforms,
	detectBestPlatform,
	detectPlatform,
	getPlatformSummary,
	isPlatformTypeAvailable,
} from "./factory.ts";
import type { PlatformType } from "./types.ts";

// Mock the utils module
const mockFindPlatformBinary = mock<(platform: PlatformType) => string | null>();
const mockIsPlatformAvailable = mock<(platform: PlatformType) => boolean>();

mock.module("./utils.ts", () => ({
	findPlatformBinary: mockFindPlatformBinary,
	isPlatformAvailable: mockIsPlatformAvailable,
}));

describe("factory", () => {
	beforeEach(() => {
		mockFindPlatformBinary.mockClear();
		mockIsPlatformAvailable.mockClear();
	});

	afterEach(() => {
		mockFindPlatformBinary.mockReset();
		mockIsPlatformAvailable.mockReset();
	});

	describe("AUTO_PLATFORM_TYPES", () => {
		it("should contain all platform types including auto", () => {
			expect(AUTO_PLATFORM_TYPES).toContain("opencode");
			expect(AUTO_PLATFORM_TYPES).toContain("auto");
			expect(AUTO_PLATFORM_TYPES).toHaveLength(2);
		});
	});

	describe("detectPlatform", () => {
		it("should return detection result when binary is found", async () => {
			mockFindPlatformBinary.mockReturnValue("/usr/local/bin/opencode");

			const result = await detectPlatform("opencode");

			expect(result.platform).toBe("opencode");
			expect(result.binaryFound).toBe(true);
			expect(result.binaryPath).toBe("/usr/local/bin/opencode");
		});

		it("should return detection result when binary is not found", async () => {
			mockFindPlatformBinary.mockReturnValue(null);

			const result = await detectPlatform("opencode");

			expect(result.platform).toBe("opencode");
			expect(result.binaryFound).toBe(false);
			expect(result.binaryPath).toBeNull();
		});
	});

	describe("detectAvailablePlatforms", () => {
		it("should return map of all platform detection results", async () => {
			mockFindPlatformBinary.mockImplementation((platform: PlatformType) => {
				if (platform === "opencode") return "/usr/local/bin/opencode";
				return null;
			});

			const results = await detectAvailablePlatforms();

			expect(results.size).toBe(1);
			expect(results.get("opencode")?.binaryFound).toBe(true);
		});
	});

	describe("detectBestPlatform", () => {
		it("should return opencode when available", async () => {
			mockFindPlatformBinary.mockReturnValue("/usr/local/bin/opencode");

			const best = await detectBestPlatform();

			expect(best).toBe("opencode");
		});

		it("should throw error when no platform available", async () => {
			mockFindPlatformBinary.mockReturnValue(null);

			await expect(detectBestPlatform()).rejects.toThrow("No platform available");
		});
	});

	describe("createPlatform", () => {
		it("should throw error for unavailable opencode platform", async () => {
			mockIsPlatformAvailable.mockReturnValue(false);

			await expect(createPlatform("opencode")).rejects.toThrow(
				"Platform 'opencode' is not available",
			);
		});

		it("should throw error for auto mode when no platform available", async () => {
			mockFindPlatformBinary.mockReturnValue(null);

			await expect(createPlatform("auto")).rejects.toThrow("No platform available");
		});
	});

	describe("isPlatformTypeAvailable", () => {
		it("should return true when platform available", () => {
			mockIsPlatformAvailable.mockReturnValue(true);

			expect(isPlatformTypeAvailable("opencode")).toBe(true);
		});

		it("should return false when platform not available", () => {
			mockIsPlatformAvailable.mockReturnValue(false);

			expect(isPlatformTypeAvailable("opencode")).toBe(false);
		});
	});

	describe("getPlatformSummary", () => {
		it("should return summary when opencode available", async () => {
			mockIsPlatformAvailable.mockReturnValue(true);

			const summary = await getPlatformSummary();

			expect(summary.available).toContain("opencode");
			expect(summary.unavailable).toHaveLength(0);
			expect(summary.best).toBe("opencode");
		});

		it("should return summary with none available", async () => {
			mockIsPlatformAvailable.mockReturnValue(false);

			const summary = await getPlatformSummary();

			expect(summary.available).toHaveLength(0);
			expect(summary.unavailable).toContain("opencode");
			expect(summary.best).toBeNull();
		});
	});
});

describe("factory integration", () => {
	it("should detect best platform from real environment", async () => {
		// This test uses the actual environment
		// It should either return a platform or throw the expected error
		try {
			// Re-import to get fresh module state
			const { detectBestPlatform: realDetect } = await import(`./factory.ts?${Date.now()}`);
			const best = await realDetect();
			expect(best).toBe("opencode");
		} catch (error) {
			expect(error).toBeInstanceOf(Error);
			expect((error as Error).message).toContain("No platform available");
		}
	});
});
