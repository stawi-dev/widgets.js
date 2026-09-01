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
import {
  applyGrantPlans,
  nonEmptyPlans,
  type GrantIssue,
  type GrantPlan,
} from "../../services/grant-applier.js";
import type { MemberProperties } from "../../permissions/types.js";
import type { ProfileSummary } from "../../services/profile-resolver.js";
import type { State, WorkforceMember } from "../../types.js";

/** Page size for the member and org-unit lookups. */
const SEARCH_LIMIT = 50;
/** Idle time before a typed query is sent to the service. */
const DEBOUNCE_MS = 250;

const NO_PROFILES = new Map<string, ProfileSummary>();

/** Searchable workforce member list with register, edit and state actions. */
export function MembersView() {
  const {
    client,
    tenancy,
    permissionModel,
    onMemberChange,
    features,
    organization,
    profileResolver,
  } = useIdentity();
  const hooks = useContext(HooksContext);
  const t = useT();
  const searchId = useId();

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [editing, setEditing] = useState<WorkforceMember | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [grantIssues, setGrantIssues] = useState<{
    member: WorkforceMember;
    issues: GrantIssue[];
  } | null>(null);

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

  /** The grants a member's record asks for, one plan per namespace. */
  const recordedPlans = useCallback(
    (member: WorkforceMember, op: "grant" | "revoke"): GrantPlan[] => {
      if (!permissionModel) return [];
      const props = (member.properties ?? {}) as MemberProperties;
      return nonEmptyPlans(
        permissionModel.namespaces.map((ns) => {
          const permissions = props.permission_grants?.[ns.namespace] ?? [];
          return {
            namespace: ns.namespace,
            diff:
              op === "grant"
                ? { grant: permissions, revoke: [] }
                : { grant: [], revoke: permissions },
          };
        }),
      );
    },
    [permissionModel],
  );

  const setMemberState = useCallback(
    async (member: WorkforceMember, state: State) => {
      setActionError(null);
      setGrantIssues(null);
      try {
        // Activating grants after the record is written, so a member is
        // never live in tenancy without an active record; deactivating
        // revokes first, for the same reason in reverse.
        const issues =
          state === "INACTIVE"
            ? await applyGrantPlans(
                tenancy,
                member.profileId,
                recordedPlans(member, "revoke"),
              )
            : [];
        const saved = await client.workforceMemberSave({ ...member, state });
        const applied =
          state === "ACTIVE"
            ? await applyGrantPlans(
                tenancy,
                member.profileId,
                recordedPlans(member, "grant"),
              )
            : [];
        const failures = [...issues, ...applied];
        if (failures.length > 0) setGrantIssues({ member, issues: failures });
        onMemberChange?.({
          member: saved,
          change: state === "ACTIVE" ? "activated" : "deactivated",
        });
        reload();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : String(err));
        hooks.onError?.(err);
      }
    },
    [client, hooks, onMemberChange, recordedPlans, reload, tenancy],
  );

  /** Re-applies only the writes that failed, keeping the record as it is. */
  const retryGrants = useCallback(async () => {
    if (!grantIssues) return;
    const byNamespace = new Map<string, GrantPlan>();
    for (const issue of grantIssues.issues) {
      const plan = byNamespace.get(issue.namespace) ?? {
        namespace: issue.namespace,
        diff: { grant: [], revoke: [] },
      };
      plan.diff[issue.op].push(issue.permission);
      byNamespace.set(issue.namespace, plan);
    }
    const { member } = grantIssues;
    // `applyGrantPlans` collects failures rather than throwing, so there is
    // nothing to catch here.
    const issues = await applyGrantPlans(tenancy, member.profileId, [
      ...byNamespace.values(),
    ]);
    setGrantIssues(issues.length > 0 ? { member, issues } : null);
    if (issues.length === 0) onMemberChange?.({ member, change: "grants" });
  }, [grantIssues, onMemberChange, tenancy]);

  const openRegister = useCallback(() => {
    setEditing(null);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((member: WorkforceMember) => {
    setEditing(member);
    setDialogOpen(true);
  }, []);

  const closeDialog = useCallback(() => setDialogOpen(false), []);

  const handleSaved = useCallback(
    ({ member, issues }: { member: WorkforceMember; issues: GrantIssue[] }) => {
      setDialogOpen(false);
      setGrantIssues(issues.length > 0 ? { member, issues } : null);
      reload();
    },
    [reload],
  );

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

      {grantIssues && (
        <div role="alert" className="aiw-error aiw-grant-issues">
          <p>{t("members.grantsFailed")}</p>
          <ul>
            {grantIssues.issues.map((issue) => (
              <li key={`${issue.namespace}:${issue.op}:${issue.permission}`}>
                {`${issue.permission}: ${issue.error}`}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="aiw-button"
            onClick={() => void retryGrants()}
          >
            {t("members.retryGrants")}
          </button>
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
          permissionModel={permissionModel}
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
