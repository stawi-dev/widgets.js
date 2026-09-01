import { useCallback, useContext, useId, useMemo, useState } from "react";
import { useIdentity } from "../../context/identity-context.js";
import { HooksContext } from "../../context/hooks-context.js";
import { useAsync } from "../../hooks/use-async.js";
import { useT } from "../../hooks/use-t.js";
import { EmptyState } from "../EmptyState.js";
import { LoadingRows } from "../LoadingRows.js";
import { optionLabel } from "../labels.js";
import { AddMembershipDialog } from "./AddMembershipDialog.js";
import type { InternalTeam, TeamMembership } from "../../types.js";

/** Page size for the membership and member lookups. */
const SEARCH_LIMIT = 50;

/** States that mean the membership no longer counts as being on the team. */
const REMOVED_STATES = new Set(["INACTIVE", "DELETED"]);

interface TeamDetailProps {
  team: InternalTeam;
  onEdit: (team: InternalTeam) => void;
}

/** Header and membership list for the selected team. */
export function TeamDetail({ team, onEdit }: TeamDetailProps) {
  const { client, vocabulary, organization, profileResolver } = useIdentity();
  const hooks = useContext(HooksContext);
  const t = useT();
  const showRemovedId = useId();

  const [showRemoved, setShowRemoved] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const organizationId = organization?.id ?? "";

  const memberships = useAsync(
    () =>
      client.teamMembershipSearch({
        teamId: team.id,
        cursor: { limit: SEARCH_LIMIT },
      }),
    [client, team.id],
  );

  const members = useAsync(
    () =>
      client.workforceMemberSearch({
        organizationId,
        cursor: { limit: SEARCH_LIMIT },
      }),
    [client, organizationId],
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

  const all = useMemo(() => memberships.data ?? [], [memberships.data]);
  const visible = showRemoved
    ? all
    : all.filter((m) => !REMOVED_STATES.has(m.state ?? "CREATED"));
  const activeMemberIds = useMemo(
    () =>
      new Set(
        all
          .filter((m) => !REMOVED_STATES.has(m.state ?? "CREATED"))
          .map((m) => m.memberId),
      ),
    [all],
  );

  const reload = memberships.reload;

  const remove = useCallback(
    async (membership: TeamMembership) => {
      setActionError(null);
      try {
        await client.teamMembershipSave({ ...membership, state: "INACTIVE" });
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

  // The add dialog picks from the org's members, so it stays shut until
  // they are loaded — otherwise it would claim the team already has everyone.
  const membersLoading = members.loading;

  function addButton(labelKey: string) {
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
    <div className="aiw-team-detail">
      <div className="aiw-team-detail-header">
        <h3 className="aiw-team-detail-title">{team.name}</h3>
        <p className="aiw-team-detail-meta">
          {[optionLabel(vocabulary.teamTypes, team.teamType), team.code]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {team.objective && (
          <p className="aiw-team-detail-objective">{team.objective}</p>
        )}
        <button
          type="button"
          className="aiw-button"
          onClick={() => onEdit(team)}
        >
          {t("teams.edit")}
        </button>
      </div>

      <div className="aiw-team-detail-toolbar">
        <label className="aiw-checkbox" htmlFor={showRemovedId}>
          <input
            id={showRemovedId}
            type="checkbox"
            checked={showRemoved}
            onChange={(e) => setShowRemoved(e.target.checked)}
          />
          {t("teams.showRemoved")}
        </label>
        {addButton("teams.addMember")}
      </div>

      {actionError && (
        <div role="alert" className="aiw-error">
          {actionError}
        </div>
      )}

      {memberships.error ? (
        <div className="aiw-team-detail-error">
          <div role="alert" className="aiw-error">
            {t("teams.members.loadFailed")}
          </div>
          <button type="button" className="aiw-button" onClick={reload}>
            {t("common.retry")}
          </button>
        </div>
      ) : memberships.loading ? (
        <LoadingRows label={t("teams.members.loading")} />
      ) : visible.length === 0 ? (
        <EmptyState
          title={t("teams.members.none")}
          description={t("teams.members.noneHint")}
          action={addButton("teams.addMemberFirst")}
        />
      ) : (
        <table className="aiw-table aiw-team-members-table">
          <caption className="aiw-visually-hidden">
            {t("teams.members.caption")}
          </caption>
          <thead>
            <tr>
              <th scope="col">{t("teams.col.member")}</th>
              <th scope="col">{t("teams.col.role")}</th>
              <th scope="col">{t("teams.col.primary")}</th>
              <th scope="col">{t("teams.col.state")}</th>
              <th scope="col">{t("teams.col.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((m) => {
              const state = m.state ?? "CREATED";
              return (
                <tr key={m.id}>
                  <td>{memberNames.get(m.memberId) ?? m.memberId}</td>
                  <td>
                    {optionLabel(vocabulary.membershipRoles, m.membershipRole)}
                  </td>
                  <td>{t(m.isPrimaryTeam ? "common.yes" : "common.no")}</td>
                  <td>{t(`state.${state}`)}</td>
                  <td className="aiw-team-members-actions">
                    {!REMOVED_STATES.has(state) && (
                      <button
                        type="button"
                        className="aiw-button"
                        onClick={() => void remove(m)}
                      >
                        {t("teams.remove")}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {dialogOpen && (
        <AddMembershipDialog
          teamId={team.id}
          members={memberList}
          memberNames={memberNames}
          excludeMemberIds={activeMemberIds}
          onClose={() => setDialogOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
