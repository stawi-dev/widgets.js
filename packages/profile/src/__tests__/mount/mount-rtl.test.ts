import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "../../index.js";

// Stub out createAuthRuntime so mount doesn't try to do real network/worker
// work inside jsdom.
vi.mock("@stawi/auth-runtime", async () => {
  const actual = await vi.importActual<typeof import("@stawi/auth-runtime")>(
    "@stawi/auth-runtime",
  );
  return {
    ...actual,
    createAuthRuntime: vi.fn(() => ({
      version: "test",
      getState: () => "unauthenticated" as const,
      onAuthStateChange: (cb: (s: "unauthenticated") => void) => {
        cb("unauthenticated");
        return () => {};
      },
      onSecurityEvent: () => () => {},
      ensureAuthenticated: vi.fn(),
      logout: vi.fn(),
      fetch: vi.fn(),
      upload: vi.fn(),
      getRoles: vi.fn().mockResolvedValue([]),
      getClaims: vi.fn().mockResolvedValue({}),
      prefetchDiscovery: vi.fn(),
      destroy: vi.fn(),
    })),
  };
});

describe("mount RTL", () => {
  beforeEach(() => {
    // Clear out any previously-mounted hosts so each test starts clean.
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("sets dir=rtl on host when locale is Arabic", () => {
    const handle = mount({ installationId: "x", locale: "ar" });
    const host = document.querySelector("[data-antinvestor-profile]");
    expect(host).toBeTruthy();
    expect(host?.getAttribute("dir")).toBe("rtl");
    handle.unmount();
  });

  it("does not set dir attribute for LTR locales", () => {
    const handle = mount({ installationId: "x", locale: "en" });
    const host = document.querySelector("[data-antinvestor-profile]");
    expect(host?.getAttribute("dir")).toBeNull();
    handle.unmount();
  });

  it("sets dir=rtl for Hebrew (he)", () => {
    const handle = mount({ installationId: "x", locale: "he-IL" });
    const host = document.querySelector("[data-antinvestor-profile]");
    expect(host?.getAttribute("dir")).toBe("rtl");
    handle.unmount();
  });
});
