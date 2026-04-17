export interface AuthConfig {
  /** OAuth2 client ID */
  clientId: string;
  /** Identity provider base URL (default: https://oauth2.stawi.org) */
  idpBaseUrl?: string;
  /** API base URL (default: https://api.stawi.org) */
  apiBaseUrl?: string;
  /** OAuth2 redirect URI (default: current origin + /auth/callback) */
  redirectUri?: string;
  /** OAuth2 scopes (default: ["openid", "profile", "email"]) */
  scopes?: string[];
  /** FedCM config URL path (default: /.well-known/web-identity) */
  fedcmConfigUrl?: string;
  /** Installation ID for multi-tenant scenarios */
  installationId?: string;
  /**
   * Skip FedCM entirely and go straight to the OAuth popup flow. Useful when
   * the IdP does not publish a FedCM config (e.g. vanilla Ory Hydra): avoids
   * ~0.5–1s of redundant browser probing on every sign-in. Default: false.
   */
  skipFedCM?: boolean;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tokenType: string;
}

export interface UserInfo {
  id: string;
  name: string;
  email: string;
  picture?: string;
}

export type AuthState =
  | "initializing"
  | "authenticated"
  | "unauthenticated"
  | "error";

export type AuthStateCallback = (state: AuthState) => void;

export interface AuthRuntime {
  ensureAuthenticated(): Promise<void>;
  getAccessToken(): Promise<string>;
  getUser(): Promise<UserInfo>;
  getRoles(): Promise<string[]>;
  logout(): Promise<void>;
  onAuthStateChange(cb: AuthStateCallback): () => void;
  getState(): AuthState;
  destroy(): void;
}

export interface ResolvedConfig {
  clientId: string;
  idpBaseUrl: string;
  apiBaseUrl: string;
  redirectUri: string;
  scopes: string[];
  fedcmConfigUrl: string;
  installationId?: string;
  skipFedCM: boolean;
}
