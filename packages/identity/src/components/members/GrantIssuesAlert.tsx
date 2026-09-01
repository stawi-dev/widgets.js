import { useT } from "../../hooks/use-t.js";
import type { GrantIssue } from "../../services/grant-applier.js";

interface GrantIssuesAlertProps {
  issues: GrantIssue[];
  /** Re-applies the failed writes, leaving the member's record alone. */
  onRetry: () => void;
}

/**
 * The tenancy writes a screen could not land, with a retry. Shared by every
 * screen that applies grants so a partial failure always looks the same and
 * is never silently swallowed.
 */
export function GrantIssuesAlert({ issues, onRetry }: GrantIssuesAlertProps) {
  const t = useT();
  return (
    <div role="alert" className="aiw-error aiw-grant-issues">
      <p>{t("members.grantsFailed")}</p>
      <ul>
        {issues.map((issue) => (
          <li key={`${issue.namespace}:${issue.op}:${issue.permission}`}>
            {`${issue.permission}: ${issue.error}`}
          </li>
        ))}
      </ul>
      <button type="button" className="aiw-button" onClick={onRetry}>
        {t("members.retryGrants")}
      </button>
    </div>
  );
}
