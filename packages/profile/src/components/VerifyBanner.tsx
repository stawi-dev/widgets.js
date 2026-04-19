import { useProfile } from "../hooks/use-profile.js";

interface VerifyBannerProps {
  /** Called when the user clicks "Enter code" to reopen the dialog. */
  onEnterCode: () => void;
}

/**
 * Persistent banner shown when there is a pending verification but the dialog
 * has been minimized. Clicking it re-opens the dialog.
 */
export function VerifyBanner({ onEnterCode }: VerifyBannerProps) {
  const { state, dismissVerification } = useProfile();
  const pending = state.pendingVerification;
  if (!pending) return null;

  const contact = state.profile?.contacts.find((c) => c.id === pending.contactId);
  const label = contact?.value ?? "your contact";

  return (
    <div className="aiw-verify-banner" role="status" aria-live="polite">
      <span className="aiw-verify-banner-text">
        Verify {label}
      </span>
      <div className="aiw-verify-banner-actions">
        <button
          type="button"
          className="aiw-verify-banner-btn"
          onClick={onEnterCode}
        >
          Enter code
        </button>
        <button
          type="button"
          className="aiw-verify-banner-dismiss"
          aria-label="Dismiss verification"
          title="Dismiss"
          onClick={dismissVerification}
        >
          ×
        </button>
      </div>
    </div>
  );
}
