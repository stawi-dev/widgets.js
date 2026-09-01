import { useT } from "../../hooks/use-t.js";
import type { ProfileSummary } from "../../services/profile-resolver.js";
import type { WorkforceMember } from "../../types.js";

/** Display name for a member: the resolved profile name, else its id. */
export function memberName(
  member: WorkforceMember,
  profiles: Map<string, ProfileSummary>,
): string {
  const profile = profiles.get(member.profileId);
  return profile?.name || profile?.email || profile?.phone || member.profileId;
}

interface MemberListProps {
  members: WorkforceMember[];
  profiles: Map<string, ProfileSummary>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** The member picker: one button per member, the selected one marked. */
export function MemberList({
  members,
  profiles,
  selectedId,
  onSelect,
}: MemberListProps) {
  const t = useT();
  return (
    <ul className="aiw-perm-members" aria-label={t("permissions.memberList")}>
      {members.map((member) => (
        <li key={member.id}>
          <button
            type="button"
            className="aiw-perm-member"
            aria-current={member.id === selectedId}
            onClick={() => onSelect(member.id)}
          >
            <span className="aiw-perm-member-name">
              {memberName(member, profiles)}
            </span>
            <span className="aiw-perm-member-state">
              {t(`state.${member.state}`)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
