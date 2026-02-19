import { describe, it, expect, vi, beforeEach } from "vitest";
import { TokenStore } from "../token-store.js";
import type { TokenSet } from "../types.js";

// Mock idb-keyval with error scenarios
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();

vi.mock("idb-keyval", () => ({
  get: (...args: unknown[]) => mockGet(...args),
  set: (...args: unknown[]) => mockSet(...args),
  del: (...args: unknown[]) => mockDel(...args),
}));

const mockTokens: TokenSet = {
  accessToken: "access-123",
  refreshToken: "refresh-456",
  expiresAt: Date.now() + 3600_000,
  tokenType: "Bearer",
};

describe("TokenStore - error fallbacks", () => {
  let store: TokenStore;

  beforeEach(() => {
    store = new TokenStore();
    mockGet.mockReset();
    mockSet.mockReset();
    mockDel.mockReset();
  });

  it("get falls back to null when IndexedDB throws", async () => {
    mockGet.mockRejectedValue(new Error("IDB unavailable"));
    const result = await store.get();
    expect(result).toBeNull();
  });

  it("get returns from IDB when memory is empty", async () => {
    mockGet.mockResolvedValue(mockTokens);
    const result = await store.get();
    expect(result).toEqual(mockTokens);
  });

  it("get returns from memory on second call (skips IDB)", async () => {
    mockGet.mockResolvedValue(mockTokens);
    await store.get(); // First call loads from IDB
    mockGet.mockReset();
    const result = await store.get(); // Second call uses memory
    expect(result).toEqual(mockTokens);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("save works even when IndexedDB throws", async () => {
    mockSet.mockRejectedValue(new Error("IDB write failed"));
    await store.save(mockTokens); // Should not throw
    expect(store.getSync()).toEqual(mockTokens);
  });

  it("clear works even when IndexedDB throws", async () => {
    await store.save(mockTokens);
    mockDel.mockRejectedValue(new Error("IDB delete failed"));
    await store.clear(); // Should not throw
    expect(store.getSync()).toBeNull();
  });

  it("get returns null when IDB returns undefined", async () => {
    mockGet.mockResolvedValue(undefined);
    const result = await store.get();
    expect(result).toBeNull();
  });
});
