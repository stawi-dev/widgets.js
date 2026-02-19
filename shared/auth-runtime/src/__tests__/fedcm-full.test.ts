/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { attemptFedCM } from "../fedcm.js";
import { TokenManager } from "../token-manager.js";
import { TokenStore } from "../token-store.js";
import { AuthError } from "../errors.js";
import type { ResolvedConfig } from "../types.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve()),
  del: vi.fn(() => Promise.resolve()),
}));

const config: ResolvedConfig = {
  clientId: "test-client",
  idpBaseUrl: "https://idp.example.com",
  apiBaseUrl: "https://api.example.com",
  redirectUri: "http://localhost/auth/callback",
  scopes: ["openid"],
  fedcmConfigUrl: "/.well-known/web-identity",
};

describe("attemptFedCM", () => {
  let store: TokenStore;
  let manager: TokenManager;

  beforeEach(() => {
    store = new TokenStore();
    manager = new TokenManager(store, config);
  });

  afterEach(() => {
    manager.destroy();
    vi.restoreAllMocks();
    delete (window as Record<string, unknown>).IdentityCredential;
  });

  it("returns null when FedCM is not supported", async () => {
    const result = await attemptFedCM(config, manager, "silent");
    expect(result).toBeNull();
  });

  it("returns null when credential has no token", async () => {
    (window as Record<string, unknown>).IdentityCredential = class {};
    Object.defineProperty(navigator, "credentials", {
      value: { get: vi.fn().mockResolvedValue({ token: null }) },
      writable: true,
      configurable: true,
    });

    const result = await attemptFedCM(config, manager, "silent");
    expect(result).toBeNull();
  });

  it("exchanges FedCM token for OAuth tokens on success", async () => {
    (window as Record<string, unknown>).IdentityCredential = class {};
    Object.defineProperty(navigator, "credentials", {
      value: {
        get: vi.fn().mockResolvedValue({ token: "fedcm-token-123" }),
      },
      writable: true,
      configurable: true,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: "at-from-fedcm",
            refresh_token: "rt-from-fedcm",
            expires_in: 3600,
            token_type: "Bearer",
          }),
      }),
    );

    const result = await attemptFedCM(config, manager, "optional");

    expect(fetch).toHaveBeenCalledWith(
      "https://idp.example.com/oauth/token",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).not.toBeNull();
    expect(result!.accessToken).toBe("at-from-fedcm");
  });

  it("throws AuthError when token exchange returns non-ok", async () => {
    (window as Record<string, unknown>).IdentityCredential = class {};
    Object.defineProperty(navigator, "credentials", {
      value: {
        get: vi.fn().mockResolvedValue({ token: "fedcm-token" }),
      },
      writable: true,
      configurable: true,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400 }),
    );

    await expect(attemptFedCM(config, manager, "silent")).rejects.toThrow(
      AuthError,
    );
  });

  it("returns null on non-AuthError exceptions (user dismissed)", async () => {
    (window as Record<string, unknown>).IdentityCredential = class {};
    Object.defineProperty(navigator, "credentials", {
      value: {
        get: vi
          .fn()
          .mockRejectedValue(
            new DOMException("User dismissed", "AbortError"),
          ),
      },
      writable: true,
      configurable: true,
    });

    const result = await attemptFedCM(config, manager, "silent");
    expect(result).toBeNull();
  });
});
