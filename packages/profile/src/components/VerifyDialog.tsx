import { useCallback, useState } from "react";
import { useProfile } from "../hooks/use-profile.js";

export function VerifyDialog() {
  const { state, verifyContact, dismissVerification } = useProfile();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const pending = state.pendingVerification;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!code.trim() || !pending) return;
      setSubmitting(true);
      try {
        await verifyContact(pending.contactId, code.trim());
        setCode("");
      } catch (err) {
        console.error("Verification failed:", err);
      } finally {
        setSubmitting(false);
      }
    },
    [code, pending, verifyContact],
  );

  if (!pending) return null;

  return (
    <div className="aiw-dialog-backdrop" onClick={dismissVerification}>
      <div
        className="aiw-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Verify contact"
      >
        <div className="aiw-dialog-title">Verify Contact</div>
        <form onSubmit={handleSubmit}>
          <label>
            <span className="aiw-field-label">
              Enter the verification code:
            </span>
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
              Cancel
            </button>
            <button
              type="submit"
              className="aiw-btn aiw-btn--primary"
              disabled={!code.trim() || submitting}
            >
              {submitting ? "Verifying..." : "Verify"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
