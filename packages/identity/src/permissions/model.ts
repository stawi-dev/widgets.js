import type { ServiceNamespace } from "../services/tenancy-client.js";
import {
  platformRoleOrder,
  type AccessBundle,
  type EffectivePermission,
  type MemberProperties,
  type PermissionModel,
  type PermissionNamespace,
} from "./types.js";

/** Looks up a bundle by namespace and key. */
export function bundleFor(
  model: PermissionModel,
  ns: string,
  key: string,
): AccessBundle | undefined {
  return model.namespaces
    .find((n) => n.namespace === ns)
    ?.bundles.find((b) => b.key === key);
}

function rank(role: string | undefined): number {
  return platformRoleOrder.indexOf(role as never);
}

function listOf(
  record: Record<string, string[]> | undefined,
  ns: string,
): string[] {
  return record?.[ns] ?? [];
}

/** Shallow copy of a namespace-keyed record, with its arrays copied too. */
function copyLists(
  record: Record<string, string[]> | undefined,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(record ?? {})) {
    out[key] = [...value];
  }
  return out;
}

/**
 * Applies a bundle selection (namespace → bundle key) to a member's
 * properties: records the bundles, sets `platform_role` to the highest
 * role the selected bundles ask for, replaces the grants of the selected
 * namespaces with their bundle's permissions, and clears any revokes
 * recorded against them. Namespaces outside the selection — and any host
 * property — are carried through untouched. Selections naming an unknown
 * bundle are ignored.
 */
export function expandBundleProperties(
  model: PermissionModel,
  selection: Record<string, string>,
  existing: MemberProperties,
): MemberProperties {
  const accessBundle = { ...(existing.access_bundle ?? {}) };
  const grants = copyLists(existing.permission_grants);
  const revokes = copyLists(existing.permission_revokes);

  let role = existing.platform_role;
  for (const [ns, key] of Object.entries(selection)) {
    const bundle = bundleFor(model, ns, key);
    if (!bundle) continue;
    accessBundle[ns] = bundle.key;
    grants[ns] = [...bundle.permissions];
    delete revokes[ns];
    // The most capable bundle wins when a member holds several.
    if (rank(bundle.platformRole) > rank(role)) role = bundle.platformRole;
  }

  return {
    ...existing,
    ...(role === undefined ? {} : { platform_role: role }),
    access_bundle: accessBundle,
    permission_grants: grants,
    permission_revokes: revokes,
  };
}

/**
 * Resolves what a member may do in one namespace and why.
 *
 * The rows follow the catalogue's own order when a catalogue is given —
 * so the screen matches the server's view, including permissions the
 * member does not hold — otherwise the sorted union of everything the
 * member's record mentions.
 *
 * Precedence per permission: an explicit revoke first (it records the
 * admin's intent even where a platform role still permits the action),
 * then the member's bundle, then a direct override grant, then the
 * permissions the platform role carries via the catalogue's role bindings.
 */
export function effectivePermissions(
  ns: PermissionNamespace,
  props: MemberProperties,
  catalogue?: ServiceNamespace,
): EffectivePermission[] {
  const key = ns.namespace;
  const bundle = props.access_bundle?.[key]
    ? ns.bundles.find((b) => b.key === props.access_bundle?.[key])
    : undefined;
  const bundlePerms = new Set(bundle?.permissions ?? []);
  const granted = new Set(listOf(props.permission_grants, key));
  const revoked = new Set(listOf(props.permission_revokes, key));
  const roleBound = new Set(
    (catalogue?.namespace === key && props.platform_role
      ? catalogue.roleBindings?.[props.platform_role]?.permissions
      : undefined) ?? [],
  );

  const permissions =
    catalogue?.namespace === key
      ? catalogue.permissions
      : [...new Set([...bundlePerms, ...granted, ...revoked])].sort();

  return permissions.map((permission) => {
    if (revoked.has(permission))
      return { permission, on: false, source: "revoked" as const };
    if (bundlePerms.has(permission))
      return { permission, on: true, source: "bundle" as const };
    if (granted.has(permission))
      return { permission, on: true, source: "granted" as const };
    if (roleBound.has(permission))
      return { permission, on: true, source: "role" as const };
    return { permission, on: false, source: "none" as const };
  });
}

/**
 * The tenancy writes needed to move a member from `prev` to `next` in one
 * namespace: permissions newly recorded are granted, dropped ones revoked.
 * Both lists are sorted so callers and tests see a stable order.
 */
export function diffGrants(
  prev: MemberProperties,
  next: MemberProperties,
  ns: string,
): { grant: string[]; revoke: string[] } {
  const before = new Set(listOf(prev.permission_grants, ns));
  const after = new Set(listOf(next.permission_grants, ns));
  return {
    grant: [...after].filter((p) => !before.has(p)).sort(),
    revoke: [...before].filter((p) => !after.has(p)).sort(),
  };
}
