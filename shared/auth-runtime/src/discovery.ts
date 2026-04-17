import { AuthError } from "./errors.js";

/**
 * Subset of the OIDC discovery document this library relies on. The full
 * document from RFC 8414 has many more fields; we only validate the ones we
 * actually use so that non-standard IdPs still work as long as they advertise
 * the three endpoints we need.
 */
export interface OidcDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri?: string;
  end_session_endpoint?: string;
  revocation_endpoint?: string;
  userinfo_endpoint?: string;
}

const DISCOVERY_PATH = "/.well-known/openid-configuration";

interface CacheEntry {
  doc: OidcDiscovery;
}

// In-memory cache keyed by idpBaseUrl. Module-level so a single SPA session
// only fetches discovery once per IdP (each idpBaseUrl = one entry). Calls
// that arrive while a fetch is in flight are deduplicated via the
// `inflight` map.
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<OidcDiscovery>>();

/**
 * Clear the in-memory discovery cache. Intended primarily for tests; callers
 * generally should not need this in production.
 */
export function clearDiscoveryCache(): void {
  cache.clear();
  inflight.clear();
}

/**
 * Test-only: seed a discovery document for a given IdP base URL so that
 * subsequent calls to `getDiscovery` resolve synchronously without a
 * network fetch. Not part of the public API contract.
 */
export function _setDiscoveryForTest(
  idpBaseUrl: string,
  doc: OidcDiscovery,
): void {
  const key = idpBaseUrl.replace(/\/$/, "");
  cache.set(key, { doc });
}

/**
 * Fetch (or return a cached copy of) the OIDC discovery document for the
 * given IdP base URL. The URL is normalized — trailing slashes are stripped —
 * so `https://idp.example` and `https://idp.example/` share a cache entry.
 *
 * On success the document is cached for the lifetime of the page. On
 * failure nothing is cached, so the next call retries fresh.
 */
export function getDiscovery(idpBaseUrl: string): Promise<OidcDiscovery> {
  const key = idpBaseUrl.replace(/\/$/, "");

  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached.doc);

  const pending = inflight.get(key);
  if (pending) return pending;

  const p = doFetch(key)
    .then((doc) => {
      cache.set(key, { doc });
      return doc;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, p);
  return p;
}

async function doFetch(idpBaseUrl: string): Promise<OidcDiscovery> {
  const url = idpBaseUrl + DISCOVERY_PATH;

  let response: Response;
  try {
    response = await fetch(url, { credentials: "omit" });
  } catch (err) {
    throw new AuthError(
      "DISCOVERY_FAILED",
      `OIDC discovery fetch failed: ${url}`,
      err,
    );
  }

  if (!response.ok) {
    throw new AuthError(
      "DISCOVERY_FAILED",
      `OIDC discovery returned HTTP ${response.status}: ${url}`,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (err) {
    throw new AuthError(
      "DISCOVERY_FAILED",
      `OIDC discovery returned non-JSON body: ${url}`,
      err,
    );
  }

  if (!isDiscoveryDoc(body)) {
    throw new AuthError(
      "DISCOVERY_FAILED",
      `OIDC discovery response missing required fields (issuer, authorization_endpoint, token_endpoint): ${url}`,
    );
  }

  return body;
}

function isDiscoveryDoc(v: unknown): v is OidcDiscovery {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.issuer === "string" &&
    typeof o.authorization_endpoint === "string" &&
    typeof o.token_endpoint === "string"
  );
}
