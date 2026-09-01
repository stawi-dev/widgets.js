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
import { MembersTable } from "./MembersTable.js";
import { RegisterMemberDialog } from "./RegisterMemberDialog.js";
import type { ProfileSummary } from "../../services/profile-resolver.js";
import type { State, WorkforceMember } from "../../types.js";

/** Page size for the member and org-unit lookups. */
const SEARCH_LIMIT = 50;
/** Idle time before a typed query is sent to the service. */
const DEBOUNCE_MS = 250;

const NO_PROFILES = new Map<string, ProfileSummary>();

/** Searchable workforce member list with register, edit and state actions. */
export function MembersView() {
  const { client, features, organization, profileResolver } = useIdentity();
  const hooks = useContext(HooksContext);
  const t = useT();
  const searchId = useId();

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [editing, setEditing] = useState<WorkforceMember | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const organizationId = organization?.id ?? "";
  const { orgUnits, platformRoles } = features;

  useEffect(() => {
    if (query === debouncedQuery) return;
    const timer = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, debouncedQuery]);

  const members = useAsync(
    () =>
      client.workforceMemberSearch({
        organizationId,
        ...(debouncedQuery ? { query: debouncedQuery } : {}),
        cursor: { limit: SEARCH_LIMIT },
      }),
    [client, organizationId, debouncedQuery],
  );

  const list = useMemo(() => members.data ?? [], [members.data]);
  const profileIds = list.map((m) => m.profileId).join(",");

  const profiles = useAsync(
    () => profileResolver.resolve(list.map((m) => m.profileId)),
    [profileResolver, profileIds],
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

  const unitNames = useMemo(
    () => new Map((units.data ?? []).map((u) => [u.id, u.name])),
    [units.data],
  );

  const reload = members.reload;

  const setMemberState = useCallback(
    async (member: WorkforceMember, state: State) => {
      setActionError(null);
      try {
        await client.workforceMemberSave({ ...member, state });
        reload();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : String(err));
        hooks.onError?.(err);
      }
    },
    [client, hooks, reload],
  );

  const openRegister = useCallback(() => {
    setEditing(null);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((member: WorkforceMember) => {
    setEditing(member);
    setDialogOpen(true);
  }, []);

  const closeDialog = useCallback(() => setDialogOpen(false), []);

  const handleSaved = useCallback(() => {
    setDialogOpen(false);
    reload();
  }, [reload]);

  useEffect(() => {
    if (members.error) hooks.onError?.(members.error);
  }, [members.error, hooks]);

  function registerButton(labelKey: string) {
    return (
      <button
        type="button"
        className="aiw-button-primary"
        onClick={openRegister}
      >
        {t(labelKey)}
      </button>
    );
  }

  return (
    <div className="aiw-members">
      <div className="aiw-members-toolbar">
        <label className="aiw-visually-hidden" htmlFor={searchId}>
          {t("members.search")}
        </label>
        <input
          id={searchId}
          type="search"
          className="aiw-input"
          placeholder={t("members.search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {registerButton("members.register")}
      </div>

      {actionError && (
        <div role="alert" className="aiw-error">
          {actionError}
        </div>
      )}

      {members.error ? (
        <div className="aiw-members-error">
          <div role="alert" className="aiw-error">
            {t("members.loadFailed")}
          </div>
          <button type="button" className="aiw-button" onClick={reload}>
            {t("common.retry")}
          </button>
        </div>
      ) : members.loading ? (
        <LoadingRows label={t("members.loading")} />
      ) : list.length === 0 ? (
        <EmptyState
          title={t(debouncedQuery ? "members.noMatches" : "members.none")}
          description={t(
            debouncedQuery ? "members.noMatchesHint" : "members.noneHint",
          )}
          action={
            debouncedQuery ? undefined : registerButton("members.registerFirst")
          }
        />
      ) : (
        <MembersTable
          members={list}
          profiles={profiles.data ?? NO_PROFILES}
          unitNames={unitNames}
          showHomeUnit={orgUnits}
          showPlatformRole={platformRoles}
          onActivate={(m) => void setMemberState(m, "ACTIVE")}
          onDeactivate={(m) => void setMemberState(m, "INACTIVE")}
          onEdit={openEdit}
        />
      )}

      {dialogOpen && (
        <RegisterMemberDialog
          member={editing}
          units={units.data ?? []}
          onClose={closeDialog}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
