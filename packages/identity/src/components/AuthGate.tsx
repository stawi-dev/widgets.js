import { useCallback, useState, type ReactNode } from "react";
import type { AuthState } from "@stawi/auth-runtime";
import { useAuth } from "../hooks/use-auth.js";
import { useT } from "../hooks/use-t.js";

interface AuthGateProps {
  children: ReactNode;
}

/**
 * Display FSM for the identity chrome. Nothing is drawn until auth has
 * settled enough to pick a side, which avoids the login-flash → content
 * glitch on reload.
 *
 *   initializing  → hidden   (session probe in flight)
 *   refreshing    → content  (tokens exist; keep the UI stable)
 *   authenticated → content
 *   unauthenticated → login
 *   error         → login    (recoverable; let the user retry)
 */
export type AuthDisplayMode = "hidden" | "login" | "content";

export function authDisplayMode(authState: AuthState): AuthDisplayMode {
  switch (authState) {
    case "authenticated":
    case "refreshing":
      return "content";
    case "unauthenticated":
    case "error":
      return "login";
    case "initializing":
    default:
      return "hidden";
  }
}

// Visible messages for the sign-in failure modes users actually hit.
// Anything else falls through to the error's own message so the user
// still sees something actionable rather than a silent no-op.
const SIGNIN_ERROR_MESSAGES: Record<string, string> = {
  OAUTH_POPUP_BLOCKED:
    "Pop-ups are blocked for this site. Allow pop-ups and try again.",
  OAUTH_POPUP_TIMEOUT: "Sign-in took too long to complete. Please try again.",
  OAUTH_STATE_MISMATCH: "Sign-in session expired. Please try again.",
  TOKEN_EXCHANGE_FAILED:
    "Couldn't exchange authorization code — contact support if this persists.",
  NETWORK_ERROR: "Network error — please check your connection and retry.",
  NETWORK_TIMEOUT: "Network timed out — please retry.",
  OFFLINE: "You appear to be offline.",
  DISCOVERY_FAILED:
    "Authentication service is unreachable — please try again in a moment.",
};

export function AuthGate({ children }: AuthGateProps) {
  const { authState, ensureAuthenticated } = useAuth();
  const t = useT();
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSignIn = useCallback(async () => {
    setBusy(true);
    setErrMsg(null);
    try {
      await ensureAuthenticated();
    } catch (err) {
      // OAUTH_POPUP_CLOSED means the user aborted on purpose — reset quietly.
      const code = (err as { code?: string })?.code;
      if (code === "OAUTH_POPUP_CLOSED") return;
      const mapped = code && SIGNIN_ERROR_MESSAGES[code];
      const fallback = err instanceof Error ? err.message : "Sign-in failed.";
      setErrMsg(mapped ?? fallback);
      console.error("[stawi/identity] sign-in failed:", err);
    } finally {
      setBusy(false);
    }
  }, [ensureAuthenticated]);

  const mode = authDisplayMode(authState);

  if (mode === "hidden") return null;
  if (mode === "content") return <>{children}</>;

  return (
    <div className="aiw-signin-wrapper">
      <button
        type="button"
        className="aiw-signin-trigger"
        onClick={() => void handleSignIn()}
        aria-label={t("auth.login")}
        disabled={busy}
      >
        {t("auth.login")}
      </button>
      {errMsg && (
        <div role="alert" className="aiw-signin-error">
          {errMsg}
        </div>
      )}
    </div>
  );
}
