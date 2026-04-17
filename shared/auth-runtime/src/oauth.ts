import type { ResolvedConfig, TokenSet } from "./types.js";
import { AuthError } from "./errors.js";
import { generatePkcePair } from "./pkce.js";
import { TokenManager } from "./token-manager.js";
import { getDiscovery } from "./discovery.js";

const POPUP_WIDTH = 500;
const POPUP_HEIGHT = 600;
const POPUP_POLL_INTERVAL = 200;

function openPopup(url: string): Window {
  const left = window.screenX + (window.outerWidth - POPUP_WIDTH) / 2;
  const top = window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2;

  const popup = window.open(
    url,
    "antinvestor-auth",
    `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top},popup=yes`,
  );

  if (!popup) {
    throw new AuthError("OAUTH_POPUP_BLOCKED", "Authentication popup blocked");
  }

  return popup;
}

function waitForCallback(
  popup: Window,
  redirectUri: string,
): Promise<URLSearchParams> {
  return new Promise((resolve, reject) => {
    const redirectOrigin = new URL(redirectUri).origin;

    const interval = setInterval(() => {
      if (popup.closed) {
        clearInterval(interval);
        reject(
          new AuthError(
            "OAUTH_POPUP_CLOSED",
            "Authentication popup was closed",
          ),
        );
        return;
      }

      try {
        if (
          popup.location.origin === redirectOrigin &&
          popup.location.search
        ) {
          const params = new URLSearchParams(popup.location.search);
          clearInterval(interval);
          popup.close();
          resolve(params);
        }
      } catch {
        // Cross-origin — still waiting for redirect
      }
    }, POPUP_POLL_INTERVAL);
  });
}

export async function startOAuthPopup(
  config: ResolvedConfig,
  tokenManager: TokenManager,
): Promise<TokenSet> {
  // OIDC discovery drives the real endpoint paths. This is what prevents
  // the auth URL from 404-ing against IdPs that don't use /oauth/authorize
  // (notably Ory Hydra, which uses /oauth2/auth).
  const discovery = await getDiscovery(config.idpBaseUrl);

  const { verifier, challenge } = await generatePkcePair();
  const state = crypto.randomUUID();

  const authUrl = new URL(discovery.authorization_endpoint);
  authUrl.searchParams.set("client_id", config.clientId);
  authUrl.searchParams.set("redirect_uri", config.redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", config.scopes.join(" "));
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  if (config.installationId) {
    authUrl.searchParams.set("installation_id", config.installationId);
  }

  const popup = openPopup(authUrl.toString());
  const params = await waitForCallback(popup, config.redirectUri);

  const error = params.get("error");
  if (error) {
    throw new AuthError(
      "OAUTH_FAILED",
      `OAuth error: ${error} — ${params.get("error_description") ?? ""}`,
    );
  }

  const code = params.get("code");
  const returnedState = params.get("state");

  if (!code || returnedState !== state) {
    throw new AuthError(
      "OAUTH_FAILED",
      "Invalid OAuth callback: missing code or state mismatch",
    );
  }

  const tokenResponse = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      code,
      redirect_uri: config.redirectUri,
      code_verifier: verifier,
    }),
  });

  if (!tokenResponse.ok) {
    throw new AuthError(
      "TOKEN_EXCHANGE_FAILED",
      `Token exchange failed: ${tokenResponse.status}`,
    );
  }

  const data = await tokenResponse.json();
  return tokenManager.parseTokenResponse(data);
}
