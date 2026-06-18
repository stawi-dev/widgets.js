import type {
  AuthConfig,
  AuthState,
  SecurityEvent,
  FedCMEvent,
  FedCMEventCallback,
  FedCMOutcome,
} from "./shared/types.js";
import { AuthError } from "./shared/errors.js";
import { resolveConfig } from "./shared/config.js";
import { getDiscovery } from "./shared/discovery.js";
import {
  attemptFedCM,
  isFedCMSupported,
  probeFedCMConfig,
} from "./shared/fedcm.js";
import { decodeJwtPayload } from "./shared/jwt.js";
import { startRedirect, completeRedirect } from "./oauth-redirect.js";
import { createWorkerCore, type WorkerCore } from "./worker/auth-worker.js";

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function resolveNonce(cfg: {
  fedcm: { nonce?: () => string | Promise<string> };
}): Promise<string> {
  if (cfg.fedcm?.nonce) {
    const value = await cfg.fedcm.nonce();
    if (typeof value === "string" && value.length > 0) return value;
  }
  return generateNonce();
}

function assertFedcmIss(idToken: string, idpBaseUrl: string): void {
  const claims = decodeJwtPayload(idToken);
  const iss = claims.iss;
  if (typeof iss !== "string" || iss.replace(/\/$/, "") !== idpBaseUrl) {
    throw new AuthError("FEDCM_ISS_MISMATCH", "FedCM iss mismatch");
  }
}

declare const __STAWI_AUTH_VERSION__: string | undefined;

export interface AuthRuntime {
  ensureAuthenticated(): Promise<void>;
  /**
   * Completes the OIDC redirect flow on the callback page. Reads
   * `?code=` + `?state=` from `window.location.search` and the
   * matching verifier from sessionStorage; exchanges the code for
   * tokens via the worker. Returns the `returnTo` URL stashed by the
   * earlier `startRedirect` so the caller can route the user back to
   * where they started (or to a fixed landing page).
   *
   * Mutually exclusive with `ensureAuthenticated()` — the host page
   * calls one or the other depending on whether it is the "sign-in"
   * trigger or the `/auth/callback/` landing page.
   */
  completeRedirect(): Promise<{ returnTo: string }>;
  fetch<T = unknown>(
    path: string,
    init?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string | ArrayBuffer | null;
      timeoutMs?: number;
    },
  ): Promise<T>;
  upload<T = unknown>(path: string, file: File): Promise<T>;
  getRoles(): Promise<string[]>;
  getClaims(): Promise<Record<string, unknown>>;
  logout(options?: { redirectToIdP?: boolean }): Promise<void>;
  onAuthStateChange(cb: (s: AuthState) => void): () => void;
  onSecurityEvent(cb: (e: SecurityEvent) => void): () => void;
  onFedcmEvent(cb: FedCMEventCallback): () => void;
  getState(): AuthState;
  prefetchDiscovery(): Promise<void>;
  destroy(): void;
  readonly version: string;
}

export function createAuthRuntime(config: AuthConfig): AuthRuntime {
  const cfg = resolveConfig(config);
  const runtimeAbort = new AbortController();
  const corePromise: Promise<WorkerCore> = createWorkerCore(cfg);
  let currentState: AuthState = "initializing";
  void corePromise.then((c) => {
    c.onState((s) => {
      currentState = s;
    });
  });
  const version =
    typeof __STAWI_AUTH_VERSION__ === "string" ? __STAWI_AUTH_VERSION__ : "dev";

  const fedcmListeners = new Set<FedCMEventCallback>();
  function emitFedcmEvent(event: FedCMEvent) {
    for (const cb of fedcmListeners) {
      try {
        cb(event);
      } catch {
        /* listener error should not break runtime */
      }
    }
  }

  // proactive FedCM probe on idle — main thread only
  if (typeof window !== "undefined" && isFedCMSupported() && !cfg.skipFedCM) {
    const run = async () => {
      if (runtimeAbort.signal.aborted) return;
      // Emit probe telemetry (best-effort).
      try {
        const probe = await probeFedCMConfig(cfg);
        emitFedcmEvent({
          type: "probe",
          available: probe.available,
          loginUrl: probe.loginUrl,
        });
      } catch {
        /* ignore */
      }
      const nonce = await resolveNonce(cfg);
      emitFedcmEvent({ type: "attempt", mediation: "silent", mode: "passive" });
      const outcome = await attemptFedCM(cfg, {
        mediation: "silent",
        mode: "passive",
        nonce,
        signal: runtimeAbort.signal,
      });
      emitFedcmEvent({ type: "outcome", outcome });
      if (outcome.kind !== "token") return;
      const core = await corePromise;
      if (core.state === "authenticated") return;
      try {
        assertFedcmIss(outcome.token, cfg.idpBaseUrl);
      } catch {
        return;
      }
      await core.completeFedcm(outcome.token, nonce).catch(() => {});
    };
    if ("requestIdleCallback" in window)
      (
        window as unknown as {
          requestIdleCallback: (cb: () => void, o?: unknown) => void;
        }
      ).requestIdleCallback(run, { timeout: 1500 });
    else setTimeout(run, 0);
  }

  async function tryFedcm(
    mediation: "silent" | "optional" | "required",
    mode: "passive" | "active",
    nonce: string,
  ): Promise<FedCMOutcome> {
    emitFedcmEvent({ type: "attempt", mediation, mode });
    const outcome = await attemptFedCM(cfg, {
      mediation,
      mode,
      nonce,
      signal: runtimeAbort.signal,
    });
    emitFedcmEvent({ type: "outcome", outcome });
    return outcome;
  }

  async function ensureAuthenticated() {
    const core = await corePromise;
    if (core.state === "authenticated") return;
    const nonce = await resolveNonce(cfg);

    // First attempt: active mode (Chrome 132+). Older browsers ignore `mode`
    // and run in legacy mode — harmless.
    const outcome = await tryFedcm("optional", "active", nonce);

    if (outcome.kind === "token") {
      assertFedcmIss(outcome.token, cfg.idpBaseUrl);
      await core.completeFedcm(outcome.token, nonce);
      return;
    }

    // For every non-token FedCM outcome (no-session, dismissed, not-allowed,
    // unsupported, error) we fall through to the OAuth redirect. The IdP's
    // authorize endpoint handles both "needs login" and "session exists"
    // server-side; we no longer try to open a separate IdP-login popup
    // because that path is popup-blocker-prone and the redirect handles
    // both cases identically. `aborted` is the one terminal — the user
    // explicitly dismissed FedCM in active mode, so we surface that as
    // a non-retryable error.
    if (outcome.kind === "aborted") {
      throw new AuthError("OAUTH_FAILED", "user dismissed sign-in");
    }
    await startRedirect(cfg, core);
  }

  async function parse<T>(
    body: ArrayBuffer,
    headers: Record<string, string>,
  ): Promise<T> {
    if (body.byteLength === 0) return undefined as T;
    const ct = headers["content-type"] ?? "";
    if (ct.includes("application/json")) {
      return JSON.parse(new TextDecoder().decode(body)) as T;
    }
    return new TextDecoder().decode(body) as unknown as T;
  }

  return {
    version,
    getState() {
      return currentState;
    },
    onAuthStateChange(cb) {
      let off: (() => void) | null = null;
      void corePromise.then((c) => {
        off = c.onState(cb);
      });
      return () => {
        off?.();
      };
    },
    onSecurityEvent(cb) {
      let off: (() => void) | null = null;
      void corePromise.then((c) => {
        off = c.onSecurity(cb);
      });
      return () => {
        off?.();
      };
    },
    onFedcmEvent(cb) {
      fedcmListeners.add(cb);
      return () => {
        fedcmListeners.delete(cb);
      };
    },
    ensureAuthenticated,
    async completeRedirect() {
      const core = await corePromise;
      return completeRedirect(cfg, core);
    },
    async fetch<T = unknown>(
      path: string,
      init?: {
        method?: string;
        headers?: Record<string, string>;
        body?: string | ArrayBuffer | null;
        timeoutMs?: number;
      },
    ) {
      const core = await corePromise;
      const res = await core.fetch(path, {
        method: init?.method ?? "GET",
        headers: init?.headers,
        body: init?.body ?? null,
        timeoutMs: init?.timeoutMs,
      });
      return parse<T>(res.body, res.headers);
    },
    async upload<T = unknown>(path: string, file: File) {
      const core = await corePromise;
      const bytes = await file.arrayBuffer();
      const res = await core.upload(path, {
        name: file.name,
        type: file.type,
        bytes,
      });
      return parse<T>(res.body, res.headers);
    },
    async getRoles() {
      return (await corePromise).getRoles();
    },
    async getClaims() {
      return (await corePromise).getClaims();
    },
    async logout(options?: { redirectToIdP?: boolean }) {
      const logoutResult = await (await corePromise).logout();
      try {
        const psa = navigator.credentials?.preventSilentAccess;
        if (typeof psa === "function") {
          await psa.call(navigator.credentials);
        }
      } catch {
        /* best-effort */
      }
      try {
        const IC = (
          globalThis as { IdentityCredential?: IdentityCredentialConstructor }
        ).IdentityCredential;
        if (IC && typeof IC.disconnect === "function") {
          await IC.disconnect({
            configURL: `${cfg.fedcmBaseUrl}${cfg.fedcmConfigUrl}`,
            clientId: cfg.clientId,
          });
        }
      } catch {
        /* best-effort */
      }
      emitFedcmEvent({ type: "disconnected" });
      if (
        options?.redirectToIdP &&
        logoutResult.endSessionUrl &&
        typeof window !== "undefined"
      ) {
        window.location.assign(logoutResult.endSessionUrl);
      }
    },
    async prefetchDiscovery() {
      await getDiscovery(cfg.idpBaseUrl, cfg.timeouts);
    },
    destroy() {
      runtimeAbort.abort();
      void corePromise.then((c) => c.destroy());
    },
  };
}
