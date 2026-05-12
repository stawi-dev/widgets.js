import type { ResolvedConfig } from "./shared/types.js";
import { AuthError } from "./shared/errors.js";
import type { WorkerCore } from "./worker/auth-worker.js";

// sessionStorage key. The version suffix lets us bump the shape later
// without colliding with a stale entry left in a user's browser tab
// from a previous deploy.
const STASH_KEY = "stawi.auth.redirect.v1";

interface Stash {
  state: string;
  verifier: string;
  returnTo: string;
}

function readStash(): Stash | null {
  try {
    const raw = sessionStorage.getItem(STASH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Stash> | null;
    if (!parsed || typeof parsed.state !== "string" || typeof parsed.verifier !== "string") return null;
    const returnTo = typeof parsed.returnTo === "string" && parsed.returnTo.startsWith("/") ? parsed.returnTo : "/";
    return { state: parsed.state, verifier: parsed.verifier, returnTo };
  } catch {
    return null;
  }
}

function clearStash(): void {
  try { sessionStorage.removeItem(STASH_KEY); } catch { /* best-effort */ }
}

/**
 * Full-page redirect to the IdP. Prepares the OAuth state + PKCE verifier
 * via the worker core, stashes them in sessionStorage along with the
 * current location so the callback page can route the user back, then
 * navigates the top window to the authorize URL.
 *
 * The returned promise never resolves — the page is navigating away. If
 * sessionStorage write fails or the authorize URL fetch throws, the
 * function rejects synchronously and the caller can render an error.
 */
export async function startRedirect(_cfg: ResolvedConfig, core: WorkerCore): Promise<never> {
  const { authUrl, state, verifier } = await core.prepareAuth();
  const returnTo = (() => {
    try {
      const loc = window.location;
      const path = (loc.pathname || "/") + (loc.search || "");
      return path.startsWith("/") ? path : "/";
    } catch { return "/"; }
  })();
  try {
    sessionStorage.setItem(STASH_KEY, JSON.stringify({ state, verifier, returnTo }));
  } catch (err) {
    throw new AuthError("OAUTH_REDIRECT_STORAGE_MISSING", "sessionStorage unavailable", err);
  }
  window.location.assign(authUrl);
  // Block the caller until the navigation actually happens.
  return new Promise<never>(() => {});
}

/**
 * Counterpart to startRedirect. Reads `?code` + `?state` from the current
 * URL, pulls verifier + expected state from sessionStorage, asks the
 * worker core to exchange the code for tokens, and returns the
 * stashed `returnTo` so the caller can route there.
 *
 * Cleans the sessionStorage stash on both success and failure so a
 * second call to completeRedirect after a transient error fails fast
 * with OAUTH_REDIRECT_STORAGE_MISSING instead of silently retrying
 * with stale state.
 */
export async function completeRedirect(_cfg: ResolvedConfig, core: WorkerCore): Promise<{ returnTo: string }> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const returnedState = params.get("state");
  if (!code || !returnedState) {
    clearStash();
    throw new AuthError("OAUTH_FAILED", "missing code/state on callback URL");
  }
  const stash = readStash();
  if (!stash) {
    throw new AuthError("OAUTH_REDIRECT_STORAGE_MISSING", "redirect stash missing — sign-in cannot be completed");
  }
  clearStash();
  await core.completeAuth({
    code,
    state: returnedState,
    verifier: stash.verifier,
    expectedState: stash.state,
  });
  return { returnTo: stash.returnTo };
}

/** Test seam — exposed for vitest, not part of the public surface. */
export const __redirectInternals = { STASH_KEY, readStash, clearStash };
