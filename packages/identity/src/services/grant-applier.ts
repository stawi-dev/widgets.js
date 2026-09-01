import type { TenancyClient } from "./tenancy-client.js";

/** One tenancy write that did not land, kept so the screen can offer a retry. */
export interface GrantFailure {
  permission: string;
  op: "grant" | "revoke";
  /** The error message, already flattened for display. */
  error: string;
}

/**
 * Applies one namespace's grant/revoke plan to tenancy, one write at a
 * time: the service is idempotent but not transactional, so a failure in
 * the middle must not abandon the rest. Grants run before revokes, each
 * list in the order given, and every failure is collected rather than
 * thrown — the caller decides what to show and what to retry.
 */
export async function applyGrants(
  tenancy: TenancyClient,
  profileId: string,
  diff: { grant: string[]; revoke: string[] },
  namespace: string,
): Promise<{ failed: GrantFailure[] }> {
  const plan: Array<{ permission: string; op: "grant" | "revoke" }> = [
    ...diff.grant.map((permission) => ({ permission, op: "grant" as const })),
    ...diff.revoke.map((permission) => ({ permission, op: "revoke" as const })),
  ];

  const failed: GrantFailure[] = [];
  for (const { permission, op } of plan) {
    const mutation = { namespace, permission, profileId };
    try {
      if (op === "grant") await tenancy.grantPermission(mutation);
      else await tenancy.revokePermission(mutation);
    } catch (err) {
      failed.push({
        permission,
        op,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { failed };
}

/** A failure tagged with the namespace whose plan produced it. */
export interface GrantIssue extends GrantFailure {
  namespace: string;
}

/** One namespace's worth of work for `applyGrantPlans`. */
export interface GrantPlan {
  namespace: string;
  diff: { grant: string[]; revoke: string[] };
}

/**
 * Runs several namespaces' plans in turn and returns every failure,
 * tagged with its namespace so the caller can retry exactly those writes.
 */
export async function applyGrantPlans(
  tenancy: TenancyClient,
  profileId: string,
  plans: GrantPlan[],
): Promise<GrantIssue[]> {
  const issues: GrantIssue[] = [];
  for (const plan of plans) {
    const { failed } = await applyGrants(
      tenancy,
      profileId,
      plan.diff,
      plan.namespace,
    );
    issues.push(...failed.map((f) => ({ ...f, namespace: plan.namespace })));
  }
  return issues;
}

/** Drops plans with nothing to write, so no empty round-trip is made. */
export function nonEmptyPlans(plans: GrantPlan[]): GrantPlan[] {
  return plans.filter(
    (p) => p.diff.grant.length > 0 || p.diff.revoke.length > 0,
  );
}

/**
 * Re-applies only the writes that failed, grouped back into one plan per
 * namespace, and returns whatever failed again. The member's record is not
 * touched: it already says what the grants should be.
 */
export async function retryGrantIssues(
  tenancy: TenancyClient,
  profileId: string,
  issues: GrantIssue[],
): Promise<GrantIssue[]> {
  const byNamespace = new Map<string, GrantPlan>();
  for (const issue of issues) {
    const plan = byNamespace.get(issue.namespace) ?? {
      namespace: issue.namespace,
      diff: { grant: [], revoke: [] },
    };
    plan.diff[issue.op].push(issue.permission);
    byNamespace.set(issue.namespace, plan);
  }
  return applyGrantPlans(tenancy, profileId, [...byNamespace.values()]);
}
