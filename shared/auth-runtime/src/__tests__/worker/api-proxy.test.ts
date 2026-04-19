// shared/auth-runtime/src/__tests__/worker/api-proxy.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { proxyFetch } from "../../worker/api-proxy.js";
import { makeDpopContext } from "../../worker/dpop.js";
import { generateDpopKey } from "../../worker/crypto.js";

const cfg = {
  clientId: "c", idpBaseUrl: "https://i", apiBaseUrl: "https://a",
  redirectUri: "https://r/cb", scopes: [], fedcmConfigUrl: "/x", skipFedCM: true,
  timeouts: { discovery: 1000, token: 1000, api: 1000, upload: 1000 },
} as any;

beforeEach(() => { globalThis.fetch = vi.fn(); });

describe("proxyFetch", () => {
  it("attaches Authorization and DPoP when token type is DPoP", async () => {
    (globalThis.fetch as any).mockResolvedValue(new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
    const ctx = await makeDpopContext(await generateDpopKey());
    const onRefreshCalled = vi.fn();
    await proxyFetch(cfg, ctx, {
      accessToken: "at", tokenType: "DPoP",
      ensureFresh: async () => ({ accessToken: "at", tokenType: "DPoP" }),
      onRefresh: onRefreshCalled,
    }, { path: "/v1/me", method: "GET" });
    const call = (globalThis.fetch as any).mock.calls[0];
    expect(call[0]).toBe("https://a/v1/me");
    expect(call[1].headers.Authorization).toBe("DPoP at");
    expect(call[1].headers.DPoP).toBeTypeOf("string");
  });

  it("refreshes once and retries on 401", async () => {
    const ensureFresh = vi.fn()
      .mockResolvedValueOnce({ accessToken: "at1", tokenType: "Bearer" })
      .mockResolvedValueOnce({ accessToken: "at2", tokenType: "Bearer" });
    (globalThis.fetch as any)
      .mockResolvedValueOnce(new Response("no", { status: 401 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const ctx = await makeDpopContext(await generateDpopKey());
    const res = await proxyFetch(cfg, ctx, { accessToken: "at1", tokenType: "Bearer", ensureFresh, onRefresh: () => {} }, { path: "/x", method: "GET" });
    expect(res.status).toBe(200);
    expect(ensureFresh).toHaveBeenCalledTimes(2);
  });
});
