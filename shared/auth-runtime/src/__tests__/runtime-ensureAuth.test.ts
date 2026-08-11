import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  _setDiscoveryForTest,
  clearDiscoveryCache,
} from "../shared/discovery.js";

// Module-level mocks — installed via vi.mock before importing the runtime.
const attemptFedCMMock = vi.fn();
const startRedirectMock = vi.fn();

vi.mock("../shared/fedcm.js", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    isFedCMSupported: () => true,
    attemptFedCM: (...args: unknown[]) => attemptFedCMMock(...args),
  };
});

vi.mock("../oauth-redirect.js", () => ({
  startRedirect: (...args: unknown[]) => startRedirectMock(...args),
  completeRedirect: vi.fn(),
}));

// Import after mocks are registered.
import { createAuthRuntime } from "../runtime.js";

function waitForState(
  rt: ReturnType<typeof createAuthRuntime>,
  target: string,
): Promise<void> {
  return new Promise<void>((resolve) => {
    const off = rt.onAuthStateChange((s) => {
      if (s === target) {
        off();
        resolve();
      }
    });
  });
}

beforeEach(() => {
  clearDiscoveryCache();
  _setDiscoveryForTest("https://i", {
    issuer: "https://i",
    authorization_endpoint: "https://i/auth",
    token_endpoint: "https://i/token",
    dpop_signing_alg_values_supported: ["ES256"],
  });
  globalThis.fetch = vi.fn();
  attemptFedCMMock.mockReset();
  startRedirectMock.mockReset();
  // startRedirect normally never resolves (page navigates away). We
  // resolve with undefined so the await in ensureAuthenticated returns.
  startRedirectMock.mockResolvedValue(undefined);
});

afterEach(() => {
  try {
    delete (globalThis as unknown as { IdentityCredential?: unknown })
      .IdentityCredential;
  } catch {
    /* ignore */
  }
  if ((navigator as unknown as { credentials?: unknown }).credentials) {
    try {
      delete (navigator as unknown as { credentials?: unknown }).credentials;
    } catch {
      /* ignore */
    }
  }
});

describe("ensureAuthenticated() active-mode + redirect fallback", () => {
  it("first attempt uses active mode", async () => {
    attemptFedCMMock.mockResolvedValue({ kind: "dismissed" });

    const rt = createAuthRuntime({
      clientId: "c",
      idpBaseUrl: "https://i",
      apiBaseUrl: "https://a",
    });
    await waitForState(rt, "unauthenticated");

    await rt.ensureAuthenticated();

    const activeCall = attemptFedCMMock.mock.calls.find(
      (call) => call[1]?.mode === "active" && call[1]?.mediation === "optional",
    );
    expect(activeCall).toBeDefined();
    expect(startRedirectMock).toHaveBeenCalled();
    rt.destroy();
  });

  it("falls through to redirect on no-session (with or without loginUrl)", async () => {
    attemptFedCMMock.mockResolvedValue({
      kind: "no-session",
      loginUrl: "https://i/login",
    });

    const rt = createAuthRuntime({
      clientId: "c",
      idpBaseUrl: "https://i",
      apiBaseUrl: "https://a",
    });
    await waitForState(rt, "unauthenticated");

    await rt.ensureAuthenticated();
    // The redirect handles "needs login" server-side — we no longer
    // open a separate IdP-login popup.
    expect(startRedirectMock).toHaveBeenCalled();
    rt.destroy();
  });

  it("on aborted outcome (user dismissed FedCM in active mode), throws OAUTH_FAILED and skips redirect", async () => {
    attemptFedCMMock.mockResolvedValue({ kind: "aborted" });

    const rt = createAuthRuntime({
      clientId: "c",
      idpBaseUrl: "https://i",
      apiBaseUrl: "https://a",
    });
    await waitForState(rt, "unauthenticated");

    await expect(rt.ensureAuthenticated()).rejects.toMatchObject({
      code: "OAUTH_FAILED",
    });
    expect(startRedirectMock).not.toHaveBeenCalled();
    rt.destroy();
  });

  it("on any non-token FedCM outcome, falls through to redirect", async () => {
    attemptFedCMMock.mockResolvedValue({ kind: "unsupported" });

    const rt = createAuthRuntime({
      clientId: "c",
      idpBaseUrl: "https://i",
      apiBaseUrl: "https://a",
    });
    await waitForState(rt, "unauthenticated");

    await rt.ensureAuthenticated();
    expect(startRedirectMock).toHaveBeenCalled();
    rt.destroy();
  });
});

describe("onFedcmEvent telemetry", () => {
  it("fires attempt+outcome events during ensureAuthenticated", async () => {
    attemptFedCMMock.mockResolvedValue({ kind: "dismissed" });

    const rt = createAuthRuntime({
      clientId: "c",
      idpBaseUrl: "https://i",
      apiBaseUrl: "https://a",
    });
    await waitForState(rt, "unauthenticated");
    const events: unknown[] = [];
    rt.onFedcmEvent((e) => events.push(e));

    await rt.ensureAuthenticated();

    expect(
      events.some(
        (e) =>
          (e as { type?: string; mediation?: string; mode?: string }).type ===
            "attempt" &&
          (e as { mediation?: string }).mediation === "optional" &&
          (e as { mode?: string }).mode === "active",
      ),
    ).toBe(true);
    expect(
      events.some(
        (e) =>
          (e as { type?: string; outcome?: { kind?: string } }).type ===
            "outcome" &&
          (e as { outcome?: { kind?: string } }).outcome?.kind === "dismissed",
      ),
    ).toBe(true);
    rt.destroy();
  });

  it("unsubscribe stops future events", async () => {
    attemptFedCMMock.mockResolvedValue({ kind: "dismissed" });

    const rt = createAuthRuntime({
      clientId: "c",
      idpBaseUrl: "https://i",
      apiBaseUrl: "https://a",
    });
    await waitForState(rt, "unauthenticated");
    const cb = vi.fn();
    const off = rt.onFedcmEvent(cb);
    off();
    await rt.ensureAuthenticated();
    expect(cb).not.toHaveBeenCalled();
    rt.destroy();
  });

  it("fires disconnected event on logout", async () => {
    const disconnect = vi.fn().mockResolvedValue(undefined);
    (
      globalThis as unknown as {
        IdentityCredential: { disconnect: typeof disconnect };
      }
    ).IdentityCredential = { disconnect };
    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: {
        preventSilentAccess: vi.fn().mockResolvedValue(undefined),
        get: vi.fn(),
      },
    });
    const rt = createAuthRuntime({
      clientId: "c",
      idpBaseUrl: "https://i",
      apiBaseUrl: "https://a",
      skipFedCM: true,
    });
    await waitForState(rt, "unauthenticated");
    const events: Array<{ type: string }> = [];
    rt.onFedcmEvent((e) => events.push(e as { type: string }));
    await rt.logout();
    expect(events.some((e) => e.type === "disconnected")).toBe(true);
    rt.destroy();
  });
});
