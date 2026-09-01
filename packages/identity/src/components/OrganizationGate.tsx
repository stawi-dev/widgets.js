import { useContext, useEffect, useMemo, type ReactNode } from "react";
import { useIdentity } from "../context/identity-context.js";
import { HooksContext } from "../context/hooks-context.js";
import { useAsync } from "../hooks/use-async.js";
import { useT } from "../hooks/use-t.js";
import { EmptyState } from "./EmptyState.js";
import { LoadingRows } from "./LoadingRows.js";
import { OrganizationForm } from "./OrganizationForm.js";

/** Page size for the organization lookup behind the gate. */
const SEARCH_LIMIT = 50;

interface OrganizationGateProps {
  /** Pin the widget to one organization instead of offering a choice. */
  organizationId?: string;
  /** Offer the create form when the caller has no organizations. */
  allowCreateOrganization?: boolean;
  children: ReactNode;
}

/**
 * Resolves the organization every other screen operates on: pins the one the
 * host asked for, auto-selects a sole organization, offers a picker when
 * there are several, and falls back to the create form when there are none.
 */
export function OrganizationGate({
  organizationId,
  allowCreateOrganization = true,
  children,
}: OrganizationGateProps) {
  const { client, organization, setOrganization } = useIdentity();
  const hooks = useContext(HooksContext);
  const t = useT();

  const { data, error, loading, reload } = useAsync(
    () => client.organizationSearch({ cursor: { limit: SEARCH_LIMIT } }),
    [client],
  );

  // With `organizationId` the search result is filtered down to that one org;
  // the service has no get-by-id, so a miss means "not visible to you".
  const candidates = useMemo(() => {
    const all = data ?? [];
    return organizationId ? all.filter((o) => o.id === organizationId) : all;
  }, [data, organizationId]);

  const sole = candidates.length === 1 ? candidates[0]! : null;

  useEffect(() => {
    if (!organization && sole) setOrganization(sole);
  }, [organization, sole, setOrganization]);

  useEffect(() => {
    if (error) hooks.onError?.(error);
  }, [error, hooks]);

  if (organization) return <>{children}</>;
  if (loading) return <LoadingRows label={t("org.loading")} />;

  if (error) {
    return (
      <div className="aiw-org-gate">
        <div role="alert" className="aiw-error">
          {t("org.loadFailed")}
        </div>
        <button type="button" className="aiw-button" onClick={reload}>
          {t("common.retry")}
        </button>
      </div>
    );
  }

  if (sole) {
    // The selection effect runs on the next commit; keep the skeleton up
    // rather than flashing a picker for a single organization.
    return <LoadingRows label={t("org.loading")} />;
  }

  if (candidates.length === 0) {
    if (organizationId) {
      return (
        <EmptyState
          title={t("org.notFoundTitle")}
          description={t("org.notFound")}
        />
      );
    }
    if (!allowCreateOrganization) {
      return (
        <EmptyState title={t("org.none")} description={t("org.noneHint")} />
      );
    }
    return <OrganizationForm />;
  }

  return (
    <div className="aiw-org-picker">
      <h2 className="aiw-org-picker-title">{t("org.pick")}</h2>
      <p className="aiw-org-picker-hint">{t("org.pickHint")}</p>
      <ul className="aiw-org-picker-list">
        {candidates.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              className="aiw-org-picker-item"
              onClick={() => setOrganization(o)}
            >
              <span className="aiw-org-picker-name">{o.name}</span>
              <span className="aiw-org-picker-code">{o.code}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
