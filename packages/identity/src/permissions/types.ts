/**
 * Platform roles a bundle can map to, in ascending order of reach. The
 * order of this tuple is the precedence used when a member's selection
 * spans several namespaces.
 */
export const platformRoleOrder = [
  "member",
  "viewer",
  "operator",
  "admin",
] as const;

export type PlatformRole = (typeof platformRoleOrder)[number];

/** A named permission set a host offers for a namespace. */
export interface AccessBundle {
  key: string;
  label: string;
  /** Tenancy role the member is activated with when this bundle is chosen. */
  platformRole: PlatformRole;
  permissions: readonly string[];
  /** True when the host restricts this bundle's data scope to the member's teams. */
  scoped?: boolean;
  description?: string;
}

export interface PermissionNamespace {
  /** Service namespace, e.g. `service_imports`. */
  namespace: string;
  label: string;
  /** Permission prefix → group label, e.g. `quotes` → "Quotes". */
  groups?: Record<string, string>;
  permissionLabels?: Record<string, string>;
  bundles: readonly AccessBundle[];
}

/** Host-supplied description of the bundles and labels for its namespaces. */
export interface PermissionModel {
  namespaces: readonly PermissionNamespace[];
}

/**
 * Typed view of `WorkforceMember.properties` for the keys this widget
 * maintains. Unknown keys belong to the host and are preserved verbatim
 * by every helper here.
 */
export interface MemberProperties extends Record<string, unknown> {
  platform_role?: string;
  /** namespace → bundle key. */
  access_bundle?: Record<string, string>;
  /** namespace → permissions granted directly (bundle set plus overrides). */
  permission_grants?: Record<string, string[]>;
  /** namespace → bundle permissions the admin explicitly took away. */
  permission_revokes?: Record<string, string[]>;
}

/** Why a permission is on (or off) for a member. */
export type PermissionSource =
  "bundle" | "granted" | "revoked" | "role" | "none";

export interface EffectivePermission {
  permission: string;
  on: boolean;
  source: PermissionSource;
}
