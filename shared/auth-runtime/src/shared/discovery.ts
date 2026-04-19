import { AuthError } from "./errors.js";
import type { ResolvedConfig } from "./types.js";
import { fetchT } from "../worker/fetchWithTimeout.js";

export interface OidcDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
  revocation_endpoint?: string;
  userinfo_endpoint?: string;
  jwks_uri?: string;
  dpop_signing_alg_values_supported?: string[];
}

const cache = new Map<string, OidcDiscovery>();
const inflight = new Map<string, Promise<OidcDiscovery>>();

export function clearDiscoveryCache() { cache.clear(); inflight.clear(); }

export function _setDiscoveryForTest(idpBaseUrl: string, doc: OidcDiscovery) {
  cache.set(idpBaseUrl.replace(/\/$/, ""), doc);
}

export function supportsDpop(d: OidcDiscovery): boolean {
  return (d.dpop_signing_alg_values_supported ?? []).includes("ES256");
}

export async function getDiscovery(
  idpBaseUrl: string,
  timeouts: ResolvedConfig["timeouts"],
): Promise<OidcDiscovery> {
  const key = idpBaseUrl.replace(/\/$/, "");
  const cached = cache.get(key);
  if (cached) return cached;
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = doFetch(key, timeouts.discovery)
    .then((d) => { cache.set(key, d); return d; })
    .finally(() => { inflight.delete(key); });
  inflight.set(key, p);
  return p;
}

async function doFetch(idp: string, timeoutMs: number): Promise<OidcDiscovery> {
  const url = `${idp}/.well-known/openid-configuration`;
  let res: Response;
  try { res = await fetchT(url, { credentials: "omit" }, timeoutMs); }
  catch (err) { throw new AuthError("DISCOVERY_FAILED", `discovery fetch failed ${url}`, err); }
  if (!res.ok) throw new AuthError("DISCOVERY_FAILED", `discovery HTTP ${res.status} ${url}`);
  let body: unknown;
  try { body = await res.json(); }
  catch (err) { throw new AuthError("DISCOVERY_FAILED", `discovery non-JSON ${url}`, err); }
  if (!isValid(body)) throw new AuthError("DISCOVERY_FAILED", `discovery missing fields ${url}`);
  return body;
}

function isValid(v: unknown): v is OidcDiscovery {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.issuer === "string"
    && typeof o.authorization_endpoint === "string"
    && typeof o.token_endpoint === "string";
}
