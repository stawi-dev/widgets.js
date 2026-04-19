import type { AuthState, ResolvedConfig, TokenSet, SecurityEvent } from "../shared/types.js";
import { AuthError } from "../shared/errors.js";
import { namespaceOf } from "../shared/config.js";
import { getDiscovery, supportsDpop } from "../shared/discovery.js";
import { generatePkcePair } from "../shared/pkce.js";
import { generateDpopKey, generateWrapKey, wrap, unwrap } from "./crypto.js";
import { makeDpopContext, type DpopContext } from "./dpop.js";
import { exchangeCode, exchangeFedcmIdToken, refreshTokens } from "./token-exchange.js";
import { loadSession, saveSession, clearSession, type Session } from "./store.js";
import { openChannel, withRefreshLock } from "./coordination.js";
import { proxyFetch } from "./api-proxy.js";
import { reduce } from "./state-machine.js";
import { decodeJwtPayload } from "../shared/jwt.js";

const REFRESH_BUFFER_MS = 60_000;
const MAX_TIMER_MS = 24 * 60 * 60 * 1000;

export interface WorkerCore {
  state: AuthState;
  namespace: string;
  prepareAuth(): Promise<{ authUrl: string; state: string; verifier: string }>;
  completeAuth(args: { code: string; verifier: string; state: string; expectedState: string }): Promise<void>;
  completeFedcm(idToken: string, expectedNonce?: string): Promise<void>;
  getAccessToken(forceRefresh?: boolean): Promise<{ accessToken: string; tokenType: "Bearer"|"DPoP" }>;
  fetch(path: string, init: { method: string; headers?: Record<string,string>; body?: ArrayBuffer|string|null; timeoutMs?: number }): Promise<{ status: number; headers: Record<string,string>; body: ArrayBuffer }>;
  upload(path: string, file: { name: string; type: string; bytes: ArrayBuffer }, timeoutMs?: number): Promise<{ status: number; headers: Record<string,string>; body: ArrayBuffer }>;
  getRoles(): Promise<string[]>;
  getClaims(): Promise<Record<string, unknown>>;
  logout(): Promise<void>;
  destroy(): void;
  onState(cb: (s: AuthState) => void): () => void;
  onSecurity(cb: (e: SecurityEvent) => void): () => void;
}

export async function createWorkerCore(cfg: ResolvedConfig): Promise<WorkerCore> {
  const namespace = namespaceOf(cfg);
  const channel = openChannel(namespace);
  let state: AuthState = "initializing";
  let tokens: TokenSet | null = null;
  let wrapKey: CryptoKey | null = null;
  let dpopCtx: DpopContext | null = null;
  let session: Session | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let refreshInFlight: Promise<{ accessToken: string; tokenType: "Bearer"|"DPoP" }> | null = null;
  const stateListeners = new Set<(s: AuthState) => void>();
  const secListeners = new Set<(e: SecurityEvent) => void>();

  function setState(next: AuthState) {
    if (state === next) return;
    state = next;
    for (const cb of stateListeners) { try { cb(state); } catch {} }
  }

  function emitSecurity(event: SecurityEvent) {
    for (const cb of secListeners) { try { cb(event); } catch {} }
    channel.postMessage({ type: "security-wipe", event });
  }

  function cancelTimer() { if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; } }

  function scheduleRefresh() {
    cancelTimer();
    if (!tokens) return;
    const delay = Math.max(0, Math.min(MAX_TIMER_MS, tokens.expiresAt - Date.now() - REFRESH_BUFFER_MS));
    refreshTimer = setTimeout(() => { void ensureFreshAccess(true).catch(() => {}); }, delay);
  }

  async function persistTokens(newTokens: TokenSet): Promise<void> {
    if (!wrapKey || !dpopCtx || !session) throw new AuthError("INVALID_CONFIG", "persistTokens without init");
    const wrapped = await wrap(wrapKey, newTokens.refreshToken);
    session = { ...session, wrappedRT: wrapped, lastIdToken: newTokens.idToken ?? session.lastIdToken };
    await saveSession(namespace, session);
    tokens = newTokens;
    scheduleRefresh();
    channel.postMessage({ type: "tokens-updated", expiresAt: newTokens.expiresAt });
  }

  async function wipe(reason: SecurityEvent["type"]): Promise<void> {
    cancelTimer();
    tokens = null; wrapKey = null; dpopCtx = null; session = null;
    await clearSession(namespace).catch(() => {});
    emitSecurity({ type: reason, at: Date.now() });
    setState(reduce(state, { kind: "security_wipe", reason }));
  }

  // ----- init -----
  try {
    const loaded = await loadSession(namespace);
    if (loaded) {
      session = loaded;
      const lwk = loaded.wrapKey;
      const ldk = loaded.dpopKey;
      if (!lwk || !ldk) {
        await wipe("storage_corruption");
      } else {
        wrapKey = lwk;
        dpopCtx = await makeDpopContext(ldk);
        const rt = await unwrap(wrapKey, loaded.wrappedRT).catch(() => null);
        if (!rt) {
          await wipe("storage_corruption");
        } else {
          // leave tokens null; will refresh on first getAccessToken
          tokens = { accessToken: "", refreshToken: rt, expiresAt: 0, tokenType: "Bearer", idToken: loaded.lastIdToken };
          setState("authenticated");
        }
      }
    } else {
      setState("unauthenticated");
    }
  } catch {
    setState("unauthenticated");
  }

  // ----- handlers -----

  async function prepareAuth() {
    const { verifier, challenge } = await generatePkcePair();
    const s = crypto.randomUUID();
    const d = await getDiscovery(cfg.idpBaseUrl, cfg.timeouts);
    const u = new URL(d.authorization_endpoint);
    u.searchParams.set("client_id", cfg.clientId);
    u.searchParams.set("redirect_uri", cfg.redirectUri);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", cfg.scopes.join(" "));
    u.searchParams.set("state", s);
    u.searchParams.set("code_challenge", challenge);
    u.searchParams.set("code_challenge_method", "S256");
    if (cfg.installationId) u.searchParams.set("installation_id", cfg.installationId);
    if (supportsDpop(d)) u.searchParams.set("dpop_jkt", "-");   // hydra hint
    return { authUrl: u.toString(), state: s, verifier };
  }

  async function completeAuth(args: { code: string; verifier: string; state: string; expectedState: string }) {
    if (args.state !== args.expectedState) throw new AuthError("OAUTH_STATE_MISMATCH", "state mismatch");
    const kp = await generateDpopKey();
    const wk = await generateWrapKey();
    const ctx = await makeDpopContext(kp);
    const newTokens = await exchangeCode(cfg, ctx, { code: args.code, verifier: args.verifier });
    const wrapped = await wrap(wk, newTokens.refreshToken);
    const s: Session = { wrapKey: wk, dpopKey: kp, wrappedRT: wrapped, lastIdToken: newTokens.idToken, updatedAt: Date.now() };
    await saveSession(namespace, s);
    wrapKey = wk; dpopCtx = ctx; session = s; tokens = newTokens;
    scheduleRefresh();
    setState(reduce(state, { kind: "sign_in_done" }));
  }

  async function completeFedcm(idToken: string, expectedNonce?: string) {
    const claims = decodeJwtPayload(idToken);
    const iss = claims.iss;
    if (typeof iss !== "string" || iss.replace(/\/$/, "") !== cfg.idpBaseUrl) {
      throw new AuthError("FEDCM_ISS_MISMATCH", "FedCM iss mismatch");
    }
    if (typeof expectedNonce === "string" && expectedNonce.length > 0) {
      if (claims.nonce !== expectedNonce) {
        throw new AuthError("FEDCM_NONCE_MISMATCH", "FedCM id_token nonce mismatch");
      }
    }
    const kp = await generateDpopKey();
    const wk = await generateWrapKey();
    const ctx = await makeDpopContext(kp);
    const newTokens = await exchangeFedcmIdToken(cfg, ctx, idToken);
    const wrapped = await wrap(wk, newTokens.refreshToken);
    const s: Session = { wrapKey: wk, dpopKey: kp, wrappedRT: wrapped, lastIdToken: newTokens.idToken, updatedAt: Date.now() };
    await saveSession(namespace, s);
    wrapKey = wk; dpopCtx = ctx; session = s; tokens = newTokens;
    scheduleRefresh();
    setState(reduce(state, { kind: "sign_in_done" }));
  }

  async function ensureFreshAccess(force = false) {
    if (!tokens || !dpopCtx || !wrapKey) throw new AuthError("TOKEN_EXPIRED", "not authenticated");
    const nearExpiry = Date.now() >= tokens.expiresAt - REFRESH_BUFFER_MS;
    if (!force && !nearExpiry && tokens.accessToken) {
      return { accessToken: tokens.accessToken, tokenType: tokens.tokenType };
    }
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = withRefreshLock(namespace, async () => {
      // Re-read RT from IDB — peer may have rotated.
      const fresh = await loadSession(namespace);
      if (fresh && fresh.wrapKey) {
        const rt = await unwrap(fresh.wrapKey, fresh.wrappedRT);
        if (tokens && rt !== tokens.refreshToken) tokens = { ...tokens, refreshToken: rt };
      }
      setState(reduce(state, { kind: "refresh_start" }));
      const outcome = await refreshTokens(cfg, dpopCtx!, tokens!.refreshToken);
      if (outcome.outcome === "rotated") {
        await persistTokens(outcome.tokens);
        setState(reduce(state, { kind: "refresh_done" }));
        return { accessToken: outcome.tokens.accessToken, tokenType: outcome.tokens.tokenType };
      }
      if (outcome.outcome === "reuse_detected") {
        await wipe("refresh_reuse_detected");
        throw new AuthError("REFRESH_REUSE_DETECTED", "refresh token reuse detected");
      }
      setState(reduce(state, { kind: "refresh_fail", error: { code: outcome.error.code, message: outcome.error.message, retryable: outcome.error.retryable }, wipe: false }));
      throw outcome.error;
    }).finally(() => { refreshInFlight = null; });
    return refreshInFlight;
  }

  async function apiFetch(path: string, init: { method: string; headers?: Record<string,string>; body?: ArrayBuffer|string|null; timeoutMs?: number }) {
    if (!dpopCtx || !tokens) throw new AuthError("TOKEN_EXPIRED", "not authenticated");
    const fresh = await ensureFreshAccess();
    return proxyFetch(cfg, dpopCtx, {
      accessToken: fresh.accessToken, tokenType: fresh.tokenType,
      ensureFresh: async (force) => ensureFreshAccess(force),
      onRefresh: () => {},
    }, { path, method: init.method, headers: init.headers, body: init.body ?? undefined, timeoutMs: init.timeoutMs });
  }

  async function apiUpload(path: string, file: { name: string; type: string; bytes: ArrayBuffer }, timeoutMs?: number) {
    if (!dpopCtx || !tokens) throw new AuthError("TOKEN_EXPIRED", "not authenticated");
    const fresh = await ensureFreshAccess();
    const form = new FormData();
    form.append("file", new Blob([file.bytes], { type: file.type }), file.name);
    return proxyFetch(cfg, dpopCtx, {
      accessToken: fresh.accessToken, tokenType: fresh.tokenType,
      ensureFresh: async (force) => ensureFreshAccess(force),
      onRefresh: () => {},
    }, { path, method: "PUT", body: form as any, timeoutMs: timeoutMs ?? cfg.timeouts.upload });
  }

  async function getRoles() {
    const fresh = await ensureFreshAccess();
    try {
      const p = decodeJwtPayload(fresh.accessToken);
      if (Array.isArray(p.roles)) return (p.roles as unknown[]).filter((r): r is string => typeof r === "string");
      const r = (p.realm_access as any)?.roles;
      if (Array.isArray(r)) return (r as unknown[]).filter((x): x is string => typeof x === "string");
      return [];
    } catch { return []; }
  }

  async function getClaims(): Promise<Record<string, unknown>> {
    const fresh = await ensureFreshAccess();
    return decodeJwtPayload(fresh.accessToken);
  }

  async function logout() {
    cancelTimer();
    const d = await getDiscovery(cfg.idpBaseUrl, cfg.timeouts).catch(() => null);
    if (d?.end_session_endpoint && session?.lastIdToken) {
      const form = new URLSearchParams({
        client_id: cfg.clientId, id_token_hint: session.lastIdToken,
      });
      if (cfg.redirectUri) form.set("post_logout_redirect_uri", cfg.redirectUri);
      await fetch(d.end_session_endpoint, { method: "POST", body: form, headers: { "Content-Type": "application/x-www-form-urlencoded" } })
        .catch(() => {});
    }
    if (d?.revocation_endpoint && tokens?.refreshToken) {
      const form = new URLSearchParams({ client_id: cfg.clientId, token: tokens.refreshToken, token_type_hint: "refresh_token" });
      await fetch(d.revocation_endpoint, { method: "POST", body: form, headers: { "Content-Type": "application/x-www-form-urlencoded" } })
        .catch(() => {});
    }
    tokens = null; wrapKey = null; dpopCtx = null; session = null;
    await clearSession(namespace).catch(() => {});
    channel.postMessage({ type: "logout" });
    setState(reduce(state, { kind: "logout" }));
  }

  function destroy() {
    cancelTimer();
    stateListeners.clear();
    secListeners.clear();
    channel.close();
  }

  channel.onmessage = (ev) => {
    const data = ev.data as { type?: string };
    if (data?.type === "logout") { void wipe("logged_out_elsewhere"); }
    if (data?.type === "tokens-updated") { /* peer rotated; next ensureFreshAccess reloads */ }
  };

  return {
    get state() { return state; },
    namespace,
    prepareAuth, completeAuth, completeFedcm,
    getAccessToken: ensureFreshAccess,
    fetch: apiFetch, upload: apiUpload,
    getRoles, getClaims, logout, destroy,
    onState: (cb) => { stateListeners.add(cb); cb(state); return () => { stateListeners.delete(cb); }; },
    onSecurity: (cb) => { secListeners.add(cb); return () => { secListeners.delete(cb); }; },
  };
}
