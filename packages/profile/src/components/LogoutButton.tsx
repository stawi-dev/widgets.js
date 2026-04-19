import { useCallback, useState } from "react";
import { useAuth } from "../hooks/use-auth.js";
import { useT } from "../hooks/use-t.js";
import { SignOutIcon } from "./Icons.js";

interface LogoutButtonProps {
  onLogout?: () => void;
}

export function LogoutButton({ onLogout }: LogoutButtonProps) {
  const { logout } = useAuth();
  const t = useT();
  const [loading, setLoading] = useState(false);

  const handleLogout = useCallback(async () => {
    setLoading(true);
    try {
      await logout();
      onLogout?.();
    } catch (err) {
      console.error("Logout failed:", err);
    } finally {
      setLoading(false);
    }
  }, [logout, onLogout]);

  return (
    <div className="aiw-section">
      <button
        className="aiw-btn-logout"
        onClick={handleLogout}
        disabled={loading}
      >
        <SignOutIcon size={16} />
        {loading ? t("auth.signingOut") : t("auth.signOut")}
      </button>
    </div>
  );
}
