// shared/auth-runtime/src/__tests__/worker/token-exchange.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { exchangeCode, refreshTokens } from "../../worker/token-exchange.js";
import { _setDiscoveryForTest, clearDiscoveryCache } from "../../shared/discovery.js";
import { generateDpopKey } from "../../worker/crypto.js";
import { makeDpopContext } from "../../worker/dpop.js";

const cfg = {
  clientId: "c", idpBaseUrl: "https://i", apiBaseUrl: "https://a",
  redirectUri: "https://r/cb", scopes: ["openid","offline_access"],
  fedcmBaseUrl: "https://i",
  fedcmConfigUrl: "/.well-known/web-identity", skipFedCM: false,
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

describe("exchangeCode", () => {
  it("POSTs to token endpoint with DPoP header when supported", async () => {
    (globalThis.fetch as any).mockResolvedValue(new Response(JSON.stringify({
      access_token: "at", refresh_token: "rt", expires_in: 300, token_type: "DPoP"
    }), { status: 200 }));
    const ctx = await makeDpopContext(await generateDpopKey());
    const r = await exchangeCode(cfg as any, ctx, { code: "c", verifier: "v" });
    expect(r.accessToken).toBe("at");
    expect(r.refreshToken).toBe("rt");
    const call = (globalThis.fetch as any).mock.calls[0];
    expect(call[1].headers.DPoP).toBeTypeOf("string");
  });

  it("retries once on DPoP-Nonce challenge", async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce(new Response(null, { status: 401, headers: { "dpop-nonce": "nn" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "at", refresh_token: "rt", expires_in: 300, token_type: "DPoP"
      }), { status: 200 }));
    const ctx = await makeDpopContext(await generateDpopKey());
    const r = await exchangeCode(cfg as any, ctx, { code: "c", verifier: "v" });
    expect(r.accessToken).toBe("at");
    expect((globalThis.fetch as any).mock.calls.length).toBe(2);
  });
});

describe("refreshTokens", () => {
  it("returns ROTATED on 200", async () => {
    (globalThis.fetch as any).mockResolvedValue(new Response(JSON.stringify({
      access_token: "at2", refresh_token: "rt2", expires_in: 300, token_type: "DPoP"
    }), { status: 200 }));
    const ctx = await makeDpopContext(await generateDpopKey());
    const r = await refreshTokens(cfg as any, ctx, "rt1");
    expect(r.outcome).toBe("rotated");
    if (r.outcome === "rotated") expect(r.tokens.refreshToken).toBe("rt2");
  });

  it("returns REUSE_DETECTED on invalid_grant", async () => {
    (globalThis.fetch as any).mockResolvedValue(new Response(JSON.stringify({
      error: "invalid_grant", error_description: "refresh token reuse detected"
    }), { status: 400 }));
    const ctx = await makeDpopContext(await generateDpopKey());
    const r = await refreshTokens(cfg as any, ctx, "rt1");
    expect(r.outcome).toBe("reuse_detected");
  });
});
