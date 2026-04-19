import { useCallback, useContext } from "react";
import type { ContactMethod } from "../types.js";
import { useProfile } from "../hooks/use-profile.js";
import { HooksContext } from "../context/hooks-context.js";
import { EmailIcon, PhoneIcon, CloseIcon } from "./Icons.js";

interface ContactMethodItemProps {
  contact: ContactMethod;
  editing: boolean;
}

export function ContactMethodItem({ contact, editing }: ContactMethodItemProps) {
  const { removeContact, sendVerification } = useProfile();
  const hooks = useContext(HooksContext);

  const handleDelete = useCallback(() => {
    if (contact.primary) return;
    removeContact(contact.id).catch((err) => {
      hooks?.onError?.(err);
      console.error(err);
    });
  }, [contact.id, contact.primary, removeContact, hooks]);

  const handleStartVerify = useCallback(() => {
    // Kicks off the server call to create a verification and, on success,
    // sets pendingVerification which opens the VerifyDialog.
    sendVerification(contact.id).catch((err) => {
      hooks?.onError?.(err);
      console.error(err);
    });
  }, [contact.id, sendVerification, hooks]);

  return (
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
          ) : (
            <button
              className="aiw-badge aiw-badge--unverified aiw-badge--clickable"
              onClick={handleStartVerify}
              title="Click to verify"
            >
              Verify
            </button>
          )}
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
  );
}
