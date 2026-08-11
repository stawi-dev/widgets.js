// shared/auth-runtime/src/__tests__/worker/api-proxy.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { proxyFetch } from "../../worker/api-proxy.js";
import { makeDpopContext } from "../../worker/dpop.js";
import { generateDpopKey } from "../../worker/crypto.js";

const cfg = {
  clientId: "c",
  idpBaseUrl: "https://i",
  apiBaseUrl: "https://a",
  redirectUri: "https://r/cb",
  scopes: [],
  fedcmBaseUrl: "https://i",
  fedcmConfigUrl: "/x",
  skipFedCM: true,
  timeouts: { discovery: 1000, token: 1000, api: 1000, upload: 1000 },
} as any;

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

describe("proxyFetch", () => {
  it("attaches Authorization and DPoP when token type is DPoP", async () => {
    (globalThis.fetch as any).mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const ctx = await makeDpopContext(await generateDpopKey());
    const onRefreshCalled = vi.fn();
    await proxyFetch(
      cfg,
      ctx,
      {
        accessToken: "at",
        tokenType: "DPoP",
        ensureFresh: async () => ({ accessToken: "at", tokenType: "DPoP" }),
        onRefresh: onRefreshCalled,
      },
      { path: "/v1/me", method: "GET" },
    );
    const call = (globalThis.fetch as any).mock.calls[0];
    expect(call[0]).toBe("https://a/v1/me");
    expect(call[1].headers.Authorization).toBe("DPoP at");
    expect(call[1].headers.DPoP).toBeTypeOf("string");
  });

  it("refreshes once and retries on 401", async () => {
    const ensureFresh = vi
      .fn()
      .mockResolvedValueOnce({ accessToken: "at1", tokenType: "Bearer" })
      .mockResolvedValueOnce({ accessToken: "at2", tokenType: "Bearer" });
    (globalThis.fetch as any)
      .mockResolvedValueOnce(new Response("no", { status: 401 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const ctx = await makeDpopContext(await generateDpopKey());
    const res = await proxyFetch(
      cfg,
      ctx,
      {
        accessToken: "at1",
        tokenType: "Bearer",
        ensureFresh,
        onRefresh: () => {},
      },
      { path: "/x", method: "GET" },
    );
    expect(res.status).toBe(200);
    expect(ensureFresh).toHaveBeenCalledTimes(2);
  });

  it("retries on 401 with DPoP-Nonce header before forcing a refresh", async () => {
    const ensureFresh = vi
      .fn()
      .mockResolvedValue({ accessToken: "at1", tokenType: "DPoP" });
    (globalThis.fetch as any)
      .mockResolvedValueOnce(
        new Response("nonce", {
          status: 401,
          headers: { "dpop-nonce": "fresh-nonce" },
        }),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const ctx = await makeDpopContext(await generateDpopKey());
    const res = await proxyFetch(
      cfg,
      ctx,
      {
        accessToken: "at1",
        tokenType: "DPoP",
        ensureFresh,
        onRefresh: () => {},
      },
      { path: "/n", method: "GET" },
    );
    expect(res.status).toBe(200);
    // The DPoP-nonce branch retries the call without invoking a token
    // refresh — ensureFresh should be called once (for the initial),
    // not twice.
    expect(ensureFresh).toHaveBeenCalledTimes(1);
  });

  it("sets Content-Type: application/json automatically for string bodies", async () => {
    (globalThis.fetch as any).mockResolvedValue(
      new Response("{}", { status: 200 }),
    );
    const ctx = await makeDpopContext(await generateDpopKey());
    await proxyFetch(
      cfg,
      ctx,
      {
        accessToken: "at",
        tokenType: "Bearer",
        ensureFresh: async () => ({ accessToken: "at", tokenType: "Bearer" }),
        onRefresh: () => {},
      },
      { path: "/p", method: "POST", body: '{"x":1}' },
    );
    const call = (globalThis.fetch as any).mock.calls[0];
    expect(call[1].headers["Content-Type"]).toBe("application/json");
  });

  it.each([
    [403, "API_FORBIDDEN"],
    [404, "API_NOT_FOUND"],
    [422, "API_VALIDATION"],
    [503, "API_SERVER_ERROR"],
  ])("maps status %d to %s AuthError", async (status, expectedCode) => {
    const ensureFresh = vi
      .fn()
      .mockResolvedValue({ accessToken: "at", tokenType: "Bearer" });
    (globalThis.fetch as any).mockResolvedValue(
      new Response("boom", { status }),
    );
    const ctx = await makeDpopContext(await generateDpopKey());
    await expect(
      proxyFetch(
        cfg,
        ctx,
        {
          accessToken: "at",
          tokenType: "Bearer",
          ensureFresh,
          onRefresh: () => {},
        },
        { path: "/e", method: "GET" },
      ),
    ).rejects.toMatchObject({ code: expectedCode });
  });

  it("throws API_UNAUTHORIZED when refresh-and-retry still returns 401", async () => {
    const ensureFresh = vi
      .fn()
      .mockResolvedValueOnce({ accessToken: "at1", tokenType: "Bearer" })
      .mockResolvedValueOnce({ accessToken: "at2", tokenType: "Bearer" });
    // Both initial + retry land on 401 → after refresh-retry the
    // final response is still 401, which maps to API_UNAUTHORIZED.
    (globalThis.fetch as any).mockResolvedValue(
      new Response("no", { status: 401 }),
    );
    const ctx = await makeDpopContext(await generateDpopKey());
    await expect(
      proxyFetch(
        cfg,
        ctx,
        {
          accessToken: "at1",
          tokenType: "Bearer",
          ensureFresh,
          onRefresh: () => {},
        },
        { path: "/u", method: "GET" },
      ),
    ).rejects.toMatchObject({ code: "API_UNAUTHORIZED" });
  });

  it("returns empty body on 204 No Content", async () => {
    (globalThis.fetch as any).mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    const ctx = await makeDpopContext(await generateDpopKey());
    const res = await proxyFetch(
      cfg,
      ctx,
      {
        accessToken: "at",
        tokenType: "Bearer",
        ensureFresh: async () => ({ accessToken: "at", tokenType: "Bearer" }),
        onRefresh: () => {},
      },
      { path: "/d", method: "DELETE" },
    );
    expect(res.status).toBe(204);
    expect(res.body.byteLength).toBe(0);
  });
});
