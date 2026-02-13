import { useCallback, useState } from "react";
import type { ContactMethod } from "../types.js";
import { useProfile } from "../hooks/use-profile.js";
import { EmailIcon, PhoneIcon, CloseIcon } from "./Icons.js";

interface ContactMethodItemProps {
  contact: ContactMethod;
  editing: boolean;
}

export function ContactMethodItem({ contact, editing }: ContactMethodItemProps) {
  const { removeContact, sendVerification, verifyContact } = useProfile();
  const [verifying, setVerifying] = useState(false);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleDelete = useCallback(() => {
    if (contact.primary) return;
    removeContact(contact.id).catch(console.error);
  }, [contact.id, contact.primary, removeContact]);

  const handleStartVerify = useCallback(() => {
    sendVerification(contact.id).catch(console.error);
    setVerifying(true);
  }, [contact.id, sendVerification]);

  const handleSubmitCode = useCallback(async () => {
    if (!code.trim()) return;
    setSubmitting(true);
    try {
      await verifyContact(contact.id, code.trim());
      setVerifying(false);
      setCode("");
    } catch (err) {
      console.error("Verification failed:", err);
    } finally {
      setSubmitting(false);
    }
  }, [code, contact.id, verifyContact]);

  const handleCancel = useCallback(() => {
    setVerifying(false);
    setCode("");
  }, []);

  return (
    <div>
      <div className="aiw-contact-item">
        <span className="aiw-contact-icon">
          {contact.type === "email" ? <EmailIcon size={16} /> : <PhoneIcon size={16} />}
        </span>
        <span className="aiw-contact-value">{contact.value}</span>
        {editing && (
          <>
            {contact.primary && (
              <span className="aiw-badge aiw-badge--primary">Primary</span>
            )}
            {contact.verified ? (
              <span className="aiw-badge aiw-badge--verified">Verified</span>
            ) : !verifying ? (
              <button
                className="aiw-badge aiw-badge--unverified aiw-badge--clickable"
                onClick={handleStartVerify}
                title="Click to verify"
              >
                Verify
              </button>
            ) : null}
            {!contact.primary && (
              <button
                className="aiw-contact-delete"
                onClick={handleDelete}
                aria-label={`Remove ${contact.value}`}
                title="Remove"
              >
                <CloseIcon size={12} />
              </button>
            )}
          </>
        )}
      </div>
      {editing && verifying && !contact.verified && (
        <div className="aiw-verify-row">
          <input
            className="aiw-verify-input"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Code"
            inputMode="numeric"
            maxLength={8}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmitCode();
              if (e.key === "Escape") handleCancel();
            }}
          />
          <button
            className="aiw-verify-btn"
            onClick={handleSubmitCode}
            disabled={!code.trim() || submitting}
          >
            {submitting ? "..." : "OK"}
          </button>
          <button className="aiw-verify-cancel" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
