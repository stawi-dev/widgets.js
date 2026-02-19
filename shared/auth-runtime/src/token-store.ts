import { get, set, del } from "idb-keyval";
import type { TokenSet } from "./types.js";

const IDB_KEY = "@stawi/auth-runtime:tokens";

export class TokenStore {
  private memoryTokens: TokenSet | null = null;

  async get(): Promise<TokenSet | null> {
    if (this.memoryTokens) {
      return this.memoryTokens;
    }
    try {
      const stored = await get<TokenSet>(IDB_KEY);
      if (stored) {
        this.memoryTokens = stored;
      }
      return stored ?? null;
    } catch {
      return null;
    }
  }

  async save(tokens: TokenSet): Promise<void> {
    this.memoryTokens = tokens;
    try {
      await set(IDB_KEY, tokens);
    } catch {
      // IndexedDB may be unavailable (incognito, etc.) — memory-only is fine
    }
  }

  async clear(): Promise<void> {
    this.memoryTokens = null;
    try {
      await del(IDB_KEY);
    } catch {
      // Ignore IndexedDB errors
    }
  }

  getSync(): TokenSet | null {
    return this.memoryTokens;
  }
}
