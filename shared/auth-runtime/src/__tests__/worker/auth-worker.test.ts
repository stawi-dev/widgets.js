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
});
