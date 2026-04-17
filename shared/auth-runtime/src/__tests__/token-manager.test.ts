import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TokenManager } from "../token-manager.js";
import { TokenStore } from "../token-store.js";
import type { ResolvedConfig, TokenSet } from "../types.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve()),
  del: vi.fn(() => Promise.resolve()),
}));

const config: ResolvedConfig = {
  clientId: "test",
  idpBaseUrl: "https://accounts.stawi.org",
  apiBaseUrl: "https://api.stawi.org",
  redirectUri: "http://localhost/auth/callback",
  scopes: ["openid"],
  fedcmConfigUrl: "/.well-known/web-identity",
  skipFedCM: false,
};

describe("TokenManager", () => {
  let store: TokenStore;
  let manager: TokenManager;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new TokenStore();
    manager = new TokenManager(store, config);
  });

  afterEach(() => {
    manager.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("parseTokenResponse extracts tokens correctly", () => {
    const tokens = manager.parseTokenResponse({
      access_token: "at",
      refresh_token: "rt",
      expires_in: 600,
      token_type: "Bearer",
    });
    expect(tokens.accessToken).toBe("at");
    expect(tokens.refreshToken).toBe("rt");
    expect(tokens.tokenType).toBe("Bearer");
    expect(tokens.expiresAt).toBeGreaterThan(Date.now());
  });

  it("parseTokenResponse throws on missing tokens", () => {
    expect(() =>
      manager.parseTokenResponse({ access_token: "at" }),
    ).toThrow("missing access_token or refresh_token");
  });

  it("getValidAccessToken throws when no tokens", async () => {
    await expect(manager.getValidAccessToken()).rejects.toThrow(
      "No tokens available",
    );
  });

  it("getValidAccessToken returns valid token without refresh", async () => {
    const tokens: TokenSet = {
      accessToken: "valid-at",
      refreshToken: "rt",
      expiresAt: Date.now() + 300_000, // 5 min from now
      tokenType: "Bearer",
    };
    await manager.saveTokens(tokens);
    const result = await manager.getValidAccessToken();
    expect(result).toBe("valid-at");
  });
});
