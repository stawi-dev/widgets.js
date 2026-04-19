import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createAuthRuntime } from "../runtime.js";
import { _setDiscoveryForTest, clearDiscoveryCache } from "../shared/discovery.js";
import { _resetProbeCache } from "../shared/fedcm.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function b64url(obj: unknown): string {
  const json = JSON.stringify(obj);
  return Buffer.from(json).toString("base64url");
}

function buildIdToken(payload: Record<string, unknown>): string {
  const header = b64url({ alg: "none", typ: "JWT" });
  const body = b64url(payload);
  return `${header}.${body}.sig`;
}

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

// -----------------------------------------------------------------------------
// Common test setup
// -----------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

function mockFetchForFedcm(loginUrl = "https://i/login") {
  // Any fetch call during these tests either (a) probes the FedCM config or
  // (b) does a token exchange. Route them with a URL matcher.
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.endsWith("/.well-known/web-identity")) {
      return new Response(JSON.stringify({ login_url: loginUrl }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/token")) {
      // Successful FedCM id_token exchange response.
      return new Response(
        JSON.stringify({
          access_token: "at",
          refresh_token: "rt",
          expires_in: 300,
          token_type: "Bearer",
          id_token: "id",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    // Default: unhandled → 404.
    void init;
    return new Response("not-found", { status: 404 });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

beforeEach(() => {
  clearDiscoveryCache();
  _resetProbeCache();
  _setDiscoveryForTest("https://i", {
    issuer: "https://i",
    authorization_endpoint: "https://i/auth",
    token_endpoint: "https://i/token",
    dpop_signing_alg_values_supported: ["ES256"],
  });
  globalThis.__TEST_FEDCM.reset();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.__TEST_FEDCM.reset();
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("runtime FedCM integration (polyfill-driven)", () => {
  it("performs a silent passive probe on mount", async () => {
    mockFetchForFedcm();
    globalThis.__TEST_FEDCM.handleGet = () => {
      // Return no credential (not-allowed for silent).
      const e = new Error("no silent session");
      e.name = "NotAllowedError";
      throw e;
    };

    const rt = createAuthRuntime({
      clientId: "c",
      idpBaseUrl: "https://i",
      apiBaseUrl: "https://a",
    });
    await waitForState(rt, "unauthenticated");
    // requestIdleCallback is absent in jsdom → runtime uses setTimeout(run, 0).
    // Give it a tick.
    await new Promise((r) => setTimeout(r, 20));

    const silentCall = globalThis.__TEST_FEDCM.calls.get.find(
      (c) => c.mediation === "silent",
    );
    expect(silentCall).toBeDefined();
    expect(silentCall?.mode).toBe("passive");
    rt.destroy();
  });

  it("drops the token silently if id_token nonce does not match expected", async () => {
    mockFetchForFedcm();

    // Any runtime.getRandomValues-derived nonce won't match "wrong".
    // handleGet returns a token whose nonce claim is "wrong".
    globalThis.__TEST_FEDCM.handleGet = () =>
      ({
        type: "identity",
        token: buildIdToken({
          iss: "https://i",
          aud: "c",
          sub: "u1",
          nonce: "wrong",
        }),
        isAutoSelected: false,
      });

    const rt = createAuthRuntime({
      clientId: "c",
      idpBaseUrl: "https://i",
      apiBaseUrl: "https://a",
    });
    await waitForState(rt, "unauthenticated");
    // Let the idle probe run.
    await new Promise((r) => setTimeout(r, 20));

    // The silent probe catches the nonce mismatch inside completeFedcm() and
    // discards it via .catch(() => {}). Therefore state remains
    // unauthenticated AND no token-exchange fetch to /token fires.
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const tokenExchangeCalls = fetchMock.mock.calls.filter(
      (call) => {
        const arg = call[0] as string | URL | Request;
        const s = typeof arg === "string" ? arg : arg instanceof URL ? arg.toString() : arg.url;
        return s.endsWith("/token");
      },
    );
    expect(tokenExchangeCalls.length).toBe(0);
    expect(rt.getState()).toBe("unauthenticated");
    rt.destroy();
  });

  it("logout invokes preventSilentAccess and IdentityCredential.disconnect", async () => {
    mockFetchForFedcm();
    // Silent probe returns NotAllowedError so nothing reaches authenticated.
    globalThis.__TEST_FEDCM.handleGet = () => {
      const e = new Error("silent denied");
      e.name = "NotAllowedError";
      throw e;
    };

    const rt = createAuthRuntime({
      clientId: "c",
      idpBaseUrl: "https://i",
      apiBaseUrl: "https://a",
    });
    await waitForState(rt, "unauthenticated");

    await rt.logout();

    expect(globalThis.__TEST_FEDCM.calls.preventSilentAccess).toBe(1);
    expect(globalThis.__TEST_FEDCM.calls.disconnect.length).toBe(1);
    expect(globalThis.__TEST_FEDCM.calls.disconnect[0]).toMatchObject({
      configURL: "https://i/.well-known/web-identity",
      clientId: "c",
    });
    rt.destroy();
  });

  it("onFedcmEvent fires probe → attempt → outcome in order for the idle probe", async () => {
    mockFetchForFedcm();
    globalThis.__TEST_FEDCM.handleGet = () => {
      const e = new Error("no silent session");
      e.name = "NotAllowedError";
      throw e;
    };

    const rt = createAuthRuntime({
      clientId: "c",
      idpBaseUrl: "https://i",
      apiBaseUrl: "https://a",
    });
    const events: Array<{ type: string; [k: string]: unknown }> = [];
    rt.onFedcmEvent((e) => events.push(e as { type: string }));

    await waitForState(rt, "unauthenticated");
    await new Promise((r) => setTimeout(r, 30));

    const types = events.map((e) => e.type);
    const probeIdx = types.indexOf("probe");
    const attemptIdx = types.indexOf("attempt");
    const outcomeIdx = types.indexOf("outcome");
    expect(probeIdx).toBeGreaterThanOrEqual(0);
    expect(attemptIdx).toBeGreaterThan(probeIdx);
    expect(outcomeIdx).toBeGreaterThan(attemptIdx);

    const probeEvent = events[probeIdx];
    expect(probeEvent).toMatchObject({ type: "probe", available: true, loginUrl: "https://i/login" });

    const attemptEvent = events[attemptIdx];
    expect(attemptEvent).toMatchObject({
      type: "attempt",
      mediation: "silent",
      mode: "passive",
    });

    const outcomeEvent = events[outcomeIdx];
    expect(outcomeEvent).toMatchObject({
      type: "outcome",
      outcome: { kind: "not-allowed" },
    });
    rt.destroy();
  });

  it("login_url fallback: NetworkError → open login popup → retry with mediation:required succeeds", async () => {
    mockFetchForFedcm("https://i/login");

    // Sequence:
    //   1. silent idle probe → NotAllowedError (ignored)
    //   2. optional/active (ensureAuthenticated) → NetworkError (→ no-session with loginUrl)
    //   3. required/active (after login_url popup) → token
    //
    // handleGet is state-driven by mediation so it survives the async interleaving.
    let nonceFromRequired: string | undefined;
    globalThis.__TEST_FEDCM.handleGet = (req) => {
      if (req.mediation === "silent") {
        const e = new Error("silent denied");
        e.name = "NotAllowedError";
        throw e;
      }
      if (req.mediation === "optional") {
        const e = new Error("no idp session");
        e.name = "NetworkError";
        throw e;
      }
      // mediation: "required"
      nonceFromRequired = (req.providers as Array<{ nonce?: string }>)[0]?.nonce;
      return {
        type: "identity",
        token: buildIdToken({
          iss: "https://i",
          aud: "c",
          sub: "u1",
          nonce: nonceFromRequired,
        }),
        isAutoSelected: false,
      };
    };

    // Stub window.open to simulate the IdP login popup completing.
    const popupClose = vi.fn();
    const fakePopup = { closed: false, close: popupClose };
    const openSpy = vi.fn(() => fakePopup);
    vi.stubGlobal("open", openSpy);

    const rt = createAuthRuntime({
      clientId: "c",
      idpBaseUrl: "https://i",
      apiBaseUrl: "https://a",
    });
    await waitForState(rt, "unauthenticated");

    const pending = rt.ensureAuthenticated();

    // Allow ensureAuthenticated to reach the point where openLoginUrl is
    // awaiting the postMessage.
    await new Promise((r) => setTimeout(r, 20));

    // Dispatch the postMessage the IdP would send on successful login.
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "stawi-login-complete" },
        origin: "https://i",
      }),
    );

    await pending;

    // The runtime must have called credentials.get with mediation:"required"
    // and received the token we returned.
    const requiredCall = globalThis.__TEST_FEDCM.calls.get.find(
      (c) => c.mediation === "required",
    );
    expect(requiredCall).toBeDefined();
    expect(requiredCall?.mode).toBe("active");
    expect(openSpy).toHaveBeenCalledWith(
      "https://i/login",
      "stawi-idp-login",
      expect.any(String),
    );
    expect(popupClose).toHaveBeenCalled();

    // Finally, authenticated state must be reached because the token
    // exchange was wired through.
    expect(rt.getState()).toBe("authenticated");

    rt.destroy();
    vi.unstubAllGlobals();
  });
});
