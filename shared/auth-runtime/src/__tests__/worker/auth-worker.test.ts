import { describe, it, expect, vi, beforeEach } from "vitest";
import { createWorkerCore } from "../../worker/auth-worker.js";
import { _setDiscoveryForTest, clearDiscoveryCache } from "../../shared/discovery.js";

const cfg = {
  clientId: "c", idpBaseUrl: "https://i", apiBaseUrl: "https://a",
  redirectUri: "https://r/cb", scopes: ["openid","offline_access"],
  fedcmConfigUrl: "/.well-known/web-identity", skipFedCM: true,
  timeouts: { discovery: 1000, token: 1000, api: 1000, upload: 1000 },
};

beforeEach(() => {
  clearDiscoveryCache();
  _setDiscoveryForTest("https://i", {
    issuer: "https://i", authorization_endpoint: "https://i/auth", token_endpoint: "https://i/token",
    dpop_signing_alg_values_supported: ["ES256"],
  });
  globalThis.fetch = vi.fn();
  // Reset fake-indexeddb between tests; createWorkerCore loads the prior
  // session on init now that keys round-trip, so without this each test
  // starts in the previous test's authenticated state.
  const idb = (globalThis as unknown as { indexedDB?: { _databases?: Map<unknown, unknown> } }).indexedDB;
  if (idb?._databases) idb._databases = new Map();
});

describe("worker core", () => {
  it("initializes to unauthenticated with no stored session", async () => {
    const core = await createWorkerCore(cfg as any);
    expect(core.state).toBe("unauthenticated");
  });

  it("prepare-auth returns a valid authorization URL and records verifier", async () => {
    const core = await createWorkerCore(cfg as any);
    const { authUrl, state, verifier } = await core.prepareAuth();
    const u = new URL(authUrl);
    expect(u.origin).toBe("https://i");
    expect(u.pathname).toBe("/auth");
    expect(u.searchParams.get("client_id")).toBe("c");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(state).toBeTypeOf("string");
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("getClaims throws TOKEN_EXPIRED when unauthenticated", async () => {
    const core = await createWorkerCore(cfg as any);
    await expect(core.getClaims()).rejects.toMatchObject({ code: "TOKEN_EXPIRED" });
  });

  it("completeFedcm throws FEDCM_NONCE_MISMATCH when claim doesn't match expected", async () => {
    const core = await createWorkerCore(cfg as any);
    // Build a fake id_token with iss matching cfg and a specific nonce claim.
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ iss: "https://i", aud: "c", sub: "u", nonce: "token-nonce" }),
    ).toString("base64url");
    const token = `${header}.${payload}.sig`;
    await expect(core.completeFedcm(token, "different-nonce")).rejects.toMatchObject({
      code: "FEDCM_NONCE_MISMATCH",
    });
  });

  it("completeAuth exchanges code, persists tokens, transitions to authenticated", async () => {
    // Mocking the token endpoint response is sufficient — the worker
    // generates DPoP key + wrap key internally and we don't pin those.
    (globalThis.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "at-1",
          refresh_token: "rt-1",
          expires_in: 300,
          token_type: "DPoP",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const core = await createWorkerCore(cfg as any);
    expect(core.state).toBe("unauthenticated");

    const states: string[] = [];
    core.onState((s) => { states.push(s); });

    const { state, verifier } = await core.prepareAuth();
    await core.completeAuth({ code: "the-code", state, verifier, expectedState: state });

    expect(core.state).toBe("authenticated");
    expect(states).toContain("authenticated");

    // After auth, getClaims/getRoles work against the JWT we just stored.
    // The "access token" we fed in isn't a real JWT, so decodeJwtPayload
    // throws — getRoles swallows that and returns []. That branch is
    // useful to cover.
    await expect(core.getRoles()).resolves.toEqual([]);
  });

  it("completeAuth throws OAUTH_STATE_MISMATCH when callback state differs from expected", async () => {
    const core = await createWorkerCore(cfg as any);
    await expect(
      core.completeAuth({ code: "c", state: "wrong", verifier: "v", expectedState: "expected" }),
    ).rejects.toMatchObject({ code: "OAUTH_STATE_MISMATCH" });
    expect(core.state).toBe("unauthenticated");
  });

  it("logout hits end_session + revocation endpoints when discovery advertises them", async () => {
    // Override the discovery for this test with both optional endpoints.
    clearDiscoveryCache();
    _setDiscoveryForTest("https://i", {
      issuer: "https://i",
      authorization_endpoint: "https://i/auth",
      token_endpoint: "https://i/token",
      end_session_endpoint: "https://i/logout",
      revocation_endpoint: "https://i/revoke",
      dpop_signing_alg_values_supported: ["ES256"],
    } as any);
    // First fetch: token exchange. Subsequent fetches: end_session and
    // revocation, both 200 (we don't care about response shape).
    const f = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "at-2", refresh_token: "rt-2", expires_in: 300, token_type: "DPoP",
        id_token: Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url") + "." +
                  Buffer.from(JSON.stringify({ iss: "https://i", aud: "c", sub: "u" })).toString("base64url") +
                  ".sig",
      }), { status: 200 }))
      .mockResolvedValue(new Response("{}", { status: 200 }));
    globalThis.fetch = f as any;

    const core = await createWorkerCore(cfg as any);
    const { state, verifier } = await core.prepareAuth();
    await core.completeAuth({ code: "the-code", state, verifier, expectedState: state });
    expect(core.state).toBe("authenticated");

    await core.logout();
    expect(core.state).toBe("unauthenticated");

    const urls = f.mock.calls.map((c) => c[0] as string);
    expect(urls).toContain("https://i/logout");
    expect(urls).toContain("https://i/revoke");
  });
});
