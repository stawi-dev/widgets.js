import { useCallback, useEffect, useRef, useState } from "react";
import { useProfile } from "../hooks/use-profile.js";
import { useGravatarUrl } from "../hooks/use-gravatar.js";
import { useT } from "../hooks/use-t.js";
import { getInitials } from "../utils/get-initials.js";
import { ProfileCard } from "./ProfileCard.js";

interface ProfilePopoverProps {
  adminPanelUrl?: string;
  onLogout?: () => void;
}

export function ProfilePopover({
  adminPanelUrl,
  onLogout,
}: ProfilePopoverProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { state } = useProfile();
  const t = useT();

  const profile = state.profile;
  const gravatarUrl = useGravatarUrl(profile?.email, 80);

  const toggle = useCallback(() => setOpen((o) => !o), []);
  const close = useCallback(() => {
    setOpen(false);
    // Return focus to the trigger on close (a11y: focus return on Escape /
    // outside click). A microtask lets React finish the state update first.
    queueMicrotask(() => {
      try {
        triggerRef.current?.focus();
      } catch {
        /* ignore focus errors in detached nodes */
      }
    });
  }, []);

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
    <div
      ref={containerRef}
      style={{ position: "relative", display: "inline-block" }}
    >
      <button
        ref={triggerRef}
        className="aiw-trigger"
        onClick={toggle}
        aria-label={t("profile.openMenu")}
        aria-expanded={open}
      >
        {avatarSrc ? (
          <img
            src={avatarSrc}
            alt={profile?.name ?? t("profile.fallbackName")}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <span className="aiw-trigger-initials">
            {profile ? getInitials(profile.name) : "?"}
          </span>
        )}
      </button>

      <div
        className={`aiw-popover ${open ? "aiw-popover--open" : ""}`}
        role="dialog"
        aria-label={t("profile.dialog")}
      >
        <ProfileCard adminPanelUrl={adminPanelUrl} onLogout={onLogout} />
      </div>
    </div>
  );
}
