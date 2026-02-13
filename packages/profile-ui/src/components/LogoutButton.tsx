import { useCallback, useState } from "react";
import { useAuth } from "../hooks/use-auth.js";
import { SignOutIcon } from "./Icons.js";

interface LogoutButtonProps {
  onLogout?: () => void;
}

export function LogoutButton({ onLogout }: LogoutButtonProps) {
  const { logout } = useAuth();
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
        {loading ? "Signing out..." : "Sign Out"}
      </button>
    </div>
  );
}
