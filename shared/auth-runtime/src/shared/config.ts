import { AuthError } from "./errors.js";
import type { AuthConfig, ResolvedConfig } from "./types.js";

const DEFAULTS = {
  idpBaseUrl: "https://oauth2.stawi.org",
  apiBaseUrl: "https://api.stawi.org",
  scopes: ["openid", "profile", "email", "offline_access"] as string[],
  // The FedCM endpoints live on a separate origin from Hydra in the Stawi
  // stack: Hydra at oauth2.stawi.org, FedCM at accounts.stawi.org. The path
  // is the actual configURL Chrome fetches, NOT the .well-known pointer
  // (which only returns provider_urls and would fail FedCM discovery if
  // used as the configURL directly).
  fedcmBaseUrl: "https://accounts.stawi.org",
  fedcmConfigUrl: "/fedcm/config.json",
  timeouts: { discovery: 10_000, token: 10_000, api: 30_000, upload: 60_000 },
} as const;

export function resolveConfig(config: AuthConfig): ResolvedConfig {
  if (!config?.clientId)
    throw new AuthError("INVALID_CONFIG", "clientId is required");

  const strip = (u: string) => u.replace(/\/$/, "");
  const idpBaseUrl = strip(config.idpBaseUrl ?? DEFAULTS.idpBaseUrl);
  const apiBaseUrl = strip(config.apiBaseUrl ?? DEFAULTS.apiBaseUrl);
  const fedcmBaseUrl = strip(config.fedcmBaseUrl ?? DEFAULTS.fedcmBaseUrl);
  const allowedApiOrigins = (config.allowedApiOrigins ?? []).map((entry) => {
    try {
      return new URL(entry).origin;
    } catch {
      throw new AuthError(
        "INVALID_CONFIG",
        `allowedApiOrigins entry is not a valid absolute URL: ${entry}`,
      );
    }
  });
  const redirectUri =
    config.redirectUri ??
    (typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback`
      : "http://localhost/auth/callback");
  const logoutRedirectUri =
    config.logoutRedirectUri ??
    (typeof window !== "undefined" ? window.location.href : redirectUri);

  return {
    clientId: config.clientId,
    idpBaseUrl,
    apiBaseUrl,
    allowedApiOrigins,
    redirectUri,
    logoutRedirectUri,
    scopes: config.scopes ?? [...DEFAULTS.scopes],
    fedcmBaseUrl,
    fedcmConfigUrl: config.fedcmConfigUrl ?? DEFAULTS.fedcmConfigUrl,
    installationId: config.installationId,
    skipFedCM: config.skipFedCM ?? false,
    timeouts: { ...DEFAULTS.timeouts, ...(config.timeouts ?? {}) },
    fedcm: config.fedcm ?? {},
  };
}

/**
 * Resolves a `fetch()` path against `cfg.apiBaseUrl`. A relative path (no
 * scheme) is prefixed with `apiBaseUrl` unchanged. An absolute URL is
 * returned as-is only when its origin matches `apiBaseUrl` or is listed in
 * `cfg.allowedApiOrigins`; any other origin throws `INVALID_CONFIG`.
 */
export function resolveApiUrl(cfg: ResolvedConfig, path: string): string {
  if (/^https?:\/\//i.test(path)) {
    const origin = new URL(path).origin;
    const allowed = new Set([
      new URL(cfg.apiBaseUrl).origin,
      ...cfg.allowedApiOrigins,
    ]);
    if (!allowed.has(origin)) {
      throw new AuthError(
        "INVALID_CONFIG",
        `API origin not allowed: ${origin}`,
      );
    }
    return path;
  }
  return `${cfg.apiBaseUrl}${path}`;
}

export function namespaceOf(cfg: {
  clientId: string;
  idpBaseUrl: string;
}): string {
  return `${cfg.clientId}::${cfg.idpBaseUrl}`;
}
