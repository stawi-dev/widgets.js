import { useCallback, useContext, useState } from "react";
import { useIdentity } from "../../context/identity-context.js";
import { HooksContext } from "../../context/hooks-context.js";
import { useT } from "../../hooks/use-t.js";
import { Dialog } from "../Dialog.js";
import { Field } from "../Field.js";
import type { InternalTeam, OrgUnit } from "../../types.js";

interface TeamFormProps {
  /** The team being edited; null creates a new one. */
  team: InternalTeam | null;
  /** Candidate parent teams — the loaded list of the organization's teams. */
  teams: InternalTeam[];
  /** Home unit options; empty unless the org-units feature is on. */
  units: OrgUnit[];
  onClose: () => void;
  onSaved: () => void;
}

/** Creates or edits an internal team. */
export function TeamForm({
  team,
  teams,
  units,
  onClose,
  onSaved,
}: TeamFormProps) {
  const { client, vocabulary, features, organization } = useIdentity();
  const hooks = useContext(HooksContext);
  const t = useT();
  const isEdit = team !== null;

  const [name, setName] = useState(team?.name ?? "");
  const [code, setCode] = useState(team?.code ?? "");
  const [teamType, setTeamType] = useState(
    team?.teamType ?? vocabulary.teamTypes[0]?.value ?? "",
  );
  const [objective, setObjective] = useState(team?.objective ?? "");
  const [parentTeamId, setParentTeamId] = useState(team?.parentTeamId ?? "");
  const [homeOrgUnitId, setHomeOrgUnitId] = useState(team?.homeOrgUnitId ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const parentOptions = teams.filter((candidate) => candidate.id !== team?.id);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!organization) return;

      const nextErrors: Record<string, string> = {};
      if (!name.trim()) nextErrors.name = t("field.required");
      if (!code.trim()) nextErrors.code = t("field.required");
      setErrors(nextErrors);
      if (Object.keys(nextErrors).length > 0) return;

      setSaving(true);
      setSubmitError(null);
      try {
        const payload: Partial<InternalTeam> = {
          ...(team ?? {}),
          organizationId: organization.id,
          name: name.trim(),
          code: code.trim(),
          teamType,
          objective,
          state: team?.state ?? "ACTIVE",
        };
        if (parentTeamId || team?.parentTeamId) {
          payload.parentTeamId = parentTeamId;
        }
        if (features.orgUnits && (homeOrgUnitId || team?.homeOrgUnitId)) {
          payload.homeOrgUnitId = homeOrgUnitId;
        }

        await client.internalTeamSave(payload);
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
      features.orgUnits,
      homeOrgUnitId,
      hooks,
      name,
      objective,
      onSaved,
      organization,
      parentTeamId,
      t,
      team,
      teamType,
    ],
  );

  return (
    <Dialog
      open
      title={t(isEdit ? "teams.editTitle" : "teams.createTitle")}
      onClose={onClose}
    >
      <form
        className="aiw-team-form"
        noValidate
        onSubmit={(e) => void handleSubmit(e)}
      >
        <Field label={t("teams.field.name")} required error={errors.name}>
          {(props) => (
            <input
              {...props}
              className="aiw-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>

        <Field label={t("teams.field.code")} required error={errors.code}>
          {(props) => (
            <input
              {...props}
              className="aiw-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          )}
        </Field>

        <Field label={t("teams.field.type")}>
          {(props) => (
            <select
              {...props}
              className="aiw-select"
              value={teamType}
              onChange={(e) => setTeamType(e.target.value)}
            >
              {vocabulary.teamTypes.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label={t("teams.field.objective")}>
          {(props) => (
            <input
              {...props}
              className="aiw-input"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
            />
          )}
        </Field>

        <Field label={t("teams.field.parent")}>
          {(props) => (
            <select
              {...props}
              className="aiw-select"
              value={parentTeamId}
              onChange={(e) => setParentTeamId(e.target.value)}
            >
              <option value="">{t("teams.none.option")}</option>
              {parentOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}
        </Field>

        {features.orgUnits && (
          <Field label={t("teams.field.homeUnit")}>
            {(props) => (
              <select
                {...props}
                className="aiw-select"
                value={homeOrgUnitId}
                onChange={(e) => setHomeOrgUnitId(e.target.value)}
              >
                <option value="">{t("teams.none.option")}</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}

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
            {t(isEdit ? "teams.save" : "teams.createSubmit")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
