import { AuthError } from "./errors.js";
import type { AuthConfig, ResolvedConfig } from "./types.js";

const DEFAULTS = {
  idpBaseUrl: "https://oauth2.stawi.org",
  apiBaseUrl: "https://api.stawi.org",
  scopes: ["openid", "profile", "email", "offline_access"] as string[],
  fedcmConfigUrl: "/.well-known/web-identity",
  timeouts: { discovery: 10_000, token: 10_000, api: 30_000, upload: 60_000 },
} as const;

export function resolveConfig(config: AuthConfig): ResolvedConfig {
  if (!config?.clientId) throw new AuthError("INVALID_CONFIG", "clientId is required");

  const strip = (u: string) => u.replace(/\/$/, "");
  const idpBaseUrl = strip(config.idpBaseUrl ?? DEFAULTS.idpBaseUrl);
  const apiBaseUrl = strip(config.apiBaseUrl ?? DEFAULTS.apiBaseUrl);
  const redirectUri = config.redirectUri
    ?? (typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback`
      : "http://localhost/auth/callback");

  return {
    clientId: config.clientId,
    idpBaseUrl,
    apiBaseUrl,
    redirectUri,
    scopes: config.scopes ?? [...DEFAULTS.scopes],
    fedcmConfigUrl: config.fedcmConfigUrl ?? DEFAULTS.fedcmConfigUrl,
    installationId: config.installationId,
    skipFedCM: config.skipFedCM ?? false,
    timeouts: { ...DEFAULTS.timeouts, ...(config.timeouts ?? {}) },
    fedcm: config.fedcm ?? {},
  };
}

export function namespaceOf(cfg: { clientId: string; idpBaseUrl: string }): string {
  return `${cfg.clientId}::${cfg.idpBaseUrl}`;
}
