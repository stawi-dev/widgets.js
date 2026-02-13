import { describe, it, expect, vi, beforeEach } from "vitest";
import { TokenStore } from "../token-store.js";
import type { TokenSet } from "../types.js";

// Mock idb-keyval since IndexedDB is not available in test env
vi.mock("idb-keyval", () => {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn((key: string) => Promise.resolve(store.get(key))),
    set: vi.fn((key: string, value: unknown) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    del: vi.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
  };
});

const mockTokens: TokenSet = {
  accessToken: "access-123",
  refreshToken: "refresh-456",
  expiresAt: Date.now() + 3600_000,
  tokenType: "Bearer",
};

describe("TokenStore", () => {
  let store: TokenStore;

  beforeEach(() => {
    store = new TokenStore();
  });

  it("returns null when empty", async () => {
    expect(await store.get()).toBeNull();
  });

  it("saves and retrieves tokens", async () => {
    await store.save(mockTokens);
    const result = await store.get();
    expect(result).toEqual(mockTokens);
  });

  it("clears tokens", async () => {
    await store.save(mockTokens);
    await store.clear();
    expect(store.getSync()).toBeNull();
  });

  it("getSync returns in-memory tokens without async", async () => {
    expect(store.getSync()).toBeNull();
    await store.save(mockTokens);
    expect(store.getSync()).toEqual(mockTokens);
  });
});
