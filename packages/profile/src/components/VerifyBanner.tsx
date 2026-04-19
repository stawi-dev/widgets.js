import { useProfile } from "../hooks/use-profile.js";
import { useT } from "../hooks/use-t.js";

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
  const t = useT();
  const pending = state.pendingVerification;
  if (!pending) return null;

  const contact = state.profile?.contacts.find((c) => c.id === pending.contactId);
  const label = contact?.value ?? t("verify.pendingFallback");

  return (
    <div className="aiw-verify-banner" role="status" aria-live="polite">
      <span className="aiw-verify-banner-text">
        {t("verify.pendingBanner", { value: label })}
      </span>
      <div className="aiw-verify-banner-actions">
        <button
          type="button"
          className="aiw-verify-banner-btn"
          onClick={onEnterCode}
        >
          {t("verify.enterCode")}
        </button>
        <button
          type="button"
          className="aiw-verify-banner-dismiss"
          aria-label={t("verify.dismiss")}
          title={t("verify.dismiss")}
          onClick={dismissVerification}
        >
          ×
        </button>
      </div>
    </div>
  );
}
