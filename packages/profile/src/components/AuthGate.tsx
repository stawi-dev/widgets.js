import { useCallback, useState } from "react";
import type { AuthState } from "@stawi/auth-runtime";
import { useAuth } from "../hooks/use-auth.js";
import { useT } from "../hooks/use-t.js";
import { ProfileProvider } from "../context/profile-context.js";
import { ProfilePopover } from "./ProfilePopover.js";
import { PersonIcon } from "./Icons.js";

interface AuthGateProps {
  adminPanelUrl?: string;
  onLogout?: () => void;
}

/**
 * Display FSM for the profile chrome. We only commit to a visible UI once
 * auth is settled enough to avoid reload glitches (login flash → profile).
 *
 *   initializing → hidden   (session probe in flight; render nothing)
 *   refreshing   → profile  (tokens exist; keep chrome stable during refresh)
 *   authenticated → profile
 *   unauthenticated → login
 *   error → login           (recoverable; let the user retry)
 */
export type AuthDisplayMode = "hidden" | "login" | "profile";

export function authDisplayMode(authState: AuthState): AuthDisplayMode {
  switch (authState) {
    case "authenticated":
    case "refreshing":
      return "profile";
    case "unauthenticated":
    case "error":
      return "login";
    case "initializing":
    default:
      return "hidden";
  }
}

// Visible error messages for the sign-in failure modes most users hit.
// Anything outside this map falls through to err.message so the user
// still sees something actionable rather than a silent no-op.
const SIGNIN_ERROR_MESSAGES: Record<string, string> = {
  OAUTH_POPUP_BLOCKED:
    "Pop-ups are blocked for this site. Allow pop-ups and try again.",
  OAUTH_POPUP_TIMEOUT:
    "Sign-in took too long to complete. Please try again.",
  OAUTH_STATE_MISMATCH:
    "Sign-in session expired. Please try again.",
  TOKEN_EXCHANGE_FAILED:
    "Couldn't exchange authorization code — contact support if this persists.",
  NETWORK_ERROR: "Network error — please check your connection and retry.",
  NETWORK_TIMEOUT: "Network timed out — please retry.",
  OFFLINE: "You appear to be offline.",
  DISCOVERY_FAILED:
    "Authentication service is unreachable — please try again in a moment.",
};

export function AuthGate({ adminPanelUrl, onLogout }: AuthGateProps) {
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
      // OAUTH_POPUP_CLOSED means "user explicitly aborted" — don't
      // shout, just reset. Everything else is a real failure the user
      // should see.
      const code = (err as { code?: string })?.code;
      if (code === "OAUTH_POPUP_CLOSED") {
        return;
      }
      const mapped = code && SIGNIN_ERROR_MESSAGES[code];
      const fallback = err instanceof Error ? err.message : "Sign-in failed.";
      setErrMsg(mapped ?? fallback);
      // Also log so ops can correlate via OpenObserve / Sentry.
      console.error("[stawi/profile] sign-in failed:", err);
    } finally {
      setBusy(false);
    }
  }, [ensureAuthenticated]);

  const mode = authDisplayMode(authState);

  if (mode === "hidden") {
    return null;
  }

  if (mode === "profile") {
    return (
      <ProfileProvider>
        <ProfilePopover adminPanelUrl={adminPanelUrl} onLogout={onLogout} />
      </ProfileProvider>
    );
  }

  // mode === "login"
  return (
    <div className="aiw-signin-wrapper">
      <button
        className="aiw-signin-trigger"
        onClick={() => void handleSignIn()}
        aria-label={t("auth.login")}
        disabled={busy}
      >
        <span className="aiw-signin-label">{t("auth.login")}</span>
        <span className="aiw-signin-avatar">
          <PersonIcon size={18} />
        </span>
      </button>
      {errMsg && (
        <div role="alert" className="aiw-signin-error">
          {errMsg}
        </div>
      )}
    </div>
  );
}
