import { useMemo } from "react";
import { useT } from "../../hooks/use-t.js";
import { titleCase } from "../labels.js";
import { PermissionRow } from "./PermissionRow.js";
import { bundleFor, effectivePermissions } from "../../permissions/model.js";
import type {
  EffectivePermission,
  MemberProperties,
  PermissionModel,
  PermissionNamespace,
} from "../../permissions/types.js";
import type { ServiceNamespace } from "../../services/tenancy-client.js";

/** Permissions sharing the prefix before their first `_`, in catalogue order. */
interface PermissionGroup {
  prefix: string;
  label: string;
  rows: EffectivePermission[];
}

function groupRows(
  ns: PermissionNamespace,
  rows: EffectivePermission[],
): PermissionGroup[] {
  const groups: PermissionGroup[] = [];
  const byPrefix = new Map<string, PermissionGroup>();
  for (const row of rows) {
    const cut = row.permission.indexOf("_");
    const prefix = cut > 0 ? row.permission.slice(0, cut) : row.permission;
    let group = byPrefix.get(prefix);
    if (!group) {
      group = {
        prefix,
        label: ns.groups?.[prefix] ?? titleCase(prefix),
        rows: [],
      };
      byPrefix.set(prefix, group);
      groups.push(group);
    }
    group.rows.push(row);
  }
  return groups;
}

interface NamespacePanelProps {
  model: PermissionModel;
  namespace: PermissionNamespace;
  /** The catalogue entry for this namespace, when the service returned one. */
  catalogue?: ServiceNamespace;
  properties: MemberProperties;
  /** True while a write for this member is in flight. */
  busy: boolean;
  onToggle: (
    namespace: PermissionNamespace,
    row: EffectivePermission,
    next: boolean,
  ) => void;
  onReapply: (namespace: PermissionNamespace) => void;
  onChangeBundle: () => void;
}

/** One namespace's permissions for the selected member, grouped by prefix. */
export function NamespacePanel({
  model,
  namespace,
  catalogue,
  properties,
  busy,
  onToggle,
  onReapply,
  onChangeBundle,
}: NamespacePanelProps) {
  const t = useT();

  const rows = useMemo(
    () => effectivePermissions(namespace, properties, catalogue),
    [namespace, properties, catalogue],
  );
  const groups = useMemo(() => groupRows(namespace, rows), [namespace, rows]);

  const bundle = bundleFor(
    model,
    namespace.namespace,
    properties.access_bundle?.[namespace.namespace] ?? "",
  );
  const roleBound = new Set(
    (properties.platform_role
      ? catalogue?.roleBindings?.[properties.platform_role]?.permissions
      : undefined) ?? [],
  );

  return (
    <section className="aiw-perm-namespace">
      <div className="aiw-perm-namespace-header">
        <span className="aiw-perm-namespace-title">{namespace.label}</span>
        <span className="aiw-perm-bundle">
          {bundle?.label ?? t("permissions.bundle.none")}
        </span>
        <button
          type="button"
          className="aiw-link-button"
          onClick={onChangeBundle}
        >
          {t("permissions.changeBundle")}
        </button>
        {bundle && (
          <button
            type="button"
            className="aiw-button"
            disabled={busy}
            onClick={() => onReapply(namespace)}
          >
            {t("permissions.reapplyBundle")}
          </button>
        )}
      </div>

      {groups.map((group) => (
        <div key={group.prefix} className="aiw-perm-group">
          <h3 className="aiw-perm-group-title">{group.label}</h3>
          {group.rows.map((row) => (
            <PermissionRow
              key={row.permission}
              row={row}
              label={namespace.permissionLabels?.[row.permission]}
              roleOverrides={
                row.source === "revoked" && roleBound.has(row.permission)
              }
              disabled={busy}
              onToggle={(next) => onToggle(namespace, row, next)}
            />
          ))}
        </div>
      ))}
    </section>
  );
}
