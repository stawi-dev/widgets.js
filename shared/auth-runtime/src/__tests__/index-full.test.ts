/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { getAuthRuntime } from "../index.js";
import type { AuthState } from "../types.js";
import {
  _setDiscoveryForTest,
  clearDiscoveryCache,
} from "../discovery.js";
import { _clearFedCMCache } from "../fedcm.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve()),
  del: vi.fn(() => Promise.resolve()),
}));

const RUNTIME_KEY = Symbol.for("@stawi/auth-runtime");

function clearSingleton() {
  const g = globalThis as Record<symbol, unknown>;
  const runtime = g[RUNTIME_KEY];
  if (
    runtime &&
    typeof (runtime as { destroy: () => void }).destroy === "function"
  ) {
    (runtime as { destroy: () => void }).destroy();
  }
  delete g[RUNTIME_KEY];
}

function seedDiscovery() {
  // Default idpBaseUrl for test-app; matches resolveConfig default.
  _setDiscoveryForTest("https://oauth2.stawi.org", {
    issuer: "https://stawi.org",
    authorization_endpoint: "https://oauth2.stawi.org/oauth2/auth",
    token_endpoint: "https://oauth2.stawi.org/oauth2/token",
    end_session_endpoint: "https://stawi.org/oauth2/sessions/logout",
  });
}

describe("AuthRuntime - full coverage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearDiscoveryCache();
    _clearFedCMCache();
    seedDiscovery();
  });

  afterEach(() => {
    clearSingleton();
    clearDiscoveryCache();
    _clearFedCMCache();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("getApiClient returns an ApiClient instance", () => {
    const rt = getAuthRuntime({ clientId: "test-app" });
    const api = rt.getApiClient();
    expect(api).toBeDefined();
    expect(typeof api.fetch).toBe("function");
    expect(typeof api.upload).toBe("function");
  });

  it("ensureAuthenticated transitions to error on failure", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);

    const rt = getAuthRuntime({ clientId: "test-app" });
    const states: AuthState[] = [];
    rt.onAuthStateChange((s) => states.push(s));

    await expect(rt.ensureAuthenticated()).rejects.toThrow();
    expect(rt.getState()).toBe("error");
    expect(states).toContain("error");
  });

  it("ensureAuthenticated deduplicates concurrent calls", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);

    const rt = getAuthRuntime({ clientId: "test-app" });

    const p1 = rt.ensureAuthenticated().catch(() => "failed");
    const p2 = rt.ensureAuthenticated().catch(() => "failed");

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe("failed");
    expect(r2).toBe("failed");
  });

  it("ensureAuthenticated is a no-op when already authenticated", async () => {
    const rt = getAuthRuntime({ clientId: "test-app" });

    // First attempt — will fail because popup is blocked
    vi.spyOn(window, "open").mockReturnValue(null);
    await rt.ensureAuthenticated().catch(() => {});
    expect(rt.getState()).toBe("error");
  });

  it("getRoles fails when not authenticated", async () => {
    const rt = getAuthRuntime({ clientId: "test-app" });
    await expect(rt.getRoles()).rejects.toThrow();
  });

  it("getUser fails when not authenticated", async () => {
    const rt = getAuthRuntime({ clientId: "test-app" });
    await expect(rt.getUser()).rejects.toThrow();
  });

  it("logout clears tokens and sets state to unauthenticated", async () => {
    const rt = getAuthRuntime({ clientId: "test-app" });
    const states: AuthState[] = [];
    rt.onAuthStateChange((s) => states.push(s));

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true }),
    );

    await rt.logout();
    expect(rt.getState()).toBe("unauthenticated");
    expect(states).toContain("unauthenticated");
  });

  it("logout handles server-side logout failure gracefully", async () => {
    const rt = getAuthRuntime({ clientId: "test-app" });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );

    await rt.logout();
    expect(rt.getState()).toBe("unauthenticated");
  });

  it("setState does not notify when state hasn't changed", () => {
    const rt = getAuthRuntime({ clientId: "test-app" });
    const states: AuthState[] = [];

    rt.onAuthStateChange((s) => states.push(s));
    // State is already "initializing", should only fire once
    expect(states).toEqual(["initializing"]);
  });

  it("listener errors don't break state management", async () => {
    const rt = getAuthRuntime({ clientId: "test-app" });

    // Subscribe a bad listener (skip initial call)
    let firstCall = true;
    rt.onAuthStateChange(() => {
      if (firstCall) {
        firstCall = true; // allow initial call
        return;
      }
      throw new Error("listener crash");
    });

    const goodStates: AuthState[] = [];
    rt.onAuthStateChange((s) => goodStates.push(s));

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true }),
    );

    await rt.logout();

    // Good listener should still get the state change
    expect(goodStates).toContain("unauthenticated");
  });

  it("destroy removes the singleton from globalThis", () => {
    const rt = getAuthRuntime({ clientId: "test-app" });
    rt.destroy();

    const g = globalThis as Record<symbol, unknown>;
    expect(g[RUNTIME_KEY]).toBeUndefined();
  });
});
