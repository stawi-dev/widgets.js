import { useCallback, useContext, useState } from "react";
import { useIdentity } from "../../context/identity-context.js";
import { HooksContext } from "../../context/hooks-context.js";
import { useT } from "../../hooks/use-t.js";
import { Dialog } from "../Dialog.js";
import { Field } from "../Field.js";
import { ORG_UNIT_TYPES } from "./unit-types.js";
import type { OrgUnit, OrgUnitType } from "../../types.js";

interface UnitFormProps {
  /** The unit being edited; null creates a new one. */
  unit: OrgUnit | null;
  /** Candidate parents — the loaded list of the organization's units. */
  units: OrgUnit[];
  onClose: () => void;
  onSaved: () => void;
}

/** Creates or edits an org unit. */
export function UnitForm({ unit, units, onClose, onSaved }: UnitFormProps) {
  const { client, organization } = useIdentity();
  const hooks = useContext(HooksContext);
  const t = useT();
  const isEdit = unit !== null;

  const [name, setName] = useState(unit?.name ?? "");
  const [code, setCode] = useState(unit?.code ?? "");
  const [type, setType] = useState<OrgUnitType>(
    unit?.type ?? ORG_UNIT_TYPES[0],
  );
  const [parentId, setParentId] = useState(unit?.parentId ?? "");
  const [geoId, setGeoId] = useState(unit?.geoId ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // A unit cannot parent itself. Deeper cycles are rejected by the service.
  const parentOptions = units.filter((candidate) => candidate.id !== unit?.id);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!organization) return;

      const nextErrors: Record<string, string> = {};
      if (!name.trim()) nextErrors.name = t("field.required");
      if (!code.trim()) nextErrors.code = t("field.required");
      // The service rejects units without a coverage geo.
      if (!geoId.trim()) nextErrors.geoId = t("field.required");
      setErrors(nextErrors);
      if (Object.keys(nextErrors).length > 0) return;

      setSaving(true);
      setSubmitError(null);
      try {
        const payload: Partial<OrgUnit> = {
          ...(unit ?? {}),
          organizationId: organization.id,
          name: name.trim(),
          code: code.trim(),
          type,
          geoId: geoId.trim(),
          state: unit?.state ?? "ACTIVE",
        };
        if (parentId || unit?.parentId) payload.parentId = parentId;

        await client.orgUnitSave(payload);
        onSaved();
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
      geoId,
      hooks,
      name,
      onSaved,
      organization,
      parentId,
      t,
      type,
      unit,
    ],
  );

  return (
    <Dialog
      open
      title={t(isEdit ? "units.editTitle" : "units.createTitle")}
      onClose={onClose}
    >
      <form
        className="aiw-unit-form"
        noValidate
        onSubmit={(e) => void handleSubmit(e)}
      >
        <Field label={t("units.field.name")} required error={errors.name}>
          {(props) => (
            <input
              {...props}
              className="aiw-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>

        <Field label={t("units.field.code")} required error={errors.code}>
          {(props) => (
            <input
              {...props}
              className="aiw-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          )}
        </Field>

        <Field label={t("units.field.type")}>
          {(props) => (
            <select
              {...props}
              className="aiw-select"
              value={type}
              onChange={(e) => setType(e.target.value as OrgUnitType)}
            >
              {ORG_UNIT_TYPES.map((value) => (
                <option key={value} value={value}>
                  {t(`unitType.${value}`)}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label={t("units.field.parent")}>
          {(props) => (
            <select
              {...props}
              className="aiw-select"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              <option value="">{t("units.none.option")}</option>
              {parentOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label={t("units.field.geoId")} required error={errors.geoId}>
          {(props) => (
            <input
              {...props}
              className="aiw-input"
              value={geoId}
              onChange={(e) => setGeoId(e.target.value)}
            />
          )}
        </Field>

        {submitError && (
          <div role="alert" className="aiw-error">
            {submitError}
          </div>
        )}

        <div className="aiw-form-actions">
          <button type="button" className="aiw-button" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            className="aiw-button-primary"
            disabled={saving}
          >
            {t(isEdit ? "units.save" : "units.createSubmit")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
