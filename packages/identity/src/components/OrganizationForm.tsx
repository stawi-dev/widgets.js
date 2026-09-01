import { useCallback, useContext, useState } from "react";
import { useIdentity } from "../context/identity-context.js";
import { HooksContext } from "../context/hooks-context.js";
import { useT } from "../hooks/use-t.js";
import { Field } from "./Field.js";
import type { OrganizationType } from "../types.js";

/**
 * Create form for the organization gate. `geoId` is required by the identity
 * service, `domain` is optional; the type list comes from host vocabulary.
 * On success the new organization becomes the selected one.
 */
export function OrganizationForm() {
  const { client, vocabulary, setOrganization } = useIdentity();
  const hooks = useContext(HooksContext);
  const t = useT();

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [geoId, setGeoId] = useState("");
  const [domain, setDomain] = useState("");
  const [organizationType, setOrganizationType] = useState<OrganizationType>(
    vocabulary.organizationTypes[0]?.value ?? "ORGANIZATION_TYPE_UNSPECIFIED",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const required = t("field.required");
      const next: Record<string, string> = {};
      if (!name.trim()) next.name = required;
      if (!code.trim()) next.code = required;
      if (!geoId.trim()) next.geoId = required;
      setErrors(next);
      if (Object.keys(next).length > 0) return;

      setSaving(true);
      setSubmitError(null);
      try {
        const saved = await client.organizationSave({
          name: name.trim(),
          code: code.trim(),
          organizationType,
          geoId: geoId.trim(),
          ...(domain.trim() ? { domain: domain.trim() } : {}),
        });
        setOrganization(saved);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : String(err));
        hooks.onError?.(err);
      } finally {
        setSaving(false);
      }
    },
    [
      client,
      code,
      domain,
      geoId,
      hooks,
      name,
      organizationType,
      setOrganization,
      t,
    ],
  );

  return (
    <form
      className="aiw-org-form"
      noValidate
      onSubmit={(e) => void handleSubmit(e)}
    >
      <h2 className="aiw-org-form-title">{t("org.createTitle")}</h2>

      <Field label={t("org.field.name")} required error={errors.name}>
        {(props) => (
          <input
            {...props}
            className="aiw-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </Field>

      <Field label={t("org.field.code")} required error={errors.code}>
        {(props) => (
          <input
            {...props}
            className="aiw-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        )}
      </Field>

      <Field label={t("org.field.type")}>
        {(props) => (
          <select
            {...props}
            className="aiw-select"
            value={organizationType}
            onChange={(e) =>
              setOrganizationType(e.target.value as OrganizationType)
            }
          >
            {vocabulary.organizationTypes.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field label={t("org.field.geoId")} required error={errors.geoId}>
        {(props) => (
          <input
            {...props}
            className="aiw-input"
            value={geoId}
            onChange={(e) => setGeoId(e.target.value)}
          />
        )}
      </Field>

      <Field label={t("org.field.domain")}>
        {(props) => (
          <input
            {...props}
            className="aiw-input"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
          />
        )}
      </Field>

      {submitError && (
        <div role="alert" className="aiw-error">
          {submitError}
        </div>
      )}

      <button type="submit" className="aiw-button-primary" disabled={saving}>
        {saving ? t("org.creating") : t("org.create")}
      </button>
    </form>
  );
}
