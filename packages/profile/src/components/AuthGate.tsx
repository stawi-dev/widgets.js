import { useCallback } from "react";
import { useAuth } from "../hooks/use-auth.js";
import { ProfileProvider } from "../context/profile-context.js";
import { ProfilePopover } from "./ProfilePopover.js";
import { PersonIcon } from "./Icons.js";

interface AuthGateProps {
  adminPanelUrl?: string;
  onLogout?: () => void;
}

export function AuthGate({ adminPanelUrl, onLogout }: AuthGateProps) {
  const { authState, ensureAuthenticated } = useAuth();

  const handleSignIn = useCallback(() => {
    ensureAuthenticated().catch(() => {
      // Auth state change handler will update the UI
    });
  }, [ensureAuthenticated]);

  if (authState === "authenticated") {
    return (
      <ProfileProvider>
        <ProfilePopover adminPanelUrl={adminPanelUrl} onLogout={onLogout} />
      </ProfileProvider>
    );
  }

  if (authState === "initializing") {
    return (
      <button
        className="aiw-trigger aiw-trigger--loading"
        aria-label="Loading authentication"
        disabled
      >
        <span className="aiw-trigger-pulse" />
      </button>
    );
  }

  // unauthenticated or error
  return (
    <button
      className="aiw-signin-trigger"
      onClick={handleSignIn}
      aria-label="Login"
    >
      <span className="aiw-signin-label">Login</span>
      <span className="aiw-signin-avatar">
        <PersonIcon size={18} />
      </span>
    </button>
  );
}
