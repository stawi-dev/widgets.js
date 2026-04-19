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
