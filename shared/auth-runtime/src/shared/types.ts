export type AuthState =
  "initializing" | "authenticated" | "unauthenticated" | "refreshing" | "error";

export type AuthStateCallback = (state: AuthState) => void;

export interface AuthConfig {
  clientId: string;
  /**
   * OAuth2 issuer / Hydra public base URL. Used for OIDC discovery, the
   * authorize redirect, and id_token iss claim validation. Distinct from the
   * FedCM origin: in the Stawi stack Hydra runs at oauth2.stawi.org while the
   * FedCM endpoints are served by the auth service at accounts.stawi.org.
   */
  idpBaseUrl?: string;
  apiBaseUrl?: string;
  /**
   * Additional origins that `fetch()` may target with an absolute URL,
   * beyond `apiBaseUrl` itself. Used by embeddable widgets that call a
   * different API host through this same runtime (e.g. the identity widget
   * calling https://api.stawi.org/identity from a host page whose
   * apiBaseUrl points elsewhere). A relative path is always prefixed with
   * `apiBaseUrl`; an absolute URL whose origin is neither `apiBaseUrl`'s
   * origin nor listed here is rejected with `INVALID_CONFIG`.
   */
  allowedApiOrigins?: string[];
  redirectUri?: string;
  /**
   * Where the authorization server should return the browser after a full
   * OIDC logout redirect. Defaults to the current page URL in browsers.
   */
  logoutRedirectUri?: string;
  scopes?: string[];
  /**
   * Origin that serves the FedCM IdP endpoints (/.well-known/web-identity and
   * /fedcm/*). Defaults to https://accounts.stawi.org. Leave undefined when
   * the FedCM endpoints live on the same host as Hydra.
   */
  fedcmBaseUrl?: string;
  /**
   * Path of the FedCM configURL on `fedcmBaseUrl`. Defaults to
   * /fedcm/config.json. The path is what Chrome fetches as the configURL —
   * NOT the discovery pointer at /.well-known/web-identity.
   */
  fedcmConfigUrl?: string;
  installationId?: string;
  skipFedCM?: boolean;
  timeouts?: {
    discovery?: number;
    token?: number;
    api?: number;
    upload?: number;
  };
  fedcm?: {
    nonce?: () => string | Promise<string>;
    fields?: string[];
    loginHint?: string;
    domainHint?: string;
    params?: Record<string, string>;
  };
}

export interface ResolvedConfig {
  clientId: string;
  idpBaseUrl: string;
  apiBaseUrl: string;
  allowedApiOrigins: string[];
  redirectUri: string;
  logoutRedirectUri: string;
  scopes: string[];
  fedcmBaseUrl: string;
  fedcmConfigUrl: string;
  installationId?: string;
  skipFedCM: boolean;
  timeouts: { discovery: number; token: number; api: number; upload: number };
  fedcm: {
    nonce?: () => string | Promise<string>;
    fields?: string[];
    loginHint?: string;
    domainHint?: string;
    params?: Record<string, string>;
  };
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tokenType: "Bearer" | "DPoP";
  idToken?: string;
}

export interface UserInfo {
  id: string;
  name: string;
  email: string;
  picture?: string;
}

export type SecurityEvent =
  | { type: "refresh_reuse_detected"; at: number }
  | { type: "storage_corruption"; at: number }
  | { type: "binding_invalidated"; at: number }
  | { type: "logged_out_elsewhere"; at: number };

export type SecurityEventCallback = (event: SecurityEvent) => void;

export interface ApiResponse<T = unknown> {
  status: number;
  headers: Record<string, string>;
  body: T;
}

// Re-exported from fedcm.ts via shared/fedcm.js to keep the surface coherent.
// Kept as a structural duplicate here because types.ts is leaf-ish — do not
// import from fedcm.ts (would create a cycle at public type-only consumers).
export type FedCMOutcome =
  | { kind: "token"; token: string; autoSelected: boolean }
  | { kind: "no-session"; loginUrl?: string }
  | { kind: "dismissed" }
  | { kind: "not-allowed" }
  | { kind: "aborted" }
  | { kind: "unsupported" }
  | { kind: "error"; message: string; code?: string; url?: string };

export type FedCMEvent =
  | { type: "probe"; available: boolean; loginUrl?: string }
  | {
      type: "attempt";
      mediation: "silent" | "optional" | "required";
      mode: "passive" | "active";
    }
  | { type: "outcome"; outcome: FedCMOutcome }
  | { type: "login-url-opened"; url: string }
  | { type: "disconnected" };

export type FedCMEventCallback = (event: FedCMEvent) => void;
