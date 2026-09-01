import type { AuthRuntime } from "@stawi/auth-runtime";
import { fromConnectError, identityError, toIdentityError } from "./errors.js";

const SERVICE = "tenancy.v1.TenancyService";

/**
 * Namespaces and permissions are lower-snake identifiers on the platform
 * side. Anything else is a host mistake — a label, a path, an interpolated
 * `undefined` — and must never reach the wire, where it would either 400 or,
 * worse, write a tuple nothing can read back.
 */
const IDENTIFIER = /^[a-z][a-z0-9_]*$/;

/** True when `value` is a well-formed namespace or permission name. */
export function isPermissionIdentifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function assertIdentifier(field: string, value: string): void {
  if (!isPermissionIdentifier(value)) {
    throw identityError(
      "invalid_argument",
      `${field} must match ${IDENTIFIER.source}, got ${JSON.stringify(value)}`,
    );
  }
}

/** Permissions a `StandardRole` carries in a namespace, from the catalogue. */
export interface RoleBinding {
  permissions: string[];
}

/** One registered service namespace and everything it can permit. */
export interface ServiceNamespace {
  namespace: string;
  permissions: string[];
  /** Keyed by `StandardRole` name — `admin`, `operator`, `viewer`, … */
  roleBindings: Record<string, RoleBinding>;
  registeredAt?: string;
}

export interface PermissionMutation {
  namespace: string;
  permission: string;
  profileId: string;
}

export interface TenancyClient {
  /** The catalogue of registered namespaces, their permissions and role bindings. */
  listServiceNamespaces(): Promise<ServiceNamespace[]>;
  /** Writes a direct `granted_<permission>` tuple for the profile. Idempotent. */
  grantPermission(p: PermissionMutation): Promise<void>;
  /** Removes a direct grant. Idempotent. */
  revokePermission(p: PermissionMutation): Promise<void>;
}

export interface TenancyClientDeps {
  runtime: Pick<AuthRuntime, "fetch">;
  /** Base URL of the tenancy service, e.g. `https://api.stawi.org/tenancy`. */
  apiBaseUrl: string;
}

/**
 * Framework-free Connect client for the platform tenancy service. Every
 * RPC used here is unary JSON; errors are normalised to `IdentityError`
 * so a caller lacking `service_tenancy:permission_grant` surfaces as
 * `IdentityError("permission_denied")`.
 */
export function createTenancyClient(deps: TenancyClientDeps): TenancyClient {
  const base = deps.apiBaseUrl.replace(/\/+$/, "");

  async function unary<T>(
    rpc: string,
    body: unknown,
  ): Promise<{ data?: T } & Record<string, unknown>> {
    // A non-2xx response reaches us as an AuthError whose message embeds
    // the Connect error body; `toIdentityError` recovers the real code.
    const res = await deps.runtime
      .fetch<{ data?: T } & Record<string, unknown>>(
        `${base}/${SERVICE}/${rpc}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Connect-Protocol-Version": "1",
          },
          body: JSON.stringify(body),
        },
      )
      .catch((err: unknown) => {
        throw toIdentityError(err);
      });
    // Some deployments answer 200 with a bare Connect error body.
    const embedded = fromConnectError(res);
    if (embedded) throw embedded;
    return res ?? {};
  }

  /** Rejects a malformed mutation before any request is made. */
  function check(p: PermissionMutation): void {
    assertIdentifier("namespace", p.namespace);
    assertIdentifier("permission", p.permission);
  }

  return {
    async listServiceNamespaces() {
      const res = await unary<ServiceNamespace[]>("ListServiceNamespaces", {});
      return res.data ?? [];
    },
    async grantPermission(p) {
      check(p);
      // The response body carries nothing the caller needs: any 2xx is success.
      await unary("GrantPermission", p);
    },
    async revokePermission(p) {
      check(p);
      await unary("RevokePermission", p);
    },
  };
}
