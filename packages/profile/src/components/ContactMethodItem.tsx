import { useCallback, useContext } from "react";
import type { ContactMethod } from "../types.js";
import { useProfile } from "../hooks/use-profile.js";
import { useT } from "../hooks/use-t.js";
import { HooksContext } from "../context/hooks-context.js";
import { EmailIcon, PhoneIcon, CloseIcon } from "./Icons.js";

interface ContactMethodItemProps {
  contact: ContactMethod;
  editing: boolean;
}

export function ContactMethodItem({ contact, editing }: ContactMethodItemProps) {
  const { removeContact, sendVerification } = useProfile();
  const hooks = useContext(HooksContext);
  const t = useT();

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
            <span className="aiw-badge aiw-badge--primary">
              {t("contacts.primary")}
            </span>
          )}
          {contact.verified ? (
            <span className="aiw-badge aiw-badge--verified">
              {t("contacts.verified")}
            </span>
          ) : (
            <button
              className="aiw-badge aiw-badge--unverified aiw-badge--clickable"
              onClick={handleStartVerify}
              title={t("contacts.verify")}
            >
              {t("contacts.verify")}
            </button>
          )}
          {!contact.primary && (
            <button
              className="aiw-contact-delete"
              onClick={handleDelete}
              aria-label={t("contacts.remove", { value: contact.value })}
              title={t("contacts.remove", { value: contact.value })}
            >
              <CloseIcon size={12} />
            </button>
          )}
        </>
      )}
    </div>
  );
}
