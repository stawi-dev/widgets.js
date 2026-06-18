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

export function namespaceOf(cfg: {
  clientId: string;
  idpBaseUrl: string;
}): string {
  return `${cfg.clientId}::${cfg.idpBaseUrl}`;
}
