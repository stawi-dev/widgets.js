import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApiClient } from "../api-client.js";
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

const validTokens: TokenSet = {
  accessToken: "test-access-token",
  refreshToken: "test-refresh-token",
  expiresAt: Date.now() + 300_000,
  tokenType: "Bearer",
};

describe("ApiClient", () => {
  let store: TokenStore;
  let manager: TokenManager;
  let client: ApiClient;

  beforeEach(async () => {
    vi.useFakeTimers();
    store = new TokenStore();
    manager = new TokenManager(store, config);
    client = new ApiClient(config, manager);
    await manager.saveTokens(validTokens);
  });

  afterEach(() => {
    manager.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("fetch", () => {
    it("sends authenticated GET request and returns JSON", async () => {
      const mockData = { id: 1, name: "test" };
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockData),
        }),
      );

      const result = await client.fetch("/users/1");

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/users/1",
        expect.objectContaining({
          headers: expect.any(Headers),
        }),
      );
      const callHeaders = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]
        .headers as Headers;
      expect(callHeaders.get("Authorization")).toBe(
        "Bearer test-access-token",
      );
      expect(callHeaders.get("Accept")).toBe("application/json");
      expect(result).toEqual(mockData);
    });

    it("sets Content-Type for string body", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        }),
      );

      await client.fetch("/data", {
        method: "POST",
        body: JSON.stringify({ key: "value" }),
      });

      const callHeaders = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]
        .headers as Headers;
      expect(callHeaders.get("Content-Type")).toBe("application/json");
    });

    it("does not override existing Content-Type", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        }),
      );

      await client.fetch("/data", {
        method: "POST",
        body: "plain text",
        headers: { "Content-Type": "text/plain" },
      });

      const callHeaders = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]
        .headers as Headers;
      expect(callHeaders.get("Content-Type")).toBe("text/plain");
    });

    it("returns undefined for 204 responses", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 204,
        }),
      );

      const result = await client.fetch("/delete");
      expect(result).toBeUndefined();
    });

    it("throws AuthError on non-ok responses", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          statusText: "Not Found",
          text: () => Promise.resolve("resource missing"),
        }),
      );

      await expect(client.fetch("/missing")).rejects.toThrow(AuthError);
      await expect(client.fetch("/missing")).rejects.toThrow(
        "API request failed: 404",
      );
    });

    it("throws AuthError on network failure", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new TypeError("Network error")),
      );

      await expect(client.fetch("/data")).rejects.toThrow(AuthError);
      await expect(client.fetch("/data")).rejects.toThrow(
        "API request failed",
      );
    });

    it("re-throws AuthError directly without wrapping", async () => {
      const authErr = new AuthError("NETWORK_ERROR", "custom error");
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(authErr));

      await expect(client.fetch("/data")).rejects.toBe(authErr);
    });
  });

  describe("upload", () => {
    it("sends PUT with FormData", async () => {
      const mockData = { url: "https://cdn.example.com/file.png" };
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockData),
        }),
      );

      const file = new File(["content"], "test.png", { type: "image/png" });
      const result = await client.upload("/upload", file);

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/upload",
        expect.objectContaining({
          method: "PUT",
          body: expect.any(FormData),
        }),
      );
      expect(result).toEqual(mockData);
    });

    it("returns undefined for 204 responses", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 204,
        }),
      );

      const file = new File([""], "empty.txt");
      const result = await client.upload("/upload", file);
      expect(result).toBeUndefined();
    });

    it("throws AuthError on upload failure", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          text: () => Promise.resolve("server error"),
        }),
      );

      const file = new File(["content"], "test.txt");
      await expect(client.upload("/upload", file)).rejects.toThrow(
        "Upload failed: 500",
      );
    });

    it("throws AuthError on network failure during upload", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new TypeError("Network error")),
      );

      const file = new File(["content"], "test.txt");
      await expect(client.upload("/upload", file)).rejects.toThrow(
        "Upload failed",
      );
    });

    it("re-throws AuthError directly during upload", async () => {
      const authErr = new AuthError("NETWORK_ERROR", "upload custom error");
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(authErr));

      const file = new File(["content"], "test.txt");
      await expect(client.upload("/upload", file)).rejects.toBe(authErr);
    });
  });
});
