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
export function copyLists(
  record: Record<string, string[]> | undefined,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(record ?? {})) {
    out[key] = [...value];
  }
  return out;
}

/**
 * The platform role a member's recorded bundles ask for: the most capable
 * of them, since the role has to cover every bundle held.
 *
 * It is derived from the whole `access_bundle` map rather than raised from
 * the role already on record, so demoting a member (admin → viewer) or
 * clearing their bundles actually lowers — or removes — the role identity
 * applies. A bundle key the model does not describe says nothing about the
 * role, so the recorded one is kept rather than guessed at.
 */
function roleForBundles(
  model: PermissionModel,
  accessBundle: Record<string, string>,
  recorded: string | undefined,
  sawUnknown: boolean,
): string | undefined {
  if (sawUnknown) return recorded;
  const entries = Object.entries(accessBundle);
  if (entries.length === 0) return undefined;

  let role: string | undefined;
  for (const [ns, key] of entries) {
    const bundle = bundleFor(model, ns, key);
    if (!bundle) return recorded;
    if (rank(bundle.platformRole) > rank(role)) role = bundle.platformRole;
  }
  return role;
}

/**
 * Applies a bundle selection (namespace → bundle key) to a member's
 * properties: records the bundles, sets `platform_role` to the highest
 * role the *held* bundles ask for, replaces the grants of the selected
 * namespaces with their bundle's permissions, and clears any revokes
 * recorded against them. Namespaces outside the selection — and any host
 * property — are carried through untouched. Selections naming an unknown
 * bundle are ignored.
 *
 * A member left holding no bundle at all loses `platform_role` entirely:
 * the property is the widget's own record of what the bundles imply, and
 * leaving a stale role behind would keep granting access nobody chose.
 */
export function expandBundleProperties(
  model: PermissionModel,
  selection: Record<string, string>,
  existing: MemberProperties,
): MemberProperties {
  const accessBundle = { ...(existing.access_bundle ?? {}) };
  const grants = copyLists(existing.permission_grants);
  const revokes = copyLists(existing.permission_revokes);

  let sawUnknown = false;
  for (const [ns, key] of Object.entries(selection)) {
    const bundle = bundleFor(model, ns, key);
    if (!bundle) {
      // The selection means something the model cannot explain; leaving the
      // role alone is safer than deriving one from a half-understood record.
      sawUnknown = true;
      continue;
    }
    accessBundle[ns] = bundle.key;
    grants[ns] = [...bundle.permissions];
    delete revokes[ns];
  }

  const role = roleForBundles(
    model,
    accessBundle,
    existing.platform_role,
    sawUnknown,
  );
  const rest = { ...existing };
  delete rest.platform_role;

  return {
    ...rest,
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

/** Drops namespaces whose list is empty, so the record stays tidy. */
export function prune(
  record: Record<string, string[]>,
): Record<string, string[]> {
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

/** One tenancy write that did not land, as `applyGrants` reports it. */
interface FailedWrite {
  permission: string;
  op: "grant" | "revoke";
}

/**
 * The record to persist when a plan only partly landed: `attempted` is what
 * the admin asked for, `before` what the member held, and `failed` the
 * writes tenancy refused. Permissions whose grant failed are dropped again
 * (unless they were already held, in which case tenancy still has them),
 * and permissions whose revoke failed stay recorded — so the record keeps
 * saying what tenancy actually holds rather than what was hoped for.
 */
export function settleGrants(
  before: MemberProperties,
  attempted: MemberProperties,
  namespace: string,
  failed: readonly FailedWrite[],
): MemberProperties {
  if (failed.length === 0) return attempted;

  const held = new Set(listOf(before.permission_grants, namespace));
  const revokedBefore = new Set(listOf(before.permission_revokes, namespace));
  const grants = copyLists(attempted.permission_grants);
  const revokes = copyLists(attempted.permission_revokes);
  const list = new Set(grants[namespace] ?? []);
  const kept = new Set(revokes[namespace] ?? []);

  for (const { permission, op } of failed) {
    if (op === "grant") {
      if (!held.has(permission)) list.delete(permission);
      if (revokedBefore.has(permission)) kept.add(permission);
    } else {
      list.add(permission);
    }
  }

  grants[namespace] = [...list];
  revokes[namespace] = [...kept];
  return {
    ...attempted,
    permission_grants: prune(grants),
    permission_revokes: prune(revokes),
  };
}
