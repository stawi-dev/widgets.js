import { useCallback, useState } from "react";
import { useProfile } from "../hooks/use-profile.js";
import { useT } from "../hooks/use-t.js";
import { ContactMethodItem } from "./ContactMethodItem.js";
import { EditIcon } from "./Icons.js";

function detectContactType(value: string): "email" | "phone" {
  return value.includes("@") ? "email" : "phone";
}

export function ContactMethods() {
  const { state, addContact } = useProfile();
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleAdd = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = newValue.trim();
      if (!trimmed) return;

      setSubmitting(true);
      try {
        const type = detectContactType(trimmed);
        await addContact(type, trimmed);
        setAdding(false);
        setNewValue("");
      } catch (err) {
        console.error("Failed to add contact:", err);
      } finally {
        setSubmitting(false);
      }
    },
    [newValue, addContact],
  );

  const profile = state.profile;
  if (!profile) return null;

  return (
    <div className="aiw-section">
      <div className="aiw-section-header">
        <div className="aiw-section-title">{t("contacts.title")}</div>
        <button
          className={`aiw-section-action${editing ? " aiw-section-action--active" : ""}`}
          onClick={() => {
            setEditing(!editing);
            if (editing) {
              setAdding(false);
              setNewValue("");
            }
          }}
          aria-label={editing ? t("contacts.done") : t("contacts.edit")}
          title={editing ? t("contacts.done") : t("contacts.edit")}
        >
          <EditIcon />
        </button>
      </div>

      {profile.contacts.map((contact) => (
        <ContactMethodItem
          key={contact.id}
          contact={contact}
          editing={editing}
        />
      ))}

      {editing &&
        (adding ? (
          <form onSubmit={handleAdd} style={{ marginTop: 8 }}>
            <input
              className="aiw-input"
              type="text"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder={t("contacts.addPlaceholder")}
              autoFocus
            />
            <div className="aiw-dialog-actions">
              <button
                type="button"
                className="aiw-btn aiw-btn--secondary"
                onClick={() => {
                  setAdding(false);
                  setNewValue("");
                }}
              >
                {t("contacts.cancel")}
              </button>
              <button
                type="submit"
                className="aiw-btn aiw-btn--primary"
                disabled={!newValue.trim() || submitting}
              >
                {submitting ? t("contacts.adding") : t("contacts.addCta")}
              </button>
            </div>
          </form>
        ) : (
          <div className="aiw-add-buttons">
            <button className="aiw-btn-add" onClick={() => setAdding(true)}>
              {t("contacts.add")}
            </button>
          </div>
        ))}
    </div>
  );
}
