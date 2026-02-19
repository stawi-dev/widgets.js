import { describe, it, expect, vi, beforeEach } from "vitest";

describe("bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("logs error when script tag has no data-installation-id", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // Simulate script tag without data-installation-id
    Object.defineProperty(document, "currentScript", {
      value: document.createElement("script"),
      writable: true,
      configurable: true,
    });

    await import("../bootstrap.js");

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("data-installation-id"),
    );
    errorSpy.mockRestore();
  });
});
