import type { ResolvedConfig, TokenSet } from "./types.js";
import { AuthError } from "./errors.js";
import { TokenManager } from "./token-manager.js";
import { getDiscovery } from "./discovery.js";

export function isFedCMSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "IdentityCredential" in window &&
    typeof navigator.credentials?.get === "function"
  );
}

// Per-IdP availability probe cache. If the IdP does not publish a FedCM
// config file, the browser's credential probe is pointless — cache the
// negative result so subsequent attempts short-circuit instantly.
const fedcmConfigAvailable = new Map<string, boolean>();

async function isFedCMConfigAvailable(
  idpBaseUrl: string,
  fedcmConfigUrl: string,
): Promise<boolean> {
  const cached = fedcmConfigAvailable.get(idpBaseUrl);
  if (cached !== undefined) return cached;

  try {
    const res = await fetch(`${idpBaseUrl}${fedcmConfigUrl}`, {
      method: "HEAD",
      credentials: "omit",
    });
    const available = res.ok;
    fedcmConfigAvailable.set(idpBaseUrl, available);
    return available;
  } catch {
    fedcmConfigAvailable.set(idpBaseUrl, false);
    return false;
  }
}

/** Test-only: reset the FedCM availability cache. */
export function _clearFedCMCache(): void {
  fedcmConfigAvailable.clear();
}

export async function attemptFedCM(
  config: ResolvedConfig,
  tokenManager: TokenManager,
  mediation: CredentialMediationRequirement,
): Promise<TokenSet | null> {
  if (!isFedCMSupported()) return null;
  if (config.skipFedCM) return null;

  // Short-circuit if we've already learned the IdP doesn't publish FedCM.
  const available = await isFedCMConfigAvailable(
    config.idpBaseUrl,
    config.fedcmConfigUrl,
  );
  if (!available) return null;

  try {
    const credential = (await navigator.credentials.get({
      identity: {
        providers: [
          {
            configURL: `${config.idpBaseUrl}${config.fedcmConfigUrl}`,
            clientId: config.clientId,
          },
        ],
        context: "signin",
      },
      mediation,
    } as CredentialRequestOptions)) as IdentityCredential | null;

    if (!credential?.token) return null;

    // Exchange the FedCM token for OAuth tokens via the discovery-advertised
    // token endpoint — never a hardcoded path.
    const discovery = await getDiscovery(config.idpBaseUrl);
    const response = await fetch(discovery.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
        client_id: config.clientId,
        subject_token: credential.token,
        subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
      }),
    });

    if (!response.ok) {
      throw new AuthError(
        "TOKEN_EXCHANGE_FAILED",
        `FedCM token exchange failed: ${response.status}`,
      );
    }

    const data = await response.json();
    return tokenManager.parseTokenResponse(data);
  } catch (err) {
    if (err instanceof AuthError) throw err;
    // FedCM can fail silently (user dismissed, not configured, etc.)
    return null;
  }
}
