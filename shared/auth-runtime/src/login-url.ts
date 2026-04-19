import type { ResolvedConfig } from "./shared/types.js";
import { AuthError } from "./shared/errors.js";

const POPUP_W = 500;
const POPUP_H = 600;
const TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Opens the IdP's `login_url` (discovered from the FedCM config manifest) in a
 * popup so the user can establish an IdP session. Intended to be called from a
 * user-gesture handler (e.g. a sign-in button click) so the popup is not
 * blocked.
 *
 * The IdP's login page is expected to dispatch a
 * `window.opener.postMessage({ type: "stawi-login-complete" }, origin)`
 * (where `origin` matches `cfg.idpBaseUrl`'s origin) once login has succeeded.
 * Once received, the popup is closed and the returned promise resolves. The
 * caller should then retry FedCM in active mode with `mediation: "required"`.
 *
 * @throws AuthError("OAUTH_POPUP_BLOCKED") when the browser blocks the popup.
 * @throws AuthError("OAUTH_POPUP_CLOSED") when the user closes the popup
 *         before login completes, or when the provided abort signal fires.
 * @throws AuthError("OAUTH_POPUP_TIMEOUT") after 5 minutes without a
 *         completion message.
 */
export async function openLoginUrl(
  cfg: ResolvedConfig,
  loginUrl: string,
  opts?: { signal?: AbortSignal },
): Promise<void> {
  if (opts?.signal?.aborted) {
    throw new AuthError("OAUTH_POPUP_CLOSED", "aborted");
  }

  const left = window.screenX + Math.max(0, (window.outerWidth - POPUP_W) / 2);
  const top = window.screenY + Math.max(0, (window.outerHeight - POPUP_H) / 2);
  const popup = window.open(
    loginUrl,
    "stawi-idp-login",
    `popup=yes,width=${POPUP_W},height=${POPUP_H},left=${left},top=${top}`,
  );
  if (!popup) throw new AuthError("OAUTH_POPUP_BLOCKED", "popup blocked");

  const idpOrigin = new URL(cfg.idpBaseUrl).origin;

  return new Promise<void>((resolve, reject) => {
    let done = false;

    const onMsg = (ev: MessageEvent) => {
      if (done) return;
      if (ev.origin !== idpOrigin) return;
      const data = ev.data as { type?: string } | null;
      if (!data || data.type !== "stawi-login-complete") return;
      done = true;
      cleanup();
      try { popup.close(); } catch { /* ignore */ }
      resolve();
    };

    const onAbort = () => {
      if (done) return;
      done = true;
      cleanup();
      try { popup.close(); } catch { /* ignore */ }
      reject(new AuthError("OAUTH_POPUP_CLOSED", "aborted"));
    };

    const interval = setInterval(() => {
      if (done) return;
      if (popup.closed) {
        done = true;
        cleanup();
        reject(new AuthError("OAUTH_POPUP_CLOSED", "popup closed by user"));
      }
    }, 200);

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      try { popup.close(); } catch { /* ignore */ }
      reject(new AuthError("OAUTH_POPUP_TIMEOUT", "login popup timed out"));
    }, TIMEOUT_MS);

    function cleanup() {
      window.removeEventListener("message", onMsg);
      clearInterval(interval);
      clearTimeout(timer);
      opts?.signal?.removeEventListener("abort", onAbort);
    }

    window.addEventListener("message", onMsg);
    opts?.signal?.addEventListener("abort", onAbort);
  });
}
