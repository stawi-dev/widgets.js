import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useProfile } from "../hooks/use-profile.js";
import { useFocusTrap } from "../hooks/use-focus-trap.js";
import { useT } from "../hooks/use-t.js";
import { HooksContext } from "../context/hooks-context.js";
import { CloseIcon } from "./Icons.js";

interface VerifyDialogProps {
  /** Whether the dialog is currently shown. Defaults to true for backward compat. */
  open?: boolean;
  /** Called when the dialog should be minimized (backdrop click, X button). Keeps pendingVerification. */
  onMinimize?: () => void;
}

export function VerifyDialog({ open = true, onMinimize }: VerifyDialogProps) {
  const { state, verifyContact, dismissVerification } = useProfile();
  const hooks = useContext(HooksContext);
  const t = useT();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const pending = state.pendingVerification;
  const shown = open && pending !== null;

  useFocusTrap(dialogRef, shown);

  // Reset code when the pending verification changes.
  useEffect(() => {
    setCode("");
  }, [pending?.verificationId]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!code.trim() || !pending) return;
      setSubmitting(true);
      try {
        await verifyContact(pending.contactId, code.trim());
        setCode("");
      } catch (err) {
        hooks?.onError?.(err);
        console.error("Verification failed:", err);
      } finally {
        setSubmitting(false);
      }
    },
    [code, pending, verifyContact, hooks],
  );

  const handleMinimize = useCallback(() => {
    if (onMinimize) onMinimize();
  }, [onMinimize]);

  const handleBackdropClick = useCallback(() => {
    // Backdrop click minimizes (does not clear pending).
    handleMinimize();
  }, [handleMinimize]);

  if (!shown) return null;

  return (
    <div className="aiw-dialog-backdrop" onClick={handleBackdropClick}>
      <div
        ref={dialogRef}
        className="aiw-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t("verify.title")}
      >
        <div className="aiw-dialog-header">
          <div className="aiw-dialog-title">{t("verify.title")}</div>
          <button
            type="button"
            className="aiw-dialog-close"
            aria-label={t("verify.minimize")}
            title={t("verify.minimize")}
            onClick={handleMinimize}
          >
            <CloseIcon size={14} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <label>
            <span className="aiw-field-label">{t("verify.label")}</span>
            <input
              className="aiw-input"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="000000"
              autoFocus
              inputMode="numeric"
              maxLength={8}
            />
          </label>
          <div className="aiw-dialog-actions">
            <button
              type="button"
              className="aiw-btn aiw-btn--secondary"
              onClick={dismissVerification}
            >
              {t("verify.cancel")}
            </button>
            <button
              type="submit"
              className="aiw-btn aiw-btn--primary"
              disabled={!code.trim() || submitting}
            >
              {submitting ? t("verify.submitting") : t("verify.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
