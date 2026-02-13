import type { AuthConfig, ResolvedConfig } from "./types.js";
import { AuthError } from "./errors.js";

const DEFAULTS = {
  idpBaseUrl: "https://oauth2.stawi.org",
  apiBaseUrl: "https://api.stawi.org",
  scopes: ["openid", "profile", "email"],
  fedcmConfigUrl: "/.well-known/web-identity",
} as const;

export function resolveConfig(config: AuthConfig): ResolvedConfig {
  if (!config.clientId) {
    throw new AuthError("INVALID_CONFIG", "clientId is required");
  }

  const idpBaseUrl = (config.idpBaseUrl ?? DEFAULTS.idpBaseUrl).replace(
    /\/$/,
    "",
  );
  const apiBaseUrl = (config.apiBaseUrl ?? DEFAULTS.apiBaseUrl).replace(
    /\/$/,
    "",
  );

  const redirectUri =
    config.redirectUri ??
    (typeof window !== "undefined"
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
  };
}
