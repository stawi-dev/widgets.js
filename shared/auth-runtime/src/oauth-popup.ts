import type { ResolvedConfig } from "./shared/types.js";
import { AuthError } from "./shared/errors.js";
import type { WorkerCore } from "./worker/auth-worker.js";

const POPUP_W = 500, POPUP_H = 600;
const TIMEOUT_MS = 5 * 60 * 1000;

export async function runOAuthPopup(cfg: ResolvedConfig, core: WorkerCore): Promise<void> {
  const left = window.screenX + Math.max(0, (window.outerWidth - POPUP_W) / 2);
  const top = window.screenY + Math.max(0, (window.outerHeight - POPUP_H) / 2);
  const popup = window.open("about:blank", "stawi-auth",
    `width=${POPUP_W},height=${POPUP_H},left=${left},top=${top},popup=yes`);
  if (!popup) throw new AuthError("OAUTH_POPUP_BLOCKED", "popup blocked by browser");

  let authUrl: string, state: string, verifier: string;
  try {
    ({ authUrl, state, verifier } = await core.prepareAuth());
  } catch (err) {
    popup.close();
    throw err;
  }
  popup.location.href = authUrl;

  const redirectOrigin = new URL(cfg.redirectUri).origin;

  return new Promise<void>((resolve, reject) => {
    let done = false;
    const onMsg = async (ev: MessageEvent) => {
      if (ev.origin !== redirectOrigin) return;
      const data = ev.data as { type?: string; code?: string; state?: string } | null;
      if (!data || data.type !== "stawi-auth" || !data.code || !data.state) return;
      if (done) return;
      done = true;
      cleanup();
      try {
        await core.completeAuth({ code: data.code, state: data.state, verifier, expectedState: state });
        popup.close();
        resolve();
      } catch (err) {
        popup.close();
        reject(err);
      }
    };
    const interval = setInterval(() => {
      if (done) return;
      if (popup.closed) {
        done = true; cleanup();
        reject(new AuthError("OAUTH_POPUP_CLOSED", "popup closed by user"));
      } else {
        // same-origin polling fallback
        try {
          if (popup.location.origin === redirectOrigin && popup.location.search) {
            const params = new URLSearchParams(popup.location.search);
            const code = params.get("code"), returnedState = params.get("state");
            if (code && returnedState) {
              done = true; cleanup();
              core.completeAuth({ code, state: returnedState, verifier, expectedState: state })
                .then(() => { popup.close(); resolve(); })
                .catch((err) => { popup.close(); reject(err); });
            }
          }
        } catch { /* cross-origin, keep polling */ }
      }
    }, 200);
    const timer = setTimeout(() => {
      if (done) return;
      done = true; cleanup();
      popup.close();
      reject(new AuthError("OAUTH_POPUP_TIMEOUT", "popup timed out"));
    }, TIMEOUT_MS);
    function cleanup() {
      window.removeEventListener("message", onMsg);
      clearInterval(interval);
      clearTimeout(timer);
    }
    window.addEventListener("message", onMsg);
  });
}
