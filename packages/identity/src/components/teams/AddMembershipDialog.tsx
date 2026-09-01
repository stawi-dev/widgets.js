import { useCallback, useContext, useMemo, useState } from "react";
import { useIdentity } from "../../context/identity-context.js";
import { HooksContext } from "../../context/hooks-context.js";
import { useT } from "../../hooks/use-t.js";
import { Dialog } from "../Dialog.js";
import { Field } from "../Field.js";
import type { WorkforceMember } from "../../types.js";

interface AddMembershipDialogProps {
  teamId: string;
  /** Every workforce member of the organization. */
  members: WorkforceMember[];
  /** Display name per workforce member id. */
  memberNames: Map<string, string>;
  /** Members already on the team, which are not offered again. */
  excludeMemberIds: Set<string>;
  onClose: () => void;
  onSaved: () => void;
}

/** Adds a workforce member to a team with a membership role. */
export function AddMembershipDialog({
  teamId,
  members,
  memberNames,
  excludeMemberIds,
  onClose,
  onSaved,
}: AddMembershipDialogProps) {
  const { client, vocabulary } = useIdentity();
  const hooks = useContext(HooksContext);
  const t = useT();

  const candidates = useMemo(() => {
    const available = members.filter((m) => !excludeMemberIds.has(m.id));
    // Active members are the usual pick, so they lead the list.
    return [
      ...available.filter((m) => m.state === "ACTIVE"),
      ...available.filter((m) => m.state !== "ACTIVE"),
    ];
  }, [members, excludeMemberIds]);

  const [memberId, setMemberId] = useState(candidates[0]?.id ?? "");
  const [membershipRole, setMembershipRole] = useState(
    vocabulary.membershipRoles[0]?.value ?? "",
  );
  const [isPrimaryTeam, setIsPrimaryTeam] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!memberId) return;
      setSaving(true);
      setError(null);
      try {
        await client.teamMembershipSave({
          teamId,
          memberId,
          membershipRole,
          isPrimaryTeam,
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
    [client, hooks, isPrimaryTeam, memberId, membershipRole, onSaved, teamId],
  );

  return (
    <Dialog open title={t("teams.addMemberTitle")} onClose={onClose}>
      <form
        className="aiw-membership-form"
        noValidate
        onSubmit={(e) => void handleSubmit(e)}
      >
        {candidates.length === 0 ? (
          <p className="aiw-empty-state-description">
            {t("teams.noCandidates")}
          </p>
        ) : (
          <Field label={t("teams.field.member")}>
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

        <Field label={t("teams.field.role")}>
          {(props) => (
            <select
              {...props}
              className="aiw-select"
              value={membershipRole}
              onChange={(e) => setMembershipRole(e.target.value)}
            >
              {vocabulary.membershipRoles.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label={t("teams.field.primary")}>
          {(props) => (
            <input
              {...props}
              type="checkbox"
              className="aiw-checkbox-input"
              checked={isPrimaryTeam}
              onChange={(e) => setIsPrimaryTeam(e.target.checked)}
            />
          )}
        </Field>

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
            {t("teams.addMemberSubmit")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
