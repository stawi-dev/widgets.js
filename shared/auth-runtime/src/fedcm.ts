import type { ResolvedConfig, TokenSet } from "./types.js";
import { AuthError } from "./errors.js";
import { TokenManager } from "./token-manager.js";

export function isFedCMSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "IdentityCredential" in window &&
    typeof navigator.credentials?.get === "function"
  );
}

export async function attemptFedCM(
  config: ResolvedConfig,
  tokenManager: TokenManager,
  mediation: CredentialMediationRequirement,
): Promise<TokenSet | null> {
  if (!isFedCMSupported()) {
    return null;
  }

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

    if (!credential?.token) {
      return null;
    }

    // Exchange the FedCM token for OAuth tokens
    const response = await fetch(`${config.idpBaseUrl}/oauth/token`, {
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
