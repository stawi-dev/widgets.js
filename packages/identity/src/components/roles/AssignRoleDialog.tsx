import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useIdentity } from "../../context/identity-context.js";
import { HooksContext } from "../../context/hooks-context.js";
import { useT } from "../../hooks/use-t.js";
import { Dialog } from "../Dialog.js";
import { Field } from "../Field.js";
import { SCOPE_TYPES } from "./scopes.js";
import type {
  AccessScopeType,
  InternalTeam,
  OrgUnit,
  WorkforceMember,
} from "../../types.js";

/** Sentinel option that swaps the role select for a free-text key. */
const CUSTOM = "__custom__";

/** Role keys the service accepts: lowercase, digits and underscores. */
const ROLE_KEY = /^[a-z][a-z0-9_]*$/;

interface AssignRoleDialogProps {
  /** Every workforce member of the organization. */
  members: WorkforceMember[];
  /** Display name per workforce member id. */
  memberNames: Map<string, string>;
  units: OrgUnit[];
  teams: InternalTeam[];
  onClose: () => void;
  onSaved: () => void;
}

/** Grants a member a role at a global, org, unit or team scope. */
export function AssignRoleDialog({
  members,
  memberNames,
  units,
  teams,
  onClose,
  onSaved,
}: AssignRoleDialogProps) {
  const { client, vocabulary, features, organization } = useIdentity();
  const hooks = useContext(HooksContext);
  const t = useT();

  const candidates = useMemo(
    // Active members are the usual pick, so they lead the list.
    () => [
      ...members.filter((m) => m.state === "ACTIVE"),
      ...members.filter((m) => m.state !== "ACTIVE"),
    ],
    [members],
  );

  // Unit scopes are only reachable when the org-unit screen is on; offering
  // them otherwise is a dead end with an empty target select.
  const scopeOptions = useMemo(
    () =>
      SCOPE_TYPES.filter(
        (scope) => features.orgUnits || scope !== "ACCESS_SCOPE_TYPE_ORG_UNIT",
      ),
    [features.orgUnits],
  );

  const [memberId, setMemberId] = useState(candidates[0]?.id ?? "");
  const [roleChoice, setRoleChoice] = useState(
    vocabulary.roleKeys[0]?.key ?? CUSTOM,
  );
  const [customRoleKey, setCustomRoleKey] = useState("");
  const [scopeType, setScopeType] = useState<AccessScopeType>(
    "ACCESS_SCOPE_TYPE_ORGANIZATION",
  );
  const [unitId, setUnitId] = useState(units[0]?.id ?? "");
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [roleKeyError, setRoleKeyError] = useState<string | null>(null);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // The lists can arrive after mount, so seed the empty selects from them
  // rather than leaving the form with no value to post.
  const firstCandidateId = candidates[0]?.id ?? "";
  const firstUnitId = units[0]?.id ?? "";
  const firstTeamId = teams[0]?.id ?? "";
  useEffect(() => {
    if (!memberId && firstCandidateId) setMemberId(firstCandidateId);
  }, [memberId, firstCandidateId]);
  useEffect(() => {
    if (!unitId && firstUnitId) setUnitId(firstUnitId);
  }, [unitId, firstUnitId]);
  useEffect(() => {
    if (!teamId && firstTeamId) setTeamId(firstTeamId);
  }, [teamId, firstTeamId]);
  useEffect(() => {
    if (!scopeOptions.includes(scopeType)) {
      setScopeType("ACCESS_SCOPE_TYPE_ORGANIZATION");
    }
  }, [scopeOptions, scopeType]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!memberId) return;

      const roleKey = roleChoice === CUSTOM ? customRoleKey.trim() : roleChoice;
      if (!ROLE_KEY.test(roleKey)) {
        setRoleKeyError(t("roles.invalidRoleKey"));
        return;
      }
      setRoleKeyError(null);

      let scopeId: string | undefined;
      if (scopeType === "ACCESS_SCOPE_TYPE_ORGANIZATION") {
        scopeId = organization?.id;
      } else if (scopeType === "ACCESS_SCOPE_TYPE_ORG_UNIT") {
        scopeId = unitId;
      } else if (scopeType === "ACCESS_SCOPE_TYPE_TEAM") {
        scopeId = teamId;
      }
      if (scopeType !== "ACCESS_SCOPE_TYPE_GLOBAL" && !scopeId) {
        setTargetError(t("field.required"));
        return;
      }
      setTargetError(null);

      setSaving(true);
      setError(null);
      try {
        await client.accessRoleAssignmentSave({
          memberId,
          roleKey,
          scopeType,
          ...(scopeId ? { scopeId } : {}),
          state: "ACTIVE",
        });
        onSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        hooks.onError?.(err);
      } finally {
        setSaving(false);
      }
    },
    [
      client,
      customRoleKey,
      hooks,
      memberId,
      onSaved,
      organization?.id,
      roleChoice,
      scopeType,
      t,
      teamId,
      unitId,
    ],
  );

  return (
    <Dialog open title={t("roles.assignTitle")} onClose={onClose}>
      <form
        className="aiw-role-form"
        noValidate
        onSubmit={(e) => void handleSubmit(e)}
      >
        {candidates.length === 0 ? (
          <p className="aiw-empty-state-description">
            {t("roles.noCandidates")}
          </p>
        ) : (
          <Field label={t("roles.field.member")}>
            {(props) => (
              <select
                {...props}
                className="aiw-select"
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
              >
                {candidates.map((m) => (
                  <option key={m.id} value={m.id}>
                    {memberNames.get(m.id) ?? m.profileId}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}

        <Field label={t("roles.field.roleKey")}>
          {(props) => (
            <select
              {...props}
              className="aiw-select"
              value={roleChoice}
              onChange={(e) => setRoleChoice(e.target.value)}
            >
              {vocabulary.roleKeys.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
              <option value={CUSTOM}>{t("roles.customRoleKey")}</option>
            </select>
          )}
        </Field>

        {roleChoice === CUSTOM && (
          <Field
            label={t("roles.field.customRoleKey")}
            required
            error={roleKeyError ?? undefined}
          >
            {(props) => (
              <input
                {...props}
                type="text"
                className="aiw-input"
                value={customRoleKey}
                onChange={(e) => setCustomRoleKey(e.target.value)}
              />
            )}
          </Field>
        )}

        <Field label={t("roles.field.scopeType")}>
          {(props) => (
            <select
              {...props}
              className="aiw-select"
              value={scopeType}
              onChange={(e) => setScopeType(e.target.value as AccessScopeType)}
            >
              {scopeOptions.map((scope) => (
                <option key={scope} value={scope}>
                  {t(`roles.scope.${scope}`)}
                </option>
              ))}
            </select>
          )}
        </Field>

        {scopeType === "ACCESS_SCOPE_TYPE_ORGANIZATION" && (
          <div className="aiw-field">
            <span className="aiw-field-label">
              {t("roles.field.organization")}
            </span>
            <p className="aiw-field-static">{organization?.name ?? ""}</p>
          </div>
        )}

        {scopeType === "ACCESS_SCOPE_TYPE_ORG_UNIT" && (
          <Field
            label={t("roles.field.orgUnit")}
            error={targetError ?? undefined}
          >
            {(props) => (
              <select
                {...props}
                className="aiw-select"
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}

        {scopeType === "ACCESS_SCOPE_TYPE_TEAM" && (
          <Field label={t("roles.field.team")} error={targetError ?? undefined}>
            {(props) => (
              <select
                {...props}
                className="aiw-select"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
              >
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}

        {error && (
          <div role="alert" className="aiw-error">
            {error}
          </div>
        )}

        <div className="aiw-form-actions">
          <button type="button" className="aiw-button" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            className="aiw-button-primary"
            disabled={saving || candidates.length === 0}
          >
            {t("roles.assignSubmit")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
