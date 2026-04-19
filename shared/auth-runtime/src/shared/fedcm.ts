import type { ResolvedConfig } from "./types.js";
import { fetchT } from "../worker/fetchWithTimeout.js";

export interface FedCMAttemptOptions {
  mediation: CredentialMediationRequirement;
  mode?: "passive" | "active";
  nonce?: string;
  signal?: AbortSignal;
}

export type FedCMOutcome =
  | { kind: "token"; token: string; autoSelected: boolean }
  | { kind: "no-session"; loginUrl?: string }
  | { kind: "dismissed" }
  | { kind: "not-allowed" }
  | { kind: "aborted" }
  | { kind: "unsupported" }
  | { kind: "error"; message: string; code?: string; url?: string };

export interface FedCMConfigProbe {
  available: boolean;
  loginUrl?: string;
}

const SESSION_STORAGE_PREFIX = "stawi:fedcm:probe:";
const memoryProbeCache = new Map<string, FedCMConfigProbe>();

function readProbeCache(key: string): FedCMConfigProbe | undefined {
  const fromMemory = memoryProbeCache.get(key);
  if (fromMemory) return fromMemory;
  try {
    if (typeof sessionStorage === "undefined") return undefined;
    const raw = sessionStorage.getItem(SESSION_STORAGE_PREFIX + key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as FedCMConfigProbe;
    memoryProbeCache.set(key, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

function writeProbeCache(key: string, value: FedCMConfigProbe): void {
  memoryProbeCache.set(key, value);
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(SESSION_STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    // ignore — memory cache still holds it
  }
}

export function _resetProbeCache(): void {
  memoryProbeCache.clear();
  try {
    if (typeof sessionStorage === "undefined") return;
    const toRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(SESSION_STORAGE_PREFIX)) toRemove.push(k);
    }
    for (const k of toRemove) sessionStorage.removeItem(k);
  } catch {
    // ignore
  }
}

export function isFedCMSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "IdentityCredential" in window &&
    typeof navigator.credentials?.get === "function"
  );
}

export async function probeFedCMConfig(cfg: ResolvedConfig): Promise<FedCMConfigProbe> {
  const key = cfg.idpBaseUrl + cfg.fedcmConfigUrl;
  const cached = readProbeCache(key);
  if (cached) return cached;

  const url = `${cfg.idpBaseUrl}${cfg.fedcmConfigUrl}`;
  let probe: FedCMConfigProbe = { available: false };
  try {
    const r = await fetchT(
      url,
      { method: "GET", headers: { Accept: "application/json" }, credentials: "omit" },
      cfg.timeouts.discovery,
    );
    if (r.ok) {
      try {
        const body = (await r.json()) as unknown;
        const loginUrl =
          body && typeof body === "object" && typeof (body as Record<string, unknown>).login_url === "string"
            ? ((body as Record<string, unknown>).login_url as string)
            : undefined;
        probe = loginUrl ? { available: true, loginUrl } : { available: true };
      } catch {
        probe = { available: false };
      }
    } else {
      probe = { available: false };
    }
  } catch {
    probe = { available: false };
  }
  writeProbeCache(key, probe);
  return probe;
}

export async function attemptFedCM(
  cfg: ResolvedConfig,
  opts: FedCMAttemptOptions,
): Promise<FedCMOutcome> {
  if (!isFedCMSupported() || cfg.skipFedCM) return { kind: "unsupported" };

  const probe = await probeFedCMConfig(cfg);
  if (!probe.available) return { kind: "unsupported" };

  const provider: IdentityProviderConfig = {
    configURL: `${cfg.idpBaseUrl}${cfg.fedcmConfigUrl}`,
    clientId: cfg.clientId,
    nonce: opts.nonce,
    fields: cfg.fedcm.fields,
    loginHint: cfg.fedcm.loginHint,
    domainHint: cfg.fedcm.domainHint,
    params: cfg.fedcm.params,
  };

  try {
    const credential = (await navigator.credentials.get({
      identity: {
        providers: [provider],
        context: "signin",
        mode: opts.mode ?? "passive",
      },
      mediation: opts.mediation,
      signal: opts.signal,
    })) as (IdentityCredential & { type?: string }) | null;

    if (credential && (credential.type === "identity" || typeof credential.token === "string")) {
      return {
        kind: "token",
        token: credential.token,
        autoSelected: !!credential.isAutoSelected,
      };
    }
    return { kind: "error", message: "FedCM returned no credential" };
  } catch (err) {
    const e = err as Error & { code?: string; url?: string };
    const name = e?.name ?? "";

    if (name === "AbortError") return { kind: "aborted" };
    if (name === "NetworkError") {
      return { kind: "no-session", loginUrl: probe.loginUrl };
    }
    if (name === "NotAllowedError") {
      return opts.mediation === "silent" ? { kind: "not-allowed" } : { kind: "dismissed" };
    }

    const ICError =
      typeof IdentityCredentialError !== "undefined" ? IdentityCredentialError : undefined;
    if ((ICError && err instanceof ICError) || name === "IdentityCredentialError") {
      return {
        kind: "error",
        message: e.message ?? "IdentityCredentialError",
        code: e.code,
        url: e.url,
      };
    }

    return { kind: "error", message: e?.message ?? "FedCM failed" };
  }
}
