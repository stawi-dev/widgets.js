// shared/auth-runtime/src/worker/api-proxy.ts
import type { ResolvedConfig, ApiResponse } from "../shared/types.js";
import { AuthError } from "../shared/errors.js";
import { resolveApiUrl } from "../shared/config.js";
import type { DpopContext } from "./dpop.js";
import { proof, rememberNonce } from "./dpop.js";
import { fetchT } from "./fetchWithTimeout.js";

export interface TokenProvider {
  accessToken: string;
  tokenType: "Bearer" | "DPoP";
  ensureFresh(
    force?: boolean,
  ): Promise<{ accessToken: string; tokenType: "Bearer" | "DPoP" }>;
  onRefresh(): void;
}

export interface FetchArgs {
  path: string;
  method: string;
  headers?: Record<string, string>;
  body?: string | ArrayBuffer | FormData | null;
  timeoutMs?: number;
}

export async function proxyFetch(
  cfg: ResolvedConfig,
  ctx: DpopContext,
  tp: TokenProvider,
  args: FetchArgs,
): Promise<ApiResponse<ArrayBuffer>> {
  const url = resolveApiUrl(cfg, args.path);
  const timeout = args.timeoutMs ?? cfg.timeouts.api;

  async function doCall(
    accessToken: string,
    tokenType: "Bearer" | "DPoP",
  ): Promise<Response> {
    const headers: Record<string, string> = { ...(args.headers ?? {}) };
    headers.Authorization = `${tokenType} ${accessToken}`;
    headers.Accept ??= "application/json";
    if (tokenType === "DPoP") {
      headers.DPoP = await proof(ctx, {
        htm: args.method,
        htu: url,
        accessToken,
      });
    }
    if (typeof args.body === "string" && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    return fetchT(
      url,
      { method: args.method, headers, body: args.body ?? undefined },
      timeout,
    );
  }

  const initial = await tp.ensureFresh(false);
  let res = await doCall(initial.accessToken, initial.tokenType);
  rememberNonce(ctx, url, res.headers);

  if (res.status === 401) {
    // try DPoP-nonce first
    if (res.headers.get("dpop-nonce")) {
      res = await doCall(initial.accessToken, initial.tokenType);
      rememberNonce(ctx, url, res.headers);
    }
  }
  if (res.status === 401) {
    // force refresh + retry once
    const fresh = await tp.ensureFresh(true);
    tp.onRefresh();
    res = await doCall(fresh.accessToken, fresh.tokenType);
    rememberNonce(ctx, url, res.headers);
  }

  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => "");
    const code =
      res.status === 401
        ? "API_UNAUTHORIZED"
        : res.status === 403
          ? "API_FORBIDDEN"
          : res.status === 404
            ? "API_NOT_FOUND"
            : res.status >= 500
              ? "API_SERVER_ERROR"
              : "API_VALIDATION";
    throw new AuthError(
      code,
      `API ${res.status}: ${text.slice(0, 200)}`,
      undefined,
      res.headers.get("x-trace-id") ?? undefined,
    );
  }

  const buf = res.status === 204 ? new ArrayBuffer(0) : await res.arrayBuffer();
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    headers[k] = v;
  });
  return { status: res.status, headers, body: buf };
}
