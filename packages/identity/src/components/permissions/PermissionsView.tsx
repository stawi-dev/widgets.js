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
import { IdentityError } from "../../services/errors.js";
import { isPermissionIdentifier } from "../../services/tenancy-client.js";
import type { ServiceNamespace } from "../../services/tenancy-client.js";
import {
  bundleFor,
  reapplyBundle,
  settleGrants,
  togglePermission,
} from "../../permissions/model.js";
import type {
  EffectivePermission,
  MemberProperties,
  PermissionNamespace,
} from "../../permissions/types.js";
import type { ProfileSummary } from "../../services/profile-resolver.js";
import type { WorkforceMember } from "../../types.js";

/** Page size for the member lookup. */
const SEARCH_LIMIT = 50;

const NO_PROFILES = new Map<string, ProfileSummary>();

const NO_CATALOGUE: ServiceNamespace[] = [];

/** What one write attempt achieved, beyond what the caller assumed. */
interface WriteOutcome {
  /** The record as it should be saved, when it differs from the optimistic one. */
  properties?: MemberProperties;
  /** Writes that did not land — reported for retry rather than thrown. */
  issues?: GrantIssue[];
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
 * Drops catalogue rows whose namespace or permission is not a lower-snake
 * identifier: they can never be granted (the tenancy client rejects them),
 * so rendering a toggle for one would only offer an action that fails.
 */
function usableCatalogue(entries: ServiceNamespace[]): {
  entries: ServiceNamespace[];
  skipped: string[];
} {
  const usable: ServiceNamespace[] = [];
  const skipped: string[] = [];
  for (const entry of entries) {
    if (!isPermissionIdentifier(entry.namespace)) {
      skipped.push(String(entry.namespace));
      continue;
    }
    const permissions: string[] = [];
    for (const permission of entry.permissions ?? []) {
      if (isPermissionIdentifier(permission)) permissions.push(permission);
      else skipped.push(`${entry.namespace}/${String(permission)}`);
    }
    usable.push({ ...entry, permissions });
  }
  return { entries: usable, skipped };
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
  /**
   * A change tenancy accepted whose record could not be written. The screen
   * keeps showing the new permission — it is real — and offers the save again.
   */
  const [unsaved, setUnsaved] = useState<{
    member: WorkforceMember;
    properties: MemberProperties;
    error: string;
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

  const usable = useMemo(
    () => usableCatalogue(catalogue.data ?? NO_CATALOGUE),
    [catalogue.data],
  );
  const skipped = usable.skipped.join(",");

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

  useEffect(() => {
    if (catalogue.error) hooks.onError?.(catalogue.error);
  }, [catalogue.error, hooks]);

  useEffect(() => {
    // Once per catalogue, not once per row: a malformed catalogue is one fault.
    if (skipped === "") return;
    hooks.onError?.(
      new IdentityError(
        "invalid_argument",
        `invalid_argument: catalogue entries skipped: ${skipped}`,
      ),
    );
  }, [skipped, hooks]);

  /** Writes the record and tells the host, keeping the screen in step. */
  const saveRecord = useCallback(
    async (member: WorkforceMember, properties: MemberProperties) => {
      const saved = await client.workforceMemberSave({ ...member, properties });
      setEdited((prev) => ({ ...prev, [member.id]: saved }));
      onMemberChange?.({ member: saved, change: "grants" });
    },
    [client, onMemberChange],
  );

  /**
   * Shows the new record at once, applies `writes` to tenancy, then
   * persists what actually landed.
   *
   * A tenancy failure puts the member back as it was: nothing changed. A
   * save failure does not — the permission *is* changed in tenancy, so
   * hiding it would be a lie; the row stays and the save is offered again.
   */
  const persist = useCallback(
    async (
      member: WorkforceMember,
      optimistic: MemberProperties,
      writes: () => Promise<WriteOutcome>,
    ) => {
      setError(null);
      setGrantIssues(null);
      setUnsaved(null);
      setBusy(true);
      setEdited((prev) => ({
        ...prev,
        [member.id]: { ...member, properties: optimistic },
      }));
      let applied = false;
      let properties = optimistic;
      try {
        const outcome = await writes();
        applied = true;
        properties = outcome.properties ?? optimistic;
        if (properties !== optimistic) {
          setEdited((prev) => ({
            ...prev,
            [member.id]: { ...member, properties },
          }));
        }
        if (outcome.issues && outcome.issues.length > 0) {
          setGrantIssues({ member, issues: outcome.issues });
        }
        await saveRecord(member, properties);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (applied) setUnsaved({ member, properties, error: message });
        else {
          setEdited((prev) => ({ ...prev, [member.id]: member }));
          setError(message);
        }
        hooks.onError?.(err);
      } finally {
        setBusy(false);
      }
    },
    [hooks, saveRecord],
  );

  /** Re-attempts only the record write; tenancy already has the change. */
  const retrySave = useCallback(async () => {
    if (!unsaved) return;
    setBusy(true);
    try {
      await saveRecord(unsaved.member, unsaved.properties);
      setUnsaved(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setUnsaved({ ...unsaved, error: message });
      hooks.onError?.(err);
    } finally {
      setBusy(false);
    }
  }, [hooks, saveRecord, unsaved]);

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
          return {};
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
      const attempted = reapplyBundle(properties, ns.namespace, bundle);
      void persist(selected, attempted, async () => {
        const { failed } = await applyGrants(
          tenancy,
          selected.profileId,
          { grant: [...bundle.permissions], revoke: extras },
          ns.namespace,
        );
        // A partly-applied bundle is recorded as it landed and reported for
        // retry, so the record never claims grants tenancy refused.
        return {
          properties: settleGrants(properties, attempted, ns.namespace, failed),
          issues: failed.map((f) => ({ ...f, namespace: ns.namespace })),
        };
      });
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
      setUnsaved(null);
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

  // Only a refusal means the account cannot manage permissions; anything
  // else is a failure to load, which is worth retrying.
  if (catalogue.error) {
    const denied =
      catalogue.error instanceof IdentityError &&
      catalogue.error.code === "permission_denied";
    return denied ? (
      <EmptyState
        title={t("permissions.denied")}
        description={t("permissions.deniedHint")}
      />
    ) : (
      <div className="aiw-permissions-error">
        <div role="alert" className="aiw-error">
          {t("permissions.catalogueFailed")}
        </div>
        <button type="button" className="aiw-button" onClick={catalogue.reload}>
          {t("common.retry")}
        </button>
      </div>
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
    usable.entries.find((entry) => entry.namespace === ns);

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

      {unsaved && (
        <div role="alert" className="aiw-error aiw-perm-unsaved">
          <span>{`${t("permissions.saveFailed")}: ${unsaved.error}`}</span>
          <button
            type="button"
            className="aiw-button"
            disabled={busy}
            onClick={() => void retrySave()}
          >
            {t("permissions.retrySave")}
          </button>
        </div>
      )}

      {grantIssues && (
        <GrantIssuesAlert
          issues={grantIssues.issues}
          onRetry={() => void retryGrants()}
        />
      )}

      <div className="aiw-perm-layout">
        <div className="aiw-perm-member-column">
          {members.data?.truncated && (
            <div role="status" className="aiw-notice">
              {t("permissions.truncated", { count: String(loaded.length) })}
            </div>
          )}
          <MemberList
            members={list}
            profiles={resolved}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
          />
        </div>

        <div className="aiw-perm-panels">
          {selected === null ? (
            <EmptyState title={t("permissions.noMatches")} />
          ) : (
            <>
              <h2 className="aiw-perm-selected">
                {memberName(selected, resolved)}
              </h2>
              {permissionModel.namespaces.map((ns) => (
                <NamespacePanel
                  key={ns.namespace}
                  model={permissionModel}
                  namespace={ns}
                  catalogue={catalogueFor(ns.namespace)}
                  properties={propertiesOf(selected)}
                  busy={busy}
                  onToggle={handleToggle}
                  onReapply={handleReapply}
                  onChangeBundle={() => setDialogOpen(true)}
                />
              ))}
            </>
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
