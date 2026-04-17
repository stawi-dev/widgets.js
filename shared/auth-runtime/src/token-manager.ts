import type { ResolvedConfig, TokenSet } from "./types.js";
import { AuthError } from "./errors.js";
import { TokenStore } from "./token-store.js";
import { getDiscovery } from "./discovery.js";

const EXPIRY_BUFFER_MS = 60_000; // Refresh 60s before expiry

export class TokenManager {
  private store: TokenStore;
  private config: ResolvedConfig;
  private refreshPromise: Promise<TokenSet> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private onRefreshFailure?: () => void;

  constructor(
    store: TokenStore,
    config: ResolvedConfig,
    onRefreshFailure?: () => void,
  ) {
    this.store = store;
    this.config = config;
    this.onRefreshFailure = onRefreshFailure;
  }

  async getValidAccessToken(): Promise<string> {
    const tokens = await this.store.get();
    if (!tokens) {
      throw new AuthError("TOKEN_EXPIRED", "No tokens available");
    }

    if (Date.now() < tokens.expiresAt - EXPIRY_BUFFER_MS) {
      return tokens.accessToken;
    }

    const refreshed = await this.refresh(tokens.refreshToken);
    return refreshed.accessToken;
  }

  async saveTokens(tokens: TokenSet): Promise<void> {
    await this.store.save(tokens);
    this.scheduleRefresh(tokens);
  }

  async clearTokens(): Promise<void> {
    this.cancelScheduledRefresh();
    await this.store.clear();
  }

  private async refresh(refreshToken: string): Promise<TokenSet> {
    // Deduplicate concurrent refresh calls
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.doRefresh(refreshToken).finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  private async doRefresh(refreshToken: string): Promise<TokenSet> {
    try {
      const discovery = await getDiscovery(this.config.idpBaseUrl);
      const response = await fetch(discovery.token_endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: this.config.clientId,
          refresh_token: refreshToken,
        }),
      });

      if (!response.ok) {
        throw new AuthError(
          "TOKEN_REFRESH_FAILED",
          `Token refresh failed: ${response.status}`,
        );
      }

      const data = await response.json();
      const tokens = this.parseTokenResponse(data);
      await this.store.save(tokens);
      this.scheduleRefresh(tokens);
      return tokens;
    } catch (err) {
      if (err instanceof AuthError) {
        await this.store.clear();
        this.onRefreshFailure?.();
        throw err;
      }
      throw new AuthError(
        "TOKEN_REFRESH_FAILED",
        "Token refresh failed",
        err,
      );
    }
  }

  private scheduleRefresh(tokens: TokenSet): void {
    this.cancelScheduledRefresh();
    const delay = tokens.expiresAt - Date.now() - EXPIRY_BUFFER_MS;
    if (delay > 0) {
      this.refreshTimer = setTimeout(() => {
        this.refresh(tokens.refreshToken).catch(() => {
          // onRefreshFailure handles this
        });
      }, delay);
    }
  }

  private cancelScheduledRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  parseTokenResponse(data: Record<string, unknown>): TokenSet {
    const accessToken = data.access_token as string;
    const refreshToken = data.refresh_token as string;
    const expiresIn = (data.expires_in as number) ?? 300;
    const tokenType = (data.token_type as string) ?? "Bearer";

    if (!accessToken || !refreshToken) {
      throw new AuthError(
        "TOKEN_EXCHANGE_FAILED",
        "Invalid token response: missing access_token or refresh_token",
      );
    }

    return {
      accessToken,
      refreshToken,
      expiresAt: Date.now() + expiresIn * 1000,
      tokenType,
    };
  }

  destroy(): void {
    this.cancelScheduledRefresh();
  }
}
