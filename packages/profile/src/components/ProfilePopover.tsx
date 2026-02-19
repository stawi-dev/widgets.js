import { useCallback, useEffect, useRef, useState } from "react";
import { useProfile } from "../hooks/use-profile.js";
import { useGravatarUrl } from "../hooks/use-gravatar.js";
import { getInitials } from "../utils/get-initials.js";
import { ProfileCard } from "./ProfileCard.js";

interface ProfilePopoverProps {
  adminPanelUrl?: string;
  onLogout?: () => void;
}

export function ProfilePopover({ adminPanelUrl, onLogout }: ProfilePopoverProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { state } = useProfile();

  const profile = state.profile;
  const gravatarUrl = useGravatarUrl(profile?.email, 80);

  const toggle = useCallback(() => setOpen((o) => !o), []);
  const close = useCallback(() => setOpen(false), []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const path = e.composedPath();
      if (containerRef.current && !path.includes(containerRef.current)) {
        close();
      }
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [open, close]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, close]);

  const avatarSrc = profile?.picture || gravatarUrl;

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        className="aiw-trigger"
        onClick={toggle}
        aria-label="Open profile menu"
        aria-expanded={open}
      >
        {avatarSrc ? (
          <img src={avatarSrc} alt={profile?.name ?? "Profile"} />
        ) : (
          <span className="aiw-trigger-initials">
            {profile ? getInitials(profile.name) : "?"}
          </span>
        )}
      </button>

      <div
        className={`aiw-popover ${open ? "aiw-popover--open" : ""}`}
        role="dialog"
        aria-label="Profile"
      >
        <ProfileCard adminPanelUrl={adminPanelUrl} onLogout={onLogout} />
      </div>
    </div>
  );
}
