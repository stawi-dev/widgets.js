import type {
  AuthConfig,
  AuthRuntime,
  AuthState,
  AuthStateCallback,
  UserInfo,
} from "./types.js";
import { AuthError } from "./errors.js";
import { resolveConfig } from "./config.js";
import { TokenStore } from "./token-store.js";
import { TokenManager } from "./token-manager.js";
import { ApiClient } from "./api-client.js";
import { attemptFedCM } from "./fedcm.js";
import { startOAuthPopup } from "./oauth.js";
import { extractRolesFromToken } from "./jwt.js";
import { getDiscovery } from "./discovery.js";

export type {
  AuthConfig,
  AuthRuntime,
  AuthState,
  AuthStateCallback,
  UserInfo,
  TokenSet,
  ResolvedConfig,
} from "./types.js";
export type { AuthErrorCode } from "./errors.js";
export { AuthError } from "./errors.js";
export { ApiClient } from "./api-client.js";
export { decodeJwtPayload, extractRolesFromToken } from "./jwt.js";

const RUNTIME_KEY = Symbol.for("@stawi/auth-runtime");

class AuthRuntimeImpl implements AuthRuntime {
  private state: AuthState = "initializing";
  private listeners = new Set<AuthStateCallback>();
  private store: TokenStore;
  private tokenManager: TokenManager;
  private apiClient: ApiClient;
  private config;
  private cachedUser: UserInfo | null = null;
  private authPromise: Promise<void> | null = null;

  constructor(config: AuthConfig) {
    this.config = resolveConfig(config);
    this.store = new TokenStore();
    this.tokenManager = new TokenManager(
      this.store,
      this.config,
      () => this.setState("unauthenticated"),
    );
    this.apiClient = new ApiClient(this.config, this.tokenManager);
  }

  getState(): AuthState {
    return this.state;
  }

  private setState(state: AuthState): void {
    if (this.state === state) return;
    this.state = state;
    for (const cb of this.listeners) {
      try {
        cb(state);
      } catch {
        // Don't let listener errors break state management
      }
    }
  }

  onAuthStateChange(cb: AuthStateCallback): () => void {
    this.listeners.add(cb);
    // Immediately fire with current state
    cb(this.state);
    return () => {
      this.listeners.delete(cb);
    };
  }

  async ensureAuthenticated(): Promise<void> {
    if (this.state === "authenticated") return;

    // Deduplicate concurrent auth attempts
    if (this.authPromise) return this.authPromise;

    this.authPromise = this.doAuth().finally(() => {
      this.authPromise = null;
    });

    return this.authPromise;
  }

  private async doAuth(): Promise<void> {
    this.setState("initializing");

    try {
      // 1. Check existing tokens
      const existing = await this.store.get();
      if (existing && existing.expiresAt > Date.now()) {
        await this.tokenManager.saveTokens(existing);
        this.setState("authenticated");
        return;
      }

      // 2. FedCM (skipped entirely when the caller opts out).
      //    attemptFedCM itself short-circuits if the IdP does not publish a
      //    FedCM config file, so two calls are cheap on unsupported IdPs.
      if (!this.config.skipFedCM) {
        let tokens = await attemptFedCM(
          this.config,
          this.tokenManager,
          "silent",
        );
        if (tokens) {
          await this.tokenManager.saveTokens(tokens);
          this.setState("authenticated");
          return;
        }

        tokens = await attemptFedCM(
          this.config,
          this.tokenManager,
          "optional",
        );
        if (tokens) {
          await this.tokenManager.saveTokens(tokens);
          this.setState("authenticated");
          return;
        }
      }

      // 3. Fallback to OAuth2 popup (authorization_code + PKCE).
      const tokens = await startOAuthPopup(this.config, this.tokenManager);
      await this.tokenManager.saveTokens(tokens);
      this.setState("authenticated");
    } catch (err) {
      this.setState("error");
      throw err;
    }
  }

  async getAccessToken(): Promise<string> {
    return this.tokenManager.getValidAccessToken();
  }

  async getUser(): Promise<UserInfo> {
    if (this.cachedUser) return this.cachedUser;
    const user = await this.apiClient.fetch<UserInfo>("/me");
    this.cachedUser = user;
    return user;
  }

  async getRoles(): Promise<string[]> {
    const token = await this.tokenManager.getValidAccessToken();
    return extractRolesFromToken(token);
  }

  async logout(): Promise<void> {
    // Best-effort server-side logout via the discovery-advertised
    // end_session_endpoint. Swallow everything — we always want local
    // state cleared even if the network call fails.
    try {
      const discovery = await getDiscovery(this.config.idpBaseUrl);
      const endSession = discovery.end_session_endpoint;
      if (endSession) {
        await fetch(endSession, {
          method: "POST",
          credentials: "include",
        });
      }
    } catch {
      /* swallow */
    }
    await this.tokenManager.clearTokens();
    this.cachedUser = null;
    this.setState("unauthenticated");
  }

  getApiClient(): ApiClient {
    return this.apiClient;
  }

  destroy(): void {
    this.tokenManager.destroy();
    this.listeners.clear();
    const g = globalThis as Record<symbol, unknown>;
    if (g[RUNTIME_KEY] === this) {
      delete g[RUNTIME_KEY];
    }
  }
}

export function getAuthRuntime(config?: AuthConfig): AuthRuntimeImpl {
  const g = globalThis as Record<symbol, unknown>;
  const existing = g[RUNTIME_KEY] as AuthRuntimeImpl | undefined;
  if (existing) return existing;

  if (!config) {
    throw new AuthError(
      "INVALID_CONFIG",
      "getAuthRuntime() requires config on first call",
    );
  }

  const runtime = new AuthRuntimeImpl(config);
  g[RUNTIME_KEY] = runtime;
  return runtime;
}
