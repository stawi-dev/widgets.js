import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { useIdentity } from "../../context/identity-context.js";
import { HooksContext } from "../../context/hooks-context.js";
import { useAsync } from "../../hooks/use-async.js";
import { useT } from "../../hooks/use-t.js";
import { EmptyState } from "../EmptyState.js";
import { LoadingRows } from "../LoadingRows.js";
import { AssignRoleDialog } from "./AssignRoleDialog.js";
import { RoleMatrix, type RoleMatrixRow } from "./RoleMatrix.js";
import { SCOPE_TYPES, roleKeyLabel } from "./scopes.js";
import type {
  AccessRoleAssignment,
  AccessScopeType,
  State,
} from "../../types.js";

/** Page size for the assignment, member, team and unit lookups. */
const SEARCH_LIMIT = 50;

/** States that mean the assignment no longer grants anything. */
const REVOKED_STATES = new Set<State>(["INACTIVE", "DELETED"]);

/** Role assignments with a role × scope matrix, filters and assign/revoke. */
export function RolesView() {
  const { client, vocabulary, features, organization, profileResolver } =
    useIdentity();
  const hooks = useContext(HooksContext);
  const t = useT();
  const roleFilterId = useId();
  const scopeFilterId = useId();
  const showRevokedId = useId();

  const [roleKeyFilter, setRoleKeyFilter] = useState("");
  const [scopeTypeFilter, setScopeTypeFilter] = useState("");
  const [showRevoked, setShowRevoked] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const organizationId = organization?.id ?? "";
  const { orgUnits } = features;

  const assignments = useAsync(
    () =>
      client.accessRoleAssignmentSearch({
        ...(roleKeyFilter ? { roleKey: roleKeyFilter } : {}),
        ...(scopeTypeFilter
          ? { scopeType: scopeTypeFilter as AccessScopeType }
          : {}),
        cursor: { limit: SEARCH_LIMIT },
      }),
    [client, roleKeyFilter, scopeTypeFilter],
  );

  const members = useAsync(
    () =>
      client.workforceMemberSearch({
        organizationId,
        cursor: { limit: SEARCH_LIMIT },
      }),
    [client, organizationId],
  );

  const teams = useAsync(
    () =>
      client.internalTeamSearch({
        organizationId,
        cursor: { limit: SEARCH_LIMIT },
      }),
    [client, organizationId],
  );

  const units = useAsync(
    () =>
      orgUnits
        ? client.orgUnitSearch({
            organizationId,
            cursor: { limit: SEARCH_LIMIT },
          })
        : Promise.resolve([]),
    [client, organizationId, orgUnits],
  );

  const memberList = useMemo(() => members.data ?? [], [members.data]);
  const profileIds = memberList.map((m) => m.profileId).join(",");

  const profiles = useAsync(
    () => profileResolver.resolve(memberList.map((m) => m.profileId)),
    [profileResolver, profileIds],
  );

  /** Display name per workforce member id: profile name, else profile id. */
  const memberNames = useMemo(() => {
    const resolved = profiles.data;
    return new Map(
      memberList.map((m) => [
        m.id,
        resolved?.get(m.profileId)?.name ?? m.profileId,
      ]),
    );
  }, [memberList, profiles.data]);

  const teamNames = useMemo(
    () => new Map((teams.data ?? []).map((team) => [team.id, team.name])),
    [teams.data],
  );
  const unitNames = useMemo(
    () => new Map((units.data ?? []).map((u) => [u.id, u.name])),
    [units.data],
  );

  // The service holds assignments across organizations; only the ones
  // belonging to this organization's members are ours to show.
  const ours = useMemo(() => {
    const ids = new Set(memberList.map((m) => m.id));
    return (assignments.data ?? []).filter((a) => ids.has(a.memberId));
  }, [assignments.data, memberList]);

  const visible = showRevoked
    ? ours
    : ours.filter((a) => !REVOKED_STATES.has(a.state ?? "CREATED"));

  const matrixRows = useMemo<RoleMatrixRow[]>(() => {
    const keys = [
      ...new Set([
        ...vocabulary.roleKeys.map((o) => o.key),
        ...ours.map((a) => a.roleKey),
      ]),
    ];
    return keys.map((key) => {
      const counts = Object.fromEntries(
        SCOPE_TYPES.map((scope) => [
          scope,
          ours.filter(
            (a) =>
              a.roleKey === key &&
              a.scopeType === scope &&
              a.state === "ACTIVE",
          ).length,
        ]),
      ) as Record<AccessScopeType, number>;
      return { key, label: roleKeyLabel(vocabulary.roleKeys, key), counts };
    });
  }, [ours, vocabulary.roleKeys]);

  /** "Team · Sales East" — the scope type plus what it points at. */
  const scopeLabel = useCallback(
    (a: AccessRoleAssignment) => {
      const type = t(`roles.scope.${a.scopeType}`);
      if (a.scopeType === "ACCESS_SCOPE_TYPE_GLOBAL") return type;
      const target =
        a.scopeType === "ACCESS_SCOPE_TYPE_ORGANIZATION"
          ? (organization?.name ?? a.scopeId ?? "")
          : a.scopeType === "ACCESS_SCOPE_TYPE_TEAM"
            ? (teamNames.get(a.scopeId ?? "") ?? a.scopeId ?? "")
            : (unitNames.get(a.scopeId ?? "") ?? a.scopeId ?? "");
      return target ? `${type} · ${target}` : type;
    },
    [organization?.name, t, teamNames, unitNames],
  );

  const reload = assignments.reload;

  const revoke = useCallback(
    async (a: AccessRoleAssignment) => {
      setActionError(null);
      try {
        await client.accessRoleAssignmentSave({ ...a, state: "INACTIVE" });
        reload();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : String(err));
        hooks.onError?.(err);
      }
    },
    [client, hooks, reload],
  );

  const handleSaved = useCallback(() => {
    setDialogOpen(false);
    reload();
  }, [reload]);

  useEffect(() => {
    if (assignments.error) hooks.onError?.(assignments.error);
  }, [assignments.error, hooks]);

  // The dialog picks from the org's members, so it stays shut until they
  // are loaded — otherwise it would claim there is nobody to assign.
  const membersLoading = members.loading;

  function assignButton(labelKey: string) {
    return (
      <button
        type="button"
        className="aiw-button-primary"
        disabled={membersLoading}
        aria-busy={membersLoading || undefined}
        onClick={() => setDialogOpen(true)}
      >
        {t(labelKey)}
      </button>
    );
  }

  return (
    <div className="aiw-roles">
      <div className="aiw-roles-toolbar">
        <label className="aiw-field-label" htmlFor={roleFilterId}>
          {t("roles.filter.roleKey")}
        </label>
        <select
          id={roleFilterId}
          className="aiw-select"
          value={roleKeyFilter}
          onChange={(e) => setRoleKeyFilter(e.target.value)}
        >
          <option value="">{t("roles.filter.any")}</option>
          {vocabulary.roleKeys.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>

        <label className="aiw-field-label" htmlFor={scopeFilterId}>
          {t("roles.filter.scopeType")}
        </label>
        <select
          id={scopeFilterId}
          className="aiw-select"
          value={scopeTypeFilter}
          onChange={(e) => setScopeTypeFilter(e.target.value)}
        >
          <option value="">{t("roles.filter.any")}</option>
          {SCOPE_TYPES.map((scope) => (
            <option key={scope} value={scope}>
              {t(`roles.scope.${scope}`)}
            </option>
          ))}
        </select>

        <label className="aiw-checkbox" htmlFor={showRevokedId}>
          <input
            id={showRevokedId}
            type="checkbox"
            checked={showRevoked}
            onChange={(e) => setShowRevoked(e.target.checked)}
          />
          {t("roles.showRevoked")}
        </label>

        {assignButton("roles.assign")}
      </div>

      {actionError && (
        <div role="alert" className="aiw-error">
          {actionError}
        </div>
      )}

      {assignments.error ? (
        <div className="aiw-roles-error">
          <div role="alert" className="aiw-error">
            {t("roles.loadFailed")}
          </div>
          <button type="button" className="aiw-button" onClick={reload}>
            {t("common.retry")}
          </button>
        </div>
      ) : assignments.loading ? (
        <LoadingRows label={t("roles.loading")} />
      ) : (
        <div className="aiw-roles-layout">
          <RoleMatrix rows={matrixRows} />

          {visible.length === 0 ? (
            <EmptyState
              title={t("roles.none")}
              description={t("roles.noneHint")}
              action={assignButton("roles.assignFirst")}
            />
          ) : (
            <table className="aiw-table aiw-roles-table">
              <caption className="aiw-visually-hidden">
                {t("roles.caption")}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{t("roles.col.member")}</th>
                  <th scope="col">{t("roles.col.role")}</th>
                  <th scope="col">{t("roles.col.scope")}</th>
                  <th scope="col">{t("roles.col.state")}</th>
                  <th scope="col">{t("roles.col.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((a) => {
                  const state = a.state ?? "CREATED";
                  return (
                    <tr key={a.id}>
                      <td>{memberNames.get(a.memberId) ?? a.memberId}</td>
                      <td>{roleKeyLabel(vocabulary.roleKeys, a.roleKey)}</td>
                      <td>{scopeLabel(a)}</td>
                      <td>{t(`state.${state}`)}</td>
                      <td className="aiw-roles-actions">
                        {!REVOKED_STATES.has(state) && (
                          <button
                            type="button"
                            className="aiw-button"
                            onClick={() => void revoke(a)}
                          >
                            {t("roles.revoke")}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {dialogOpen && (
        <AssignRoleDialog
          members={memberList}
          memberNames={memberNames}
          units={units.data ?? []}
          teams={teams.data ?? []}
          onClose={() => setDialogOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
