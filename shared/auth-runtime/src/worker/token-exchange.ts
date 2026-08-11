// shared/auth-runtime/src/worker/token-exchange.ts
import type { ResolvedConfig, TokenSet } from "../shared/types.js";
import { AuthError } from "../shared/errors.js";
import { getDiscovery, supportsDpop } from "../shared/discovery.js";
import type { DpopContext } from "./dpop.js";
import { proof, rememberNonce, rememberClockOffset } from "./dpop.js";
import { fetchT } from "./fetchWithTimeout.js";

export type RefreshOutcome =
  | { outcome: "rotated"; tokens: TokenSet }
  | { outcome: "reuse_detected" }
  | { outcome: "network_error"; error: AuthError };

interface TokenEndpointResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  token_type?: unknown;
  id_token?: unknown;
}

function parseTokenBody(data: TokenEndpointResponse): TokenSet {
  const accessToken = data.access_token as string;
  const refreshToken = data.refresh_token as string;
  const expiresIn = (data.expires_in as number) ?? 300;
  const tokenType =
    ((data.token_type as string) ?? "Bearer").toLowerCase() === "dpop"
      ? "DPoP"
      : "Bearer";
  if (!accessToken || !refreshToken) {
    throw new AuthError(
      "TOKEN_EXCHANGE_FAILED",
      "missing access_token or refresh_token",
    );
  }
  return {
    accessToken,
    refreshToken,
    tokenType,
    expiresAt: Date.now() + expiresIn * 1000,
    idToken: typeof data.id_token === "string" ? data.id_token : undefined,
  };
}

async function postForm(
  cfg: ResolvedConfig,
  ctx: DpopContext,
  useDpop: boolean,
  form: URLSearchParams,
): Promise<Response> {
  const { token_endpoint } = await getDiscovery(cfg.idpBaseUrl, cfg.timeouts);
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (useDpop)
    headers.DPoP = await proof(ctx, { htm: "POST", htu: token_endpoint });
  let res = await fetchT(
    token_endpoint,
    { method: "POST", headers, body: form.toString() },
    cfg.timeouts.token,
  );
  // DPoP nonce retry
  if (useDpop && res.status === 401 && res.headers.get("dpop-nonce")) {
    rememberNonce(ctx, token_endpoint, res.headers);
    const headers2 = {
      ...headers,
      DPoP: await proof(ctx, { htm: "POST", htu: token_endpoint }),
    };
    res = await fetchT(
      token_endpoint,
      { method: "POST", headers: headers2, body: form.toString() },
      cfg.timeouts.token,
    );
  }
  // Clock skew retry
  if (useDpop && res.status === 400) {
    const txt = await res.clone().text();
    if (/invalid_dpop_proof/i.test(txt)) {
      rememberClockOffset(ctx, res.headers);
      const headers2 = {
        ...headers,
        DPoP: await proof(ctx, { htm: "POST", htu: token_endpoint }),
      };
      res = await fetchT(
        token_endpoint,
        { method: "POST", headers: headers2, body: form.toString() },
        cfg.timeouts.token,
      );
    }
  }
  rememberNonce(ctx, token_endpoint, res.headers);
  return res;
}

export async function exchangeCode(
  cfg: ResolvedConfig,
  ctx: DpopContext,
  args: { code: string; verifier: string },
): Promise<TokenSet> {
  const d = await getDiscovery(cfg.idpBaseUrl, cfg.timeouts);
  const useDpop = supportsDpop(d);
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: cfg.clientId,
    code: args.code,
    redirect_uri: cfg.redirectUri,
    code_verifier: args.verifier,
  });
  const res = await postForm(cfg, ctx, useDpop, form);
  if (!res.ok)
    throw new AuthError(
      "TOKEN_EXCHANGE_FAILED",
      `token exchange failed ${res.status}`,
    );
  return parseTokenBody(await res.json());
}

export async function exchangeFedcmIdToken(
  cfg: ResolvedConfig,
  ctx: DpopContext,
  idToken: string,
): Promise<TokenSet> {
  const d = await getDiscovery(cfg.idpBaseUrl, cfg.timeouts);
  const useDpop = supportsDpop(d);
  const form = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    client_id: cfg.clientId,
    subject_token: idToken,
    subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
  });
  const res = await postForm(cfg, ctx, useDpop, form);
  if (!res.ok)
    throw new AuthError(
      "TOKEN_EXCHANGE_FAILED",
      `FedCM token exchange failed ${res.status}`,
    );
  return parseTokenBody(await res.json());
}

export async function refreshTokens(
  cfg: ResolvedConfig,
  ctx: DpopContext,
  refreshToken: string,
): Promise<RefreshOutcome> {
  try {
    const d = await getDiscovery(cfg.idpBaseUrl, cfg.timeouts);
    const useDpop = supportsDpop(d);
    const form = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: cfg.clientId,
      refresh_token: refreshToken,
    });
    const res = await postForm(cfg, ctx, useDpop, form);
    if (res.ok)
      return { outcome: "rotated", tokens: parseTokenBody(await res.json()) };
    const body = await res.text().catch(() => "");
    if (res.status === 400 && /invalid_grant|reuse/i.test(body)) {
      return { outcome: "reuse_detected" };
    }
    return {
      outcome: "network_error",
      error: new AuthError(
        "TOKEN_REFRESH_FAILED",
        `refresh failed ${res.status} ${body}`,
      ),
    };
  } catch (err) {
    const e =
      err instanceof AuthError
        ? err
        : new AuthError("TOKEN_REFRESH_FAILED", "refresh failed", err);
    return { outcome: "network_error", error: e };
  }
}
