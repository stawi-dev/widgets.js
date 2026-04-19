import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMount = vi.fn(() => ({
  version: "test",
  getAuthState: () => "unauthenticated",
  prefetchDiscovery: vi.fn().mockResolvedValue(undefined),
  unmount: vi.fn(),
}));
vi.mock("../index.js", () => ({
  mount: (...args: unknown[]) => mockMount(...args),
}));

describe("bootstrap — new attributes", () => {
  beforeEach(() => {
    vi.resetModules();
    mockMount.mockClear();
  });

  it("parses data-tokens JSON and forwards as tokens", async () => {
    const script = document.createElement("script");
    script.setAttribute("data-installation-id", "inst-1");
    script.setAttribute(
      "data-tokens",
      JSON.stringify({ colorPrimary: "#ff0000", radius: "8px" }),
    );
    Object.defineProperty(document, "currentScript", {
      value: script,
      writable: true,
      configurable: true,
    });

    await import("../bootstrap.js");

    expect(mockMount).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: { colorPrimary: "#ff0000", radius: "8px" },
      }),
    );
  });

  it("logs error and ignores malformed data-tokens", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const script = document.createElement("script");
    script.setAttribute("data-installation-id", "inst-1");
    script.setAttribute("data-tokens", "{not-json");
    Object.defineProperty(document, "currentScript", {
      value: script,
      writable: true,
      configurable: true,
    });

    await import("../bootstrap.js");

    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("data-tokens"),
      expect.anything(),
    );
    expect(mockMount).toHaveBeenCalledWith(
      expect.objectContaining({ tokens: undefined }),
    );
    errSpy.mockRestore();
  });

  it("forwards data-locale passthrough", async () => {
    const script = document.createElement("script");
    script.setAttribute("data-installation-id", "inst-1");
    script.setAttribute("data-locale", "fr-FR");
    Object.defineProperty(document, "currentScript", {
      value: script,
      writable: true,
      configurable: true,
    });

    await import("../bootstrap.js");

    expect(mockMount).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "fr-FR" }),
    );
  });

  it("treats data-external-fonts presence as true and 'false' as false", async () => {
    // Presence
    const scriptT = document.createElement("script");
    scriptT.setAttribute("data-installation-id", "inst-1");
    scriptT.setAttribute("data-external-fonts", "");
    Object.defineProperty(document, "currentScript", {
      value: scriptT,
      writable: true,
      configurable: true,
    });
    await import("../bootstrap.js");
    expect(mockMount).toHaveBeenLastCalledWith(
      expect.objectContaining({ externalFonts: true }),
    );

    vi.resetModules();
    mockMount.mockClear();

    // Explicit "false"
    const scriptF = document.createElement("script");
    scriptF.setAttribute("data-installation-id", "inst-1");
    scriptF.setAttribute("data-external-fonts", "false");
    Object.defineProperty(document, "currentScript", {
      value: scriptF,
      writable: true,
      configurable: true,
    });
    await import("../bootstrap.js");
    expect(mockMount).toHaveBeenLastCalledWith(
      expect.objectContaining({ externalFonts: false }),
    );
  });

  it("treats data-gravatar presence as true", async () => {
    const script = document.createElement("script");
    script.setAttribute("data-installation-id", "inst-1");
    script.setAttribute("data-gravatar", "");
    Object.defineProperty(document, "currentScript", {
      value: script,
      writable: true,
      configurable: true,
    });

    await import("../bootstrap.js");

    expect(mockMount).toHaveBeenCalledWith(
      expect.objectContaining({ gravatar: true }),
    );
  });

  it("warns when document.currentScript is null", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    Object.defineProperty(document, "currentScript", {
      value: null,
      writable: true,
      configurable: true,
    });

    await import("../bootstrap.js");

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("currentScript is null"),
    );
    expect(mockMount).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
