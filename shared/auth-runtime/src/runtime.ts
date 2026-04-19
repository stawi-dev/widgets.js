import type { AuthConfig, AuthState, SecurityEvent, ApiResponse } from "./shared/types.js";
import { AuthError } from "./shared/errors.js";
import { resolveConfig } from "./shared/config.js";
import { getDiscovery } from "./shared/discovery.js";
import { attemptFedCM, isFedCMSupported } from "./shared/fedcm.js";
import { createWorkerCore, type WorkerCore } from "./worker/auth-worker.js";

declare const __STAWI_AUTH_VERSION__: string | undefined;

export interface AuthRuntime {
  ensureAuthenticated(): Promise<void>;
  fetch<T = unknown>(path: string, init?: { method?: string; headers?: Record<string,string>; body?: string | ArrayBuffer | null; timeoutMs?: number }): Promise<T>;
  upload<T = unknown>(path: string, file: File): Promise<T>;
  getRoles(): Promise<string[]>;
  getClaims(): Promise<Record<string, unknown>>;
  logout(): Promise<void>;
  onAuthStateChange(cb: (s: AuthState) => void): () => void;
  onSecurityEvent(cb: (e: SecurityEvent) => void): () => void;
  getState(): AuthState;
  prefetchDiscovery(): Promise<void>;
  destroy(): void;
  readonly version: string;
}

export function createAuthRuntime(config: AuthConfig): AuthRuntime {
  const cfg = resolveConfig(config);
  let corePromise: Promise<WorkerCore> = createWorkerCore(cfg);
  let currentState: AuthState = "initializing";
  void corePromise.then((c) => { c.onState((s) => { currentState = s; }); });
  const version = typeof __STAWI_AUTH_VERSION__ === "string" ? __STAWI_AUTH_VERSION__ : "dev";

  // proactive FedCM probe on idle — main thread only
  if (typeof window !== "undefined" && isFedCMSupported() && !cfg.skipFedCM) {
    const run = async () => {
      const outcome = await attemptFedCM(cfg, { mediation: "silent" });
      if (outcome.kind !== "token") return;
      const core = await corePromise;
      if (core.state === "authenticated") return;
      await core.completeFedcm(outcome.token).catch(() => {});
    };
    if ("requestIdleCallback" in window) (window as any).requestIdleCallback(run, { timeout: 1500 });
    else setTimeout(run, 0);
  }

  async function ensureAuthenticated() {
    const core = await corePromise;
    if (core.state === "authenticated") return;
    // Try optional FedCM once
    const outcome = await attemptFedCM(cfg, { mediation: "optional" });
    if (outcome.kind === "token") { await core.completeFedcm(outcome.token); return; }
    // Fall through to popup (main-thread helper in separate module)
    const { runOAuthPopup } = await import("./oauth-popup.js");
    await runOAuthPopup(cfg, core);
  }

  async function parse<T>(body: ArrayBuffer, headers: Record<string,string>): Promise<T> {
    if (body.byteLength === 0) return undefined as T;
    const ct = headers["content-type"] ?? "";
    if (ct.includes("application/json")) {
      return JSON.parse(new TextDecoder().decode(body)) as T;
    }
    return new TextDecoder().decode(body) as unknown as T;
  }

  return {
    version,
    getState() { return currentState; },
    onAuthStateChange(cb) {
      let off: (() => void) | null = null;
      void corePromise.then(c => { off = c.onState(cb); });
      return () => { off?.(); };
    },
    onSecurityEvent(cb) {
      let off: (() => void) | null = null;
      void corePromise.then(c => { off = c.onSecurity(cb); });
      return () => { off?.(); };
    },
    ensureAuthenticated,
    async fetch<T = unknown>(path: string, init?: { method?: string; headers?: Record<string,string>; body?: string | ArrayBuffer | null; timeoutMs?: number }) {
      const core = await corePromise;
      const res = await core.fetch(path, { method: init?.method ?? "GET", headers: init?.headers, body: init?.body ?? null, timeoutMs: init?.timeoutMs });
      return parse<T>(res.body, res.headers);
    },
    async upload<T = unknown>(path: string, file: File) {
      const core = await corePromise;
      const bytes = await file.arrayBuffer();
      const res = await core.upload(path, { name: file.name, type: file.type, bytes });
      return parse<T>(res.body, res.headers);
    },
    async getRoles() { return (await corePromise).getRoles(); },
    async getClaims() { return (await corePromise).getClaims(); },
    async logout() { await (await corePromise).logout(); },
    async prefetchDiscovery() { await getDiscovery(cfg.idpBaseUrl, cfg.timeouts); },
    destroy() { void corePromise.then(c => c.destroy()); },
  };
}
