import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the mount function
const mockMount = vi.fn(() => ({ unmount: vi.fn() }));
vi.mock("../index.js", () => ({
  mount: (...args: unknown[]) => mockMount(...args),
}));

describe("bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    mockMount.mockClear();
  });

  it("does nothing when no currentScript", async () => {
    Object.defineProperty(document, "currentScript", {
      value: null,
      writable: true,
      configurable: true,
    });

    await import("../bootstrap.js");
    expect(mockMount).not.toHaveBeenCalled();
  });

  it("mounts with all data attributes when DOM is ready", async () => {
    const script = document.createElement("script");
    script.setAttribute("data-installation-id", "inst-1");
    script.setAttribute("data-client-id", "client-1");
    script.setAttribute("data-idp-base-url", "https://idp.example.com");
    script.setAttribute("data-api-base-url", "https://api.example.com");
    script.setAttribute(
      "data-logout-redirect-uri",
      "https://app.example.com/account",
    );
    script.setAttribute("data-theme", "dark");
    script.setAttribute("data-admin-panel-url", "https://admin.example.com");

    Object.defineProperty(document, "currentScript", {
      value: script,
      writable: true,
      configurable: true,
    });

    // readyState is already "complete" in jsdom
    await import("../bootstrap.js");

    expect(mockMount).toHaveBeenCalledWith(
      expect.objectContaining({
        installationId: "inst-1",
        clientId: "client-1",
        idpBaseUrl: "https://idp.example.com",
        apiBaseUrl: "https://api.example.com",
        logoutRedirectUri: "https://app.example.com/account",
        theme: "dark",
        adminPanelUrl: "https://admin.example.com",
      }),
    );
  });

  it("uses defaults for missing optional attributes", async () => {
    const script = document.createElement("script");
    script.setAttribute("data-installation-id", "inst-2");

    Object.defineProperty(document, "currentScript", {
      value: script,
      writable: true,
      configurable: true,
    });

    await import("../bootstrap.js");

    expect(mockMount).toHaveBeenCalledWith(
      expect.objectContaining({
        installationId: "inst-2",
        clientId: undefined,
        theme: "auto",
      }),
    );
  });
});
