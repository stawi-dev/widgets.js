import { useIdentity } from "../../context/identity-context.js";
import { useT } from "../../hooks/use-t.js";
import { optionLabel } from "../labels.js";
import { platformRoleOf } from "./labels.js";
import type { ProfileSummary } from "../../services/profile-resolver.js";
import type { WorkforceMember } from "../../types.js";

interface MembersTableProps {
  members: WorkforceMember[];
  /** Resolved profiles keyed by profile id; a miss falls back to the id. */
  profiles: Map<string, ProfileSummary>;
  /** Org unit names keyed by unit id; only read when `showHomeUnit`. */
  unitNames: Map<string, string>;
  showHomeUnit: boolean;
  showPlatformRole: boolean;
  onActivate: (member: WorkforceMember) => void;
  onDeactivate: (member: WorkforceMember) => void;
  onEdit: (member: WorkforceMember) => void;
}

export function MembersTable({
  members,
  profiles,
  unitNames,
  showHomeUnit,
  showPlatformRole,
  onActivate,
  onDeactivate,
  onEdit,
}: MembersTableProps) {
  const { vocabulary } = useIdentity();
  const t = useT();

  return (
    <table className="aiw-table aiw-members-table">
      <caption className="aiw-visually-hidden">{t("members.caption")}</caption>
      <thead>
        <tr>
          <th scope="col">{t("members.col.name")}</th>
          <th scope="col">{t("members.col.engagement")}</th>
          {showHomeUnit && <th scope="col">{t("members.col.homeUnit")}</th>}
          {showPlatformRole && (
            <th scope="col">{t("members.col.platformRole")}</th>
          )}
          <th scope="col">{t("members.col.state")}</th>
          <th scope="col">{t("members.col.actions")}</th>
        </tr>
      </thead>
      <tbody>
        {members.map((m) => {
          const profile = profiles.get(m.profileId);
          const contact = profile?.email ?? profile?.phone;
          const state = m.state ?? "CREATED";
          const role = platformRoleOf(m.properties);
          return (
            <tr key={m.id}>
              <td>
                <span className="aiw-members-name">
                  {profile?.name ?? m.profileId}
                </span>
                {contact && (
                  <span className="aiw-members-contact">{contact}</span>
                )}
              </td>
              <td>
                {optionLabel(vocabulary.engagementTypes, m.engagementType)}
              </td>
              {showHomeUnit && (
                <td>
                  {m.homeOrgUnitId
                    ? (unitNames.get(m.homeOrgUnitId) ?? m.homeOrgUnitId)
                    : ""}
                </td>
              )}
              {showPlatformRole && (
                <td>{optionLabel(vocabulary.platformRoles, role)}</td>
              )}
              <td>{t(`state.${state}`)}</td>
              <td className="aiw-members-actions">
                {state === "ACTIVE" ? (
                  <button
                    type="button"
                    className="aiw-button"
                    onClick={() => onDeactivate(m)}
                  >
                    {t("members.deactivate")}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="aiw-button"
                    onClick={() => onActivate(m)}
                  >
                    {t("members.activate")}
                  </button>
                )}
                <button
                  type="button"
                  className="aiw-button"
                  onClick={() => onEdit(m)}
                >
                  {t("members.edit")}
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
