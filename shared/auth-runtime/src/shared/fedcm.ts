import type { ResolvedConfig } from "./types.js";
import { fetchT } from "../worker/fetchWithTimeout.js";

const probeCache = new Map<string, boolean>();

export function isFedCMSupported(): boolean {
  return typeof window !== "undefined" && "IdentityCredential" in window
    && typeof navigator.credentials?.get === "function";
}

export async function isFedCMConfigAvailable(cfg: ResolvedConfig): Promise<boolean> {
  const key = cfg.idpBaseUrl + cfg.fedcmConfigUrl;
  const cached = probeCache.get(key);
  if (cached !== undefined) return cached;
  try {
    const r = await fetchT(`${cfg.idpBaseUrl}${cfg.fedcmConfigUrl}`, { method: "HEAD", credentials: "omit" }, cfg.timeouts.discovery);
    probeCache.set(key, r.ok);
    return r.ok;
  } catch {
    probeCache.set(key, false);
    return false;
  }
}

export async function attemptFedCM(
  cfg: ResolvedConfig, mediation: CredentialMediationRequirement,
): Promise<string | null> {
  if (!isFedCMSupported() || cfg.skipFedCM) return null;
  if (!(await isFedCMConfigAvailable(cfg))) return null;
  try {
    const credential = await navigator.credentials.get({
      identity: { providers: [{ configURL: `${cfg.idpBaseUrl}${cfg.fedcmConfigUrl}`, clientId: cfg.clientId }], context: "signin" },
      mediation,
    } as CredentialRequestOptions) as any;
    return credential?.token ?? null;
  } catch { return null; }
}
