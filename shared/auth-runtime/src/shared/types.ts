export type AuthState =
  | "initializing" | "authenticated" | "unauthenticated" | "refreshing" | "error";

export type AuthStateCallback = (state: AuthState) => void;

export interface AuthConfig {
  clientId: string;
  idpBaseUrl?: string;
  apiBaseUrl?: string;
  redirectUri?: string;
  scopes?: string[];
  fedcmConfigUrl?: string;
  installationId?: string;
  skipFedCM?: boolean;
  timeouts?: { discovery?: number; token?: number; api?: number; upload?: number };
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
  redirectUri: string;
  scopes: string[];
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

export interface UserInfo { id: string; name: string; email: string; picture?: string; }

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
