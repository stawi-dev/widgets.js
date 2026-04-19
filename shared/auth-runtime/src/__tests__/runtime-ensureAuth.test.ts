import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { _setDiscoveryForTest, clearDiscoveryCache } from "../shared/discovery.js";

// Module-level mocks — installed via vi.mock before importing the runtime.
const attemptFedCMMock = vi.fn();
const openLoginUrlMock = vi.fn();
const runOAuthPopupMock = vi.fn();

vi.mock("../shared/fedcm.js", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    isFedCMSupported: () => true,
    attemptFedCM: (...args: unknown[]) => attemptFedCMMock(...args),
  };
});

vi.mock("../login-url.js", () => ({
  openLoginUrl: (...args: unknown[]) => openLoginUrlMock(...args),
}));

vi.mock("../oauth-popup.js", () => ({
  runOAuthPopup: (...args: unknown[]) => runOAuthPopupMock(...args),
}));

// Import after mocks are registered.
import { createAuthRuntime } from "../runtime.js";

function waitForState(rt: ReturnType<typeof createAuthRuntime>, target: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const off = rt.onAuthStateChange((s) => {
      if (s === target) { off(); resolve(); }
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
  openLoginUrlMock.mockReset();
  runOAuthPopupMock.mockReset();
});

afterEach(() => {
  try { delete (globalThis as unknown as { IdentityCredential?: unknown }).IdentityCredential; } catch { /* ignore */ }
  if ((navigator as unknown as { credentials?: unknown }).credentials) {
    try { delete (navigator as unknown as { credentials?: unknown }).credentials; } catch { /* ignore */ }
  }
});

describe("ensureAuthenticated() active-mode + login_url fallback", () => {
  it("first attempt uses active mode", async () => {
    // Return dismissed so we don't try to complete anything.
    attemptFedCMMock.mockResolvedValue({ kind: "dismissed" });
    runOAuthPopupMock.mockResolvedValue(undefined);

    const rt = createAuthRuntime({
      clientId: "c",
      idpBaseUrl: "https://i",
      apiBaseUrl: "https://a",
      // Note: don't set skipFedCM so the runtime actually calls attemptFedCM
    });
    await waitForState(rt, "unauthenticated");

    await rt.ensureAuthenticated();

    // Find the active-mode call (the passive idle probe uses mediation:"silent",mode:"passive").
    const activeCall = attemptFedCMMock.mock.calls.find(
      (call) => call[1]?.mode === "active" && call[1]?.mediation === "optional",
    );
    expect(activeCall).toBeDefined();
    // Fell through to popup since outcome was "dismissed".
    expect(runOAuthPopupMock).toHaveBeenCalled();
    rt.destroy();
  });

  it("idle probe uses mode:passive explicitly", async () => {
    attemptFedCMMock.mockResolvedValue({ kind: "not-allowed" });
    const rt = createAuthRuntime({
      clientId: "c",
      idpBaseUrl: "https://i",
      apiBaseUrl: "https://a",
    });
    await waitForState(rt, "unauthenticated");
    // Allow the idle probe setTimeout(run, 0) to execute
    await new Promise((r) => setTimeout(r, 20));

    const passiveCall = attemptFedCMMock.mock.calls.find(
      (call) => call[1]?.mediation === "silent",
    );
    expect(passiveCall).toBeDefined();
    expect(passiveCall?.[1]?.mode).toBe("passive");
    rt.destroy();
  });

  it("on no-session with loginUrl, opens login URL and retries FedCM once", async () => {
    // Dispatch by mediation so the idle probe (silent) and ensureAuthenticated
    // (optional → required) are handled independently.
    attemptFedCMMock.mockImplementation(async (_cfg: unknown, opts: { mediation: string }) => {
      if (opts.mediation === "silent") return { kind: "not-allowed" };
      if (opts.mediation === "optional") {
        return { kind: "no-session", loginUrl: "https://i/login" };
      }
      // "required" retry after login
      return { kind: "dismissed" };
    });
    openLoginUrlMock.mockResolvedValue(undefined);
    runOAuthPopupMock.mockResolvedValue(undefined);

    const rt = createAuthRuntime({
      clientId: "c",
      idpBaseUrl: "https://i",
      apiBaseUrl: "https://a",
    });
    await waitForState(rt, "unauthenticated");

    await rt.ensureAuthenticated();

    expect(openLoginUrlMock).toHaveBeenCalledWith(
      expect.objectContaining({ idpBaseUrl: "https://i" }),
      "https://i/login",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    // A retry with mediation:"required", mode:"active" must have fired.
    const retry = attemptFedCMMock.mock.calls.find(
      (call) => call[1]?.mediation === "required" && call[1]?.mode === "active",
    );
    expect(retry).toBeDefined();
    rt.destroy();
  });

  it("on aborted outcome, throws OAUTH_POPUP_CLOSED (user cancelled)", async () => {
    attemptFedCMMock.mockResolvedValue({ kind: "aborted" });
    const rt = createAuthRuntime({
      clientId: "c",
      idpBaseUrl: "https://i",
      apiBaseUrl: "https://a",
    });
    await waitForState(rt, "unauthenticated");

    await expect(rt.ensureAuthenticated()).rejects.toMatchObject({
      code: "OAUTH_POPUP_CLOSED",
    });
    expect(runOAuthPopupMock).not.toHaveBeenCalled();
    rt.destroy();
  });

  it("on no-session without loginUrl, falls through to OAuth popup", async () => {
    attemptFedCMMock.mockResolvedValue({ kind: "no-session" });
    runOAuthPopupMock.mockResolvedValue(undefined);

    const rt = createAuthRuntime({
      clientId: "c",
      idpBaseUrl: "https://i",
      apiBaseUrl: "https://a",
    });
    await waitForState(rt, "unauthenticated");

    await rt.ensureAuthenticated();
    expect(openLoginUrlMock).not.toHaveBeenCalled();
    expect(runOAuthPopupMock).toHaveBeenCalled();
    rt.destroy();
  });
});

describe("onFedcmEvent telemetry", () => {
  it("fires attempt+outcome events during ensureAuthenticated", async () => {
    attemptFedCMMock.mockResolvedValue({ kind: "dismissed" });
    runOAuthPopupMock.mockResolvedValue(undefined);

    const rt = createAuthRuntime({
      clientId: "c",
      idpBaseUrl: "https://i",
      apiBaseUrl: "https://a",
    });
    await waitForState(rt, "unauthenticated");
    const events: unknown[] = [];
    rt.onFedcmEvent((e) => events.push(e));

    await rt.ensureAuthenticated();

    // At minimum the attempt + outcome pair for the active call fires.
    expect(
      events.some(
        (e) =>
          (e as { type?: string; mediation?: string; mode?: string }).type === "attempt" &&
          (e as { mediation?: string }).mediation === "optional" &&
          (e as { mode?: string }).mode === "active",
      ),
    ).toBe(true);
    expect(
      events.some(
        (e) =>
          (e as { type?: string; outcome?: { kind?: string } }).type === "outcome" &&
          (e as { outcome?: { kind?: string } }).outcome?.kind === "dismissed",
      ),
    ).toBe(true);
    rt.destroy();
  });

  it("fires login-url-opened event when login_url fallback triggers", async () => {
    attemptFedCMMock.mockImplementation(async (_cfg: unknown, opts: { mediation: string }) => {
      if (opts.mediation === "silent") return { kind: "not-allowed" };
      if (opts.mediation === "optional") {
        return { kind: "no-session", loginUrl: "https://i/login" };
      }
      return { kind: "dismissed" };
    });
    openLoginUrlMock.mockResolvedValue(undefined);
    runOAuthPopupMock.mockResolvedValue(undefined);

    const rt = createAuthRuntime({
      clientId: "c",
      idpBaseUrl: "https://i",
      apiBaseUrl: "https://a",
    });
    await waitForState(rt, "unauthenticated");
    const events: Array<{ type: string; url?: string }> = [];
    rt.onFedcmEvent((e) => events.push(e as { type: string; url?: string }));

    await rt.ensureAuthenticated();
    expect(events.some((e) => e.type === "login-url-opened" && e.url === "https://i/login")).toBe(
      true,
    );
    rt.destroy();
  });

  it("unsubscribe stops future events", async () => {
    attemptFedCMMock.mockResolvedValue({ kind: "dismissed" });
    runOAuthPopupMock.mockResolvedValue(undefined);

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
    (globalThis as unknown as { IdentityCredential: { disconnect: typeof disconnect } }).IdentityCredential =
      { disconnect };
    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: { preventSilentAccess: vi.fn().mockResolvedValue(undefined), get: vi.fn() },
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
