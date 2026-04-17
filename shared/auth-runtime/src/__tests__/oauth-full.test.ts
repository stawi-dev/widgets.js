/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startOAuthPopup } from "../oauth.js";
import { TokenManager } from "../token-manager.js";
import { TokenStore } from "../token-store.js";
import type { ResolvedConfig } from "../types.js";
import {
  _setDiscoveryForTest,
  clearDiscoveryCache,
} from "../discovery.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve()),
  del: vi.fn(() => Promise.resolve()),
}));

// Mock PKCE to avoid real crypto.subtle interactions with fake timers
vi.mock("../pkce.js", () => ({
  generatePkcePair: () =>
    Promise.resolve({ verifier: "test-verifier", challenge: "test-challenge" }),
}));

const config: ResolvedConfig = {
  clientId: "test-client",
  idpBaseUrl: "https://idp.example.com",
  apiBaseUrl: "https://api.example.com",
  redirectUri: "http://localhost/auth/callback",
  scopes: ["openid", "profile"],
  fedcmConfigUrl: "/.well-known/web-identity",
  installationId: "inst-1",
  skipFedCM: false,
};

function seedDiscovery() {
  _setDiscoveryForTest("https://idp.example.com", {
    issuer: "https://idp.example.com",
    authorization_endpoint: "https://idp.example.com/oauth2/auth",
    token_endpoint: "https://idp.example.com/oauth2/token",
  });
}

/** Advance fake timers enough to let poll intervals fire and promises settle. */
async function flush(ms = 500): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

describe("startOAuthPopup", () => {
  let store: TokenStore;
  let manager: TokenManager;
  let mockPopup: {
    closed: boolean;
    close: ReturnType<typeof vi.fn>;
    location: { origin: string; search: string };
  };

  beforeEach(() => {
    vi.useFakeTimers();
    store = new TokenStore();
    manager = new TokenManager(store, config);
    clearDiscoveryCache();
    seedDiscovery();

    mockPopup = {
      closed: false,
      close: vi.fn(),
      location: { origin: "", search: "" },
    };

    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "test-state-uuid" as ReturnType<typeof crypto.randomUUID>,
    );
  });

  afterEach(() => {
    vi.clearAllTimers();
    manager.destroy();
    clearDiscoveryCache();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("throws when popup is blocked", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    await expect(startOAuthPopup(config, manager)).rejects.toThrow(
      "popup blocked",
    );
  });

  it("throws when popup is closed by user", async () => {
    vi.spyOn(window, "open").mockReturnValue(mockPopup as unknown as Window);

    const promise = startOAuthPopup(config, manager);
    // Attach handler before rejection occurs during flush
    const rejection = promise.catch(() => {});
    mockPopup.closed = true;
    await flush();
    await rejection;

    await expect(promise).rejects.toThrow("popup was closed");
  });

  it("throws on OAuth error in callback", async () => {
    vi.spyOn(window, "open").mockReturnValue(mockPopup as unknown as Window);

    const promise = startOAuthPopup(config, manager);
    const rejection = promise.catch(() => {});

    setTimeout(() => {
      mockPopup.location.origin = "http://localhost";
      mockPopup.location.search =
        "?error=access_denied&error_description=User%20denied";
    }, 100);

    await flush();
    await rejection;
    await expect(promise).rejects.toThrow("OAuth error: access_denied");
  });

  it("throws on state mismatch", async () => {
    vi.spyOn(window, "open").mockReturnValue(mockPopup as unknown as Window);

    const promise = startOAuthPopup(config, manager);
    const rejection = promise.catch(() => {});

    setTimeout(() => {
      mockPopup.location.origin = "http://localhost";
      mockPopup.location.search = "?code=auth-code&state=wrong-state";
    }, 100);

    await flush();
    await rejection;
    await expect(promise).rejects.toThrow("missing code or state mismatch");
  });

  it("exchanges code for tokens on successful callback", async () => {
    vi.spyOn(window, "open").mockReturnValue(mockPopup as unknown as Window);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: "at-from-oauth",
            refresh_token: "rt-from-oauth",
            expires_in: 3600,
            token_type: "Bearer",
          }),
      }),
    );

    const promise = startOAuthPopup(config, manager);

    setTimeout(() => {
      mockPopup.location.origin = "http://localhost";
      mockPopup.location.search = "?code=auth-code&state=test-state-uuid";
    }, 100);

    await flush();
    const tokens = await promise;
    expect(tokens.accessToken).toBe("at-from-oauth");
    expect(mockPopup.close).toHaveBeenCalled();
  });

  it("throws when token exchange fails", async () => {
    vi.spyOn(window, "open").mockReturnValue(mockPopup as unknown as Window);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400 }),
    );

    const promise = startOAuthPopup(config, manager);
    const rejection = promise.catch(() => {});

    setTimeout(() => {
      mockPopup.location.origin = "http://localhost";
      mockPopup.location.search = "?code=auth-code&state=test-state-uuid";
    }, 100);

    await flush();
    await rejection;
    await expect(promise).rejects.toThrow("Token exchange failed: 400");
  });

  it("includes installation_id and PKCE in auth URL", async () => {
    let capturedUrl = "";
    vi.spyOn(window, "open").mockImplementation((url) => {
      capturedUrl = url as string;
      return mockPopup as unknown as Window;
    });

    const promise = startOAuthPopup(config, manager);
    const rejection = promise.catch(() => {});

    // Close popup after URL is captured
    setTimeout(() => {
      mockPopup.closed = true;
    }, 100);

    await flush();
    await rejection;

    expect(capturedUrl).toBeTruthy();
    const url = new URL(capturedUrl);
    expect(url.searchParams.get("installation_id")).toBe("inst-1");
    expect(url.searchParams.get("code_challenge")).toBe("test-challenge");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("openid profile");
    expect(url.searchParams.get("client_id")).toBe("test-client");
    expect(url.searchParams.get("response_type")).toBe("code");
  });
});
