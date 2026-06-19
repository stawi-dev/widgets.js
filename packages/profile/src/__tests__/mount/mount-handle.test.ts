import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "../../index.js";
import { createAuthRuntime } from "@stawi/auth-runtime";
import { profileAuthScopes } from "../../auth-scopes.js";

// Stub createAuthRuntime so mount doesn't do real network/worker work.
// The stub exposes spies we can assert on.
const prefetchSpy = vi.fn().mockResolvedValue(undefined);
const destroySpy = vi.fn();
vi.mock("@stawi/auth-runtime", async () => {
  const actual = await vi.importActual<typeof import("@stawi/auth-runtime")>(
    "@stawi/auth-runtime",
  );
  return {
    ...actual,
    createAuthRuntime: vi.fn(() => ({
      version: "runtime-test",
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
      prefetchDiscovery: prefetchSpy,
      destroy: destroySpy,
    })),
  };
});

describe("MountHandle", () => {
  beforeEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    prefetchSpy.mockClear();
    destroySpy.mockClear();
    vi.mocked(createAuthRuntime).mockClear();
  });

  it("exposes a version string", () => {
    const handle = mount({ installationId: "x" });
    expect(typeof handle.version).toBe("string");
    expect(handle.version.length).toBeGreaterThan(0);
    handle.unmount();
  });

  it("getAuthState returns current runtime state", () => {
    const handle = mount({ installationId: "x" });
    expect(handle.getAuthState()).toBe("unauthenticated");
    handle.unmount();
  });

  it("prefetchDiscovery delegates to the runtime", async () => {
    const handle = mount({ installationId: "x" });
    await handle.prefetchDiscovery();
    expect(prefetchSpy).toHaveBeenCalledTimes(1);
    handle.unmount();
  });

  it("unmount destroys the runtime exactly once", () => {
    const handle = mount({ installationId: "x" });
    handle.unmount();
    expect(destroySpy).toHaveBeenCalledTimes(1);
  });

  it("creates owned runtime with OAuth scopes allowed by the profile client", () => {
    const handle = mount({ installationId: "inst-1", clientId: "client-1" });

    expect(createAuthRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "client-1",
        scopes: [...profileAuthScopes],
      }),
    );
    handle.unmount();
  });
});
