import { useCallback, useContext, useEffect, useId, useState } from "react";
import { useIdentity } from "../../context/identity-context.js";
import { HooksContext } from "../../context/hooks-context.js";
import { useAsync } from "../../hooks/use-async.js";
import { useT } from "../../hooks/use-t.js";
import { EmptyState } from "../EmptyState.js";
import { LoadingRows } from "../LoadingRows.js";
import { RegisterMemberDialog } from "../members/RegisterMemberDialog.js";
import { GrantIssuesAlert } from "../members/GrantIssuesAlert.js";
import { MemberList, memberName } from "./MemberList.js";
import { NamespacePanel } from "./NamespacePanel.js";
import { fetchAllPages } from "../../services/fetch-all.js";
import {
  applyGrants,
  retryGrantIssues,
  type GrantIssue,
} from "../../services/grant-applier.js";
import { bundleFor } from "../../permissions/model.js";
import type {
  AccessBundle,
  EffectivePermission,
  MemberProperties,
  PermissionNamespace,
} from "../../permissions/types.js";
import type { ProfileSummary } from "../../services/profile-resolver.js";
import type { WorkforceMember } from "../../types.js";

/** Page size for the member lookup. */
const SEARCH_LIMIT = 50;

const NO_PROFILES = new Map<string, ProfileSummary>();

/** Copy of a namespace-keyed record, with its arrays copied too. */
function copyLists(
  record: Record<string, string[]> | undefined,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(record ?? {}))
    out[key] = [...value];
  return out;
}

/** Drops namespaces whose list is empty, so the record stays tidy. */
function prune(record: Record<string, string[]>): Record<string, string[]> {
  for (const [key, value] of Object.entries(record)) {
    if (value.length === 0) delete record[key];
  }
  return record;
}

/**
 * The member record after one permission is switched.
 *
 * Turning a permission on always records a grant and clears any revoke.
 * Turning one off always drops the grant, and records a revoke unless the
 * permission was only ever an override — a bundle permission (and one the
 * platform role carries) needs the revoke to remember the admin's intent.
 */
export function togglePermission(
  properties: MemberProperties,
  namespace: string,
  row: EffectivePermission,
  on: boolean,
): MemberProperties {
  const grants = copyLists(properties.permission_grants);
  const revokes = copyLists(properties.permission_revokes);
  const add = (record: Record<string, string[]>) => {
    record[namespace] = [
      ...(record[namespace] ?? []).filter((p) => p !== row.permission),
      row.permission,
    ];
  };
  const drop = (record: Record<string, string[]>) => {
    const list = record[namespace];
    if (list) record[namespace] = list.filter((p) => p !== row.permission);
  };

  if (on) {
    add(grants);
    drop(revokes);
  } else {
    drop(grants);
    if (row.source !== "granted") add(revokes);
  }

  return {
    ...properties,
    permission_grants: prune(grants),
    permission_revokes: prune(revokes),
  };
}

/** The member record after a bundle is re-applied: its set, and no overrides. */
export function reapplyBundle(
  properties: MemberProperties,
  namespace: string,
  bundle: AccessBundle,
): MemberProperties {
  const grants = copyLists(properties.permission_grants);
  const revokes = copyLists(properties.permission_revokes);
  grants[namespace] = [...bundle.permissions];
  delete revokes[namespace];
  return {
    ...properties,
    permission_grants: prune(grants),
    permission_revokes: prune(revokes),
  };
}

function propertiesOf(member: WorkforceMember): MemberProperties {
  return (member.properties ?? {}) as MemberProperties;
}

/** Active members first, so the people who can act appear at the top. */
function activeFirst(a: WorkforceMember, b: WorkforceMember): number {
  const rank = (m: WorkforceMember) => (m.state === "ACTIVE" ? 0 : 1);
  return rank(a) - rank(b);
}

/**
 * Per-member permission editor: a member picker on the left, and on the
 * right every permission the catalogue registers for the host's
 * namespaces, tagged with the reason it is on or off. Toggling writes to
 * tenancy first and then records the outcome on the member.
 */
export function PermissionsView() {
  const {
    client,
    tenancy,
    permissionModel,
    onMemberChange,
    organization,
    features,
    profileResolver,
  } = useIdentity();
  const hooks = useContext(HooksContext);
  const t = useT();
  const searchId = useId();

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Members rewritten by this screen, keyed by member id. */
  const [edited, setEdited] = useState<Record<string, WorkforceMember>>({});
  /** Writes the member dialog could not land, with the member they belong to. */
  const [grantIssues, setGrantIssues] = useState<{
    member: WorkforceMember;
    issues: GrantIssue[];
  } | null>(null);

  const organizationId = organization?.id ?? "";

  const catalogue = useAsync(() => tenancy.listServiceNamespaces(), [tenancy]);

  const members = useAsync(
    () =>
      fetchAllPages(
        (cursor) => client.workforceMemberSearch({ organizationId, cursor }),
        { limit: SEARCH_LIMIT },
      ),
    [client, organizationId],
  );

  const loaded = members.data?.items ?? [];
  const profileIds = loaded.map((m) => m.profileId).join(",");

  const profiles = useAsync(
    () => profileResolver.resolve(loaded.map((m) => m.profileId)),
    [profileResolver, profileIds],
  );

  const units = useAsync(
    () =>
      features.orgUnits
        ? client.orgUnitSearch({
            organizationId,
            cursor: { limit: SEARCH_LIMIT },
          })
        : Promise.resolve([]),
    [client, organizationId, features.orgUnits],
  );

  const resolved = profiles.data ?? NO_PROFILES;
  const needle = query.trim().toLowerCase();
  const list = loaded
    .map((m) => edited[m.id] ?? m)
    .filter(
      (m) =>
        needle === "" ||
        memberName(m, resolved).toLowerCase().includes(needle) ||
        m.profileId.toLowerCase().includes(needle),
    )
    .sort(activeFirst);

  // Selecting nothing lands on the first member rather than an empty panel.
  const selected = list.find((m) => m.id === selectedId) ?? list[0] ?? null;

  useEffect(() => {
    if (members.error) hooks.onError?.(members.error);
  }, [members.error, hooks]);

  /**
   * Shows the new record at once, applies `writes` to tenancy, then
   * persists. Any failure puts the member back as it was and reports why.
   */
  const persist = useCallback(
    async (
      member: WorkforceMember,
      properties: MemberProperties,
      writes: () => Promise<void>,
    ) => {
      setError(null);
      setGrantIssues(null);
      setBusy(true);
      setEdited((prev) => ({
        ...prev,
        [member.id]: { ...member, properties },
      }));
      try {
        await writes();
        const saved = await client.workforceMemberSave({
          ...member,
          properties,
        });
        setEdited((prev) => ({ ...prev, [member.id]: saved }));
        onMemberChange?.({ member: saved, change: "grants" });
      } catch (err) {
        setEdited((prev) => ({ ...prev, [member.id]: member }));
        setError(err instanceof Error ? err.message : String(err));
        hooks.onError?.(err);
      } finally {
        setBusy(false);
      }
    },
    [client, hooks, onMemberChange],
  );

  const handleToggle = useCallback(
    (ns: PermissionNamespace, row: EffectivePermission, next: boolean) => {
      if (!selected) return;
      const mutation = {
        namespace: ns.namespace,
        permission: row.permission,
        profileId: selected.profileId,
      };
      void persist(
        selected,
        togglePermission(propertiesOf(selected), ns.namespace, row, next),
        async () => {
          if (next) await tenancy.grantPermission(mutation);
          else await tenancy.revokePermission(mutation);
        },
      );
    },
    [persist, selected, tenancy],
  );

  const handleReapply = useCallback(
    (ns: PermissionNamespace) => {
      if (!selected || !permissionModel) return;
      const properties = propertiesOf(selected);
      const bundle = bundleFor(
        permissionModel,
        ns.namespace,
        properties.access_bundle?.[ns.namespace] ?? "",
      );
      if (!bundle) return;
      const extras = (
        properties.permission_grants?.[ns.namespace] ?? []
      ).filter((p) => !bundle.permissions.includes(p));
      void persist(
        selected,
        reapplyBundle(properties, ns.namespace, bundle),
        async () => {
          const { failed } = await applyGrants(
            tenancy,
            selected.profileId,
            { grant: [...bundle.permissions], revoke: extras },
            ns.namespace,
          );
          if (failed.length > 0) {
            throw new Error(
              failed.map((f) => `${f.permission}: ${f.error}`).join("; "),
            );
          }
        },
      );
    },
    [permissionModel, persist, selected, tenancy],
  );

  const reload = members.reload;

  /**
   * Shows the new bundle at once and refreshes the list behind it. Grants
   * the dialog could not apply are reported here, with a retry, rather than
   * left to be discovered later.
   */
  const handleSaved = useCallback(
    ({ member, issues }: { member: WorkforceMember; issues: GrantIssue[] }) => {
      setDialogOpen(false);
      const id = selected?.id;
      if (id) setEdited((prev) => ({ ...prev, [id]: { ...member, id } }));
      setGrantIssues(issues.length > 0 ? { member, issues } : null);
      reload();
    },
    [reload, selected],
  );

  /** Re-applies only the failed writes, leaving the record as it is. */
  const retryGrants = useCallback(async () => {
    if (!grantIssues) return;
    const { member } = grantIssues;
    const issues = await retryGrantIssues(
      tenancy,
      member.profileId,
      grantIssues.issues,
    );
    setGrantIssues(issues.length > 0 ? { member, issues } : null);
    if (issues.length === 0) onMemberChange?.({ member, change: "grants" });
  }, [grantIssues, onMemberChange, tenancy]);

  if (!permissionModel) return null;

  if (catalogue.error) {
    return (
      <EmptyState
        title={t("permissions.denied")}
        description={t("permissions.deniedHint")}
      />
    );
  }

  if (members.error) {
    return (
      <div className="aiw-permissions-error">
        <div role="alert" className="aiw-error">
          {t("permissions.loadFailed")}
        </div>
        <button type="button" className="aiw-button" onClick={members.reload}>
          {t("common.retry")}
        </button>
      </div>
    );
  }

  if (catalogue.loading || members.loading) {
    return <LoadingRows label={t("permissions.loading")} />;
  }

  if (loaded.length === 0) {
    return (
      <EmptyState
        title={t("permissions.none")}
        description={t("permissions.noneHint")}
      />
    );
  }

  const catalogueFor = (ns: string) =>
    (catalogue.data ?? []).find((entry) => entry.namespace === ns);

  return (
    <div className="aiw-permissions">
      <div className="aiw-permissions-toolbar">
        <label className="aiw-visually-hidden" htmlFor={searchId}>
          {t("permissions.search")}
        </label>
        <input
          id={searchId}
          type="search"
          className="aiw-input"
          placeholder={t("permissions.search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {error && (
        <div role="alert" className="aiw-error">
          {`${t("permissions.writeFailed")}: ${error}`}
        </div>
      )}

      {grantIssues && (
        <GrantIssuesAlert
          issues={grantIssues.issues}
          onRetry={() => void retryGrants()}
        />
      )}

      <div className="aiw-perm-layout">
        <MemberList
          members={list}
          profiles={resolved}
          selectedId={selected?.id ?? null}
          onSelect={setSelectedId}
        />

        <div className="aiw-perm-panels">
          {selected === null ? (
            <EmptyState title={t("permissions.noMatches")} />
          ) : (
            permissionModel.namespaces.map((ns) => (
              <NamespacePanel
                key={ns.namespace}
                model={permissionModel}
                namespace={ns}
                catalogue={catalogueFor(ns.namespace)}
                properties={propertiesOf(selected)}
                memberName={memberName(selected, resolved)}
                busy={busy}
                onToggle={handleToggle}
                onReapply={handleReapply}
                onChangeBundle={() => setDialogOpen(true)}
              />
            ))
          )}
        </div>
      </div>

      {dialogOpen && selected && (
        <RegisterMemberDialog
          member={selected}
          units={units.data ?? []}
          onClose={() => setDialogOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
