import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TokenManager } from "../token-manager.js";
import { TokenStore } from "../token-store.js";
import { AuthError } from "../errors.js";
import type { ResolvedConfig, TokenSet } from "../types.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve()),
  del: vi.fn(() => Promise.resolve()),
}));

const config: ResolvedConfig = {
  clientId: "test",
  idpBaseUrl: "https://idp.example.com",
  apiBaseUrl: "https://api.example.com",
  redirectUri: "http://localhost/auth/callback",
  scopes: ["openid"],
  fedcmConfigUrl: "/.well-known/web-identity",
};

describe("TokenManager - refresh flows", () => {
  let store: TokenStore;
  let manager: TokenManager;
  let onRefreshFailure: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    onRefreshFailure = vi.fn();
    store = new TokenStore();
    manager = new TokenManager(store, config, onRefreshFailure);
  });

  afterEach(() => {
    manager.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("refreshes token when near expiry", async () => {
    // Save tokens that are about to expire (within 60s buffer)
    const nearExpiry: TokenSet = {
      accessToken: "old-at",
      refreshToken: "rt",
      expiresAt: Date.now() + 30_000, // 30s from now, within 60s buffer
      tokenType: "Bearer",
    };
    await manager.saveTokens(nearExpiry);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: "new-at",
            refresh_token: "new-rt",
            expires_in: 3600,
          }),
      }),
    );

    const token = await manager.getValidAccessToken();
    expect(token).toBe("new-at");
  });

  it("deduplicates concurrent refresh calls", async () => {
    const nearExpiry: TokenSet = {
      accessToken: "old-at",
      refreshToken: "rt",
      expiresAt: Date.now() + 30_000,
      tokenType: "Bearer",
    };
    await manager.saveTokens(nearExpiry);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: "new-at",
            refresh_token: "new-rt",
            expires_in: 3600,
          }),
      }),
    );

    // Fire two concurrent requests
    const [t1, t2] = await Promise.all([
      manager.getValidAccessToken(),
      manager.getValidAccessToken(),
    ]);

    expect(t1).toBe("new-at");
    expect(t2).toBe("new-at");
    // Only one fetch call should have been made
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("calls onRefreshFailure and clears store on AuthError during refresh", async () => {
    const nearExpiry: TokenSet = {
      accessToken: "old-at",
      refreshToken: "rt",
      expiresAt: Date.now() + 30_000,
      tokenType: "Bearer",
    };
    await manager.saveTokens(nearExpiry);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      }),
    );

    await expect(manager.getValidAccessToken()).rejects.toThrow(
      "Token refresh failed: 401",
    );
    expect(onRefreshFailure).toHaveBeenCalled();
    // Store should be cleared
    expect(await store.get()).toBeNull();
  });

  it("wraps non-AuthError in AuthError during refresh", async () => {
    const nearExpiry: TokenSet = {
      accessToken: "old-at",
      refreshToken: "rt",
      expiresAt: Date.now() + 30_000,
      tokenType: "Bearer",
    };
    await manager.saveTokens(nearExpiry);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Network failure")),
    );

    await expect(manager.getValidAccessToken()).rejects.toThrow(AuthError);
  });

  it("scheduleRefresh triggers proactive refresh before expiry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: "proactive-at",
            refresh_token: "proactive-rt",
            expires_in: 3600,
          }),
      }),
    );

    // Save tokens that expire in 120s (refresh scheduled at 60s)
    const tokens: TokenSet = {
      accessToken: "at",
      refreshToken: "rt",
      expiresAt: Date.now() + 120_000,
      tokenType: "Bearer",
    };
    await manager.saveTokens(tokens);

    // Advance past the scheduled refresh time (120s - 60s buffer = 60s)
    await vi.advanceTimersByTimeAsync(61_000);

    expect(fetch).toHaveBeenCalled();
  });

  it("clearTokens cancels scheduled refresh", async () => {
    const tokens: TokenSet = {
      accessToken: "at",
      refreshToken: "rt",
      expiresAt: Date.now() + 120_000,
      tokenType: "Bearer",
    };
    await manager.saveTokens(tokens);
    await manager.clearTokens();

    vi.stubGlobal("fetch", vi.fn());
    await vi.advanceTimersByTimeAsync(120_000);

    // No refresh should have been attempted
    expect(fetch).not.toHaveBeenCalled();
  });

  it("parseTokenResponse uses defaults for missing optional fields", () => {
    const tokens = manager.parseTokenResponse({
      access_token: "at",
      refresh_token: "rt",
    });
    expect(tokens.tokenType).toBe("Bearer");
    // Default expires_in is 300
    expect(tokens.expiresAt).toBeGreaterThan(Date.now());
  });
});
